"""Dựng HTML bài Hỏi Đáp cho TOPZONE (CMS V2 siteId=16) từ markdown + lint. Cùng bai.md/bai.json với dung_html.py (TGDĐ).

  python3 dung_html_topzone.py bai.md bai.json -o bai.html

Khác TGDĐ (user chốt 25/10/2026, khảo sát bài 1598517/1598513/1581308):
- Không tô màu chữ/bảng/khung; bảng `border="1"` căn giữa, tiêu đề cột in đậm. Ngoại lệ duy nhất: nút CTA cam (a.postarticle).
- Mục "Mua ... chính hãng, giá tốt tại TopZone" theo template user (TopZone hiện là hệ thống bán lẻ ủy quyền cao cấp nhất của Apple...).
- Nút CTA cam "MUA <TÊN> CHÍNH HÃNG GIÁ TỐT TẠI TOPZONE" đặt cuối bài, ngay trước "Xem thêm:".
- Xem thêm 3 bài: `<p>Xem thêm:</p><ul><li>..</li></ul>` (không [info]).
- KHÔNG shortcode ở đầu bài. Shortcode sản phẩm `[product ID="<sku>" Description= "none" Display="block"]` đặt ở mục phù hợp
  hoặc cuối bài (trước câu kết in nghiêng) theo meta `sc_sp`: [{"sau": "<cụm trong H3>" | "cuoi", "ids": ["370977", ...]}].
  Lấy ID bằng tz_sp.py. Mục Mua: meta `sc_sp` có "sau": "mua" thì đặt ngay sau block Mua.
bai.json thêm: "site": "TopZone", "cta_url": "https://www.topzone.vn/iphone" (đích nút CTA, trang sp/ngành TopZone), "cta_ten": "iPhone 18 Pro" (tên in hoa trong nút; trống = ten_muc_mua).
"""
import html as H_, json, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dung_html as D
from dung_html import parse_md, inline, esc, esca, a_tag, LINK_MD, LA_MUC_MUA, LOAI_MUA
from _chung import *

TZ_HOME = 'https://www.topzone.vn/'
TZ_STORES = 'https://www.topzone.vn/he-thong-cua-hang'
LA_MUC_MUA_TZ = re.compile(r'^(\d+\.\s*)?(mua|hướng dẫn (đặt )?mua)\b.*(topzone)|mua ở đâu', re.I)


def ten_mua(meta):
    if meta.get('ten_muc_mua'): return meta['ten_muc_mua']
    names = []
    for p in meta.get('san_pham') or []:
        t = ten_gon(p.get('ten'))
        if t and t not in names: names.append(t)
    if len(names) == 1: return names[0]
    if 2 <= len(names) <= 3 and 'So sánh' in meta.get('dang_bai', ''): return ' và '.join(names)
    return str(meta.get('nganh') or 'sản phẩm Apple')


def mua_block_tz(so, meta):
    ten = ten_mua(meta); te = esc(ten)
    return '\n'.join([
        '<h3><strong>%d. Mua %s chính hãng, giá tốt tại TopZone</strong></h3>' % (so, te),
        '<p>TopZone hiện là hệ thống bán lẻ ủy quyền cao cấp nhất của Apple tại Việt Nam, mang đến không gian mua sắm chuẩn quốc tế. Khi chọn mua %s tại đây bạn hoàn toàn yên tâm về nguồn gốc sản phẩm và chính sách bảo hành chính hãng theo tiêu chuẩn của Apple.</p>' % te,
        '<p><strong>Thông tin TopZone:</strong></p>',
        '<ul>',
        '<li><strong>Cửa hàng trực tuyến:</strong> <a title="TopZone" href="%s" target="_blank" rel="noopener">topzone.vn</a></li>' % TZ_HOME,
        '<li><strong>Hotline hỗ trợ:</strong> <a href="tel:1900969642">1900.9696.42</a> (8:00 - 21:30).</li>',
        '</ul>',
        '<p><strong>Chính sách mua hàng và bảo hành %s tại TopZone:</strong></p>' % te,
        '<ul>',
        '<li>Tuyệt đối an tâm với nguồn gốc chính hãng Apple 100%.</li>',
        '<li>Giải pháp tài chính linh hoạt: Trả chậm 0% lãi suất hoặc thu cũ đổi mới.</li>',
        '<li><a title="Hệ thống hơn 80 siêu thị TopZone" href="%s" target="_blank" rel="noopener">Hệ thống hơn 80 siêu thị </a>trên toàn quốc, dễ dàng tìm mua khi cần.</li>' % TZ_STORES,
        '<li>Không gian mua sắm hiện đại, cùng đội ngũ tư vấn hỗ trợ tận tình.</li>',
        '<li>Giao hàng nhanh toàn quốc, nhận máy sớm và tiện lợi.</li>',
        '</ul>'])


