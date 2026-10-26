#!/usr/bin/env node
// Xuất bản NGAY bài TopZone đã up (Chờ duyệt → Xuất bản, giờ đăng = quá khứ gần). Chỉ chạy khi user nói rõ "xuất bản" bài/ID đó.
//   node xuat_ban.mjs <newsId>          → dry run
//   node xuat_ban.mjs <newsId> --go     → ghi, đọc lại verify
import path from 'node:path';
import { openNews, evaluate, READ_FN, STATUS } from './cms-tz-lib.mjs';
const id = process.argv[2];
const GO = process.argv.includes('--go');
if (!/^\d+$/.test(id || '')) { console.error('Cách dùng: node xuat_ban.mjs <newsId> [--go]'); process.exit(2); }
const c = await openNews(id, [process.cwd()]);
try {
  const b = await evaluate(c, READ_FN(id), 120000);
  if (String(b.id) !== id) throw new Error('không đọc được bài ' + id);
  console.log(JSON.stringify({ newsId: id, title: b.title, trang_thai: STATUS[(b.status || [])[0]], ngay: `${b.date} ${b.hour}:${b.minute}` }, null, 1));
  if (!GO) { console.log('Dry run. Thêm --go để xuất bản ngay.'); process.exit(0); }
  const now = new Date(Date.now() - 10 * 60000);
  const d = String(now.getDate()).padStart(2, '0') + '/' + String(now.getMonth() + 1).padStart(2, '0') + '/' + now.getFullYear();
  const res = await evaluate(c, `async () => {
    window.alert = () => {}; window.confirm = () => true;
    if ($('#hdNewsId').val() !== ${JSON.stringify(id)}) return { status: 0, error: 'tab sai bài' };
    $('#cboStatus').val('actived');
    $('[name=txtDate]').val(${JSON.stringify(d)}); $('[name=txtHour]').val(${JSON.stringify(String(now.getHours()))}); $('[name=txtMinute]').val(${JSON.stringify(String(now.getMinutes()))});
    const data = getDataSubmitNews();
    if (data.cboStatus !== 'actived' || !data.ContentNews) return { status: 0, error: 'payload sai, không POST' };
    const skip = $('#hdIsSkipSecurity').val() == '1' ? '?skip=1' : '';
    try { const e = await $.ajax({ url: rootUrl + 'News/SubmitNewsEdit' + skip, type: 'POST', dataType: 'json', data }); return { status: e.status, error: e.error }; }
    catch (x) { return { status: -999, error: 'ajax lỗi ' + (x.status || '') }; }
  }`, 120000);
  console.log('submit:', JSON.stringify(res));
  if (!(res.status > 0)) throw new Error('CMS không nhận: ' + res.error);
  const a = await evaluate(c, READ_FN(id), 120000);
  console.log(JSON.stringify({ newsId: id, trang_thai: STATUS[(a.status || [])[0]], ngay: `${a.date} ${a.hour}:${a.minute}`, content_len: a.content.length, link_air: `https://www.topzone.vn/tekzone/${a.url}-${id}` }, null, 1));
} finally { try { c.close && (await c.close()); } catch {} }
process.exit(0);
