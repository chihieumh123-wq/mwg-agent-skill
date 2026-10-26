"""Dữ liệu TGDĐ cho bài viết (giá, thông số, ID shortcode). Port từ lib_parse của luồng n8n.

  python3 tgdd.py lay <url> [<url>...] [-o tgdd.json]
      Trang sản phẩm: ProductGroup/Product → id, tên, hãng, cate, thông số, phiên bản (giá, còn hàng)
      Trang ngành/hãng/filter/dòng: danh sách SP (ItemList) + urlInfo (brandId, propertyCode...)
  python3 tgdd.py tim "<tên máy hoặc cụm>"   tra kho internal_link_sp: trang SP (khớp trọn tên), dòng filter, hãng, ngành
"""
import json, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _chung import *

SPEC_UU_TIEN = ['Chip xử lý (CPU)', 'Chip đồ họa (GPU)', 'Tốc độ CPU', 'RAM', 'Dung lượng lưu trữ', 'Kích thước màn hình', 'Công nghệ màn hình', 'Độ phân giải màn hình', 'Tần số quét', 'Độ sáng', 'Độ phân giải camera sau', 'Độ phân giải camera trước', 'Quay phim camera sau', 'Dung lượng pin', 'Loại pin', 'Hỗ trợ sạc tối đa', 'Công nghệ pin', 'Hệ điều hành', 'Mạng di động', 'SIM', 'Wifi', 'Bluetooth', 'Kết nối', 'Cổng sạc', 'Cổng tai nghe, headphone', 'Kháng nước, bụi', 'Chất liệu', 'Thiết kế', 'Khối lượng máy', 'Kích thước, khối lượng', 'Dài', 'Ngang', 'Dày', 'Bảo mật', 'Tính năng đặc biệt', 'Thời gian ra mắt', 'Hãng', 'Thời lượng pin', 'Kích thước mặt', 'Công nghệ CPU', 'Số nhân', 'Card màn hình', 'Ổ cứng', 'Màn hình']
BO_NGANH = r'^(Điện thoại|Máy tính bảng|Laptop|Đồng hồ thông minh)\s+'


def img_ids(img):
    m = re.search(r'/Products/Images/(\d+)/(\d+)/', str(img or ''))
    return (m.group(1), m.group(2)) if m else ('', '')


def first_img(p):
    im = (p or {}).get('image')
    if isinstance(im, list):
        f = im[0] if im else ''
        return (f.get('url') or f.get('contentUrl')) if isinstance(f, dict) else f
    if isinstance(im, dict):
        return im.get('url') or im.get('contentUrl') or ''
    return im if isinstance(im, str) else ''


def gia_text(n):
    n = int(float(n or 0))
    return '{:,}'.format(n).replace(',', '.') + 'đ' if n else 'chưa có giá'


