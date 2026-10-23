#!/usr/bin/env node
/**
 * mdm-cli.mjs — cửa vào của skill onpage-mdm-khai-bao.
 *
 *   node .claude/skills/onpage-mdm-khai-bao/scripts/mdm-cli.mjs <lệnh> [cờ]
 *
 * Lệnh: lookup | read | write | restore | upload | verify-web | pim-find | product-write | product-ops | product-restore | batch | token-clear   (xem SKILL.md)
 * Exit: 0 ok · 1 lỗi server/đọc lại lệch · 2 tham số sai · 3 ROW_VERSION · 4 không có tab/token · 5 không tra được · 6 verify-web hết giờ
 * --transport auto|tab (hoặc env MDM_TRANSPORT): auto = gọi thẳng HTTP bằng token, tự rơi về lái tab khi gặp vấn đề; tab = chỉ lái tab, token không rời trang.
 * --token-cache on|off (hoặc env MDM_TOKEN_CACHE): on (mặc định, macOS) = token cất trong Keychain, lệnh sau không cần tab tới khi server trả 401.
 * batch: nhiều việc trong MỘT phiên trình duyệt (một kết nối debug, một lần Chrome hỏi quyền) — exit = exit của việc làm lô dừng.
 *
 * In JSON kết quả ra stdout. Không bao giờ in token (token chỉ ở tab MDM, RAM tiến trình và Keychain).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MdmError, SCREENS, WEB_ORIGIN } from './mdm-core.mjs';
import { AutoSession } from './mdm-browser.mjs';
import { lookup, pimFind, readRecord } from './mdm-commands-lookup.mjs';
import { writeCommand, restoreCommand, uploadCommand, collectEdits, stamp } from './mdm-commands-write.mjs';
import { pollUntil } from './mdm-web-verify.mjs';
import { productWriteCommand, productOpsCommand, productRestoreCommand } from './pim-product-commands.mjs';
import { loadOpsFile } from './pim-content-ops.mjs';
import { normalizeJobs, runBatch, saveReadCommand } from './mdm-commands-batch.mjs';
import { tokenCacheFor } from './mdm-keychain-cache.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPEATABLE = new Set(['set', 'set-file']);
const BOOL = new Set(['live', 'resume', 'keep-going', 'check-web']);
const TRANSPORTS = ['auto', 'tab'];

export function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) { a._.push(t); continue; }
    const k = t.slice(2);
    if (BOOL.has(k)) { a[k] = true; continue; }
    const v = argv[++i];
    if (v === undefined) throw new MdmError(`--${k} thiếu giá trị`, 2);
    if (REPEATABLE.has(k)) (a[k] ||= []).push(v); else a[k] = v;
  }
  return a;
}

const CFG_KEYS = ['uiOrigin', 'apiBase', 'pimApiBase', 'pimCompanyId',
  'category.objectId', 'category.tableId', 'category.functionId', 'category.rootId',
  'brand.objectId', 'brand.tableId', 'brand.functionId',
  'filter.objectId', 'filter.tableId', 'filter.functionId', 'filter.relationId'];

/**
 * Config đọc từ file JSON: --config <file> hoặc biến MDM_CONFIG. Mẫu ở config.example.json.
 * Nhận cả dạng {"mdm": {...}} lẫn phẳng. Thiếu khoá hay còn placeholder "<...>" thì dừng (exit 2)
 * — ID rỗng vẫn gọi được API nhưng trúng sai màn.
 */
export async function loadCfg(configPath = process.env.MDM_CONFIG) {
  if (!configPath) throw new MdmError(`thiếu config — truyền --config <file> hoặc đặt MDM_CONFIG (mẫu: ${path.join(HERE, '..', 'config.example.json')})`, 2);
  let raw;
  try { raw = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) { throw new MdmError(`không đọc được config ${configPath}: ${e.message}`, 2); }
  const src = raw.mdm || raw;
  const cfg = { webOrigin: WEB_ORIGIN };
  const missing = [];
  for (const k of CFG_KEYS) {
    const parts = k.split('.');
    const v = parts.reduce((o, p) => (o == null ? o : o[p]), src);
    if (v == null || v === '' || /^<.*>$/.test(String(v))) { missing.push(k); continue; }
    if (parts.length === 1) cfg[k] = v; else (cfg[parts[0]] ||= {})[parts[1]] = v;
  }
  if (missing.length) throw new MdmError(`config thiếu/chưa điền: ${missing.join(', ')}`, 2);
  return cfg;
}

const need = (a, k) => { if (!a[k]) throw new MdmError(`thiếu --${k}`, 2); return a[k]; };
const needScreen = (a) => {
  const s = need(a, 'screen');
  if (!SCREENS.includes(s)) throw new MdmError(`--screen phải là ${SCREENS.join(' | ')}`, 2);
  return s;
};

async function withSession(cfg, a, fn) {
  const transport = a.transport || process.env.MDM_TRANSPORT || 'auto';
  if (!TRANSPORTS.includes(transport)) throw new MdmError(`--transport phải là ${TRANSPORTS.join(' | ')}`, 2);
  const tokenCache = tokenCacheFor(cfg, a['token-cache'] || process.env.MDM_TOKEN_CACHE || 'on');
  const s = new AutoSession(cfg, { pageId: a['page-id'], cacheLists: !!a.cacheLists, transport, tokenCache });
  try {
    await s.open();
    const r = await fn(s);
    if (r && typeof r === 'object' && !Array.isArray(r)) r.transport = { used: s.mode, token: s.tokenSource, fallbacks: s.fallbacks };
    return r;
  } finally { await s.close(); }
}

