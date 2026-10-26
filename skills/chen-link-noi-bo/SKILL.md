---
name: chen-link-noi-bo
description: "Rule + quy trình chèn internal link cho bài content tĩnh TGDĐ/ĐMX/TopZone theo từng dạng bài (bài sản phẩm chuẩn, bài phiên bản dung lượng, bài dòng filter/series, bài hãng, bài ngành hàng, bài phụ kiện ốp lưng/dây đồng hồ/miếng dán). Theo guideline team SEO: 5 loại KW, mỗi loại 1 kw/bài, cấm link tìm kiếm/tag/ldp. Nêu link tối thiểu bắt buộc của từng dạng, nguồn tra URL (All KW, KW_SP, sheet TopZone), cách chọn anchor kw chính, luật mỗi URL/mỗi kw 1 lần, link ngoài Wikipedia/Apple VN, link domain gốc ở CTA. Trigger: chèn link, chèn link cate khác, thiếu link, check link nội bộ, rà link bài sp, link dòng filter, all kw, internal link bài sản phẩm."
user-invocable: true
when_to_use: "Khi user yêu cầu chèn/rà/check internal link cho bài content tĩnh (bài sản phẩm, bài dòng filter/series, bài hãng, bài ngành hàng) trên TGDĐ, ĐMX hoặc TopZone, hoặc gửi link sheet All KW kèm bài. Không dùng cho WF đi link bài Hỏi đáp/Game App/Kinh nghiệm hay (dùng onpage-internal-link)."
metadata:
  version: "1.1.0"
  chot: "09/10/2026"
---

# Chèn link nội bộ theo dạng bài

## 1. Nguồn tra URL và keyword

| Trường hợp | Nguồn | Cách đọc |
|---|---|---|
| Hàng đang bán TGDĐ/ĐMX (đa số trường hợp) | Sheet All KW (`$SHEET_ALL_KW_ID`), tab `All KW` | Cột: L Keyword, M Volume, N KW chính (TRUE/FALSE), O URL TGDD, P URL DMX, R Trạng thái KD. Dùng `scripts/scan_links.py --refresh` để tải về cache |
| Sản phẩm mới đợt 9/2026 chưa có trong All KW (iPhone 18 Pro/Pro Max/Duo, Apple Watch S12/Ultra 4) | Sheet KW_SP (`$SHEET_KW_SP_ID`), tab `KW_SP` | Cột Loại URL (Sản phẩm chuẩn/phiên bản/Dòng Filter), URL TGDĐ/ĐMX/TopZone, Loại KW (Chính/Phụ) |
| TopZone | Sheet All KW TopZone (`$SHEET_ALL_KW_TOPZONE_ID`), tab `All KW` | Lệch 1 cột so với file TGDĐ (không có "Nhóm NH"): A Loại KW, K Keyword, L Volume, M KW chính, N URL TopZone, P Trạng thái KD ("Đang kinh doanh"...). Quét bằng `scan_links.py --site topzone` |
| SIM, thẻ cào, thẻ game, eSIM du lịch, nạp tiền, gói data, đóng tiền điện/nước/internet/trả góp/bảo hiểm, mua bảo hiểm xe, đặt vé máy bay, thanh toán viện phí/vé tàu xe (hãng Viettel, VinaPhone, MobiFone, Vietnamobile, iTel, Local, VNSKY, Wintel, Airalo, Bluecom, VNPT, FPT...). LUÔN rà thêm file này khi chèn link, kể cả bài điện thoại có nhắc sim/eSIM/nạp tiền | Sheet "ALL Keyword SIM, Ngành hàng tiện ích 2026" (`$SHEET_KW_TIEN_ICH_ID`, chỉ cần khi chèn link SIM/thẻ cào/tiện ích), tab `Tổng hợp` (= tab `All kw`, gid 99090313) | A Loại KW (Ngành hàng/Hãng/Sản phẩm), B Site, D Tên NH, F Tên hãng, H Giá trị filter, J Tên SP, K Keyword, L Volume, M KW chính (TRUE/FALSE), N URL TGDĐ, O URL ĐMX (đa số "Không kinh doanh" → bài ĐMX không link), Q Trạng thái KD. Hàng ngưng KD (nhiều gói SIM cũ) thì không link. gws lỗi token thì đọc qua Drive connector `read_file_content` |
| Tiêu chí chọn kw | Tab `Rule_Từ_Khóa` của file All KW | 100% kw trong file là kw chính đúng intent mua hàng |

