---
name: blog-hoi-dap-tron-goi
description: "Quy trình trọn gói 1 bài blog Hỏi Đáp TGDĐ từ dòng tab skill_hoi_dap tới lúc lên CMS: viết bài (viet-blog, Antigravity viết văn phong, Claude duyệt đầu cuối), làm hình (thumb 560x292 + ảnh bài 1200x675 lấy từ kho ảnh user hoặc web hãng, resize/làm tối nền không cắt chủ thể, kiểm rule), upload ảnh lên CDN qua CMS và chèn đúng đoạn, up bài bằng cms-faq-tao-bai (cột S có ngày → Xuất bản hẹn 02:00 ngày đó, trống → Chờ duyệt), ghi sheet Q/U, kiểm link public. Trigger: chạy trọn gói dòng X, viết và up bài hỏi đáp, làm bài blog hoàn chỉnh, viết làm hình up bài, quy trình blog hỏi đáp."
user-invocable: true
when_to_use: "Khi user muốn 1 hoặc nhiều dòng tab skill_hoi_dap đi hết từ viết tới lên CMS. Chỉ viết (không up) thì dùng viet-blog; chỉ up bài đã có thì dùng cms-faq-tao-bai."
---

# Blog Hỏi Đáp trọn gói: Viết → Làm hình → Up CMS

Sheet `$HOI_DAP_SHEET_ID` (file "Hỏi Đáp n8n", tạo bằng `viet-blog/scripts/khoi_tao_sheet.py`), tab `skill_hoi_dap`. Cột dùng thêm ngoài viet-blog:
Q Link CMS, R ID (công thức ở R1 tự tách từ Q, không ghi tay), S Ngày xuất bản dự kiến (dd/mm/yyyy, biên tập điền),
**Cột A `Site` (TGDĐ/TopZone) thêm 25/10/2026: các chữ cột ở dưới (Q, R, S, T, U, V, N...) đều dịch +1, tra theo tên header khi ghi sheet.**
T Link air, U Trạng thái up CMS (dropdown: Chờ làm hình, Chờ duyệt, Hẹn xuất bản, Xuất bản, Lỗi).
Scripts: `$T=<skills>/blog-hoi-dap-tron-goi/scripts`, `$K=<skills>/cms-faq-tao-bai/scripts` (`<skills>` = thư mục cài skill, thường `~/.claude/skills`). Cài đặt, biến môi trường và kiểm tra môi trường: xem [SETUP.md](SETUP.md).
Thư mục làm việc mỗi bài: thư mục bài của viet-blog `$BLOG_ROOT/<slug-keyword>/` (`BLOG_ROOT` mặc định `~/blog-hoi-dap`), ảnh để trong `anh/`.

## Site TopZone
Dòng có cột A Site = TopZone: làm theo skill `cms-topzone-tao-bai` (dựng HTML TopZone, link `scan_links.py --site topzone`, ảnh `--site topzone`, up CMS V2). Văn phong/research/QC giữ nguyên.

## Phân vai
- **Antigravity** làm phần cần tốc độ, đã có rule rõ: viết bài theo outline (viet-blog bước 5, `giao_anti.py`), sửa văn phong
  theo góp ý (`--sua`), nháp alt/title ảnh khi bài nhiều ảnh (giao qua skill `agent-crew`, brief kèm rule alt bên dưới).
- **Claude (agent điều phối)** làm research, outline, QC số liệu, chèn link, chọn ảnh, chạy script, và **duyệt đầu cuối**:
  đọc lại toàn bộ bài + ảnh + khai báo theo guideline (`viet-blog/references/guideline-hoi-dap.md`, `bai-hoc-da-chot.md`)
  trước khi up. Bài Anti viết chưa đạt thì trả lại tối đa 2 vòng rồi tự sửa.
- **User**: điền A-F, S; đưa kho ảnh khi được hỏi; bảo "xuất bản" với bài không có ngày ở cột S.

## Các bước (mỗi dòng)

