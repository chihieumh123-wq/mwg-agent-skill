"""Dựng HTML bài Hỏi Đáp TGDĐ từ markdown + lint. Port phần render/lint node "37. Dựng HTML" của luồng n8n.

  python3 dung_html.py bai.md bai.json -o bai.html        → in danh sách LINT + CẢNH BÁO, lưu html
Quy ước markdown (xem references/dinh-dang-markdown.md):
  ## sapo | ### 1. H3 | #### H4 (không số) | đoạn | - li / + li | bảng | [info]..[/info]
  [anchor](url) link | **đậm** | *câu kết in nghiêng* (dòng cuối thân bài) | dòng shortcode [Product_Promotion ...]/[sosanh ...]
bai.json: keyword, kw_phu[], dang_bai, title, meta, urls_push[], san_pham[{ten,hang,phien_ban[],push}], nganh, cate,
          co_mua (true/false/bỏ trống=tự xét), sc_dau, sc_cuoi, xem_them[{url,title}], nguon[]
Mục "Mua ... tại Thế Giới Di Động" do script chèn (trước mục câu hỏi liên quan), bài KHÔNG tự viết.
"""
import html as H_, json, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _chung import *

SIEU_THI = 'https://www.thegioididong.com/he-thong-sieu-thi-the-gioi-di-dong'
LOAI_MUA = ['Top sản phẩm', 'Top bán chạy', 'Tiêu chí chọn mua', 'So sánh sản phẩm', 'So sánh dòng sản phẩm', 'Giới thiệu sản phẩm', 'Cung cấp thông tin',
            'Giới thiệu dòng sản phẩm', 'Giới thiệu thương hiệu', 'Tin khuyến mãi']
LA_MUC_MUA = re.compile(r'^(\d+\.\s*)?(mua|hướng dẫn (đặt )?mua)\b.*(thế giới di động|tgdđ)|mua ở đâu', re.I)
LINK_MD = re.compile(r'\[([^\]]+)\]\((https?://[^)\s]+)\)')


def esc(s): return H_.escape(str(s), quote=False)
def esca(s): return H_.escape(str(s), quote=True)
def a_tag(u, t): return '<a href="%s" title="%s" target="_blank" rel="noopener">%s</a>' % (esca(u), esca(t), esc(t))


def parse_md(md):
    md = re.sub(r'^```[a-z]*\s*|```\s*$', '', md.replace('\r', ''))
    bl, info, tbl = [], False, None
    def push(b):
        b['inInfo'] = info; bl.append(b)
    for raw in md.split('\n'):
        l = raw.strip()
        if tbl is not None and not l.startswith('|'): push(tbl); tbl = None
        if not l: continue
        if l.startswith('|'):
            if re.match(r'^\|[\s:|-]+\|?$', l): continue
            cells = [c.strip() for c in l.strip('|').split('|')]
            if tbl is None: tbl = {'type': 'table', 'rows': []}
            tbl['rows'].append(cells); continue
        if re.match(r'^\[info\]$', l, re.I): push({'type': 'info_open'}); info = True; continue
        if re.match(r'^\[/info\]$', l, re.I): info = False; push({'type': 'info_close'}); continue
        m = re.match(r'^(#{1,4})\s+(.*)$', l)
        if m:
            n = len(m.group(1)); push({'type': {1: 'h2', 2: 'h2', 3: 'h3', 4: 'h4'}[n], 'text': m.group(2).strip()}); continue
        if re.match(r'^\[IMG\b', l, re.I): continue
        if re.match(r'^\[(Product_Promotion|sosanh)\b', l, re.I): push({'type': 'sc', 'text': l}); continue
        m = re.match(r'^([-+•])\s+(.*)$', l)
        if m:
            tx = m.group(2).strip()
            mm = re.match(r'^([^*:\[\]()]{2,60}?):\s+(.+)$', tx)   # "Nhãn: nội dung" → in đậm nhãn trước dấu ":" (user chốt 25/10/2026)
            if mm and not tx.startswith('**'): tx = '**%s**: %s' % (mm.group(1).strip(), mm.group(2))
            push({'type': 'li', 'text': tx, 'mark': m.group(1)}); continue
        if re.match(r'^\*[^*].*[^*]\*$', l): push({'type': 'ital', 'text': l[1:-1].strip()}); continue
        push({'type': 'p', 'text': l})
    if tbl is not None: push(tbl)
    return bl


