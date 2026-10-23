/**
 * test-mdm-core.mjs — test logic thuần + luồng ghi chạy trên server giả (không mạng, không trình duyệt).
 *
 *   node .claude/skills/onpage-mdm-khai-bao/scripts/test-mdm-core.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyEdits, assertNoDroppedKeys, buildUpdate, diffRaw, isRowVersionConflict, parseWebUrl,
  categoryCandidates, resolveRest, seoFieldsFor, MdmError,
} from './mdm-core.mjs';
import { checkPage, pollUntil, extractTitle } from './mdm-web-verify.mjs';
import { writeCommand, restoreCommand, uploadCommand, collectEdits } from './mdm-commands-write.mjs';
import { parseArgs } from './mdm-cli.mjs';
import { normalizeJobs, runBatch, doneKeysFrom } from './mdm-commands-batch.mjs';
import { MdmSession, AutoSession } from './mdm-browser.mjs';
import { DirectRunner, DirectUnavailable, isReadOp } from './mdm-direct.mjs';
import { KeychainTokenCache, TOKEN_MAX_AGE_MS, decodeEntry, encodeEntry, tokenCacheFor } from './mdm-keychain-cache.mjs';
import vm from 'node:vm';
import { TimeoutError, CliError } from './cms-cli-mcp.mjs';

let pass = 0, fail = 0;
const t = (name, cond, extra) => { if (cond) { pass++; console.log('  ok  ', name); } else { fail++; console.log('  FAIL', name, extra ?? ''); } };
const throwsCode = (fn, code) => { try { fn(); return false; } catch (e) { return e instanceof MdmError && e.exitCode === code; } };
const rejectsCode = async (p, code) => { try { await p; return false; } catch (e) { return e.exitCode === code; } };

const CFG = {
  category: { objectId: 'OBJ-C', tableId: 'TBL-C', functionId: 'FN-C', rootId: 'ROOT' },
  brand: { objectId: 'OBJ-B', tableId: 'TBL-B', functionId: 'FN-B' },
  filter: { objectId: 'OBJ-F', tableId: 'TBL-F', functionId: 'FN-F', relationId: 'REL-F' },
  webOrigin: 'https://www.example.vn',
};
const R = (data) => [{ locale: 'all', data }];

console.log('\n# applyEdits / chặn rơi key');
{
  const raw = { url: R('ky-thuat'), title: R('Cũ'), filter_type_attribute_code: R('448') };
  const { rawValues, changed } = applyEdits('filter-value', raw, { title: 'Mới  hai dấu cách &amp;', filter_inforbox: '<h2>x</h2>' });
  t('đổi title giữ nguyên byte (không trim, không giải entity)', rawValues.title[0].data === 'Mới  hai dấu cách &amp;');
  t('field chưa có → tạo locale all', JSON.stringify(rawValues.filter_inforbox) === JSON.stringify(R('<h2>x</h2>')));
  t('changed đủ 2 field', changed.length === 2);
  t('không đụng bản gốc', raw.title[0].data === 'Cũ');
  t('giá trị giống cũ → không tính là đổi', applyEdits('filter-value', raw, { title: 'Cũ' }).changed.length === 0);
  t('field ngoài danh sách (url) bị từ chối', throwsCode(() => applyEdits('filter-value', raw, { url: 'x' }), 2));
  t('màn lạ bị từ chối', throwsCode(() => applyEdits('product', raw, { title: 'x' }), 2));
  t('nhiều locale → dừng', throwsCode(() => applyEdits('category', { seo_title: [{ locale: 'vi', data: 'a' }, { locale: 'en', data: 'b' }] }, { seo_title: 'c' }), 2));
  t('rơi key → dừng', throwsCode(() => assertNoDroppedKeys({ a: 1, b: 2 }, { a: 1 }), 2));
  t('không rơi key → qua', (assertNoDroppedKeys({ a: 1 }, { a: 1, b: 2 }), true));
}

console.log('\n# buildUpdate đúng shape request giao diện');
{
  const cat = buildUpdate('category', { id: 'C1', rowVersion: 11, rawValues: {}, objectCode: 'tgdd_category' }, { seo_title: R('x') }, CFG);
  t('category: key = id, functionId, isIncrementKey, rowVersion giữ', cat.key === 'C1' && cat.functionId === 'FN-C' && cat.isIncrementKey === true && cat.rowVersion === 11 && cat.rawValues.seo_title);
  const br = buildUpdate('brand', { id: 'B1', rowVersion: 5, isActivated: true, recordCode: '1069', rawValues: {} }, { seo_title: R('y') }, CFG);
  t('brand: objectId/tableId/functionId từ config', br.objectId === 'OBJ-B' && br.tableId === 'TBL-B' && br.functionId === 'FN-B' && br.recordCode === '1069' && br.rowVersion === 5);
  const fv = buildUpdate('filter-value', { id: 'V1', rowVersion: 7, dataObjectId: 'DO1', rawValues: { filter_type_attribute_code: R('448') } }, { filter_type_attribute_code: R('448'), title: R('z') }, CFG);
  t('filter-value: recordCode = mã dòng Filter cha, dataRelation mang rawValues mới', fv.recordCode === '448' && fv.dataRelation.rawValues.title[0].data === 'z' && fv.dataRelation.rowVersion === 7 && fv.relationId === 'REL-F' && fv.isIncrementKey === false);
  t('filter-value thiếu mã dòng cha → dừng', throwsCode(() => buildUpdate('filter-value', { id: 'V', rawValues: {} }, {}, CFG), 2));
}

console.log('\n# so readback / row_version');
{
  t('khớp tuyệt đối dù khác thứ tự key', diffRaw({ a: R('1'), b: R('2') }, { b: [{ data: '2', locale: 'all' }], a: R('1') }).length === 0);
  t('lệch 1 dấu cách bị bắt', diffRaw({ a: R('x ') }, { a: R('x') }).join() === 'a');
  t('row_version nhận đúng', isRowVersionConflict({ error: true, errorReason: 'row_version' }) && !isRowVersionConflict({ error: false }));
}

console.log('\n# tra URL');
{
  t('trang listing', parseWebUrl('https://www.example.vn/laptop-ky-thuat', CFG.webOrigin).slug === 'laptop-ky-thuat');
  t('trang SP', parseWebUrl('/laptop/macbook-neo', CFG.webOrigin).kind === 'product');
  t('khác domain bị từ chối', throwsCode(() => parseWebUrl('https://evil.vn/laptop', CFG.webOrigin), 2));
  const cats = [{ url: 'may-tinh' }, { url: 'may-tinh-de-ban' }, { url: 'laptop' }];
  t('danh mục dài nhất trước', categoryCandidates('may-tinh-de-ban-hp', cats)[0].url === 'may-tinh-de-ban');
  const brands = [{ id: 'b-dell', url: 'dell' }, { id: 'b-apple', url: 'apple-macbook' }];
  const values = [{ id: 'v-kt', url: 'ky-thuat' }, { id: 'v-neo', url: 'neo' }];
  t('filter', resolveRest('ky-thuat', { brands, filterValues: values }).id === 'v-kt');
  t('hãng', resolveRest('dell', { brands, filterValues: values }).screen === 'brand');
  const bf = resolveRest('dell-ky-thuat', { brands, filterValues: values });
  t('hãng + filter → field *_brand_filter', bf.variant === 'brand-filter' && seoFieldsFor(bf).title === 'title_brand_filter');
  t('dòng có tiền tố hãng (apple-macbook-neo)', resolveRest('apple-macbook-neo', { brands, filterValues: values }).id === 'v-neo');
  t('không khớp → null', resolveRest('khong-co', { brands, filterValues: values }) === null);
  t('mơ hồ → dừng', throwsCode(() => resolveRest('dell', { brands, filterValues: [{ id: 'v-dell', url: 'dell' }] }), 2));
}

console.log('\n# nghiệm thu web');
{
  const html = '<html><head><title>Laptop &amp; PC  giá tốt</title><meta name="description" content="Mô tả"></head><body><h2>Tiêu đề</h2><p>Đoạn   văn</p></body></html>';
  t('title giải entity, giữ 2 dấu cách', extractTitle(html) === 'Laptop & PC  giá tốt');
  t('đạt title + desc + text', checkPage(html, { title: 'Laptop & PC  giá tốt', description: 'Mô tả', text: 'Tiêu đề Đoạn văn' }).pass);
  t('title thiếu 1 dấu cách → trượt', !checkPage(html, { title: 'Laptop & PC giá tốt' }).pass);
  const resp = (body, version) => ({ status: 200, text: async () => body, headers: { get: (k) => (k === 'x-version' ? version : null) } });
  const seq = [resp('<title>cũ</title>'), resp('<title>mới</title>', 'Mwg-6.9'), resp('<title>mới</title>'), resp('<title>mới</title>')];
  let i = 0;
  const r = await pollUntil('u', { title: 'mới' }, { samples: 2, intervalSec: 0, maxMinutes: 1, fetchFn: async () => seq[Math.min(i++, seq.length - 1)], sleepFn: async () => {} });
  t('mẫu core cũ bị bỏ qua, cần 2 mẫu core mới liên tiếp', r.verdict === 'PASS' && r.history.filter((h) => h.skipped).length === 1);
}

console.log('\n# luồng ghi trên server giả');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdm-test-'));
  const store = { id: 'B1', rowVersion: 5, isActivated: true, recordCode: '1069', rawValues: { seo_title: R('Cũ'), url: R('dell') } };
  const calls = [];
  const fake = (mode = 'ok') => ({
    async post(api, p, body) {
      calls.push(p);
      if (p.endsWith('getinfor')) return { error: false, object: JSON.parse(JSON.stringify(store)) };
      if (p.endsWith('update')) {
        if (mode === 'conflict' || body.rowVersion !== store.rowVersion) return { error: true, errorReason: 'row_version', toastMessage: 'Phiên bản dữ liệu đã thay đổi' };
        store.rawValues = mode === 'trim' ? { ...body.rawValues, seo_title: R(body.rawValues.seo_title[0].data.trim()) } : body.rawValues;
        store.rowVersion += 1;
        return { error: false, object: true };
      }
      throw new Error(`không mong đợi ${p}`);
    },
  });
  const dry = await writeCommand(fake(), CFG, { screen: 'brand', id: 'B1', edits: { seo_title: 'Mới ' }, taskDir: tmp, live: false });
  t('dry: không gọi update', dry.status === 'DRY' && !calls.some((c) => c.endsWith('update')));
  const live = await writeCommand(fake(), CFG, { screen: 'brand', id: 'B1', edits: { seo_title: 'Mới ' }, taskDir: tmp, live: true });
  t('live: WRITTEN, rowVersion +1, có backup', live.status === 'WRITTEN' && live.rowVersionAfter === 6 && fs.existsSync(live.backupFile));
  t('backup giữ bản cũ', JSON.parse(fs.readFileSync(live.backupFile, 'utf8')).rawValues.seo_title[0].data === 'Cũ');
  t('url không bị rơi', store.rawValues.url[0].data === 'dell');
  t('không đổi gì → NO_CHANGE', (await writeCommand(fake(), CFG, { screen: 'brand', id: 'B1', edits: { seo_title: 'Mới ' }, taskDir: tmp, live: true })).status === 'NO_CHANGE');
  t('row_version → exit 3', await rejectsCode(writeCommand(fake('conflict'), CFG, { screen: 'brand', id: 'B1', edits: { seo_title: 'Khác' }, taskDir: tmp, live: true }), 3));
  t('server trim → VERIFY_FAIL exit 1', await rejectsCode(writeCommand(fake('trim'), CFG, { screen: 'brand', id: 'B1', edits: { seo_title: 'Có cách ' }, taskDir: tmp, live: true }), 1));
  const rs = await restoreCommand(fake(), CFG, { backupFile: live.backupFile, screen: 'brand', taskDir: tmp, live: true });
  t('restore về đúng bản backup', rs.status === 'RESTORED' && store.rawValues.seo_title[0].data === 'Cũ', JSON.stringify(rs) + ' ' + store.rawValues.seo_title[0].data);

  const img = path.join(tmp, 'a.png');
  fs.writeFileSync(img, Buffer.from([1, 2, 3]));
  let ups = 0;
  const upS = { async run() { ups++; return [{ ok: true, ms: 5, json: { error: false, object: { filePath: 'https://cdn.example/a123.png' } } }]; } };
  const head = async () => ({ status: 200, headers: { get: () => '3' } });
  const u1 = await uploadCommand(upS, CFG, { file: img, taskDir: tmp, live: true, fetchFn: head });
  const u2 = await uploadCommand(upS, CFG, { file: img, taskDir: tmp, live: true, fetchFn: head });
  t('upload lần 2 cùng byte → REUSED, không up lại', u1.status === 'UPLOADED' && u2.status === 'REUSED' && ups === 1);
  t('đuôi lạ bị từ chối', await rejectsCode(uploadCommand(upS, CFG, { file: path.join(tmp, 'a.svg'), taskDir: tmp, live: true }), 2));
}

console.log('\n# batch: một phiên cho cả lô');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdm-batch-'));
  const stores = { A: { id: 'A', rowVersion: 1, rawValues: { seo_title: R('a0'), url: R('a') } }, B: { id: 'B', rowVersion: 7, rawValues: { seo_title: R('b0'), url: R('b') } }, C: { id: 'C', rowVersion: 3, rawValues: { seo_title: R('c0'), url: R('c') } } };
  let conflictOn = null;
  const fakeS = {
    async post(api, p, body) {
      if (p.endsWith('getinfor')) return { error: false, object: JSON.parse(JSON.stringify(stores[body.id || body.dataObjectId || body.recordId] || stores[Object.values(body).find((v) => stores[v])])) };
      if (p.endsWith('update')) {
        const st = stores[body.id];
        if (conflictOn === body.id || body.rowVersion !== st.rowVersion) return { error: true, errorReason: 'row_version', toastMessage: 'đã đổi' };
        st.rawValues = body.rawValues; st.rowVersion += 1; return { error: false, object: true };
      }
      throw new Error(`không mong đợi ${p}`);
    },
  };
  const job = (id, v) => ({ cmd: 'write', screen: 'brand', id, set: { seo_title: v } });
  const jobs = normalizeJobs([job('A', 'a1'), job('B', 'b1'), job('C', 'c1')], { taskDir: tmp });
  t('normalize: key mặc định cmd:id', jobs[0].key === 'write:A' && jobs[0].hash.length === 16);
  t('normalize: file việc sai → exit 2 trước khi chạm mạng', throwsCode(() => normalizeJobs([job('A', 'x'), { cmd: 'write', screen: 'brand', set: { seo_title: 'y' } }], { taskDir: tmp }), 2));
  t('normalize: cmd lạ → exit 2', throwsCode(() => normalizeJobs([{ cmd: 'drop' }], { taskDir: tmp }), 2));
  t('normalize: field cấm (url) ở việc cuối lô → exit 2 trước khi chạy', throwsCode(() => normalizeJobs([job('A', 'x'), { cmd: 'write', screen: 'brand', id: 'B', set: { url: 'x' } }], { taskDir: tmp }), 2));
  t('normalize: field cấm của SP → exit 2', throwsCode(() => normalizeJobs([{ cmd: 'product-write', url: '/laptop/x', set: { keyword: 'x' } }], { taskDir: tmp }), 2));
  {
    const opsFile = path.join(tmp, 'ops.json');
    const good = { field: 'product_articles', expectedBeforeSha256: 'a'.repeat(64), ops: [{ id: 'A1', type: 'replace', find: 'x', new: 'y' }] };
    fs.writeFileSync(opsFile, JSON.stringify(good));
    const [pj] = normalizeJobs([{ cmd: 'product-ops', url: '/laptop/x', ops: opsFile }], { taskDir: tmp });
    t('normalize: product-ops nạp file ops, key riêng', pj.key === 'product-ops:/laptop/x' && pj.args.spec.ops.length === 1);
    fs.writeFileSync(opsFile, JSON.stringify({ ...good, field: 'title' }));
    t('normalize: product-ops với file ops sai → exit 2 trước khi chạy', throwsCode(() => normalizeJobs([{ cmd: 'product-ops', url: '/laptop/x', ops: opsFile }], { taskDir: tmp }), 2));
    fs.writeFileSync(opsFile, JSON.stringify({ ...good, ops: [{ id: 'A1', type: 'replace', find: 'x', new: 'z' }] }));
    t('normalize: sửa nội dung file ops → hash đổi (--resume chạy lại)', normalizeJobs([{ cmd: 'product-ops', url: '/laptop/x', ops: opsFile }], { taskDir: tmp })[0].hash !== pj.hash);
  }
  t('normalize: key trùng → exit 2', throwsCode(() => normalizeJobs([job('A', 'x'), job('A', 'y')], { taskDir: tmp }), 2));
  t('normalize: việc ghi mà thiếu task-dir → exit 2', throwsCode(() => normalizeJobs([job('A', 'x')], {}), 2));

  const ledger = path.join(tmp, 'ledger.jsonl');
  const dry = await runBatch(fakeS, CFG, jobs, { taskDir: tmp, live: false, ledgerFile: ledger });
  t('dry: không ghi gì, 3 việc DRY', dry.status === 'BATCH_DONE' && dry.counts.DRY === 3 && stores.A.rowVersion === 1);

  conflictOn = 'B';
  const stop = await runBatch(fakeS, CFG, jobs, { taskDir: tmp, live: true, ledgerFile: ledger, resumeFrom: ledger });
  t('live: việc A ghi, B xung đột → dừng exit 3, C chưa chạy', stop.status === 'BATCH_STOPPED' && stop.exitCode === 3 && stop.ran === 2 && stop.notRun === 1 && stores.A.rowVersion === 2 && stores.C.rowVersion === 3, JSON.stringify(stop));
  t('sổ ghi mỗi việc đã chạy 1 dòng', fs.readFileSync(ledger, 'utf8').trim().split('\n').filter((l) => JSON.parse(l).live).length === 2);

  conflictOn = null;
  const resumed = await runBatch(fakeS, CFG, jobs, { taskDir: tmp, live: true, ledgerFile: ledger, resumeFrom: ledger });
  t('resume: A bỏ qua (đã WRITTEN), B và C ghi', resumed.status === 'BATCH_DONE' && resumed.skipped === 1 && resumed.counts.WRITTEN === 2 && stores.A.rowVersion === 2 && stores.B.rowVersion === 8 && stores.C.rowVersion === 4, JSON.stringify(resumed));
  t('doneKeysFrom: DRY không tính là xong', !doneKeysFrom(ledger).has('write:ZZ') && doneKeysFrom(ledger).size === 3);

  const changed = normalizeJobs([job('A', 'a-KHÁC'), job('B', 'b1'), job('C', 'c1')], { taskDir: tmp });
  const rerun = await runBatch(fakeS, CFG, changed, { taskDir: tmp, live: true, ledgerFile: ledger, resumeFrom: ledger });
  t('resume: nội dung việc đổi → chạy lại, không bỏ qua nhầm', rerun.counts.WRITTEN === 1 && rerun.skipped === 2 && stores.A.rawValues.seo_title[0].data === 'a-KHÁC', JSON.stringify(rerun));

  const notFound = { async post() { throw new MdmError('không tra được', 5); } };
  const lk = normalizeJobs([{ cmd: 'lookup', url: '/a' }, { cmd: 'lookup', url: '/b' }], { taskDir: tmp });
  const nf1 = await runBatch(notFound, CFG, lk, { taskDir: tmp, live: false, ledgerFile: path.join(tmp, 'l2.jsonl') });
  t('exit 5 mặc định dừng lô', nf1.status === 'BATCH_STOPPED' && nf1.exitCode === 5 && nf1.ran === 1);
  const nf2 = await runBatch(notFound, CFG, lk, { taskDir: tmp, live: false, ledgerFile: path.join(tmp, 'l3.jsonl'), keepGoing: true });
  t('--keep-going vượt qua exit 5', nf2.status === 'BATCH_DONE' && nf2.ran === 2 && nf2.counts.ERROR === 2);
  const hard = { async post() { throw new MdmError('server hỏng', 1); } };
  const nf3 = await runBatch(hard, CFG, lk, { taskDir: tmp, live: false, ledgerFile: path.join(tmp, 'l4.jsonl'), keepGoing: true });
  t('--keep-going KHÔNG vượt qua exit 1', nf3.status === 'BATCH_STOPPED' && nf3.exitCode === 1 && nf3.ran === 1);

  // cache danh sách tĩnh trong phiên
  let evals = 0;
  const client = { pageId: null };
  const sess = new MdmSession(CFG, { client, cacheLists: true });
  sess.run = MdmSession.prototype.run.bind(sess);
  // thay evaluate qua client.callTool: trả đúng định dạng evaluate_script
  client.callTool = async () => { evals++; return { content: [{ type: 'text', text: '```json\n' + JSON.stringify({ ok: true, results: [{ ok: true, json: { error: false, object: [] } }] }) + '\n```' }] }; };
  const list = [{ api: 'mdm', path: 'dataobject/getlist', body: { x: 1 } }];
  await sess.run(list); await sess.run(list);
  t('cache: getlist trùng chỉ gọi 1 lần', evals === 1);
  const info = [{ api: 'mdm', path: 'dataobject/getinfor', body: { id: 1 } }];
  await sess.run(info); await sess.run(info);
  t('cache: getinfor KHÔNG bao giờ cache', evals === 3);
  const pimList = [{ api: 'pim', path: 'dataobject/getlist', body: { x: 1 } }];
  await sess.run(pimList); await sess.run(pimList);
  t('cache: PIM không cache', evals === 5);
  const plain = new MdmSession(CFG, { client });
  const e0 = evals; await plain.run(list); await plain.run(list);
  t('cache: mặc định tắt (lệnh đơn không đổi hành vi)', evals === e0 + 2);

  // open(): list_pages treo không được phép sinh thêm kết nối nếu cùng kết nối còn trả lời được
  const mkClient = (listScript) => {
    const c = { connects: 0, closes: 0, listCalls: 0, pageId: null };
    c.connect = async () => { c.connects++; };
    c.close = async () => { c.closes++; };
    c.callTool = async (name) => {
      if (name === 'list_pages') { const step = listScript[c.listCalls++]; if (step === 'timeout') throw new TimeoutError('treo'); return { structuredContent: { pages: [] } }; }
      throw new Error(`không mong đợi ${name}`);
    };
    return c;
  };
  const quiet = () => {};
  const c1 = mkClient(['ok']);
  await new MdmSession(CFG, { client: c1 }).open({ log: quiet }).catch(() => {});
  t('open: bình thường → 1 kết nối, 1 list_pages', c1.connects === 1 && c1.listCalls === 1);
  const c2 = mkClient(['timeout', 'ok']);
  const e2 = await new MdmSession(CFG, { client: c2 }).open({ log: quiet }).catch((e) => e);
  t('open: treo 1 lần → thử lại trên CÙNG kết nối, không khởi động lại MCP', c2.connects === 1 && c2.closes === 0 && c2.listCalls === 2 && e2 instanceof CliError && e2.exitCode === 4, `${c2.connects}/${c2.closes}/${c2.listCalls}`);
  const c3 = mkClient(['timeout', 'timeout', 'ok']);
  await new MdmSession(CFG, { client: c3 }).open({ log: quiet }).catch(() => {});
  t('open: treo 2 lần → khởi động lại MCP đúng 1 lần', c3.connects === 2 && c3.closes === 1 && c3.listCalls === 3, `${c3.connects}/${c3.closes}/${c3.listCalls}`);
  const c4 = mkClient(['timeout', 'timeout', 'timeout']);
  const e4 = await new MdmSession(CFG, { client: c4 }).open({ log: quiet }).catch((e) => e);
  t('open: treo cả 3 lần → báo lỗi, không vòng lặp', e4 instanceof TimeoutError && c4.connects === 2 && c4.listCalls === 3);
}

console.log('\n# 2 đường: gọi thẳng (direct) + rơi về lái tab');
{
  const DCFG = { ...CFG, uiOrigin: 'https://mdm.test', apiBase: 'https://api.test/mdm/', pimApiBase: 'https://api.test/pim/' };
  const TOKEN = 'TOK-' + 'x'.repeat(40);
  const reply = (obj, status = 200) => new Response(typeof obj === 'string' ? obj : JSON.stringify(obj), { status });
  const rows = { error: false, object: [{ id: 1, name: 'n', big: 'B'.repeat(50), raw_values: JSON.stringify({ url: 'u', article: 'A'.repeat(50) }) }] };
  const proj = { top: ['id', 'name'], raw: ['url'] };

  // parity thật: chạy NGUYÊN runner trong tab giả và DirectRunner trên cùng fetch giả
  const seen = [];
  const fakeFetch = async (url, init) => { seen.push({ url: String(url), auth: init.headers.authorization, body: init.body }); return reply(rows); };
  const idb = { open: () => { const req = {}; setTimeout(() => req.onsuccess && req.onsuccess(), 0);
    req.result = { transaction: () => ({ objectStore: () => ({ get: () => { const g = {}; setTimeout(() => g.onsuccess && g.onsuccess(), 0); g.result = { access_token: TOKEN }; return g; } }) }) }; return req; } };
  const ctx = vm.createContext({ indexedDB: idb, fetch: fakeFetch, atob, FormData, Blob, Uint8Array, JSON, Date, URL, String, Promise, setTimeout });
  vm.runInContext(fs.readFileSync(new URL('./mdm-page-runner.js', import.meta.url), 'utf8'), ctx);
  const ops = [{ api: 'mdm', path: 'dataobject/getlist', body: { a: 1 }, project: proj }, { api: 'pim', path: 'model/getinfor', body: { id: 'x' } }];
  const viaTab = JSON.parse(JSON.stringify(await vm.runInContext('__mdmRun', ctx)(DCFG, ops)));
  const tabSeen = seen.splice(0);
  const viaDirect = await new DirectRunner(DCFG, TOKEN, { fetchFn: fakeFetch }).run(ops);
  const strip = (r) => (Array.isArray(r) ? r : r.results).map(({ ms, ...x }) => x);
  t('parity: kết quả direct = kết quả runner trong tab (gồm project)', JSON.stringify(strip(viaDirect)) === JSON.stringify(strip(viaTab)), JSON.stringify(strip(viaDirect)) + ' vs ' + JSON.stringify(strip(viaTab)));
  t('parity: cùng URL + header Bearer + body', JSON.stringify(seen.map((x) => [x.url, x.auth, x.body])) === JSON.stringify(tabSeen.map((x) => [x.url, x.auth, x.body])) && seen[0].auth === `Bearer ${TOKEN}` && seen[0].url === 'https://api.test/mdm/dataobject/getlist');
  const emptyIdb = { open: () => { const q = {}; setTimeout(() => q.onerror && q.onerror(), 0); return q; } };
  const ctx2 = vm.createContext({ indexedDB: emptyIdb, fetch: fakeFetch, atob, FormData, Blob, Uint8Array, JSON, Date, URL, String, Promise, setTimeout });
  vm.runInContext(fs.readFileSync(new URL('./mdm-page-runner.js', import.meta.url), 'utf8'), ctx2);
  t('runner: tab không có token → {ok:false, reason:no_token}', (await vm.runInContext('__mdmRun', ctx2)(DCFG, ops)).reason === 'no_token');

  const run1 = (op, f) => new DirectRunner(DCFG, TOKEN, { fetchFn: f }).run([op]);
  const rd = { api: 'mdm', path: 'dataobject/getinfor', body: {} };
  const wr = { api: 'mdm', path: 'dataobject/update', body: {} };
  t('isReadOp: getinfor/getlist* đọc; update/upload ghi', isReadOp(rd) && isReadOp({ path: 'productvariant/getlist4tree' }) && !isReadOp(wr) && !isReadOp({ upload: {} }));
  const rejects = async (p, reason) => { try { await p; return false; } catch (e) { return e instanceof DirectUnavailable && e.reason === reason; } };
  t('401 ở op đọc → DirectUnavailable(auth)', await rejects(run1(rd, async () => reply('', 401)), 'auth'));
  t('403 ở op GHI → DirectUnavailable(auth) (server từ chối, chưa ghi gì)', await rejects(run1(wr, async () => reply('', 403)), 'auth'));
  t('op đọc đứt mạng → DirectUnavailable(network)', await rejects(run1(rd, async () => { throw new Error('socket hang up'); }), 'network'));
  t('op đọc nhận HTML 502 → DirectUnavailable(non-json)', await rejects(run1(rd, async () => reply('<html>bad gateway</html>', 502)), 'non-json'));
  t('op GHI đứt mạng giữa chừng → KHÔNG rơi về (kết quả ok:false, dừng chuỗi)', (await run1(wr, async () => { throw new Error('socket hang up'); }))[0].ok === false);
  const refused = Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
  t('op GHI mà request chưa rời máy (ECONNREFUSED) → được rơi về', await rejects(run1(wr, async () => { throw refused; }), 'network'));
  const wtxt = await run1(wr, async () => reply('lỗi lạ', 500));
  t('op GHI nhận non-JSON → trả text thô, không rơi về (không gửi lại)', wtxt[0].ok && wtxt[0].json === null && wtxt[0].text === 'lỗi lạ');
  const leak = await run1(wr, async () => { throw new Error(`boom ${TOKEN} boom`); });
  t('token bị che khỏi thông điệp lỗi', leak[0].ok === false && !leak[0].error.includes(TOKEN) && leak[0].error.includes('[redacted]'));
  t('upload qua direct: multipart + Bearer', await (async () => { let got; await new DirectRunner(DCFG, TOKEN, { fetchFn: async (u, i) => { got = { u: String(u), a: i.headers.authorization, fd: i.body instanceof FormData }; return reply({ error: false }); } }).run([{ api: 'pim', upload: { b64: Buffer.from('abc').toString('base64'), name: 'a.png', mime: 'image/png', allowedExtensions: 'png' } }]); return got.u === 'https://api.test/pim/s3/cdnput' && got.a === `Bearer ${TOKEN}` && got.fd; })());

  // AutoSession: tab giả
  const mkTab = ({ tokenFails = false } = {}) => {
    const log = { evals: [], tokenReads: 0 };
    const client = { pageId: null, log,
      async connect() {}, async close() {},
      async callTool(name, args) {
        if (name === 'list_pages') return { structuredContent: { pages: [{ id: 7, url: 'https://mdm.test/x' }] } };
        if (name === 'select_page') return {};
        const fn = args.function;
        const wrap = (o) => ({ content: [{ type: 'text', text: '```json\n' + JSON.stringify(o) + '\n```' }] });
        if (fn.includes('__mdmToken()') && fn.includes('{ token:')) { log.tokenReads++; return tokenFails ? { content: [{ type: 'text', text: `rác ${TOKEN} không phải json` }] } : wrap({ token: TOKEN }); }
        log.evals.push(fn);
        return wrap({ ok: true, results: [{ ok: true, status: 200, ms: 1, json: { error: false, object: ['tab'] } }] });
      } };
    return client;
  };
  const logs = [];
  const mk = (transport, fetchFn, tabOpts) => { const client = mkTab(tabOpts); return { client, s: new AutoSession(DCFG, { client, transport, fetchFn, log: (m) => logs.push(m) }) }; };

  let a = mk('auto', async () => reply({ error: false, object: ['direct'] }));
  await a.s.open();
  const r1 = await a.s.post('mdm', 'dataobject/getinfor', {});
  t('auto: đọc token 1 lần, đi direct, không lái tab', a.s.mode === 'direct' && r1.object[0] === 'direct' && a.client.log.tokenReads === 1 && a.client.log.evals.length === 1 /* chỉ probe mở phiên */);

  let n = 0;
  a = mk('auto', async () => (n++ === 0 ? reply('', 401) : reply({ error: false, object: ['direct'] })));
  await a.s.open();
  const r2 = await a.s.post('mdm', 'dataobject/getinfor', {});
  const r3 = await a.s.post('mdm', 'dataobject/getinfor', {});
  t('auto: direct bị 401 → rơi về tab, giữ tab cho phần còn lại', r2.object[0] === 'tab' && r3.object[0] === 'tab' && a.s.mode === 'tab' && a.s.fallbacks[0] === 'auth' && n === 1 && a.s.direct === null);
  t('rơi về không mở thêm kết nối MCP (cùng client)', a.client.log.tokenReads === 1);

  a = mk('auto', async () => reply({}), { tokenFails: true });
  await a.s.open();
  const r4 = await a.s.post('mdm', 'dataobject/getinfor', {});
  t('auto: không đọc được token → chạy bằng tab', a.s.mode === 'tab' && r4.object[0] === 'tab' && a.s.fallbacks[0] === 'no-token');
  t('lỗi đọc token không làm lộ token ra log', !logs.join('\n').includes(TOKEN));

  let called = 0;
  a = mk('tab', async () => { called++; return reply({}); });
  await a.s.open();
  await a.s.post('mdm', 'dataobject/getinfor', {});
  t('transport=tab: không bao giờ đọc token, không gọi HTTP thẳng', a.client.log.tokenReads === 0 && called === 0 && a.s.mode === 'tab');
  t('transport lạ → exit 2', (() => { try { new AutoSession(DCFG, { client: mkTab(), transport: 'xyz' }); return false; } catch (e) { return e.exitCode === 2; } })());

  let c = 0;
  a = mk('auto', async () => { c++; return reply({ error: false, object: [] }); });
  a.s.listCache = new Map();
  await a.s.open();
  await a.s.run([{ api: 'mdm', path: 'dataobject/getlist', body: { q: 1 } }]);
  await a.s.run([{ api: 'mdm', path: 'dataobject/getlist', body: { q: 1 } }]);
  t('cache danh sách tĩnh cũng áp cho đường direct', c === 1);
}

