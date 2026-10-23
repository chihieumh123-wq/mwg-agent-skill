/*
 * datastudio-page-datasource-ops.js — thao tác cấp data source và blend, chạy TRONG tab.
 * Cần datastudio-page-runtime.js nạp trước. Được datastudio-page-ops.js gọi qua RT.*.
 *
 * Cấu trúc ở đây đều đã ghi thật và có số liệu trên report thử 03/10/2026:
 *   - calculated field: publishDatasource {draft, clearThumbnails:false, reportId}
 *   - blend: report.resource.dataViewResource.entry[] qua updateReport
 *   - data source Sheets: getColumns → createBlockDatasource → claimDatasourceForReport → alias
 */
(function (root) {
  const RT = root.__DSRT;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const AGG_FN = /\b(SUM|AVG|COUNT|COUNT_DISTINCT|MAX|MIN|MEDIAN|PERCENTILE|STDDEV|VARIANCE|APPROX_COUNT_DISTINCT)\s*\(/i;

  async function rawFields(datasourceId) {
    const d = await RT.getDatasource(datasourceId);
    if (!d.published) throw new Error(`data source ${datasourceId} chưa publish hoặc không có quyền`);
    return { d, fields: d.published.datasourceBlock.fields };
  }

  function semTypes(f) {
    return ((f.outputSemanticInfo || {}).semanticConfig || []).map((s) => s.semanticType);
  }

  // ---------- Blend ----------
  /**
   * op: {name, key?, joinType: left|right|inner|full|cross,
   *      left: {datasource, dimensions[], metrics[]}, right: {...}, joinKeys: [[leftField, rightField], ...]}
   * Field đầu ra tên "<field gốc>_dv0" (trái) / "_dv1" (phải); chart trỏ field blend theo nhãn hoặc tên đó.
   * Chép dataType + outputSemanticInfo/semantic từ field gốc — thiếu là chart blend trả null (đo 03/10/2026).
   */
  RT.upsertBlend = async function (ctx, op) {
    const cat = await ctx.catalog();
    const sides = [op.left, op.right];
    if (!op.left || !op.right) throw new Error('blend cần left và right');
    const joinType = RT.JOIN[String(op.joinType || 'left').toLowerCase().replace(/[\s_-]*(outer|join)/g, '')];
    if (joinType === undefined) throw new Error(`joinType "${op.joinType}" không hỗ trợ (left/right/inner/full/cross)`);
    const joinKeys = op.joinKeys || [];
    if (joinType !== RT.JOIN.cross && !joinKeys.length) throw new Error('blend cần joinKeys [[trái, phải]] (trừ cross join)');

    const outFields = [];
    const queries = [];
    const keyConcept = [{}, {}];
    const usedLabels = new Set();
    for (let s = 0; s < 2; s++) {
      const side = sides[s];
      const ds = RT.resolveDataset(cat.filter((c) => c.kind === 'datasource'), side.datasource);
      const { fields } = await rawFields(ds.id);
      const byName = (n) => fields.find((f) => f.field.name === n);
      const items = [];
      const add = (ref, isMetric) => {
        const spec = typeof ref === 'string' ? { field: ref } : ref;
        const meta = RT.resolveField(ds, spec.field);
        if (items.some((x) => x.src === meta.name)) return items.find((x) => x.src === meta.name);
        const it = { src: meta.name, label: spec.name || meta.label, isMetric, raw: byName(meta.name) || {} };
        items.push(it);
        return it;
      };
      (side.dimensions || []).forEach((d) => add(d, false));
      (side.metrics || []).forEach((m) => add(m, true));
      joinKeys.forEach((pair) => { keyConcept[s][pair[s]] = add(pair[s], false); });
      const concepts = [];
      for (const it of items) {
        it.concept = 'qt_' + RT.rid(10);
        concepts.push({ id: { id: 't0.' + it.concept, name: it.concept, namespace: 't0' }, semantic: semTypes(it.raw), queryTimeTransformation: { dataTransformation: { sourceFieldName: it.src } } });
        let label = it.label;
        while (usedLabels.has(label.toLowerCase())) label += ` (${s ? 'phải' : 'trái'})`;
        usedLabels.add(label.toLowerCase());
        const of = { columnType: 0, field: { ns: 't0', name: `${it.src}_dv${s}`, simpleName: `${it.src}_dv${s}` }, outputName: label, enabled: true, conceptType: 0, params: [], dataType: it.raw.dataType ?? 0, property: [], isRepeated: false, isDefault: false, ancestors: [], queryTimeTransformation: { dataTransformation: { sourceFieldName: it.concept } }, lookerFilterOnlyFieldAllowedValues: [] };
        const sem = semTypes(it.raw);
        if (sem.length) of.outputSemanticInfo = { semanticConfig: sem.map((x) => ({ semanticType: x })) };
        outFields.push(of);
      }
      queries.push({ query: { concepts, datasourceId: ds.id } });
    }
    const conditions = joinKeys.map((pair) => ({ boolean: { joinKeyPair: { leftName: keyConcept[0][pair[0]].concept, rightName: keyConcept[1][pair[1]].concept } } }));

    const existing = op.key || (cat.find((c) => c.kind === 'blend' && c.name === op.name) || {}).id;
    const key = existing || RT.newId.blend();
    const value = { blockDatasource: {
      datasourceBlock: { id: 'block_' + RT.rid(10), type: 1, inputBlockIds: [], outputBlockIds: [], fields: outFields, name: op.name || 'Blended Data' },
      blocks: [{ id: 'block_' + RT.rid(10), type: 6, inputBlockIds: [], outputBlockIds: [], fields: [], isExperimental: true,
        treeQueryBlockConfig: { join: Object.assign({ left: queries[0], right: queries[1], type: joinType }, conditions.length ? { condition: { and: { conditions } } } : {}) } }],
      delegatedAccessEnabled: true, isUnlocked: true, isCacheable: false, allowNativeFunctions: false,
    } };
    const rep = clone(ctx.rc.report);
    rep.resource.dataViewResource = rep.resource.dataViewResource || { entry: [] };
    rep.resource.dataViewResource.entry = rep.resource.dataViewResource.entry.filter((e) => e.key !== key).concat([{ key, value }]);
    await ctx.writeReport(rep, `blend ${op.name}`);
    if (!ctx.live) ctx.rc.report = rep;
    ctx.cat = null;
    // Sửa blend tại chỗ: chart cũ trên blend vẫn trả kết quả cache của cấu hình trước (đo 03/10/2026:
    // ra 1 dòng RESERVED_TOTAL). Đổi componentId → chart được coi là mới, truy vấn lại.
    const rotated = [];
    if (existing) {
      if (ctx.live) await ctx.load();
      for (const pe of ctx.rc.page) {
        const users = pe.page.componentConfig.filter((c) => ((c.propertyConfig || {}).componentProperty || {}).dataset?.datasetId === key);
        if (!users.length) continue;
        for (const c of users) { const old = c.componentId; c.componentId = RT.newId.component(); rotated.push(`${old}→${c.componentId}`); }
        await ctx.writePage(pe, `làm mới ${users.length} chart dùng blend`);
        if (ctx.live) await ctx.load();
      }
    }
    return { blendKey: key, rotated, verify: (rc) => rc.report.resource.dataViewResource.entry.some((e) => e.key === key) };
  };

  // ---------- Calculated field cấp data source ----------
  /** op: {datasource, name, formula: "SUM({Sessions}) / COUNT_DISTINCT({Date})", kind?: metric|dimension, dataType?} */
  RT.addCalculatedField = async function (ctx, op) {
    const cat = await ctx.catalog();
    const ds = RT.resolveDataset(cat.filter((c) => c.kind === 'datasource'), op.datasource);
    const { d, fields } = await rawFields(ds.id);
    if (fields.some((f) => (f.outputName || '').toLowerCase() === String(op.name).toLowerCase())) throw new Error(`data source "${ds.name}" đã có field "${op.name}"`);
    const formula = RT.expandFormula(ds, op.formula);
    const isMetric = op.kind ? op.kind === 'metric' : AGG_FN.test(formula);
    const tpl = isMetric
      ? fields.find((f) => f.field.name.startsWith('datastudio_record_count'))
      : fields.find((f) => f.columnType === 1 && f.dataType === 0 && /^t0\.\S+$/.test(f.textFormula || ''));
    if (!tpl) throw new Error(`không tìm được field mẫu ${isMetric ? 'metric' : 'dimension'} trong "${ds.name}"`);
    const nf = clone(tpl);
    const name = '_calc_' + RT.rid(8) + '_';
    nf.field = { ns: 't0', name, simpleName: name };
    nf.outputName = op.name;
    nf.textFormula = formula;
    nf.createdBy = 2;
    if (op.dataType !== undefined) nf.dataType = op.dataType;
    for (const k of ['immutableVersion', 'mutableVersion', 'underlyingConnectorDataType', 'connectionOptions', 'isDefault', 'description']) delete nf[k];
    const draft = clone(d.published);
    draft.datasourceBlock.fields.push(nf);
    await ctx.send('publishDatasource', { draft, clearThumbnails: false, reportId: ctx.reportId }, `field ${op.name} → ${ds.name}`);
    if (!ctx.live) (ctx.dryExtras.fields[ds.id] = ctx.dryExtras.fields[ds.id] || []).push(...RT.summarizeFields([nf]));
    ctx.cat = null;
    return { datasourceId: ds.id, fieldName: name, verify: async () => (await rawFields(ds.id)).fields.some((f) => f.field.name === name) };
  };

  /** Chỉ xoá field do người tạo (createdBy 2) — field gốc của connector không đụng. */
  RT.deleteField = async function (ctx, op) {
    const cat = await ctx.catalog();
    const ds = RT.resolveDataset(cat.filter((c) => c.kind === 'datasource'), op.datasource);
    const target = RT.resolveField(ds, op.field);
    const { d } = await rawFields(ds.id);
    const raw = d.published.datasourceBlock.fields.find((f) => f.field.name === target.name);
    if (!raw || raw.createdBy !== 2) throw new Error(`"${target.label}" không phải calculated field do người tạo — không xoá`);
    const draft = clone(d.published);
    draft.datasourceBlock.fields = draft.datasourceBlock.fields.filter((f) => f.field.name !== target.name);
    await ctx.send('publishDatasource', { draft, clearThumbnails: false, reportId: ctx.reportId }, `xoá field ${target.label}`);
    ctx.cat = null;
    return { datasourceId: ds.id, verify: async () => !(await rawFields(ds.id)).fields.some((f) => f.field.name === target.name) };
  };

  // ---------- Data source Google Sheets ----------
  async function projectNumber(ctx, op) {
    if (op.projectNumber) return String(op.projectNumber);
    for (const a of ctx.rc.report.resource.datasourceAlias || []) {
      try { const d = await RT.getDatasource(a.datasourceId); if (d.projectNumber) return String(d.projectNumber); } catch (e) { /* thử nguồn khác */ }
    }
    return '';
  }

  async function getColumns(conn, pn) {
    // Không gửi OAuth token: server tự dùng credential phiên (đo 03/10/2026). Token của UI tuyệt đối không log.
    const j = await RT.rpc('getColumns', { connectorBlockConfig: conn, isBigQueryConnection: false, useThirdpartyAuth: false, projectNumber: pn, googleAuthOAuthToken: '' });
    if (!j.columns || !j.columns.length) throw new Error('getColumns không trả cột nào — sai spreadsheet/sheetId hoặc không có quyền đọc');
    return j.columns;
  }

  /** op: {spreadsheetId, sheetId (gid, mặc định "0"), name?, hasHeader?} */
  RT.addSheetsDatasource = async function (ctx, op) {
    if (!op.spreadsheetId) throw new Error('thiếu spreadsheetId');
    const pn = await projectNumber(ctx, op);
    const conn = { alias: 't0', connectorConfig: { datasourceType: 8, sheetsConfig: { includeFilteredCells: true, includeHiddenCells: true, sheetId: String(op.sheetId ?? '0'), hasHeader: op.hasHeader !== false, key: op.spreadsheetId }, useDatetimeType: true } };
    const cols = await getColumns(conn, pn);
    const name = op.name || `Sheet ${op.spreadsheetId.slice(0, 8)} gid ${conn.connectorConfig.sheetsConfig.sheetId}`;
    const connId = 'block_' + RT.rid(10), outId = 'block_' + RT.rid(10);
    // Cột thô (A, B… có mutableVersion) vào connector block; cột columnType 1 (Record Count + _123_ = t0.A)
    // vào datasourceBlock. Nhét lẫn → "Data Set Configuration Error" (đo 03/10/2026).
    const datasource = { datasourceId: '', allowThirdPartyViz: true, allowThirdPartyVizExternalAccess: false, isAutoRefreshEnabled: false, requestFilters: { filterIds: [] }, allowNativeFunctions: false, delegatedAccessEnabled: true, isUnlocked: true, isCacheable: false,
      datasourceBlock: { type: 1, inputBlockIds: [connId], outputBlockIds: [], fields: cols.filter((c) => c.columnType === 1), id: outId, name },
      blocks: [{ id: connId, type: 2, inputBlockIds: [], outputBlockIds: [outId], fields: cols.filter((c) => c.columnType !== 1), connectorBlockConfig: conn, name }],
      resource: {}, queryCachePolicy: { shelfLife: { amount: 15, chronoUnit: 1 }, isDefaultPolicy: true } };
    if (!ctx.live) {
      ctx.writes.push({ ep: 'createBlockDatasource+claimDatasourceForReport+updateReport', note: `${name}: ${cols.length} cột` });
      // Bước sau trong plan tham chiếu nguồn mới theo đúng `name` này.
      ctx.dryExtras.datasources.push({ kind: 'datasource', id: 'dry-' + RT.rid(6), alias: '', name, fields: RT.summarizeFields(cols.filter((c) => c.columnType === 1)) });
      ctx.cat = null;
      return { columns: cols.length };
    }
    const created = await ctx.send('createBlockDatasource', { name, oauthType: 1, datasource, reportId: ctx.reportId, uiCreateOptions: { projectNumber: pn, region: 'global' } }, name);
    const dsId = created.datasource.datasourceId;
    await ctx.send('claimDatasourceForReport', { reportId: ctx.reportId, datasourceId: dsId }, 'claim');
    await ctx.load();
    const rep = clone(ctx.rc.report);
    if (!rep.resource.datasourceAlias.some((a) => a.datasourceId === dsId)) {
      const used = new Set(rep.resource.datasourceAlias.map((a) => a.alias));
      let i = 0; while (used.has('ds' + i)) i++;
      rep.resource.datasourceAlias.push({ datasourceId: dsId, alias: 'ds' + i });
      await ctx.writeReport(rep, `alias ds${i}`);
    }
    ctx.cat = null;
    return { datasourceId: dsId, verify: (rc) => rc.report.resource.datasourceAlias.some((a) => a.datasourceId === dsId) };
  };

  /**
   * Đọc lại cột của sheet (khi đổi thứ tự/thêm cột → SHEETS_COLUMN_ORDER_CHANGED). Giữ calculated field
   * do người tạo; field tự sinh lấy theo getColumns mới (tên _123_ băm theo nhãn nên chart cũ vẫn khớp nếu nhãn giữ nguyên).
   */
  RT.refreshSheetsFields = async function (ctx, op) {
    const cat = await ctx.catalog();
    const ds = RT.resolveDataset(cat.filter((c) => c.kind === 'datasource'), op.datasource);
    const { d } = await rawFields(ds.id);
    const connBlock = d.published.blocks.find((b) => b.type === 2 && b.connectorBlockConfig);
    if (!connBlock || connBlock.connectorBlockConfig.connectorConfig.datasourceType !== 8) throw new Error(`"${ds.name}" không phải nguồn Google Sheets`);
    const cols = await getColumns(connBlock.connectorBlockConfig, String(d.projectNumber || ''));
    const draft = clone(d.published);
    const userFields = draft.datasourceBlock.fields.filter((f) => f.createdBy === 2);
    draft.datasourceBlock.fields = cols.filter((c) => c.columnType === 1).concat(userFields);
    draft.blocks.find((b) => b.id === connBlock.id).fields = cols.filter((c) => c.columnType !== 1);
    await ctx.send('publishDatasource', { draft, clearThumbnails: false, reportId: ctx.reportId }, `làm mới ${ds.name}: ${cols.length} cột`);
    ctx.cat = null;
    return { datasourceId: ds.id, verify: async () => (await rawFields(ds.id)).fields.length === draft.datasourceBlock.fields.length };
  };
})(typeof window !== 'undefined' ? window : globalThis);
