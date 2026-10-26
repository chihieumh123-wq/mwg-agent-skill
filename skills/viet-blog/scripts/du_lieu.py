"""Tải dữ liệu sheet về cache, đọc/ghi dòng chạy.

  python3 du_lieu.py tai [--force]          tải tab Prompt + 3 kho link + 2 tab Shortcode (cache 12h)
  python3 du_lieu.py dong <số dòng> [--tab skill_hoi_dap]
  python3 du_lieu.py status <số dòng> <Status> [--tab ...]
  python3 du_lieu.py ghi <số dòng> <ket_qua.json> [--tab ...]
     ket_qua.json: {Title, Meta, Link SERP research, Outline, Docs HTML, Link đã chèn, Cảnh báo, QC, Status}
"""
import json, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _chung import *

# Tab skill_hoi_dap có thêm cột A "Site" (TGDĐ/TopZone, từ 25/10/2026); tab khác (main) bắt đầu từ Keyword ở cột A
def lech(tab):
    return 1 if tab == 'skill_hoi_dap' else 0


COT = ['Keyword', 'KW phụ', 'Dạng bài', 'URL SP cần push', 'Link tham khảo', 'Ghi chú', 'Status', 'Title', 'Meta',
       'Link SERP research', 'Outline', 'Docs HTML', 'Link đã chèn', 'Cảnh báo', 'QC', 'Cập nhật']


def tab_arg():
    if '--tab' in sys.argv:
        i = sys.argv.index('--tab'); t = sys.argv[i + 1]; del sys.argv[i:i + 2]; return t
    return TAB_CHAY


def tai(force):
    moc = os.path.join(CACHE, '_moc.txt')
    if not force and os.path.exists(moc) and time.time() - os.path.getmtime(moc) < 12 * 3600:
        print('Cache còn mới (<12h), bỏ qua. Thêm --force để tải lại.'); return
    # Prompt: key | value. outline|<dạng> là template, còn lại là prompt hoặc config
    rows = bang(doc_range('Prompt!A1:C200'))
    pdir = os.path.join(CACHE, 'prompts'); os.makedirs(pdir, exist_ok=True)
    for f in os.listdir(pdir): os.remove(os.path.join(pdir, f))
    cfg = {}
    for r in rows:
        k = str(r.get('key', '')).strip(); v = str(r.get('value', ''))
        if not k: continue
        if len(v) > 300 or k.startswith(('prompt', 'outline|', 'system')):
            fn = re.sub(r'[^\w]+', '_', deaccent(k)).strip('_') + '.md'
            open(os.path.join(pdir, fn), 'w').write(v)
        else:
            cfg[k] = v
    json.dump(cfg, open(os.path.join(CACHE, 'config.json'), 'w'), ensure_ascii=False, indent=1)
    print('Prompt:', len(os.listdir(pdir)), 'file, config:', list(cfg))
    sp = bang(doc_range('internal_link_sp!A1:K30000'))
    if not sp:
        # tab internal_link_sp là công thức (có thể trả rỗng khi lỗi); tab kho_link_snapshot là bản dán giá trị, không bắt buộc có
        print('internal_link_sp rỗng, thử tab kho_link_snapshot')
        try:
            sp = bang(doc_range('kho_link_snapshot!A1:K30000'))
        except SystemExit:
            print('Không có tab kho_link_snapshot. Kho link SP rỗng: bước chèn link tầng SP sẽ báo thiếu, xem SETUP.md mục kho link.')
    json.dump(sp, open(os.path.join(CACHE, 'kho_sp.json'), 'w'), ensure_ascii=False)
    tn = bang(doc_range('internal_link_thuat_ngu!A1:D5000'))
    json.dump(tn, open(os.path.join(CACHE, 'kho_thuat_ngu.json'), 'w'), ensure_ascii=False)
    sm = bang(doc_range('sitemap_hoi_dap!A1:F10000'))
    json.dump(sm, open(os.path.join(CACHE, 'sitemap_hoi_dap.json'), 'w'), ensure_ascii=False)
    hang = bang(doc_range('Hãng!A1:F3000', SHEET_SC))
    json.dump(hang, open(os.path.join(CACHE, 'sc_hang.json'), 'w'), ensure_ascii=False)
    try:
        tt = bang(doc_range('ID thuộc tính!A1:H20000', SHEET_SC))
    except SystemExit as e:
        print('Không đọc được tab ID thuộc tính:', e); tt = []
    json.dump(tt, open(os.path.join(CACHE, 'sc_thuoc_tinh.json'), 'w'), ensure_ascii=False)
    open(moc, 'w').write(time.strftime('%d/%m/%Y %H:%M'))
    print('internal_link_sp %d | thuật ngữ %d | sitemap %d | hãng %d | thuộc tính %d' % (len(sp), len(tn), len(sm), len(hang), len(tt)))


def tach(v):
    return [x.strip() for x in re.split(r'[\n,;]+', str(v or '')) if x.strip()]


def dong(n, tab):
    L = lech(tab)
    r = doc_range('%s!A%d:Q%d' % (tab, n, n))
    row = (r[0] if r else []) + [''] * 17
    site = row[0].strip() if L else ''
    v = row[L:]
    out({'dong': n, 'tab': tab, 'site': site or 'TGDĐ', 'site_da_chon': bool(site), 'keyword': v[0].strip(), 'kw_phu': tach(v[1]), 'dang_bai': v[2].strip(),
         'urls_push': [clean_url(u) for u in tach(v[3]) if u.startswith('http')],
         'link_tham_khao': [u for u in tach(v[4]) if u.startswith('http')], 'ghi_chu': v[5].strip(), 'status': v[6].strip()})


def ghi_o(n, tab, cot, giatri):
    can_sheet()
    c = chr(ord('A') + lech(tab) + COT.index(cot))
    gws(['sheets', 'spreadsheets', 'values', 'update', '--params',
         json.dumps({'spreadsheetId': SHEET, 'range': '%s!%s%d' % (tab, c, n), 'valueInputOption': 'RAW'})],
        {'values': [[giatri]]})


def ghi(n, tab, path):
    can_sheet()
    kq = json.load(open(path))
    kq['Cập nhật'] = time.strftime('%d/%m/%Y %H:%M')
    cut = lambda s: s if len(s) <= 49000 else s[:49000] + '\n[CẮT BỚT DO VƯỢT GIỚI HẠN Ô]'
    row = [cut(str(kq.get(c, ''))) for c in COT[6:]]
    gws(['sheets', 'spreadsheets', 'values', 'update', '--params',
         json.dumps({'spreadsheetId': SHEET, 'range': '%s!%s%d:%s%d' % (tab, chr(ord('G') + lech(tab)), n, chr(ord('P') + lech(tab)), n), 'valueInputOption': 'RAW'})],
        {'values': [row]})
    print('Đã ghi %s dòng %d' % (tab, n))


if __name__ == '__main__':
    tab = tab_arg()
    a = sys.argv[1:]
    if not a: print(__doc__); sys.exit()
    if a[0] == 'tai': tai('--force' in a)
    elif a[0] == 'dong': dong(int(a[1]), tab)
    elif a[0] == 'status': ghi_o(int(a[1]), tab, 'Status', a[2]); print('Status =', a[2])
    elif a[0] == 'ghi': ghi(int(a[1]), tab, a[2])
    else: print(__doc__)
