# Chèn link nội bộ (agent tự đặt link, đúng ngữ cảnh, không cắt từ)

Khác luồng n8n (code khớp chữ, LLM chỉ giữ/bỏ): skill này **agent chủ động chọn và đặt link** khi viết/biên tập bài. `tim_link.py quet` chỉ đưa ứng viên và báo tầng còn thiếu; quyết định cuối thuộc agent.

## Nguyên tắc đặt link
1. **Trọn cụm có nghĩa, không cắt từ.** Anchor là cả cụm danh từ người đọc hiểu được: "điện thoại Xiaomi POCO", không chỉ "điện thoại" hay "POCO"; "sạc nhanh 45W" không cắt thành "sạc nhanh 4". Không tách 1 cụm thành 2 link. Không link một phần của cụm có gạch nối/gạch chéo ("cáp USB" trong "cáp USB-C"). KW của URL là "iPhone Duo" mà bài chỉ có cụm "giá iPhone Duo" / "iPhone Duo 256GB" thì KHÔNG bọc một phần cụm đó để link (cũng không tách "giá" ra ngoài cho vừa anchor, user bắt lỗi 25/10/2026): chọn chỗ KW đứng một mình ("mua iPhone Duo,", "iPhone Duo là mẫu...") ở thân bài gần đầu, không thì viết lại câu cho KW đứng riêng.
2. **Đúng nghĩa trang đích trong câu đó.** "pin", "camera", "màn hình" là bộ phận máy thì không link trang pin sạc dự phòng/camera/màn hình rời. Thông số/thuật ngữ ("RAM 8GB", "chip 2nm", "tần số quét 120Hz") link về bài GIẢI THÍCH thuật ngữ, không link trang danh sách sản phẩm.
3. **Ngữ cảnh đủ sát.** Đặt link ở đoạn đang thật sự nói về đối tượng đó (giải thích, so sánh, khuyên mua), không ở câu liệt kê lướt. Một cụm xuất hiện nhiều lần thì chọn chỗ có ngữ cảnh sát nhất, không mặc định lần đầu.
4. **Được sửa câu cho link tự nhiên.** Nếu bài cần link tầng bắt buộc (VD dòng filter "Xiaomi POCO") mà không có cụm phù hợp, viết lại câu để cụm đó xuất hiện tự nhiên, đúng ý đoạn. Không chèn câu chỉ để chứa link, không nhồi.
5. **Mỗi URL 1 lần trong bài, mỗi cụm 1 link.** Mỗi đoạn tối đa 4 link, nên 1-2. Sapo KHÔNG chèn link (user chốt 15/10/2026, khác guideline gốc C1 "link trong H2"). Các link tầng bắt buộc (ngành hàng, hãng, dòng filter, SP) đặt ở THÂN BÀI, càng gần đầu càng tốt (đoạn mở mục 1, mục so sánh/tư vấn), KHÔNG để link bắt buộc chỉ nằm trong FAQ hay câu kết. Thiếu cụm phù hợp ở đầu bài thì viết lại câu cho cụm xuất hiện tự nhiên (VD đoạn mở mục 1 bài so sánh 2 máy POCO: "Là hai mẫu điện thoại Xiaomi POCO giá rẻ..." → /dtdd-xiaomi-poco).
6. **Không link ở**: H3, H4, box thông số, dòng liệt kê dạng "**Nhãn:** giá trị", bảng, câu kết. Link không in đậm (không `**[a](u)**`).
7. **URL sạch**: `https://www.thegioididong.com/...`, không `?`, `#`, `-ldp`, `/tim-kiem`, `/tag/`. Chỉ dùng URL có trong kho (internal_link_sp, internal_link_thuat_ngu, sitemap_hoi_dap) hoặc lấy trực tiếp từ trang TGDĐ; không tự bịa slug. Không link sang site đối thủ.
8. **Anchor ưu tiên KW volume cao + đúng chính tả** (user chốt 24/10/2026). Cùng 1 URL, chọn KW trong kho có volume cao nhất mà đặt tự nhiên được trong câu: link hãng iPhone dùng anchor "iPhone" (121.000) thay vì "điện thoại iPhone" (19.000). `quet` đã sắp `vi_tri` theo volume giảm dần, kèm `kw_vol_cao_cung_url` (top KW của URL đó) để sửa câu cho KW volume cao xuất hiện. Anchor phải đúng chính tả, đúng cách viết hoa tên riêng ("iPhone", "Galaxy", "OPPO"), có dấu; bỏ qua KW kho viết sai/không dấu/sai ngữ pháp ("iphone giá", "dien thoai") dù volume cao. Nguyên tắc 1 (trọn cụm) vẫn giữ: không cắt "iPhone" ra khỏi cụm "iPhone 18 Pro" để link trang hãng.
9. **Hàng ngưng kinh doanh (NKD-BT) và "Tin đồn" thì không link** (script đã lọc).

