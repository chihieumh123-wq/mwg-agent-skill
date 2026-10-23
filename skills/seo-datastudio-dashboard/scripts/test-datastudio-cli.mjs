#!/usr/bin/env node
/**
 * test-datastudio-cli.mjs — test logic thuần, không cần Chrome:
 *   node --test .claude/skills/seo-datastudio-dashboard/scripts/test-datastudio-cli.mjs
 *
 * Nạp 3 file page-runtime vào vm với RT.rpc giả (report + data source dựng tay), rồi kiểm
 * builder, enum và applyPlan dry-run. Các giá trị kỳ vọng là những thứ đã đo thật trên report thử
 * 03/10/2026 (join enum, line chart không có row, dropdown cần datasourceId + row 5001...).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { pageSource, parseArgs, reportIdFrom, stamp } from './run-datastudio-cli.mjs';
import { McpClient, editorTabsFor, parseEvaluateResult, urlHasMarker } from './datastudio-mcp-transport.mjs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import readline from 'node:readline';

const GA = 'aaaaaaaa-0000-0000-0000-000000000001';
const GSC = 'aaaaaaaa-0000-0000-0000-000000000002';
const field = (name, label, extra = {}) => ({ field: { ns: 't0', name }, outputName: label, columnType: 1, enabled: true, dataType: 0, ...extra });

function fakeReport() {
  return {
    version: '100',
    chartCondition: [],
    navigationInfo: { navItems: [{ page: { pageId: 'p_home', displayName: 'Overview' } }] },
    page: [{ pageId: 'p_home', version: '5', chartCondition: [], page: { componentConfig: [], groupConfig: [], conceptDefs: [], propertyConfig: { pageProperty: { filters: [] } } } }],
    report: { componentConfig: [], conceptDefs: [], propertyConfig: {}, attributeConfig: {}, resource: {
      datasourceAlias: [{ datasourceId: GA, alias: 'ds0' }, { datasourceId: GSC, alias: 'ds1' }],
      filter: { entry: [] }, dataViewResource: { entry: [] }, theme: fakeTheme() } },
  };
}

// Đúng hình dạng đọc từ report thật 20/10/2026: content là cây entry/key/value, themeSeriesColor là danh sách map.
const sv = (x) => ({ strValue: x });
const mapOf = (obj) => ({ mapValue: { entry: Object.entries(obj).map(([key, value]) => ({ key, value })) } });
function fakeTheme() {
  return { value: [mapOf({ id: sv('themeX'), content: mapOf({
    themeBorderColor: mapOf({ color: sv('#000000') }),
    themeBorderRadius: { int64Value: '4' },
    themeTableEvenRowColor: mapOf({ color: sv('transparent'), opacity: { int64Value: '0' } }),
    themeTextboxHideBorder: { boolValue: true },
    themeSeriesColor: { value: [0, 1, 2].map((i) => mapOf({ color: sv(`#00000${i}`), seriesRef: mapOf({ index: { int64Value: String(i) } }) })) },
  }) })] };
}

const DS = {
  [GA]: { name: 'Site GA4', fields: [
    field('_sessionDefaultChannelGroup_', 'Session default channel group', { outputSemanticInfo: { semanticConfig: [{ semanticType: 32 }] } }),
    field('_date_', 'Date', { dataType: 8 }),
    field('_sessions_', 'Sessions', { conceptType: 1, dataType: 3, outputSemanticInfo: { semanticConfig: [{ semanticType: 33 }] } }),
    field('datastudio_record_count_system_field_id_1', 'Record Count', { conceptType: 1, dataType: 3, textFormula: 'COUNT(1)' }),
  ] },
  [GSC]: { name: 'Search Console', fields: [field('_DATE_', 'Date', { dataType: 8 }), field('_URL_CLICKS_', 'Url Clicks', { conceptType: 1, dataType: 3 })] },
};

function loadRuntime() {
  const writes = [];
  const ctx = { console, document: { cookie: 'RAP_XSRF_TOKEN=x', documentElement: { innerHTML: '' } } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(pageSource(), ctx);
  const RT = ctx.__DSRT;
  RT.rpc = async (ep, body) => {
    if (ep === 'getReport') return { reportConfig: fakeReport() };
    if (ep === 'getBlockDatasource') {
      const d = DS[body.datasourceId];
      return { published: { datasourceBlock: { name: d.name, fields: d.fields }, blocks: [] } };
    }
    writes.push(ep);
    return {};
  };
  return { RT, writes };
}

test('parseArgs + reportIdFrom nhận cả URL', () => {
  const a = parseArgs(['apply', '--report', 'https://datastudio.google.com/reporting/1A2B3C4D-0000-4000-8000-00000000ABCD/page/x', '--live']);
  assert.equal(a._cmd, 'apply');
  assert.equal(a.live, true);
  assert.equal(reportIdFrom(a.report), '1a2b3c4d-0000-4000-8000-00000000abcd');
  assert.throws(() => reportIdFrom('abc'), /không chứa report ID/);
  assert.match(stamp(new Date(2026, 9, 3, 9, 5)), /^261003-0905$/);
});

test('editorTabsFor chỉ bắt tab /edit của đúng report', () => {
  const rid = '1a2b3c4d-0000-4000-8000-00000000abcd';
  const pages = [
    { id: 1, url: `https://datastudio.google.com/reporting/${rid}/page/p_x/edit` },
    { id: 2, url: `https://datastudio.google.com/reporting/${rid}/page/p_x` },
    { id: 3, url: `https://datastudio.google.com/u/0/reporting/${rid}/edit?x=1` },
    { id: 4, url: 'https://datastudio.google.com/reporting/other/page/p/edit' },
  ];
  assert.deepEqual(editorTabsFor(pages, rid).map((p) => p.id), [1, 3]);
  assert.ok(urlHasMarker('https://x/#cdp-profile=a&cdp-open=ab12', 'cdp-open=ab12'));
  assert.ok(!urlHasMarker('https://x/#cdp-open=ab123', 'cdp-open=ab12'));
  assert.deepEqual(parseEvaluateResult({ content: [{ type: 'text', text: 'x\n```json\n{"a":1}\n```' }] }), { a: 1 });
});

test('enum join/filter đúng bản wire đo được', () => {
  const { RT } = loadRuntime();
  assert.deepEqual({ ...RT.JOIN }, { inner: 1, full: 2, left: 3, right: 4, cross: 101 });
  assert.equal(RT.aggCode('sum'), 6);
  assert.equal(RT.aggCode('count distinct'), 3);
  assert.throws(() => RT.aggCode('foo'), /không hỗ trợ/);
});

test('buildChart: line không có row, table có row, blend metric mặc định SUM', async () => {
  const { RT } = loadRuntime();
  const cat = await RT.catalog(fakeReport());
  const line = RT.buildChart(cat, { type: 'line', datasource: 'ds0', dimensions: ['Date'], metrics: ['Sessions'] });
  assert.equal(line.type, 'simple-linechart');
  assert.equal(line.propertyConfig.componentProperty.row, undefined);
  assert.equal(line.datasourceId, GA);
  const table = RT.buildChart(cat, { type: 'table', datasource: 'Site GA4', dimensions: ['session default channel group'], metrics: [{ field: 'Sessions', agg: 'avg', name: 'TB' }] });
  assert.equal(table.propertyConfig.componentProperty.row, 100);
  const met = table.conceptDefs[1].queryTimeTransformation;
  assert.equal(met.dataTransformation.sourceFieldName, '_sessions_');
  assert.equal(met.dataTransformation.aggregation, 1);
  assert.equal(met.displayTransformation.displayName, 'TB');
  const kpi = RT.buildChart(cat, { type: 'scorecard', datasource: 'ds0', metrics: [{ formula: 'SUM({Sessions}) / COUNT_DISTINCT({Date})' }] });
  assert.equal(kpi.conceptDefs[0].queryTimeTransformation.dataTransformation.textFormula, 'SUM(t0._sessions_) / COUNT_DISTINCT(t0._date_)');
  assert.throws(() => RT.buildChart(cat, { type: 'area', datasource: 'ds0', dimensions: ['Date'], metrics: ['Sessions'] }), /chưa hỗ trợ/);
  assert.throws(() => RT.buildChart(cat, { type: 'table', datasource: 'ds0', dimensions: ['Nope'], metrics: ['Sessions'] }), /khớp 0/);
  const blendCat = [{ kind: 'blend', id: 'dataViewResourceb', name: 'B', fields: [{ name: '_sessions__dv0', label: 'Sessions' }, { name: '_x__dv0', label: 'X' }] }];
  const onBlend = RT.buildChart(blendCat, { type: 'table', datasource: 'B', dimensions: ['X'], metrics: ['Sessions'] });
  assert.equal(onBlend.propertyConfig.componentProperty.dataset.datasetType, 2);
  assert.equal(onBlend.conceptDefs[1].queryTimeTransformation.dataTransformation.aggregation, 6);
  assert.equal(onBlend.datasourceId, undefined);
});

test('buildDropdown + buildFilter theo định dạng bắt từ UI', async () => {
  const { RT } = loadRuntime();
  const cat = await RT.catalog(fakeReport());
  const dd = RT.buildDropdown(cat, { datasource: 'ds0', field: 'Session default channel group' });
  assert.equal(dd.type, 'dimension-filter');
  assert.equal(dd.datasourceId, GA);
  assert.equal(dd.propertyConfig.componentProperty.row, 5001);
  const f = RT.buildFilter(cat, { datasource: 'ds0', field: 'Session default channel group', condition: 'contains', values: ['Search'] });
  assert.equal(f.value.filterDefinition.filterExpression.filterConditionType, 'PT');
  assert.equal(f.value.version, 3);
  assert.throws(() => RT.buildFilter(cat, { datasource: 'ds0', field: 'Date', condition: 'LIKE' }), /không hỗ trợ/);
});

test('applyPlan dry-run: không gọi RPC ghi, bước sau thấy page/field tạo ở bước trước', async () => {
  const { RT, writes } = loadRuntime();
  const ops = [
    { op: 'add-page', name: 'Mới' },
    { op: 'add-chart', page: 'Mới', type: 'table', datasource: 'ds0', dimensions: ['Date'], metrics: ['Sessions'] },
    { op: 'add-calculated-field', datasource: 'ds0', name: 'Sessions x2', formula: 'SUM({Sessions}) * 2' },
    { op: 'add-chart', page: 'Mới', type: 'scorecard', datasource: 'ds0', metrics: ['Sessions x2'] },
    { op: 'upsert-blend', name: 'GA x GSC', joinType: 'left outer', left: { datasource: 'ds0', dimensions: ['Date'], metrics: ['Sessions'] }, right: { datasource: 'ds1', dimensions: ['Date'], metrics: ['Url Clicks'] }, joinKeys: [['Date', 'Date']] },
    { op: 'add-chart', page: 'Mới', type: 'table', datasource: 'GA x GSC', dimensions: ['Date'], metrics: ['Sessions', 'Url Clicks'] },
    { op: 'upsert-filter', name: 'Organic', datasource: 'ds0', field: 'Session default channel group', values: ['Organic Search'] },
    { op: 'attach-filter', filter: 'Organic', page: 'Mới' },
    { op: 'rename-page', page: 'Mới', name: 'Mới 2' },
    { op: 'delete-page', page: 'Mới 2' },
  ];
  const res = await RT.applyPlan('rid', ops, false);
  assert.deepEqual(JSON.parse(JSON.stringify(res.results.map((r) => r.status))), ops.map(() => 'DRY'), JSON.stringify(res.results.find((r) => r.status !== 'DRY')));
  assert.equal(writes.length, 0, `dry-run không được gọi RPC ghi: ${writes.join(',')}`);
});

test('applyPlan dừng ở op sai và báo tên op hợp lệ', async () => {
  const { RT } = loadRuntime();
  const res = await RT.applyPlan('rid', [{ op: 'add-page', name: 'A' }, { op: 'bogus' }, { op: 'add-page', name: 'B' }], false);
  assert.equal(res.results.length, 2);
  assert.equal(res.results[1].status, 'ERROR');
  assert.match(res.results[1].reason, /add-chart/);
});

test('delete-page từ chối xoá page cuối, delete-field từ chối field gốc', async () => {
  const { RT } = loadRuntime();
  let res = await RT.applyPlan('rid', [{ op: 'delete-page', page: 'Overview' }], false);
  assert.match(res.results[0].reason, /page cuối/);
  res = await RT.applyPlan('rid', [{ op: 'delete-field', datasource: 'ds0', field: 'Sessions' }], false);
  assert.match(res.results[0].reason, /không phải calculated field/);
});

test('set-theme đổi màu, số, mảng series; dry-run không ghi; khoá lạ báo lỗi', async () => {
  const { RT, writes } = loadRuntime();
  const ok = await RT.applyPlan('rid', [{ op: 'set-theme', set: {
    themeBorderColor: '#DDE3EA', themeBorderRadius: 12, themeTextboxHideBorder: false,
    'themeTableEvenRowColor.opacity': 1, themeSeriesColor: ['#184F95', '#2A78D6'], 'themeSeriesColor[2].color': '#8C96A3' } }], false);
  assert.equal(ok.results[0].status, 'DRY', JSON.stringify(ok.results[0]));
  assert.equal(writes.length, 0);
  const bad = await RT.applyPlan('rid', [{ op: 'set-theme', set: { themeNoSuch: 'x' } }], false);
  assert.match(bad.results[0].reason, /không có khoá "themeNoSuch"/);
  const tooLong = await RT.applyPlan('rid', [{ op: 'set-theme', set: { themeSeriesColor: ['#1', '#2', '#3', '#4'] } }], false);
  assert.match(tooLong.results[0].reason, /không có phần tử 3/);
  const noLeaf = await RT.applyPlan('rid', [{ op: 'set-theme', set: { themeSeriesColor: [], themeSeriesColor0: 1 } }], false);
  assert.equal(noLeaf.results[0].status, 'ERROR');
});

test('update-components sửa nhiều component trong 1 lần ghi, id lạ báo lỗi', async () => {
  const { RT } = loadRuntime();
  const A = 'cd-aaaaaaaaaa', B = 'cd-bbbbbbbbbb';
  const setup = [
    { op: 'add-chart', page: 'Overview', componentId: A, type: 'table', datasource: 'ds0', dimensions: ['Date'], metrics: ['Sessions'] },
    { op: 'add-chart', page: 'Overview', componentId: B, type: 'table', datasource: 'ds0', dimensions: ['Date'], metrics: ['Sessions'] },
  ];
  const ok = await RT.applyPlan('rid', setup.concat([{ op: 'update-components', page: 'Overview', items: [
    { componentId: A, set: { 'attributeConfig.componentAttribute.left': 100, 'attributeConfig.componentAttribute.width': 500 } },
    { componentId: B, set: { 'attributeConfig.componentAttribute.top': 700 } } ] }]), false);
  assert.equal(ok.results[2].status, 'DRY', JSON.stringify(ok.results[2]));
  assert.deepEqual(JSON.parse(JSON.stringify(ok.results[2].writes)), ['updatePage']);
  const bad = await RT.applyPlan('rid', setup.concat([{ op: 'update-components', page: 'Overview', items: [{ componentId: 'cd-nope', set: {} }] }]), false);
  assert.match(bad.results[2].reason, /không có component cd-nope/);
});

test('McpClient nối hub qua socket khi hub đang chạy (không spawn chrome-devtools-mcp mới)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-hub-'));
  const prev = process.env.MWG_DEVTOOLS_HUB_DIR;
  process.env.MWG_DEVTOOLS_HUB_DIR = dir;
  const server = net.createServer((sock) => {
    readline.createInterface({ input: sock }).on('line', (line) => {
      const m = JSON.parse(line);
      if (m.id == null) return;
      const result = m.method === 'tools/list'
        ? { tools: [{ name: 'list_pages', inputSchema: { properties: {} } }] }
        : { ok: true };
      sock.write(`${JSON.stringify({ jsonrpc: '2.0', id: m.id, result })}\n`);
    });
  });
  await new Promise((r) => server.listen(path.join(dir, 'hub.sock'), r));
  const client = new McpClient({ hub: 'no-start' });
  try {
    await client.connect(5000);
    assert.equal(client.viaHub, true);
    assert.ok(client.schemas.list_pages);
    await client.close();
    assert.equal(client.exited, true);
  } finally {
    await client.close();
    server.close();
    if (prev === undefined) delete process.env.MWG_DEVTOOLS_HUB_DIR; else process.env.MWG_DEVTOOLS_HUB_DIR = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('McpClient tiêm spawnFn thì tắt hub (giữ đường test MCP giả)', () => {
  const c = new McpClient({ spawnFn: () => {} });
  assert.equal(c.hub, 'off');
});