def inline(t):
    toks = []
    def keep(m):
        toks.append(a_tag(m.group(2), m.group(1).replace('**', ''))); return '\u0001%d\u0002' % (len(toks) - 1)
    t = LINK_MD.sub(keep, str(t))
    t = esc(t)
    t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'(^|[^*])\*([^*\s][^*]*?)\*(?!\*)', r'\1<em>\2</em>', t)
    t = re.sub(r'<strong>(\u0001\d+\u0002)</strong>', r'\1', t)
    t = re.sub(r'((?:1800|1900)[\s.]?\d{3,4}[\s.]?\d{2,4})', lambda m: '<a href="tel:%s">%s</a>' % (re.sub(r'\D', '', m.group(1)), m.group(1)), t)
    return re.sub(r'\u0001(\d+)\u0002', lambda m: toks[int(m.group(1))], t)


TD = 'box-sizing: border-box; border: 1px solid #cccccc; padding: 8px 10px; vertical-align: middle;'
WRAP = 'white-space: normal; overflow-wrap: anywhere; word-break: break-word;'


def table_html(rows):
    n = max(len(r) for r in rows)
    head = rows[0]
    la_gia = [j > 0 and bool(re.search('giá', str(c).replace('*', ''), re.I)) for j, c in enumerate(head + [''] * n)]
    if n == 3 and la_gia[1] and la_gia[2]: w = [46, 27, 27]
    elif n == 2: w = [60, 40] if la_gia[1] else [35, 65]
    elif n == 3: w = [24, 38, 38]
    else: r_ = int(76 / (n - 1) * 100) / 100; w = [24] + [r_] * (n - 1)
    T = ['<div style="width: 100%; max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 16px 0; box-sizing: border-box;">',
         '<table style="width: 100%; min-width: 620px; max-width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0; font-size: 14px; line-height: 1.5; color: #333333;">']
    rows = [r for ri, r in enumerate(rows) if ri == 0 or not all(re.match(r'^\s*(\*\*)?(hãng không công bố|không công bố|đang cập nhật|-)?(\*\*)?\s*$', str(c or ''), re.I) for c in r[1:])]
    for ri, r in enumerate(rows):
        cells = []
        for j in range(n):
            v = inline(r[j] if j < len(r) else '')
            if ri == 0:
                v = re.sub(r'</?strong>', '', v)
                cells.append('<th style="width: %s%%; %s text-align: center; background: #000000; color: #FFE14C; font-weight: bold; %s">%s</th>' % (w[j], TD, 'white-space: nowrap;' if la_gia[j] else WRAP, v))
            else:
                cells.append('<td style="width: %s%%; %s %s">%s</td>' % (w[j], TD, 'text-align: center; white-space: nowrap;' if la_gia[j] else 'text-align: left; ' + WRAP, v))
        T.append('<tr>' + ''.join(cells) + '</tr>')
    T += ['</table>', '</div>']
    return '\n'.join(T)