Account gws: account đang đăng nhập phải có quyền đọc các sheet trên (kiểm bằng `gws auth status`).

### 1.1. 5 loại keyword theo guideline team SEO (đánh số dùng cho mục 2)

| Số | Loại KW (guideline SEO) | Ví dụ URL | Cột Loại KW trong sheet All KW |
|---|---|---|---|
| 1 | NH (ngành hàng) | `điện thoại` → /dtdd | NH |
| 2 | NH + Hãng | `iPhone` → /dtdd-apple-iphone, `adapter Apple` → /adapter-sac-apple | Hãng |
| 3 | NH + Filter | `điện thoại gập` → /dtdd-gap, `sạc nhanh` → /adapter-sac-sac-nhanh | NH Filter |
| 4 | NH + Hãng + Filter | `iPhone 17` → /dtdd-apple-iphone-17-series | Dòng Filter |
| 5 | Sản phẩm | `iPhone 17 Pro Max` → /dtdd/iphone-17-pro-max | Sản Phẩm |

- Loại **Filter** gồm **tất cả filter**: tính năng, giá, độ tuổi, khối lượng, dung lượng... (vd "sữa bột cho bé dưới 6 tháng tuổi", "điện thoại dưới 5 triệu").
- Cột map sang sheet là suy theo cấu trúc URL. Gặp kw khó xếp loại thì xem URL: có hãng + filter = số 4, chỉ filter = số 3.

Cột Tên Filter của dòng Sản Phẩm đang trống, nên muốn biết SKU thuộc dòng filter nào thì suy từ tên sản phẩm (iPhone 18 Pro Max 256GB → iPhone 18 Series).

## 2. Link tối thiểu theo dạng bài

### 2.0. Bảng tối thiểu chính thức (guideline team SEO)

> Đây chỉ là **mức tối thiểu**. Ngoài ra, mọi kw NH, hãng, filter, sản phẩm có sẵn trong bài mà chưa có link thì **đưa vào danh sách đề xuất chèn** (đúng ngữ cảnh, theo luật mục 3). **Luôn gửi danh sách cho user duyệt trước khi chèn**, kể cả link tối thiểu (chốt 09/10/2026).

| Dạng bài | Tối thiểu loại KW | Áp dụng |
|---|---|---|
| Bài ngành hàng | 1 | Team Tin |
| Bài hãng | 1, 2 | Team Tin |
| Bài filter SP | 1, 3 | Team Tin |
| Bài hãng + filter SP | 1, 2, 3, 4 (user chốt 09/10/2026: có kw thì chèn, bài không có thì bỏ, không bịa câu để nhét kw) | Team Tin |
| Bài sản phẩm | 1, 2, (3 hoặc 4), 5 | Team Tin và Team SP |

Ví dụ team SP (ĐMX, chắn bùn AvaCycle): NH `chắn bùn xe đạp`, Hãng `chắn bùn AvaCycle`, SP là tên đầy đủ sản phẩm.

### 2.1. Bài sản phẩm chuẩn (1 SKU chuẩn, vd iPhone 18 Pro Max 256GB, iPhone Duo 256GB)
Bắt buộc:
1. **Loại 1, 2, (3 hoặc 4), 5**: Ngành hàng (`điện thoại` → /dtdd) + Hãng (`iPhone` → /dtdd-apple-iphone) + Dòng Filter chứa SP (số 4: `iPhone 18` → /dtdd-apple-iphone-18-series, `iPhone gập` → /dtdd-apple-iphone-duo) hoặc NH Filter (số 3) + ít nhất 1 kw Sản phẩm (số 5, thường là phiên bản dung lượng khác hoặc SP so sánh).
2. **Các phiên bản dung lượng khác** của cùng dòng (thường ở bảng giá): anchor phủ đủ "Tên + dung lượng" (`iPhone 18 Pro Max 512GB`), không để dung lượng rời ngoài thẻ `<a>`.
3. **Link tham khảo ngoài** (chỉ bài TGDĐ + SKU chuẩn, yêu cầu bên Apple): ≥1 link `vi.wikipedia.org` + ≥1 link `apple.com/vn`, chèn ở kw bất kỳ (vd "phiên bản", "Apple Việt Nam"). Bài ĐMX/TopZone và bài phiên bản không cần.
4. **CTA kênh mua**: dòng "Cửa hàng trực tuyến: thegioididong.com/dienmayxanh.com/topzone.vn" link về **trang chủ** site, không về trang SP.

