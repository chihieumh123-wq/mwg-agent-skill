#!/usr/bin/env node
/**
 * run-datastudio-cli.mjs — đọc/sửa report Data Studio (Looker Studio) bằng RPC nội bộ,
 * chạy fetch trong 1 tab datastudio.google.com đúng profile Chrome (không bấm UI).
 *
 *   node run-datastudio-cli.mjs read      --report <id|url> [--task-dir tasks/<t>]
 *   node run-datastudio-cli.mjs fields    --report <id> --datasource <ref> [--grep text]
 *   node run-datastudio-cli.mjs apply     --report <id> --plan plan.json --task-dir tasks/<t> [--live]
 *   node run-datastudio-cli.mjs render    --report <id> [--page <id|tên>] [--wait 12] [--screenshot file.png]
 *   node run-datastudio-cli.mjs revisions --report <id>
 *   node run-datastudio-cli.mjs restore   --report <id> --revision <n>
 *
 * Guard: từ chối ghi khi report đang mở Edit ở bất kỳ tab nào (editor tự lưu đè thay đổi API).
 * apply --live: backup getReport ra task-dir + tạo named revision TRƯỚC khi ghi; lỗi giữa chừng thì
 * in số revision để restore. Exit: 0 ok · 1 lỗi · 2 sai tham số · 3 guard chặn · 4 ghi dở dang.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CliError, DS_ORIGIN, McpClient, NEUTRAL_URL, acquireSharedTab, editorTabsFor, evaluate, listPages, sleep,
} from './datastudio-mcp-transport.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE_FILES = ['datastudio-page-runtime.js', 'datastudio-page-ops.js', 'datastudio-page-datasource-ops.js'];
const CHUNK = 400000;
const RENDER_ERRORS = ['Data Set Configuration Error', 'System Error', 'Invalid metric', 'Invalid dimension', 'Chart configuration incomplete', 'cannot connect to your data set', "Couldn't access"];

export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const a = { _cmd: cmd };
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i];
    if (!t.startsWith('--')) throw new CliError(`tham số lạ: ${t}`, 2);
    const k = t.slice(2);
    if (['live', 'no-checkpoint', 'json', 'close-tab'].includes(k)) a[k] = true;
    else { a[k] = rest[i + 1]; i++; }
  }
  return a;
}

/** Nhận ID trần hoặc URL report (…/reporting/<uuid>/page/…). */
export function reportIdFrom(v) {
  const m = String(v || '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (!m) throw new CliError(`--report "${v}" không chứa report ID`, 2);
  return m[0].toLowerCase();
}

/** Profile Chrome: `--profile`, không có thì env DATASTUDIO_CHROME_PROFILE. */
async function profileFromConfig(a) {
  const p = a.profile || process.env.DATASTUDIO_CHROME_PROFILE;
  if (!p) throw new CliError('thiếu profile Chrome — truyền --profile <key chrome-profile> hoặc đặt env DATASTUDIO_CHROME_PROFILE', 2);
  return p;
}

export function pageSource() {
  return PAGE_FILES.map((f) => fs.readFileSync(path.join(HERE, f), 'utf8')).join('\n;\n');
}

/** Function chạy trong tab: nạp runtime rồi chạy `tail` (có biến RT). */
export function inPage(tail) {
  return `async () => {\n${pageSource()}\n;\nconst RT = window.__DSRT;\ntry {\n${tail}\n} catch (e) { return { __error: e.message, rpc: e.rpc || null }; }\n}`;
}

async function run(client, tail, timeoutMs) {
  const out = await evaluate(client, inPage(tail), timeoutMs);
  if (out && out.__error) throw new CliError(`trong tab: ${out.__error}`);
  return out;
}

const J = (v) => JSON.stringify(v);
/** yymmdd-hhmm giờ máy (đặt tên file backup/kết quả). */
export const stamp = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

/** Kéo JSON lớn về Node theo khúc (getReport ~1 MB) rồi ghi file. */
async function pullToFile(client, makeTail, file) {
  const len = await run(client, `return RT.stash('pull', await (async () => { ${makeTail} })());`, 180000);
  let s = '';
  for (let i = 0; i * CHUNK < len; i++) s += await run(client, `return RT.chunk('pull', ${i}, ${CHUNK});`, 60000);
  await run(client, `RT.unstash('pull'); return 1;`);
  if (s.length !== len) throw new CliError(`kéo dữ liệu thiếu: ${s.length}/${len} ký tự`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, s);
  JSON.parse(fs.readFileSync(file, 'utf8')); // đọc lại phải parse được
  return file;
}

async function guardNoEditor(client, reportId) {
  const pages = await listPages(client);
  const ed = editorTabsFor(pages, reportId);
  if (ed.length) throw new CliError(`report đang mở chế độ Edit ở ${ed.length} tab — editor sẽ lưu đè thay đổi. Bấm View hoặc đóng tab đó rồi chạy lại.`, 3);
}

const SUMMARY_TAIL = (rid) => `
const rc = await RT.getReport(${J(rid)});
const cat = await RT.catalog(rc);
const dsName = (id) => (cat.find((c) => c.id === id) || {}).name || id;
const pages = rc.navigationInfo.navItems.filter((n) => n.page).map((n) => {
  const pe = rc.page.find((p) => p.pageId === n.page.pageId) || { page: { componentConfig: [] } };
  return { pageId: n.page.pageId, name: n.page.displayName, components: pe.page.componentConfig.map((c) => {
    const cp = (c.propertyConfig || {}).componentProperty || {};
    const names = (k) => ((cp[k] || {}).labeledConcepts || []).flatMap((l) => l.value.conceptNames);
    const dsf = cp.dataset ? ((cat.find((x) => x.id === cp.dataset.datasetId) || {}).fields || []) : [];
    const src = (n) => { const d = (c.conceptDefs || []).find((x) => x.name === n); const t = d && d.queryTimeTransformation.dataTransformation;
      if (!t) return n; if (t.textFormula) return t.textFormula; const f = dsf.find((x) => x.name === t.sourceFieldName); return f ? f.label : t.sourceFieldName; };
    const a = (c.attributeConfig || {}).componentAttribute || {};
    return { id: c.componentId, type: c.type, dataset: cp.dataset ? dsName(cp.dataset.datasetId) : undefined,
      dims: names('dimensions').map(src), metrics: names('metrics').map(src), filters: cp.filters && cp.filters.length ? cp.filters : undefined,
      pos: [a.top, a.left, a.width, a.height].map((x) => Math.round(x || 0)).join(',') };
  }) };
});
const filters = ((rc.report.resource.filter || {}).entry || []).map((e) => ({ key: e.key, name: e.value.name, datasource: dsName(e.value.datasourceId) }));
return { name: (rc.shareable || {}).name, version: rc.version, pages,
  datasources: cat.map((c) => ({ kind: c.kind, ref: c.alias || c.id, name: c.name, fields: c.fields.length, error: c.error })), filters };`;

/** Phần render chạy khi tab đã ở trang report: đợi vẽ, gom lỗi từng chart, chụp ảnh nếu cần. */
async function renderOnPage(client, a) {
  await sleep(Number(a.wait || 12) * 1000);
  // Lỗi theo từng chart: mỗi chart là div.lego-component có class = componentId. Line/bar/pie vẽ trong
  // iframe khác origin nên DOM không thấy số — xem bằng --screenshot.
  const out = await evaluate(client, `() => { const t = document.body.innerText; const ERR = ${J(RENDER_ERRORS)};
    const errs = ERR.map((e) => [e, t.split(e).length - 1]).filter((x) => x[1] > 0);
    const charts = [...document.querySelectorAll('div.lego-component')].map((el) => {
      const id = [...el.classList].find((c) => c.startsWith('cd-')); const tx = el.innerText || '';
      const err = ERR.find((e) => tx.includes(e));
      return { id, type: [...el.classList].find((c) => /^(simple-|kpi-|dimension-|generic-)/.test(c)), status: err ? 'ERROR: ' + err : (el.querySelector('iframe') ? 'iframe (xem screenshot)' : (tx.trim() ? 'ok' : 'trống')) };
    }).filter((c) => c.id);
    return { url: location.href.split('#')[0].replace(/\\/edit$/, ''), editMode: /\\/edit(?:[?#]|$)/.test(location.href), errors: errs, charts, text: t.slice(0, ${Number(a.chars || 6000)}) }; }`, 60000);
  if (a.screenshot) {
    const file = path.resolve(a.screenshot);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await client.callTool('take_screenshot', { filePath: file, fullPage: true, format: 'png' }, 90000);
    out.screenshot = file;
  }
  console.log(J(out));
  return out.errors.length ? 1 : 0;
}

const COMMANDS = {
  async read(client, a, rid) {
    const sum = await run(client, SUMMARY_TAIL(rid), 300000);
    if (a['task-dir']) {
      const f = path.join(a['task-dir'], 'data', 'raw', 'datastudio', `${stamp()}-${rid.slice(0, 8)}-report.json`);
      await pullToFile(client, `return await RT.getReport(${J(rid)});`, f);
      sum.backup = f;
    }
    console.log(J(sum));
    return 0;
  },

  async fields(client, a, rid) {
    if (!a.datasource) throw new CliError('thiếu --datasource', 2);
    const out = await run(client, `const rc = await RT.getReport(${J(rid)}); const cat = await RT.catalog(rc);
      const ds = RT.resolveDataset(cat, ${J(a.datasource)}); const g = ${J((a.grep || '').toLowerCase())};
      return { name: ds.name, ref: ds.alias || ds.id, kind: ds.kind, fields: ds.fields.filter((f) => !g || (f.label + ' ' + f.name).toLowerCase().includes(g)) };`, 120000);
    console.log(J(out));
    return 0;
  },

  async apply(client, a, rid) {
    if (!a.plan) throw new CliError('thiếu --plan plan.json', 2);
    if (!a['task-dir']) throw new CliError('thiếu --task-dir (nơi lưu backup và kết quả)', 2);
    const plan = JSON.parse(fs.readFileSync(a.plan, 'utf8'));
    const all = Array.isArray(plan) ? plan : plan.ops;
    if (!Array.isArray(all) || !all.length) throw new CliError('plan phải là mảng thao tác hoặc {ops:[...]}', 2);
    // --from N: chạy tiếp plan dở dang từ thao tác thứ N (đánh số từ 0 như output).
    const from = Number(a.from || 0);
    if (!Number.isInteger(from) || from < 0 || from >= all.length) throw new CliError(`--from ${a.from} ngoài khoảng 0..${all.length - 1}`, 2);
    const ops = all.slice(from);
    const live = !!a.live;
    const ts = stamp();
    const outDir = path.join(a['task-dir'], 'data', 'processed', 'datastudio');
    let checkpoint = null;
    if (live) {
      await guardNoEditor(client, rid);
      const f = path.join(a['task-dir'], 'data', 'raw', 'datastudio', `${ts}-${rid.slice(0, 8)}-before.json`);
      await pullToFile(client, `return await RT.getReport(${J(rid)});`, f);
      console.error(`backup: ${f}`);
      if (!a['no-checkpoint']) {
        checkpoint = await run(client, `await RT.rpc('createNamedRevision', { reportId: ${J(rid)}, name: ${J(`AI truoc khi ghi ${ts}`)}, aiGenerated: false });
          const r = await RT.rpc('getRevisions', { entityId: ${J(rid)}, entityType: 1 }); return r.revisionInfo[0].revisionNumber;`, 60000);
        console.error(`checkpoint revision: ${checkpoint}`);
      }
    }
    const res = await run(client, `return await RT.applyPlan(${J(rid)}, ${J(ops)}, ${J(live)});`, 600000);
    res.checkpoint = checkpoint;
    for (const r of res.results) r.i += from;
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `${ts}-${rid.slice(0, 8)}-apply-${live ? 'live' : 'dry'}.json`);
    fs.writeFileSync(outFile, JSON.stringify(res, null, 2));
    const extra = (r) => ['pageId', 'componentId', 'filterKey', 'blendKey', 'datasourceId', 'fieldName', 'columns'].filter((k) => r[k]).map((k) => `${k}=${r[k]}`).concat(r.rotated ? [`chart làm mới: ${r.rotated.join(', ')}`] : []).join(' ');
    for (const r of res.results) console.log(`${String(r.i).padStart(2)} ${r.status.padEnd(11)} ${r.op}${r.reason ? ' — ' + r.reason : ''} ${extra(r)}`);
    const ok = res.results.length === ops.length && res.results.every((r) => r.status === (live ? 'DONE' : 'DRY'));
    console.log(J({ ok, live, from, done: res.results.filter((r) => r.status === 'DONE').length, total: ops.length, checkpoint, result: outFile }));
    if (ok) return 0;
    const wrote = res.results.some((r) => r.status === 'DONE' || r.status === 'VERIFY_FAIL');
    const failed = res.results.find((r) => r.status !== "DONE" && r.status !== "DRY");
    if (live && wrote && checkpoint) console.error(`GHI DỞ DANG ở thao tác ${failed ? failed.i : "?"}. Sửa plan rồi chạy tiếp bằng --from ${failed ? failed.i : "N"}, hoặc quay lại: node ${path.relative(process.cwd(), fileURLToPath(import.meta.url))} restore --report ${rid} --revision ${checkpoint}`);
    return live && wrote ? 4 : 1;
  },

  async render(client, a, rid) {
    let pageId = a.page || '';
    if (pageId && !/^(p_|\d)/.test(pageId)) {
      pageId = await run(client, `const rc = await RT.getReport(${J(rid)}); const n = rc.navigationInfo.navItems.filter((x) => x.page && x.page.displayName.toLowerCase() === ${J(pageId.toLowerCase())}); if (n.length !== 1) throw new Error('page khớp ' + n.length); return n[0].page.pageId;`);
    }
    const url = `${DS_ORIGIN}/reporting/${rid}${pageId ? '/page/' + pageId : ''}`;
    // Tab nền dùng chung: luôn trả tab về URL trung lập kèm marker, kể cả khi render lỗi giữa chừng,
    // để lượt sau còn nhận lại được.
    try {
      await client.callTool('navigate_page', { type: 'url', url }, 90000);
      return await renderOnPage(client, a);
    } finally {
      try { await client.callTool('navigate_page', { type: 'url', url: client.homeUrl || NEUTRAL_URL }, 60000); } catch { /* lượt sau tự mở tab mới */ }
    }
  },

  async revisions(client, a, rid) {
    const out = await run(client, `const r = await RT.rpc('getRevisions', { entityId: ${J(rid)}, entityType: 1 });
      return r.revisionInfo.slice(0, ${Number(a.limit || 15)}).map((x) => ({ revision: x.revisionNumber, at: new Date(Number(x.createdTimestamp) / 1000).toISOString(), name: (x.revisionAnnotation || {}).name || '' }));`);
    console.log(J(out));
    return 0;
  },

  async restore(client, a, rid) {
    if (!a.revision) throw new CliError('thiếu --revision', 2);
    await guardNoEditor(client, rid);
    const out = await run(client, `await RT.rpc('createNamedRevision', { reportId: ${J(rid)}, name: ${J(`AI truoc khi restore ve ${a.revision} ${stamp()}`)}, aiGenerated: false });
      const before = (await RT.rpc('getRevisions', { entityId: ${J(rid)}, entityType: 1 })).revisionInfo[0].revisionNumber;
      await RT.rpc('restoreRevision', { entityId: ${J(rid)}, entityType: 1, revisionNumber: ${J(String(a.revision))} });
      const rc = await RT.getReport(${J(rid)});
      return { restoredTo: ${J(String(a.revision))}, undoRevision: before, pages: rc.navigationInfo.navItems.filter((n) => n.page).map((n) => n.page.displayName) };`);
    console.log(J(out));
    return 0;
  },
};

