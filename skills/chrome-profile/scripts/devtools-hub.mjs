#!/usr/bin/env node
/**
 * devtools-hub.mjs — MỘT chrome-devtools-mcp dùng chung cho mọi lệnh trên máy, sống cả ngày.
 *
 * Vì sao có: mỗi lần một CLI skill (CMS, MDM) hay một phiên agent spawn `chrome-devtools-mcp --autoConnect`
 * là một kết nối debug mới vào Chrome thật của owner — và Chrome có thể hỏi "Allow remote debugging?" cho
 * kết nối đó. Hub giữ ĐÚNG MỘT tiến trình chrome-devtools-mcp (tức một kết nối Chrome), các lệnh nói chuyện
 * với hub qua socket cục bộ. Sáng Allow một lần, cả ngày không mở thêm kết nối Chrome nào.
 *
 * Dùng chung an toàn được vì chrome-devtools-mcp 1.8 đã thiết kế cho nhiều phiên trên một server:
 * `--pageIdRouting` bật mặc định (tool theo tab bắt buộc pageId → không tranh "tab đang chọn") và mọi tool
 * call xếp hàng bằng mutex bên trong server. Hub chỉ làm việc của MCP: đổi id request cho khỏi đụng nhau
 * giữa các client, trả kết quả về đúng client.
 *
 * Hub là đồ CẤP MÁY, không thuộc codebase nào: nguồn nằm ở repo mwg-ai-worker (harness/, có test), bản chạy
 * thật được `install` ra ~/.local/share/devtools-hub/ và cấu hình MCP của mọi agent trỏ vào wrapper
 * ~/.local/bin/devtools-mcp-bridge — nên đổi nhánh, đổi tên hay xoá repo không làm agent ở codebase khác mất
 * tool trình duyệt. Wrapper không tìm thấy / không chạy được file hub thì chạy chrome-devtools-mcp thẳng.
 *
 * Thư mục được phép đọc/ghi file (MCP roots): mỗi phiên tự khai thư mục dự án của nó; hub hỏi từng phiên
 * đang nối và cho chrome-devtools-mcp HỢP của chúng (+ MWG_DEVTOOLS_HUB_ROOTS), giống lúc mỗi phiên chạy
 * server riêng. Phiên đóng thì thư mục của nó bị rút khỏi danh sách.
 *
 *   node devtools-hub.mjs install   chép bản này ra ~/.local/share/devtools-hub/ + viết wrapper bridge
 *   node devtools-hub.mjs start     bật nền (nếu chưa chạy), in trạng thái
 *   node devtools-hub.mjs status    trạng thái (exit 1 nếu không chạy)
 *   node devtools-hub.mjs stop      tắt êm: đóng chrome-devtools-mcp, xoá socket
 *   node devtools-hub.mjs serve     chạy tiền cảnh (start gọi cái này)
 *   node devtools-hub.mjs bridge    stdio ↔ hub cho cấu hình MCP của agent; hub hỏng thì chạy chrome-devtools-mcp thẳng
 *
 * Bảo mật: socket nằm trong ~/.cache/mwg-devtools-hub (thư mục 0700, socket 0600) — chỉ user này nối được,
 * không có cổng mạng. Đổi lại: trong ngày, tiến trình nào chạy dưới user này nối socket cũng lái được
 * Chrome mà không qua hộp Allow nữa. Log chỉ ghi sự kiện (bật/tắt, số client, lỗi), KHÔNG ghi tham số hay
 * kết quả tool (kết quả evaluate có thể chứa token). Các phiên dùng chung một server nên phiên nào cũng
 * dùng được thư mục của phiên khác đang nối — cùng một user, cùng mức tin cậy.
 *
 * Env: MWG_DEVTOOLS_HUB_DIR (thư mục socket), MWG_DEVTOOLS_HUB_IDLE_HOURS (mặc định 10: không ai dùng
 * quá lâu thì tự tắt; mai lệnh đầu tiên tự bật lại), CHROME_DEVTOOLS_MCP_BIN, MWG_DEVTOOLS_HUB_ROOTS
 * (thư mục luôn được phép, ngăn bằng ':').
 */
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
export const INSTALL_DIR = path.join(os.homedir(), '.local', 'share', 'devtools-hub');
export const INSTALLED_HUB = path.join(INSTALL_DIR, 'devtools-hub.mjs');
export const BRIDGE_WRAPPER = path.join(os.homedir(), '.local', 'bin', 'devtools-mcp-bridge');
/** Dấu phiên bản = 12 ký tự đầu sha256 của file — status cho biết hub đang chạy bản nào. */
export const fileVersion = (f) => { try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 12); } catch { return null; } };
export const hubDir = () => process.env.MWG_DEVTOOLS_HUB_DIR || path.join(os.homedir(), '.cache', 'mwg-devtools-hub');
export const sockPath = () => path.join(hubDir(), 'hub.sock');
const logPath = () => path.join(hubDir(), 'hub.log');
const MCP_PROTOCOL = '2024-11-05';

