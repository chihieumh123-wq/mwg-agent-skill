#!/usr/bin/env node
// Tạo bài mới trên CMS V2 TopZone (News/NewsEdit?newsId=0&siteId=16), profile Chrome CMS_CHROME_PROFILE_TOPZONE.
// Trạng thái: form.json có publish_date (dd/mm/yyyy) → Xuất bản hẹn 02:00 ngày đó; trống → Chờ duyệt.
//   node tao_bai.mjs <form.json>        → chỉ kiểm tra (dry run), không mở CMS
//   node tao_bai.mjs <form.json> --go   → tạo bài thật, đọc lại verify
// form.json: { keyword, title, url?, thumb (1200x628 jpg), content_file, cates: [2124,2151,2128,2136] hoặc tên khoá CATE,
//   product_cate: "42"|"" , meta_title?, meta_desc, tags: [..], publish_date? }
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openNews, evaluate, toolText, READ_FN, shape, plainText, loadRegistry, saveRegistry, OUT_DIR, STATUS, CATE, CATE_NAME, sleep } from './cms-tz-lib.mjs';

const [formPath, flag] = process.argv.slice(2);
if (!formPath) { console.error('Cách dùng: node tao_bai.mjs <form.json> [--go]'); process.exit(2); }
const GO = flag === '--go';
const baseDir = path.dirname(path.resolve(formPath));
const f = JSON.parse(fs.readFileSync(formPath, 'utf8'));
const abs = (p) => (p ? path.resolve(baseDir, p.replace(/^~(?=\/)/, process.env.HOME)) : p);

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
  cates: (f.cates || []).map((c) => String(CATE[c] ?? c)),
  product_cate: String(f.product_cate ?? ''),
  meta_title: (f.meta_title || f.title || '').trim(),
  meta_desc: (f.meta_desc || '').trim(),
  tags: (f.tags || []).map((t) => String(t).trim()).filter(Boolean),
  content_file: abs(f.content_file),
  publish_date: (f.publish_date || '').trim(),
};
v.status = v.publish_date ? 'actived' : 'pending';
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
if (v.url.length > 100) err.push(`url ${v.url.length} > 100 ký tự`); else if (v.url.length > 50) warn.push(`url ${v.url.length} ký tự (nên ≤ 50)`);
if (len(v.meta_title) > 70) err.push(`meta title ${len(v.meta_title)} > 70`);
if (!v.meta_desc) err.push('thiếu meta description');
else if (len(v.meta_desc) > 170) err.push(`meta description ${len(v.meta_desc)} > 170`);
else if (len(v.meta_desc) > 160) warn.push(`meta description ${len(v.meta_desc)} > 160 (khuyến cáo)`);
// chuyên mục: luôn có Tin tức TopZone + Mới nhất; bài hỏi đáp/hướng dẫn thêm Guides + chuyên mục sản phẩm
for (const c of v.cates) if (!CATE_NAME[c]) err.push(`chuyên mục ${c} không có trong bảng CATE`);
for (const must of [CATE.tin_tuc, CATE.moi_nhat]) if (!v.cates.includes(String(must))) err.push(`thiếu chuyên mục ${CATE_NAME[must]} (${must})`);
if (new Set(v.cates).size !== v.cates.length) err.push('chuyên mục bị lặp');
if (!v.cates.includes(String(CATE.guides)) && !v.cates.includes(String(CATE.deals))) warn.push('không có Guides/Deals, bài Hỏi Đáp/hướng dẫn thường có Guides (2128)');
if (v.tags.length < 2 || v.tags.length > 6) err.push(`tags có ${v.tags.length}, cần 2-6`);
if (new Set(v.tags.map((t) => t.toLowerCase())).size !== v.tags.length) err.push('tags bị lặp');
if (v.tags.some((t) => t.includes(','))) err.push('tag không được chứa dấu phẩy');
if (v.keyword && !v.tags.map((t) => t.toLowerCase()).includes(v.keyword.toLowerCase())) err.push('tags phải có keyword chính');
// thumb 1200x628
if (!v.thumb || !fs.existsSync(v.thumb)) err.push(`không thấy file thumb ${v.thumb}`);
else {
  const o = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', v.thumb], { encoding: 'utf8' });
  const w = +(o.match(/pixelWidth: (\d+)/) || [])[1], h = +(o.match(/pixelHeight: (\d+)/) || [])[1];
  if (w !== 1200 || h !== 628) err.push(`thumb ${w}x${h}, CMS TopZone yêu cầu 1200x628`);
  const kb = fs.statSync(v.thumb).size / 1024;
  if (kb > 500) warn.push(`thumb ${kb.toFixed(0)}KB, nên nén < 500KB`);
}
// nội dung
if (!content) err.push(`không đọc được nội dung ${v.content_file}`);
else {
  if (/<(html|body|head)\b/i.test(content)) err.push('nội dung phải là phần thân bài, không có <html>/<body>');
  const plain = content.replace(/<[^>]+>/g, '');
  const dates = [...plain.matchAll(/cập nhật (?:vào )?(?:ngày )?(\d{1,2}\/\d{1,2}\/\d{4})/gi)].map((m) => m[1]);
  const old = dates.filter((d) => d !== TODAY);
  if (old.length) err.push(`ngày cập nhật chưa phải hôm nay ${TODAY}: ${[...new Set(old)].join(', ')}`);
  if (!/<h2\b/i.test(content)) warn.push('thiếu <h2> sapo (bài TopZone mở bằng ảnh đầu bài rồi H2 sapo)');
  if (!/class="postarticle"/.test(content)) warn.push('chưa có nút CTA cam (a.postarticle)');
  const xt = content.split(/Xem th(?:ê|&ecirc;)m:/i)[1];
  if (xt) { const n = (xt.match(/<li\b/g) || []).length; if (n !== 3) warn.push(`Xem thêm có ${n} bài, TopZone dùng 3 bài`); } else warn.push('chưa có "Xem thêm:" 3 bài');
  if (/\[product\s/i.test(content.split(/<h3\b/i)[0])) err.push('shortcode [product] nằm ở đầu bài, TopZone chèn ở mục thân bài/cuối bài');
  if (/style="[^"]*(?:background|color)/i.test(content.replace(/<a class="postarticle"[\s\S]*?<\/a>/g, ''))) warn.push('có tô màu chữ/nền ngoài nút CTA, TopZone không tô màu');
  if (/thiết bị/i.test(plain)) warn.push('có chữ "thiết bị": sản phẩm phải gọi "sản phẩm"/"máy"');
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
  che_do: GO ? 'GO' : 'DRY RUN', trang_thai: v.status === 'actived' ? `Xuất bản, hẹn 02:00 ${v.publish_date}` : 'Chờ duyệt',
  title: `${v.title} (${len(v.title)})`, url: `${v.url} (${v.url.length})`, thumb: v.thumb,
  chuyen_muc: v.cates.map((c) => `${c} ${CATE_NAME[c] || '?'}`).join(', '), nganh_hang: v.product_cate || '(trống)',
  meta_title: `${v.meta_title} (${len(v.meta_title)})`, meta_desc: `${v.meta_desc} (${len(v.meta_desc)})`, tags: v.tags.join(', '), noi_dung: sh,
}, null, 1));
if (warn.length) console.log('CẢNH BÁO:\n- ' + warn.join('\n- '));
if (err.length) { console.log('LỖI (không tạo bài):\n- ' + err.join('\n- ')); process.exit(1); }
if (!GO) { console.log('DRY RUN OK. Chạy lại với --go để tạo bài.'); process.exit(0); }

