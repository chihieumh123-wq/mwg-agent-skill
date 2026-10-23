/**
 * mdm-commands-batch.mjs — chạy NHIỀU việc MDM/PIM trong MỘT phiên trình duyệt (lệnh `batch`).
 *
 * Vì sao có: mỗi lần `node mdm-cli.mjs <lệnh>` spawn một chrome-devtools-mcp --autoConnect mới, tức
 * một kết nối debug mới vào Chrome của người dùng — mỗi kết nối là một lần Chrome có thể hỏi "Allow remote
 * debugging?". Lô 35 bản ghi chạy từng lệnh = 35 kết nối. `batch` mở kết nối ĐÚNG MỘT LẦN cho cả lô.
 *
 * Mọi việc vẫn đi qua đúng hàm của lệnh đơn (writeCommand, productWriteCommand…), nên backup, khoá
 * rowVersion, đọc lại từng byte và exit code không đổi. Batch chỉ thêm: kiểm toàn bộ file việc TRƯỚC
 * khi chạm mạng, sổ kết quả từng việc (JSONL), dừng ở việc lỗi đầu tiên, và --resume.
 *
 * File việc (JSON, mảng):
 *   {"cmd":"write","screen":"filter-value","id":"…","set":{"title":"…"},"setFile":{"filter_inforbox":"path.html"}}
 *   {"cmd":"product-write","url":"/laptop/slug","set":{"title":"…","description":"…"},"setFile":{"product_articles":"bai.html"}}
 *   {"cmd":"product-ops","url":"/laptop/slug","ops":"path/ops.json"}
 *   {"cmd":"restore","screen":"brand","backup":"path.json"} · {"cmd":"product-restore","backup":"path.json"}
 *   {"cmd":"lookup","url":"/laptop-ky-thuat"} · {"cmd":"pim-find","url":"/laptop/slug"} · {"cmd":"read","screen":"brand","id":"…"}
 * Việc có thể mang "key" riêng (mặc định cmd:id hoặc cmd:url) — key là khoá của --resume.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { MdmError, SCREENS, applyEdits } from './mdm-core.mjs';
import { applyProductEdits } from './pim-product-core.mjs';
import { lookup, pimFind, readRecord } from './mdm-commands-lookup.mjs';
import { writeCommand, restoreCommand, collectEdits, stamp } from './mdm-commands-write.mjs';
import { productWriteCommand, productOpsCommand, productRestoreCommand } from './pim-product-commands.mjs';
import { loadOpsFile } from './pim-content-ops.mjs';

const WRITE_CMDS = new Set(['write', 'restore', 'product-write', 'product-ops', 'product-restore']);
export const BATCH_CMDS = ['lookup', 'pim-find', 'read', ...WRITE_CMDS];
// Trạng thái coi là "đã xong, không làm lại" khi --resume. DRY không nằm đây: chạy thử không phải xong việc.
const RESUME_DONE = new Set(['WRITTEN', 'NO_CHANGE', 'RESTORED', 'ALREADY', 'SAVED']);
// Lỗi mà --keep-going được phép bỏ qua (không tra được URL). 1/3/4 luôn dừng: ghi hỏng, xung đột, mất tab.
const SKIPPABLE_EXIT = new Set([5]);

const obj = (v, what) => {
  if (v == null) return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw new MdmError(`${what} phải là object {field: giá-trị}`, 2);
  return v;
};

/** Lưu nguyên bản ghi ra file (backup tay). Dùng chung cho lệnh `read` đơn và việc `read` trong batch. */
export async function saveReadCommand(s, cfg, { screen, id, out, taskDir }) {
  const info = await readRecord(s, cfg, screen, id);
  const file = out || path.join(taskDir, 'data/raw', `mdm-read-${screen}-${info.id.slice(0, 8)}-${stamp()}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(info, null, 2));
  return { status: 'SAVED', screen, id: info.id, rowVersion: info.rowVersion, out: file };
}

/** Kiểm 1 việc (không mạng). Trả bản đã chuẩn hoá: {key, cmd, args}. Ném MdmError exit 2 nếu sai. */
export function normalizeJob(job, i, { taskDir }) {
  const where = `việc #${i + 1}`;
  if (!job || typeof job !== 'object') throw new MdmError(`${where}: không phải object`, 2);
  const cmd = job.cmd;
  if (!BATCH_CMDS.includes(cmd)) throw new MdmError(`${where}: cmd "${cmd}" không có — dùng ${BATCH_CMDS.join(' | ')}`, 2);
  const req = (k) => { if (!job[k]) throw new MdmError(`${where} (${cmd}): thiếu "${k}"`, 2); return job[k]; };
  if (WRITE_CMDS.has(cmd) && !taskDir) throw new MdmError('batch có việc ghi/khôi phục: thiếu --task-dir', 2);
  const args = { };
  if (cmd === 'lookup' || cmd === 'pim-find') args.url = req('url');
  if (['pim-find', 'product-write', 'product-ops'].includes(cmd) && job.modelCode != null) args.modelCode = String(job.modelCode);
  if (cmd === 'read' || cmd === 'write' || cmd === 'restore') {
    args.screen = req('screen');
    if (!SCREENS.includes(args.screen)) throw new MdmError(`${where}: screen phải là ${SCREENS.join(' | ')}`, 2);
  }
  if (cmd === 'read' || cmd === 'write') args.id = req('id');
  if (cmd === 'restore' || cmd === 'product-restore') {
    args.backupFile = req('backup');
    if (!fs.existsSync(args.backupFile)) throw new MdmError(`${where}: backup không tồn tại: ${args.backupFile}`, 2);
  }
  if (cmd === 'product-write' || cmd === 'product-ops') args.url = req('url');
  if (cmd === 'product-ops') {
    // Nạp + kiểm file ops ngay (field, sha256, từng op); spec đã nạp vào hash nên sửa file ops là --resume chạy lại.
    try { args.spec = loadOpsFile(req('ops')); } catch (e) { throw new MdmError(`${where}: ${e.message}`, e.exitCode || 2); }
  }
  if (cmd === 'write' || cmd === 'product-write') {
    const sets = Object.entries(obj(job.set, `${where}: set`)).map(([k, v]) => `${k}=${v}`);
    const setFiles = Object.entries(obj(job.setFile, `${where}: setFile`)).map(([k, v]) => `${k}=${v}`);
    try {
      args.edits = collectEdits(sets, setFiles);
      // Field cấm / giá trị sai phải lộ ra NGAY ở bước kiểm, không đợi tới việc thứ k giữa lô đang ghi.
      if (cmd === 'write') applyEdits(args.screen, {}, args.edits); else applyProductEdits({}, args.edits);
    } catch (e) { throw new MdmError(`${where}: ${e.message}`, e.exitCode || 2); }
  }
  if (cmd === 'read') args.out = job.out;
  const key = job.key || `${cmd}:${args.id || args.url || args.backupFile}`;
  // Hash theo nội dung đã chuẩn hoá (gồm cả byte file --setFile): --resume chỉ bỏ qua khi việc KHÔNG đổi.
  const hash = crypto.createHash('sha256').update(JSON.stringify({ cmd, args })).digest('hex').slice(0, 16);
  return { key, cmd, args, hash };
}

/** Kiểm cả lô trước khi chạm mạng: mọi việc hợp lệ, không trùng key (trùng = hầu như chắc là nhầm). */
export function normalizeJobs(jobs, opts) {
  if (!Array.isArray(jobs) || !jobs.length) throw new MdmError('file việc phải là mảng không rỗng', 2);
  const out = jobs.map((j, i) => normalizeJob(j, i, opts));
  const seen = new Set();
  for (const j of out) {
    if (seen.has(j.key)) throw new MdmError(`key trùng "${j.key}" — 2 việc cùng đích trong 1 lô; đặt "key" riêng nếu cố ý`, 2);
    seen.add(j.key);
  }
  return out;
}

/** Đọc sổ JSONL của lần chạy trước → Map key→hash của các việc đã xong ở chế độ --live. */
export function doneKeysFrom(file) {
  const done = new Map();
  if (!file || !fs.existsSync(file)) return done;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (r.live && RESUME_DONE.has(r.status)) done.set(r.key, r.hash); } catch { /* dòng cụt do bị ngắt giữa chừng */ }
  }
  return done;
}

