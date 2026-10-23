# Bẫy đã đo thật và việc chưa đo

Mọi số liệu dưới đây đo bằng ghi/đọc thật trên hệ thống, ngày ghi kèm; mọi bản ghi test đã khôi phục khớp từng byte.

## Ghi

| Bẫy | Đo được | Skill xử lý |
| --- | --- | --- |
| Khoá phiên bản | Cả 5 kiểu ghi (Danh mục, Hãng, giá trị Filter, model PIM, lá biến thể) gửi rowVersion cũ → `errorReason:"row_version"`, "Phiên bản dữ liệu đã thay đổi [n]", `errorCode:"mvvn4m"`. Đổi nội dung thì +1; lưu không đổi gì thì không tăng | exit 3, không ép |
| MDM ghi đè cả bản ghi | Hãng SingPC: gửi bản thiếu key `seo_keyword` → key **biến mất** | `assertNoDroppedKeys`, payload dựng từ getinfor vừa đọc |
| PIM gộp theo key | `model/update` bỏ key → key cũ **vẫn còn**; `[]`, `null`, `data:null` đều không xoá được key; "xoá" = ghi `""` | chỉ cho ghi title/description, không ghi rỗng; restore dừng nếu có key mới |
| Lưu y nguyên byte | Không trim, không đổi entity (`&amp;` giữ nguyên, khác CMS). Comment HTML, nháy, ký tự có dấu giữ nguyên. UI MDM tự `trim()` khi bấm Lưu, API thì không | so readback tuyệt đối |
| Biến thể SP | Ghi 1 lá Màu **không lan** sang lá khác; người ta đang sửa tay từng lá (cách 19s) hoặc tool ghi cả 4 lá trong 120 ms | `product-write` ghi mọi lá có url của trang, backup tất cả trước |
| Ghi SP bằng CLI | 06/10: MacBook Neo 256GB 4 lá (~1s/lá) và Dell 15 (model, 0,7s) — rv +1, đọc lại khớp mọi key, khôi phục `RESTORED` rồi `ALREADY` | — |

## Lên web

| Bẫy | Đo được |
| --- | --- |
| Độ trễ MDM → core mới | Filter: node đầu ra bản mới sau ~4 phút, đủ 4/4 mẫu sau ~15 phút, lan dần từng node (cùng lúc node mới, node cũ) |
| `?clearcache=1` | 12 lượt liên tiếp không đổi gì trên core mới → vô tác dụng với dữ liệu MDM |
| Core cũ | Không hiện thay đổi MDM (title core cũ lấy từ CMS) |
| Ép cookie core mới | Từ 06/10 cookie là `webmoi_v3=2` (`webmoi_v2` cũ cho core NGƯỢC; có phiên báo 07/10 server không còn đọc cookie). Vẫn có lúc rơi node core cũ → chỉ tính mẫu có `x-app-server` webfe và không có `x-version: Mwg-*` |
| Marker vô hình | Comment HTML và ký tự zero-width trong infobox **không bao giờ hiện**: core mới parse lại infobox (chèn mục lục). Muốn đánh dấu để đo: dùng chữ thường/2 dấu cách trong title |
| SP: PIM → web | Title SP sửa trên PIM (cả 4 lá 512GB, 09:42 06/10): 55 phút cả 2 core vẫn bản cũ; **13:59 core mới đã hiện bản mới**, core cũ vẫn bản cũ (CMS chưa sửa). → core mới đọc PIM, trễ >55 phút ≤ ~4 giờ; core cũ đọc CMS |

## Trang lọc `?g=` / `?p=` (đo 06/10/2026)

