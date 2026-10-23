/**
 * mdm-commands-lookup.mjs — lệnh CHỈ ĐỌC: tra URL web → bản ghi MDM, tra sản phẩm PIM.
 *
 * Cách ghép URL (đối chiếu web thật 05/10/2026):
 *   Danh mục      /{url danh mục}                       vd /laptop
 *   Hãng          /{url danh mục}-{url hãng}            vd /laptop-hp-compaq
 *   Filter        /{url danh mục}-{url giá trị}         vd /laptop-ky-thuat   (url giá trị chỉ là phần đuôi)
 *   Hãng+Filter   /{url danh mục}-{url hãng}-{url giá trị}  → field *_brand_filter, [HÃNG] thay bằng tên hãng
 *   Lọc `?g=slug` /{danh mục}?g=slug (hoặc /{danh mục}-{hãng}?g=slug) → giá trị Filter có url rỗng; slug lấy từ
 *                 catalog trong HTML core mới (xem mdm-g-slug.mjs). `?p=` và query lạ → exit 2, không tra nhầm Danh mục.
 *   Sản phẩm      /{danh mục}/{slug}                     → PIM (xem pimFind; ghi title/desc ở pim-product-commands)
 */
import { MdmError, rawGet, parseWebUrl, categoryCandidates, resolveRest, seoFieldsFor, buildGetInfor, ENDPOINT } from './mdm-core.mjs';
import { fetchCoreMoi } from './mdm-web-verify.mjs';
import { parseCatalogGSlugs, resolveGSlug } from './mdm-g-slug.mjs';
import { expectedFromRaw, checkWeb } from './mdm-check-web.mjs';

const val = (raw, k) => {
  const v = rawGet(raw, k);
  return v === undefined ? undefined : v;
};

export async function loadCategories(s, cfg) {
  const j = await s.post('mdm', 'datatobject/getlistbyroot', { localeCode: 'vi_VN', objectId: cfg.category.objectId, rootId: cfg.category.rootId },
    { top: ['id', 'name', 'lvl', 'record_code', 'is_activated'], raw: ['url', 'code', 'cms_category_id'] });
  if (j.error || !Array.isArray(j.object)) throw new MdmError(`đọc cây danh mục lỗi: ${j.toastMessage}`, 1);
  return j.object.map((r) => ({ id: r.id, name: r.name, lvl: r.lvl, url: val(r.raw, 'url'), code: String(val(r.raw, 'code') ?? r.record_code ?? ''), cmsCategoryId: val(r.raw, 'cms_category_id') }));
}

export async function loadBrands(s, cfg, categoryCode) {
  const j = await s.post('mdm', 'dataobject/getlist', {
    localeCode: 'vi_VN', objectId: cfg.brand.objectId, functionId: cfg.brand.functionId, objectCode: 'tgdd_brand_category',
    pageSize: 500, pageIndex: 1, filterParams: [{ key: 'category_code', value: String(categoryCode) }], listOrderBy: [],
  }, { top: ['id', 'record_code', 'url', 'name', 'isActivated'] });
  if (j.error) throw new MdmError(`đọc danh sách hãng lỗi: ${j.toastMessage}`, 1);
  return (j.object || []).map((r) => ({ id: r.id, code: r.record_code, url: r.url, name: r.name, active: r.isActivated }));
}

/** Mọi giá trị Filter của 1 danh mục: list dòng Filter, rồi getlist2 từng dòng (lọc url chỉ chạy trong 1 dòng). */
export async function loadFilterValues(s, cfg, categoryCode) {
  const recs = await s.post('mdm', 'dataobject/getlist', {
    localeCode: 'vi_VN', objectId: cfg.filter.objectId, functionId: cfg.filter.functionId, objectCode: 'tgdd_filter_atb',
    pageSize: 500, pageIndex: 1, filterParams: [{ key: 'category_code', value: String(categoryCode) }], listOrderBy: [],
  }, { top: ['id', 'record_code', 'name'] });
  if (recs.error) throw new MdmError(`đọc dòng Filter lỗi: ${recs.toastMessage}`, 1);
  const records = recs.object || [];
  const ops = records.map((r) => ({
    api: 'mdm', path: 'datarelation/getlist2',
    body: { localeCode: 'vi_VN', dataObjectId: r.id, functionId: cfg.filter.functionId, objectId: cfg.filter.objectId, relationId: cfg.filter.relationId,
      filterParams: [{ key: 'filter_type_attribute_code', value: String(r.record_code) }], pageIndex: 1, pageSize: 500, listOrderBy: null },
    project: { top: ['id', 'record_code', 'url', 'name', 'isActivated'], raw: ['attribute_value'] },
  }));
  const res = ops.length ? await s.run(ops) : [];
  const out = [];
  records.forEach((r, i) => {
    const j = res[i] && res[i].json;
    if (!j || j.error) throw new MdmError(`đọc giá trị của dòng Filter ${r.record_code} lỗi`, 1);
    for (const v of j.object || []) {
      const av = v.raw && v.raw.attribute_value;
      out.push({ id: v.id, code: v.record_code, url: v.url, name: v.name, active: v.isActivated, recordCode: r.record_code, filterName: r.name,
        attributeValue: Array.isArray(av) && av[0] ? av[0].data : undefined });
    }
  });
  return out;
}

