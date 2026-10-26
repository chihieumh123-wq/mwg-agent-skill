// Dùng chung: mở form CMS V2 bài tin TopZone (News/NewsEdit, siteId=16) bằng profile Chrome CMS_CHROME_PROFILE_TOPZONE (mặc định CMS_CHROME_PROFILE), đọc lại bài.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { McpClient, openProfileTab, pagesFromListResult, urlHasMarker, evaluate, toolText } from '../../onpage-mdm-khai-bao/scripts/cms-cli-mcp.mjs';

export { evaluate, toolText };
export const PROFILE = process.env.CMS_CHROME_PROFILE_TOPZONE || process.env.CMS_CHROME_PROFILE;
if (!PROFILE) { console.error('Thiếu biến môi trường CMS_CHROME_PROFILE (hoặc CMS_CHROME_PROFILE_TOPZONE). Xem blog-hoi-dap-tron-goi/SETUP.md'); process.exit(2); }
const BLOG_ROOT = process.env.BLOG_ROOT || path.join(os.homedir(), 'blog-hoi-dap');
export const SITE = 16;
export const EDIT = (id) => `https://cms.thegioididong.com/v2/News/NewsEdit?newsId=${id}&siteId=${SITE}`;
export const OUT_DIR = path.join(BLOG_ROOT, '_cms-tao-bai-topzone');
export const REGISTRY = path.join(OUT_DIR, 'da-tao.json');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const BRIDGE = path.join(os.homedir(), '.local/bin/devtools-mcp-bridge');
if (!process.env.CHROME_DEVTOOLS_MCP_BIN && fs.existsSync(BRIDGE)) process.env.CHROME_DEVTOOLS_MCP_BIN = BRIDGE;
process.env.CHROME_PROFILE_BIN ||= path.join(HERE, '../../cms-faq-tao-bai/scripts/cp-force.sh');

// Chuyên mục (data-id của .sticker.newscategory), xác minh 25/10/2026 trên 10 bài Tekzone gần đây (trừ bài Code game):
// luôn có Tin tức TopZone + Mới nhất; bài hướng dẫn/hỏi đáp thêm Guides + chuyên mục sản phẩm. Tin/Deals thì khác (không Guides).
export const CATE = { tin_tuc: 2124, moi_nhat: 2151, deals: 2127, guides: 2128, dich_vu_deal: 2135,
  guides_iphone: 2136, guides_ipad: 2138, guides_mac: 2137, guides_watch: 2139, guides_amthanh: 2147, guides_phukien: 2143, guides_dichvu: 2148 };
export const CATE_NAME = { 2124: 'Tin tức TopZone', 2151: 'Mới nhất', 2127: 'Deals', 2128: 'Guides', 2135: 'Dịch vụ (Deals)', 2136: 'iPhone', 2138: 'iPad', 2137: 'Mac', 2139: 'Watch', 2147: 'Âm thanh', 2143: 'Phụ kiện', 2148: 'Dịch vụ (Guides)' };
// ngành hàng (hdListCategory) hay dùng: iPhone 42, MacBook 44, Tai nghe 54, Phụ kiện 482; bài Âm thanh/Watch để trống
export const PRODUCT_CATE = { iphone: '42', macbook: '44', 'tai nghe': '54', 'phụ kiện': '482' };

/** Mở trang sửa bài (id=0 là tạo mới), bám đúng tab bằng bind_selector + select_page. Chỉ dùng TRƯỚC khi POST. */
export async function openNews(id, roots, tries = 3) {
  let last;
  for (let t = 1; t <= tries; t++) {
    const c = new McpClient({ roots });
    try {
      await c.connect();
      const open = await openProfileTab({ profile: PROFILE, url: EDIT(id) });
      await sleep(8000);
      let pid = null;
      for (let i = 0; i < 12 && pid == null; i++) {
        const pages = pagesFromListResult(await c.callTool('list_pages', {}, 60000));
        const hit = pages.filter((p) => urlHasMarker(p.url, open.bind_selector));
        if (hit.length === 1) pid = hit[0].id; else await sleep(1500);
      }
      if (pid == null) throw new Error('không thấy tab vừa mở');
      await c.callTool('select_page', { pageId: pid, bringToFront: false }, 30000);
      c.pageId = pid;
      const ok = await evaluate(c, `() => !!(window.tinymce && tinymce.get('contentNewsAva') && document.querySelector('#submitEditNews') && document.querySelector('#hdNewsId') && $('#hdSiteId').val() === '16')`, 60000);
      if (ok !== true) throw new Error('form chưa sẵn sàng');
      return c;
    } catch (e) {
      last = e;
      try { await c.close?.(); } catch {}
      console.error(`mở ${EDIT(id)} lần ${t} lỗi: ${String(e.message).slice(0, 200)}`);
      await sleep(8000);
    }
  }
  throw last;
}

/** Hàm chạy trong trang: GET lại NewsEdit?newsId=id&siteId=16, đọc giá trị server đang lưu. */
export const READ_FN = (id) => `async () => {
  const h = await (await fetch('/v2/News/NewsEdit?newsId=${id}&siteId=16', { credentials: 'same-origin', cache: 'no-store' })).text();
  const d = new DOMParser().parseFromString(h, 'text/html');
  const q = (n) => d.querySelector('[name="' + n + '"]');
  const sel = (n) => { const e = q(n); return e ? [...e.querySelectorAll('option')].filter(o => o.hasAttribute('selected')).map(o => o.value) : null; };
  const content = (d.querySelector('#contentNewsAva') || {}).value || '';
  return {
    id: (q('hdNewsId') || {}).value, title: (q('txtTitle') || {}).value, url: (q('txtUrl') || {}).value,
    thumb: (q('thumbnailNews') || {}).value, product_cate: (d.querySelector('#hdListCategory') || {}).value,
    cates: [...d.querySelectorAll('.sticker.newscategory li')].map(e => e.getAttribute('data-id')),
    tags: (q('txtTag') || {}).value, meta_title: (q('txtMetaTitle') || {}).value, meta_desc: (q('txtMetaDescription') || {}).value,
    meta_kw: (q('txtMetaKeyword') || {}).value, status: sel('cboStatus'), date: (q('txtDate') || {}).value, hour: sel('txtHour'), minute: sel('txtMinute'),
    content_len: content.length, content
  };
}`;

export const plainText = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
export function shape(html) {
  const n = (re) => (html.match(re) || []).length;
  return { h2: n(/<h2\b/g), h3: n(/<h3\b/g), p: n(/<p\b/g), li: n(/<li\b/g), a: n(/<a\b/g), img: n(/<img\b/g), table: n(/<table\b/g), product_sc: n(/\[product /g), caption_sc: n(/\[captionnews\]/g), text_len: plainText(html).length };
}
export function loadRegistry() { try { return JSON.parse(fs.readFileSync(REGISTRY, 'utf8')); } catch { return []; } }
export function saveRegistry(list) { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(REGISTRY, JSON.stringify(list, null, 1)); }
export const STATUS = { draft: 'Nháp', pending: 'Chờ duyệt', approved: 'Đã duyệt', actived: 'Xuất bản' };