export function defaultMcpBin() {
  if (process.env.CHROME_DEVTOOLS_MCP_BIN) return process.env.CHROME_DEVTOOLS_MCP_BIN;
  if (fs.existsSync('/opt/homebrew/bin/chrome-devtools-mcp')) return '/opt/homebrew/bin/chrome-devtools-mcp';
  return 'chrome-devtools-mcp';
}

function hubLog(msg) {
  try {
    const f = logPath();
    if (fs.existsSync(f) && fs.statSync(f).size > 1024 * 1024) fs.renameSync(f, `${f}.1`);
    fs.appendFileSync(f, `${new Date().toISOString()} ${msg}\n`, { mode: 0o600 });
  } catch { /* log hỏng không được làm hub chết */ }
}

const send = (stream, obj) => { if (stream && !stream.destroyed && stream.writable) stream.write(`${JSON.stringify(obj)}\n`); };

/**
 * Bộ dồn kênh MCP: N client ↔ 1 chrome-devtools-mcp. Tách khỏi socket/tiến trình để test được bằng
 * stream giả (spawnFn tiêm vào).
 */
export class Hub {
  constructor({ spawnFn = spawn, bin = defaultMcpBin(), args = ['--autoConnect'], roots = [], log = hubLog, onStop = () => {}, rootsWaitMs = 2000 } = {}) {
    // roots: thư mục luôn được phép (env). Còn lại lấy từ các phiên đang nối — xem rootsUnion().
    Object.assign(this, { spawnFn, bin, args, baseRoots: roots, log, onStop, rootsWaitMs });
    this.rootsKey = null; // danh sách đã báo cho server gần nhất
    this.rootsSync = Promise.resolve(); // chờ server đọc xong danh sách mới (≤ rootsWaitMs)
    this.rootsSyncDone = null;
    this.version = fileVersion(SELF);
    this.child = null;
    this.childReady = null; // Promise<initializeResult>
    this.childStderr = '';
    this.childStarts = 0;
    this.pending = new Map(); // hubId → {client, origId}
    this.internal = new Map(); // id nội bộ của hub (initialize) → {resolve, reject}
    this.clients = new Set();
    this.nextId = 1;
    this.startedAt = Date.now();
    this.lastActivity = Date.now();
    this.requests = 0;
    this.restarts = 0;
    this.listPagesLimitMs = 150000; // > 60s + 90s retry của client MDM
    this.callLimitMs = 600000; // > timeout dài nhất của mọi CLI (upload/evaluate 120s, bind 10 lần list_pages)
  }

