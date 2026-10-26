---
name: cms-faq-tao-bai
description: "Tạo bài Hỏi Đáp MỚI trên CMS TGDĐ (cms.thegioididong.com/v2/Faq/NewsEdit?newsId=0) bằng profile Chrome `CMS_CHROME_PROFILE`: khai báo đủ Tiêu đề, URL, thumb 560x292, chuyên mục con/cha, dạng bài viết, sản phẩm liên quan, nội dung, Tiêu đề SEO, Meta, Keyword-Tags, trạng thái theo cột S Ngày xuất bản dự kiến (có ngày → Xuất bản hẹn 02:00 ngày đó, trống → Chờ duyệt), lấy newsId mới và đọc lại verify. Bài Chờ duyệt chỉ xuất bản khi user bảo. Trigger: up bài hỏi đáp mới lên CMS, tạo bài mới trên CMS, đăng bài hỏi đáp, up bài lên cms chờ duyệt, newsId=0, xuất bản bài hỏi đáp <id>."
user-invocable: true
when_to_use: "Khi user muốn đưa bài Hỏi Đáp đã viết xong (dòng tab skill_hoi_dap, file bai.html hoặc Google Doc) lên CMS thành bài mới, hoặc bảo xuất bản bài đã up. Không dùng để sửa bài đã có newsId (sửa bài cũ làm theo quy trình backup → dry run → ghi → verify trên NewsEdit?newsId=<id>)."
---

# Tạo bài Hỏi Đáp mới trên CMS

Scripts: `<skills>/cms-faq-tao-bai/scripts/` (ký hiệu `$K`; `<skills>` = thư mục cài skill, thường `~/.claude/skills`). Cần biến `CMS_CHROME_PROFILE`, xem `blog-hoi-dap-tron-goi/SETUP.md`. Danh sách chuyên mục và dạng bài lấy từ CMS
nằm ở `references/cms-options.json`. Bài đã tạo được ghi vào `$BLOG_ROOT/_cms-tao-bai/da-tao.json` (`BLOG_ROOT` mặc định `~/blog-hoi-dap`)
(chống tạo trùng), bản đọc lại từ server lưu ở `_cms-tao-bai/<newsId>/`.

## Luật cứng
- **Trạng thái theo cột S** (user chốt 24/10/2026): `publish_date` có ngày → **2 Xuất bản**, ngày đăng = ngày đó, giờ **02:00**; trống → **3 Chờ duyệt**.
- Tab `skill_hoi_dap` có cột A `Site` từ 25/10/2026: các chữ cột S/Q/T/U/V/R nhắc trong file này nay là T/R/U/V/W/S. Skill này chỉ up CMS TGDĐ.
  Bài Chờ duyệt chỉ chạy `xuat_ban.mjs --go` khi user nói rõ "xuất bản" bài/ID đó trong chat; lần duyệt trước không áp dụng cho bài sau.
- **Bài viết nổi bật** (user chốt 26/10/2026): bài TGDĐ luôn tick `cbIsHot` (checkbox "Bài viết nổi bật" ở khối Xuất bản); `tao_bai.mjs` đã tự tick, `cbIsHide` (Ẩn khỏi trang chủ) để trống. Bài đã up trước đó không đổi.- Lưu bằng profile `$CMS_CHROME_PROFILE`, mở tab mới (`--force`), không đụng tab user đang sửa.
- Mỗi bài chỉ POST **1 lần**. Submit lỗi hoặc không rõ kết quả thì không chạy lại: vào CMS (danh sách Hỏi đáp) xem bài đã
  sinh ra chưa, rồi báo user.
- Luôn dry run trước, đưa bảng khai báo cho user duyệt (trừ khi user đã duyệt nội dung khai báo trong cùng yêu cầu), rồi mới `--go`.

## Rule từng trường

