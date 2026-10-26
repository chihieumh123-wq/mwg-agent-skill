// Đóng các tab CMS thegioididong (NewsEdit) mà script mở ra: node dong_tab_cms.mjs
import { McpClient, pagesFromListResult } from '../../onpage-mdm-khai-bao/scripts/cms-cli-mcp.mjs';
import os from 'node:os';
const c = new McpClient({ roots: [(process.env.BLOG_ROOT || os.homedir() + '/blog-hoi-dap')] });
await c.connect();
const pages = pagesFromListResult(await c.callTool('list_pages', {}, 60000));
let n = 0;
for (const p of pages) {
  if (/cms\.thegioididong\.com\/v2\/(Faq|News)\/NewsEdit/.test(p.url)) {
    try { await c.callTool('close_page', { pageId: p.id }, 15000); n++; } catch (e) { console.error('không đóng được', p.id, String(e.message).slice(0, 100)); }
  }
}
console.log(`đã đóng ${n}/${pages.length} tab`);
try { await c.close(); } catch {}