def parse_group(x):
    specs = {}
    for p in x.get('additionalProperty') or []:
        if not p or not p.get('name') or p.get('value') is None or p['name'] in ('Phiên bản', 'Màu'):
            continue
        v = ', '.join(str(p['value']).split('|'))
        v = re.sub(r'\s*Xem thông tin hãng', '', re.sub(r'<[^>]+>', '', v)).strip().rstrip('.')
        if len(v) <= 250:
            specs[p['name']] = v
    ordered = {k: specs[k] for k in SPEC_UU_TIEN if k in specs}
    for k in specs:
        if k not in ordered: ordered[k] = specs[k]
    vs, cate, ten_goc = {}, '', ''
    for v in x.get('hasVariant') or []:
        c, i = img_ids(first_img(v))
        if c: cate = c
        of = v.get('offers') or {}
        price = float(of.get('price') or 0)
        key = v.get('size') or v.get('name') or ''
        ten = ((v.get('isVariantOf') or {}).get('name')) or v.get('name') or ''
        if i and i == str(x.get('productGroupID')): ten_goc = ten
        con = not re.search(r'OutOfStock|Discontinued', str(of.get('availability') or ''), re.I)
        cur = vs.get(key)
        if not cur or (price and (not cur['gia'] or price < cur['gia'])):
            vs[key] = {'ten': ten, 'size': v.get('size') or '', 'gia': price, 'gia_text': gia_text(price),
                       'url': clean_url(of.get('url') or v.get('url')), 'id': i or (cur or {}).get('id', ''), 'con_hang': con}
    pb = sorted(vs.values(), key=lambda a: a['gia'] or 9e12)
    ten = ten_goc or re.sub(r'\s+chính hãng.*$', '', re.sub(BO_NGANH, '', str(x.get('name') or ''), flags=re.I), flags=re.I).strip()
    gid = str(x.get('productGroupID') or '')
    if not gid or gid == '0':
        goc = [v for v in pb if v['id'] and v['url'] == clean_url(x.get('url'))] or [v for v in pb if v['id']]
        gid = goc[0]['id'] if goc else ''
    brand = x.get('brand') or {}
    return {'id': gid, 'ten': ten, 'hang': brand.get('name', '') if isinstance(brand, dict) else '', 'nganh': x.get('category', ''),
            'cate': cate, 'url': clean_url(x.get('url')), 'thong_so': ordered, 'phien_ban': pb}


def parse_page(html, url):
    o = {'url': clean_url(url), 'title': '', 'ten_trang': '', 'list': [], 'product': None, 'info': None}
    m = re.search(r'<title>([^<]*)</title>', html, re.I)
    if m: o['title'] = m.group(1).strip()
    for m in re.finditer(r'<script[^>]*application/ld\+json[^>]*>([\s\S]*?)</script>', html, re.I):
        try: d = json.loads(m.group(1).strip())
        except Exception: continue
        for x in (d if isinstance(d, list) else [d]):
            if not isinstance(x, dict): continue
            t = x.get('@type')
            if t == 'CollectionPage':
                o['ten_trang'] = x.get('name') or o['ten_trang']
                for li in ((x.get('mainEntity') or {}).get('itemListElement') or []):
                    p = li.get('item') or li
                    c, i = img_ids(first_img(p))
                    gia = float(((p.get('offers') or {}).get('price')) or 0)
                    o['list'].append({'id': i, 'cate': c, 'ten': p.get('name', ''), 'url': clean_url(p.get('url')),
                                      'hang': (p.get('brand') or {}).get('name', '') if isinstance(p.get('brand'), dict) else '',
                                      'gia': gia, 'gia_text': gia_text(gia)})
            if t == 'ProductGroup':
                o['product'] = parse_group(x)
            elif t == 'Product' and not o['product'] and x.get('additionalProperty'):
                bn = (x.get('brand') or {}).get('name') if isinstance(x.get('brand'), dict) else ''
                ten1 = re.sub(BO_NGANH, '', str(x.get('name') or ''), flags=re.I).strip()
                v1 = dict(x, name=ten1)
                g = dict(x, name=ten1, hasVariant=[v1], productGroupID=str(x.get('sku') or ''), brand={'name': bn[0] if isinstance(bn, list) else bn})
                o['product'] = parse_group(g)
    m = re.search(r'urlInfo\\?"\s*:\s*\{([^}]*)\}', html)
    if m:
        try: o['info'] = json.loads('{' + m.group(1).replace('\\"', '"') + '}')
        except Exception: pass
    if o['list'] and not o['product']:
        o['cate'] = next((p['cate'] for p in o['list'] if p['cate']), '')
    return o