  /** Bật chrome-devtools-mcp (lười: chỉ khi có request) và initialize một lần cho mọi client. */
  ensureChild() {
    if (this.childReady) return this.childReady;
    const child = this.spawnFn(this.bin, this.args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    this.childStarts++;
    this.log(`chrome-devtools-mcp bật (lần ${this.childStarts})`);
    child.stderr?.on('data', (d) => { this.childStderr = (this.childStderr + d).slice(-2000); });
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      this.onChildMessage(msg);
    });
    const onGone = (why) => {
      if (this.child !== child) return;
      this.log(`chrome-devtools-mcp thoát (${why}); ${this.pending.size} request đang chờ bị báo lỗi`);
      this.child = null;
      this.childReady = null;
      this.childInitialized = false;
      this.failPending(`chrome-devtools-mcp thoát (${why})`);
    };
    child.on('exit', (code, sig) => onGone(`code ${code}${sig ? ` ${sig}` : ''}`));
    child.on('error', (e) => onGone(e.message));
    const id = `hub-init-${this.childStarts}`;
    this.childReady = new Promise((resolve, reject) => {
      this.internal.set(id, { resolve, reject });
      send(child.stdin, { jsonrpc: '2.0', id, method: 'initialize', params: { protocolVersion: MCP_PROTOCOL, capabilities: { roots: { listChanged: true } }, clientInfo: { name: 'mwg-devtools-hub', version: '1.0.0' } } });
    }).then((result) => {
      send(child.stdin, { jsonrpc: '2.0', method: 'notifications/initialized' });
      this.childInitialized = true;
      this.rootsKey = this.rootsUnion().map((r) => r.uri).join('\n'); // server tự hỏi roots ngay sau initialized
      return result;
    });
    this.childReady.catch(() => {}); // lỗi đã báo cho từng request chờ
    return this.childReady;
  }

  /** Báo lỗi cho mọi request đang chờ (tiến trình con đã/đang chết). */
  failPending(why) {
    for (const [, w] of this.internal) w.reject(new Error(why));
    this.internal.clear();
    for (const [, p] of this.pending) {
      p.client.ids.delete(p.origId);
      send(p.client.sock, { jsonrpc: '2.0', id: p.origId, error: { code: -32000, message: `${why}; gọi lại để hub bật lại. stderr: ${this.childStderr.slice(-300)}` } });
    }
    this.pending.clear();
  }

  /**
   * Watchdog: tool call treo quá ngưỡng thì khởi động lại chrome-devtools-mcp. Lý do: mọi tool call xếp hàng
   * qua một mutex, một call kẹt (đo 24/09: list_pages treo, khởi động lại thì qua) chặn MỌI lệnh trên máy.
   * Ngưỡng dài hơn timeout của mọi client (client đã bỏ cuộc trước) — đổi lại: lần nối lại có thể hiện hộp Allow.
   */
  checkStuck(now = Date.now()) {
    for (const [, p] of this.pending) {
      const limit = p.tool === 'list_pages' ? this.listPagesLimitMs : this.callLimitMs;
      if (now - p.t0 > limit) {
        this.log(`watchdog: ${p.tool} treo ${Math.round((now - p.t0) / 1000)}s → khởi động lại chrome-devtools-mcp`);
        this.restarts++;
        this.stopChild(`watchdog: ${p.tool} treo quá ${Math.round(limit / 1000)}s`);
        return true;
      }
    }
    return false;
  }

  /** Hợp thư mục: env + mọi phiên đang nối, bỏ trùng, thứ tự ổn định. */
  rootsUnion() {
    const seen = new Map();
    for (const r of this.baseRoots) { const uri = pathToFileURL(r).href; seen.set(uri, { uri, name: path.basename(r) }); }
    for (const c of this.clients) for (const r of c.roots) if (!seen.has(r.uri)) seen.set(r.uri, { uri: r.uri, name: r.name || r.uri.split('/').filter(Boolean).pop() });
    return [...seen.values()].sort((a, b) => a.uri.localeCompare(b.uri));
  }

  /**
   * Danh sách thư mục đổi → báo server (notifications/roots/list_changed). Server chỉ đọc lại ở chế độ NỀN,
   * nên request kế tiếp phải chờ tới khi server đã hỏi lại (≤ rootsWaitMs), không thì upload_file vừa tới có
   * thể bị chặn bằng danh sách cũ.
   */
  rootsChanged() {
    const key = this.rootsUnion().map((r) => r.uri).join('\n');
    if (key === this.rootsKey) return;
    this.rootsKey = key;
    if (!this.child || !this.childInitialized) return; // server chưa sẵn sàng: initialize xong nó sẽ tự hỏi danh sách mới
    this.rootsSync = new Promise((resolve) => {
      const t = setTimeout(resolve, this.rootsWaitMs);
      this.rootsSyncDone = () => { clearTimeout(t); resolve(); };
    });
    send(this.child.stdin, { jsonrpc: '2.0', method: 'notifications/roots/list_changed' });
  }

  /** Hỏi một phiên thư mục dự án của nó (chỉ khi phiên đó khai năng lực roots). */
  askClientRoots(client) {
    if (!client.rootsCapable) return;
    const id = `hub-roots-${this.nextId++}`;
    client.rootsReq = id;
    client.rootsReady = new Promise((resolve) => {
      const t = setTimeout(resolve, this.rootsWaitMs);
      client.rootsDone = () => { clearTimeout(t); resolve(); };
    });
    send(client.sock, { jsonrpc: '2.0', id, method: 'roots/list' });
  }

  onChildMessage(msg) {
    if (msg.method && msg.id != null) {
      // Server hỏi ngược client. Hub tự trả: roots/list = hợp thư mục của mọi phiên; còn lại không hỗ trợ.
      if (msg.method === 'roots/list') {
        send(this.child?.stdin, { jsonrpc: '2.0', id: msg.id, result: { roots: this.rootsUnion() } });
        if (this.rootsSyncDone) { this.rootsSyncDone(); this.rootsSyncDone = null; }
      } else {
        send(this.child?.stdin, { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `hub không hỗ trợ ${msg.method}` } });
      }
      return;
    }
    if (msg.method) {
      if (msg.method === 'notifications/tools/list_changed') for (const c of this.clients) send(c.sock, msg);
      return; // log/progress của server không chuyển tiếp (có thể chứa nội dung trang)
    }
    if (this.internal.has(msg.id)) {
      const w = this.internal.get(msg.id);
      this.internal.delete(msg.id);
      if (msg.error) w.reject(new Error(msg.error.message)); else w.resolve(msg.result);
      return;
    }
    const p = this.pending.get(msg.id);
    if (!p) return; // client đã đóng
    this.pending.delete(msg.id);
    p.client.ids.delete(p.origId);
    send(p.client.sock, { ...msg, id: p.origId });
  }

  /** Gắn một client (socket hoặc duplex bất kỳ). */
  attach(sock) {
    // ids: origId → hubId. roots: thư mục phiên khai (chỉ file://). rootsReady: request chờ tới khi biết roots.
    const client = { sock, ids: new Map(), roots: [], rootsCapable: false, rootsReq: null, rootsReady: Promise.resolve(), rootsDone: null };
    this.clients.add(client);
    this.lastActivity = Date.now();
    this.log(`client nối (${this.clients.size} đang nối)`);
    readline.createInterface({ input: sock }).on('line', (line) => {
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      this.onClientMessage(client, msg).catch((e) => {
        if (msg.id != null) send(sock, { jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: `hub: ${e.message}` } });
      });
    });
    const gone = () => {
      if (!this.clients.delete(client)) return;
      // Client bỏ đi giữa chừng: báo server huỷ request của nó (server vẫn có thể đã chạy xong — không đoán).
      for (const [, hubId] of client.ids) {
        this.pending.delete(hubId);
        send(this.child?.stdin, { jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: hubId, reason: 'client đã đóng' } });
      }
      client.ids.clear();
      this.lastActivity = Date.now();
      this.log(`client đóng (${this.clients.size} còn nối)`);
      this.rootsChanged();
    };
    sock.on('close', gone);
    sock.on('end', gone);
    sock.on('error', gone);
    return client;
  }

  async onClientMessage(client, msg) {
    this.lastActivity = Date.now();
    const reply = (result) => send(client.sock, { jsonrpc: '2.0', id: msg.id, result });
    if (msg.method === 'initialize' && msg.id != null) {
      client.rootsCapable = !!msg.params?.capabilities?.roots;
      // Đặt chờ roots TRƯỚC khi trả initialize: request đầu tiên của phiên phải đi sau khi đã biết thư mục của nó.
      if (client.rootsCapable) client.rootsReady = new Promise((resolve) => { const t = setTimeout(resolve, this.rootsWaitMs); client.rootsDone = () => { clearTimeout(t); resolve(); }; });
      return reply(await this.ensureChild());
    }
    if (msg.method === 'notifications/initialized' || msg.method === 'notifications/roots/list_changed') {
      if (client.rootsCapable) {
        const pendingDone = client.rootsDone;
        this.askClientRoots(client);
        if (pendingDone) client.rootsReady.then(pendingDone); // nhả cả cái chờ đặt từ lúc initialize
      }
      return undefined;
    }
    if (msg.id != null && !msg.method && msg.id === client.rootsReq) {
      // Phiên trả lời roots/list của hub.
      client.rootsReq = null;
      const list = Array.isArray(msg.result?.roots) ? msg.result.roots : [];
      client.roots = list.filter((r) => typeof r?.uri === 'string' && r.uri.startsWith('file://')).map((r) => ({ uri: r.uri, name: r.name }));
      this.rootsChanged();
      if (client.rootsDone) { client.rootsDone(); client.rootsDone = null; }
      return undefined;
    }
    if (msg.method === 'ping' && msg.id != null) return reply({});
    if (msg.method === 'hub/status' && msg.id != null) return reply(this.status());
    if (msg.method === 'hub/stop' && msg.id != null) { reply({ stopping: true }); return this.onStop('lệnh stop'); }
    if (msg.method === 'notifications/cancelled') {
      const hubId = client.ids.get(msg.params?.requestId);
      if (hubId != null) send(this.child?.stdin, { ...msg, params: { ...msg.params, requestId: hubId } });
      return undefined;
    }
    if (msg.id == null || !msg.method) return undefined; // notification khác / response của client: không cần
    await this.ensureChild();
    await client.rootsReady;
    await this.rootsSync;
    const hubId = this.nextId++;
    this.requests++;
    this.pending.set(hubId, { client, origId: msg.id, t0: Date.now(), tool: msg.method === 'tools/call' ? msg.params?.name : msg.method });
    client.ids.set(msg.id, hubId);
    send(this.child.stdin, { ...msg, id: hubId });
    return undefined;
  }

  status() {
    return {
      pid: process.pid, uptimeSec: Math.round((Date.now() - this.startedAt) / 1000), idleSec: Math.round((Date.now() - this.lastActivity) / 1000),
      version: this.version, clients: this.clients.size, inFlight: this.pending.size, requests: this.requests,
      roots: this.rootsUnion().map((r) => fileURLToPath(r.uri)),
      chromeDevtoolsMcp: { running: !!this.child, starts: this.childStarts, watchdogRestarts: this.restarts, bin: this.bin, args: this.args },
      socket: sockPath(),
    };
  }

  async stopChild(why = 'hub tắt') {
    const c = this.child;
    if (!c) return;
    this.child = null;
    this.childReady = null;
    this.childInitialized = false;
    this.failPending(why);
    try { c.stdin.end(); } catch { /* đã đóng */ }
    try { c.kill('SIGTERM'); } catch { /* đã chết */ }
    await new Promise((r) => { const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch { /* */ } r(); }, 2000); c.once?.('exit', () => { clearTimeout(t); r(); }); });
  }
}

