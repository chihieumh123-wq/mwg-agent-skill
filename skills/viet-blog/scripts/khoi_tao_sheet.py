"""Tạo file Google Sheet "Hỏi Đáp n8n" mẫu cho người mới (tab skill_hoi_dap + Prompt + các kho link rỗng đúng header).

  python3 khoi_tao_sheet.py ["Tên file"]

In ra spreadsheetId để đặt HOI_DAP_SHEET_ID. Tab Prompt được nạp sẵn từ references/prompt-snapshot (prompt + outline 13 dạng
bài) và config mặc định. Các kho link (internal_link_sp, internal_link_thuat_ngu, sitemap_hoi_dap, Hãng, ID thuộc tính)
chỉ có header: dán dữ liệu của site bạn vào, hoặc xin bản copy kho của team. Chạy bằng account gws đang đăng nhập.
"""
import json, os, sys, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _chung import gws

SNAP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'references', 'prompt-snapshot')
HDR_RUN = ['Site', 'Keyword', 'KW phụ (ko bắt buộc)', 'Dạng bài', 'URL SP cần push (ko bắt buộc)', 'Link tham khảo (ko bắt buộc)',
           'Ghi chú (ko bắt buộc)', 'Status', 'Title', 'Meta', 'Link SERP research', 'Outline', 'Docs HTML', 'Link đã chèn',
           'Cảnh báo', 'QC', 'Cập nhật', 'Link CMS', 'ID', 'Ngày xuất bản dự kiến', 'Link air', 'Trạng thái up CMS', 'Note CMS']
KHO = {
    'internal_link_sp': ['Keyword', 'Volume Search', 'URL TGDD', 'URL DMX', 'Loại KW', 'KW chính', 'Trạng thái KD', 'ID NH', 'ID Hãng', 'ID Filter', 'ID SP'],
    'internal_link_thuat_ngu': ['STT', 'Chuyên mục', 'URL', 'Title'],
    'sitemap_hoi_dap': ['STT', 'Tiêu đề (Title)', 'URL', 'Danh mục', 'Ngày đăng', 'ID bài'],
    'Hãng': ['Hàm ghép', 'Ngành hàng', 'Mã Ngành Hàng', 'Tên Hãng', 'Mã Hãng', 'Giá trị thuộc tính'],
    'ID thuộc tính': ['x', 'Ngành hàng', 'ID ngành hàng', 'Tên thuộc tính', 'ID thuộc tính', 'Giá trị thuộc tính', 'ID giá trị thuộc tính', 'CODE'],
}
CONFIG = [
    ('so_doi_thu', '3', 'Số bài đối thủ đọc nội dung'),
    ('so_sp_lay_thong_so', '8', 'Số sản phẩm tối đa lấy thông số'),
    ('link_ma_giam_gia', '', 'Link mã giảm giá (bỏ trống nếu không dùng)'),
    ('link_bao_hanh', 'https://www.thegioididong.com/chinh-sach-bao-hanh-san-pham', 'Link chính sách bảo hành đặt trong mục Mua'),
    ('nguon_uy_tin', 'gsmarena.com, notebookcheck.net, nanoreview.net, browser.geekbench.com', 'Domain nguồn công nghệ uy tín, cách nhau dấu phẩy'),
    ('ty_le_kw', 'kw_chinh: 1% | kw_phu: 3-5', 'Tỷ lệ rải keyword'),
]


def main():
    ten = sys.argv[1] if len(sys.argv) > 1 else 'Hỏi Đáp n8n (mẫu)'
    tabs = ['skill_hoi_dap', 'Prompt'] + list(KHO)
    d = gws(['sheets', 'spreadsheets', 'create'], {'properties': {'title': ten}, 'sheets': [{'properties': {'title': t}} for t in tabs]})
    sid = d['spreadsheetId']
    prompt = [['key', 'value', 'ghi chú']] + [list(c) for c in CONFIG]
    for f in sorted(glob.glob(os.path.join(SNAP, '*.md'))):
        prompt.append([os.path.splitext(os.path.basename(f))[0], open(f, encoding='utf-8').read()[:49000], 'Nạp từ prompt-snapshot, sửa trực tiếp trên sheet'])
    data = [{'range': 'skill_hoi_dap!A1', 'values': [HDR_RUN]}, {'range': 'Prompt!A1', 'values': prompt}]
    data += [{'range': '%s!A1' % t, 'values': [h]} for t, h in KHO.items()]
    gws(['sheets', 'spreadsheets', 'values', 'batchUpdate', '--params', json.dumps({'spreadsheetId': sid})],
        {'valueInputOption': 'RAW', 'data': data})
    # cố định dòng header cho các tab
    sheets = {s['properties']['title']: s['properties']['sheetId'] for s in d['sheets']}
    gws(['sheets', 'spreadsheets', 'batchUpdate', '--params', json.dumps({'spreadsheetId': sid})],
        {'requests': [{'updateSheetProperties': {'properties': {'sheetId': i, 'gridProperties': {'frozenRowCount': 1}}, 'fields': 'gridProperties.frozenRowCount'}} for i in sheets.values()]})
    print('Đã tạo: https://docs.google.com/spreadsheets/d/%s/edit' % sid)
    print('export HOI_DAP_SHEET_ID=%s' % sid)


if __name__ == '__main__':
    main()