Nên có thêm (link cate khác, lấy từ All KW, kw chính có sẵn trong bài):
- SP/dòng đời cũ được nhắc để so sánh (iPhone 17 Pro Max, iPhone 16 Pro Max, iPhone 17 series...).
- Dòng/SP cùng đợt (iPhone 18 Pro, iPhone Duo...).
- Phụ kiện và thiết bị liên quan nhắc trong bài: ốp lưng (ưu tiên trang ốp riêng cho model nếu có, vd /op-lung-flipcover-cho-iphone-duo), cáp sạc, adapter, sạc dự phòng, sạc không dây, sạc nhanh, tai nghe, AirPods, Apple Watch, iPad, MacBook, AirTag, Apple Pencil, gimbal, ổ cứng...
- NH Filter hợp ngữ cảnh: điện thoại gập (/dtdd-gap), điện thoại Android (/dtdd-android)...

### 2.2. Bài phiên bản dung lượng (512GB/1TB/2TB)
- Bắt buộc 3 tầng NH + Hãng + Dòng Filter như 2.1.
- Link về **SP chuẩn** (bản 256GB = URL gốc, vd /dtdd/iphone-18-pro-max) và các phiên bản còn lại.
- Không cần Wikipedia/Apple VN.

### 2.3. Bài hãng + filter / dòng series (vd bài iPhone 18 Pro series → /dtdd-apple-iphone-18-series)
- Tối thiểu theo 2.0: loại 1 (`điện thoại` → /dtdd) + loại 2 (`iPhone` → /dtdd-apple-iphone) + loại 3 (NH filter, vd `điện thoại gập`) + loại 4 (dòng filter). Loại nào bài không có kw thì bỏ qua, không tự viết thêm câu.
- Nên thêm: SKU chuẩn đang bán của dòng (iPhone 18 Pro, iPhone 18 Pro Max), phiên bản dung lượng trong bảng giá, dòng khác được nhắc để so sánh. Nhớ luật 1 kw mỗi loại ở mục 3.
- Self-link về chính trang dòng filter là bình thường, không tính lỗi.

### 2.4. Bài hãng (vd /dtdd-apple-iphone)
- Tối thiểu loại 1, 2.

### 2.5. Bài filter SP (vd /dtdd-gap, điện thoại dưới 5 triệu)
- Tối thiểu loại 1, 3.

### 2.5b. Bài ngành hàng (vd /dtdd, /adapter-sac)
- Tối thiểu loại 1.

### 2.5c. Bài SP phụ kiện (ốp lưng, dây đồng hồ, miếng dán màn hình), team SP
- Link đặt trong mục **"Đặc điểm nổi bật"**, **tối thiểu 3, tối đa 4 link**.
- Bắt buộc có:
  1. kw NH: `Ốp lưng điện thoại`, `Ốp lưng tablet`...
  2. kw dòng filter của phụ kiện: `Ốp lưng iPhone 14 Series`, `Ốp lưng Samsung Tab S7`...
  3. 1 link Sản phẩm/Hãng/Dòng filter liên quan đến máy mà phụ kiện dành cho:
     - tên phụ kiện chứa kw sản phẩm (Galaxy S23, iPhone 14 Pro Max) → link về sản phẩm
     - chứa kw hãng (Samsung Galaxy Watch, Apple Watch) → link về hãng
     - chứa kw dòng filter (iPad 10, Galaxy Tab S) → link về dòng filter
- Lưu ý: sản phẩm có chứa kw hãng thì vẫn link thêm về hãng đó.

### 2.6. TopZone
- Chỉ 2 tầng: NH = `iPhone` → topzone.vn/iphone (gộp vai trò hãng), dòng series nằm ở loại NH Filter (topzone.vn/iphone-18). Không có Dòng Filter.
- Mọi link phải về domain topzone.vn. Không tô màu chữ/bảng.

> Nguồn mục 2.0 đến 2.5c: slide "Team SEO chia sẻ guideline chèn link với team Tin" (Drive nội bộ team SEO) và nội dung user gửi 09/10/2026.

## 3. Luật chọn anchor và vị trí (bắt buộc)

