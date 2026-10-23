/*
 * datastudio-page-ops.js — áp danh sách thao tác (plan) lên 1 report, chạy TRONG tab.
 * Cần datastudio-page-runtime.js nạp trước (dùng globalThis.__DSRT).
 *
 * Mỗi thao tác: đọc trạng thái mới nhất → sửa bản sao → ghi đúng 1 loại RPC → đọc lại kiểm.
 * Dry-run: chỉ sửa bản sao trong bộ nhớ, không gọi RPC ghi nào (getColumns/đọc thì vẫn gọi).
 * Lỗi ở live: dừng ngay, không chạy thao tác sau (report có thể đã đổi một phần — xem checkpoint).
 */
(function (root) {
  const RT = root.__DSRT;
  const clone = (x) => JSON.parse(JSON.stringify(x));

  // ---------- Tra trang / component ----------
  function findPage(rc, ref) {
    const nav = rc.navigationInfo.navItems.filter((n) => n.page);
    let hits = nav.filter((n) => n.page.pageId === ref);
    if (!hits.length) hits = nav.filter((n) => (n.page.displayName || '').toLowerCase() === String(ref).toLowerCase());
    if (hits.length !== 1) throw new Error(`page "${ref}" khớp ${hits.length}. Có: ${nav.map((n) => `${n.page.displayName} (${n.page.pageId})`).join(' | ')}`);
    const pe = rc.page.find((p) => p.pageId === hits[0].page.pageId);
    if (!pe) throw new Error(`page ${hits[0].page.pageId} có trong menu nhưng không có nội dung`);
    return pe;
  }

  function findComponent(pe, id) {
    const c = pe.page.componentConfig.find((x) => x.componentId === id);
    if (!c) throw new Error(`page ${pe.pageId} không có component ${id}`);
    return c;
  }

  function findFilterKey(rc, ref) {
    const entries = ((rc.report.resource.filter || {}).entry || []);
    let hits = entries.filter((e) => e.key === ref);
    if (!hits.length) hits = entries.filter((e) => (e.value.name || '').toLowerCase() === String(ref).toLowerCase());
    if (hits.length !== 1) throw new Error(`filter "${ref}" khớp ${hits.length}`);
    return hits[0].key;
  }

  function setPath(obj, dotted, value) {
    const parts = dotted.split('.');
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (o[parts[i]] === undefined || o[parts[i]] === null) o[parts[i]] = {};
      o = o[parts[i]];
    }
    if (value === null) delete o[parts[parts.length - 1]];
    else o[parts[parts.length - 1]] = value;
  }

  // ---------- Ghi ----------
  function Ctx(reportId, live) {
    this.reportId = reportId;
    this.live = live;
    this.writes = [];
    // Dry-run: field/nguồn "sẽ tạo" chưa có trên server; giữ ở đây để bước sau tham chiếu được.
    this.dryExtras = { fields: {}, datasources: [] };
  }

  Ctx.prototype.load = async function () {
    this.rc = await RT.getReport(this.reportId);
    this.cat = null;
  };
  Ctx.prototype.catalog = async function () {
    if (!this.cat) {
      this.cat = await RT.catalog(this.rc);
      for (const d of this.dryExtras.datasources) if (!this.cat.some((c) => c.id === d.id)) this.cat.push(d);
      for (const c of this.cat) for (const f of (this.dryExtras.fields[c.id] || [])) c.fields.push(f);
    }
    return this.cat;
  };
  Ctx.prototype.send = async function (ep, body, note) {
    this.writes.push({ ep, note });
    if (!this.live) return null;
    return RT.rpc(ep, body);
  };
  Ctx.prototype.writePage = async function (pe, note) {
    const pageRequest = Object.assign({ fieldMask: [4, 3] }, pe.page, { chartCondition: pe.chartCondition || [], pageId: pe.pageId });
    return this.send('updatePage', { reportId: this.reportId, pageId: pe.pageId, pageRequest, version: pe.version }, note);
  };
  Ctx.prototype.writeReport = async function (rep, note) {
    const reportRequest = { componentConfig: rep.componentConfig || [], chartCondition: this.rc.chartCondition || [], conceptDefs: rep.conceptDefs || [], propertyConfig: rep.propertyConfig, attributeConfig: rep.attributeConfig, resource: rep.resource };
    return this.send('updateReport', { reportRequest, reportId: this.reportId, version: Number(this.rc.version) }, note);
  };
  Ctx.prototype.writeNav = async function (nav, note) {
    return this.send('updateReportNavigationInfo', { reportId: this.reportId, navigationInfo: nav, version: String(this.rc.version) }, note);
  };

  // ---------- Thao tác ----------
  const OPS = {};

  OPS['add-page'] = async (ctx, op) => {
    const pageId = op.pageId || RT.newId.page();
    const nav = ctx.rc.navigationInfo.navItems;
    const index = op.index ?? nav.length;
    const item = { pageId, displayName: op.name || 'Untitled Page', chartCondition: [], page: { componentConfig: [], groupConfig: [], conceptDefs: [], propertyConfig: { pageProperty: { filters: [], inheritFilters: true } }, attributeConfig: { pageAttribute: { displayConfigVersion: 0, datasourceConfigVersion: 2, name: op.name || 'Untitled Page' } } } };
    // position phải là object {index}; gửi số trần là 400 (đo 03/10/2026). Tạo trống rồi mới thêm chart.
    await ctx.send('createPages', { reportId: ctx.reportId, pages: [item], position: { index } }, `page ${op.name}`);
    if (!ctx.live) { ctx.rc.page.push({ pageId, page: item.page, version: '0', chartCondition: [] }); nav.splice(index, 0, { page: { pageId, displayName: item.displayName } }); }
    return { pageId, verify: (rc) => rc.navigationInfo.navItems.some((n) => n.page && n.page.pageId === pageId) };
  };

  OPS['rename-page'] = async (ctx, op) => {
    const pe = findPage(ctx.rc, op.page);
    const nav = clone(ctx.rc.navigationInfo);
    nav.navItems.forEach((n) => { if (n.page && n.page.pageId === pe.pageId) n.page.displayName = op.name; });
    await ctx.writeNav(nav, `đổi tên ${pe.pageId}`);
    if (!ctx.live) ctx.rc.navigationInfo = nav;
    return { pageId: pe.pageId, verify: (rc) => rc.navigationInfo.navItems.some((n) => n.page && n.page.pageId === pe.pageId && n.page.displayName === op.name) };
  };

  OPS['move-page'] = async (ctx, op) => {
    const pe = findPage(ctx.rc, op.page);
    const nav = clone(ctx.rc.navigationInfo);
    const from = nav.navItems.findIndex((n) => n.page && n.page.pageId === pe.pageId);
    const [it] = nav.navItems.splice(from, 1);
    nav.navItems.splice(op.index, 0, it);
    await ctx.writeNav(nav, `chuyển ${pe.pageId} → ${op.index}`);
    if (!ctx.live) ctx.rc.navigationInfo = nav;
    return { pageId: pe.pageId, verify: (rc) => (rc.navigationInfo.navItems[op.index] || {}).page?.pageId === pe.pageId };
  };

  OPS['delete-page'] = async (ctx, op) => {
    const pe = findPage(ctx.rc, op.page);
    if (ctx.rc.navigationInfo.navItems.filter((n) => n.page).length <= 1) throw new Error('không xoá page cuối cùng của report');
    await ctx.send('deletePages', { reportId: ctx.reportId, pageIds: [pe.pageId] }, `xoá ${pe.pageId}`);
    if (!ctx.live) { ctx.rc.page = ctx.rc.page.filter((p) => p.pageId !== pe.pageId); ctx.rc.navigationInfo.navItems = ctx.rc.navigationInfo.navItems.filter((n) => !n.page || n.page.pageId !== pe.pageId); }
    return { pageId: pe.pageId, verify: (rc) => !rc.page.some((p) => p.pageId === pe.pageId) };
  };

  async function putComponent(ctx, op, comp) {
    const pe = findPage(ctx.rc, op.page);
    if (pe.page.componentConfig.some((c) => c.componentId === comp.componentId)) throw new Error(`component ${comp.componentId} đã có trên page — dùng update-component`);
    pe.page.componentConfig.push(comp);
    await ctx.writePage(pe, `${comp.type} ${comp.componentId}`);
    return { pageId: pe.pageId, componentId: comp.componentId, verify: (rc) => rc.page.some((p) => p.pageId === pe.pageId && p.page.componentConfig.some((c) => c.componentId === comp.componentId)) };
  }

  OPS['add-chart'] = async (ctx, op) => putComponent(ctx, op, RT.buildChart(await ctx.catalog(), op));
  OPS['add-text'] = async (ctx, op) => putComponent(ctx, op, RT.buildText(op));
  OPS['add-date-range'] = async (ctx, op) => putComponent(ctx, op, RT.buildDateRange(op));
  OPS['add-dropdown'] = async (ctx, op) => putComponent(ctx, op, RT.buildDropdown(await ctx.catalog(), op));
  OPS['add-component'] = async (ctx, op) => {
    const comp = clone(op.component);
    comp.componentId = comp.componentId || RT.newId.component();
    return putComponent(ctx, op, comp);
  };

  OPS['update-component'] = async (ctx, op) => {
    const pe = findPage(ctx.rc, op.page);
    const c = findComponent(pe, op.componentId);
    for (const [k, v] of Object.entries(op.set || {})) setPath(c, k, v);
    await ctx.writePage(pe, `sửa ${op.componentId}`);
    const want = clone(c);
    return { pageId: pe.pageId, componentId: op.componentId, verify: (rc) => {
      const p = rc.page.find((x) => x.pageId === pe.pageId);
      const got = p && p.page.componentConfig.find((x) => x.componentId === op.componentId);
      return !!got && Object.keys(op.set || {}).every((k) => JSON.stringify(k.split('.').reduce((o, s) => (o || {})[s], got)) === JSON.stringify(k.split('.').reduce((o, s) => (o || {})[s], want)));
    } };
  };

  /** Nhiều component cùng page trong MỘT lần ghi: {page, items:[{componentId, set:{đường.chấm: giá trị}}]}. Dùng khi dời/đổi cỡ cả bố cục. */
  OPS['update-components'] = async (ctx, op) => {
    const pe = findPage(ctx.rc, op.page);
    if (!Array.isArray(op.items) || !op.items.length) throw new Error('update-components cần "items": [{componentId, set}]');
    for (const it of op.items) {
      const c = findComponent(pe, it.componentId);
      for (const [k, v] of Object.entries(it.set || {})) setPath(c, k, v);
    }
    await ctx.writePage(pe, `sửa ${op.items.length} component`);
    const want = clone(pe.page.componentConfig);
    const read = (o, k) => JSON.stringify(k.split('.').reduce((x, s) => (x || {})[s], o));
    return { pageId: pe.pageId, verify: (rc) => {
      const p = rc.page.find((x) => x.pageId === pe.pageId);
      return op.items.every((it) => {
        const got = p.page.componentConfig.find((x) => x.componentId === it.componentId);
        const exp = want.find((x) => x.componentId === it.componentId);
        return !!got && Object.keys(it.set || {}).every((k) => read(got, k) === read(exp, k));
      });
    } };
  };

  OPS['delete-component'] = async (ctx, op) => {
    const pe = findPage(ctx.rc, op.page);
    findComponent(pe, op.componentId);
    pe.page.componentConfig = pe.page.componentConfig.filter((c) => c.componentId !== op.componentId);
    await ctx.writePage(pe, `xoá ${op.componentId}`);
    return { pageId: pe.pageId, verify: (rc) => !rc.page.find((x) => x.pageId === pe.pageId).page.componentConfig.some((c) => c.componentId === op.componentId) };
  };

  OPS['upsert-filter'] = async (ctx, op) => {
    const entry = RT.buildFilter(await ctx.catalog(), op);
    const rep = clone(ctx.rc.report);
    rep.resource.filter = rep.resource.filter || { entry: [] };
    rep.resource.filter.entry = rep.resource.filter.entry.filter((e) => e.key !== entry.key).concat([entry]);
    await ctx.writeReport(rep, `filter ${entry.value.name}`);
    if (!ctx.live) ctx.rc.report = rep;
    return { filterKey: entry.key, verify: (rc) => rc.report.resource.filter.entry.some((e) => e.key === entry.key) };
  };

  /** Gắn filter vào 1 component (componentId) hoặc cả page (không có componentId). */
  OPS['attach-filter'] = async (ctx, op) => {
    const key = findFilterKey(ctx.rc, op.filter);
    const pe = findPage(ctx.rc, op.page);
    const holder = op.componentId ? findComponent(pe, op.componentId).propertyConfig.componentProperty : (pe.page.propertyConfig = pe.page.propertyConfig || { pageProperty: { filters: [], inheritFilters: true } }).pageProperty;
    holder.filters = Array.from(new Set((holder.filters || []).concat([key])));
    await ctx.writePage(pe, `gắn ${key}`);
    return { filterKey: key, verify: (rc) => {
      const p = rc.page.find((x) => x.pageId === pe.pageId);
      const h = op.componentId ? p.page.componentConfig.find((c) => c.componentId === op.componentId).propertyConfig.componentProperty : p.page.propertyConfig.pageProperty;
      return (h.filters || []).includes(key);
    } };
  };

  OPS['delete-filter'] = async (ctx, op) => {
    const key = findFilterKey(ctx.rc, op.filter);
    const users = ctx.rc.page.filter((p) => JSON.stringify(p.page).includes(`"${key}"`));
    if (users.length && !op.force) throw new Error(`filter ${key} đang được dùng ở page ${users.map((p) => p.pageId).join(', ')} — gỡ trước hoặc force:true`);
    // force: gỡ tham chiếu ở page/chart/group trước, không để chart trỏ vào filter không còn tồn tại.
    const strip = (holder) => { if (holder && Array.isArray(holder.filters)) holder.filters = holder.filters.filter((f) => f !== key); };
    for (const pe of users) {
      strip(pe.page.propertyConfig && pe.page.propertyConfig.pageProperty);
      for (const c of pe.page.componentConfig) strip((c.propertyConfig || {}).componentProperty);
      for (const g of pe.page.groupConfig || []) strip((g.propertyConfig || {}).groupProperty);
      await ctx.writePage(pe, `gỡ ${key} khỏi ${pe.pageId}`);
    }
    if (users.length && ctx.live) await ctx.load();
    const rep = clone(ctx.rc.report);
    rep.resource.filter.entry = rep.resource.filter.entry.filter((e) => e.key !== key);
    await ctx.writeReport(rep, `xoá filter ${key}`);
    if (!ctx.live) ctx.rc.report = rep;
    return { verify: (rc) => !rc.report.resource.filter.entry.some((e) => e.key === key) };
  };

  // ---------- Theme (cả report) ----------
  // report.resource.theme.value[0] = map {id, content}; content là cây {mapValue:{entry:[{key,value}]}} với lá
  // strValue / int64Value / doubleValue / boolValue. themeSeriesColor là danh sách {value:[map{color,seriesRef,themeRef}]}.
  function themeContentMap(rep) {
    const t = (((rep.resource || {}).theme || {}).value || [])[0];
    const content = t && t.mapValue.entry.find((e) => e.key === 'content');
    if (!content) throw new Error('report không có resource.theme.content');
    return content.value;
  }

  /** Đi theo "themeSeriesColor[2].color": tên khoá trong map, [i] chọn phần tử danh sách. */
  function themeNode(rep, path) {
    let cur = themeContentMap(rep);
    for (const tok of path.split('.')) {
      const m = /^([A-Za-z0-9_]+)(?:\[(\d+)\])?$/.exec(tok);
      if (!m) throw new Error(`đường dẫn theme sai: ${path}`);
      const e = cur.mapValue && cur.mapValue.entry.find((x) => x.key === m[1]);
      if (!e) throw new Error(`theme không có khoá "${m[1]}" (đường dẫn ${path})`);
      cur = e.value;
      if (m[2] !== undefined) {
        const list = cur.value || (cur.arrayValue && cur.arrayValue.value);
        if (!list || !list[Number(m[2])]) throw new Error(`theme ${m[1]} không có phần tử ${m[2]}`);
        cur = list[Number(m[2])];
      }
    }
    return cur;
  }

  /** Nút màu {color, ...} nhận chuỗi hex và đặt vào mục "color"; lá thường đặt theo kiểu có sẵn. */
  function themeLeaf(node, path) {
    if (node.mapValue) {
      const c = node.mapValue.entry.find((x) => x.key === 'color');
      if (!c) throw new Error(`theme ${path} là map không có mục color; chỉ rõ lá, ví dụ ${path}.opacity`);
      return c.value;
    }
    return node;
  }

  function themeAssign(leaf, value, path) {
    if ('strValue' in leaf) leaf.strValue = String(value);
    else if ('int64Value' in leaf) leaf.int64Value = String(Math.round(Number(value)));
    else if ('doubleValue' in leaf) leaf.doubleValue = Number(value);
    else if ('boolValue' in leaf) leaf.boolValue = Boolean(value);
    else throw new Error(`theme ${path} không phải giá trị lá`);
  }

  function themeLeafValue(leaf) {
    for (const k of ['strValue', 'int64Value', 'doubleValue', 'boolValue']) if (k in leaf) return String(leaf[k]);
    return undefined;
  }

  /**
   * op: {set: {"themeBorderColor": "#DDE3EA", "themeBorderRadius": 12, "themeSeriesColor": ["#184F95", ...],
   *            "themeBackground.opacity": 1, "themeSeriesColor[1].color": "#EB6834"}}
   * Chỉ đổi giá trị khoá đã có; không tạo khoá mới, giữ nguyên seriesRef/themeRef.
   * Mảng gán lần lượt vào phần tử 0..n-1 của danh sách màu.
   */
  OPS['set-theme'] = async (ctx, op) => {
    if (!op.set || typeof op.set !== 'object' || !Object.keys(op.set).length) throw new Error('set-theme cần "set": {khoá: giá trị}');
    const rep = clone(ctx.rc.report);
    const targets = [];
    for (const [path, value] of Object.entries(op.set)) {
      if (Array.isArray(value)) {
        value.forEach((v, i) => {
          const p = `${path}[${i}]`;
          targets.push({ path: p, leaf: themeLeaf(themeNode(rep, p), p), value: v });
        });
      } else {
        targets.push({ path, leaf: themeLeaf(themeNode(rep, path), path), value });
      }
    }
    for (const t of targets) themeAssign(t.leaf, t.value, t.path);
    await ctx.writeReport(rep, `theme ${Object.keys(op.set).join(', ')}`);
    if (!ctx.live) ctx.rc.report = rep;
    return { verify: (rc) => targets.every((t) => {
      const got = themeLeafValue(themeLeaf(themeNode(rc.report, t.path), t.path));
      const want = typeof t.value === 'number' ? String(Math.round(t.value)) === got || String(t.value) === got : String(t.value).toLowerCase() === String(got).toLowerCase();
      return want;
    }) };
  };

  OPS['upsert-blend'] = async (ctx, op) => RT.upsertBlend(ctx, op);
  OPS['delete-blend'] = async (ctx, op) => {
    const cat = await ctx.catalog();
    const b = RT.resolveDataset(cat.filter((c) => c.kind === 'blend'), op.blend);
    const rep = clone(ctx.rc.report);
    rep.resource.dataViewResource.entry = rep.resource.dataViewResource.entry.filter((e) => e.key !== b.id);
    await ctx.writeReport(rep, `xoá blend ${b.name}`);
    if (!ctx.live) ctx.rc.report = rep;
    return { verify: (rc) => !rc.report.resource.dataViewResource.entry.some((e) => e.key === b.id) };
  };

  OPS['add-calculated-field'] = async (ctx, op) => RT.addCalculatedField(ctx, op);
  OPS['delete-field'] = async (ctx, op) => RT.deleteField(ctx, op);
  OPS['add-sheets-datasource'] = async (ctx, op) => RT.addSheetsDatasource(ctx, op);
  OPS['refresh-fields'] = async (ctx, op) => RT.refreshSheetsFields(ctx, op);

  RT.OPS = OPS;
  RT.OP_NAMES = Object.keys(OPS);

  /** Áp cả plan. Trả {results, writes}. Live: lỗi ở bước nào dừng ở bước đó. */
  RT.applyPlan = async function (reportId, ops, live) {
    const ctx = new Ctx(reportId, live);
    await ctx.load();
    const results = [];
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      const fn = OPS[op.op];
      const base = { i, op: op.op };
      if (!fn) { results.push(Object.assign(base, { status: 'ERROR', reason: `op "${op.op}" không có (có: ${RT.OP_NAMES.join(', ')})` })); break; }
      const nWrites = ctx.writes.length;
      try {
        const r = await fn(ctx, op);
        const rec = Object.assign(base, { status: live ? 'DONE' : 'DRY', writes: ctx.writes.slice(nWrites).map((w) => w.ep) });
        for (const k of ['pageId', 'componentId', 'filterKey', 'blendKey', 'datasourceId', 'fieldName', 'rotated', 'columns']) if (r && r[k] && (!Array.isArray(r[k]) || r[k].length)) rec[k] = r[k];
        if (live) {
          await ctx.load();
          if (r && r.verify && !(await r.verify(ctx.rc))) rec.status = 'VERIFY_FAIL';
        }
        results.push(rec);
        if (rec.status === 'VERIFY_FAIL') break;
      } catch (e) {
        results.push(Object.assign(base, { status: 'ERROR', reason: e.message, writes: ctx.writes.slice(nWrites).map((w) => w.ep) }));
        break;
      }
    }
    return { results, writes: ctx.writes.length, version: ctx.rc.version };
  };
})(typeof window !== 'undefined' ? window : globalThis);