/** Nối thử socket hub; trả socket đã nối hoặc null. */
export function tryConnect(sock = sockPath(), timeoutMs = 1000) {
  return new Promise((resolve) => {
    const s = net.connect(sock);
    const t = setTimeout(() => { s.destroy(); resolve(null); }, timeoutMs);
    s.once('connect', () => { clearTimeout(t); resolve(s); });
    s.once('error', () => { clearTimeout(t); resolve(null); });
  });
}

/** Gửi 1 request tới hub và chờ trả lời (dùng cho status/stop). */
async function ask(method, timeoutMs = 5000) {
  const s = await tryConnect();
  if (!s) return null;
  return new Promise((resolve) => {
    const t = setTimeout(() => { s.destroy(); resolve(null); }, timeoutMs);
    readline.createInterface({ input: s }).once('line', (line) => { clearTimeout(t); s.end(); try { resolve(JSON.parse(line).result); } catch { resolve(null); } });
    send(s, { jsonrpc: '2.0', id: 1, method });
  });
}

async function serve() {
  process.umask(0o077);
  fs.mkdirSync(hubDir(), { recursive: true, mode: 0o700 });
  fs.chmodSync(hubDir(), 0o700);
  const sock = sockPath();
  const baseRoots = (process.env.MWG_DEVTOOLS_HUB_ROOTS || '').split(':').filter(Boolean);
  let server;
  let stopping = false;
  const hub = new Hub({ roots: baseRoots, onStop: (why) => stop(why) });
  async function stop(why) {
    if (stopping) return;
    stopping = true;
    hub.log(`hub tắt: ${why}`);
    server?.close();
    for (const c of hub.clients) c.sock.destroy();
    await hub.stopChild();
    try { if (fs.existsSync(sock)) fs.unlinkSync(sock); } catch { /* */ }
    try { fs.unlinkSync(path.join(hubDir(), 'hub.pid')); } catch { /* */ }
    process.exit(0);
  }
  const listen = () => new Promise((resolve, reject) => {
    server = net.createServer((s) => hub.attach(s));
    server.once('error', reject);
    server.listen(sock, () => resolve());
  });
  try {
    await listen();
  } catch (e) {
    if (e.code !== 'EADDRINUSE') throw e;
    const alive = await tryConnect(sock);
    if (alive) { alive.destroy(); process.stderr.write('hub đã chạy — không bật bản thứ hai\n'); process.exit(0); }
    fs.unlinkSync(sock); // socket mồ côi của hub đã chết
    await listen();
  }
  fs.chmodSync(sock, 0o600);
  fs.writeFileSync(path.join(hubDir(), 'hub.pid'), String(process.pid));
  hub.log(`hub bật pid ${process.pid} bản ${hub.version} từ ${SELF}`);
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => stop(sig));
  const idleMs = Number(process.env.MWG_DEVTOOLS_HUB_IDLE_HOURS || 10) * 3600e3;
  setInterval(() => hub.checkStuck(), 10000).unref();
  setInterval(() => {
    if (hub.clients.size === 0 && hub.pending.size === 0 && Date.now() - hub.lastActivity > idleMs) stop(`không ai dùng ${Math.round(idleMs / 3600e3)} giờ`);
  }, 60000).unref();
}