def cta_tz(meta):
    ten = (meta.get('cta_ten') or ten_mua(meta)).upper()
    t = 'MUA %s CHÍNH HÃNG GIÁ TỐT TẠI TOPZONE' % ten
    u = meta.get('cta_url') or TZ_HOME
    return ('<p><strong style="line-height: 1.6;"><a class="postarticle" style="margin: auto; width: 270px; text-align: center; line-height: 20.8px;" '
            'title="%s" href="%s" target="_blank" rel="noopener" type="%s"><span style="color: #ffff00;">%s</span></a></strong></p>') % (esca(t), esca(u), esca(t), esc(t))


def table_tz(rows):
    n = max(len(r) for r in rows)
    T = ['<table style="border-collapse: collapse; width: 100%;" border="1">', '<tbody>']
    for ri, r in enumerate(rows):
        cells = []
        for j in range(n):
            v = inline(r[j] if j < len(r) else '')
            if ri == 0:
                v = re.sub(r'</?strong>', '', v)
                cells.append('<td style="width: %s%%; text-align: center;"><p><strong>%s</strong></p></td>' % (round(100 / n, 4), v))
            else:
                cells.append('<td style="text-align: center;"><p>%s</p></td>' % v)
        T.append('<tr>' + ''.join(cells) + '</tr>')
    T += ['</tbody>', '</table>']
    return '\n'.join(T)


def bold_nhan(h):
    """Nhãn trước dấu ':' đầu tiên của li (≤ 8 từ, chưa có thẻ) in đậm, như rule TGDĐ."""
    m = re.match(r'^([^<:]{1,60}):(\s|$)', h)
    if m and len(m.group(1).split()) <= 8: return '<strong>%s:</strong>%s' % (m.group(1), h[m.end(1) + 1:])
    return h


def sc_sp_lines(ids):
    return ['<p class="p1">[product ID="%s" Description= "none" Display="block"]</p>' % i for i in ids]