// ---------- tạo bài ----------
const c = await openNews(0, [path.dirname(v.thumb)]);
let newId = null;
try {
  const st = await evaluate(c, `() => ({ id: $('#hdNewsId').val(), site: $('#hdSiteId').val(), cur: $('#hdCurrentUrl').val(), title: $('[name=txtTitle]').val() })`, 30000);
  if (st.id !== '0' || st.site !== '16' || st.cur || st.title) throw new Error('tab không phải form trống newsId=0 siteId=16: ' + JSON.stringify(st));
  await evaluate(c, `() => { window.__alerts = []; window.alert = (m) => window.__alerts.push(String(m)); window.confirm = () => true; return 1; }`, 30000);

  // upload thumb qua input #thumbnailNews (html5Uploader tự POST khi đổi file), nút "Chọn tệp" ngay dưới nhãn "Ảnh thumb bài viết(1200 x 628)"
  const snap = toolText(await c.callTool('take_snapshot', {}, 60000)).split('\n');
  const i0 = snap.findIndex((l) => l.includes('Ảnh thumb bài viết'));
  const line = i0 >= 0 && snap.slice(i0).find((l) => /Chọn tệp|Choose File/.test(l) && /uid=/.test(l));
  if (!line) throw new Error('không tìm thấy nút chọn tệp của Ảnh thumb');
  await c.callTool('upload_file', { uid: line.match(/uid=(\S+)/)[1], filePaths: [v.thumb] }, 120000);
  const base = path.basename(v.thumb, path.extname(v.thumb));
  let thumbUrl = '';
  for (let t = 0; t < 20 && !thumbUrl.includes(base); t++) {
    await sleep(1500);
    thumbUrl = await evaluate(c, `() => $('input[name=thumbnailNews]').val()`, 30000);
  }
  const alerts1 = await evaluate(c, `() => window.__alerts`, 30000);
  if (!thumbUrl.includes(base)) throw new Error(`upload thumb không thành công: "${thumbUrl}" ${JSON.stringify(alerts1)}`);
  console.log('thumb:', thumbUrl);

  const payload = { ...v, content };
  const res = await evaluate(c, `async () => {
    const v = ${JSON.stringify(payload)};
    $('[name=txtTitle]').val(v.title); $('[name=txtUrl]').val(v.url);
    $('[name=txtTag]').val(v.tags.join(', ')); $('[name=txtMetaKeyword]').val(v.tags.join(', '));
    $('[name=txtMetaTitle]').val(v.meta_title); $('[name=txtMetaDescription]').val(v.meta_desc);
    $('#hdListCategory').val(v.product_cate);
    for (const id of v.cates) if (!$('#liCate_' + id).length) $('input[name=NewsCate][value=' + id + ']').trigger('click');
    $('#cboStatus').val(v.status);
    if (v.date) $('[name=txtDate]').val(v.date); if (v.hour !== '') $('[name=txtHour]').val(String(v.hour)); if (v.minute !== '') $('[name=txtMinute]').val(String(v.minute));
    const ed = tinymce.get('contentNewsAva'); ed.setContent(v.content); ed.save();
    await new Promise(r => setTimeout(r, 400));
    const data = getDataSubmitNews();
    const got = (data.LstCategoryId || '').split(',').sort().join(',');
    const chk = { hdNewsId: data.hdNewsId, hdSiteId: data.hdSiteId, cboStatus: data.cboStatus, txtTitle: data.txtTitle, txtUrl: data.txtUrl, thumbnailNews: data.thumbnailNews, cates: got, LstProductCategory: data.LstProductCategory };
    if (data.hdNewsId !== '0' || data.hdSiteId !== '16' || data.cboStatus !== v.status || (v.status === 'actived' && (data.txtDate !== v.date || data.txtHour !== '2' || data.txtMinute !== '0')) || data.txtTitle !== v.title || data.txtUrl !== v.url || !data.thumbnailNews || got !== [...v.cates].sort().join(',') || !data.ContentNews)
      return { status: 0, error: 'payload sai, không POST', chk };
    const skip = $('#hdIsSkipSecurity').val() == '1' ? '?skip=1' : '';
    try {
      const e = await $.ajax({ url: rootUrl + 'News/SubmitNewsEdit' + skip, type: 'POST', dataType: 'json', data });
      return { status: e.status, error: e.error, chk };
    } catch (x) { return { status: -999, error: 'ajax lỗi: ' + (x.status || '') + ' ' + (x.statusText || ''), chk }; }
  }`, 120000);
  console.log('submit:', JSON.stringify(res));
  if (!(res.status > 0)) throw new Error(`CMS không tạo bài: ${res.error}. ĐỪNG chạy lại mù: vào CMS kiểm tra xem bài đã được tạo chưa.`);
  newId = res.status;
  reg.push({ id: newId, url: v.url, title: v.title, keyword: v.keyword, created: new Date().toISOString(), status: v.status, publish_date: v.publish_date, form: path.resolve(formPath) });
  saveRegistry(reg);

  const got = await evaluate(c, READ_FN(newId), 120000);
  const dir = path.join(OUT_DIR, String(newId));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'server.body.html'), got.content);
  fs.writeFileSync(path.join(dir, 'gui-len.body.html'), content);
  const { content: _, ...meta } = got;
  fs.writeFileSync(path.join(dir, 'server.form.json'), JSON.stringify(meta, null, 1));
  const diff = [];
  const eq = (k, a, b) => { if (String(a) !== String(b)) diff.push(`${k}: gửi "${a}" ≠ server "${b}"`); };
  eq('title', v.title, got.title); eq('url', v.url, got.url); eq('thumb chứa tên', true, got.thumb.includes(base));
  eq('chuyên mục', [...v.cates].sort().join(','), [...(got.cates || [])].sort().join(','));
  eq('ngành hàng', v.product_cate, got.product_cate || ''); eq('meta title', v.meta_title, got.meta_title);
  eq('meta desc', v.meta_desc, got.meta_desc); eq('tags', v.tags.join(', '), got.tags);
  eq('trạng thái', v.status, (got.status || []).join(','));
  if (v.status === 'actived') { eq('ngày đăng', v.date, got.date); eq('giờ đăng', '2:0', `${(got.hour || [])[0]}:${(got.minute || [])[0]}`); }
  const s2 = shape(got.content);
  for (const k of Object.keys(sh)) if (k !== 'text_len' && k !== 'p' && sh[k] !== s2[k]) diff.push(`nội dung ${k}: gửi ${sh[k]} ≠ server ${s2[k]}`);
  if (plainText(content) !== plainText(got.content)) diff.push(`chữ trong bài khác nhau (gửi ${sh.text_len}, server ${s2.text_len} ký tự), xem gui-len/server.body.html`);
  console.log(JSON.stringify({ newsId: newId, cms: `https://cms.thegioididong.com/v2/News/NewsEdit?newsId=${newId}&siteId=16`, trang_thai: STATUS[(got.status || [])[0]] || got.status, link_air: `https://www.topzone.vn/tekzone/${v.url}-${newId}`, luu_tai: dir, lech: diff.length ? diff : 'không lệch' }, null, 1));
  if (diff.length) process.exitCode = 3;
} finally {
  try { await c.close(); } catch {}
}
process.exit(process.exitCode || 0);
