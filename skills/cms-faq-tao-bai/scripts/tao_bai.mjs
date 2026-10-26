#!/usr/bin/env node
// Tạo bài Hỏi Đáp mới trên CMS (newsId=0).
// Trạng thái: form.json có publish_date (cột S sheet, dd/mm/yyyy) → 2 Xuất bản hẹn 02:00 ngày đó; trống → 3 Chờ duyệt.
//   node tao_bai.mjs <form.json>        → chỉ kiểm tra (dry run), không mở CMS
//   node tao_bai.mjs <form.json> --go   → tạo bài thật, đọc lại verify
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openEdit, evaluate, toolText, READ_FN, shape, plainText, loadRegistry, saveRegistry, OPTIONS, OUT_DIR, STATUS, sleep } from './cms-faq-lib.mjs';

const [formPath, flag] = process.argv.slice(2);
if (!formPath) { console.error('Cách dùng: node tao_bai.mjs <form.json> [--go]'); process.exit(2); }
const GO = flag === '--go';
const baseDir = path.dirname(path.resolve(formPath));
const f = JSON.parse(fs.readFileSync(formPath, 'utf8'));
const abs = (p) => (p ? path.resolve(baseDir, p.replace(/^~(?=\/)/, process.env.HOME)) : p);

// Slug từ tiêu đề, bỏ dấu, ≤ 50 ký tự. Khi phải cắt thì cắt ở ranh giới CỤM (dấu ? , : - . ; trong tiêu đề) để URL đọc có nghĩa;
// không có cụm nào vừa thì cắt ở ranh giới từ rồi bỏ các từ nối đuôi (va, hay, cua, voi...).
const slugRaw = (s) => s.toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const NOI = new Set(['va', 'hay', 'hoac', 'cua', 'voi', 'cho', 'de', 'la', 'o', 'tai', 'trong', 'khi', 'nhu', 'thi', 'ma', 'co', 'cac', 'nhung', 'mot', 'lua']);
export function slugCms(s, max = 50) {
  const full = slugRaw(s);
  if (full.length <= max) return full;
  let acc = '';
  for (const c of s.split(/[?!,:;.\u2013\u2014()|]+|\s-\s/).map(slugRaw).filter(Boolean)) {
    const nx = acc ? acc + '-' + c : c;
    if (nx.length > max) break;
    acc = nx;
  }
  if (acc.split('-').length >= 3) return acc;
  let t = full.slice(0, max);
  t = full[max] === '-' ? t : t.slice(0, t.lastIndexOf('-'));
  const w = t.split('-');
  while (w.length > 3 && NOI.has(w[w.length - 1])) w.pop();
  return w.join('-');
}

const today = new Date();
const dd = (n) => String(n).padStart(2, '0');
const TODAY = `${dd(today.getDate())}/${dd(today.getMonth() + 1)}/${today.getFullYear()}`;

const v = {
  keyword: (f.keyword || '').trim(),
  title: (f.title || '').trim(),
  url: (f.url || '').trim() || slugCms(f.title || ''),
  thumb: abs(f.thumb),
  child: String(f.child_category ?? '2023'),
  parent: String(f.parent_category ?? ''),
  article_type: f.article_type || 'Tư vấn chọn mua',
  product_related: String(f.product_related || '').replace(/\s+/g, ''),
  meta_title: (f.meta_title || f.title || '').trim(),
  meta_desc: (f.meta_desc || '').trim(),
  tags: (f.tags || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean),
  content_file: abs(f.content_file),
  schema: f.schema || '',
  hide_banner_vccorp: !!f.hide_banner_vccorp,
  publish_date: (f.publish_date || '').trim(),
};
// trạng thái theo ngày xuất bản dự kiến
v.status = v.publish_date ? '2' : '3';
if (v.publish_date) { v.date = v.publish_date; v.hour = '2'; v.minute = '0'; } else { v.date = ''; v.hour = ''; v.minute = ''; }
const content = v.content_file && fs.existsSync(v.content_file) ? fs.readFileSync(v.content_file, 'utf8').trim() : '';

