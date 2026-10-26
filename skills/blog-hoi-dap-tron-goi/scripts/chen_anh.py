#!/usr/bin/env python3
"""Chèn ảnh đã up vào HTML bài, ngay SAU đoạn văn chỉ định, alt = title viết theo đoạn văn đó, rồi kiểm phân bổ ảnh.

  python3 chen_anh.py <bai.html> <ke-hoach-anh.json> <anh-cdn.json> -o <bai-co-anh.html> [--top] [--site topzone --thumb-alt "..."]

ke-hoach-anh.json: [{"file": "<slug>-1.jpg", "sau_doan": "<cụm chữ duy nhất của đoạn đặt ảnh phía sau>", "alt": "..."}]
- sau_doan khớp đúng 1 block (p/h3/h4/ul/ol/table); ảnh chèn sau block đó.
- alt = title = caption (cùng 1 câu, rule user 24/10/2026), viết theo ĐOẠN VĂN sát ảnh: 40-60 ký tự, không trùng,
  không chép nguyên câu, không chấm cuối. Caption: CMS tự sinh từ title khi lưu nên script KHÔNG chèn caption (chèn tay sẽ lặp 2 lần); chỉ chèn khi plan có "caption": true.
- Thẻ giống nút "Chèn vào bài" của CMS: <p><img class="lazy" title alt src width height /></p>; caption giống
  "Cập nhật" của CMS: <p class="titleOfImages" style="font-size: 15px; color: #777777; text-align:center;">...</p>.
Phân bổ (rule user 24/10/2026):
- Tối thiểu 3 ảnh trong bài (bài Top: 3 ảnh ở các mục KHÔNG phải mục sản phẩm).
- Không có 2 heading (H3/H4) liền nhau mà cả hai mục đều không có ảnh. Bài Top (--top): mục có shortcode sản phẩm
  ([product ...], [Product_Box ...]) tính như có ảnh. Chỉ bỏ qua mục "Xem thêm"; mục Mua và FAQ vẫn phải có ảnh, không miễn.
- Cảnh báo khi một đoạn liền > 1.500 ký tự chữ không có ảnh/shortcode chen giữa (chữ quá dày).
"""
import argparse, html, json, re, sys

BLOCK = re.compile(r'<(p|h2|h3|h4|ul|ol|table)\b[^>]*>.*?</\1>', re.S)
SC_SP = re.compile(r'\[(Product_Promotion|product|Product_Box)\b', re.I)
CAP_TZ = '<p>[captionnews]{}[/captionnews]</p>'
CAP = '<p class="titleOfImages" style="font-size: 15px; color: #777777; text-align:center;">{}</p>'


