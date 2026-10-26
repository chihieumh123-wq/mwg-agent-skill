"""Gợi ý ứng viên link nội bộ cho bài nháp (Claude tự quyết đặt link nào, ở đâu).

  python3 tim_link.py quet bai.md bai.json     quét bài: cụm có trong kho internal_link_sp, thuật ngữ có bài Hỏi Đáp,
                                               bài Hỏi Đáp liên quan (cho Xem thêm/Đọc thêm), link tầng bắt buộc còn thiếu
  python3 tim_link.py tim "<cụm>" [--loai sp|thuat_ngu|hoi_dap]
                                               tra tự do 3 kho khi muốn link 1 khái niệm không khớp nguyên văn
bai.json cần: keyword, kw_phu, dang_bai, san_pham (tên SP chính), urls_push.
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _chung import *

KD_OK = ('ĐKD-BT', 'Hết hàng tạm thời', 'Hàng sắp về', 'Mới ra mắt')
TANG_CAN = {'Giới thiệu sản phẩm': ['NH', 'Hãng', 'Sản Phẩm'], 'So sánh sản phẩm': ['NH', 'Hãng', 'Sản Phẩm'],
            'Cung cấp thông tin': ['NH', 'Hãng', 'Sản Phẩm'],
            'Top sản phẩm': ['NH', 'Sản Phẩm'], 'Top bán chạy': ['NH', 'Sản Phẩm'], 'Giới thiệu thương hiệu': ['NH', 'Hãng'],
            'Giới thiệu dòng sản phẩm': ['NH', 'Hãng', 'Dòng Filter'], 'So sánh dòng sản phẩm': ['NH', 'Hãng', 'Dòng Filter'],
            'Tiêu chí chọn mua': ['NH'], 'Định nghĩa thông số': ['NH'], 'Hướng dẫn sử dụng': ['NH']}
LINK_MD = re.compile(r'\[([^\]]+)\]\((https?://[^)\s]+)\)')


def so_vol(x):
    try: return int(re.sub(r'\D', '', str(x or '')) or 0)
    except ValueError: return 0

def doc_khoi(md):
    """Tách bài thành khối: (loại, text, có được chèn link không)."""
    ks, info = [], False
    for raw in md.split('\n'):
        l = raw.strip()
        if not l: continue
        if re.match(r'^\[info\]$', l, re.I): info = True; continue
        if re.match(r'^\[/info\]$', l, re.I): info = False; continue
        if l.startswith('|'): ks.append(('bang', l, False)); continue
        m = re.match(r'^(#{2,4})\s+(.*)', l)
        if m:
            t = {2: 'sapo', 3: 'h3', 4: 'h4'}[len(m.group(1))]
            ks.append((t, m.group(2), t == 'sapo')); continue
        if l.startswith('['): ks.append(('shortcode', l, False)); continue
        if re.match(r'^[-+•]\s', l):
            t = l[2:]
            ks.append(('li', t, not info and not re.match(r'^\*\*[^*]+\*\*\s*:', t))); continue
        ks.append(('p', l, not info))
    return ks


def tu(text):
    """Token có vị trí, giữ dấu, lowercase."""
    return [(m.group(0).lower(), m.start(), m.end()) for m in re.finditer(r'[\w]+(?:[.,][\d]+)?', text)]


def quet(md_path, meta_path):
    md = open(md_path).read(); meta = json.load(open(meta_path))
    kho = cache_json('kho_sp.json')
    idx = {}
    for r in kho:
        kw = re.sub(r'\s+', ' ', str(r.get('Keyword', '')).lower()).strip()
        if kw and r.get('URL TGDD') and r.get('Trạng thái KD') in KD_OK:
            idx.setdefault(kw, []).append(r)
    khoi = doc_khoi(md)
    da_co, loi = [], []
    url_dem = {}
    for i, (t, x, ok) in enumerate(khoi):
        for m in LINK_MD.finditer(x):
            da_co.append({'doan': i, 'loai_khoi': t, 'anchor': m.group(1), 'url': m.group(2)})
            url_dem[m.group(2)] = url_dem.get(m.group(2), 0) + 1
            if t in ('h3', 'h4'): loi.append('Link trong heading: ' + x[:80])
            if t == 'li' and not ok or t == 'p' and not ok: loi.append('Link trong box/dòng thông số: ' + m.group(1))
            if re.search(r'[?#]|-ldp|/tim-kiem|^http://', m.group(2)): loi.append('URL bẩn: ' + m.group(2))
    for u, n in url_dem.items():
        if n > 1: loi.append('URL lặp %d lần: %s' % (n, u))
    so_link_sapo = sum(1 for d in da_co if d['loai_khoi'] == 'sapo')
    if so_link_sapo: loi.append('Sapo có %d link (sapo không chèn link)' % so_link_sapo)
    # Ứng viên kho SP
    vol_url = {}
    for rows in idx.values():
        for r in rows:
            vol_url.setdefault(r['URL TGDD'], set()).add((r['Keyword'], so_vol(r.get('Volume Search'))))
    vol_url = {u: sorted(v, key=lambda x: -x[1]) for u, v in vol_url.items()}
    ung = {}
    for i, (t, x, ok) in enumerate(khoi):
        if not ok: continue
        plain = LINK_MD.sub(lambda m: '\u0000' * len(m.group(1)), x)  # vùng đã có link thì bỏ
        ws = tu(plain)
        for a in range(len(ws)):
            for b in range(min(len(ws), a + 8), a, -1):
                s, e = ws[a][1], ws[b - 1][2]
                cum = re.sub(r'\s+', ' ', plain[s:e].lower())
                if cum not in idx: continue
                if (s > 0 and plain[s - 1] in '-/') or (e < len(plain) and plain[e:e + 1] in '-/' and e + 1 < len(plain) and plain[e + 1].isalnum()):
                    continue
                for r in idx[cum]:
                    u = r['URL TGDD']
                    c = ung.setdefault(u, {'url': u, 'loai': r.get('Loại KW'), 'kd': r.get('Trạng thái KD'), 'vi_tri': [], 'kw_trong_kho': set()})
                    v = so_vol(r.get('Volume Search'))
                    c['kw_trong_kho'].add((r['Keyword'], v))
                    c['vi_tri'].append({'doan': i, 'loai_khoi': t, 'anchor': plain[s:e], 'volume': v, 'ngu_canh': plain[max(0, s - 60):e + 60].replace('\u0000', '·')})
                break
    for c in ung.values():
        # Ưu tiên anchor KW volume cao (VD "iPhone" 121K > "điện thoại iPhone" 19K), cùng volume thì vị trí trước
        c['vi_tri'] = sorted(c['vi_tri'], key=lambda v: (-v['volume'], v['doan']))[:4]
        c['kw_trong_kho'] = ['%s (%d)' % (k, v) for k, v in sorted(c['kw_trong_kho'], key=lambda x: -x[1])[:5]]
        c['kw_vol_cao_cung_url'] = ['%s (%d)' % (k, v) for k, v in vol_url.get(c['url'], [])[:5]]
        c['can_xem_nghia'] = all(len(v['anchor'].split()) == 1 for v in c['vi_tri']) and c['loai'] in ('NH', 'NH Filter')
        c['da_link'] = c['url'] in url_dem
    # Thuật ngữ
    tn = []
    chu = '\n'.join(LINK_MD.sub(lambda m: m.group(1), x) for t, x, ok in khoi if ok)
    chu_l = chu.lower()
    for r in cache_json('kho_thuat_ngu.json'):
        title = str(r.get('Title', '')); u = str(r.get('URL', '')).strip()
        term = re.split(r'\s+là\s+gì', title, flags=re.I)[0].strip()
        if not u or not term or len(term) < 2 or term == title: continue
        for m in re.finditer(r'(?<![\w])' + re.escape(term.lower()) + r'(?![\w])', chu_l):
            tn.append({'thuat_ngu': term, 'url': u, 'title': title, 'ngu_canh': chu[max(0, m.start() - 60):m.end() + 60], 'da_link': u in url_dem})
            break
    # Bài Hỏi Đáp liên quan
    sp = [ten_gon(x) for x in meta.get('san_pham', [])]
    goc = set(chuan(meta.get('keyword', '')).split()) - {'so', 'sanh', 'va', 'vs', 'co', 'nen', 'mua', 'hay', 'khong', 'la', 'gi'}
    hd = []
    for r in cache_json('sitemap_hoi_dap.json'):
        t = r.get('Tiêu đề (Title)', ''); ct = ' ' + chuan(t) + ' '
        diem = sum(1 for w in goc if ' ' + w + ' ' in ct) / max(1, len(goc))
        diem += sum(1.0 for s in sp if s and ' ' + chuan(s) + ' ' in ct)
        if diem >= 0.5:
            hd.append({'title': t, 'url': r.get('URL'), 'danh_muc': r.get('Danh mục'), 'ngay': r.get('Ngày đăng'), 'diem': round(diem, 2),
                       'id': int(re.sub(r'\D', '', str(r.get('ID bài') or '0')) or 0), 'da_link': r.get('URL') in url_dem})
    hd.sort(key=lambda x: (-x['diem'], -x['id']))
    # Tầng bắt buộc
    can = TANG_CAN.get(meta.get('dang_bai', ''), ['NH'])
    co = {c['loai'] for c in ung.values() if c['da_link']} | {c['loai'] for c in ung.values()}
    da = set()
    # Tính tầng theo URL đã link (tra loại KW trong kho), không phụ thuộc cụm còn xuất hiện chưa link trong bài
    loai_url = {}
    for rows in idx.values():
        for r in rows: loai_url.setdefault(clean_url(r['URL TGDD']), set()).add(r.get('Loại KW'))
    for d in da_co:
        da |= loai_url.get(clean_url(d['url']), set())
        for c in ung.values():
            if c['url'] == d['url']: da.add(c['loai'])
    # SP mới chưa có trong kho: link tới URL push / URL SP trong bai.json vẫn tính tầng Sản Phẩm
    url_sp = {clean_url(u) for u in meta.get('urls_push', [])} | {clean_url(x.get('url', '')) for x in meta.get('san_pham', []) if x.get('url')}
    if any(clean_url(d['url']) in url_sp for d in da_co): da.add('Sản Phẩm')
    tang = [{'tang': x, 'da_chen': x in da, 'co_ung_vien_trong_bai': x in co} for x in can]
    # Link bắt buộc phải nằm ở thân bài, không chỉ trong FAQ (mục "câu hỏi" cuối) hay câu kết
    faq_i = next((i for i, (t, x, ok) in enumerate(khoi) if t == 'h3' and re.search('câu hỏi', x, re.I)), len(khoi))
    url_bb = {c['url'] for c in ung.values() if c['loai'] in can or c['loai'] == 'Dòng Filter'} | url_sp
    for d in da_co:
        if (d['url'] in url_bb or clean_url(d['url']) in url_sp) and d['doan'] > faq_i:
            loi.append('Link bắt buộc chỉ nằm trong FAQ/cuối bài, chuyển lên thân bài: [%s] %s' % (d['anchor'], d['url']))
    # Dòng filter cho từng SP chính: SP thuộc dòng nào thì phải có link dòng đó
    dong = []
    for s in sp:
        k = ' ' + chuan(s) + ' '
        best = None
        for r in cache_json('kho_sp.json'):
            if r.get('Loại KW') != 'Dòng Filter' or r.get('Trạng thái KD') not in KD_OK: continue
            kw = chuan(r['Keyword'])
            if kw and k.find(' ' + kw + ' ') >= 0 and (not best or len(kw) > len(chuan(best['Keyword']))): best = r
        if best:
            vt = [d['doan'] for d in da_co if d['url'] == best['URL TGDD']]
            if vt and min(vt) > faq_i and not any(best['URL TGDD'] in x for x in loi): loi.append('Link dòng filter chỉ nằm trong FAQ/cuối bài, chuyển lên thân bài: ' + best['URL TGDD'])
            dong.append({'san_pham': s, 'dong': best['Keyword'], 'url': best['URL TGDD'], 'da_chen': best['URL TGDD'] in url_dem})
    out({'loi_link_hien_co': loi, 'link_da_co': da_co, 'tang_bat_buoc': tang, 'dong_filter_can_co': dong,
         'ung_vien_kho_sp': sorted(ung.values(), key=lambda c: (c['da_link'], c['vi_tri'][0]['doan'])),
         'thuat_ngu': tn, 'hoi_dap_lien_quan': hd[:15]})


def tim(q, loai=None):
    k = set(chuan(q).split())
    ra = []
    if loai in (None, 'sp'):
        for r in cache_json('kho_sp.json'):
            if r.get('Trạng thái KD') not in KD_OK: continue
            kk = set(chuan(r.get('Keyword')).split())
            if kk and k and len(k & kk) / len(k | kk) >= 0.5:
                ra.append({'kho': 'internal_link_sp', 'keyword': r['Keyword'], 'url': r['URL TGDD'], 'loai': r['Loại KW'], 'diem': round(len(k & kk) / len(k | kk), 2)})
    if loai in (None, 'thuat_ngu'):
        for r in cache_json('kho_thuat_ngu.json'):
            tt = set(chuan(r.get('Title')).split())
            if k and len(k & tt) / len(k) >= 0.6:
                ra.append({'kho': 'thuat_ngu', 'title': r['Title'], 'url': r['URL'], 'diem': round(len(k & tt) / len(k), 2)})
    if loai in (None, 'hoi_dap'):
        for r in cache_json('sitemap_hoi_dap.json'):
            tt = set(chuan(r.get('Tiêu đề (Title)')).split())
            if k and len(k & tt) / len(k) >= 0.6:
                ra.append({'kho': 'sitemap_hoi_dap', 'title': r['Tiêu đề (Title)'], 'url': r['URL'], 'ngay': r.get('Ngày đăng'), 'diem': round(len(k & tt) / len(k), 2)})
    ra.sort(key=lambda x: -x['diem'])
    out(ra[:25])


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: print(__doc__); sys.exit()
    if a[0] == 'quet': quet(a[1], a[2])
    elif a[0] == 'tim':
        l = None
        if '--loai' in a: i = a.index('--loai'); l = a[i + 1]; del a[i:i + 2]
        tim(' '.join(a[1:]), l)
