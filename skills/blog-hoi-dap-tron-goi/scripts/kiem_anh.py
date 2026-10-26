#!/usr/bin/env python3
"""Kiểm rule ảnh Hỏi Đáp trước khi upload.

  python3 kiem_anh.py <thư mục ảnh> <slug-url-bai> [--site topzone]

--site topzone: thumb <slug>-thumbnail-tekzone.jpg 1200x628 < 500KB (cũng là ảnh đầu bài, up lên News/0/); ảnh bài vẫn 1200x675.

Thumb: <slug>-thumb-<số>.jpg, 560x292, JPG, < 1MB.  Ảnh bài: <slug>-<số>.jpg, 1200x675, JPG, nhẹ.
Chung: không nền trắng, không viền, không mờ, tên chưa có trên CDN (News/0/ và Common/).
Watermark, đúng sản phẩm, có bị cắt chủ thể: agent tự XEM từng ảnh, script không đo được.
Thoát 1 nếu có LỖI.
"""
import os, re, sys, urllib.request
from PIL import Image, ImageFilter, ImageStat

CDN = 'https://cdnv2.tgdd.vn/mwg-static/common/'


def ton_tai(url):
    try:
        req = urllib.request.Request(url, method='HEAD')
        return urllib.request.urlopen(req, timeout=15).status == 200
    except Exception:
        return False


def vien(im):
    """Tỉ lệ pixel trắng ở mép, và mép 3px đồng màu khác hẳn bên trong (viền)."""
    g = im.convert('L'); w, h = g.size
    mep = [g.getpixel((x, y)) for x in range(0, w, 4) for y in (0, h - 1)] + [g.getpixel((x, y)) for y in range(0, h, 4) for x in (0, w - 1)]
    trang = sum(v > 235 for v in mep) / len(mep)
    strips = [g.crop((0, 0, w, 3)), g.crop((0, h - 3, w, h)), g.crop((0, 0, 3, h)), g.crop((w - 3, 0, w, h))]
    inner = [g.crop((0, 6, w, 12)), g.crop((0, h - 12, w, h - 6)), g.crop((6, 0, 12, h)), g.crop((w - 12, 0, w - 6, h))]
    co_vien = all(ImageStat.Stat(s).stddev[0] < 3 and abs(ImageStat.Stat(s).mean[0] - ImageStat.Stat(i).mean[0]) > 25 for s, i in zip(strips, inner))
    return trang, co_vien


def do_net(im):
    g = im.convert('L').resize((600, int(600 * im.size[1] / im.size[0])))
    return ImageStat.Stat(g.filter(ImageFilter.FIND_EDGES)).var[0]


def main():
    thu_muc, slug = sys.argv[1], sys.argv[2]
    tz = '--site' in sys.argv and sys.argv[sys.argv.index('--site') + 1] == 'topzone'
    loi, canh = [], []
    files = sorted(f for f in os.listdir(thu_muc) if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')))
    thumbs = [f for f in files if re.fullmatch(re.escape(slug) + (r'-thumbnail-tekzone\.jpg' if tz else r'-thumb-\d+\.jpg'), f)]
    bai = [f for f in files if re.fullmatch(re.escape(slug) + r'-\d+\.jpg', f)]
    for f in files:
        if f not in thumbs and f not in bai:
            canh.append(f'{f}: tên không đúng mẫu {slug}-' + ('thumbnail-tekzone.jpg' if tz else 'thumb-<số>.jpg') + f' / {slug}-<số>.jpg, bỏ qua')
    if len(thumbs) != 1: loi.append(f'cần đúng 1 thumb ' + (f'{slug}-thumbnail-tekzone.jpg' if tz else f'{slug}-thumb-<số>.jpg') + f', đang có {len(thumbs)}')
    for f in thumbs + bai:
        p = os.path.join(thu_muc, f)
        im = Image.open(p)
        la_thumb = f in thumbs
        W, H, MAX = ((1200, 628, 500 * 1024) if tz else (560, 292, 1024 * 1024)) if la_thumb else (1200, 675, 400 * 1024)
        kb = os.path.getsize(p) / 1024
        if im.format != 'JPEG': loi.append(f'{f}: định dạng thật là {im.format}, phải JPG')
        if im.size != (W, H): loi.append(f'{f}: {im.size[0]}x{im.size[1]}, phải {W}x{H}')
        if os.path.getsize(p) > MAX: (loi if la_thumb else canh).append(f'{f}: {kb:.0f}KB, tối đa {MAX // 1024}KB')
        trang, co_vien = vien(im.convert('RGB'))
        if trang > .5: loi.append(f'{f}: nền trắng ({trang:.0%} mép ảnh trắng), đổi nền bằng xu_ly_anh.py')
        if co_vien: loi.append(f'{f}: có viền quanh ảnh')
        net = do_net(im.convert('RGB'))
        if net < 250: canh.append(f'{f}: có thể bị mờ (độ nét {net:.0f}), xem lại')
        url = CDN + ('Common/' if la_thumb and not tz else 'News/0/') + f
        if ton_tai(url): loi.append(f'{f}: tên đã có trên CDN ({url}), đổi số để không đè ảnh cũ')
        print(f'{f}: {im.size[0]}x{im.size[1]} {kb:.0f}KB nền trắng {trang:.0%} độ nét {net:.0f}')
    if canh: print('CẢNH BÁO:\n- ' + '\n- '.join(canh))
    if loi: print('LỖI:\n- ' + '\n- '.join(loi)); sys.exit(1)
    print(f'OK: 1 thumb, {len(bai)} ảnh bài')


if __name__ == '__main__':
    main()