def chu(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()


def kiem_chu(ten, s, full, seen, loi):
    n = len(s)
    if not 40 <= n <= 60: loi.append(f'{ten} {n} ký tự, cần 40-60: "{s}"')
    if s.endswith('.'): loi.append(f'{ten} không chấm cuối: "{s}"')
    if s.lower() in seen: loi.append(f'{ten} trùng ảnh khác: "{s}"')
    if s in full: loi.append(f'{ten} chép nguyên câu trong bài: "{s}"')
    seen.add(s.lower())


def phan_bo(out, top):
    """Trả (lỗi, cảnh báo) về số ảnh và phân bổ theo heading."""
    loi, canh = [], []
    heads = list(re.finditer(r'<(h3|h4)\b[^>]*>(.*?)</\1>', out, re.S))
    secs, faq, in_faq = [], False, False
    for i, m in enumerate(heads):
        end = heads[i + 1].start() if i + 1 < len(heads) else len(out)
        body = out[m.end():end]
        t = chu(m.group(2))
        if m.group(1) == 'h3':
            tl = t.lower()
            faq = 'xem thêm' in tl                       # mục "Xem thêm" (toàn link) miễn ảnh
            mua = 'chính hãng, giá tốt' in tl or 'tại topzone' in tl            # mục Mua: có ảnh cũng được, không có cũng không sao (user 25/10/2026)
            hoi = any(k in tl for k in ('câu hỏi', 'faq', 'thường gặp'))
            if hoi:                                       # FAQ: chỉ 1-2 ảnh xen kẽ cả mục (user 25/10/2026)
                j = i + 1
                while j < len(heads) and heads[j].group(1) == 'h4': j += 1
                nf = out[m.end():(heads[j].start() if j < len(heads) else len(out))].count('<img')
                if nf > 2: loi.append(f'mục FAQ chỉ 1-2 ảnh xen kẽ, đang có {nf}')
                elif nf == 0: canh.append('mục FAQ chưa có ảnh (nên chèn 1-2 ảnh xen kẽ)')
        if faq: continue
        n_anh = body.count('<img')
        if mua or hoi or (m.group(1) == 'h4' and in_faq):
            secs.append((t, n_anh, True, bool(SC_SP.search(body)))); in_faq = hoi or (in_faq and m.group(1) == 'h4'); continue
        in_faq = False
        co_sc = bool(SC_SP.search(body))
        if not n_anh and not co_sc and not chu(body): continue   # H3 chỉ là khung chứa các H4 ngay sau
        secs.append((t, n_anh, n_anh > 0 or (top and co_sc), co_sc))
    tong = out.count('<img')
    anh = tong - sum(s[1] for s in secs if s[3])   # ảnh nằm ngoài mục có shortcode sản phẩm
    if top and anh < 3: loi.append(f'bài Top: cần ≥ 3 ảnh ở các mục không phải sản phẩm, đang có {anh}')
    if not top and tong < 3: loi.append(f'cần tối thiểu 3 ảnh, đang có {tong}')
    for a, b in zip(secs, secs[1:]):
        if not a[2] and not b[2]: loi.append(f'2 heading liền không có ảnh: "{a[0][:45]}" → "{b[0][:45]}"')
    # chữ quá dày
    run = 0
    for m in BLOCK.finditer(out):
        g = m.group(0)
        if '<img' in g or SC_SP.search(g) or m.group(1) in ('h3', 'h4'):
            run = 0 if ('<img' in g or SC_SP.search(g)) else run
            continue
        run += len(chu(g))
        if run > 1500:
            canh.append(f'chữ dày > 1.500 ký tự không có ảnh, tới đoạn: "{chu(g)[:50]}"'); run = 0
    return loi, canh


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('bai'); ap.add_argument('ke_hoach'); ap.add_argument('cdn'); ap.add_argument('-o', required=True)
    ap.add_argument('--top', action='store_true', help='bài Top sản phẩm: shortcode sản phẩm thay ảnh ở mục sản phẩm')
    ap.add_argument('--site', choices=['tgdd', 'topzone'], default='tgdd')
    ap.add_argument('--thumb-alt', default='', help='topzone: alt=title ảnh đầu bài (cùng thumb); bỏ trống thì dùng ảnh *-thumbnail-tekzone.jpg nếu có trong anh-cdn với alt = title bài')
    a = ap.parse_args()
    tz = a.site == 'topzone'
    src = open(a.bai, encoding='utf-8').read()
    plan = json.load(open(a.ke_hoach, encoding='utf-8'))
    cdn = json.load(open(a.cdn, encoding='utf-8'))
    blocks = [(m.start(), m.end(), chu(m.group(0))) for m in BLOCK.finditer(src)]
    full = chu(src)
    loi, chen, seen = [], [], set()
    for it in plan:
        f, key, alt = it['file'], chu(it['sau_doan']), it['alt'].strip()
        if f not in cdn: loi.append(f'{f}: chưa có trong anh-cdn.json (chưa up)'); continue
        hits = [b for b in blocks if key in b[2]]
        if len(hits) != 1: loi.append(f'{f}: "{key[:50]}" khớp {len(hits)} block, cần đúng 1'); continue
        kiem_chu(f'{f}: alt', alt, full, seen, loi)
        v = cdn[f]; q = html.escape(alt, quote=True)
        if tz:   # TopZone (user 25/10/2026): ảnh 1200x675 hiển thị width 800, caption bằng shortcode [captionnews]; mặc định có caption
            tag = f'<p><img title="{q}" src="{v["src"]}" alt="{q}" width="800" height="450" /></p>'
            if it.get('caption') is not False: tag += '\n' + CAP_TZ.format(html.escape(alt))
        else:
            tag = f'<p><img class="lazy" title="{q}" src="{v["src"]}" alt="{q}" width="{v["width"]}" height="{v["height"]}" /></p>'
        if not tz and it.get('caption') is True: tag += '\n' + CAP.format(html.escape(alt))   # mặc định KHÔNG: CMS tự thêm caption từ title khi lưu, thêm tay sẽ bị lặp 2 lần
        chen.append((hits[0][1], len(chen), tag))
    if loi: print('LỖI:\n- ' + '\n- '.join(loi)); sys.exit(1)
    out = src
    for pos, _i, tag in sorted(chen, reverse=True):  # cùng vị trí: giữ thứ tự trong plan
        out = out[:pos] + '\n' + tag + out[pos:]
    if tz:   # ảnh đầu bài = thumb 1200x628, hiển thị 845x442, không caption
        th = [k for k in cdn if k.endswith('-thumbnail-tekzone.jpg')]
        if th and a.thumb_alt:
            q = html.escape(a.thumb_alt.strip(), quote=True)
            out = f'<p><img class="" title="{q}" src="{cdn[th[0]]["src"]}" alt="{q}" width="845" height="442" /></p>\n' + out
        elif not th: print('CẢNH BÁO: chưa có ảnh -thumbnail-tekzone.jpg trong anh-cdn.json, bài chưa có ảnh đầu bài')
        else: print('CẢNH BÁO: thiếu --thumb-alt, chưa chèn ảnh đầu bài')
    l2, canh = phan_bo(out, a.top)
    if canh: print('CẢNH BÁO:\n- ' + '\n- '.join(canh))
    if l2: print('LỖI phân bổ ảnh (chưa ghi file):\n- ' + '\n- '.join(l2)); sys.exit(1)
    open(a.o, 'w', encoding='utf-8').write(out)
    print(f'đã chèn {len(chen)} ảnh → {a.o}')


if __name__ == '__main__':
    main()