/** Bật hub nền nếu chưa chạy, chờ socket sẵn sàng. Trả true nếu hub đang chạy. */
export async function ensureHub(timeoutMs = 8000) {
  const s = await tryConnect();
  if (s) { s.destroy(); return true; }
  const child = spawn(process.execPath, [SELF, 'serve'], { detached: true, stdio: 'ignore', cwd: os.homedir() });
  child.unref();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 150));
    const c = await tryConnect();
    if (c) { c.destroy(); return true; }
  }
  return false;
}

/** stdio ↔ hub cho cấu hình MCP của agent. Hub không bật được → chạy thẳng chrome-devtools-mcp (đường cũ). */
async function bridge(args) {
  const ok = await ensureHub();
  const s = ok ? await tryConnect() : null;
  if (!s) {
    const c = spawn(defaultMcpBin(), args.length ? args : ['--autoConnect'], { stdio: 'inherit' });
    c.on('exit', (code) => process.exit(code ?? 1));
    return;
  }
  process.stdin.pipe(s);
  s.pipe(process.stdout);
  s.on('close', () => process.exit(0));
  process.stdin.on('end', () => s.end());
}

/**
 * Wrapper sh cho cấu hình MCP của agent. Tự nó KHÔNG phụ thuộc file hub: file mất hoặc lỗi cú pháp thì chạy
 * chrome-devtools-mcp thẳng (đường cũ, mỗi phiên một kết nối) — agent không bao giờ mất tool trình duyệt vì hub.
 */