export async function readRecord(s, cfg, screen, id) {
  const j = await s.post('mdm', ENDPOINT[screen].read, buildGetInfor(screen, id, cfg));
  if (j.error || !j.object) throw new MdmError(`đọc ${screen} ${id} lỗi: ${j.toastMessage || 'object rỗng'}`, 1);
  const info = j.object;
  if (typeof info.rawValues === 'string') info.rawValues = JSON.parse(info.rawValues);
  return info;
}

// Field trống/chưa có in null (không để rơi khỏi JSON) — đọc vào là thấy ngay "chưa khai".
const brief = (v) => (v === undefined ? null : typeof v === 'string' ? (v.length > 160 ? { len: v.length, head: v.slice(0, 120) } : v) : v);

/** `?g=slug` → giá trị Filter: catalog từ HTML core mới (lấy lại tối đa 6 lần nếu rơi node core cũ), rồi dò MDM theo (dòng, attribute_value). */
async function resolveG(s, cfg, category, gSlug, fetchFn, preloaded) {
  let page;
  for (let i = 0; i < 6; i++) {
    page = await fetchCoreMoi(new URL(`/${category.url}`, cfg.webOrigin).href, fetchFn);
    if (page.status === 200 && page.coreMoi) break;
  }
  if (!(page.status === 200 && page.coreMoi)) throw new MdmError(`không lấy được trang /${category.url} từ core mới (status ${page.status}, core mới=${page.coreMoi}) — thử lại sau`, 5);
  const catalog = parseCatalogGSlugs(page.html);
  if (!catalog.size) throw new MdmError(`trang /${category.url} không có catalog g= (HTML đổi cấu trúc?) — tra tay`, 5);
  return resolveGSlug(gSlug, catalog, preloaded || await loadFilterValues(s, cfg, category.code));
}

/** URL web → {screen, id, ...} + giá trị SEO hiện tại. */
export async function lookup(s, cfg, url, fetchFn, { checkWeb: wantCheck = false } = {}) {
  const p = parseWebUrl(url, cfg.webOrigin);
  if (p.kind === 'product') throw new MdmError('URL trang sản phẩm — dùng pim-find để tra, product-write để ghi title/description', 2);
  const categories = await loadCategories(s, cfg);
  const cands = categoryCandidates(p.slug, categories);
  if (!cands.length) throw new MdmError(`không danh mục MDM nào có url là tiền tố của "${p.slug}"`, 5);
  let resolved = null;
  let category = null;
  for (const c of cands) {
    if (p.slug === c.url) {
      category = c;
      if (!p.g) { resolved = { screen: 'category', id: c.id, variant: 'category' }; break; }
      const value = await resolveG(s, cfg, c, p.g, fetchFn);
      resolved = { screen: 'filter-value', id: value.id, variant: 'filter-g', value, gSlug: p.g };
      break;
    }
    const rest = p.slug.slice(c.url.length + 1);
    const [brands, filterValues] = [await loadBrands(s, cfg, c.code), await loadFilterValues(s, cfg, c.code)];
    const r = resolveRest(rest, { brands, filterValues });
    if (!r) continue;
    category = c;
    if (!p.g) { resolved = r; break; }
    if (r.variant !== 'brand') throw new MdmError(`"${p.slug}?g=${p.g}": ?g= chỉ đi với trang ngành hàng hoặc trang hãng — dừng, tra tay rồi dùng --screen/--id`, 2);
    const value = await resolveG(s, cfg, c, p.g, fetchFn, filterValues);
    resolved = { screen: 'filter-value', id: value.id, variant: 'brand-filter', brand: r.brand, value, gSlug: p.g };
    break;
  }
  if (!resolved) throw new MdmError(`không giải được "${p.slug}" thành danh mục/hãng/filter (đã thử ${cands.map((c) => c.url).join(', ')})`, 5);
  const info = await readRecord(s, cfg, resolved.screen, resolved.id);
  const fields = seoFieldsFor(resolved);
  const current = Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, { field: f, value: brief(val(info.rawValues, f)) }]));
  const webCheck = wantCheck
    ? await checkWeb(new URL(url, cfg.webOrigin).href, expectedFromRaw(fields, info.rawValues, resolved.variant === 'brand-filter' ? resolved.brand.name : null), { fetchFn })
    : undefined;
  return {
    url, screen: resolved.screen, id: resolved.id, variant: resolved.variant, rowVersion: info.rowVersion,
    category: { id: category.id, code: category.code, url: category.url, name: category.name, cmsCategoryId: category.cmsCategoryId },
    brand: resolved.brand ? { id: resolved.brand.id, url: resolved.brand.url, name: resolved.brand.name } : undefined,
    value: resolved.value ? { id: resolved.value.id, url: resolved.value.url, name: resolved.value.name, filter: resolved.value.filterName } : undefined,
    current,
    webCheck,
    note: resolved.variant === 'brand-filter' ? 'trang Hãng+Filter: web thay [HÃNG] bằng tên hãng; sửa field *_brand_filter là sửa cho MỌI hãng của giá trị này'
      : resolved.variant === 'filter-g' ? `trang lọc ?g=${resolved.gSlug}: ghi title/description/filter_inforbox của giá trị này; slug g= do catalog web quản (MDM url rỗng)` : undefined,
  };
}