export async function main(argv) {
  const a = parseArgs(argv);
  const cmd = a._[0];
  const cfg = await loadCfg(a.config || process.env.MDM_CONFIG);
  switch (cmd) {
    case 'lookup':
      return withSession(cfg, a, (s) => lookup(s, cfg, need(a, 'url'), undefined, { checkWeb: a['check-web'] === true }));
    case 'pim-find':
      return withSession(cfg, a, (s) => pimFind(s, cfg, need(a, 'url'), undefined, { modelCode: a['model-code'] }));
    case 'read': {
      const screen = needScreen(a);
      return withSession(cfg, a, (s) => saveReadCommand(s, cfg, { screen, id: need(a, 'id'), out: a.out, taskDir: a.out ? null : need(a, 'task-dir') }));
    }
    case 'write': {
      const screen = needScreen(a);
      const edits = collectEdits(a.set, a['set-file']);
      return withSession(cfg, a, (s) => writeCommand(s, cfg, { screen, id: need(a, 'id'), edits, taskDir: need(a, 'task-dir'), live: !!a.live }));
    }
    case 'restore': {
      const screen = needScreen(a);
      return withSession(cfg, a, (s) => restoreCommand(s, cfg, { backupFile: need(a, 'backup'), screen, taskDir: need(a, 'task-dir'), live: !!a.live }));
    }
    case 'upload':
      return withSession(cfg, a, (s) => uploadCommand(s, cfg, { file: need(a, 'file'), taskDir: need(a, 'task-dir'), live: !!a.live }));
    case 'product-write': {
      const edits = collectEdits(a.set, a['set-file']);
      return withSession(cfg, a, (s) => productWriteCommand(s, cfg, { url: need(a, 'url'), edits, taskDir: need(a, 'task-dir'), live: !!a.live, modelCode: a['model-code'] }));
    }
    case 'product-ops': {
      const spec = loadOpsFile(need(a, 'ops')); // sai file ops → dừng TRƯỚC khi mở kết nối
      return withSession(cfg, a, (s) => productOpsCommand(s, cfg, { url: need(a, 'url'), spec, taskDir: need(a, 'task-dir'), live: !!a.live, modelCode: a['model-code'] }));
    }
    case 'product-restore':
      return withSession(cfg, a, (s) => productRestoreCommand(s, cfg, { backupFile: need(a, 'backup'), taskDir: need(a, 'task-dir'), live: !!a.live }));
    case 'batch': {
      const jobsFile = need(a, 'jobs');
      let raw;
      try { raw = JSON.parse(fs.readFileSync(jobsFile, 'utf8')); } catch (e) { throw new MdmError(`đọc --jobs ${jobsFile} lỗi: ${e.message}`, 2); }
      const jobs = normalizeJobs(raw, { taskDir: a['task-dir'] }); // sai 1 việc → dừng TRƯỚC khi mở kết nối
      const ledgerFile = a.ledger || path.join(a['task-dir'] || '.', 'data/processed', `mdm-batch-${path.basename(jobsFile).replace(/\.[^.]+$/, '')}.jsonl`);
      const log = (m) => process.stderr.write(`${m}\n`);
      const r = await withSession(cfg, { ...a, cacheLists: true }, (s) => runBatch(s, cfg, jobs, {
        taskDir: a['task-dir'], live: !!a.live, ledgerFile, resumeFrom: a.resume ? ledgerFile : null, keepGoing: !!a['keep-going'], log,
      }));
      return r;
    }
    case 'verify-web': {
      const url = new URL(need(a, 'url'), cfg.webOrigin).href;
      const expect = {
        title: a['expect-title'] ?? null,
        description: a['expect-desc'] ?? null,
        text: a['expect-text-file'] ? fs.readFileSync(a['expect-text-file'], 'utf8') : (a['expect-text'] ?? null),
      };
      if (expect.title == null && expect.description == null && expect.text == null) throw new MdmError('cần ít nhất 1 trong --expect-title / --expect-desc / --expect-text', 2);
      const r = await pollUntil(url, expect, {
        samples: Number(a.samples || 4), intervalSec: Number(a.interval || 30), maxMinutes: Number(a['max-minutes'] || 20),
        log: (m) => process.stderr.write(`${m}\n`),
      });
      if (a['task-dir']) {
        const out = path.join(a['task-dir'], 'data/processed', `mdm-verify-web-${stamp()}.json`);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, JSON.stringify({ url, expect, ...r }, null, 2));
        r.out = out;
      }
      return { url, verdict: r.verdict, seconds: r.seconds, samples: r.history.length, out: r.out };
    }
    case 'token-clear': {
      // Xoá token MDM khỏi Keychain (lệnh sau sẽ lấy lại từ tab). Không nối Chrome.
      const tc = tokenCacheFor(cfg, 'on');
      return { status: tc.enabled ? ((await tc.clear()) ? 'CLEARED' : 'NOT_FOUND') : 'NO_CACHE' };
    }
    default:
      throw new MdmError(`lệnh "${cmd || ''}" không có — dùng lookup | read | write | restore | upload | verify-web | pim-find | product-write | product-ops | product-restore | batch | token-clear`, 2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
    .then((r) => {
      process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
      if (r && r.verdict === 'TIMEOUT') process.exit(6);
      if (r && r.status === 'BATCH_STOPPED' && r.exitCode) process.exit(r.exitCode);
    })
    .catch((e) => { process.stderr.write(`LỖI: ${e.message}\n`); process.exit(e.exitCode || 1); });
}
