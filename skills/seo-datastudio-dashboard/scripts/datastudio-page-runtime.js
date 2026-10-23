/*
 * datastudio-page-runtime.js — chạy TRONG tab datastudio.google.com đã đăng nhập.
 * Node CLI nạp file này (kèm datastudio-page-ops.js) vào evaluate_script.
 *
 * Gồm: gọi RPC nội bộ (fetch + header X-RAP-XSRF-TOKEN), đọc report/data source,
 * phân giải tên field/data source, và dựng component chart/control từ spec gọn.
 * Không đọc, không trả cookie hay token: XSRF chỉ dùng làm header, không bao giờ return.
 *
 * File viết kiểu thuần (không import) để chạy được cả trong trang lẫn trong Node test
 * (test nạp bằng vm và gọi các hàm builder thuần).
 */
(function (root) {
  const RT = root.__DSRT || (root.__DSRT = {});

  // ---------- RPC ----------
  RT.appVersion = function () {
    try {
      const m = document.documentElement.innerHTML.match(/(\d{8}_\d{4})/);
      return m ? m[1] : '';
    } catch (e) { return ''; }
  };

  RT.rpc = async function (ep, body) {
    const cookie = document.cookie.split('; ').find((s) => s.startsWith('RAP_XSRF_TOKEN='));
    if (!cookie) throw new Error('không có cookie RAP_XSRF_TOKEN — tab chưa đăng nhập Data Studio?');
    const xsrf = decodeURIComponent(cookie.split('=')[1]);
    const v = RT._appVersion || (RT._appVersion = RT.appVersion());
    const url = '/' + ep + (v ? '?appVersion=' + v : '');
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-RAP-XSRF-TOKEN': xsrf }, body: JSON.stringify(body) });
    const t = await r.text();
    let j = null;
    try { j = JSON.parse(t.replace(/^\)\]\}'\s*/, '')); } catch (e) { /* để j = null */ }
    if (r.status !== 200) {
      const code = j && j.errorStatus ? j.errorStatus.code : '?';
      const err = new Error(`${ep} HTTP ${r.status} code ${code}`);
      err.rpc = { ep, status: r.status, code };
      throw err;
    }
    return j || {};
  };

  RT.getReport = async function (reportId) {
    const j = await RT.rpc('getReport', { reportId, includePages: true, updateViewedDate: false, updateFirestore: false, draftRequestMode: 0, mobileFriendlyView: false });
    if (!j.reportConfig) throw new Error('getReport không trả reportConfig — sai reportId hoặc không có quyền');
    return j.reportConfig;
  };

  RT.getDatasource = async function (datasourceId) {
    return RT.rpc('getBlockDatasource', { datasourceId });
  };

  // ---------- Chuyển dữ liệu lớn về Node theo khúc ----------
  RT.stash = function (key, value) {
    root.__DSRT_STASH = root.__DSRT_STASH || {};
    const s = typeof value === 'string' ? value : JSON.stringify(value);
    root.__DSRT_STASH[key] = s;
    return s.length;
  };
  RT.chunk = function (key, i, size) {
    const s = (root.__DSRT_STASH || {})[key] || '';
    return s.slice(i * size, (i + 1) * size);
  };
  RT.unstash = function (key) { if (root.__DSRT_STASH) delete root.__DSRT_STASH[key]; };

  // ---------- ID ----------
  RT.rid = function (n) {
    const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < (n || 10); i++) s += a[Math.floor(Math.random() * a.length)];
    return s;
  };
  RT.newId = {
    component: () => 'cd-' + RT.rid(10),
    concept: () => 'qt_' + RT.rid(10),
    page: () => 'p_' + RT.rid(10),
    filter: () => 'filter' + RT.rid(10),
    blend: () => 'dataViewResource' + RT.rid(10),
  };

  // ---------- Enum ----------
  RT.AGG = { NONE: 0, AVG: 1, COUNT: 2, COUNT_DISTINCT: 3, MAX: 4, MIN: 5, SUM: 6, AUTO: 7, FIRST: 8, LAST: 9, MEDIAN: 10 };
  // Enum wire lấy từ JS bundle (UNKNOWN 0 → chart blend báo System Error, đo 03/10/2026).
  RT.JOIN = { inner: 1, full: 2, left: 3, right: 4, cross: 101 };
  // Chỉ những loại đã ghi thật được (03/10/2026). Area chart trả 500 với cấu trúc tối giản — cần bắt mẫu UI trước khi thêm.
  RT.CHART_TYPE = {
    table: 'simple-table', scorecard: 'kpi-metric', line: 'simple-linechart', timeseries: 'simple-linechart',
    bar: 'simple-barchart', combo: 'simple-combochart', pie: 'simple-piechart',
  };
  // Server trả 400 nếu line chart có khoá `row`; bar/pie/combo/table thì nhận.
  RT.NO_ROW_TYPES = ['kpi-metric', 'simple-linechart'];
  RT.aggCode = function (a) {
    if (a === undefined || a === null || a === '') return undefined;
    if (typeof a === 'number') return a;
    const k = String(a).toUpperCase().replace(/[\s-]/g, '_');
    if (!(k in RT.AGG)) throw new Error(`aggregation "${a}" không hỗ trợ (dùng ${Object.keys(RT.AGG).join('/')})`);
    return RT.AGG[k];
  };

  // ---------- Danh mục data source / blend của report ----------
  /**
   * Trả [{kind:'datasource'|'blend', id, alias?, name, fields:[{name,label,dataType,isMetric,formula}]}].
   * Data source thường đọc qua getBlockDatasource (1 call/nguồn); blend đọc ngay trong report.
   */
  RT.catalog = async function (rc) {
    const out = [];
    for (const a of (rc.report.resource.datasourceAlias || [])) {
      const item = { kind: 'datasource', id: a.datasourceId, alias: a.alias, name: '', fields: [] };
      try {
        const d = await RT.getDatasource(a.datasourceId);
        const b = d.published && d.published.datasourceBlock;
        item.name = (b && b.name) || '';
        item.fields = RT.summarizeFields(b ? b.fields : []);
      } catch (e) { item.error = e.message; }
      out.push(item);
    }
    for (const e of ((rc.report.resource.dataViewResource || {}).entry || [])) {
      const b = e.value && e.value.blockDatasource && e.value.blockDatasource.datasourceBlock;
      out.push({ kind: 'blend', id: e.key, name: (b && b.name) || '', fields: RT.summarizeFields(b ? b.fields : []) });
    }
    return out;
  };

  RT.summarizeFields = function (fields) {
    return (fields || []).filter((f) => f && f.field && f.enabled !== false).map((f) => ({
      name: f.field.name,
      label: f.outputName || f.field.label || f.field.name,
      dataType: f.dataType,
      isMetric: f.conceptType === 1,
      formula: f.textFormula || undefined,
    }));
  };

  /** Phân giải tham chiếu data source: id, alias (ds0), key blend, hoặc tên (không phân biệt hoa thường). */
  RT.resolveDataset = function (cat, ref) {
    if (!ref) throw new Error('thiếu "datasource" trong spec');
    const r = String(ref).trim();
    let hits = cat.filter((c) => c.id === r || c.alias === r);
    if (!hits.length) hits = cat.filter((c) => c.name.toLowerCase() === r.toLowerCase());
    if (hits.length !== 1) {
      throw new Error(`data source "${ref}" khớp ${hits.length} nguồn. Có: ${cat.map((c) => `${c.alias || c.id} = ${c.name}`).join(' | ')}`);
    }
    return hits[0];
  };

  /** Phân giải field theo tên kỹ thuật (field.name) trước, rồi theo nhãn hiển thị. */
  RT.resolveField = function (ds, ref) {
    const r = String(ref).trim();
    let hits = ds.fields.filter((f) => f.name === r);
    if (!hits.length) hits = ds.fields.filter((f) => f.label.toLowerCase() === r.toLowerCase());
    if (hits.length !== 1) {
      const near = ds.fields.filter((f) => f.label.toLowerCase().includes(r.toLowerCase())).slice(0, 8).map((f) => `${f.label} (${f.name})`);
      throw new Error(`field "${ref}" trong "${ds.name}" khớp ${hits.length}. Gần giống: ${near.join(', ') || 'không có'}`);
    }
    return hits[0];
  };

  /** "SUM({Sessions}) / COUNT_DISTINCT({Date})" → "SUM(t0._sessions_) / COUNT_DISTINCT(t0._date_)". */
  RT.expandFormula = function (ds, formula) {
    return String(formula).replace(/\{([^{}]+)\}/g, (_, ref) => 't0.' + RT.resolveField(ds, ref).name);
  };

  // ---------- Dựng component ----------
  RT.conceptFor = function (ds, item, role) {
    const spec = typeof item === 'string' ? { field: item } : (item || {});
    const name = RT.newId.concept();
    const dt = {};
    if (spec.formula) {
      const f = RT.expandFormula(ds, spec.formula);
      Object.assign(dt, { sourceFieldName: name, textFormula: f, frontendTextFormula: f, sourceType: 1, aggregation: RT.aggCode(spec.agg) ?? RT.AGG.AUTO });
    } else {
      dt.sourceFieldName = RT.resolveField(ds, spec.field).name;
      let agg = RT.aggCode(spec.agg);
      // Blend không có cách gộp mặc định: thiếu là chart báo "Invalid metric" (đo 03/10/2026).
      if (agg === undefined && role === 'metric' && ds.kind === 'blend') agg = RT.AGG.SUM;
      if (agg !== undefined) dt.aggregation = agg;
    }
    const def = { id: 't0.' + name, name, namespace: 't0', queryTimeTransformation: { dataTransformation: dt } };
    if (spec.name) def.queryTimeTransformation.displayTransformation = { displayName: spec.name };
    return def;
  };

  RT.position = function (p) {
    const q = p || {};
    return { componentAttribute: { datasourceConfigVersion: 2, displayConfigVersion: 0, top: q.top ?? 20, left: q.left ?? 20, width: q.width ?? 400, height: q.height ?? 300, rotation: 0, flipHorizontal: false, flipVertical: false } };
  };

  const labeled = (pairs) => ({ labeledConcepts: pairs.map(([key, names]) => ({ key, value: { conceptNames: names } })) });

  /**
   * Spec chart: {type, datasource, dimensions[], metrics[], breakdown?, sort?, rows?, filters?, position, title?}
   * dimension/metric: "Tên field" | {field, agg?, name?} | {formula, agg?, name?}
   */
  RT.buildChart = function (cat, spec) {
    const type = RT.CHART_TYPE[spec.type] || spec.type;
    if (!Object.values(RT.CHART_TYPE).includes(type)) throw new Error(`loại chart "${spec.type}" chưa hỗ trợ (có: ${Object.keys(RT.CHART_TYPE).join(', ')})`);
    const ds = RT.resolveDataset(cat, spec.datasource);
    const dims = (spec.dimensions || []).map((d) => RT.conceptFor(ds, d, 'dimension'));
    const mets = (spec.metrics || []).map((m) => RT.conceptFor(ds, m, 'metric'));
    const brk = spec.breakdown ? [RT.conceptFor(ds, spec.breakdown, 'dimension')] : [];
    if (!mets.length) throw new Error('chart cần ít nhất 1 metric');
    if (type !== 'kpi-metric' && !dims.length) throw new Error(`chart ${spec.type} cần ít nhất 1 dimension`);
    const dn = dims.map((c) => c.name), mn = mets.map((c) => c.name);
    let dimensions, metrics;
    if (type === 'kpi-metric') { dimensions = labeled([['primary', []], ['sparkline', dn.slice(0, 1)]]); metrics = labeled([['primary', mn.slice(0, 1)], ['target', []]]); }
    else if (['simple-linechart', 'simple-barchart', 'simple-combochart'].includes(type)) { dimensions = labeled([['primary', dn], ['breakdown', brk.map((c) => c.name)]]); metrics = labeled([['primary', mn]]); }
    else { dimensions = labeled([['primary', dn]]); metrics = labeled([['primary', mn]]); }
    const sortCol = spec.sort ? (spec.sort.by === 'dimension' ? dn[0] : mn[0]) : mn[0];
    const prop = {
      dataset: { datasetType: ds.kind === 'blend' ? 2 : 1, datasetId: ds.id },
      dimensions, metrics,
      sort: [{ sortDir: spec.sort && spec.sort.dir === 'asc' ? 0 : 1, sortColumn: sortCol }],
      breakdownConfig: [], filters: spec.filters || [], inheritFilters: true, dsRequiredFilters: [],
      componentPropertyMigrationStatus: 2,
    };
    if (!RT.NO_ROW_TYPES.includes(type)) prop.row = spec.rows || (type === 'simple-table' ? 100 : 10);
    if (type === 'simple-table') prop.tableProperty = { showTotals: spec.totals !== false };
    const comp = {
      componentId: spec.componentId || RT.newId.component(), type, preset: 'default',
      behavior: { mapValue: { entry: [] } },
      attributeConfig: RT.position(spec.position),
      propertyConfig: { componentProperty: prop },
      conceptDefs: dims.concat(mets, brk),
    };
    if (ds.kind !== 'blend') comp.datasourceId = ds.id;
    return comp;
  };

  RT.buildText = function (spec) {
    return {
      componentId: spec.componentId || RT.newId.component(), type: 'simple-description', preset: 'default',
      behavior: { mapValue: { entry: [] } }, attributeConfig: RT.position(Object.assign({ height: 60 }, spec.position)),
      propertyConfig: { componentProperty: { sort: [], breakdownConfig: [], filters: [], inheritFilters: true, dsRequiredFilters: [], descriptionProperty: { text: spec.html || RT.escapeHtml(spec.text || ''), fontSize: spec.fontSize || 14, lineHeight: -1, paddingTop: 8, paddingLeft: 8, paddingRight: 8, overflow: 1 }, componentPropertyMigrationStatus: 2 } },
      conceptDefs: [],
    };
  };

  RT.escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const controlBehavior = (event, action) => ({ mapValue: { entry: [{ key: event, value: { arrayValue: { value: [{ mapValue: { entry: [{ key: 'action', value: { strValue: action } }, { key: 'isControl', value: { boolValue: true } }] } }] } } }] } });

  RT.buildDateRange = function (spec) {
    return {
      componentId: spec.componentId || RT.newId.component(), type: 'simple-daterangepicker', preset: 'default',
      behavior: controlBehavior('onSelect', 'lego-change-date-range'),
      attributeConfig: RT.position(Object.assign({ width: 280, height: 60 }, spec.position)),
      propertyConfig: { componentProperty: { sort: [], breakdownConfig: [], filters: [], inheritFilters: true, dsRequiredFilters: [], dateRangePickerProperty: { fontSize: 14, lineHeight: 16, paddingTop: 8, paddingLeft: 24, paddingRight: 24, centerVertical: true }, componentPropertyMigrationStatus: 2 } },
      conceptDefs: [],
    };
  };

  /** Dropdown lọc theo 1 dimension. Định dạng bắt từ UI 03/10/2026: bắt buộc datasourceId gốc + row 5001. */
  RT.buildDropdown = function (cat, spec) {
    const ds = RT.resolveDataset(cat, spec.datasource);
    if (ds.kind === 'blend') throw new Error('dropdown trên blend chưa kiểm — dùng data source thường');
    const dim = RT.conceptFor(ds, spec.field, 'dimension');
    const met = RT.conceptFor(ds, spec.metric || ds.fields.find((f) => f.name.startsWith('datastudio_record_count')) || { formula: 'COUNT(1)' }, 'metric');
    return {
      datasourceId: ds.id, componentId: spec.componentId || RT.newId.component(), type: 'dimension-filter', preset: 'default',
      behavior: { mapValue: { entry: [] } },
      attributeConfig: RT.position(Object.assign({ width: 300, height: 50 }, spec.position)),
      propertyConfig: { componentProperty: {
        sort: [{ sortDir: 1, sortColumn: met.name }], breakdownConfig: [], filters: [], inheritFilters: true, dsRequiredFilters: [],
        dataset: { datasetType: 1, datasetId: ds.id }, dimensions: labeled([['primary', [dim.name]]]), metrics: labeled([['primary', [met.name]]]),
        row: 5001, dimensionFilterProperty: { showSearch: true, expandable: true, labelFontSize: 14, paddingTop: 8, paddingLeft: 24, paddingRight: 24, centerVertical: true, lineHeight: 16 },
        componentPropertyMigrationStatus: 2,
      } },
      conceptDefs: [dim, met],
    };
  };

  // Mã điều kiện theo UI: Equals EQ, Contains PT, Starts with BW, Regex RM (khớp cả chuỗi), In IN.
  // RC (regex contains) có trong report thật. Tên dễ nhớ map sang mã wire.
  RT.FILTER_OPS = ['EQ', 'IN', 'PT', 'BW', 'RM', 'RC', 'GT', 'GE', 'LT', 'LE', 'IS_NULL', 'BETWEEN'];
  RT.FILTER_ALIAS = { CONTAINS: 'PT', STARTS_WITH: 'BW', REGEX: 'RM', REGEX_CONTAINS: 'RC' };

  /** Filter cấp report: {name, datasource, field, condition, values[], include?} → entry resource.filter. */
  RT.buildFilter = function (cat, spec) {
    const ds = RT.resolveDataset(cat, spec.datasource);
    const f = RT.resolveField(ds, spec.field);
    const raw = String(spec.condition || 'EQ').toUpperCase().replace(/[\s-]/g, '_');
    const cond = RT.FILTER_ALIAS[raw] || raw;
    if (!RT.FILTER_OPS.includes(cond)) throw new Error(`condition "${spec.condition}" không hỗ trợ (${RT.FILTER_OPS.join('/')})`);
    const values = [].concat(spec.values === undefined ? [] : spec.values);
    const numeric = ['GT', 'GE', 'LT', 'LE', 'BETWEEN'].includes(cond);
    return {
      key: spec.key || RT.newId.filter(),
      value: {
        name: spec.name || `${f.label} ${cond} ${values.join(',')}`, datasourceId: ds.id,
        filterDefinition: { filterExpression: {
          include: spec.include !== false, conceptType: 0, concept: { ns: 't0', name: RT.newId.concept() },
          filterConditionType: cond, stringValues: numeric ? [] : values.map(String), numberValues: numeric ? values.map(Number) : [],
          queryTimeTransformation: { dataTransformation: { sourceFieldName: f.name } },
        } },
        version: 3,
      },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