## Link tối thiểu theo dạng bài (guideline C1)
| Dạng bài | Tầng bắt buộc |
|---|---|
| So sánh SP, Giới thiệu SP | Ngành hàng (NH), Hãng, Sản phẩm (+ Dòng filter nếu SP thuộc dòng) |
| Top sản phẩm, Top bán chạy | NH, từng SP trong TOP |
| Giới thiệu thương hiệu | NH, Hãng |
| Giới thiệu/So sánh dòng SP | NH, Hãng, Dòng filter |
| Tiêu chí, Định nghĩa, Hướng dẫn | NH (+ hãng/filter nếu bài nhắc) |
SP thuộc dòng filter nào (`dong_filter_can_co`) thì phải có link dòng đó.

## Link thuật ngữ (kho internal_link_thuat_ngu)
- Chỉ link khi bài đích giải thích ĐÚNG thuật ngữ (title chứa thuật ngữ). Không link "Geekbench 6" về bài chip MediaTek, "GPU Apple" về bài GPU Adreno.
- Anchor ưu tiên cụm tự nhiên quanh thuật ngữ ("viên pin 6.000mAh", "màn hình OLED"), tránh từ viết tắt đứng trơ.
- Không bắt buộc link hết; chọn chỗ giúp người đọc hiểu thêm. Thuật ngữ chưa khớp nguyên văn thì `tim_link.py tim "<thuật ngữ>" --loai thuat_ngu` để tìm.
- Mục tiêu ≥ 2 link thuật ngữ/bài nếu kho có bài hợp (QC n8n coi < 2 là chưa đạt).

## Xem thêm (đúng 3) và Đọc thêm (0-2)
- Nguồn: `hoi_dap_lien_quan` từ `tim_link.py quet` hoặc `tim --loai hoi_dap`. Title lấy NGUYÊN VĂN cột Title của sitemap.
- Ưu tiên: (1) đúng SP/dòng SP bài đang nói, (2) cùng ngành/hãng + cùng dạng bài, (3) cùng ngành/hãng. Cùng mức thì bài mới hơn (ID lớn) trước. Không chọn bài thuật ngữ chung không gắn SP, không chọn bài lệch chủ đề.
- Không trùng URL đã link trong bài. Đọc thêm chỉ khi bài đích mở rộng đúng ý đoạn vừa viết.

## Anchor về bài Hỏi Đáp theo dạng bài đích (guideline C3)
Bài đích Top/Top bán chạy → anchor là cụm từ khóa của bài đích. Dạng khác → anchor sát title bài đích (khi đặt trong câu thì là cụm chính của title).

## Xem thêm: chủ động tìm bài Hỏi Đáp mới (user chốt 25/10/2026)
Kho `tim_link.py` có thể cũ, thiếu bài mới air. Khi chọn Xem thêm cho bài về SP mới (VD iPhone Duo), tự kiếm thêm bài đã public: GSC (`get_advanced_search_analytics`, dimension page, filter page chứa `/hoi-dap/` + slug SP), WebSearch `site:thegioididong.com/hoi-dap <SP>`, trang `thegioididong.com/hoi-dap?key=<SP>`. Ưu tiên bài mới air và rải đều: các bài cùng cụm không dùng chung 3 bài giống nhau, mỗi bài chọn 3 bài sát chủ đề mục nhất. Mỗi URL chỉ 1 lần trong bài (không trùng link đã chèn ở thân bài).