export function bridgeWrapperScript(hubFile = INSTALLED_HUB) {
  return `#!/bin/sh
# devtools-mcp-bridge — cửa MCP chrome-devtools cho mọi agent trên máy (sinh bởi devtools-hub.mjs install).
# Có hub thì mọi phiên dùng chung MỘT kết nối Chrome; không thì chạy chrome-devtools-mcp thẳng như cũ.
HUB="${hubFile}"
NODE=/opt/homebrew/bin/node; [ -x "$NODE" ] || NODE="$(command -v node)"
MCP="\${CHROME_DEVTOOLS_MCP_BIN:-/opt/homebrew/bin/chrome-devtools-mcp}"; [ -x "$MCP" ] || MCP="$(command -v chrome-devtools-mcp)"
if [ "\${MWG_DEVTOOLS_HUB:-auto}" != off ] && [ -n "$NODE" ] && [ -f "$HUB" ] && "$NODE" --check "$HUB" 2>/dev/null; then
  exec "$NODE" "$HUB" bridge "$@"
fi
exec "$MCP" "$@"
`;
}

/** Chép bản đang chạy lệnh ra chỗ cấp máy + viết wrapper. Không tự tắt hub đang chạy (sẽ cắt tool của phiên đang mở). */
function install() {
  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  if (path.resolve(SELF) !== path.resolve(INSTALLED_HUB)) fs.copyFileSync(SELF, INSTALLED_HUB);
  fs.mkdirSync(path.dirname(BRIDGE_WRAPPER), { recursive: true });
  fs.writeFileSync(BRIDGE_WRAPPER, bridgeWrapperScript(), { mode: 0o755 });
  fs.chmodSync(BRIDGE_WRAPPER, 0o755);
  return { hub: INSTALLED_HUB, version: fileVersion(INSTALLED_HUB), wrapper: BRIDGE_WRAPPER };
}