def dung(md, meta):
    bl = parse_md(md)
    cb, L = [], []
    bo = set()
    def last_ital():
        r = -1
        for i, b in enumerate(bl):
            if b['type'] == 'ital': r = i
        return r
    for i, b in enumerate(bl):
        if b['type'] != 'h3' or i in bo or not (LA_MUC_MUA_TZ.search(b['text'].replace('**', '')) or LA_MUC_MUA.search(b['text'].replace('**', ''))): continue
        j = i + 1
        while j < len(bl) and bl[j]['type'] != 'h3' and j != last_ital(): bo.add(j); j += 1
        bo.add(i)
        for k in range(i + 1, len(bl)):
            if bl[k]['type'] == 'h3': bl[k]['text'] = re.sub(r'^(\d+)\.', lambda m: str(int(m.group(1)) - 1) + '.', bl[k]['text'])
        cb.append('Bài tự viết mục "%s", đã bỏ, dùng block Mua TopZone chuẩn' % b['text'])
    co_mua = meta.get('co_mua')
    if co_mua is None:
        co_mua = (meta.get('dang_bai') in LOAI_MUA or bool(meta.get('urls_push'))) and bool(meta.get('san_pham') or meta.get('nganh'))
    mua_tai, mua_so = -1, 0
    if co_mua:
        h3s = [i for i, b in enumerate(bl) if b['type'] == 'h3' and i not in bo]
        last = h3s[-1] if h3s else -1
        if last >= 0 and re.search('câu hỏi', bl[last]['text'], re.I):
            m = re.match(r'^(\d+)\.\s*', bl[last]['text'])
            mua_so = int(m.group(1)) if m else len(h3s)
            bl[last]['text'] = '%d. %s' % (mua_so + 1, re.sub(r'^\d+\.\s*', '', bl[last]['text']))
            mua_tai = last
        else:
            mua_so = len(h3s) + 1; mua_tai = -2
    sc_sp = meta.get('sc_sp') or []
    li_open = [False]
    Hh = []
    def close():
        if li_open[0]: Hh.append('</ul>'); li_open[0] = False
    lit = last_ital()
    if lit < 0:
        for i in range(len(bl) - 1, -1, -1):
            if bl[i]['type'] == 'p' and not bl[i]['inInfo']: lit = i; break
        cb.append('Không thấy câu kết in nghiêng, đã lấy đoạn cuối làm câu kết')
    if meta.get('dang_bai', '').startswith('So sánh'):
        for i, b in enumerate(bl):
            if b['type'] == 'table' and i + 1 < len(bl) and bl[i + 1]['type'] == 'info_open':
                j = i + 2; ds = []
                while j < len(bl) and bl[j]['type'] != 'info_close': ds.append(bl[j]); j += 1
                if j < len(bl) and ds and all(x['type'] == 'li' and re.match(r'^\*\*[^*]+\*\*\s*:', x['text']) for x in ds):
                    bo.update(range(i + 1, j + 1)); cb.append('Đã bỏ box thông số ngay sau bảng so sánh (trùng bảng)')
    xem = meta.get('xem_them') or []
    # shortcode sản phẩm theo mục: đặt trước H3 kế tiếp của mục khớp "sau" (hoặc cuối bài)
    h3_idx = [i for i, b in enumerate(bl) if b['type'] == 'h3' and i not in bo]
    chen_truoc = {}
    for s in sc_sp:
        k = str(s.get('sau', '')).lower()
        if k in ('cuoi', 'cuối', ''): continue
        if k == 'mua': continue
        hit = [i for i in h3_idx if k in re.sub(r'\*\*', '', bl[i]['text']).lower()]
        if len(hit) != 1: cb.append('sc_sp "%s" khớp %d H3, bỏ qua' % (s.get('sau'), len(hit))); continue
        nxt = [i for i in h3_idx if i > hit[0]]
        pos = nxt[0] if nxt else lit
        chen_truoc.setdefault(pos, []).extend(s['ids'])
    sau_mua = [x for s in sc_sp if str(s.get('sau', '')).lower() == 'mua' for x in s['ids']]
    cuoi = [x for s in sc_sp if str(s.get('sau', '')).lower() in ('cuoi', 'cuối', '') for x in s['ids']]
    for i, b in enumerate(bl):
        if i in chen_truoc and i != mua_tai and i != lit: close(); Hh.extend(sc_sp_lines(chen_truoc[i]))
        if i == mua_tai:
            close(); Hh.extend(sc_sp_lines(chen_truoc.pop(i, []))); Hh.append(mua_block_tz(mua_so, meta)); Hh.extend(sc_sp_lines(sau_mua))
        if i == lit:
            close()
            if mua_tai == -2: Hh.append(mua_block_tz(mua_so, meta)); Hh.extend(sc_sp_lines(sau_mua))
            Hh.extend(sc_sp_lines(chen_truoc.pop(i, [])))
            Hh.extend(sc_sp_lines(cuoi))
        if i in bo: continue
        t = b['type']
        if t != 'li': close()
        if t == 'p' and not b['inInfo'] and i != lit:
            j = i - 1
            while j >= 0 and bl[j]['type'] == 'p': j -= 1
            k = i + 1
            while k < len(bl) and bl[k]['type'] == 'p': k += 1
            if j >= 0 and bl[j]['type'] == 'h3' and re.search('câu hỏi', bl[j]['text'], re.I) and k < len(bl) and bl[k]['type'] == 'h4':
                cb.append('Đã bỏ đoạn dẫn ở mục câu hỏi liên quan'); continue
        if t == 'h2': Hh.append('<h2>%s</h2>' % inline(b['text']))
        elif t == 'h3': Hh.append('<h3><strong>%s</strong></h3>' % esc(LINK_MD.sub(r'\1', b['text']).replace('**', '')))
        elif t == 'h4': Hh.append('<h4><strong>%s</strong></h4>' % esc(re.sub(r'^\d+(\.\d+)*\.?\s+', '', LINK_MD.sub(r'\1', b['text']).replace('**', ''))))
        elif t in ('info_open', 'info_close'): pass     # TopZone không dùng khung [info]; nội dung bên trong để nguyên dạng đoạn/list
        elif t == 'sc': Hh.append('<p>%s</p>' % b['text'])
        elif t == 'li':
            if not li_open[0]: Hh.append('<ul>'); li_open[0] = True
            Hh.append('<li>%s</li>' % bold_nhan(inline(b['text'])))
        elif t == 'table': Hh.append(table_tz(b['rows']))
        elif t == 'ital' or i == lit: Hh.append('<p><em>%s</em></p>' % inline(re.sub(r'^\*|\*$', '', b['text'])))
        elif b['inInfo']: Hh.append('<p><em>%s</em></p>' % inline(b['text']))
        else: Hh.append('<p>%s</p>' % inline(b['text']))
    close()
    Hh.append(cta_tz(meta))
    if xem:
        Hh += ['<p><strong>Xem thêm:</strong></p>', '<ul>'] + ['<li>%s</li>' % a_tag(x['url'], x['title']) for x in xem] + ['</ul>']
    # lint dùng chung của TGDĐ (bỏ các mục chỉ áp cho TGDĐ)
    m2 = dict(meta, sc_dau='x', sc_cuoi='x')
    D.lint(bl, bo, md, m2, L, mua_tai)
    L[:] = [x for x in L if not re.search(r'thegioididong|Thế Giới Di Động|TGDĐ', x)]
    for a, u in LINK_MD.findall(md):
        if 'thegioididong.com' in u or 'dienmayxanh.com' in u: L.append('Bài TopZone chỉ link topzone.vn: ' + u)
    for x in xem:
        if 'topzone.vn' not in x['url']: L.append('Xem thêm phải là bài topzone.vn: ' + x['url'])
    if re.search(r'1900\s?9696\s?42|1900\.9696\.42', md) is None and 'hotline' in md.lower(): pass
    if re.search(r'<[^>]+style="[^"]*(?:color|background)', '\n'.join(Hh).replace(cta_tz(meta), '')): L.append('Có tô màu ngoài nút CTA')
    return '\n'.join(Hh), L, cb


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) < 2: print(__doc__); sys.exit()
    o = None
    if '-o' in a: i = a.index('-o'); o = a[i + 1]; del a[i:i + 2]
    md = open(a[0]).read(); meta = json.load(open(a[1]))
    html, L, cb = dung(md, meta)
    if o: open(o, 'w').write(html)
    print('LINT (%d):' % len(L)); [print(' -', x) for x in L]
    print('CẢNH BÁO (%d):' % len(cb)); [print(' -', x) for x in cb]
    print('Đã lưu', o or '(không lưu, thêm -o)')