| # | Việc | Kết quả / cột U |
|---|---|---|
| 1 | Viết bài: viet-blog bước 0-10 | Doc (L), H, I, G = Done. U = `Chờ làm hình` |
| 2 | Hỏi user kho ảnh của bài | |
| 3 | Làm hình + kiểm rule | `anh/` đủ thumb + ảnh bài, `ke-hoach-anh.json` |
| 4 | Upload ảnh bài lên CDN, chèn vào HTML | `noi-dung.html` có ảnh, mọi ảnh 200 |
| 5 | Duyệt đầu cuối (Claude) | |
| 6 | Up CMS bằng cms-faq-tao-bai | Q; U = `Chờ duyệt` hoặc `Hẹn xuất bản` |
| 7 | Kiểm link public, ghi T | U = `Xuất bản` khi đã lên |

### 1. Viết
Chạy đúng skill `viet-blog` (bước 0-10). Trong lúc viết, đánh dấu chỗ cần ảnh theo **rule phân bổ ảnh** (user chốt 24/10/2026):
- Tối thiểu **3 ảnh** trong bài.
- Không được có **2 heading (H3/H4) liền nhau mà cả 2 mục đều không có ảnh**. Không bắt buộc mục nào cũng có ảnh, nhưng
  rải sao cho chữ không dày đặc (đoạn chữ > ~1.500 ký tự liền thì xen ảnh).
- **Format bài Top sản phẩm (user chốt 25/10/2026, mẫu newsId 1599562)**: outline tiêu chí → top sp → so sánh (vài câu dẫn + `[sosanh products="id,id,..." properties="" categoryid=".."]`) → lưu ý chọn mua (nếu có) → mua tại TGDĐ → câu hỏi liên quan. Shortcode từng sp `[Product_Promotion listid="<id>" ... title=""]` KHÔNG câu dẫn, sp nào cũng phải có (id = `sku` JSON-LD trang sp). Mục top sp không cần ảnh.
- **Bài Top sản phẩm**: ở các mục viết về từng sản phẩm, shortcode sản phẩm (`[Product_Promotion …]`, `[product …]`,
  `[Product_Box …]`) thay cho ảnh; 3 ảnh tối thiểu phải nằm ở các mục KHÁC (tiêu chí chọn, chọn nhanh, lưu ý, mua...).
- Mục "Xem thêm" miễn ảnh. Mục **Mua ... chính hãng, giá tốt tại Thế Giới Di Động**: chỉ chèn ảnh khi có nguồn ảnh cửa hàng TGDĐ phù hợp nội dung bài (không có thì không chèn); ảnh đặt SAU dòng Hotline `Hotline tư vấn và hỗ trợ khách hàng: 1900 232 460 (8:00 - 21:30)` ở cuối mục, không chèn cắt ngang đoạn/list (user chốt 25/10/2026, không sửa bài cũ). Mục **FAQ**: chỉ chèn **1-2 ảnh xen kẽ** cả mục (user cập nhật 25/10/2026, thay rule 24/10). Các mục khác vẫn phải có ảnh theo rule không 2 heading liền thiếu ảnh; đoạn chữ liền > 1.500 ký tự phải xen ảnh. Không sửa lại các bài đã viết theo rule mới. Ảnh trong bài giữ nền gốc, không ghép nền; ưu tiên ảnh nền màu và ảnh thực tế `anh-thuc-te` (có logo TGDĐ vẫn dùng được trong bài).
Ghi U = `Chờ làm hình`.

### 2. Hỏi kho ảnh
**Nguồn ảnh được dùng (user chốt 25/10/2026):** ngoài kho của user, lấy thêm ảnh trên web hãng, trang công nghệ nước ngoài uy tín và ảnh trong bài của thegioididong.com/tin-tuc. Ảnh phải không dính logo/watermark (trừ logo Apple); ảnh có watermark TGDĐ thì chỉ dùng trong bài, còn làm thumb thì phải xóa/crop sạch watermark. Thumb thích hợp dùng 1 ảnh chụp thực tế khi bài về hình ảnh/trên tay.

