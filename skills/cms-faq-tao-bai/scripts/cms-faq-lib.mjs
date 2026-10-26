// Dùng chung cho tao_bai.mjs và xuat_ban.mjs: mở form CMS Hỏi Đáp bằng profile Chrome CMS_CHROME_PROFILE, đọc lại bài.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { McpClient, openAndBind, evaluate, toolText } from '../../onpage-mdm-khai-bao/scripts/cms-cli-mcp.mjs';

export { evaluate, toolText };
export const PROFILE = process.env.CMS_CHROME_PROFILE;
if (!PROFILE) { console.error('Thiếu biến môi trường CMS_CHROME_PROFILE (key profile của chrome-profile đã đăng nhập CMS). Xem blog-hoi-dap-tron-goi/SETUP.md'); process.exit(2); }
export const BLOG_ROOT = process.env.BLOG_ROOT || path.join(os.homedir(), 'blog-hoi-dap');
export const EDIT = (id) => `https://cms.thegioididong.com/v2/Faq/NewsEdit?newsId=${id}`;
export const OUT_DIR = path.join(BLOG_ROOT, '_cms-tao-bai');
export const REGISTRY = path.join(OUT_DIR, 'da-tao.json');
export const OPTIONS = JSON.parse(fs.readFileSync(new URL('../references/cms-options.json', import.meta.url), 'utf8'));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HERE = path.dirname(new URL(import.meta.url).pathname);
// chrome-profile cần --force để mở tab mới khi profile đã có tab CMS
const BRIDGE = path.join(os.homedir(), '.local/bin/devtools-mcp-bridge');
if (!process.env.CHROME_DEVTOOLS_MCP_BIN && fs.existsSync(BRIDGE)) process.env.CHROME_DEVTOOLS_MCP_BIN = BRIDGE;
process.env.CHROME_PROFILE_BIN ||= path.join(HERE, 'cp-force.sh');

/** Mở trang sửa bài (id=0 là tạo mới), thử lại vì hub hay báo "No page found". Chỉ dùng TRƯỚC khi POST. */
export async function openEdit(id, roots, tries = 4) {
  let last;
  for (let t = 1; t <= tries; t++) {
    const c = new McpClient({ roots });
    try {
      await c.connect();
      await openAndBind(c, { profile: PROFILE, url: EDIT(id), expectUrlPrefix: 'https://cms.thegioididong.com/v2/Faq/NewsEdit' });
      await sleep(8000);
      const ok = await evaluate(c, `() => !!(window.tinymce && tinymce.get('content_FaqNews') && document.querySelector('#submitEditNews') && document.querySelector('#hdNewsId'))`, 60000);
      if (ok === true) return c;
      throw new Error('form chưa sẵn sàng');
    } catch (e) {
      last = e;
      try { await c.close?.(); } catch {}
      console.error(`mở ${EDIT(id)} lần ${t} lỗi: ${String(e.message).slice(0, 200)}`);
      await sleep(10000);
    }
  }
  throw last;
}

/** Hàm chạy trong trang: GET lại NewsEdit?newsId=id, đọc giá trị server đang lưu. */
export const READ_FN = (id) => `async () => {
  const h = await (await fetch('/v2/Faq/NewsEdit?newsId=${id}', { credentials: 'same-origin', cache: 'no-store' })).text();
  const d = new DOMParser().parseFromString(h, 'text/html');
  const q = (n) => d.querySelector('[name="' + n + '"]');
  const sel = (n) => { const e = q(n); return e ? [...e.querySelectorAll('option')].filter(o => o.hasAttribute('selected')).map(o => o.value) : null; };
  const content = (d.querySelector('#content_FaqNews') || {}).value || '';
  return {
    id: (q('hdNewsId') || {}).value, title: (q('txtTitle') || {}).value, url: (q('txtUrl') || {}).value,
    thumb: (q('thumbnailNews') || {}).value, child: sel('cboChildCategory'), parent: sel('cboParentCategory'),
    article_type: sel('cboArticleType'), product_related: (q('hdListProductRelated') || {}).value,
    meta_title: (q('txtMetaTitle') || {}).value, meta_desc: (q('txtMetaDescription') || {}).value,
    tags: (q('hdListKeyword') || {}).value, schema: (q('txtSchema') || {}).value, status: sel('cboStatus'),
    date: (q('txtDate') || {}).value, hour: sel('txtHour'), minute: sel('txtMinute'),
    content_len: content.length, content
  };
}`;

/** Đếm cấu trúc HTML để so nội dung (TinyMCE chuẩn hoá lại khoảng trắng, thêm tbody...). */
export const plainText = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
export function shape(html) {
  const n = (re) => (html.match(re) || []).length;
  const text = plainText(html);
  return { h2: n(/<h2\b/g), h3: n(/<h3\b/g), h4: n(/<h4\b/g), p: n(/<p\b/g), li: n(/<li\b/g), a: n(/<a\b/g), img: n(/<img\b/g), table: n(/<table\b/g), text_len: text.length };
}

export function loadRegistry() {
  try { return JSON.parse(fs.readFileSync(REGISTRY, 'utf8')); } catch { return []; }
}
export function saveRegistry(list) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(REGISTRY, JSON.stringify(list, null, 1));
}
export const STATUS = { 1: 'Nháp', 2: 'Xuất bản', 3: 'Chờ duyệt', 4: 'Đã duyệt' };