export async function main(argv, deps = {}) {
  const a = parseArgs(argv);
  if (!COMMANDS[a._cmd]) throw new CliError(`lệnh "${a._cmd || ''}" không có. Dùng: ${Object.keys(COMMANDS).join(' | ')}`, 2);
  const rid = reportIdFrom(a.report);
  const profile = await profileFromConfig(a);
  const client = deps.client || new McpClient({ roots: [process.cwd()] });
  let tab = null;
  try {
    await client.connect();
    // Tab nền dùng chung: bám lại tab lượt trước để lại, chỉ mở tab mới khi chưa có hoặc tab hỏng.
    tab = await acquireSharedTab(client, { profile });
    client.homeUrl = tab.homeUrl;
    console.error(tab.reused ? 'tab Data Studio: dùng lại tab nền' : 'tab Data Studio: mở tab nền mới (để lại cho lượt sau)');
    if (!tab.reused) await sleep(1500);
    return await COMMANDS[a._cmd](client, a, rid);
  } finally {
    // Giữ tab cho lượt sau; --close-tab khi muốn dọn hẳn.
    if (tab && a['close-tab']) { try { await client.callTool('close_page', { pageId: tab.pageId }, 15000); } catch { /* tab có thể đã đóng */ } }
    await client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => { console.error('LỖI:', err.message); process.exit(err.exitCode || 1); },
  );
}
