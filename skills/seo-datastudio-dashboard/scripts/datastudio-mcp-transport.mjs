/**
 * datastudio-mcp-transport.mjs — nói chuyện với chrome-devtools-mcp qua stdio JSON-RPC,
 * mở tab Data Studio đúng profile bằng chrome-profile, bám đúng tab theo cdp-open=<token>.
 * Tab đó để lại chạy nền làm tab dùng chung: lượt CLI sau bám lại thay vì mở/đóng tab mới.
 *
 * Rút gọn từ cms-cli-mcp.mjs của các skill CMS (cùng cơ chế, bỏ phần upload file).
 * Skill-sync chỉ mang file bên trong thư mục skill nên không import chéo được.
 *
 * Không đọc/in cookie, token hay credential. Chỉ đọc URL tab và kết quả evaluate.
 */

import { spawn as nodeSpawn, execFile as nodeExecFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import os from 'node:os';
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DS_ORIGIN = 'https://datastudio.google.com';
/** Trang "trung lập" để chạy fetch: không mở report nào nên không có editor tự lưu đè. */
export const NEUTRAL_URL = `${DS_ORIGIN}/navigation/reporting`;

export class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

export class TimeoutError extends Error {}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function defaultMcpBin() {
  if (process.env.CHROME_DEVTOOLS_MCP_BIN) return process.env.CHROME_DEVTOOLS_MCP_BIN;
  if (fs.existsSync('/opt/homebrew/bin/chrome-devtools-mcp')) return '/opt/homebrew/bin/chrome-devtools-mcp';
  return 'chrome-devtools-mcp';
}

/**
 * Hub dùng chung (devtools-hub, cấp máy): MỘT chrome-devtools-mcp sống cả ngày cho mọi lệnh, nên Chrome chỉ
 * hỏi "Allow remote debugging?" một lần thay vì mỗi lệnh CLI một lần. Có hub thì nói chuyện qua socket
 * cục bộ; chưa chạy thì tự bật; không tìm thấy hub hoặc MWG_DEVTOOLS_HUB=off thì spawn như cũ.
 * Cùng cơ chế với cms-cli-mcp.mjs của các skill CMS/MDM (skill-sync không cho import chéo).
 */
export const hubSockPath = () => path.join(process.env.MWG_DEVTOOLS_HUB_DIR || path.join(os.homedir(), '.cache', 'mwg-devtools-hub'), 'hub.sock');

function tryHubSocket(timeoutMs = 1000) {
  return new Promise((resolve) => {
    const s = net.connect(hubSockPath());
    const t = setTimeout(() => { s.destroy(); resolve(null); }, timeoutMs);
    s.once('connect', () => { clearTimeout(t); resolve(s); });
    s.once('error', () => { clearTimeout(t); resolve(null); });
  });
}

/** Bản cấp máy (`devtools-hub.mjs install` của skill chrome-profile) trước; không có thì tìm harness/devtools-hub.mjs quanh skill / cwd. */
function findHubScript() {
  const installed = path.join(os.homedir(), '.local', 'share', 'devtools-hub', 'devtools-hub.mjs');
  if (fs.existsSync(installed)) return installed;
  for (const start of [path.dirname(fileURLToPath(import.meta.url)), process.cwd()]) {
    let d = start;
    while (d !== path.dirname(d)) {
      const f = path.join(d, 'harness', 'devtools-hub.mjs');
      if (fs.existsSync(f)) return f;
      d = path.dirname(d);
    }
  }
  return null;
}

/** Socket bọc thành vật giống ChildProcess để McpClient dùng y như stdio. */
export function socketAsProc(sock) {
  const p = new EventEmitter();
  p.stdin = sock;
  p.stdout = sock;
  p.stderr = null;
  p.viaHub = true;
  sock.on('close', () => p.emit('exit', 'hub-socket-closed'));
  sock.on('error', (e) => p.emit('error', e));
  p.kill = () => sock.destroy();
  return p;
}

/** Nối hub (tự bật nếu cần). Trả proc-giả hoặc null nếu không dùng được hub. */
export async function connectHub({ autoStart = true, waitMs = 8000 } = {}) {
  let s = await tryHubSocket();
  if (!s && autoStart) {
    const script = findHubScript();
    if (!script) return null;
    nodeSpawn(process.execPath, [script, 'serve'], { detached: true, stdio: 'ignore', cwd: os.homedir() }).unref();
    const deadline = Date.now() + waitMs;
    while (!s && Date.now() < deadline) { await sleep(150); s = await tryHubSocket(); }
  }
  return s ? socketAsProc(s) : null;
}

/** Client JSON-RPC tối giản cho MCP stdio. `spawnFn` tiêm được để test bằng MCP giả. */
export class McpClient {
  constructor({ spawnFn = nodeSpawn, bin = defaultMcpBin(), args = ['--autoConnect'], roots = [process.cwd()], hub = process.env.MWG_DEVTOOLS_HUB || 'auto' } = {}) {
    Object.assign(this, { spawnFn, bin, args, roots });
    // Hub chỉ dùng khi đi đường thật (spawnFn mặc định) — test tiêm MCP giả thì giữ nguyên đường spawn.
    this.hub = spawnFn === nodeSpawn ? hub : 'off';
    this.viaHub = false;
    this.proc = null;
    this.pending = new Map();
    this.nextId = 1;
    this.exited = false;
    this.stderrTail = '';
    this.schemas = null;
    this.pageId = null;
  }

  async connect(timeoutMs = 60000) {
    this.exited = false;
    this.pending.clear();
    const hubProc = this.hub !== 'off' ? await connectHub({ autoStart: this.hub !== 'no-start' }).catch(() => null) : null;
    this.viaHub = !!hubProc;
    this.proc = hubProc || this.spawnFn(this.bin, this.args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const failAll = (err) => {
      this.exited = true;
      for (const [, p] of this.pending) p.reject(err);
      this.pending.clear();
    };
    this.proc.on('exit', (code) => failAll(new Error(`chrome-devtools-mcp thoát (code ${code}). stderr: ${this.stderrTail.slice(-300)}`)));
    this.proc.on('error', failAll);
    if (this.proc.stderr) this.proc.stderr.on('data', (d) => { this.stderrTail = (this.stderrTail + d).slice(-2000); });
    const rl = readline.createInterface({ input: this.proc.stdout });
    rl.on('line', (line) => {
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.method === 'roots/list' && msg.id != null) {
        const roots = this.roots.map((r) => ({ uri: pathToFileURL(r).href, name: path.basename(r) }));
        this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { roots } }) + '\n');
        return;
      }
      if (msg.method || msg.id == null || !this.pending.has(msg.id)) return;
      const p = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`MCP ${p.method}: ${msg.error.message || JSON.stringify(msg.error)}`));
      else p.resolve(msg.result);
    });
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { roots: { listChanged: false } },
      clientInfo: { name: 'mwg-datastudio-cli', version: '1.0.0' },
    }, timeoutMs);
    this.notify('notifications/initialized');
    try {
      const r = await this.request('tools/list', {}, timeoutMs);
      this.schemas = Object.fromEntries((r.tools || []).map((t) => [t.name, new Set(Object.keys(t.inputSchema?.properties || {}))]));
    } catch { this.schemas = null; }
  }

  /** Thêm pageId đã bám khi tool nhận pageId; bỏ tham số mà bản server này không có. */
  shapeArgs(name, args) {
    const props = this.schemas?.[name];
    if (!props) return args;
    const out = {};
    for (const [k, v] of Object.entries(args)) if (props.has(k)) out[k] = v;
    if (props.has('pageId') && out.pageId === undefined && this.pageId != null) out.pageId = this.pageId;
    return out;
  }

  notify(method, params) {
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}) }) + '\n');
  }

  request(method, params = {}, timeoutMs = 60000) {
    if (!this.proc || this.exited) return Promise.reject(new Error('MCP chưa kết nối hoặc đã thoát'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new TimeoutError(`quá ${Math.round(timeoutMs / 1000)}s chờ ${method}${params.name ? ' ' + params.name : ''}`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  async callTool(name, args = {}, timeoutMs = 60000) {
    const result = await this.request('tools/call', { name, arguments: this.shapeArgs(name, args) }, timeoutMs);
    if (result && result.isError) throw new Error(`tool ${name} lỗi: ${toolText(result).slice(0, 500)}`);
    return result;
  }

  async close() {
    const p = this.proc;
    if (!p || this.exited) return;
    try { p.stdin.end(); } catch { /* đã đóng */ }
    try { p.kill('SIGTERM'); } catch { /* đã chết */ }
    const deadline = Date.now() + 2000;
    while (!this.exited && Date.now() < deadline) await sleep(50);
    if (!this.exited) { try { p.kill('SIGKILL'); } catch { /* đã chết */ } }
  }
}

export function toolText(result) {
  return (result?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}

/** evaluate_script trả "```json\n<JSON>\n```". Lấy khối cuối cùng. */
export function parseEvaluateResult(result) {
  const raw = toolText(result);
  const start = raw.indexOf('```json');
  const end = raw.lastIndexOf('```');
  const body = start >= 0 && end > start ? raw.slice(start + 7, end) : raw;
  try { return JSON.parse(body.trim()); } catch {
    throw new Error(`evaluate_script trả không phải JSON: ${raw.slice(0, 300)}`);
  }
}

/** list_pages → [{id, url}]. Ưu tiên structuredContent; không có thì parse text "ID: title (url)". */
export function pagesFromListResult(result) {
  const sc = result?.structuredContent?.pages;
  if (Array.isArray(sc)) return sc.map((p) => ({ id: Number(p.id), url: String(p.url || '') }));
  const out = [];
  for (const line of toolText(result).split('\n')) {
    const m = line.match(/^(\d+): (.*)$/);
    if (!m) continue;
    const label = m[2].replace(/ \[selected\]/, '').replace(/ isolatedContext=\S+$/, '');
    const u = label.match(/\((https?:\/\/.*)\)\s*$/);
    out.push({ id: Number(m[1]), url: u ? u[1] : label.trim() });
  }
  return out;
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function urlHasMarker(url, marker) {
  return new RegExp(`[#&]${escRe(marker)}(?:&|$)`).test(String(url));
}

/**
 * Tab nào đang mở report này ở chế độ Edit. Editor tự lưu trạng thái của nó đè lên
 * mọi thay đổi ghi bằng API (đo 03/10/2026: text đổi bằng API bị trả về bản cũ).
 */
export function editorTabsFor(pages, reportId) {
  const re = new RegExp(`/reporting/${escRe(reportId)}(?:/page/[^/?#]+)?/edit(?:[/?#]|$)`);
  return pages.filter((p) => re.test(p.url));
}

/** Mở URL trong đúng profile Chrome bằng `chrome-profile open --json --no-activate`. */
export function openProfileTab({ profile, url, execFileFn = nodeExecFile, bin = process.env.CHROME_PROFILE_BIN || 'chrome-profile' }) {
  if (!profile) throw new CliError('thiếu profile Chrome (--profile hoặc env DATASTUDIO_CHROME_PROFILE)', 2);
  return new Promise((resolve, reject) => {
    execFileFn(bin, ['open', '--json', '--no-activate', profile, url], { timeout: 30000 }, (err, stdout) => {
      if (err) return reject(new CliError(`chrome-profile open lỗi: ${err.message}`));
      let j;
      try { j = JSON.parse(String(stdout).trim()); } catch {
        return reject(new CliError(`chrome-profile open không trả JSON: ${String(stdout).slice(0, 200)}`));
      }
      if (!j.bind_selector || !/^cdp-open=\S+$/.test(j.bind_selector)) {
        return reject(new CliError('chrome-profile open không trả bind_selector cdp-open=<token>'));
      }
      resolve(j);
    });
  });
}

/**
 * list_pages read-only nhưng chập chờn: đôi khi treo hết timeout, kết nối lại thì được
 * (skill CMS đo 24/09/2026; skill này đo 03/10/2026, hay gặp khi vừa mở tab Data Studio).
 * Cho kết nối lại tối đa `maxReconnects` lần mỗi client. Chỉ áp cho lệnh đọc, không áp cho POST ghi.
 */
export async function listPages(client, timeoutMs = 45000, maxReconnects = 2) {
  for (;;) {
    try {
      return pagesFromListResult(await client.callTool('list_pages', {}, timeoutMs));
    } catch (err) {
      client.listReconnects = client.listReconnects || 0;
      if (!(err instanceof TimeoutError) || client.listReconnects >= maxReconnects) throw err;
      client.listReconnects++;
      try { await client.close(); } catch { /* proc có thể đã chết */ }
      await client.connect();
      // Kết nối mới không nhớ tab đã chọn: chọn lại tab đã bám, nếu có.
      if (client.pageId != null) await client.callTool('select_page', { pageId: client.pageId, bringToFront: false });
    }
  }
}

/** Bám tab theo URL-anchor: đúng 1 tab chứa đúng token + profile marker, URL thuộc Data Studio. */
export async function bindProfileTab(client, { bindSelector, profileMarker, attempts = 10, delayMs = 1000, sleepFn = sleep }) {
  for (let i = 0; i < attempts; i++) {
    const pages = await listPages(client);
    const hits = pages.filter((p) => urlHasMarker(p.url, bindSelector));
    if (hits.length > 1) throw new CliError(`${hits.length} tab cùng chứa ${bindSelector} — không chọn bừa`);
    if (hits.length === 1) {
      const page = hits[0];
      if (profileMarker && !urlHasMarker(page.url, profileMarker)) throw new CliError(`tab có ${bindSelector} nhưng thiếu ${profileMarker}`);
      if (!page.url.startsWith(DS_ORIGIN)) throw new CliError(`tab đúng token nhưng không ở Data Studio (${page.url.split('#')[0]}) — có thể chưa đăng nhập`);
      await client.callTool('select_page', { pageId: page.id, bringToFront: false });
      client.pageId = page.id;
      return page.id;
    }
    if (i < attempts - 1) await sleepFn(delayMs);
  }
  throw new CliError(`không thấy tab nào chứa ${bindSelector} sau ${attempts} lần list_pages`);
}

/**
 * Tab nền dùng chung: tab trung lập do chrome-profile mở, URL giữ nguyên marker
 * `#cdp-profile=<profile>&cdp-open=<token>` nên lượt CLI sau nhận lại được đúng tab của đúng profile.
 * Data Studio tự chuyển `/navigation/reporting` thành `/u/0/navigation/reporting` (đo 23/10/2026).
 */
export function sharedTabsFor(pages, profile) {
  const re = new RegExp(`^${escRe(DS_ORIGIN)}(?:/u/\\d+)?/navigation/reporting#cdp-profile=${escRe(profile)}&cdp-open=[0-9a-f]+$`);
  return pages.filter((p) => re.test(p.url));
}

/** Tab còn dùng được: trang đã tải xong và còn cookie XSRF của Data Studio (chỉ kiểm có/không, không đọc giá trị). */
const TAB_HEALTH_FN = `() => ({ ready: document.readyState === 'complete', xsrf: /(?:^|; )RAP_XSRF_TOKEN=/.test(document.cookie) })`;

async function tabHealthy(client) {
  try {
    const h = await evaluate(client, TAB_HEALTH_FN, 20000);
    return !!(h && h.ready && h.xsrf);
  } catch { return false; }
}

/**
 * Lấy tab nền: có tab dùng chung của profile thì bám lại (dư thì đóng bớt), tab hỏng thì tải lại 1 lần,
 * vẫn hỏng hoặc chưa có thì mở tab mới. Trả `{ pageId, homeUrl, reused }`; `homeUrl` là URL kèm marker
 * để lệnh `render` quay tab về sau khi điều hướng sang report.
 */
export async function acquireSharedTab(client, { profile, execFileFn, sleepFn = sleep }) {
  if (!profile) throw new CliError('thiếu profile Chrome (--profile hoặc env DATASTUDIO_CHROME_PROFILE)', 2);
  const shared = sharedTabsFor(await listPages(client), profile);
  for (const extra of shared.slice(1)) {
    try { await client.callTool('close_page', { pageId: extra.id }, 15000); } catch { /* đã đóng */ }
  }
  if (shared.length) {
    const tab = shared[0];
    await client.callTool('select_page', { pageId: tab.id, bringToFront: false });
    client.pageId = tab.id;
    if (await tabHealthy(client)) return { pageId: tab.id, homeUrl: tab.url, reused: true };
    // Tab bị Chrome xả bộ nhớ hoặc trang treo: tải lại đúng URL (giữ marker) một lần.
    try {
      await client.callTool('navigate_page', { type: 'url', url: tab.url }, 60000);
      await sleepFn(1500);
      if (await tabHealthy(client)) return { pageId: tab.id, homeUrl: tab.url, reused: true };
    } catch { /* rơi xuống mở tab mới */ }
    try { await client.callTool('close_page', { pageId: tab.id }, 15000); } catch { /* đã đóng */ }
    client.pageId = null;
  }
  const { pageId } = await openAndBind(client, { profile, url: NEUTRAL_URL, execFileFn, sleepFn });
  const page = (await listPages(client)).find((p) => p.id === pageId);
  return { pageId, homeUrl: page ? page.url : NEUTRAL_URL, reused: false };
}

/** Mở + bám tab. Bám lỗi thì đóng đúng tab vừa mở (nếu tìm thấy đúng 1) rồi ném lỗi gốc. */
export async function openAndBind(client, { profile, url = NEUTRAL_URL, execFileFn, sleepFn = sleep }) {
  // Gắn vào trình duyệt TRƯỚC khi mở tab mới: list_pages lần đầu phải attach mọi tab,
  // làm lúc tab Data Studio đang tải dễ treo hơn.
  await listPages(client);
  const open = await openProfileTab({ profile, url, execFileFn });
  await sleepFn(4000);
  try {
    const pageId = await bindProfileTab(client, { bindSelector: open.bind_selector, profileMarker: open.profile_marker, sleepFn });
    return { pageId, open };
  } catch (err) {
    try {
      const pages = pagesFromListResult(await client.callTool('list_pages', {}));
      const hits = pages.filter((p) => urlHasMarker(p.url, open.bind_selector));
      if (hits.length === 1) await client.callTool('close_page', { pageId: hits[0].id }, 15000);
    } catch { /* dọn dẹp best-effort, không che lỗi gốc */ }
    throw err;
  }
}

/** Chạy 1 function trong tab đang chọn, trả JSON. */
export async function evaluate(client, fnSource, timeoutMs = 120000) {
  const result = await client.callTool('evaluate_script', { function: fnSource, waitForStableDom: false }, timeoutMs);
  return parseEvaluateResult(result);
}
