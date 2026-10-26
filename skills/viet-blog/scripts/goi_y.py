"""Google gợi ý (autocomplete) cho keyword: truy vấn thật người dùng gõ, dùng cho FAQ/PAA.
  python3 goi_y.py "<keyword>" ["<truy vấn thêm>" ...]
Tạo bộ truy vấn giống node 10b của luồng n8n (bản đảo A/B, "có", "nên mua A hay B"...).
"""
import json, os, re, sys, time, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _chung import *


def truy_van(kw):
    kw = re.sub(r'\s+', ' ', kw.lower().replace('?', '')).strip()
    core = re.sub(r'^(so sánh|đánh giá|review)\s+', '', kw).strip()
    head = re.split(r'\s(?:có|là|bao|mấy|như|khác|nên|dùng|bị|vs\.?|và|với|hay)\s', core)[0].strip()
    p = re.split(r'\s+(?:vs\.?|và|với|hay)\s+', core)
    bo = lambda x: re.sub(r'^chip\s+', '', x)
    q = [core, re.sub(r'\s+(không|chưa|ko)$', '', core), head + ' có', head + ' ']
    if len(p) == 2:
        q += [p[1] + ' vs ' + p[0], bo(p[0]) + ' vs ' + bo(p[1]), p[1] + ' có', p[0] + ' có']
        if not core.startswith('chip '): q.append('nên mua ' + p[0] + ' hay ' + p[1])
    seen = []
    for x in q:
        if x.strip() and x not in seen: seen.append(x)
    return seen


def goi_y(q):
    u = 'https://suggestqueries.google.com/complete/search?client=firefox&hl=vi&gl=vn&oe=utf-8&q=' + urllib.parse.quote(q)
    try:
        return json.loads(fetch(u, 20))[1]
    except Exception as e:
        return ['(lỗi: %s)' % e]


if __name__ == '__main__':
    if len(sys.argv) < 2: print(__doc__); sys.exit()
    qs = truy_van(sys.argv[1]) + sys.argv[2:]
    tat_ca, ra = [], {}
    for q in qs:
        g = goi_y(q); ra[q] = g; time.sleep(0.8)
        for x in g:
            if x not in tat_ca and not x.startswith('(lỗi'): tat_ca.append(x)
    out({'theo_truy_van': ra, 'tong_hop': tat_ca})
