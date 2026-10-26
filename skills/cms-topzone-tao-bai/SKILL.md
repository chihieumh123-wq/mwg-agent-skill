---
name: cms-topzone-tao-bai
description: "Viết + up bài Hỏi Đáp TopZone (CMS V2 siteId=16, link air topzone.vn/tekzone/<url>-<id>): dựng HTML bằng dung_html_topzone.py (mục Mua TopZone, nút CTA cam, Xem thêm 3 bài, shortcode [product] ở thân/cuối bài), làm ảnh --site topzone (thumb 1200x628 = ảnh đầu bài, ảnh bài 1200x675), up ảnh lên CDN News/0, tạo bài mới bằng tao_bai.mjs (chuyên mục Tin tức TopZone + Mới nhất + Guides + chuyên mục sản phẩm), cập nhật nội dung bài đã có. Trigger: dòng tab skill_hoi_dap cột A Site = TopZone, up bài TopZone, bài tekzone, CMS TopZone."
user-invocable: true
when_to_use: "Khi dòng tab skill_hoi_dap có Site = TopZone và user muốn viết/up bài. Site = TGDĐ thì dùng cms-faq-tao-bai."
---

# Bài Hỏi Đáp TopZone

Cùng luồng với `blog-hoi-dap-tron-goi` / `viet-blog` (văn phong, research, QC, rule ảnh/alt giữ nguyên). Chỉ khác ở các điểm dưới. Scripts: `$Z=<skills>/cms-topzone-tao-bai/scripts` (`<skills>` = thư mục cài skill, thường `~/.claude/skills`).
CMS: `https://cms.thegioididong.com/v2/News/NewsEdit?newsId=<id>&siteId=16` (id=0 là bài mới), Chrome profile lấy từ biến `CMS_CHROME_PROFILE_TOPZONE` (mặc định `CMS_CHROME_PROFILE`): key profile của `chrome-profile` đã đăng nhập CMS và có quyền site TopZone.
Chi tiết form/format: [references/cms-v2-format.md](references/cms-v2-format.md).

## Khác TGDĐ
| Việc | TopZone |
|---|---|
| Bai.json | thêm `"site": "TopZone"`, `cta_url` (trang ngành/sp topzone.vn), `cta_ten` (tên in hoa trong nút), `sc_sp`, `xem_them` đúng 3 bài topzone.vn |
| Link nội bộ | `<skills>/chen-link-noi-bo/scripts/scan_links.py <file> --site topzone [--refresh]` (gộp 4 tab KW: Ngành hàng, Hãng, Ngành hàng Filter, Sản Phẩm; chỉ "Đang kinh doanh"). Chỉ link topzone.vn. Không dùng `tim_link.py` (kho TGDĐ) |
| Dựng HTML | `python3 <skills>/viet-blog/scripts/dung_html.py bai.md bai.json -o bai.html` (tự chuyển sang `dung_html_topzone.py` khi site=TopZone) |
| Tô màu | Không tô chữ/bảng/khung. Ngoại lệ: nút CTA cam (`a.postarticle`, chữ vàng) |
| Mục Mua | Template TopZone (intro "hệ thống bán lẻ ủy quyền cao cấp nhất của Apple", Thông tin TopZone, Chính sách mua hàng và bảo hành), hotline `1900.9696.42` (tel:1900969642). Đặt trước mục câu hỏi liên quan |
| CTA | Nút cam "MUA <TÊN> CHÍNH HÃNG GIÁ TỐT TẠI TOPZONE" sau câu kết, ngay trước "Xem thêm:" |
| Xem thêm | `<p>Xem thêm:</p><ul>` đúng 3 bài |
| Shortcode sp | KHÔNG ở đầu bài. `[product ID="<sku>" Description= "none" Display="block"]` mỗi SKU 1 dòng, đặt qua `sc_sp` ở mục phù hợp hoặc cuối bài. Lấy sku: `python3 <skills>/viet-blog/scripts/tz_sp.py <url sp topzone>` (mỗi dung lượng 1 trang riêng) |
| Ảnh | `xu_ly_anh.py --site topzone` (thumb 1200x628, <500KB), ảnh bài 1200x675. Thumb tên `<slug>-thumbnail-tekzone.jpg` = cũng là ảnh đầu bài (845x442 hiển thị). `kiem_anh.py anh <slug> --site topzone`, `chen_anh.py ... --site topzone --thumb-alt "<alt ảnh đầu>"` (caption `[captionnews]` mặc định) |
| Up ảnh | `node $Z/up_anh.mjs anh <slug>` |
| Chuyên mục | Luôn **2124 Tin tức TopZone + 2151 Mới nhất + 2128 Guides** + 1 chuyên mục Guides theo sản phẩm (iPhone 2136, iPad 2138, Mac 2137, Watch 2139, Âm thanh 2147, Phụ kiện 2143, Dịch vụ 2148). Giá/ưu đãi thì dùng Deals 2127 + con. `product_cate`: iPhone 42, MacBook 44, Tai nghe 54, Phụ kiện 482 (AirPods/Watch để trống) |
| Link air | `https://www.topzone.vn/tekzone/<url>-<id>` |

## Up bài
1. Viết `form.json` (keyword, title ≤70, url?, thumb, content_file, cates, product_cate, meta_title, meta_desc, tags[2-6 gồm keyword], publish_date?).
2. `node $Z/tao_bai.mjs form.json` (dry run, kiểm: ngày cập nhật = hôm nay, H2 sapo, CTA, Xem thêm 3, không [product] trước H3 đầu, không tô màu ngoài CTA, không "thiết bị", ảnh HEAD 200 có alt, thumb 1200x628).
3. Đưa bảng khai báo cho user duyệt, rồi `node $Z/tao_bai.mjs form.json --go`. Có `publish_date` → Xuất bản hẹn 02:00; trống → Chờ duyệt. Mỗi bài POST 1 lần.
4. Sửa nội dung bài đã up: `node $Z/cap_nhat_noi_dung.mjs <id> noi-dung.html [--go]` (backup trước, lấy nền từ bản live).
5. Ghi sheet: cột R Link CMS, V Trạng thái up CMS, U Link air, W Note CMS (S ID là công thức, không ghi).

## Đã test thật (26/10/2026, bài 1601467)
`tao_bai.mjs --go`, `up_anh.mjs`, `xuat_ban.mjs <id> --go` chạy OK. Sau xuất bản trang web trống khoảng 25 phút mới lên (bài Chờ duyệt thì luôn trống), đừng kết luận lỗi sớm. Chỉ chạy `xuat_ban.mjs` khi user nói rõ xuất bản bài đó.