def mua_block(so, meta):
    sp = meta.get('san_pham') or []
    names = []
    for p in sp:
        t = ten_gon(p.get('ten'))
        if t and t not in names: names.append(t)
    nganh = str(meta.get('nganh') or '').lower()
    hangs = []
    for p in sp:
        h = re.sub(r'\s*\(.*\)$', '', str(p.get('hang') or '')).strip()
        if h and h not in hangs: hangs.append(h)
    if meta.get('hang_chung') and not hangs: hangs = [meta['hang_chung']]
    if len(names) == 1: ten = names[0]
    elif 2 <= len(names) <= 3 and 'So sánh' in meta.get('dang_bai', ''): ten = ' và '.join(names)
    else: ten = (nganh or 'sản phẩm công nghệ') + (' ' + hangs[0] if len(hangs) == 1 else '')
    if meta.get('ten_muc_mua'): ten = meta['ten_muc_mua']
    apple = all(re.search('apple|iphone|ipad|macbook|airpods', str(p.get('hang')) + ' ' + str(p.get('ten')), re.I) for p in sp) if sp else bool(re.search('apple|iphone', ' '.join(hangs), re.I))
    may_lon = str(meta.get('cate')) in ('42', '522', '44', '7077')
    ten_e = esc(ten)
    if apple:
        p1 = 'Thế Giới Di Động là <strong>đại lý ủy quyền của Apple tại Việt Nam</strong>, cung cấp <strong>%s</strong> chính hãng' % ten_e + \
             ' với thông tin nguồn gốc, giá bán và chính sách bảo hành được công bố rõ ràng. Đây là địa chỉ phù hợp với người muốn mua %s an tâm, có thể xem sản phẩm trực tiếp và nhận hỗ trợ trong suốt quá trình sử dụng.' % ten_e
    else:   # đoạn giới thiệu chung cho SP không thuộc Apple (user chốt 15/10/2026, giữ nguyên văn)
        p1 = ('Thế Giới Di Động là hệ thống bán lẻ chuyên cung cấp điện thoại di động, máy tính bảng, laptop, thiết bị đeo, phụ kiện công nghệ và nhiều sản phẩm điện tử tiêu dùng tại Việt Nam. '
              'Bên cạnh mạng lưới cửa hàng rộng khắp, Thế Giới Di Động còn phát triển kênh mua sắm trực tuyến tại trang web <a href="https://www.thegioididong.com/" title="Thế Giới Di Động" target="_blank" rel="noopener">thegioididong.com</a> hỗ trợ người dùng tham khảo thông tin sản phẩm, so sánh giá, '
              'lựa chọn hình thức thanh toán và các chương trình thu cũ đổi mới, trả chậm hoặc ưu đãi theo từng thời điểm.')
    duoi = ' Người mua có thể dễ dàng kiểm tra giá, tình trạng hàng tại khu vực, lựa chọn giao tận nơi hoặc nhận hàng tại siêu thị gần nhất.'
    pb = [v for v in (sp[0].get('phien_ban') or [])] if len(names) == 1 and sp else []
    pb = [v if isinstance(v, str) else v.get('size', '') for v in pb]; pb = [v for v in pb if v]
    if len(pb) > 1: p2 = 'TGDĐ hiện có <strong>%s</strong> với các phiên bản %s để bạn lựa chọn theo nhu cầu lưu trữ và ngân sách.' % (esc(names[0]), esc(', '.join(pb))) + duoi
    elif len(names) == 1: p2 = 'TGDĐ hiện có <strong>%s</strong> với mức giá hấp dẫn và chính sách bảo hành chính hãng.' % esc(names[0]) + duoi
    elif len(names) > 1: p2 = 'TGDĐ hiện có nhiều lựa chọn như ' + ', '.join('<strong>%s</strong>' % esc(t) for t in names[:5]) + (',...' if len(names) > 5 else '') + ' với nhiều phiên bản, màu sắc và mức giá khác nhau.' + duoi
    else: p2 = 'TGDĐ hiện có nhiều mẫu %s với đa dạng thương hiệu, cấu hình và mức giá.' % ten_e + duoi
    p3 = 'Bên cạnh yếu tố chính hãng, Thế Giới Di Động còn giúp người mua tối ưu chi phí nhờ <strong>giá niêm yết minh bạch và các chương trình ưu đãi theo từng thời điểm</strong>. Tùy sản phẩm, khách hàng có thể được giảm trực tiếp, nhận ưu đãi thanh toán' + (', mua trả góp hoặc thu cũ đổi mới' if may_lon else ' hoặc mua trả góp') + ' theo điều kiện áp dụng.'
    hoa = ten if re.match(r'^i[A-Z]', ten) else ten[:1].upper() + ten[1:]
    li = ['<li><strong>%s chính hãng</strong>, có thông tin nguồn gốc, giá bán và chính sách bảo hành rõ ràng.</li>' % esc(hoa),
          '<li><strong>Giá niêm yết minh bạch</strong>, dễ kiểm tra theo từng phiên bản, màu sắc hoặc cấu hình.</li>',
          '<li>Thường xuyên có ưu đãi giảm giá, ưu đãi thanh toán hoặc phiếu mua hàng tùy sản phẩm và thời điểm.</li>',
          '<li>Hỗ trợ <strong>trả góp và thu cũ đổi mới</strong>, giúp giảm số tiền cần thanh toán ban đầu theo điều kiện áp dụng.</li>' if may_lon else '<li>Hỗ trợ <strong>trả góp</strong> theo điều kiện áp dụng.</li>',
          '<li>Hỗ trợ bảo hành, đổi trả và tư vấn kỹ thuật theo chính sách áp dụng tại thời điểm mua hàng.</li>',
          '<li><a style="color: #0066cc; text-decoration: none; font-weight: bold;" title="Hệ thống siêu thị Thế Giới Di Động" href="%s" target="_blank" rel="noopener">Hệ thống siêu thị Thế Giới Di Động</a> rộng khắp, thuận tiện để xem sản phẩm, nhận hàng, bảo hành hoặc yêu cầu hỗ trợ trực tiếp.</li>' % SIEU_THI,
          '<li>Có thể đặt hàng online, chọn giao tận nơi hoặc nhận tại siêu thị tùy tình trạng sản phẩm ở từng khu vực.</li>']
    return '\n'.join(['<h3><strong>%d. Mua %s chính hãng, giá tốt tại Thế Giới Di Động</strong></h3>' % (so, ten_e), '<p>%s</p>' % p1, '<p>%s</p>' % p2] + (['<p>%s</p>' % p3] if apple else []) + [   # SP không thuộc Apple: bỏ đoạn 3 vì đoạn giới thiệu đã nói ưu đãi, trả chậm, thu cũ đổi mới
        '<div style="width: 100%; max-width: 100%; margin: 18px 0; padding: 16px 20px; background-color: #fff9e6; border: 1px solid #f2c94c; border-left: 5px solid #f5b700; border-radius: 8px; box-sizing: border-box; color: #222222;">',
        '<p style="margin: 0 0 12px 0; padding: 0 0 10px 0; border-bottom: 1.5px solid #ebd27b; font-weight: bold; color: #111111;">Lý do nên mua %s tại Thế Giới Di Động</p>' % ten_e,
        '<ul>'] + li + ['</ul>', '</div>',
        '<p style="margin: 16px 0 8px 0; font-weight: bold; color: #222222;">Bạn có thể kiểm tra giá và đặt mua %s qua các kênh:</p>' % ten_e,
        '<ul style="margin: 0; padding-left: 20px;">',
        '<li style="margin-bottom: 6px;">Cửa hàng trực tuyến: <a style="color: #0066cc; font-weight: 600;" title="Thế Giới Di Động" href="https://www.thegioididong.com/" target="_blank" rel="noopener">thegioididong.com</a></li>',
        '<li>Hotline tư vấn và hỗ trợ khách hàng: <a style="color: #d9381e; font-weight: bold; text-decoration: none; white-space: nowrap;" href="tel:1900232460">1900 232 460</a> (8:00 - 21:30)</li>',
        '</ul>'])


