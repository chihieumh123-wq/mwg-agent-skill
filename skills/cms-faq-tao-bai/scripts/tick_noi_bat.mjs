#!/usr/bin/env node
// Tick "Bài viết nổi bật" (cbIsHot) cho bài Hỏi Đáp đã có, giữ nguyên trạng thái, ngày giờ, nội dung.
//   node tick_noi_bat.mjs <id> [<id>...] [--go]     (không --go: chỉ báo trạng thái hiện tại)
import fs from 'node:fs';
import path from 'node:path';
import { openEdit, evaluate, READ_FN, OUT_DIR, STATUS } from './cms-faq-lib.mjs';
const args = process.argv.slice(2), go = args.includes('--go');
const ids = args.filter(a => /^\d+$/.test(a));
if (!ids.length) { console.error('Cách dùng: node tick_noi_bat.mjs <id> [<id>...] [--go]'); process.exit(2); }
for (const id of ids) {
  const c = await openEdit(id, [process.cwd()]);
  try {
    const cur = await evaluate(c, `() => ({ hot: $('[name=cbIsHot]').prop('checked'), hide: $('[name=cbIsHide]').prop('checked') })`, 60000);
    console.log(id, 'hiện tại:', JSON.stringify(cur));
    if (cur.hot) { console.log(id, 'đã tick, bỏ qua'); continue; }
    if (!go) continue;
    const before = await evaluate(c, READ_FN(id), 120000);
    const { content, ...meta } = before;
    const dir = path.join(OUT_DIR, id); fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(dir, `truoc-tick-noi-bat-${stamp}.body.html`), content);
    fs.writeFileSync(path.join(dir, `truoc-tick-noi-bat-${stamp}.form.json`), JSON.stringify(meta, null, 1));
    const res = await evaluate(c, `async () => {
      window.alert = () => {}; window.confirm = () => true;
      if ($('#hdNewsId').val() !== ${JSON.stringify(id)}) return { status: 0, error: 'tab sai bài' };
      $('[name=cbIsHot]').prop('checked', true);
      const data = GetAllFormData('#submitEditNews');
      data.LstParentCategory = ($('#lst_parentcate').val() || []).join(' ');
      data.LstChildCategory = ($('#lst_childcate').val() || []).join(' ');
      data.ContentNews = tinymce.get('content_FaqNews').getContent();
      if (!data.cbIsHot || !data.LstChildCategory || !data.ContentNews) return { status: 0, error: 'payload sai, không POST', hot: data.cbIsHot };
      const skip = $('#hdIsSkipSecurity').val() == '1' ? '?skip=1' : '';
      try { const e = await $.ajax({ url: rootUrl + 'Faq/SubmitNewsEdit' + skip, type: 'POST', data }); return { status: e.status, error: e.error }; }
      catch (x) { return { status: -999, error: 'ajax lỗi ' + (x.status || '') }; }
    }`, 120000);
    console.log(id, 'submit:', JSON.stringify(res));
    if (!(res.status > 0)) throw new Error('CMS không nhận: ' + res.error);
    const after = await evaluate(c, READ_FN(id), 120000);
    const same = after.content.replace(/\s/g, '') === content.replace(/\s/g, '') && `${before.date} ${before.hour}:${before.minute}` === `${after.date} ${after.hour}:${after.minute}` && String(before.status) === String(after.status);
    console.log(JSON.stringify({ newsId: id, trang_thai: STATUS[(after.status || [])[0]], ngay: `${after.date} ${after.hour}:${after.minute}`, giu_nguyen: same ? 'ok' : 'LỆCH' }));
  } finally { try { await c.close(); } catch {} }
}
process.exit(0);
