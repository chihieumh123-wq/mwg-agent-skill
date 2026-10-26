"""Hàm dùng chung cho các script skill viet-blog."""
import json, os, re, subprocess, sys, time, unicodedata, urllib.request

def _env(k, bat_buoc=True):
    v = os.environ.get(k, '').strip()
    if not v and bat_buoc:
        raise SystemExit('Thiếu biến môi trường %s. Xem blog-hoi-dap-tron-goi/SETUP.md' % k)
    return v


SHEET = _env('HOI_DAP_SHEET_ID', False)               # file "Hỏi Đáp n8n" (tab skill_hoi_dap, Prompt, kho link)
SHEET_SC = _env('SHORTCODE_SHEET_ID', False) or SHEET  # file Shortcode (tab Hãng, ID thuộc tính); bỏ trống = cùng file với SHEET
TAB_CHAY = 'skill_hoi_dap'
DRIVE_FOLDER = _env('HOI_DAP_DRIVE_FOLDER_ID', False)    # thư mục Drive chứa Doc bài (bỏ trống = Drive gốc)
CACHE = os.path.expanduser(os.environ.get('VIET_BLOG_CACHE') or '~/.cache/viet-blog')
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
os.makedirs(CACHE, exist_ok=True)


def gws(args, body=None, cwd=None):
    """Gọi gws (account gws đang đăng nhập; đổi account bằng GOOGLE_WORKSPACE_CLI_CONFIG_DIR). Trả JSON."""
    cmd = ['gws'] + args
    if body is not None:
        cmd += ['--json', json.dumps(body, ensure_ascii=False)]
    for lan in range(3):
        p = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
        out = p.stdout
        i = out.find('{')
        if i >= 0:
            try:
                d = json.loads(out[i:])
                if 'error' not in d:
                    return d
                err = d['error']
            except json.JSONDecodeError as e:
                err = str(e)
        else:
            err = (p.stderr or out)[-500:]
        time.sleep(2 + lan * 3)
    raise SystemExit('gws lỗi: %s\nLệnh: %s' % (err, ' '.join(args[:4])))


def can_sheet():
    if not SHEET:
        raise SystemExit('Thiếu biến môi trường HOI_DAP_SHEET_ID (ID file Google Sheet "Hỏi Đáp n8n"). Xem blog-hoi-dap-tron-goi/SETUP.md')


def doc_range(rng, sheet=None):
    sheet = sheet or SHEET
    can_sheet()
    d = gws(['sheets', 'spreadsheets', 'values', 'get', '--params',
             json.dumps({'spreadsheetId': sheet, 'range': rng}, ensure_ascii=False)])
    return d.get('values', [])


def bang(rows):
    """List hàng → list dict theo header dòng 1."""
    if not rows:
        return []
    h = [str(x).strip() for x in rows[0]]
    return [{h[i]: (r[i] if i < len(r) else '') for i in range(len(h))} for r in rows[1:]]


def deaccent(s):
    s = unicodedata.normalize('NFD', str(s or '').lower())
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn').replace('đ', 'd')


def chuan(s):
    """Bỏ dấu, chỉ giữ chữ số, cách 1 khoảng."""
    return re.sub(r'[^a-z0-9]+', ' ', deaccent(s)).strip()


def clean_url(u):
    return str(u or '').split('#')[0].split('?')[0].replace('http://', 'https://').rstrip('/')


def fetch(url, timeout=40, head=False):
    req = urllib.request.Request(url, method='HEAD' if head else 'GET',
                                 headers={'User-Agent': UA, 'Accept-Language': 'vi-VN,vi;q=0.9'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', 'ignore') if not head else ''


def cache_json(name):
    p = os.path.join(CACHE, name)
    if not os.path.exists(p):
        raise SystemExit('Chưa có cache %s. Chạy: python3 scripts/du_lieu.py tai' % name)
    return json.load(open(p))


def ten_gon(t):
    return re.sub(r'\s+\d+\s?(GB|TB)\b.*$', '', str(t or ''), flags=re.I).strip()


def out(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False, indent=1) + '\n')