async function main(cmd, rest) {
  switch (cmd) {
    case 'install': {
      const r = install();
      const st = await ask('hub/status');
      if (st && st.version !== r.version) r.note = `hub đang chạy bản ${st.version} — bản mới ăn sau khi hub tắt (stop, hoặc tự tắt khi nghỉ); stop sẽ cắt tool trình duyệt của phiên đang mở`;
      process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
      return undefined;
    }
    case 'serve': return serve();
    case 'bridge': return bridge(rest);
    case 'start': {
      if (!(await ensureHub())) { process.stderr.write(`không bật được hub — xem ${logPath()}\n`); process.exit(1); }
      process.stdout.write(`${JSON.stringify(await ask('hub/status'), null, 2)}\n`);
      return undefined;
    }
    case 'status': {
      const st = await ask('hub/status');
      if (!st) { process.stdout.write('hub không chạy\n'); process.exit(1); }
      process.stdout.write(`${JSON.stringify(st, null, 2)}\n`);
      return undefined;
    }
    case 'stop': {
      if (!(await ask('hub/stop'))) { process.stdout.write('hub không chạy\n'); return undefined; }
      for (let i = 0; i < 40 && fs.existsSync(sockPath()); i++) await new Promise((r) => setTimeout(r, 100));
      process.stdout.write(fs.existsSync(sockPath()) ? 'đã gửi lệnh tắt nhưng socket còn — xem status\n' : 'hub đã tắt\n');
      return undefined;
    }
    default:
      process.stderr.write('dùng: node devtools-hub.mjs install | start | status | stop | serve | bridge\n');
      process.exit(2);
  }
  return undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main(process.argv[2], process.argv.slice(3)).catch((e) => { process.stderr.write(`LỖI: ${e.message}\n`); process.exit(1); });
}
