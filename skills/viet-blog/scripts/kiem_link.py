"""Kiểm link trong HTML (HEAD, không theo redirect) như node 38-39 luồng n8n.
  python3 kiem_link.py bai.html [--go]      --go: gỡ thẻ <a> của link chết (giữ chữ), ghi đè file
Link chết = lỗi/4xx/5xx, hoặc 3xx sang URL khác (VD bài hoi-dap đã xoá redirect về /hoi-dap, filter cũ 308 về trang cha).
Chỉ bỏ qua 3xx chuẩn hoá (http→https, thêm/bớt www, dấu / cuối).
"""
import os, re, sys, time, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _chung import UA


class NoRedir(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None


op = urllib.request.build_opener(NoRedir)


def kiem(u):
    req = urllib.request.Request(u, method='HEAD', headers={'User-Agent': UA, 'Accept-Language': 'vi-VN,vi;q=0.9'})
    try:
        r = op.open(req, timeout=20); return r.status, ''
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get('Location', '')
    except Exception as e:
        return 0, str(e)


def chuan_url(u): return re.sub(r'^https?://(www\.)?', '', u.replace('&amp;', '&')).rstrip('/').lower()


def sau(u): return len([x for x in re.sub(r'^https?://[^/]+', '', u).split('?')[0].split('/') if x])


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: print(__doc__); sys.exit()
    html = open(a[0]).read()
    urls = []
    for u in re.findall(r'href="(https?://[^"]+)"', html):
        if u not in urls: urls.append(u)
    chet = []
    for u in urls:
        code, loc = kiem(u.replace('&amp;', '&')); time.sleep(1)
        ve_goc = 300 <= code < 400 and loc and chuan_url(loc) != chuan_url(u)
        ok = 200 <= code < 400 and not ve_goc
        print(('OK  ' if ok else 'CHẾT'), code, u, ('→ ' + loc if loc else ''))
        if not ok: chet.append(u)
    if '--go' in a and chet:
        for u in chet:
            html = re.sub(r'<a [^>]*href="%s"[^>]*>([\s\S]*?)</a>' % re.escape(u), r'\1', html)
        open(a[0], 'w').write(html); print('Đã gỡ %d link chết' % len(chet))
    print('Tổng %d link, chết %d' % (len(urls), len(chet)))