0. **Mỗi loại KW (số 1 đến 5) chỉ lấy 1 kw trong 1 bài.** Ưu tiên volume cao → thấp, volume bằng nhau thì lấy kw bất kỳ. Thứ tự liệt kê trong guideline (vd `laptop | máy tính xách tay | máy tính`) cũng là thứ tự ưu tiên trái sang phải. Ví dụ bài có cả "sữa bột cho bé" (700) và "sữa bột" (5600) thì link "sữa bột".
   - Cách hiểu đã chốt với user (09/10/2026, "cách B"): luật dùng để chọn 1 trong nhiều kw cùng chỉ 1 thứ (từ đồng nghĩa, kw dài/ngắn của cùng NH/hãng/filter, vd "điện thoại" vs "di động", "sữa bột cho bé" vs "sữa bột"). Các NH/hãng/SP khác nhau (sạc dự phòng, AirPods, iPad, iPhone 17 Pro Max, iPhone 16 Pro Max...) vẫn link riêng từng cái, không giới hạn 1 link mỗi loại cho cả bài.
0b. **Loại nào trỏ đúng loại đó**: `Laptop Dell` → /laptop-dell (không /laptop), `Sữa bột Aptamil` → /sua-bot-cho-be-aptamil (không /sua-bot-cho-be).
0c. **Cấm link về**: trang tìm kiếm `/tim-kiem?key=`, trang tag `/kinh-nghiem-hay/tag...`, trang landing `-ldp` (vd /laptop-ldp), trang id sản phẩm `/sp-<id>`.
0d. **Kw volume 0 và không tích TRUE** → không link kw đó mà link về kw liên quan đúng loại. Vd NH "sữa bột cho bé" + filter "dưới 6 tháng tuổi" → link kw NH+Filter "sữa bột cho bé dưới 6 tháng tuổi".
1. **Chỉ anchor kw chính** (KW chính = TRUE / Loại KW = Chính). Nhiều kw chính cùng trỏ 1 URL thì chọn kw volume cao nhất có trong bài.
2. **Mỗi URL chỉ 1 lần, mỗi anchor/kw chỉ 1 lần trong bài** (không 2 kw trỏ 1 link, không 2 link trên 1 kw, áp dụng cả hệ bài tin và hệ bài SP), tính cả link ngoài (Wikipedia/apple.com). Ngoại lệ được lặp: **link trang chủ** site (thegioididong.com, dienmayxanh.com, topzone.vn) và **hotline `tel:`**. Trùng anchor giữa link nội bộ và link ngoài thì dời link ngoài sang chữ khác (vd Wikipedia → "phiên bản", apple.com → "Apple Việt Nam").
3. **Chỉ chèn vào chữ đã có sẵn trong bài**, không sửa chữ của user. Không có chỗ phù hợp thì báo user, không tự viết câu mới để nhét kw (rải kw mới phải hỏi user trước).
4. **Đúng site**: bài TGDĐ chỉ link thegioididong.com, ĐMX → dienmayxanh.com, TopZone → topzone.vn.
5. **Ưu tiên trang lọc Apple** khi ngữ cảnh là đồ Apple: adapter Apple → /adapter-sac-apple, cáp đi kèm iPhone → /cap-dien-thoai-apple, phụ kiện Apple → /phu-kien/apple. Ngữ cảnh chung (ưu đãi phụ kiện mọi hãng, adapter 45W) thì dùng trang ngành hàng chung.
6. **Không link SP ngưng kinh doanh** (TGDĐ: Trạng thái KD = NKD, TopZone: khác "Đang kinh doanh"). "Hết hàng tạm thời" vẫn link được.
7. **Bỏ kw trùng chữ nhưng khác nghĩa**: camera (tính năng máy ≠ camera giám sát), pin, màn hình, usb/USB-C, ống kính tele, kính cường lực của máy, bàn phím ảo, đồng hồ StandBy, thẻ nhớ trong câu "không hỗ trợ thẻ nhớ".
8b. **Chèn hợp ngữ cảnh**: kw phải đúng nghĩa trang đích trong câu đó (xem thêm mục 7). Lượng link không được làm câu văn rối.
8c. **Không cắt kw, cụm từ để chèn link**: anchor phải là cụm trọn nghĩa, không link nửa cụm (vd câu "adapter sạc nhanh 20W" không link riêng "sạc nhanh" nếu làm vỡ cụm "adapter sạc nhanh", không link "iPhone 17" nằm trong "iPhone 17 Pro Max").
8d. **Tối đa 4 link liên tục trong 1 câu/1 đoạn**. Đoạn đã có 4 link thì dời kw còn lại sang đoạn khác hoặc bỏ.
8e. **Số điện thoại hotline luôn có link `tel:`**, cửa sổ mới chọn **None** (không có `target`, không `rel`): `<a href="tel:1900232460">1900 232 460</a>`. Hotline xuất hiện nhiều lần thì chèn tất cả.
8. **Không chèn** trong heading, trong thẻ `<a>` khác, trong chú thích ảnh. Ưu tiên đoạn văn và list. Trong bảng chỉ chèn tên SP/phiên bản (bảng giá, bảng so sánh) khi ngoài văn bản không còn chỗ.
9. **Không gỡ link ngoài user cố ý đặt** (Wikipedia, apple.com), chỉ dời anchor khi trùng.