async function runOne(s, cfg, j, { taskDir, live }) {
  const a = j.args;
  switch (j.cmd) {
    case 'lookup': return lookup(s, cfg, a.url);
    case 'pim-find': return pimFind(s, cfg, a.url, undefined, { modelCode: a.modelCode });
    case 'read': return saveReadCommand(s, cfg, { screen: a.screen, id: a.id, out: a.out, taskDir });
    case 'write': return writeCommand(s, cfg, { screen: a.screen, id: a.id, edits: a.edits, taskDir, live });
    case 'restore': return restoreCommand(s, cfg, { backupFile: a.backupFile, screen: a.screen, taskDir, live });
    case 'product-write': return productWriteCommand(s, cfg, { url: a.url, edits: a.edits, taskDir, live, modelCode: a.modelCode });
    case 'product-ops': return productOpsCommand(s, cfg, { url: a.url, spec: a.spec, taskDir, live, modelCode: a.modelCode });
    case 'product-restore': return productRestoreCommand(s, cfg, { backupFile: a.backupFile, taskDir, live });
    default: throw new MdmError(`cmd ${j.cmd}`, 2);
  }
}

/**
 * Chạy lô trên MỘT phiên `s` đã mở. Dừng ở việc lỗi đầu tiên (trừ --keep-going với exit 5).
 * Ghi mỗi việc 1 dòng vào `ledgerFile` ngay khi xong, nên bị ngắt giữa chừng vẫn còn sổ để --resume.
 * Trả {status, exitCode, counts, ...}; exitCode ≠ 0 khi dừng vì lỗi.
 */
