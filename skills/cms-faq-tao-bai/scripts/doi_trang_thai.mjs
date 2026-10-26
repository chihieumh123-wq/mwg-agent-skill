#!/usr/bin/env node
// Đổi trạng thái bài Hỏi Đáp, giữ nguyên ngày giờ và nội dung.  node doi_trang_thai.mjs <newsId> <1|2|3|4>
import fs from 'node:fs';
import path from 'node:path';
import { openEdit, evaluate, READ_FN, OUT_DIR, STATUS } from './cms-faq-lib.mjs';
const [id, st] = process.argv.slice(2, 4);
if (!/^\d+$/.test(id || '') || !['1', '2', '3', '4'].includes(st)) { console.error('Cách dùng: node doi_trang_thai.mjs <newsId> <1|2|3|4>'); process.exit(2); }
const c = await openEdit(id, [process.cwd()]);
try {
  const before = await evaluate(c, READ_FN(id), 120000);
  const { content, ...meta } = before;
  const dir = path.join(OUT_DIR, id); fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(dir, `truoc-doi-tt-${stamp}.body.html`), content);
  fs.writeFileSync(path.join(dir, `truoc-doi-tt-${stamp}.form.json`), JSON.stringify(meta, null, 1));
  const res = await evaluate(c, `async () => {
    window.alert = () => {}; window.confirm = () => true;
    if ($('#hdNewsId').val() !== ${JSON.stringify(id)}) return { status: 0, error: 'tab sai bài' };
    $('#cboStatus').val(${JSON.stringify(st)});
    const data = GetAllFormData('#submitEditNews');
    data.LstParentCategory = ($('#lst_parentcate').val() || []).join(' ');
    data.LstChildCategory = ($('#lst_childcate').val() || []).join(' ');
    data.ContentNews = tinymce.get('content_FaqNews').getContent();
    if (data.cboStatus !== ${JSON.stringify(st)} || !data.LstChildCategory || !data.ContentNews) return { status: 0, error: 'payload sai, không POST' };
    const skip = $('#hdIsSkipSecurity').val() == '1' ? '?skip=1' : '';
    try { const e = await $.ajax({ url: rootUrl + 'Faq/SubmitNewsEdit' + skip, type: 'POST', data }); return { status: e.status, error: e.error }; }
    catch (x) { return { status: -999, error: 'ajax lỗi ' + (x.status || '') }; }
  }`, 120000);
  console.log('submit:', JSON.stringify(res));
  if (!(res.status > 0)) throw new Error('CMS không nhận: ' + res.error);
  const after = await evaluate(c, READ_FN(id), 120000);
  const same = after.content.replace(/\s/g, '') === content.replace(/\s/g, '') && `${before.date} ${before.hour}:${before.minute}` === `${after.date} ${after.hour}:${after.minute}`;
  console.log(JSON.stringify({ newsId: id, trang_thai: STATUS[(after.status || [])[0]], ngay: `${after.date} ${after.hour}:${after.minute}`, noi_dung_ngay_giu: same ? 'giữ nguyên' : 'LỆCH' }));
} finally { try { await c.close(); } catch {} }
process.exit(0);