## 4. Quy trình

1. Backup bài vào scratchpad (`backup-<ten-bai>-<ddmm>.html`).
2. Xác định dạng bài (2.1 đến 2.6) và site.
3. Chạy quét:
   ```bash
   python3 <skills>/chen-link-noi-bo/scripts/scan_links.py <file-bai> --site tgdd|dmx|topzone [--refresh]
   ```
   Script in ra: link đang có, URL/anchor bị trùng, và toàn bộ kw chính có trong bài nhưng chưa link (kèm loại KW, volume, trạng thái KD). `--refresh` tải lại All KW qua gws, nếu không thì dùng cache (nhắc user nếu cache cũ hơn 7 ngày).
4. Đối chiếu checklist bắt buộc của dạng bài ở mục 2. Tầng nào thiếu ghi theo format: `Thiếu link <tầng> => chèn anchor "<kw>" >> <URL>`.
5. Lọc ứng viên theo mục 3, xem ngữ cảnh từng chỗ. `curl -s -o /dev/null -w '%{http_code}'` từng URL để chắc 200. URL trong sheet bị **404** thì không chèn và báo user để **thông tin team SEO** check lại (team SEO dùng extension Check My Links).
5b. **Gửi danh sách đề xuất cho user duyệt, dừng chờ trả lời** (chỉ khi rà/chèn link vào bài CÓ SẴN; khi đang VIẾT bài mới thì tự chèn, không hỏi, user chốt 25/10/2026). Bảng: kw | loại KW | URL | vị trí (câu/đoạn) | ghi chú. Kèm danh sách kw bỏ qua và lý do. Chỉ chèn những dòng user duyệt.
6. Chèn link theo đúng style link đang có trong bài: `<a href="URL" title="anchor" target="_blank" rel="noopener">anchor</a>`. File entity-encoded thì match cả dạng entity (`&agrave;`...) và `&nbsp;`.
7. Verify:
   - chạy lại `scan_links.py`, phần DUP phải rỗng (trừ tel: và trang chủ)
   - không đoạn nào quá 4 link, mọi hotline đều có `tel:` không target
   - tag `<a>` mở/đóng khớp
   - text bài (strip tag, unescape) giống hệt bản backup
8. Báo cáo tiếng Việt:
   - bảng kw → link → vị trí đã chèn
   - kw cố ý bỏ qua kèm lý do (NKD, khác nghĩa, chỉ nằm trong bảng/caption, đã có link)
   - chỗ cần user quyết
   - đường dẫn backup và Sources

## 5. Lỗi đã gặp (đừng lặp lại)
- Chỉ tra vài kw đoán trước rồi báo "không có": phải quét toàn bộ kw chính trong sheet.
- Lọc kw theo "Tên hãng = Apple" làm sót các dòng phụ kiện ngành hàng chung (cột hãng trống).
- Regex tìm "iPhone 17 Pro" khớp nhầm vào "iPhone 17 Pro Max": dùng negative lookahead.
- Kiểm tra trùng URL bằng substring làm `/dtdd-apple-iphone` khớp nhầm `/dtdd-apple-iphone-18-series`: so sánh nguyên href.
- Link "thegioididong.com" ở CTA trỏ về trang SP gây trùng URL SP: phải về trang chủ.
- Anchor link nội bộ trùng anchor link Wikipedia ("iPhone gập"): dời link ngoài.
