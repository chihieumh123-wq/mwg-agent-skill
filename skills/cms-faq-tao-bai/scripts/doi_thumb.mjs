#!/usr/bin/env node
// Đổi THUMB bài Hỏi Đáp đã có, giữ nguyên mọi trường khác (lấy từ form live vừa mở).
//   node doi_thumb.mjs <newsId> <thumb.jpg> [--go]   (tên file thumb phải chưa từng upload)
import fs from 'node:fs';
import path from 'node:path';
import { openEdit, evaluate, toolText, READ_FN, OUT_DIR, STATUS, sleep } from './cms-faq-lib.mjs';

const [id, file] = process.argv.slice(2, 4);
const GO = process.argv.includes('--go');
if (!/^\d+$/.test(id || '') || !file) { console.error('Cách dùng: node doi_thumb.mjs <newsId> <thumb.jpg> [--go]'); process.exit(2); }
const abs = path.resolve(file);
const c = await openEdit(id, [path.dirname(abs)]);
try {
  const before = await evaluate(c, READ_FN(id), 120000);
  if (String(before.id) !== id) throw new Error(`không đọc được bài ${id}`);
  const dir = path.join(OUT_DIR, id); fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(dir, `truoc-doi-thumb-${stamp}.json`), JSON.stringify(before, null, 1));
  console.log(JSON.stringify({ newsId: id, title: before.title, thumb_cu: before.thumb, trang_thai: STATUS[(before.status || [])[0]], ngay: `${before.date} ${before.hour}:${before.minute}` }, null, 1));
  if (!GO) { console.log('Dry run, đã backup. Thêm --go.'); process.exit(0); }

  await evaluate(c, `() => { window.__alerts = []; window.alert = (m) => window.__alerts.push(String(m)); window.confirm = () => true; return 1; }`, 30000);
  const snap = toolText(await c.callTool('take_snapshot', {}, 60000)).split('\n');
  const i0 = snap.findIndex((l) => l.includes('Ảnh thumb bài viết'));
  const line = snap.slice(Math.max(i0, 0)).find((l) => /Choose File|Chọn tệp/.test(l) && /uid=/.test(l));
  if (i0 < 0 || !line) throw new Error('không thấy nút Choose File của Ảnh thumb');
  await c.callTool('upload_file', { uid: line.match(/uid=(\S+)/)[1], filePaths: [abs] }, 120000);
  const base = path.basename(abs); let thumbUrl = '';
  for (let t = 0; t < 20 && !thumbUrl.endsWith(base); t++) { await sleep(1500); thumbUrl = await evaluate(c, `() => $('input[name=thumbnailNews]').val()`, 30000); }
  if (!thumbUrl.endsWith(base)) throw new Error('upload thumb không thành công: ' + thumbUrl);
  console.log('thumb mới:', thumbUrl);

  const res = await evaluate(c, `async () => {
    if ($('#hdNewsId').val() !== ${JSON.stringify(id)}) return { status: 0, error: 'tab sai bài' };
    tinymce.get('content_FaqNews').save();
    const data = GetAllFormData('#submitEditNews');
    data.LstParentCategory = ($('#lst_parentcate').val() || []).join(' ');
    data.LstChildCategory = ($('#lst_childcate').val() || []).join(' ');
    data.ContentNews = tinymce.get('content_FaqNews').getContent();
    if (!data.LstChildCategory || !data.ContentNews) return { status: 0, error: 'payload sai, không POST' };
    const skip = $('#hdIsSkipSecurity').val() == '1' ? '?skip=1' : '';
    try { const e = await $.ajax({ url: rootUrl + 'Faq/SubmitNewsEdit' + skip, type: 'POST', data }); return { status: e.status, error: e.error }; }
    catch (x) { return { status: -999, error: 'ajax lỗi ' + (x.status || '') }; }
  }`, 120000);
  console.log('submit:', JSON.stringify(res));
  if (!(res.status > 0)) throw new Error('CMS không nhận: ' + res.error);
  const after = await evaluate(c, READ_FN(id), 120000);
  const diff = [];
  for (const k of ['title', 'url', 'meta_title', 'meta_desc', 'tags', 'product_related']) if (String(before[k]) !== String(after[k])) diff.push(`${k} đổi`);
  if (!String(after.thumb).endsWith(base)) diff.push('thumb chưa đổi');
  if ((before.status || [])[0] !== (after.status || [])[0]) diff.push('trạng thái đổi');
  if (`${before.date} ${before.hour}:${before.minute}` !== `${after.date} ${after.hour}:${after.minute}`) diff.push('ngày giờ đổi');
  const txt = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (txt(before.content) !== txt(after.content)) diff.push('chữ trong bài đổi');
  console.log(JSON.stringify({ thumb: after.thumb, lech: diff.length ? diff : 'không lệch' }, null, 1));
  if (diff.length) process.exitCode = 3;
} finally { try { c.close && (await c.close()); } catch {} }
process.exit(process.exitCode || 0);