def dung(md, meta):
    bl = parse_md(md)
    cb, L = [], []
    # Mục Mua do bài tự viết → bỏ, lùi số H3 sau
    bo = set()
    def last_ital():
        r = -1
        for i, b in enumerate(bl):
            if b['type'] == 'ital': r = i
        return r
    for i, b in enumerate(bl):
        if b['type'] != 'h3' or i in bo or not LA_MUC_MUA.search(b['text'].replace('**', '')): continue
        j = i + 1
        while j < len(bl) and bl[j]['type'] != 'h3' and j != last_ital(): bo.add(j); j += 1
        bo.add(i)
        for k in range(i + 1, len(bl)):
            if bl[k]['type'] == 'h3': bl[k]['text'] = re.sub(r'^(\d+)\.', lambda m: str(int(m.group(1)) - 1) + '.', bl[k]['text'])
        cb.append('Bài tự viết mục "%s", đã bỏ, dùng block Mua chuẩn' % b['text'])
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
    li_open = [False]
    Hh = []
    def close():
        if li_open[0]: Hh.append('</ul>'); li_open[0] = False
    lit = last_ital()
    if lit < 0:
        for i in range(len(bl) - 1, -1, -1):
            if bl[i]['type'] == 'p' and not bl[i]['inInfo']: lit = i; break
        cb.append('Không thấy câu kết in nghiêng, đã lấy đoạn cuối làm câu kết')
    # Bài so sánh: bỏ box thông số [info] ngay sau bảng
    if meta.get('dang_bai', '').startswith('So sánh'):
        for i, b in enumerate(bl):
            if b['type'] == 'table' and i + 1 < len(bl) and bl[i + 1]['type'] == 'info_open':
                j = i + 2; ds = []
                while j < len(bl) and bl[j]['type'] != 'info_close': ds.append(bl[j]); j += 1
                if j < len(bl) and ds and all(x['type'] == 'li' and re.match(r'^\*\*[^*]+\*\*\s*:', x['text']) for x in ds):
                    bo.update(range(i + 1, j + 1)); cb.append('Đã bỏ box thông số ngay sau bảng so sánh (trùng bảng)')
    da_dau = False
    xem = meta.get('xem_them') or []
    for i, b in enumerate(bl):
        if i == mua_tai: close(); Hh.append(mua_block(mua_so, meta))
        if i == lit:
            close()
            if mua_tai == -2: Hh.append(mua_block(mua_so, meta))
            if meta.get('sc_cuoi'): Hh.append('<p>%s</p>' % meta['sc_cuoi'])
            if xem:
                Hh.append('\n'.join(['[info]', '<p><strong>Xem thêm:</strong></p>', '<ul>'] + ['<li>%s</li>' % a_tag(x['url'], x['title']) for x in xem] + ['</ul>', '[/info]']))
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
        if t == 'h2':
            if meta.get('sc_dau') and not da_dau: Hh.append('<p>%s</p>' % meta['sc_dau']); da_dau = True
            Hh.append('<h2>%s</h2>' % inline(b['text']))
        elif t == 'h3': Hh.append('<h3><strong>%s</strong></h3>' % esc(LINK_MD.sub(r'\1', b['text']).replace('**', '')))
        elif t == 'h4': Hh.append('<h4><strong>%s</strong></h4>' % esc(re.sub(r'^\d+(\.\d+)*\.?\s+', '', LINK_MD.sub(r'\1', b['text']).replace('**', ''))))
        elif t == 'info_open': Hh.append('[info]')
        elif t == 'info_close': Hh.append('[/info]')
        elif t == 'sc': Hh.append('<p>%s</p>' % b['text'])
        elif t == 'li':
            if not li_open[0]: Hh.append('<ul>'); li_open[0] = True
            Hh.append('<li>%s</li>' % inline(b['text']))
        elif t == 'table': Hh.append(table_html(b['rows']))
        elif t == 'ital' or i == lit: Hh.append('<p><em>%s</em></p>' % inline(re.sub(r'^\*|\*$', '', b['text'])))
        else: Hh.append('<p>%s</p>' % inline(b['text']))
    close()
    if meta.get('sc_dau') and not da_dau: Hh.insert(0, '<p>%s</p>' % meta['sc_dau'])
    # Không in "Nguồn tham khảo" cuối bài (user chốt 15/10/2026); nguon[] chỉ ghi vào cột Link đã chèn
    lint(bl, bo, md, meta, L, mua_tai)
    lint_brand(bl, bo, md, meta, L, mua_tai)
    return '\n'.join(Hh), L, cb