export async function runBatch(s, cfg, jobs, { taskDir, live, ledgerFile, resumeFrom, keepGoing = false, log = () => {} }) {
  const done = live ? doneKeysFrom(resumeFrom) : new Map();
  fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });
  const counts = {};
  let ran = 0, skipped = 0, stoppedAt = null, exitCode = 0;
  const bump = (st) => { counts[st] = (counts[st] || 0) + 1; };
  for (const [i, j] of jobs.entries()) {
    if (done.has(j.key)) {
      if (done.get(j.key) === j.hash) { skipped++; bump('RESUME_SKIP'); log(`${i + 1}/${jobs.length} ${j.key} bỏ qua (đã xong ở lần trước)`); continue; }
      log(`${i + 1}/${jobs.length} ${j.key}: nội dung việc đã đổi so với lần trước → chạy lại`);
    }
    const t0 = Date.now();
    const rec = { at: new Date().toISOString(), i: i + 1, key: j.key, hash: j.hash, cmd: j.cmd, live: !!live };
    try {
      const res = await runOne(s, cfg, j, { taskDir, live });
      Object.assign(rec, { status: res.status || 'OK', exit: 0, ms: Date.now() - t0, result: res });
    } catch (e) {
      Object.assign(rec, { status: 'ERROR', exit: e.exitCode || 1, ms: Date.now() - t0, error: e.message });
    }
    fs.appendFileSync(ledgerFile, `${JSON.stringify(rec)}\n`);
    ran++; bump(rec.status);
    log(`${i + 1}/${jobs.length} ${j.key} → ${rec.status}${rec.exit ? ` (exit ${rec.exit})` : ''}`);
    if (rec.exit && !(keepGoing && SKIPPABLE_EXIT.has(rec.exit))) { stoppedAt = { i: i + 1, key: j.key, exit: rec.exit, error: rec.error }; exitCode = rec.exit; break; }
  }
  return {
    status: stoppedAt ? 'BATCH_STOPPED' : 'BATCH_DONE', exitCode, live: !!live,
    total: jobs.length, ran, skipped, notRun: jobs.length - ran - skipped, counts, stoppedAt, ledgerFile,
    next: stoppedAt ? 'sửa nguyên nhân rồi chạy lại cùng lệnh kèm --resume (việc đã xong sẽ được bỏ qua)' : (live ? undefined : 'xem kết quả từng việc trong sổ rồi chạy lại kèm --live'),
  };
}
