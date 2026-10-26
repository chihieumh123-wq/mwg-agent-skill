# Form CMS V2 TopZone (Tekzone), siteId=16

Khảo sát 25/10/2026, kiểm chứng bằng bài test thật 26/10/2026.

- URL sửa bài: `https://cms.thegioididong.com/v2/News/NewsEdit?newsId=<id>&siteId=16` (id=0 là tạo mới).
- **Form khác Faq V1 (TGDĐ):** TinyMCE id `contentNewsAva` (V1 là `content_FaqNews`).
- Field: `txtTitle`, `txtUrl`, `txtTag` (= `txtMetaKeyword`), `txtMetaTitle`, `txtMetaDescription`, `cboStatus`
  (draft / pending / approved / actived), `txtDate` / `txtHour` / `txtMinute`, `hdSiteId=16`, `hdListCategory` (ngành hàng),
  `thumbnailNews` (hidden; bắt buộc khi Xuất bản).
- Thumb 1200x628 (~60-110KB), URL dạng `cdnv2.tgdd.vn/mwg-static/topzone/News/Thumb/<id>/<slug>-thumbnail-tekzone<số>.jpg`.
  Thumb cũng là ảnh đầu bài (hiển thị 845x442).
- Chuyên mục = `.sticker.newscategory li` (data-id): Tin tức TopZone 2124, Mới nhất 2151, Guides 2128, Deals 2127.
  Bài Hỏi Đáp luôn có 2124 + 2151 + 2128 + 1 chuyên mục Guides theo sản phẩm (xem bảng trong SKILL.md).
- Shortcode dropdown của editor: `captionnews`, `infobox`, `youtube`, `GalleryImage`, `ShortcodeListing`, `infoproduct`, `nameproauto`, `dropcap`.

## Cấu trúc nội dung bài
- Ảnh đầu bài `<p><img title alt src width="845" height="442"/></p>` (chính là thumbnail), rồi `<h2>` sapo (có link kw, kết "Cùng TopZone khám phá ... ngay sau đây!").
- `<h3><strong>1. ...</strong></h3>` đánh số; tiêu đề nhỏ dùng `<p><strong>...</strong></p>` thay H4; list `<ul><li>`.
- Bảng `border="1" style="border-collapse:collapse;width:100%"`, td căn giữa, header `strong`, không tô màu nền.
- Ảnh trong bài `<p><img title alt src width="800"/></p>`, file 1280x720 (1200x675 theo pipeline này), caption `[captionnews]`.
- Shortcode sản phẩm `<p class="p1">[product ID="<sku>" Description= "none" Display="block"]</p>`, mỗi SKU 1 dòng, ở thân hoặc cuối bài, KHÔNG ở đầu bài.
- **Nút CTA cam** (ngoại lệ duy nhất của rule "không tô màu"), đặt sau câu kết, ngay trước "Xem thêm:":
  `<p><strong style="line-height:1.6;"><a class="postarticle" style="margin:auto;width:270px;text-align:center;line-height:20.8px;" title="MUA <TÊN> CHÍNH HÃNG GIÁ TỐT TẠI TOPZONE" href="<trang ngành/sp topzone.vn>" target="_blank" rel="noopener" type="MUA <TÊN> CHÍNH HÃNG GIÁ TỐT TẠI TOPZONE"><span style="color:#ffff00;">MUA <TÊN> CHÍNH HÃNG GIÁ TỐT TẠI TOPZONE</span></a></strong></p>`
  (class `postarticle` tự thành nút cam chữ vàng). Sau nút là `<p>Xem thêm:</p><ul>` đúng 3 bài.

## Hành vi sau khi lưu
Sau Xuất bản, trang web trống khoảng 25 phút mới lên; bài Chờ duyệt thì trang luôn trống. Đừng kết luận lỗi sớm.
Trên trang live: `[product]` ra card, CTA cam, bảng viền 1px không nền, `[info]` thành đoạn in nghiêng.