BRAND_RE = re.compile(r'Thế Giới Di Động|TGDĐ|TopZone', re.I)


def lint_brand(bl, bo, md, meta, L, mua_tai):
    """Rule nhắc brand (references/rule-nhac-brand.md, user chốt 26/10/2026).
    Nhóm A (có block Mua) cần ≥ 2 lần nhắc brand ngoài block Mua và 1 câu FAQ "mua ở đâu"; nhóm B cần ≥ 1 đoạn nhắc brand ở thân bài."""
    n = len(BRAND_RE.findall(LINK_MD.sub(r'\1', md)))
    if mua_tai == -1:
        if n < 1: L.append('Brand: bài nhóm B chưa nhắc Thế Giới Di Động/TopZone trong đoạn nào (rule-nhac-brand 5.3)')
        return
    if n < 2: L.append('Brand: nhóm A cần nhắc brand ≥ 2 chỗ ngoài block Mua (mục giá + FAQ), hiện %d (rule-nhac-brand 5.2)' % n)
    if not any(b['type'] in ('h3', 'h4') and re.search(r'ở đâu|uy tín', b['text'], re.I) for i, b in enumerate(bl) if i not in bo):
        L.append('Brand: FAQ chưa có câu "Mua <SP> chính hãng ở đâu?" (bỏ qua nếu FAQ đã đủ 4 câu chất lượng hơn, ghi lý do vào Cảnh báo)')