def anh_em(html, url):
    """URL các phiên bản dung lượng khác của cùng máy (JSON-LD thường chỉ có bản đang xem)."""
    m = re.match(r'https://www\.thegioididong\.com/([a-z0-9-]+)/([a-z0-9-]+?)(-\d+gb-\d+(?:gb|tb)|-\d+(?:gb|tb))?$', clean_url(url))
    if not m: return []
    nganh, goc = m.group(1), m.group(2)
    ra = []
    for x in re.findall(r'/%s/(%s(?:-\d+gb-\d+(?:gb|tb)|-\d+(?:gb|tb)))(?=["?#/])' % (nganh, re.escape(goc)), html):
        u = 'https://www.thegioididong.com/%s/%s' % (nganh, x)
        if u != clean_url(url) and u not in ra: ra.append(u)
    return ra


def lay(urls):
    res = []
    for k, u in enumerate(urls):
        if k: time.sleep(2)
        try:
            html = fetch(u); o = parse_page(html, u)
            if o['product']:
                for u2 in anh_em(html, u):
                    time.sleep(1.5)
                    try:
                        p2 = parse_page(fetch(u2), u2)['product']
                    except Exception as e:
                        o.setdefault('loi', []).append('%s: %s' % (u2, e)); continue
                    if p2 and p2['phien_ban']:
                        for v in p2['phien_ban']:
                            if v['id'] not in [x['id'] for x in o['product']['phien_ban']]:
                                v['size'] = v['size'] or re.sub(r'^.*?(\d+GB/\d+(?:GB|TB)|\d+(?:GB|TB))$', r'\1', v['ten'])
                                o['product']['phien_ban'].append(v)
                for v in o['product']['phien_ban']:
                    v['size'] = v['size'] or re.sub(r'^.*?(\d+GB/\d+(?:GB|TB)|\d+(?:GB|TB))$', r'\1', v['ten'])
                o['product']['phien_ban'].sort(key=lambda a: a['gia'] or 9e12)
            res.append(o)
        except Exception as e:
            res.append({'url': u, 'loi': str(e)})
    return res


KD_OK = ('ĐKD-BT', 'Hết hàng tạm thời', 'Hàng sắp về', 'Mới ra mắt')


def tim(q):
    kho = cache_json('kho_sp.json')
    k = chuan(q)
    ra = {'san_pham_khop_tron': [], 'dong_filter': [], 'hang': [], 'nganh_hang': [], 'gan_dung': []}
    seen = set()
    for r in kho:
        kw = chuan(r.get('Keyword')); u = r.get('URL TGDD', ''); loai = r.get('Loại KW', '')
        if not kw or not u: continue
        item = {'keyword': r['Keyword'], 'url': u, 'loai': loai, 'kd': r.get('Trạng thái KD', ''), 'id_sp': r.get('ID SP', ''),
                'volume': r.get('Volume Search', '')}
        key = (u, loai)
        if loai == 'Sản Phẩm' and (kw == k or re.sub(r'^(dien thoai|may tinh bang|laptop|dong ho) ', '', kw) == re.sub(r'^(dien thoai|may tinh bang|laptop|dong ho) ', '', k)):
            if key not in seen: ra['san_pham_khop_tron'].append(item); seen.add(key)
        elif loai in ('Dòng Filter', 'Hãng', 'NH') and (' ' + k + ' ').find(' ' + kw + ' ') >= 0:
            nhom = {'Dòng Filter': 'dong_filter', 'Hãng': 'hang', 'NH': 'nganh_hang'}[loai]
            if key not in seen: ra[nhom].append(item); seen.add(key)
        elif k in kw and len(ra['gan_dung']) < 15 and key not in seen:
            ra['gan_dung'].append(item); seen.add(key)
    for n in ('dong_filter', 'hang', 'nganh_hang'):
        ra[n].sort(key=lambda x: -len(x['keyword']))
    out(ra)


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: print(__doc__); sys.exit()
    if a[0] == 'lay':
        o = None
        if '-o' in a: i = a.index('-o'); o = a[i + 1]; del a[i:i + 2]
        r = lay(a[1:])
        if o: json.dump(r, open(o, 'w'), ensure_ascii=False, indent=1); print('Đã lưu', o)
        else: out(r)
    elif a[0] == 'tim': tim(' '.join(a[1:]))