Hỏi user: "Bài <keyword> có kho ảnh không? (đường dẫn thư mục / Drive)". Đây là điểm dừng duy nhất trước khi up.
Nhiều dòng thì hỏi gộp 1 lần cho tất cả dòng.
- Có kho: chỉ chọn ảnh trong kho.
- Không có kho: lấy ảnh trên web hãng, ưu tiên trang VN (apple.com/vn, Apple Newsroom VN, samsung.com/vn...), rồi ảnh
  bài đánh giá trên trang sản phẩm TGDĐ. Không lấy ảnh trang tin tức báo/đối thủ, không ảnh có logo/watermark trang khác.
  Tải về `anh/goc/` (mỗi lần tải ghi nguồn vào `anh/nguon.txt`).

### 3. Làm hình
Chọn ảnh phải XEM từng ảnh (Read tool), đúng sản phẩm và đúng nội dung đoạn sẽ đặt. Không dùng ảnh AI, không chèn chữ hay logo.
```bash
python3 $T/xu_ly_anh.py anh/goc/<ảnh> anh/<url>-thumb-1.jpg --kieu thumb
python3 $T/xu_ly_anh.py anh/goc/<ảnh> anh/<url>-1.jpg --kieu bai      # -2, -3...
python3 $T/kiem_anh.py anh <url>
```
- `<url>` = slug URL bài trên CMS (cms-faq-tao-bai sinh từ Title, ≤ 50 ký tự). Tính trước bằng dry run của tao_bai.
- `xu_ly_anh.py` đưa về đúng khổ mà không cắt chủ thể (không vừa thì nới nền), nền trắng đổi sang nền tối `#3a3a3c`
  (`--nen` đổi màu khác hợp ảnh, `--giu-nen` nếu nền không phải trắng thuần). Báo "phải phóng ... sẽ mờ" thì tìm ảnh lớn hơn.
- Sau khi xử lý, XEM lại từng ảnh ra: sản phẩm nguyên vẹn, không bị cắt nửa chừng, không mờ, không watermark, nền đổi sạch.
- `kiem_anh.py` phải ra OK: thumb 560x292 JPG < 1MB, ảnh bài 1200x675 JPG nhẹ, không nền trắng, không viền, tên chưa có
  trên CDN (up lại thì tăng số `-thumb-2`, `-5`...).

**Rule thumb** (checklist user): 560x292, < 1MB, JPG/JPEG, không mờ, không watermark, không nền trắng, không viền,
tên `URL-thumb-Số`, hình đúng nội dung bài (bài Top dùng ảnh sản phẩm trong bài), không bị cắt mất chi tiết.

**Chọn ảnh bài**: ảnh phải minh hoạ đúng ý ĐOẠN VĂN đặt ngay trên ảnh (đoạn nói bản lề → ảnh thấy rõ bản lề; đoạn nói
chân đế → ảnh máy đang dựng bằng chân đế), không chọn ảnh sản phẩm chung chung cho mọi chỗ.

**Alt = title = caption** (`ke-hoach-anh.json`, cùng 1 câu): viết theo nội dung ĐOẠN VĂN sát ảnh (không mô tả ảnh chung
chung kiểu "Hình ốp lưng iPhone Duo"), 40-60 ký tự, câu khẳng định, mỗi ảnh khác nhau, không chép nguyên câu trong bài,
không chấm cuối, không tên SP kèm cấu hình. Caption là dòng chữ xám dưới ảnh (định dạng caption của CMS), mặc định ảnh nào
cũng có; ảnh không cần caption thì thêm `"caption": false`.
```json
[{"file": "<url>-1.jpg", "sau_doan": "<cụm chữ duy nhất của đoạn/heading đặt ảnh phía sau>", "alt": "..."}]
```
VD bài 1601370 (Top ốp lưng iPhone Duo): ảnh bản lề sau đoạn "…dày 11,3mm khi đóng… nặng 254 gram", alt/caption
"Ốp iPhone Duo cần ôm khít hai nửa thân và chừa bản lề"; 9 mục H4 sản phẩm dùng `[Product_Promotion]` thay ảnh.