console.log('\n# Cache token trong Keychain');
{
  const DCFG = { ...CFG, uiOrigin: 'https://mdm.test', apiBase: 'https://api.test/mdm/', pimApiBase: 'https://api.test/pim/' };
  const TAB_TOKEN = 'TAB-' + 'x'.repeat(40);
  const OLD = 'OLD-' + 'y'.repeat(40);
  const reply = (obj, status = 200) => new Response(typeof obj === 'string' ? obj : JSON.stringify(obj), { status });
  const memCache = (initial) => { const c = { enabled: true, value: initial, sets: [], clears: 0,
    async get() { return c.value; }, async set(v) { c.sets.push(v); c.value = v; return true; }, async clear() { c.clears++; c.value = null; return true; } }; return c; };
  const mkTab = () => {
    const log = { connects: 0, lists: 0, tokenReads: 0, evals: 0 };
    return { pageId: null, log,
      async connect() { log.connects++; }, async close() {},
      async callTool(name, args) {
        if (name === 'list_pages') { log.lists++; return { structuredContent: { pages: [{ id: 7, url: 'https://mdm.test/x' }] } }; }
        if (name === 'select_page') return {};
        const wrap = (o) => ({ content: [{ type: 'text', text: '```json\n' + JSON.stringify(o) + '\n```' }] });
        if (args.function.includes('{ token:')) { log.tokenReads++; return wrap({ token: TAB_TOKEN }); }
        log.evals++;
        return wrap({ ok: true, results: [{ ok: true, status: 200, ms: 1, json: { error: false, object: ['tab'] } }] });
      } };
  };
  const quiet = () => {};
  const authBy = (good) => async (u, i) => (i.headers.authorization === `Bearer ${good}` ? reply({ error: false, object: ['direct'] }) : reply('', 401));
  const mk = (cache, fetchFn, transport = 'auto') => { const client = mkTab(); return { client, s: new AutoSession(DCFG, { client, transport, fetchFn, tokenCache: cache, log: quiet }) }; };

  let cache = memCache(TAB_TOKEN);
  let a = mk(cache, authBy(TAB_TOKEN));
  await a.s.open();
  const r1 = await a.s.post('mdm', 'dataobject/getinfor', {});
  t('cache có token → không nối Chrome, đi direct', r1.object[0] === 'direct' && a.client.log.connects === 0 && a.client.log.lists === 0 && a.s.tokenSource === 'cache' && a.s.mode === 'direct');

  cache = memCache(null);
  a = mk(cache, authBy(TAB_TOKEN));
  await a.s.open();
  await a.s.post('mdm', 'dataobject/getinfor', {});
  t('cache rỗng → đọc token từ tab rồi cất vào cache', a.client.log.tokenReads === 1 && cache.sets.length === 1 && cache.sets[0] === TAB_TOKEN && a.s.tokenSource === 'tab');

  cache = memCache(OLD);
  a = mk(cache, authBy(TAB_TOKEN));
  await a.s.open();
  const r3 = await a.s.post('mdm', 'dataobject/update', {});
  t('cache bị 401 (cả op ghi) → xoá cache, lấy token mới từ tab, chạy lại đúng op bằng direct', r3.object[0] === 'direct' && cache.clears === 1 && cache.value === TAB_TOKEN && a.s.tokenSource === 'tab' && a.s.mode === 'direct' && a.client.log.tokenReads === 1 && a.client.log.evals === 1 /* chỉ probe */ && a.s.fallbacks.join() === 'auth');
  const r3b = await a.s.post('mdm', 'dataobject/getinfor', {});
  t('sau khi làm mới, op tiếp theo vẫn direct', r3b.object[0] === 'direct');

  cache = memCache(TAB_TOKEN);
  a = mk(cache, async () => reply('', 401));
  await a.s.open();
  const r4 = await a.s.post('mdm', 'dataobject/getinfor', {});
  t('token tab trùng token cache cũng bị 401 → lái tab, cache đã xoá', r4.object[0] === 'tab' && a.s.mode === 'tab' && cache.value === null);

  cache = memCache(OLD);
  let k = 0;
  a = mk(cache, async (u, i) => (i.headers.authorization === `Bearer ${OLD}` ? reply('', 401) : (k++ === 0 ? reply('<html>x</html>', 200) : reply({ error: false }))));
  await a.s.open();
  const r6 = await a.s.post('mdm', 'dataobject/getinfor', {});
  t('cache 401 → token mới từ tab, op chạy lại dính lỗi non-json → lái tab nhưng GIỮ token mới trong cache', r6.object[0] === 'tab' && cache.value === TAB_TOKEN && a.s.fallbacks.join() === 'auth,non-json');

  cache = memCache(TAB_TOKEN);
  a = mk(cache, async () => reply('<html>502</html>', 502));
  await a.s.open();
  const r5 = await a.s.post('mdm', 'dataobject/getinfor', {});
  t('cache + lỗi không phải quyền (HTML 502) → mở tab, lái tab, KHÔNG xoá cache', r5.object[0] === 'tab' && a.client.log.lists === 1 && cache.clears === 0 && cache.value === TAB_TOKEN);

  cache = memCache(OLD);
  a = mk(cache, async () => reply({}), 'tab');
  await a.s.open();
  await a.s.post('mdm', 'dataobject/getinfor', {});
  t('transport=tab: không đọc, không ghi cache', cache.sets.length === 0 && cache.clears === 0 && a.client.log.tokenReads === 0);

  // KeychainTokenCache với `security` giả
  const calls = [];
  let store = null;
  let mode = 'ok';
  const fakeExec = (bin, args, opts, cb) => {
    const call = { bin, args, opts, stdin: '' };
    calls.push(call);
    const child = { stdin: { on() {}, end(v) { call.stdin = v; const m = v.match(/-w "([0-9a-f]+)"/); if (m) store = m[1]; setTimeout(() => cb(null, ''), 0); } } };
    if (args[0] === '-i') return child;
    setTimeout(() => {
      if (mode === 'locked') return cb(Object.assign(new Error('timeout'), { killed: true }), '');
      if (args[0] === 'find-generic-password') return store ? cb(null, store + '\n') : cb(new Error('not found'), '');
      if (args[0] === 'delete-generic-password') { const had = !!store; store = null; return had ? cb(null, '') : cb(new Error('not found'), ''); }
      cb(new Error('lệnh lạ'), '');
    }, 0);
    return child;
  };
  let clock = 1_000_000;
  const kc = new KeychainTokenCache({ account: 'api.test', execFileFn: fakeExec, now: () => clock });
  t('Keychain: ghi xong đọc lại đúng token', (await kc.set(TAB_TOKEN)) && (await kc.get()) === TAB_TOKEN);
  t('Keychain: token KHÔNG nằm trên dòng lệnh (chỉ qua stdin, dạng hex)', calls.every((c) => !c.args.join(' ').includes(TAB_TOKEN)) && !calls.find((c) => c.args[0] === '-i').stdin.includes(TAB_TOKEN));
  t('Keychain: mọi lệnh security có timeout', calls.every((c) => c.opts.timeout > 0));
  clock += TOKEN_MAX_AGE_MS + 1;
  t('Keychain: quá 30 ngày → coi như không có và xoá', (await kc.get()) === null && store === null);
  clock = 1_000_000;
  await kc.set(TAB_TOKEN);
  mode = 'locked';
  t('Keychain khoá/treo → null, không ném', (await kc.get()) === null);
  mode = 'ok';
  store = 'zz-không-phải-hex';
  t('Keychain: dữ liệu hỏng → null', (await kc.get()) === null);
  t('decodeEntry(encodeEntry) giữ nguyên', decodeEntry(encodeEntry(TAB_TOKEN, 5)).token === TAB_TOKEN);
  t('tokenCacheFor: off → không cache; ngoài macOS → không cache; darwin → Keychain theo host API',
    !tokenCacheFor(DCFG, 'off', 'darwin').enabled && !tokenCacheFor(DCFG, 'on', 'linux').enabled && tokenCacheFor(DCFG, 'on', 'darwin').account === 'api.test');
  t('tokenCacheFor: giá trị lạ → exit 2', throwsCode(() => tokenCacheFor(DCFG, 'maybe', 'darwin'), 2));
}

console.log('\n# CLI');
{
  const a = parseArgs(['write', '--screen', 'brand', '--set', 'seo_title=A=B', '--set', 'seo_keyword=k', '--live']);
  t('parseArgs: --set lặp, --live bool', a._[0] === 'write' && a.set.length === 2 && a.live === true);
  t('collectEdits: giữ dấu = trong giá trị', collectEdits(['seo_title=A=B']).seo_title === 'A=B');
  t('collectEdits: khai trùng field → dừng', throwsCode(() => collectEdits(['a=1', 'a=2']), 2));
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