def lint(bl, bo, md, meta, L, mua_tai):
    kw = meta.get('keyword', ''); dang = meta.get('dang_bai', '')
    title = str(meta.get('title', '')).strip(); mt = str(meta.get('meta', '')).strip()
    if len(title) > 65: L.append('Title dài %d ký tự (> 65)' % len(title))
    if not 140 <= len(mt) <= 160: L.append('Meta %d ký tự (chuẩn 140-160)' % len(mt))
    if not mt.endswith('Click xem ngay!'): L.append('Meta chưa kết thúc bằng "Click xem ngay!"')
    sapo = next((b for b in bl if b['type'] == 'h2'), None)
    if not sapo: L.append('Thiếu sapo (## ...)')
    else:
        st = LINK_MD.sub(r'\1', sapo['text']).replace('*', '').strip()
        if not 220 <= len(st) <= 300: L.append('Sapo %d ký tự (chuẩn 220-300)' % len(st))
        if not re.search(r'(nhé|ngay)\s*!?\s*$', st, re.I): L.append('Sapo thiếu câu CTA cuối (VD "Cùng xem ngay nhé!")')
        if LINK_MD.findall(sapo['text']): L.append('Sapo có link (sapo không chèn link)')
    h4_ten = bool(re.match(r'^(Top|Tin khuyến mãi|Tiêu chí chọn mua)', dang))
    faq = False; hs = []; cau = []
    for i, b in enumerate(bl):
        if i in bo: continue
        if b['type'] in ('h3', 'h4'):
            ht = re.sub(r'^\d+(\.\d+)*\.?\s+', '', b['text'].replace('**', ''))
            if b['type'] == 'h3':
                faq = bool(re.search('câu hỏi', b['text'], re.I))
                if not re.match(r'^\d+\.\s', b['text']): L.append('H3 chưa đánh số: ' + b['text'])
                hs.append(b['text'])
            else:
                if re.match(r'^\d+(\.\d+)*\.?\s', b['text']): L.append('H4 không được đánh số: ' + b['text'])
                if faq: cau.append(ht)
                else: hs.append(b['text'])
            if LINK_MD.search(b['text']): L.append('Heading có link: ' + ht)
            if ht.endswith('.'): L.append('Heading có dấu chấm cuối: ' + ht)
            hype = [w for w in ['đỉnh cao', 'vượt trội', 'đột phá', 'ấn tượng', 'nâng tầm', 'siêu mạnh'] if w in ht.lower()]
            if hype: L.append('Heading dùng từ quảng cáo "%s": %s' % ('", "'.join(hype), ht))
            if ':' in ht: L.append('Heading kiểu dấu hai chấm rồi giải thích: ' + ht)
            n = len(ht.split())
            if b['type'] == 'h4' and not h4_ten and len(ht) > 52: L.append('H4 dài %d ký tự (tối đa ~50, mục lục cắt chữ): %s' % (len(ht), ht))
            if n > 15: L.append('Heading dài %d từ (tối đa 15): %s' % (n, ht))
            elif n < 8 and not (b['type'] == 'h4' and (faq or h4_ten)): L.append('Heading ngắn %d từ (nên 8-15, nêu rõ điểm khác biệt/thông tin chính): %s' % (n, ht))
        if b['type'] == 'p' and not b['inInfo']:
            t = LINK_MD.sub(r'\1', b['text']); w = len(t.split())
            if w < 20 and not re.search(r':\s*\**$', t.strip()) and not re.match(r'^\*\*(Tham khảo thêm|Có thể bạn quan tâm|Đọc thêm|Xem thêm)', t): L.append('Đoạn ngắn (%d từ): %s' % (w, t[:60]))
            if w > 110: L.append('Đoạn dài (%d từ): %s' % (w, t[:60]))
            if len(LINK_MD.findall(b['text'])) > 4: L.append('Đoạn có hơn 4 link: ' + t[:60])
            for c in re.split(r'(?<=[.!?])\s+', t.replace('*', '')):
                # Câu chỉ báo chủ đề, không có thông tin ("Pin là điểm khác lớn nhất giữa hai máy.", "Khác biệt lớn hơn nằm ở lớp kính.")
                if len(c.split()) <= 14 and not re.search(r'\d', c) and re.search(r'(khác biệt|điểm khác|thay đổi|nâng cấp|điểm cộng|điểm trừ).{0,30}(là|nằm ở|đến từ)|^\S+( \S+)? là (điểm khác|khác biệt|thay đổi|nâng cấp)', c, re.I):
                    L.append('Câu chuyển ý cụt, không có thông tin (gộp vào câu sau): ' + c)
    hoi = [x for x in hs if x.strip().endswith('?')]
    if len(hs) >= 4 and len(hoi) / len(hs) > 0.6: L.append('Có %d/%d heading thân bài là câu hỏi, nên đổi bớt sang dạng nêu thông tin' % (len(hoi), len(hs)))
    if not any(b['type'] == 'h3' and re.search('câu hỏi', b['text'], re.I) for b in bl): L.append('Thiếu mục "Một số câu hỏi liên quan" (2-4 câu)')
    elif len(cau) < 2: L.append('Mục câu hỏi liên quan chỉ có %d câu, cần tối thiểu 2' % len(cau))
    elif len(cau) > 4: L.append('Mục câu hỏi liên quan có %d câu (tối đa 4)' % len(cau))
    push = [p for p in meta.get('san_pham') or [] if p.get('push')]
    if cau and push and not dang.startswith('Top'):
        tens = []
        for p in push:
            t = chuan(ten_gon(p['ten'])); h = chuan(re.sub(r'\s*\(.*\)$', '', p.get('hang') or ''))
            tens.append(t[len(h) + 1:] if h and t.startswith(h + ' ') else t)
        nhac = sum(1 for c in cau if any(' ' + t + ' ' in ' ' + chuan(c) + ' ' for t in tens))
        if nhac * 2 < len(cau): L.append('Câu hỏi liên quan chỉ %d/%d câu về SP cần push (%s), cần ít nhất một nửa' % (nhac, len(cau), ', '.join(tens)))
    plain = LINK_MD.sub(r'\1', md)
    gap = {}
    for m in re.finditer(r'(?:^|[\s,(])((?:khác|nhanh|mạnh|chậm|cải thiện|tăng|giảm|thấy|tốt|cao|thấp|lớn|nhỏ|sáng|mượt|bền|chênh|nâng cấp|vượt|hơn|kém|nóng|mát)\s+rõ(?:\s+rệt|\s+ràng)?|rõ\s+rệt)(?=[\s,.;:!?)]|$)', plain, re.I | re.M):
        k = m.group(1).lower(); gap[k] = gap.get(k, 0) + 1
    if gap: L.append('Dùng "rõ" để nhấn mạnh (nên thay bằng số liệu): ' + ', '.join('"%s" x%d' % kv for kv in gap.items()))
    # Từ khóa
    than = ' ' + chuan(re.sub(r'\[(Product_Promotion|sosanh)[^\]]*\]', ' ', plain)) + ' '
    so_tu = len(than.split())
    goc = lambda k: re.sub(r'^(so sanh|danh gia|review) ', '', chuan(k))
    def dem(k, nguyen_van=False):
        c = goc(k); p = re.split(r' (?:vs|va|voi|hay|so voi) ', c)
        if len(p) == 2 and not nguyen_van:
            r = re.compile(r' (?:%s (?:vs|va|voi|hay|so voi) %s|%s (?:vs|va|voi|hay|so voi) %s)(?= )' % (re.escape(p[0]), re.escape(p[1]), re.escape(p[1]), re.escape(p[0])))
        else: r = re.compile(' ' + re.escape(c) + '(?= )')
        return len(r.findall(than)), r
    kp = meta.get('kw_phu') or []
    k_n, k_re = dem(kw)
    do_dai = max(1, len(goc(kw).split()))
    can = max(3, round(so_tu * 0.01 / do_dai))
    if k_n < -(-can // 2) or k_n > can * 2: L.append('KW chính "%s": %d lần / %d từ (nên khoảng %d)' % (kw, k_n, so_tu, can))
    for ten, v in (('Title', title), ('Meta', mt), ('Sapo', sapo['text'] if sapo else '')):
        if not k_re.search(' ' + chuan(LINK_MD.sub(r'\1', v)) + ' '): L.append(ten + ' chưa có KW chính')
    # KW phụ: tối thiểu 1, tối đa 5 (có hơn 3 KW phụ thì tối đa 3), user chốt 12/10/2026
    toi_da = 3 if len(kp) > 3 else 5
    than_kc = k_re.sub(' ', than)
    for x in kp:
        n, r = dem(x, True)
        if k_n and goc(x) in goc(kw) and goc(x) != goc(kw): n = len(r.findall(than_kc))
        if n < 1: L.append('KW phụ "%s": chưa có trong bài' % x)
        elif n > toi_da: L.append('KW phụ "%s": %d lần (tối đa %d), dễ thành nhồi' % (x, n, toi_da))
    cores = [goc(x) for x in kp if goc(x)]
    for c in re.split(r'[.!?\n]+', plain):
        cc = ' ' + chuan(c) + ' '
        hit = [x for x in cores if ' ' + x + ' ' in cc]
        hit = [x for x in hit if not any(y != x and x in y for y in hit)]
        if len(hit) >= 2: L.append('Câu chứa %d KW phụ liền nhau (dễ thành nhồi): %s' % (len(hit), c.strip()[:140]))
    if dang.startswith('So sánh sản phẩm'):
        bs = [b for b in bl if b['type'] == 'table' and len(b['rows'][0]) >= 3 and not re.search('giá', ' '.join(b['rows'][0]), re.I)]
        if not bs: L.append('Bài so sánh chưa có bảng thông số đối chiếu')
        elif max(len(b['rows']) - 1 for b in bs) < 7: L.append('Bảng so sánh thông số dưới 8 dòng (nên 8-15)')
    if any(re.search(r'(^|\s)giá(\s|$)', x, re.I) for x in [kw] + kp) and not any(b['type'] == 'table' and re.search(r'\d', json.dumps(b['rows'])) and re.search(r'(đ|vnd|giá)', json.dumps(b['rows'], ensure_ascii=False), re.I) for b in bl):
        L.append('Từ khóa có "giá" nhưng bài chưa có bảng giá')
    dem_mo = {}
    for b in bl:
        if b['type'] != 'p': continue
        m = re.match(r'^(Bên cạnh đó|Hơn nữa|Ngoài ra|Đặc biệt|Không những thế)', b['text'].lstrip('*'), re.I)
        if m: k = m.group(1).lower(); dem_mo[k] = dem_mo.get(k, 0) + 1
    for k, v in dem_mo.items():
        if v > 2: L.append('Mở đoạn bằng "%s" %d lần (tối đa 2)' % (k, v))
    hom_nay = time.strftime('%d/%m/%Y')
    for m in re.finditer(r'cập nhật ngày\s*\**\s*(\d{2}/\d{2}/\d{4})', plain, re.I):
        if m.group(1) != hom_nay: L.append('Ngày cập nhật giá %s khác hôm nay %s' % (m.group(1), hom_nay))
    low = plain.lower()
    for w in ['cùng mình', 'tin đồn', 'rò rỉ', 'siêu phẩm', 'đỉnh cao', 'không thể bỏ qua', 'hãy cùng tìm hiểu', 'dế yêu', 'bí kíp', 'bật mí', 'thần thánh', 'từ a-z', 'trong thời đại ngày nay', 'ngày càng có nhiều người', 'hy vọng qua bài viết này', 'vô cùng quan trọng', 'đóng vai trò quan trọng', 'hàng đầu việt nam', 'uy tín nhất']:
        if w in low: L.append('Có từ cần tránh: "%s"' % w)
    for x in re.findall(r'[^\n]*;[^\n]*', re.sub(r'\[(Product_Promotion|sosanh)[^\]]*\]', '', plain))[:5]: L.append('Có dấu ";": ' + x.strip()[:120])
    for x in re.findall(r'[^.\n]*\b(?:theo|tham khảo từ|nguồn)\s+(?:NanoReview|GSMArena|Notebookcheck|Geekbench|AnTuTu)[^.\n]*', plain, re.I)[:5]: L.append('Nhắc nguồn trong thân bài: ' + x.strip()[:120])
    if re.search(r'Hỏi đáp|hỏi đáp', plain): L.append('Viết đúng "Hỏi Đáp"')
    for x in re.findall(r'[^.\n]*(?:dữ liệu TGDĐ|theo dữ liệu|dữ liệu được cung cấp|chưa có dữ liệu|chưa đủ dữ liệu|được cung cấp|giới hạn dữ liệu|tạm hết hàng|đang hết hàng|còn hàng)[^.\n]*', plain, re.I)[:8]:
        L.append('Lộ nguồn nội bộ/tình trạng hàng: ' + x.strip()[:160])
    if re.search(r'Điện Máy Xanh|Điện máy xanh|điện máy xanh', plain): L.append('Viết đúng "Điện máy XANH"')
    if re.search(r'\.\.\.(?!\.)', plain.replace(',...', '')): L.append('Có "..." không đi sau dấu phẩy (liệt kê dùng ",...")')
    # Link
    urls = [u for _, u in LINK_MD.findall(md)] + [x['url'] for x in meta.get('xem_them') or []]
    for u in set(urls):
        if urls.count(u) > 1: L.append('URL xuất hiện %d lần: %s' % (urls.count(u), u))
        if re.search(r'[?#]|-ldp|/tim-kiem|/tag/', u) or not u.startswith('https://'): L.append('URL không chuẩn: ' + u)
    for a, u in LINK_MD.findall(md):
        if a != a.strip() or re.match(r'^[\W_]', a) or re.search(r'[\W_]$', a.replace(')', 'x').rstrip('?!')): L.append('Anchor dư khoảng trắng/dấu: [%s]' % a)
        if '**' in a: L.append('Link bị in đậm: ' + a)
    n_xem = len(meta.get('xem_them') or [])
    if n_xem != 3: L.append('Box Xem thêm có %d bài (chuẩn 3)' % n_xem)
    if not meta.get('sc_dau'): L.append('Chưa có shortcode đầu bài (sc_dau)')
    if not meta.get('sc_cuoi'): L.append('Chưa có shortcode cuối bài (sc_cuoi)')


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) < 2: print(__doc__); sys.exit()
    o = None
    if '-o' in a: i = a.index('-o'); o = a[i + 1]; del a[i:i + 2]
    md = open(a[0]).read(); meta = json.load(open(a[1]))
    if str(meta.get('site', '')).lower() == 'topzone':   # bài TopZone dựng bằng dung_html_topzone.py (CMS V2, Mua TopZone, CTA, [product])
        import dung_html_topzone as TZ; dung = TZ.dung
    html, L, cb = dung(md, meta)
    if o: open(o, 'w').write(html)
    print('LINT (%d):' % len(L)); [print(' -', x) for x in L]
    print('CẢNH BÁO (%d):' % len(cb)); [print(' -', x) for x in cb]
    print('Đã lưu', o or '(không lưu, thêm -o)')
