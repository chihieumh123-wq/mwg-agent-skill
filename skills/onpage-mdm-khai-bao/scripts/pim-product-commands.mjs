/**
 * pim-product-commands.mjs — ghi field SP trên PIM: product-write (thay nguyên giá trị), product-ops
 * (sửa từng chỗ trong bài viết, xem pim-content-ops.mjs), product-restore.
 *
 * Luồng --live: tra trang → đọc mới mọi bản ghi đích (model, hoặc mọi lá Màu của trang) → backup
 * TẤT CẢ trước khi ghi → ghi lần lượt, mỗi bản kèm rowVersion vừa đọc → đọc lại so tuyệt đối từng
 * key + rowVersion tăng đúng 1. Gặp row_version ở bản nào thì DỪNG ngay (bản trước đó đã ghi —
 * báo rõ, khôi phục bằng product-restore).
 *
 * Chỉ xác nhận giá trị trong PIM. Lên web: core mới đọc PIM nhưng trễ (>55 phút, ≤ ~4 giờ, đo
 * 06/10/2026); core cũ đọc CMS nên không đổi.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MdmError, diffRaw, isRowVersionConflict, rawGet } from './mdm-core.mjs';
import { PRODUCT_HTML_FIELDS, applyProductEdits, buildLeafUpdate, buildModelUpdate, leavesForPage, parseRaw } from './pim-product-core.mjs';
import { planOps } from './pim-content-ops.mjs';
import { pimBase, resolveProductPage } from './mdm-commands-lookup.mjs';
import { sha256, stamp } from './mdm-commands-write.mjs';

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

async function readModel(s, cfg, id) {
  const g = await s.post('pim', 'model/getinfor', { ...pimBase(cfg), id, isTranslation: true, categoryId: null });
  if (g.error || !g.object) throw new MdmError(`đọc model ${id} lỗi: ${g.toastMessage || 'object rỗng'}`, 1);
  return { ...g.object, rawValues: parseRaw(g.object.rawValues) };
}

async function readLeaf(s, cfg, id) {
  // Thiếu rootCategoryId thì server trả object:null im lặng — pimBase luôn có.
  const g = await s.post('pim', 'productvariant/getinfor', { ...pimBase(cfg), id, isTranslation: true });
  if (g.error || !g.object) throw new MdmError(`đọc lá ${id} lỗi: ${g.toastMessage || 'object rỗng'}`, 1);
  return { ...g.object, rawValues: parseRaw(g.object.rawValues) };
}

/** Đọc mới mọi bản ghi đích của trang. Trả {kind, model, targets:[{kind, node, info}]}. */
async function loadTargets(s, cfg, resolved) {
  const model = await readModel(s, cfg, resolved.model.id);
  if (!resolved.nodes.length) return { kind: 'model', model, targets: [{ kind: 'model', info: model }] };
  const nodes = leavesForPage(resolved.nodes, resolved.slug);
  if (!nodes.length) throw new MdmError(`model ${resolved.code} có biến thể nhưng không lá nào có url "${resolved.slug}"`, 5);
  const targets = [];
  for (const node of nodes) targets.push({ kind: 'leaf', node, info: await readLeaf(s, cfg, node.id) });
  return { kind: 'variant', model, targets };
}

const reread = (s, cfg, t) => (t.kind === 'model' ? readModel(s, cfg, t.info.id) : readLeaf(s, cfg, t.info.id));

function payloadFor(t, model, rawValues, cfg, family) {
  return t.kind === 'model' ? buildModelUpdate(t.info, rawValues, family, cfg) : buildLeafUpdate(t.info, t.node, model, rawValues, cfg);
}

const writePath = (t) => (t.kind === 'model' ? 'model/update' : 'productvariant/update');
const label = (t) => (t.kind === 'model' ? `model ${t.info.code}` : `lá ${t.info.code} (${String(t.node.name || '').replace(/^.*?:\s*/, '')})`);
const show = (v) => (v == null ? null : v.length <= 200 ? v : { len: v.length, sha256: sha256(v) });

/**
 * Ghi field SP cho 1 trang. Mặc định DRY.
 * `derive(targets)` (dùng bởi product-ops): tính `edits` từ nội dung VỪA ĐỌC của các bản ghi đích, trả
 * {edits, ops} hoặc {status:'ALREADY'}. Không có derive thì `edits` là giá trị thay nguyên.
 */
