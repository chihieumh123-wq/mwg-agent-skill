#!/usr/bin/env python3
"""Lấy ID sản phẩm TopZone cho shortcode [product ID="..."] (CMS V2 TopZone).

  python3 tz_sp.py https://www.topzone.vn/iphone/iphone-18-pro [...]

ID = `sku` trong JSON-LD của trang SP. Mỗi phiên bản dung lượng là 1 trang riêng (…-512gb, …-1tb, …-2tb) nên có ID riêng;
script đọc luôn các trang phiên bản dung lượng cùng dòng được link trong trang. Trả JSON: [{url, sku, variants:[{url, sku}]}].
Dòng shortcode: <p class="p1">[product ID="370977" Description= "none" Display="block"]</p> (mỗi ID 1 dòng).
"""
import json, re, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _chung import fetch, out


def sku(html):
    m = re.search(r'"sku"\s*:\s*"?(\d+)', html)
    return m.group(1) if m else ''


def lay(url):
    h = fetch(url)
    base = re.sub(r'^https://www\.topzone\.vn', '', url.split('?')[0].rstrip('/'))
    vs = sorted({m for m in re.findall(r'href="(%s-(?:\d+gb|\d+tb))"' % re.escape(base), h)})
    r = {'url': url, 'sku': sku(h), 'variants': []}
    for v in vs:
        u = 'https://www.topzone.vn' + v
        try: r['variants'].append({'url': u, 'sku': sku(fetch(u))})
        except Exception as e: r['variants'].append({'url': u, 'sku': '', 'loi': str(e)[:80]})
    return r


if __name__ == '__main__':
    out([lay(u) for u in sys.argv[1:]])