export const pimBase = (cfg) => ({ localeCode: 'vi_VN', rootCategoryId: cfg.category.rootId, companyId: cfg.pimCompanyId });

/**
 * Trang SP → model PIM + nút cây. HTML core mới có `modelCode=<mã PIM>`; ô tìm PIM chỉ khớp mã
 * PIM/tên, không khớp ID CMS hay slug. Ép cookie core mới vẫn có lúc rơi node core cũ (không có
 * modelCode) → lấy lại tối đa 6 lần.
 */
export async function resolveProductPage(s, cfg, url, fetchFn, opts = {}) {
  const p = parseWebUrl(url, cfg.webOrigin);
  if (p.kind !== 'product') throw new MdmError('cần URL trang sản phẩm /{danh mục}/{slug}', 2);
  let code;
  if (opts.modelCode != null) {
    // Trang phần mềm không lộ modelCode: cho phép tra tay mã model trên PIM rồi truyền vào (--model-code / "modelCode" trong batch).
    code = String(opts.modelCode);
    if (!/^\d+$/.test(code)) throw new MdmError(`modelCode phải là số, nhận "${opts.modelCode}"`, 2);
  } else {
    let page;
    for (let i = 0; i < 6; i++) {
      page = await fetchCoreMoi(new URL(url, cfg.webOrigin).href, fetchFn);
      if (page.status === 200 && page.coreMoi) break;
    }
    const m = page.html.match(/modelCode=(\d+)/);
    if (!m) throw new MdmError(`trang không có modelCode (status ${page.status}, core mới=${page.coreMoi}) — thử lại, hoặc tra tay mã model trên PIM rồi truyền --model-code`, 5);
    code = m[1];
  }
  const l = await s.post('pim', 'productvariant/getlist', { ...pimBase(cfg), pageSize: 20, keyword: code, pageIndex: 1,
    filterParams: [{ key: 'rootCategoryId', value: cfg.category.rootId }, { key: 'searchType', value: 2 }] });
  const model = (l.object || []).find((o) => o.code === code);
  if (!model) throw new MdmError(`PIM không có model mã ${code}`, 5);
  const tree = await s.post('pim', 'productvariant/getlist4tree', { ...pimBase(cfg), filterParams: [{ key: 'ModelId', value: model.id }] });
  return { slug: p.slug, code, model, nodes: tree.object || [] };
}

/**
 * Trang SP → bản ghi PIM (chỉ đọc; ghi title/description bằng product-write). SP có biến thể:
 * field SEO nằm ở LÁ Màu, 1 trang = mọi lá Màu của 1 Phiên bản.
 */
export async function pimFind(s, cfg, url, fetchFn, opts = {}) {
  const r = await resolveProductPage(s, cfg, url, fetchFn, opts);
  let leaves = r.nodes.filter((n) => n.lvl === Math.max(...r.nodes.map((x) => x.lvl)));
  if (!leaves.length) {
    const g = await s.post('pim', 'model/getinfor', { ...pimBase(cfg), id: r.model.id, isTranslation: true, categoryId: null });
    leaves = [{ id: r.model.id, code: r.model.code, name: r.model.name, lvl: 0, rawValues: g.object && g.object.rawValues }];
  }
  const parse = (rv) => (typeof rv === 'string' ? JSON.parse(rv) : rv || {});
  const rows = leaves.map((n) => {
    const rv = parse(n.rawValues);
    const g = (k) => (Array.isArray(rv[k]) && rv[k][0] ? rv[k][0].data : undefined);
    return { id: n.id, code: n.code, name: n.name, lvl: n.lvl, url: g('url'), title: g('title'), description: brief(g('description')),
      articleLen: (g('product_articles') || '').length, keyFeaturesLen: (g('key_features') || '').length, cmsProductId: g('product_id_cms') || g('model_id_cms') };
  });
  return {
    url, modelCode: r.code, modelId: r.model.id, modelName: r.model.name, family: r.model.familyName,
    leavesForThisPage: rows.filter((x) => x.url === r.slug).map((x) => x.code), leaves: rows,
    note: 'Title/description sửa bằng product-write. Web core mới nhận thay đổi PIM sau tới vài giờ; core cũ đọc CMS.',
  };
}
