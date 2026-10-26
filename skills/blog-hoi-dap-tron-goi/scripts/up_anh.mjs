#!/usr/bin/env node
// Upload ảnh trong bài lên CDN qua CMS (Common/UploadManyImages, ID=0 → News/0/<tên file>), KHÔNG lưu bài.
//   node up_anh.mjs <thư mục ảnh> <slug-url-bai>   → ghi <thư mục>/anh-cdn.json {tên file: {src,width,height}}
// Chỉ up file <slug>-<số>.jpg (thumb do cms-faq-tao-bai tự up). Chạy kiem_anh.py trước.
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, uploadToOwnInput } from '../../onpage-mdm-khai-bao/scripts/cms-cli-mcp.mjs';
import { openEdit } from '../../cms-faq-tao-bai/scripts/cms-faq-lib.mjs';

const [dirArg, slug] = process.argv.slice(2);
if (!dirArg || !slug) { console.error('Cách dùng: node up_anh.mjs <thư mục ảnh> <slug>'); process.exit(2); }
const dir = path.resolve(dirArg);
const re = new RegExp(`^${slug.replace(/[-]/g, '\\-')}-\\d+\\.jpg$`);
const files = fs.readdirSync(dir).filter((f) => re.test(f)).sort((a, b) => parseInt(a.slice(slug.length + 1)) - parseInt(b.slice(slug.length + 1)));
if (!files.length) { console.error('không có ảnh ' + slug + '-<số>.jpg'); process.exit(1); }
const outFile = path.join(dir, 'anh-cdn.json');
const done = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
const todo = files.filter((f) => !done[f]);
console.log(`ảnh: ${files.length}, đã up trước: ${files.length - todo.length}, cần up: ${todo.length}`);
if (!todo.length) process.exit(0);

const c = await openEdit(0, [dir]);
try {
  await uploadToOwnInput(c, 'up-anh-hoi-dap', todo.map((f) => path.join(dir, f)));
  const res = await evaluate(c, `async () => {
    const files = document.getElementById('up-anh-hoi-dap').files;
    const fd = new FormData(); fd.append('ID', '0'); fd.append('type', 3);
    for (let i = 0; i < files.length; i++) fd.append('file' + i, files[i]);
    const r = await fetch(rootUrl + 'Common/UploadManyImages', { method: 'POST', body: fd, credentials: 'same-origin' });
    const html = await r.text();
    const d = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
    const items = [...d.querySelectorAll('.itemImg_collapse')].map((el) => {
      const img = el.querySelector('.itemImg_collapse_first_img img'); const wh = el.querySelector('[data-width]');
      return { src: img && img.getAttribute('src'), width: wh && wh.getAttribute('data-width'), height: wh && wh.getAttribute('data-height') };
    });
    document.getElementById('up-anh-hoi-dap').remove();
    return { http: r.status, items, raw: items.length ? '' : html.slice(0, 800) };
  }`, 300000);
  if (res.http !== 200 || !res.items.length) throw new Error('upload lỗi: ' + JSON.stringify(res).slice(0, 900));
  for (const it of res.items) {
    const name = decodeURIComponent((it.src || '').split('?')[0].split('/').pop());
    const f = todo.find((x) => x === name) || todo.find((x) => name.startsWith(x.replace(/\.jpg$/, '')));
    if (!f) { console.error('CẢNH BÁO: CDN trả tên lạ ' + it.src); continue; }
    done[f] = { src: it.src.split('?')[0], width: +it.width || 1200, height: +it.height || 675 };
  }
  fs.writeFileSync(outFile, JSON.stringify(done, null, 1));
  const miss = files.filter((f) => !done[f]);
  for (const [f, v] of Object.entries(done)) {
    const ok = (await fetch(v.src, { method: 'HEAD' })).status === 200;
    console.log(`${ok ? 'OK ' : 'LỖI'} ${f} → ${v.src} ${v.width}x${v.height}`);
    if (!ok) miss.push(f);
  }
  if (miss.length) { console.error('chưa có trên CDN: ' + miss.join(', ')); process.exitCode = 1; }
} finally {
  try { await c.close(); } catch {}
}
process.exit(process.exitCode || 0);