// ---------- kiểm tra ----------
const err = [], warn = [];
const len = (s) => [...s].length;
if (!v.keyword) err.push('thiếu keyword chính');
if (v.publish_date) {
  const m = v.publish_date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const d = m && new Date(+m[3], +m[2] - 1, +m[1], 2, 0);
  if (!d || d.getDate() !== +m[1]) err.push(`publish_date "${v.publish_date}" phải dạng dd/mm/yyyy`);
  else if (d < new Date(today.getFullYear(), today.getMonth(), today.getDate())) err.push(`ngày xuất bản ${v.publish_date} đã qua`);
  else if (d < today) warn.push(`02:00 ngày ${v.publish_date} đã qua, bài sẽ lên ngay khi lưu`);
}
if (!v.title) err.push('thiếu title'); else if (len(v.title) > 70) err.push(`title ${len(v.title)} > 70 ký tự`);
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.url)) err.push(`url "${v.url}" chỉ được a-z 0-9 và "-"`);
if (v.url.length > 100) err.push(`url ${v.url.length} > 100 ký tự`); else if (v.url.length > 50) warn.push(`url ${v.url.length} ký tự (CMS tự sinh tối đa 50)`);
if (len(v.meta_title) > 70) err.push(`meta title ${len(v.meta_title)} > 70`);
if (!v.meta_desc) err.push('thiếu meta description');
else if (len(v.meta_desc) > 170) err.push(`meta description ${len(v.meta_desc)} > 170`);
else if (len(v.meta_desc) > 160) warn.push(`meta description ${len(v.meta_desc)} > 160 (khuyến cáo)`);
const cm = OPTIONS.chuyen_muc_con[v.child];
if (!cm) err.push(`chuyên mục con ${v.child} không có trong CMS`);
else {
  if (!v.parent) v.parent = cm.cha[0] || '';
  if (!cm.cha.includes(v.parent)) err.push(`chuyên mục cha ${v.parent} không thuộc con ${v.child} (${cm.ten}); cha hợp lệ: ${cm.cha.join(', ')}`);
}
if (!OPTIONS.dang_bai_viet.includes(v.article_type)) err.push(`dạng bài viết "${v.article_type}" không có trong CMS`);
if (v.product_related && !/^\d+(,\d+)*$/.test(v.product_related)) err.push('product_related phải là ID số, cách nhau dấu phẩy');
// tag: 2-5, không trùng, có kw chính + ít nhất 1 tag ngành/hãng/dòng
if (v.tags.length < 2 || v.tags.length > 5) err.push(`tags có ${v.tags.length}, cần 2-5`);
if (new Set(v.tags).size !== v.tags.length) err.push('tags bị lặp');
if (v.tags.some((t) => t.includes(','))) err.push('tag không được chứa dấu phẩy');
if (v.keyword && !v.tags.includes(v.keyword.toLowerCase())) err.push('tags phải có keyword chính');
// thumb 560x292
if (!v.thumb || !fs.existsSync(v.thumb)) err.push(`không thấy file thumb ${v.thumb}`);
else {
  const o = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', v.thumb], { encoding: 'utf8' });
  const w = +(o.match(/pixelWidth: (\d+)/) || [])[1], h = +(o.match(/pixelHeight: (\d+)/) || [])[1];
  if (w !== 560 || h !== 292) warn.push(`thumb ${w}x${h}, CMS yêu cầu 560x292`);
  const kb = fs.statSync(v.thumb).size / 1024;
  if (kb > 300) warn.push(`thumb ${kb.toFixed(0)}KB, nên nén nhỏ hơn`);
}
// nội dung
if (!content) err.push(`không đọc được nội dung ${v.content_file}`);
else {
  if (/<(html|body|head)\b/i.test(content)) err.push('nội dung phải là phần thân bài, không có <html>/<body>');
  const plain = content.replace(/<[^>]+>/g, '');
  const dates = [...plain.matchAll(/cập nhật (?:vào )?(?:ngày )?(\d{1,2}\/\d{1,2}\/\d{4})/gi)].map((m) => m[1]);
  const old = dates.filter((d) => d !== TODAY);
  if (old.length) err.push(`ngày cập nhật chưa phải hôm nay ${TODAY}: ${[...new Set(old)].join(', ')}`);
  if (/thiết bị/i.test(content.replace(/<[^>]+>/g, ' '))) warn.push('có chữ "thiết bị": iPhone/sản phẩm TGDĐ phải gọi "sản phẩm"/"máy"');
  if (/<p[^>]*>\s*(?:[-•]|&bull;)\s/i.test(content)) warn.push('có đoạn <p> bắt đầu bằng "-"/"•": bullet phải là <ul><li>');
  if (/đặt trước|đặt cọc|tin đồn|rò rỉ/i.test(content)) warn.push('có từ đặt trước/đặt cọc/tin đồn/rò rỉ, kiểm tra lại');
  const imgs = [...content.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  const bad = [];
  for (const u of imgs) {
    try { const r = await fetch(u, { method: 'HEAD' }); if (r.status !== 200) bad.push(`${r.status} ${u}`); } catch (e) { bad.push(`ERR ${u}`); }
  }
  if (bad.length) err.push('ảnh lỗi trong bài:\n    ' + bad.join('\n    '));
  for (const m of content.matchAll(/<img\b[^>]*>/g)) if (!/\balt="[^"]+"/.test(m[0])) warn.push('ảnh thiếu alt: ' + m[0].slice(0, 120));
}
const reg = loadRegistry();
const dup = reg.find((r) => r.url === v.url || r.title === v.title);
if (dup) err.push(`đã tạo bài này rồi: newsId ${dup.id} (${dup.url}), không tạo lần 2`);

const sh = content ? shape(content) : {};
console.log(JSON.stringify({
  che_do: GO ? 'GO' : 'DRY RUN', trang_thai: v.status === '2' ? `2 = Xuất bản, hẹn 02:00 ${v.publish_date}` : '3 = Chờ duyệt',
  title: `${v.title} (${len(v.title)})`, url: `${v.url} (${v.url.length})`, thumb: v.thumb,
  chuyen_muc_con: `${v.child} ${cm?.ten || '?'}`, chuyen_muc_cha: v.parent, dang_bai_viet: v.article_type,
  san_pham_lien_quan: v.product_related || '(trống)', meta_title: `${v.meta_title} (${len(v.meta_title)})`,
  meta_desc: `${v.meta_desc} (${len(v.meta_desc)})`, tags: v.tags.join(', '), noi_dung: sh,
}, null, 1));
if (warn.length) console.log('CẢNH BÁO:\n- ' + warn.join('\n- '));
if (err.length) { console.log('LỖI (không tạo bài):\n- ' + err.join('\n- ')); process.exit(1); }
if (!GO) { console.log('DRY RUN OK. Chạy lại với --go để tạo bài.'); process.exit(0); }

// ---------- tạo bài ----------
const c = await openEdit(0, [path.dirname(v.thumb)]);
let newId = null;
try {
  const st = await evaluate(c, `() => ({ id: $('#hdNewsId').val(), cur: $('#hdCurrentUrl').val(), title: $('[name=txtTitle]').val() })`, 30000);
  if (st.id !== '0' || st.cur || st.title) throw new Error('tab không phải form trống newsId=0: ' + JSON.stringify(st));
  await evaluate(c, `() => { window.__alerts = []; window.alert = (m) => window.__alerts.push(String(m)); window.confirm = () => true; return 1; }`, 30000);

  // upload thumb qua đúng input #thumbnailNews (html5Uploader tự POST khi đổi file)
  const snap = toolText(await c.callTool('take_snapshot', {}, 60000)).split('\n');
  const i0 = snap.findIndex((l) => l.includes('Ảnh thumb bài viết'));
  const line = snap.slice(Math.max(i0, 0)).find((l) => /Choose File|Chọn tệp/.test(l) && /uid=/.test(l));
  if (i0 < 0 || !line) throw new Error('không tìm thấy nút Choose File của Ảnh thumb');
  await c.callTool('upload_file', { uid: line.match(/uid=(\S+)/)[1], filePaths: [v.thumb] }, 120000);
  const base = path.basename(v.thumb);
  let thumbUrl = '';
  for (let t = 0; t < 20 && !thumbUrl.endsWith(base); t++) {
    await sleep(1500);
    thumbUrl = await evaluate(c, `() => $('input[name=thumbnailNews]').val()`, 30000);
  }
  const alerts1 = await evaluate(c, `() => window.__alerts`, 30000);
  if (!thumbUrl.endsWith(base)) throw new Error(`upload thumb không thành công: "${thumbUrl}" ${JSON.stringify(alerts1)}`);
  console.log('thumb:', thumbUrl);

  // điền form + POST đúng như SubmitNewsEdit(), status ép = 3
  const payload = { ...v, content };
  const res = await evaluate(c, `async () => {
    const v = ${JSON.stringify(payload)};
    $('[name=txtTitle]').val(v.title); $('[name=txtUrl]').val(v.url);
    $('#lst_childcate').val([v.child]); $('#lst_parentcate').html('<option value="' + v.parent + '" selected>' + v.parent + '</option>');
    $('[name=cboArticleType]').val(v.article_type); $('#hdListProductRelated').val(v.product_related);
    $('[name=cbIsHideBannerVCCorp]').prop('checked', v.hide_banner_vccorp);
    $('[name=txtMetaTitle]').val(v.meta_title); $('[name=txtMetaDescription]').val(v.meta_desc);
    $('#hdListKeyword').val(v.tags.join(',')); $('[name=txtSchema]').val(v.schema);
    $('#cboStatus').val(v.status); $('[name=cbIsHot]').prop('checked', true); $('[name=cbIsHide]').prop('checked', false);
    if (v.date) $('[name=txtDate]').val(v.date); if (v.hour !== '') $('[name=txtHour]').val(String(v.hour)); if (v.minute !== '') $('[name=txtMinute]').val(String(v.minute));
    const ed = tinymce.get('content_FaqNews'); ed.setContent(v.content); ed.save();
    const data = GetAllFormData('#submitEditNews');
    data.LstParentCategory = v.parent; data.LstChildCategory = v.child; data.ContentNews = ed.getContent();
    const chk = { cbIsHot: data.cbIsHot, hdNewsId: data.hdNewsId, cboStatus: data.cboStatus, txtTitle: data.txtTitle, txtUrl: data.txtUrl, thumbnailNews: data.thumbnailNews, cboArticleType: data.cboArticleType, hdListKeyword: data.hdListKeyword };
    if (data.hdNewsId !== '0' || data.cboStatus !== v.status || (v.status === '2' && (data.txtDate !== v.date || data.txtHour !== '2' || data.txtMinute !== '0')) || data.txtTitle !== v.title || data.txtUrl !== v.url || !data.thumbnailNews || data.cboArticleType !== v.article_type)
      return { status: 0, error: 'payload sai, không POST', chk };
    const skip = $('#hdIsSkipSecurity').val() == '1' ? '?skip=1' : '';
    try {
      const e = await $.ajax({ url: rootUrl + 'Faq/SubmitNewsEdit' + skip, type: 'POST', data });
      return { status: e.status, error: e.error, chk };
    } catch (x) { return { status: -999, error: 'ajax lỗi: ' + (x.status || '') + ' ' + (x.statusText || ''), chk }; }
  }`, 120000);
  console.log('submit:', JSON.stringify(res));
  if (!(res.status > 0)) throw new Error(`CMS không tạo bài: ${res.error}. ĐỪNG chạy lại mù: vào CMS kiểm tra xem bài đã được tạo chưa.`);
  newId = res.status;
  reg.push({ id: newId, url: v.url, title: v.title, keyword: v.keyword, created: new Date().toISOString(), status: +v.status, publish_date: v.publish_date, form: path.resolve(formPath) });
  saveRegistry(reg);

  // đọc lại verify
  const got = await evaluate(c, READ_FN(newId), 120000);
  const dir = path.join(OUT_DIR, String(newId));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'server.body.html'), got.content);
  fs.writeFileSync(path.join(dir, 'gui-len.body.html'), content);
  const { content: _, ...meta } = got;
  fs.writeFileSync(path.join(dir, 'server.form.json'), JSON.stringify(meta, null, 1));
  const diff = [];
  const eq = (k, a, b) => { if (String(a) !== String(b)) diff.push(`${k}: gửi "${a}" ≠ server "${b}"`); };
  eq('title', v.title, got.title); eq('url', v.url, got.url); eq('thumb', thumbUrl, got.thumb);
  eq('chuyên mục con', v.child, (got.child || []).join(',')); eq('chuyên mục cha', v.parent, (got.parent || []).join(','));
  eq('dạng bài', v.article_type, (got.article_type || []).join(',')); eq('meta title', v.meta_title, got.meta_title);
  eq('meta desc', v.meta_desc, got.meta_desc); eq('tags', v.tags.join(','), got.tags);
  eq('sản phẩm liên quan', v.product_related, got.product_related || ''); eq('trạng thái', v.status, (got.status || []).join(','));
  if (v.status === '2') { eq('ngày đăng', v.date, got.date); eq('giờ đăng', '2:0', `${(got.hour || [])[0]}:${(got.minute || [])[0]}`); }
  const s2 = shape(got.content);
  // TinyMCE bọc shortcode/chữ trần ([info], [/info]...) trong <p> nên không so số <p>; so chữ phải khớp tuyệt đối
  for (const k of Object.keys(sh)) if (k !== 'text_len' && k !== 'p' && sh[k] !== s2[k]) diff.push(`nội dung ${k}: gửi ${sh[k]} ≠ server ${s2[k]}`);
  if (plainText(content) !== plainText(got.content)) diff.push(`chữ trong bài khác nhau (gửi ${sh.text_len}, server ${s2.text_len} ký tự), xem gui-len/server.body.html`);
  console.log(JSON.stringify({ newsId: newId, cms: `https://cms.thegioididong.com/v2/Faq/NewsEdit?newsId=${newId}`, trang_thai: STATUS[(got.status || [])[0]] || got.status, luu_tai: dir, lech: diff.length ? diff : 'không lệch' }, null, 1));
  if (diff.length) process.exitCode = 3;
} finally {
  try { await c.close(); } catch {}
}
process.exit(process.exitCode || 0);
