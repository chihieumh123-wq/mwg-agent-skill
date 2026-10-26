#!/usr/bin/env node
// Thay NỘI DUNG bài TopZone đã có trên CMS V2 (giữ nguyên trạng thái, ngày giờ, tag, thumb, chuyên mục).
//   node cap_nhat_noi_dung.mjs <newsId> <noi-dung.html>          → dry run (backup + so sánh, không ghi)
//   node cap_nhat_noi_dung.mjs <newsId> <noi-dung.html> --go     → ghi, đọc lại verify
import fs from 'node:fs';
import path from 'node:path';
import { openNews, evaluate, READ_FN, OUT_DIR, STATUS, shape, plainText } from './cms-tz-lib.mjs';

const [id, file] = process.argv.slice(2, 4);
const GO = process.argv.includes('--go');
if (!/^\d+$/.test(id || '') || !file) { console.error('Cách dùng: node cap_nhat_noi_dung.mjs <newsId> <noi-dung.html> [--go]'); process.exit(2); }
const html = fs.readFileSync(file, 'utf8');
const imgs = (s) => (s.match(/<img\b/g) || []).length;

const c = await openNews(id, [process.cwd(), path.dirname(path.resolve(file))]);
try {
  const before = await evaluate(c, READ_FN(id), 120000);
  if (String(before.id) !== id) throw new Error(`không đọc được bài ${id}`);
  const { content: bodyBefore, ...metaBefore } = before;
  const dir = path.join(OUT_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(dir, `truoc-cap-nhat-${stamp}.form.json`), JSON.stringify(metaBefore, null, 1));
  fs.writeFileSync(path.join(dir, `truoc-cap-nhat-${stamp}.body.html`), bodyBefore);
  console.log(JSON.stringify({ newsId: id, title: before.title, trang_thai: STATUS[(before.status || [])[0]], ngay: `${before.date} ${before.hour}:${before.minute}`, anh_cu: imgs(bodyBefore), anh_moi: imgs(html) }, null, 1));
  const lastFile = path.join(dir, 'live-sau-ghi.body.html');
  if (fs.existsSync(lastFile) && fs.readFileSync(lastFile, 'utf8') !== bodyBefore) {
    console.log('CẢNH BÁO: nội dung live KHÁC bản em ghi lần trước, có thể user đã sửa tay trên CMS. Sửa trên nền bản live (truoc-cap-nhat-*.body.html vừa backup). Bỏ qua bằng --force.');
    if (GO && !process.argv.includes('--force')) { console.error('Dừng, không ghi.'); process.exit(4); }
  }
  if (!GO) { console.log('Dry run, đã backup. Thêm --go để ghi.'); process.exit(0); }

  const res = await evaluate(c, `async () => {
    window.alert = () => {}; window.confirm = () => true;
    if ($('#hdNewsId').val() !== ${JSON.stringify(id)}) return { status: 0, error: 'tab sai bài' };
    const ed = tinymce.get('contentNewsAva'); ed.setContent(${JSON.stringify(html)}); ed.save();
    await new Promise(r => setTimeout(r, 400));
    const data = getDataSubmitNews();
    if (!data.LstCategoryId || !data.ContentNews || !data.thumbnailNews) return { status: 0, error: 'payload sai, không POST' };
    const skip = $('#hdIsSkipSecurity').val() == '1' ? '?skip=1' : '';
    try { const e = await $.ajax({ url: rootUrl + 'News/SubmitNewsEdit' + skip, type: 'POST', dataType: 'json', data }); return { status: e.status, error: e.error }; }
    catch (x) { return { status: -999, error: 'ajax lỗi ' + (x.status || '') }; }
  }`, 120000);
  console.log('submit:', JSON.stringify(res));
  if (!(res.status > 0)) throw new Error('CMS không nhận: ' + res.error + '. Kiểm tra CMS trước khi chạy lại.');

  const after = await evaluate(c, READ_FN(id), 120000);
  const diff = [];
  for (const k of ['title', 'url', 'thumb', 'meta_title', 'meta_desc', 'tags', 'product_cate']) if (String(before[k]) !== String(after[k])) diff.push(`${k} đổi`);
  if ([...(before.cates || [])].sort().join() !== [...(after.cates || [])].sort().join()) diff.push('chuyên mục đổi');
  if ((before.status || [])[0] !== (after.status || [])[0]) diff.push('trạng thái đổi');
  if (`${before.date} ${before.hour}:${before.minute}` !== `${after.date} ${after.hour}:${after.minute}`) diff.push('ngày giờ đổi');
  if (imgs(after.content) !== imgs(html)) diff.push(`số ảnh server ${imgs(after.content)} ≠ gửi ${imgs(html)}`);
  fs.writeFileSync(lastFile, after.content);
  console.log(JSON.stringify({ newsId: id, trang_thai: STATUS[(after.status || [])[0]], ngay: `${after.date} ${after.hour}:${after.minute}`, anh: imgs(after.content), shape: shape(after.content), lech: diff.length ? diff : 'không lệch' }, null, 1));
  if (diff.length) process.exitCode = 3;
} finally {
  try { await c.close(); } catch {}
}
process.exit(process.exitCode || 0);
