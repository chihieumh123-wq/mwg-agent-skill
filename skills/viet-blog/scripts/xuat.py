"""Tạo Google Doc chứa HTML bài trong Drive "TGDĐ - Content Blog Auto" (giống node 40 n8n). In ra link Doc.
  python3 xuat.py doc bai.html "<keyword>" [--id <docId>]   (--id: ghi đè Doc cũ, giữ link)
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _chung import *

if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) < 3 or a[0] != 'doc': print(__doc__); sys.exit()
    ten = '%s - %s' % (a[2], time.strftime('%d/%m/%Y %H:%M'))
    tmp = os.path.join(CACHE, 'upload.txt')
    open(tmp, 'w').write(open(a[1]).read())
    if '--id' in a:   # sửa bài: ghi đè nội dung Doc đã có, link không đổi
        fid = a[a.index('--id') + 1]
        gws(['drive', 'files', 'update', '--params', json.dumps({'fileId': fid}),
             '--upload', 'upload.txt', '--upload-content-type', 'text/plain'], {}, cwd=CACHE)
        print('https://docs.google.com/document/d/%s/edit' % fid); sys.exit()
    d = gws(['drive', 'files', 'create', '--params', json.dumps({'fields': 'id,webViewLink'}),
             '--upload', 'upload.txt', '--upload-content-type', 'text/plain'],
            {'name': ten, 'mimeType': 'application/vnd.google-apps.document', **({'parents': [DRIVE_FOLDER]} if DRIVE_FOLDER else {})}, cwd=CACHE)  # gws chỉ nhận file upload trong thư mục hiện tại
    print('https://docs.google.com/document/d/%s/edit' % d['id'])
