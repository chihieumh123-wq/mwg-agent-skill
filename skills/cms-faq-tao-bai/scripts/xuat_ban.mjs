#!/usr/bin/env node
// Chuyển bài Hỏi Đáp sang Xuất bản. CHỈ chạy khi user bảo "xuất bản".
//   node xuat_ban.mjs <newsId>                 → xem trạng thái hiện tại (không ghi)
//   node xuat_ban.mjs <newsId> --go            → xuất bản, ngày giờ = lúc chạy
//   node xuat_ban.mjs <newsId> --go --giu-gio  → xuất bản, giữ ngày giờ đang khai báo
import fs from 'node:fs';
import path from 'node:path';
import { openEdit, evaluate, READ_FN, shape, loadRegistry, saveRegistry, OUT_DIR, STATUS } from './cms-faq-lib.mjs';

const id = process.argv[2];
const GO = process.argv.includes('--go');
const KEEP_TIME = process.argv.includes('--giu-gio');
if (!/^\d+$/.test(id || '')) { console.error('Cách dùng: node xuat_ban.mjs <newsId> [--go] [--giu-gio]'); process.exit(2); }

const c = await openEdit(id, [process.cwd()]);
try {
  const before = await evaluate(c, READ_FN(id), 120000);
  if (String(before.id) !== id) throw new Error(`không đọc được bài ${id}`);
  const { content: bodyBefore, ...metaBefore } = before;
  const dir = path.join(OUT_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(dir, `truoc-xuat-ban-${stamp}.form.json`), JSON.stringify(metaBefore, null, 1));
  fs.writeFileSync(path.join(dir, `truoc-xuat-ban-${stamp}.body.html`), bodyBefore);
  console.log(JSON.stringify({ newsId: id, title: before.title, url: before.url, trang_thai: STATUS[(before.status || [])[0]], ngay: `${before.date} ${before.hour}:${before.minute}` }, null, 1));
  if (!GO) { console.log('Chỉ xem. Thêm --go để xuất bản.'); process.exit(0); }
  if ((before.status || [])[0] === '2') { console.log('Bài đã ở trạng thái Xuất bản, không làm gì.'); process.exit(0); }

  const now = new Date();
  const dd = (n) => String(n).padStart(2, '0');
  const t = KEEP_TIME ? null : { date: `${dd(now.getDate())}/${dd(now.getMonth() + 1)}/${now.getFullYear()}`, hour: String(now.getHours()), minute: String(now.getMinutes()) };
  const res = await evaluate(c, `async () => {
    window.alert = () => {}; window.confirm = () => true;
    const t = ${JSON.stringify(t)};
    if ($('#hdNewsId').val() !== ${JSON.stringify(id)}) return { status: 0, error: 'tab sai bài' };
    $('#cboStatus').val('2');
    if (t) { $('[name=txtDate]').val(t.date); $('[name=txtHour]').val(t.hour); $('[name=txtMinute]').val(t.minute); }
    const data = GetAllFormData('#submitEditNews');
    data.LstParentCategory = ($('#lst_parentcate').val() || []).join(' ');
    data.LstChildCategory = ($('#lst_childcate').val() || []).join(' ');
    data.ContentNews = tinymce.get('content_FaqNews').getContent();
    if (data.cboStatus !== '2' || !data.LstChildCategory || !data.ContentNews) return { status: 0, error: 'payload sai, không POST' };
    const skip = $('#hdIsSkipSecurity').val() == '1' ? '?skip=1' : '';
    try { const e = await $.ajax({ url: rootUrl + 'Faq/SubmitNewsEdit' + skip, type: 'POST', data }); return { status: e.status, error: e.error }; }
    catch (x) { return { status: -999, error: 'ajax lỗi ' + (x.status || '') }; }
  }`, 120000);
  console.log('submit:', JSON.stringify(res));
  if (!(res.status > 0)) throw new Error('CMS không nhận: ' + res.error + '. Kiểm tra CMS trước khi chạy lại.');

  const after = await evaluate(c, READ_FN(id), 120000);
  const diff = [];
  for (const k of ['title', 'url', 'thumb', 'meta_title', 'meta_desc', 'tags', 'product_related']) if (String(before[k]) !== String(after[k])) diff.push(`${k} đổi: "${before[k]}" → "${after[k]}"`);
  for (const k of ['child', 'parent', 'article_type']) if ((before[k] || []).join() !== (after[k] || []).join()) diff.push(`${k} đổi`);
  const a = shape(bodyBefore), b = shape(after.content);
  for (const k of Object.keys(a)) if (k !== 'text_len' && k !== 'p' && a[k] !== b[k]) diff.push(`nội dung ${k}: ${a[k]} → ${b[k]}`);
  if ((after.status || [])[0] !== '2') diff.push('trạng thái chưa thành Xuất bản');
  const reg = loadRegistry(); const r = reg.find((x) => String(x.id) === id); if (r) { r.status = 2; r.published = new Date().toISOString(); saveRegistry(reg); }
  console.log(JSON.stringify({ newsId: id, trang_thai: STATUS[(after.status || [])[0]], ngay: `${after.date} ${after.hour}:${after.minute}`, lech: diff.length ? diff : 'không lệch' }, null, 1));
  if (diff.length) process.exitCode = 3;
} finally {
  try { await c.close(); } catch {}
}
process.exit(process.exitCode || 0);