| Điều | Đo được |
| --- | --- |
| `?p=` (lọc giá) | MDM không có field SEO: `tgdd_filter_price` chỉ có `code, name, category_code, display_order, is_price_slide_filter`; bảng con `tgdd_filter_price_lvl` chỉ có `name, min_price, max_price, display_order`. `tgdd_filter_other/_brand` cũng không có. Title core mới là mẫu cố định `{NH} [{Hãng}] Giá {khoảng} chính hãng, giá rẻ, đa dạng và chất lượng mẫu mã - MM/YYYY` (5/5 URL, 4 ngành hàng). Skill chặn `?p=` (exit 2) |
| `?g=slug` | Title/mô tả/infobox = giá trị `tgdd_filter_atb` có `url` rỗng (5/5 URL Laptop khớp). Slug nằm trong catalog nhúng trong HTML trang ngành hàng (`url:"g=laptop-gaming"`, nhóm `code` = mã dòng Filter, `filterId` = `attribute_value`) |
| Khoá nối | `(mã dòng Filter, attribute_value)`: `attribute_value` lặp ở nhiều dòng (màn hình: mã 1 có ở nhiều dòng) |
| Infobox `?g=` mất trên web | 07/10: quét 64 giá trị Filter có infobox (4 ngành hàng, 2 lượt/trang): 61 hiện đủ, **chỉ 2 mất hoàn toàn (0/3 mảnh): `laptop?g=laptop-gaming` (65.950 ký tự) và `laptop?g=mong-nhe-thoi-trang` (50.743)** — đúng 2 trang audit 03/10 ghi INFOBOX_MAT. Bài vẫn có trong payload script của HTML nhưng không có trong thân trang. **Không phải do markup**: 34 giá trị có `<span style="font-weight:400">`, `aria-level`, `cellspacing` (dấu vết dán Google Docs) vẫn hiện đủ, cả infobox 222 span; kích thước không liên quan (`laptop-neo` 102 KB hiện). Nguyên nhân chưa rõ → cần dev/IT; `lookup --check-web` báo `article: LECH` cho 2 trang này |
| Lookup cũ | Bỏ query: `/laptop?g=laptop-gaming` trả bản ghi **Danh mục Laptop** (ghi theo đó là đè title cả ngành). Nay `?g=` tra đúng, `?p=`/query lạ dừng exit 2 |
| Giới hạn | Slug chỉ có khi catalog web liệt kê (giá trị không có trong catalog → exit 5). Hãng + `?g=` (vd `/may-tinh-de-ban-apple?g=apple-m4`) trả `brand-filter` nhưng **chưa đo** xem web lấy `title_brand_filter` hay `title` |

## Tra cứu

- Mã PIM ≠ ID CMS; ô tìm PIM không khớp ID CMS hay slug (thử searchType 1–5) → lấy `modelCode` từ HTML core mới.
- Chỉ 17/143 danh mục có `seo_title` trong MDM; trang thiếu thì web ra title mẫu tự sinh
  (vd `may-tinh-de-ban-hp`: "Máy tính để bàn Hp chính hãng, giá rẻ - 10/2026").
- Tab ẩn danh: mất khi Chrome khởi động lại → exit 4, nhờ người dùng đăng nhập lại. Từ 09/10 dùng được tab thường
  của profile đã đăng nhập (phiên giữ qua khởi động lại; token nằm trong IndexedDB của profile, tức trên đĩa).
- `list_pages` của chrome-devtools-mcp đôi khi treo 60s → CLI thử lại trên cùng kết nối (90s), vẫn treo mới
  khởi động lại MCP, đúng 1 lần. (Trước 06/10 khởi động lại ngay → mở kết nối mới → hộp Chrome chồng lên hộp cũ.)

## Hộp "Allow remote debugging?" của Chrome (đo 06/10/2026)

| Điều | Đo được |
| --- | --- |
| Cơ chế kết nối | `--autoConnect` đọc `DevToolsActivePort` của Chrome thật rồi mở WebSocket; Chrome 154 nghe `127.0.0.1:9222` (chỉ loopback, `/json/version` trả 404 — chỉ WS có duyệt). Bật bằng `chrome://inspect/#remote-debugging` (`Local State`: `devtools.remote_debugging.user-enabled`) |
| Mỗi lần chạy CLI | spawn 1 `chrome-devtools-mcp` mới = 1 kết nối mới. Lô 35 bản ghi chạy từng lệnh = 35 kết nối (người dùng báo: bấm cả chục lần) |
| Không chỉ CLI skill | Máy có 13 tiến trình `chrome-devtools-mcp` cùng lúc (phiên Claude, Codex, Antigravity); mỗi phiên là một kết nối độc lập. Skill không kiểm soát được các phiên kia |
| Tần suất hộp thoại | 10 kết nối chỉ-đọc (`list_pages`) trong ~13 phút: 8 lần ~3–5s (không có người chờ), 2 lần chậm 42s (sau nghỉ ~2 phút) và 21s (sau nghỉ 8 phút) — khớp với chờ bấm Allow nhưng không xác nhận được vì không nhìn thấy màn hình người dùng; nghỉ 4 phút lại nhanh (4,6s). Hộp **không** hiện ở mọi kết nối; điều kiện hiện chưa xác định |
| Chưa đo | Hộp có hiện ở bước `select_page`/`evaluate_script` lên tab ẩn danh (khác `list_pages`)? Cần tab MDM ẩn danh đang mở để đo; lúc đo cửa sổ ẩn danh đã đóng (exit 4) |
| Không dùng được | `--browserUrl`/cổng debug cố định: README chrome-devtools-mcp nói Chrome bắt buộc profile riêng khi mở cổng bằng cờ `--remote-debugging-port` → mất phiên đăng nhập MDM ẩn danh của người dùng. `--wsEndpoint` tới cổng hiện có vẫn qua đúng bước duyệt |
| `batch` chạy thật (06/10, tab MDM ẩn danh đã mở) | 5 lookup chỉ-đọc trong 1 phiên: 13s tổng, 5/5 OK; lookup đầu 1,9s và 6,7s (nạp cây danh mục/hãng/filter), 3 lookup sau ~0,2s nhờ cache |
| Token MDM | Chuỗi đục (không phải JWT), chỉ có `access_token`/`token_type`/`expires_in`/`scope`, **không có refresh token**. 06/10 tab ẩn danh đọc ra `expires_in` 62.685s; **23/10 tab thường đọc ra 2.591.999s = 30 ngày** — dùng số 30 ngày. Phiên đăng nhập 09/10 vẫn ghi được ngày 23/10, tức token sống ít nhất 14 ngày (IndexedDB không lưu giờ cấp). JWT Keycloak `kc_tokens` trong localStorage chỉ sống 9 giờ — không phải token API dùng |
| API gọi thẳng từ Node | Host API (cả MDM lẫn PIM) trả 401 + `WWW-Authenticate` sau ~0,2s khi không kèm token → mạng không chặn, không vướng CORS. Hướng gọi thẳng khả thi — đã làm thành đường `direct` |
| Direct vs tab chạy thật (06/10) | `batch` 5 lookup chỉ-đọc: kết quả giống hệt từng byte ở cả 2 đường; thời gian ngang nhau (17,8s vs 14,8s, nghẽn ở server, không ở đường truyền). Phá token trong RAM → 401 → tự rơi về tab đúng 1 lần, lookup vẫn ra bản ghi |
| Cache token Keychain (23/10) | `security` ghi ~34ms, đọc ~20ms, không bật hộp hỏi. `lookup` dùng cache: 3/3 lần `direct` + `token: cache`, 12–17s (thời gian server). Cất token hỏng → 401 → làm mới từ tab → OK. Một lần op chạy lại sau làm mới dính "HTTP 200 không phải JSON" (lỗi chập chờn phía server, cả đường tab cũng gặp) — code giữ token mới, không xoá cache |
| Cách giảm | Cache token Keychain (lệnh không nối Chrome) + `batch` (1 kết nối cho cả lô khi cần tab) |