export async function productWriteCommand(s, cfg, { url, edits, taskDir, live, fetchFn, derive, modelCode }) {
  if (!taskDir) throw new MdmError('thiếu --task-dir (backup và kết quả lưu trong task)', 2);
  if (!derive) applyProductEdits({}, edits); // kiểm field/giá trị trước khi gọi mạng
  const resolved = await resolveProductPage(s, cfg, url, fetchFn, { modelCode });
  const { kind, model, targets } = await loadTargets(s, cfg, resolved);
  const head = { url, modelCode: resolved.code, modelName: resolved.model.name, kind };
  let ops;
  if (derive) {
    const d = derive(targets);
    if (d.status === 'ALREADY') return { status: 'ALREADY', ...head, records: targets.map((t) => ({ record: label(t), id: t.info.id, rowVersion: t.info.rowVersion })), note: 'mọi op đã có trong bài — không ghi lại' };
    ({ edits, ops } = d);
  }
  const planned = targets.map((t) => ({ t, ...applyProductEdits(t.info.rawValues, edits) }));
  const todo = planned.filter((x) => x.changed.length);
  const tag = `product-${resolved.code}-${stamp()}`;
  const plan = {
    ...head, ops,
    records: planned.map((x) => ({ record: label(x.t), id: x.t.info.id, rowVersion: x.t.info.rowVersion,
      changed: x.changed.map((c) => ({ field: c.field, before: show(c.before), after: show(c.after) })) })),
  };
  if (!todo.length) return { status: 'NO_CHANGE', ...plan };
  const planFile = writeJson(path.join(taskDir, 'data/processed', `pim-plan-${tag}.json`), { ...plan, afterValues: edits });
  // Bài viết: thêm bản trước/sau dạng .html cạnh plan để người duyệt mở/diff được, không phải đọc JSON.
  const htmlFiles = {};
  for (const f of PRODUCT_HTML_FIELDS.filter((k) => k in edits)) {
    const base = path.join(taskDir, 'data/processed', `pim-plan-${tag}-${f}`);
    fs.writeFileSync(`${base}-before.html`, rawGet(planned[0].t.info.rawValues, f) ?? '');
    fs.writeFileSync(`${base}-after.html`, edits[f]);
    htmlFiles[f] = { before: `${base}-before.html`, after: `${base}-after.html` };
  }
  if (Object.keys(htmlFiles).length) plan.htmlFiles = htmlFiles;
  if (!live) return { status: 'DRY', ...plan, planFile, next: 'xem plan rồi chạy lại kèm --live' };

  const backupFile = writeJson(path.join(taskDir, 'data/raw', `pim-backup-${tag}.json`),
    { url, modelCode: resolved.code, kind, records: targets.map((t) => ({ kind: t.kind, node: t.node ? { id: t.node.id, lvl: t.node.lvl, name: t.node.name } : undefined, info: t.info })), modelInfo: model });
  const family = kind === 'model'
    ? (await s.post('pim', 'datasource/getfamilyinfor', { id: model.familyId, companyId: cfg.pimCompanyId })).object
    : null;
  if (kind === 'model' && !family) throw new MdmError('không đọc được family của model — không dựng được payload', 1);

  const done = [];
  for (const x of todo) {
    const t0 = Date.now();
    const res = await s.post('pim', writePath(x.t), payloadFor(x.t, model, x.rawValues, cfg, family));
    if (isRowVersionConflict(res)) {
      throw new MdmError(`ROW_VERSION ở ${label(x.t)}: có người vừa sửa (${res.toastMessage}). Đã ghi xong ${done.length}/${todo.length} bản trước đó. Backup: ${backupFile} — khôi phục bằng product-restore nếu cần.`, 3);
    }
    if (res.error) throw new MdmError(`server từ chối ghi ${label(x.t)}: ${res.toastMessage || res.errorReason}. Đã ghi ${done.length}/${todo.length}. Backup: ${backupFile}`, 1);
    const after = await reread(s, cfg, x.t);
    const mismatch = diffRaw(x.rawValues, after.rawValues);
    done.push({ record: label(x.t), id: x.t.info.id, ms: Date.now() - t0, rowVersion: x.t.info.rowVersion, rowVersionAfter: after.rowVersion,
      ok: !mismatch.length && after.rowVersion === x.t.info.rowVersion + 1, mismatchKeys: mismatch });
  }
  const result = { status: done.every((d) => d.ok) ? 'WRITTEN' : 'VERIFY_FAIL', ...plan, written: done, backupFile, planFile,
    note: 'Đã đổi trong PIM. Title lên web core mới sau tới vài giờ (đo 06/10); bài viết chưa đo độ trễ; core cũ đọc CMS nên không đổi.' };
  result.resultFile = writeJson(path.join(taskDir, 'data/processed', `pim-write-${tag}.json`), result);
  if (result.status !== 'WRITTEN') throw new MdmError(`đọc lại không khớp — xem ${result.resultFile}, khôi phục bằng product-restore`, 1);
  return result;
}