### 4. Upload ảnh + chèn
```bash
node $T/up_anh.mjs anh <url>          # → anh/anh-cdn.json, ảnh ở cdnv2.tgdd.vn/mwg-static/common/News/0/<file>
python3 $T/chen_anh.py noi-dung.html anh/ke-hoach-anh.json anh/anh-cdn.json -o noi-dung-co-anh.html [--top]
```
`--top` cho bài Top sản phẩm. `chen_anh.py` CHẶN (không ghi file) khi thiếu 3 ảnh hoặc có 2 heading liền không ảnh,
CẢNH BÁO khi chữ dày > 1.500 ký tự không ảnh (đọc lại, thường nên thêm ảnh).
`up_anh.mjs` gọi thẳng `Common/UploadManyImages` (như modal "Insert folder images" của CMS) trong tab CMS newsId=0,
không lưu bài; chạy lại chỉ up ảnh chưa có trong `anh-cdn.json`. `chen_anh.py` dựng thẻ giống nút "Chèn vào bài":
`<p><img class="lazy" title alt src width height /></p>` (KHÔNG chèn caption tay: CMS tự thêm caption từ title khi lưu, chèn thêm sẽ lặp 2 lần), chèn sau block khớp
`sau_doan`, kiểm độ dài/trùng alt và phân bổ ảnh.
`noi-dung.html` lấy từ Doc mới nhất (cách lấy ở skill cms-faq-tao-bai bước 1).

### 5. Duyệt đầu cuối
Đọc `noi-dung-co-anh.html` như biên tập viên, đối chiếu guideline + bai-hoc-da-chot + rule đã chốt: title/meta, sapo,
heading, giá và ngày cập nhật = hôm nay, link (mỗi URL/kw 1 lần), mục Mua, FAQ, không tin đồn, không "thiết bị" cho
sản phẩm TGDĐ, bullet `<ul><li>`, ảnh đúng đoạn và alt. Sửa xong mới sang bước 6.

### 6. Up CMS
Viết `form.json` theo skill `cms-faq-tao-bai` (content_file = `noi-dung-co-anh.html`, thumb = `anh/<url>-thumb-1.jpg`) và
thêm `"publish_date"` = cột S của dòng (để trống nếu S trống):
- S có ngày → trạng thái **2 Xuất bản**, ngày đăng = S, giờ **02:00** (CMS hẹn giờ). Ngày đã qua thì script chặn, hỏi user.
- S trống → trạng thái **3 Chờ duyệt**; xuất bản sau khi user bảo (`xuat_ban.mjs`).
```bash
node $K/tao_bai.mjs form.json && node $K/tao_bai.mjs form.json --go
```
Ghi sheet dòng n: Q = link CMS, U = `Hẹn xuất bản` (S có ngày) hoặc `Chờ duyệt`. Không ghi R (công thức tự ra).

### 7. Kiểm link public
Link air = `https://www.thegioididong.com/hoi-dap/<url>-<id>`. Bài hẹn giờ: kiểm ngay sau khi up, nếu trang đã lên trước
02:00 ngày S thì báo user (CMS không giữ lịch). Khi trang trả 200: kiểm title, thumb, ảnh trong bài load được, rồi ghi
T = link air, U = `Xuất bản`. Lỗi bất kỳ bước nào: U = `Lỗi`, ghi lý do vào cột N Cảnh báo và cột V "Note CMS". Cột U chỉ điền đúng giá trị dropdown, mọi ghi chú khác để ở V.

## Báo user (mỗi dòng)
Link Doc, newsId + link CMS, trạng thái (Chờ duyệt / hẹn xuất bản dd/mm 02:00), số ảnh đã chèn, cảnh báo còn lại.