## Bài viết SP trên PIM (đo 09/10/2026)

| Điều | Đo được |
| --- | --- |
| Field | Giao diện PIM model, tab Thuộc Tính: `product_articles` (HTML), `key_features` (HTML), locale `all` (title/description là `vi_VN`) |
| Ghi bài bằng `product-ops` (model 193929) | 1 op `after_p`: `model/update` 0,3s, rowVersion 32→33, đọc lại khớp mọi key; chạy lại → `ALREADY` không ghi; `product-restore` → `RESTORED` rv 34, sha256 bài = bản gốc; chạy restore lần 2 → `ALREADY`. Trang web không hiện đoạn test (core mới trễ) |
| Web core mới vs PIM | Trước khi ghi: 27/27 câu bài PIM của 193929 có trên core mới (3 lượt, đều `webfe`). Chưa phân biệt được web lấy từ PIM hay CMS (2 bên đang giống nhau) |
| Tab thường | Từ 09/10 MDM/PIM đăng nhập được ở tab thường profile đã đăng nhập; CLI bám tab thường, đường `direct` chạy được (lệnh đầu tiên trong ngày từng rơi về tab vì "HTTP 200 không phải JSON", chưa rõ nguyên nhân; các lệnh sau đều `direct`) |

## Upload ảnh

0,8s; CDN 200 ngay; byte giữ nguyên (không nén lại); tên gốc + hậu tố `HHmmss`; không chặn trùng
tên; không có API xoá. Ô bài viết SP trên PIM không nhận `.webp` (MDM nhận).

## Chưa đo — lần đầu làm phải có người đứng xem

1. Ghi `seo_article` / `brand_cate_article` / `filter_inforbox` **dài có ảnh mới** rồi xem web hiển
   thị (mới đo ghi chữ + comment HTML).
2. Độ trễ lên web của **Danh mục** và **Hãng** (mới đo Filter).
3. Bỏ key với `datatobject`/`datarelation` (giả định giống `dataobject`; skill chặn rơi key nên không ảnh hưởng).
4. Giờ hết hạn thật của token MDM (khai báo 30 ngày; mới thấy còn sống sau 14 ngày).
5. Trang Hãng+Filter: field `*_brand_filter` dùng chung cho mọi hãng — chưa có cách khai riêng 1 hãng.
6. Chiều đồng bộ CMS ↔ PIM của SP và lịch chạy (sửa CMS có đè PIM không). Độ trễ chính xác PIM → core mới của SP.
7. Bài viết SP (`product_articles`) trên core mới lấy từ PIM hay CMS, và độ trễ — chưa đo bằng một lần sửa có
   đánh dấu (đã mở ghi 09/10; mới đo ghi + restore trong PIM).
8. Ghi bài viết lên **lá biến thể** (`productvariant/update`) — đường ghi đã đo với title, chưa ghi bài lên lá thật.
