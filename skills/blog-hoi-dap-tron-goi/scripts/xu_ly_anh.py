#!/usr/bin/env python3
"""Đưa ảnh về đúng khổ thumb (560x292) hoặc ảnh trong bài (1200x675) mà KHÔNG cắt mất chủ thể.

  python3 xu_ly_anh.py <ảnh gốc> <ảnh ra.jpg> --kieu thumb|bai [--site topzone] [--nen "#3a3a3c"] [--giu-nen]

- Tìm vùng chủ thể (khác màu nền ở 4 góc). Khung cắt đúng tỉ lệ phải chứa trọn chủ thể + lề 4%;
  không chứa nổi thì nới khung bằng màu nền (không bóp méo, không cắt nửa chừng).
- Nền trắng (góc > 235) thì đổ màu nền tối `--nen` từ 4 góc (trừ khi --giu-nen).
- Ghi JPG chất lượng 88, tự giảm chất lượng tới khi < giới hạn dung lượng.
"""
import argparse, os, sys
from PIL import Image, ImageDraw, ImageChops, ImageFilter

KHO = {'thumb': (560, 292, 1024 * 1024), 'bai': (1200, 675, 400 * 1024)}


def hex_rgb(s):
    s = s.lstrip('#')
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def mau_goc(im):
    w, h = im.size
    pts = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    px = [im.getpixel(p) for p in pts]
    return tuple(sum(c[i] for c in px) // 4 for i in range(3))


def doi_nen(im, mau, ky=False):
    """Đổ màu nền từ 4 góc với ngưỡng, chỉ ăn vùng trắng liền với mép ảnh."""
    im = im.copy()
    w, h = im.size
    step = max(1, min(w, h) // 20)
    seeds = [(x, 0) for x in range(0, w, step)] + [(x, h - 1) for x in range(0, w, step)] + \
            [(0, y) for y in range(0, h, step)] + [(w - 1, y) for y in range(0, h, step)]
    for p in seeds:
        if min(im.getpixel(p)) > 235:
            ImageDraw.floodfill(im, p, mau, thresh=28)
    if ky:   # nền đổ bóng/mờ dần ở mép, khe kín: loang rộng hơn rồi quét mảng sáng nhạt màu còn sót
        for p in seeds:
            if min(im.getpixel(p)) > 170:
                ImageDraw.floodfill(im, p, mau, thresh=75)
        return doi_nen_kin(im, mau, nguong=200, min_px=120, bao_hoa=14)
    return doi_nen_kin(im, mau)


def doi_nen_kin(im, mau, nguong=247, min_px=300, bao_hoa=255):
    """Vùng trắng tinh bị chủ thể bao kín (khe dưới chân đế, giữa quai...) không liền mép nên floodfill bỏ sót:
    đổi các mảng pixel > nguong liền nhau từ min_px trở lên. Mảng nhỏ (highlight trên sản phẩm) giữ nguyên."""
    from collections import deque
    w, h = im.size
    px = im.load()
    sang = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            if min(px[x, y]) > nguong and max(px[x, y]) - min(px[x, y]) < bao_hoa:
                sang[y * w + x] = 1
    for s in range(w * h):
        if not sang[s]:
            continue
        q, vung = deque([s]), [s]
        sang[s] = 0
        while q:
            c = q.popleft()
            x, y = c % w, c // w
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < w and 0 <= ny < h and sang[ny * w + nx]:
                    sang[ny * w + nx] = 0
                    q.append(ny * w + nx); vung.append(ny * w + nx)
        if len(vung) >= min_px:
            for c in vung:
                px[c % w, c // w] = mau
    return im


def vung_chu_the(im, nen):
    bg = Image.new('RGB', im.size, nen)
    r, g, b = ImageChops.difference(im, bg).split()
    diff = ImageChops.lighter(ImageChops.lighter(r, g), b).point(lambda v: 255 if v > 24 else 0)  # lệch ở bất kỳ kênh màu nào
    diff = diff.filter(ImageFilter.MedianFilter(5))
    return diff.getbbox() or (0, 0, im.size[0], im.size[1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('vao'); ap.add_argument('ra')
    ap.add_argument('--kieu', choices=KHO, required=True)
    ap.add_argument('--nen', default='#3a3a3c')
    ap.add_argument('--giu-nen', action='store_true')
    ap.add_argument('--site', choices=['tgdd', 'topzone'], default='tgdd', help='topzone: thumb 1200x628 (ảnh đầu bài cùng thumb), ảnh bài vẫn 1200x675')
    ap.add_argument('--nen-ky', action='store_true', help='đổi nền mạnh tay (nền đổ bóng/mờ, khe kín); XEM lại kẻo ăn vào sản phẩm trắng')
    a = ap.parse_args()
    kho = dict(KHO)
    if a.site == 'topzone': kho['thumb'] = (1200, 628, 500 * 1024)
    W, H, MAX = kho[a.kieu]
    im = Image.open(a.vao).convert('RGB')
    nen = mau_goc(im)
    if a.kieu == 'bai':   # rule user 24/10/2026: ảnh trong bài giữ nền gốc, ghép nền bị răng cưa lộ
        a.giu_nen = True
    if not a.giu_nen and min(nen) > 235:
        im = doi_nen(im, hex_rgb(a.nen), a.nen_ky)
        nen = hex_rgb(a.nen)
        print('đã đổi nền trắng sang', a.nen)
    w, h = im.size
    x0, y0, x1, y1 = vung_chu_the(im, nen)
    lx, ly = int((x1 - x0) * .04) + 2, int((y1 - y0) * .04) + 2
    x0, y0, x1, y1 = max(0, x0 - lx), max(0, y0 - ly), min(w, x1 + lx), min(h, y1 + ly)
    r = W / H
    # khung nhỏ nhất đúng tỉ lệ chứa trọn chủ thể, rồi phóng to tối đa trong ảnh
    cw, ch = x1 - x0, y1 - y0
    if cw / ch < r: cw = ch * r
    else: ch = cw / r
    k = min(w / cw, h / ch)
    if k >= 1:  # vừa ảnh gốc: lấy khung lớn nhất đúng tỉ lệ, canh giữa chủ thể
        cw, ch = cw * k, ch * k
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        L = min(max(0, cx - cw / 2), w - cw); T = min(max(0, cy - ch / 2), h - ch)
        out = im.crop((round(L), round(T), round(L + cw), round(T + ch)))
    else:  # không vừa: nới canvas bằng màu nền, không cắt chủ thể
        cw, ch = max(cw, w if w / h >= r else h * r), max(ch, h if w / h < r else w / r)
        canvas = Image.new('RGB', (round(cw), round(ch)), nen)
        canvas.paste(im, (round((cw - w) / 2), round((ch - h) / 2)))
        out = canvas
        print('ảnh không đủ khổ, đã nới nền thay vì cắt')
    if out.size[0] < W * .9:
        print(f'CẢNH BÁO: phải phóng {out.size[0]}px lên {W}px, ảnh sẽ mờ, nên tìm ảnh gốc lớn hơn', file=sys.stderr)
    out = out.resize((W, H), Image.LANCZOS)
    q = 88
    while True:
        out.save(a.ra, 'JPEG', quality=q, optimize=True, progressive=True)
        if os.path.getsize(a.ra) <= MAX or q <= 60: break
        q -= 6
    print(f'{a.ra}: {W}x{H}, {os.path.getsize(a.ra) // 1024}KB, q={q}')
    if (x1 - x0) < w * .15 and (y1 - y0) < h * .15:
        print('CẢNH BÁO: chủ thể rất nhỏ trong ảnh gốc, xem lại ảnh có hợp không', file=sys.stderr)


if __name__ == '__main__':
    main()