| Trường CMS | name | Rule |
|---|---|---|
| Tiêu đề (*) | `txtTitle` | ≤ 70 ký tự. Lấy Title đã chốt (cột H tab `skill_hoi_dap`). |
| URL (*) | `txtUrl` | ≤ 100, chỉ `a-z0-9-`. Mặc định slug từ tiêu đề, ≤ 50 ký tự; khi phải cắt thì cắt ở ranh giới CỤM (sau dấu ? , : - trong tiêu đề) để URL đọc có nghĩa, không cắt giữa cụm (sai: `...uu-nhuoc-diem-gia-va-lua`; đúng: `co-nen-mua-iphone-duo-uu-nhuoc-diem`), không kết thúc bằng từ nối (va, hay, cua, voi...). Để trống `url` trong form.json là script tự sinh; tự đặt url tay cũng theo rule này. URL chỉ khai được lần đầu, sau khi tạo không đổi. |
| Ảnh thumb (560 x 292) | `thumbnailNews` | File jpg 560x292, tên kebab-case không dấu (VD `<slug>-thumb-1.jpg`). Upload lên `cdnv2.tgdd.vn/mwg-static/common/Common/<tên file>`, nên đặt tên không trùng bài khác. |
| Chuyên mục con | `cboChildCategory` | Mặc định **Tư vấn chọn mua** của ngành đang viết (bảng dưới). Đổi khi dạng bài rõ ràng hợp mục khác (VD Hướng dẫn sử dụng → `#Thủ thuật, mẹo - Hướng dẫn sử dụng` của ngành đó). |
| Chuyên mục cha | `cboParentCategory` | CMS chỉ cho chọn cha thuộc chuyên mục con (script kiểm). Cha = ngành đang viết. |
| Dạng bài viết | `cboArticleType` | Map từ cột Dạng bài (bảng dưới). |
| Sản phẩm liên quan | `hdListProductRelated` | ID sản phẩm TGDĐ của URL SP push (cột D), nhiều ID cách dấu phẩy. Không có SP push thì để trống. ID lấy bằng `tgdd.py lay <url>` của skill viet-blog (`info.productId`). |
| Không hiển thị banner VCCorp | `cbIsHideBannerVCCorp` | Không tick. |
| Nội dung | `content_FaqNews` | HTML thân bài (không `<html>/<body>`), đúng bản biên tập mới nhất. Ảnh phải trả 200; ngày "cập nhật ngày" = hôm nay; bullet là `<ul><li>`; không "thiết bị" cho iPhone/sản phẩm TGDĐ; không tin đồn/rò rỉ. |
| Tiêu đề SEO (*) | `txtMetaTitle` | ≤ 70. Mặc định = Tiêu đề. |
| Meta Description (*) | `txtMetaDescription` | ≤ 170 (CMS chặn), nên ≤ 160. Lấy Meta cột I. |
| Keyword - Tags (*) | `hdListKeyword` | 2-5 tag (CMS tối đa 5), chữ thường, **không lặp**. Bắt buộc có **kw chính** và ít nhất 1 tag ngành hàng / hãng / dòng sản phẩm chính, càng sát bài càng tốt (VD `iphone duo`, `iphone`, `apple watch series 12`, `samsung`). Thứ tự: kw chính, kw phụ sát nhất, dòng máy, hãng/ngành. |
| Schema | `txtSchema` | Để trống. |
| Trạng thái | `cboStatus` | 1 Nháp / 2 Xuất bản / 3 Chờ duyệt / 4 Đã duyệt. S có ngày → 2; S trống → 3. |
| Thời gian | `txtDate/txtHour/txtMinute` | S có ngày → ngày S, 02:00 (hẹn giờ). S trống → mặc định CMS; khi user bảo xuất bản, script đặt giờ lúc xuất bản. |
| Bài viết nổi bật / Ẩn khỏi trang chủ | `cbIsHot/cbIsHide` | Không tick. |

### Chuyên mục con → cha theo ngành (mặc định Tư vấn chọn mua)

| Ngành đang viết | Con | Cha |
|---|---|---|
| iPhone, iOS | 2023 #Tư vấn chọn mua | 1637 #iPhone - iOS |
| Điện thoại Android (Samsung, OPPO, Xiaomi...) | 2022 #Tư vấn chọn mua | 1644 #Android |
| Smartwatch (Apple Watch, Galaxy Watch...) | 1977 #Tư vấn chọn mua | 1976 #Smartwatch |
| Đồng hồ thời trang | 1960 #Tư vấn chọn mua | 1958 #Đồng hồ thời trang |
| Phụ kiện (ốp, sạc, tai nghe...) | 2029 #Tư vấn chọn mua | 1739 #Phụ kiện và sản phẩm khác |
| Laptop, MacBook, máy tính bảng | 1854 Tư vấn mua sản phẩm (hoặc 1703 Mac / 2026 Máy tính bảng / 1673 PC - Laptop Windows) | 1656 #Máy tính - Laptop - Tablet |
| Thiết bị thông minh | 2019 Smarthome / 2020 Phụ kiện thông minh / 2021 Smartcar | 2017 #Thiết bị thông minh |
| Điện máy | 1988 Tivi / 1985 Tủ lạnh / 1986 Máy giặt / 1987 Máy lạnh / 1989 Gia dụng | 1984 Điện Máy |

Mục khác (thủ thuật, lỗi thường gặp, Apple ID...) xem đủ trong `references/cms-options.json`. Ngành chưa có trong bảng thì hỏi user.

### Dạng bài (viet-blog) → Dạng bài viết (CMS)

| Dạng bài cột C | `article_type` |
|---|---|
| Cung cấp thông tin, Giới thiệu sản phẩm / dòng sản phẩm / thương hiệu, So sánh sản phẩm / dòng sản phẩm, Tiêu chí chọn mua | Tư vấn chọn mua |
| Định nghĩa thông số | Định nghĩa về thông số kỹ thuật - công nghệ |
| Hướng dẫn sử dụng | Hướng dẫn sử dụng - mẹo - thủ thuật |
| Top sản phẩm | Top sản phẩm |
| Top bán chạy | Top bán chạy |
| Tin khuyến mãi | Tin khuyến mãi |
| Tin sự kiện | Bài tin sự kiện ra mắt sản phẩm - công nghệ |

## Quy trình