/**
 * Sửa từng chỗ trong bài viết SP (product_articles / key_features) theo file ops đã fact-check.
 * spec = validateOpsSpec(...). Mọi bản ghi đích phải đang đúng bản đã fact-check (sha256) — lệch là exit 3.
 */
export async function productOpsCommand(s, cfg, { url, spec, taskDir, live, fetchFn, modelCode }) {
  return productWriteCommand(s, cfg, {
    url, taskDir, live, fetchFn, modelCode,
    derive: (targets) => {
      const befores = targets.map((t) => ({ label: label(t), value: rawGet(t.info.rawValues, spec.field) ?? '' }));
      const p = planOps(spec, befores);
      if (p.status === 'ALREADY') return p;
      return { edits: { [spec.field]: p.after }, ops: { field: spec.field, expectedBeforeSha256: spec.expectedBeforeSha256, edits: p.edits, invariants: p.invariants } };
    },
  });
}

/** Ghi lại title/description (và mọi key) từ file backup của product-write / product-ops. */
export async function productRestoreCommand(s, cfg, { backupFile, taskDir, live }) {
  const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  const model = backup.kind === 'model' ? null : await readModel(s, cfg, backup.modelInfo.id);
  const out = [];
  const pending = [];
  for (const r of backup.records) {
    const t = { kind: r.kind, node: r.node, info: await reread(s, cfg, { kind: r.kind, info: r.info }) };
    const diff = diffRaw(r.info.rawValues, t.info.rawValues);
    const added = diff.filter((k) => !(k in r.info.rawValues));
    if (added.length) throw new MdmError(`${label(t)} có key mới sau backup (${added.join(', ')}) — PIM không xoá được key, khôi phục tay`, 2);
    if (diff.length) pending.push({ t, r, diff }); else out.push({ record: label(t), status: 'ALREADY', rowVersion: t.info.rowVersion });
  }
  if (!pending.length) return { status: 'ALREADY', records: out };
  if (!live) return { status: 'DRY', records: [...out, ...pending.map((p) => ({ record: label(p.t), keysToRestore: p.diff, rowVersion: p.t.info.rowVersion }))] };
  writeJson(path.join(taskDir, 'data/raw', `pim-before-restore-${backup.modelCode}-${stamp()}.json`), pending.map((p) => p.t.info));
  const family = backup.kind === 'model'
    ? (await s.post('pim', 'datasource/getfamilyinfor', { id: pending[0].t.info.familyId, companyId: cfg.pimCompanyId })).object
    : null;
  for (const p of pending) {
    const res = await s.post('pim', writePath(p.t), payloadFor(p.t, model, p.r.info.rawValues, cfg, family));
    if (isRowVersionConflict(res)) throw new MdmError(`ROW_VERSION khi khôi phục ${label(p.t)}: ${res.toastMessage} — dừng`, 3);
    if (res.error) throw new MdmError(`server từ chối khôi phục ${label(p.t)}: ${res.toastMessage}`, 1);
    const after = await reread(s, cfg, p.t);
    const left = diffRaw(p.r.info.rawValues, after.rawValues);
    out.push({ record: label(p.t), status: left.length ? 'VERIFY_FAIL' : 'RESTORED', rowVersionAfter: after.rowVersion, mismatchKeys: left });
  }
  return { status: out.every((o) => o.status !== 'VERIFY_FAIL') ? 'RESTORED' : 'VERIFY_FAIL', records: out };
}
