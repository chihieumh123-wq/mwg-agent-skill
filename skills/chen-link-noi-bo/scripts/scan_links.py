# -*- coding: utf-8 -*-
"""Quét link nội bộ của 1 bài: link đang có, link trùng, kw chính có trong bài chưa link.
Dùng: python3 scan_links.py <file> [--site tgdd|dmx|topzone] [--refresh]
TGDĐ/ĐMX: sheet All KW (SHEET_ALL_KW_ID) (KW L, Vol M, chính N, URL TGDD O, URL DMX P, Loại KW B, Trạng thái R)
TopZone : sheet All KW TopZone (SHEET_ALL_KW_TOPZONE_ID), gộp 4 tab KW (user chốt 25/10/2026): KW Ngành hàng, KW Hãng, KW Ngành hàng Filter, KW Sản Phẩm
          (cùng layout: Loại KW A, KW K, Vol L, chính M, URL TopZone N, Trạng thái P)
"""
import json, os, re, sys, html, time, subprocess, unicodedata, collections
HERE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[1:]
f = args[0]
site = args[args.index('--site') + 1] if '--site' in args else 'tgdd'
if site == 'topzone':
    SHEET, CACHE = os.environ.get('SHEET_ALL_KW_TOPZONE_ID') or sys.exit('Thiếu biến môi trường SHEET_ALL_KW_TOPZONE_ID'), os.path.join(HERE, '..', 'cache', 'allkw-topzone.json')
    C = dict(kw=10, vol=11, main=12, url=13, typ=0, st=15)
    TZ_TABS = ['KW Ngành hàng', 'KW Hãng', 'KW Ngành hàng Filter', 'KW Sản Phẩm']
else:
    SHEET, CACHE = os.environ.get('SHEET_ALL_KW_ID') or sys.exit('Thiếu biến môi trường SHEET_ALL_KW_ID'), os.path.join(HERE, '..', 'cache', 'allkw.json')
    C = dict(kw=11, vol=12, main=13, url={'tgdd': 14, 'dmx': 15}[site], typ=1, st=17)
def _read(tab):
    out = subprocess.run(['gws', 'sheets', '+read', '--spreadsheet', SHEET, '--range', f"'{tab}'!A1:T60000", '--format', 'json'],
                         capture_output=True, text=True).stdout
    return json.loads(out[out.index('{'):])['values']
if '--refresh' in args or not os.path.exists(CACHE):
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    if site == 'topzone':
        vals = [['hdr']]
        for tab in TZ_TABS: vals += _read(tab)[1:]
        open(CACHE, 'w', encoding='utf-8').write(json.dumps({'values': vals}, ensure_ascii=False))
    else:
        open(CACHE, 'w', encoding='utf-8').write(json.dumps({'values': _read('All KW')}, ensure_ascii=False))
age = (time.time() - os.path.getmtime(CACHE)) / 86400
if age > 7: print(f'!! Cache KW đã {age:.0f} ngày, nên chạy lại với --refresh\n')
rows = json.load(open(CACHE, encoding='utf-8'))['values'][1:]
t = open(f, encoding='utf-8').read()
N = lambda s: unicodedata.normalize('NFC', re.sub(r'\s+', ' ', html.unescape(s).replace('\xa0', ' '))).strip()
links = []
for attrs, inner in re.findall(r'<a\b([^>]*)>(.*?)</a>', t, re.S):
    m = re.search(r'href="([^"]*)"', attrs)
    if m: links.append((m.group(1).rstrip('/'), N(re.sub(r'<[^>]+>', '', inner))))
print('LINK ĐANG CÓ:')
for h, a in links: print(f'  {a!r:45} {h}')
HOME = re.compile(r'^https?://(www\.)?(thegioididong\.com|dienmayxanh\.com|topzone\.vn)$')
nt = [x for x in links if not x[0].startswith('tel:') and not HOME.match(x[0])]
print('\nTRÙNG (phải = rỗng):')
for i, name in [(0, 'URL'), (1, 'anchor')]:
    for k, v in collections.Counter(x[i].lower() for x in nt).items():
        if v > 1: print(f'  DUP {name} x{v}: {k} ->', [x[1 - i] for x in nt if x[i].lower() == k])
linked = {x[0] for x in nt}
body = re.sub(r'<a\b[^>]*>.*?</a>', ' ', t, flags=re.S)
body = re.sub(r'<h[1-6][^>]*>.*?</h[1-6]>', ' ', body, flags=re.S)
txt = N(re.sub(r'<[^>]+>', ' ', body)).lower()
best = {}
for r in rows:
    r = r + [''] * 20
    if r[C['main']] != 'TRUE' or not r[C['url']].startswith('http'): continue
    if site == 'topzone' and r[C['st']].strip().lower() != 'đang kinh doanh': continue
    kw = N(r[C['kw']]).lower()
    if len(kw) < 3 or not re.search(r'(?<![\wÀ-ỹ])' + re.escape(kw) + r'(?![\wÀ-ỹ])', txt): continue
    try: v = int(re.sub(r'\D', '', r[C['vol']]) or 0)
    except ValueError: v = 0
    u = r[C['url']].rstrip('/')
    if u not in best or v > best[u][1]: best[u] = (kw, v, r[C['typ']], r[C['st']])
print('\nKW CHÍNH CÓ TRONG BÀI (chưa link = MISSING):')
for u, (kw, v, typ, st) in sorted(best.items(), key=lambda x: -x[1][1]):
    flag = 'LINKED ' if u in linked else 'MISSING'
    print(f'  {flag} {v:>8} {typ:11} {kw!r:32} {u}  [{st}]')

print('\nRULE KHÁC (phải = rỗng):')
for h, a in links:
    if re.search(r'/tim-kiem\?key=|/kinh-nghiem-hay/tag|-ldp\b|/sp-\d+', h): print(f'  LINK CẤM: {a!r} -> {h}')
for attrs, inner in re.findall(r'<a\b([^>]*)>(.*?)</a>', t, re.S):
    if 'href="tel:' in attrs and 'target=' in attrs: print(f'  TEL CÓ TARGET (phải None): {N(re.sub(r"<[^>]+>", "", inner))!r}')
for blk in re.findall(r'<(p|li)\b[^>]*>((?:(?!<p\b|<li\b).)*?)</\1>', t, re.S):
    n = len(re.findall(r'<a\b[^>]*href="(?!tel:)', blk[1]))
    if n > 4: print(f'  >4 LINK/ĐOẠN ({n}): {N(re.sub(r"<[^>]+>", "", blk[1]))[:90]!r}')
plain = N(re.sub(r'<[^>]+>', ' ', re.sub(r'<a\b[^>]*>.*?</a>', ' ', t, flags=re.S)))
for ph in re.findall(r'1900[\s.]?\d{3}[\s.]?\d{2,3}', plain): print(f'  SĐT CHƯA LINK tel: {ph!r}')