1. **Gom input.** Từ dòng `skill_hoi_dap`: `python3 <skills>/viet-blog/scripts/du_lieu.py dong <n>` (keyword, kw phụ,
   dạng bài, URL push) và đọc cột H Title, I Meta, Docs HTML. Nội dung lấy bản mới nhất: Doc (user có thể đã sửa) rồi mới
   tới `bai.html` trong thư mục bài. Doc chứa mã HTML thì lấy text giữ nguyên; Doc dạng văn bản định dạng thì dựng HTML,
   bullet trong Doc phải thành `<ul><li>`. Lưu thành `noi-dung.html` trong `$BLOG_ROOT/_cms-tao-bai/<slug>/`.
   Thumb: file user đưa, chép vào cùng thư mục đó.
2. **Viết `form.json`** cùng thư mục (đường dẫn tương đối tính từ thư mục chứa form.json):
   ```json
   {
     "keyword": "iphone duo có face id không",
     "title": "iPhone Duo có Face ID không? Hé lộ công nghệ bảo mật trên iPhone Duo",
     "url": "",
     "thumb": "iphone-duo-co-face-id-khong-thumb-1.jpg",
     "child_category": "2023",
     "parent_category": "1637",
     "article_type": "Tư vấn chọn mua",
     "product_related": "",
     "meta_title": "",
     "meta_desc": "…",
     "tags": ["iphone duo có face id không", "face id iphone duo", "iphone duo", "iphone"],
     "content_file": "noi-dung.html",
     "publish_date": ""
   }
   ```
   `publish_date` = cột S dạng dd/mm/yyyy, trống = Chờ duyệt. Ngày đã qua: script chặn; hôm nay: cảnh báo vì 02:00 đã qua.
3. **Dry run:** `node $K/tao_bai.mjs <form.json>`. Script kiểm độ dài, URL, cặp chuyên mục, dạng bài, tag, kích thước thumb,
   ảnh trong bài (HEAD 200), ngày cập nhật, bullet, "thiết bị", bài đã tạo chưa. LỖI phải sửa hết, CẢNH BÁO thì sửa hoặc
   nói lý do giữ. Đưa user bảng khai báo (title, url, chuyên mục, dạng bài, tag, meta, thumb, số H3/ảnh/link) để duyệt.
4. **Tạo bài:** `cd <thư mục form>` rồi `node $K/tao_bai.mjs form.json --go` (chạy nền nếu cần, mất khoảng 1-2 phút).
   Script mở `newsId=0`, upload thumb qua nút Choose File, điền form, POST `Faq/SubmitNewsEdit` với trạng thái 3, nhận newsId,
   GET lại so từng trường và cấu trúc nội dung (số H2/H3/H4/p/li/a/img/table, độ dài chữ). `lech: "không lệch"` là đạt.
5. **Báo user:** newsId, link CMS `https://cms.thegioididong.com/v2/Faq/NewsEdit?newsId=<id>`, trạng thái (Chờ duyệt / hẹn xuất bản dd/mm 02:00), các
   cảnh báo còn lại. Bài từ tab `skill_hoi_dap` thì ghi dòng đó: Q "Link CMS" = link CMS, R "ID" = newsId,
   U "Trạng thái up CMS" = `Chờ duyệt` hoặc `Hẹn xuất bản`. Ghi riêng ô Q<n> và U<n>; R là công thức tự tách ID từ Q, không ghi. **Cột U CHỈ điền đúng giá trị dropdown (Chờ làm hình, Chờ duyệt, Hẹn xuất bản, Xuất bản, Lỗi), không tự thêm giá trị khác (user chốt 25/10/2026); muốn ghi gì thêm (lý do lỗi, ghi chú giờ hẹn...) thì ghi vào cột V "Note CMS" bên cạnh.**
   Lệch "số <p>" là bình thường (TinyMCE bọc shortcode `[info]` và chữ trần trong `<p>`, bài cũ trên CMS cũng vậy); script đã bỏ qua, chỉ so chữ tuyệt đối.
6. **Xuất bản (chỉ khi user bảo):** `node $K/xuat_ban.mjs <id>` để xem, rồi `node $K/xuat_ban.mjs <id> --go`
   (`--giu-gio` nếu user muốn giữ ngày giờ đang khai). Script backup trước, đổi trạng thái 2, đọc lại xác nhận các trường
   khác không đổi. Sau đó ghi sheet: T "Link air" = `https://www.thegioididong.com/hoi-dap/<url>-<id>`, U = `Xuất bản`.

## Lỗi hay gặp
- "No page found" / "list_pages treo": hub DevTools chập chờn, script tự thử mở lại 4 lần (chỉ trước khi POST). Vẫn lỗi thì
  chờ 1 phút chạy lại. `devtools-mcp-bridge` thiếu thì cài DevTools Hub theo skill `chrome-profile` (references/mcp-config-recipes.md).
- Upload thumb báo vượt kích thước/dung lượng: CMS trả alert, script dừng và in nội dung alert. Sửa ảnh rồi chạy lại (bài chưa tạo).
- Server trả `status <= 0` kèm `error` (thiếu trường, URL trùng...): đọc lỗi, sửa form.json, dry run lại.
