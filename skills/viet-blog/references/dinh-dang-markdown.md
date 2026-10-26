# Quy ước file bài (bai.md + bai.json) để dựng HTML

`scripts/dung_html.py` đọc 2 file này, ra HTML giống hệt node 37 của luồng n8n (CMS dán thẳng).

## bai.md

```
## Sapo 220-300 ký tự, có KW chính, kết bằng CTA "Cùng xem ngay nhé!". Không chèn link (link bắt buộc đặt ở thân bài, gần đầu, xem chen-link.md).

### 1. Heading H3 đánh số, 8-15 từ

Đoạn văn 2,5-3,5 dòng (khoảng 40-90 từ), có [anchor](https://www.thegioididong.com/...) chèn trong câu.

#### Heading H4 không đánh số, 8-15 từ

- Dòng liệt kê cấp 1
+ Dòng liệt kê cấp 2

| **Tiêu chí** | **Máy A** | **Máy B** |
|---|---|---|
| **Màn hình** | 6.9 inch | 6.7 inch |

[info]
**Lưu ý:** Giá sản phẩm được cập nhật ngày **dd/mm/yyyy** và có thể thay đổi theo thời điểm.
[/info]

[Product_Promotion listid="123,456" categoryid="" manufactureid="" propertyid="" title="ĐỪNG BỎ LỠ các sản phẩm trong bài viết:" sort=""]

**Tham khảo thêm:** [Title đầy đủ bài Hỏi Đáp](https://www.thegioididong.com/hoi-dap/...)

### 5. Một số câu hỏi liên quan

#### Câu hỏi thật người dùng tìm?

Trả lời ngay câu đầu, 1-2 đoạn.

*Câu kết in nghiêng 2-3 dòng, có KW chính.*
```

- Không viết mục "Mua ... tại Thế Giới Di Động": script tự chèn block chuẩn ngay trước "Một số câu hỏi liên quan" và tự đẩy số H3 FAQ lên 1. Vì vậy FAQ trong bai.md mang số = số H3 cuối + 1 trước khi chèn (VD thân bài có 4 H3 thì FAQ ghi "5.", script đổi thành "6." sau khi thêm Mua "5.").
- Không đặt đoạn dẫn giữa H3 FAQ và H4 câu hỏi đầu tiên (script sẽ bỏ).
- Không viết box "Xem thêm", shortcode đầu/cuối bài: khai trong bai.json, script tự đặt đúng chỗ. Không có dòng "Nguồn tham khảo" cuối bài.
- Không [IMG] (chưa làm hình).
- Dòng "Đọc thêm" giữa bài (tối đa 2, bài < 4 H3 thì 1, 2 dòng ở 2 H3 khác nhau, không đặt sau sapo/trong FAQ/ngay trước H3): viết dạng `**Tham khảo thêm:** [title](url)` hoặc `**Có thể bạn quan tâm:** ...`.

## bai.json

```json
{
  "keyword": "so sánh poco c95 pro và poco c85",
  "kw_phu": ["poco c95 pro"],
  "dang_bai": "So sánh sản phẩm",
  "title": "≤ 65 ký tự, có KW chính",
  "meta": "140-160 ký tự, có KW chính, kết bằng Click xem ngay!",
  "urls_push": ["https://www.thegioididong.com/dtdd/xiaomi-poco-c95-pro"],
  "san_pham": [{"ten": "Xiaomi POCO C95 Pro", "hang": "Xiaomi", "phien_ban": ["8GB/256GB"], "push": true}],
  "nganh": "điện thoại",
  "cate": "42",
  "co_mua": null,
  "ten_muc_mua": "",
  "sc_dau": "[Product_Promotion listid=\"...\" categoryid=\"\" manufactureid=\"\" propertyid=\"\" title=\"...\" sort=\"\"]",
  "sc_cuoi": "[Product_Promotion listid=\"\" categoryid=\"42\" manufactureid=\"2235\" propertyid=\"\" title=\"...\" sort=\"5\"]",
  "xem_them": [{"url": "https://www.thegioididong.com/hoi-dap/...", "title": "Title đầy đủ"}],
  "nguon": ["GSMArena"]
}
```

- `san_pham`: các SP bài nói tới có trong dữ liệu TGDĐ; `push: true` cho SP thuộc cột URL SP cần push. Dùng cho block Mua (tên mục) và lint FAQ.
- `co_mua`: null = tự xét (dạng bài thuộc nhóm mua bán hoặc có URL push); true/false để ép. `ten_muc_mua` để ép tên trong heading Mua khi tên tự sinh không hợp.
- `nguon`: tên nguồn uy tín đã dùng cho dữ kiện CÓ trong bài, chỉ để ghi vào cột Link đã chèn (bài không in nguồn).

## Shortcode (rule tối thiểu, user chốt 11/10/2026)

Cú pháp: `[Product_Promotion listid="" categoryid="" manufactureid="" propertyid="" title="" sort=""]`
- `sort` chỉ dùng khi listing theo categoryid/manufactureid/propertyid, KHÔNG dùng với listid.
- **Đầu bài (sc_dau, trước sapo)**: SP bài đang nói. Có URL push → listid = ID các SP push + các bản dung lượng của chúng (bản gốc trước, rồi dung lượng tăng dần; lấy ID từ `phien_ban[].id` trong `tgdd.py lay` hoặc cột ID SP trong kho). Không có SP: listing theo trang ngành/hãng/filter chính (categoryid + manufactureid/propertyid, sort="8"). Tối đa 16 ID.
  Bài về linh kiện (VD chip A20 Pro) không nhắc model nào → lấy cả dòng SP dùng linh kiện đó.
- **Cuối bài (sc_cuoi, trước Xem thêm)**: ngành hàng + hãng chung, sort="5". categoryid = số cate trong đường dẫn ảnh `/Products/Images/{cate}/` (điện thoại 42, tablet 522, laptop 44, đồng hồ thông minh 7077). manufactureid = Mã Hãng tra trong cache `sc_hang.json` theo đúng Mã Ngành Hàng (Apple: iPhone 80/42, MacBook 203/44, iPad 1028/522, Apple 17188/7077), thiếu thì lấy `info.brandId` của trang hãng TGDĐ.
- **title**: cụm VIẾT HOA (ĐỪNG BỎ LỠ, XEM NGAY) + "các mẫu" + nhóm SP đúng listing + cụm nhấn VIẾT HOA tùy chọn (MỚI NHẤT, GIÁ TỐT, CHÍNH HÃNG) + "tại Thế Giới Di Động:"; listing SP trong bài thì kết "trong bài viết:". Dưới 20 từ, kết bằng ":", không ngoặc kép, không giá.
- **Bài Top**: `[sosanh products="id1,id2,..." properties="" categoryid="{cate}"]` ngay trước H4 SP đầu tiên + `[Product_Promotion listid="{id}" ...]` ngay dưới mỗi H4 sản phẩm.
- **[SP] trong thân bài**: chỉ khi khuyên mua SP push và thật cần, dạng listid; SP đã có ở sc_dau thì không lặp.
