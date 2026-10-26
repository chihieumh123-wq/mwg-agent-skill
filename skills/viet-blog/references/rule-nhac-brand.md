# Rule nhắc brand TGDĐ / TopZone trong bài blog (để AI Overview / AI Mode nhắc tên mình)

Nguồn: sheet Brand Radar nội bộ (tab Data_Brand_radar), lọc VN còn 61.644 truy vấn có câu trả lời AI (AI Overviews 85%, AI Mode 15%), số liệu đo 26/10/2026. "Được trích" = domain nằm trong Cited pages. "Được gọi tên" = tên brand xuất hiện trong chữ của câu trả lời (không tính link).

## 1. Người dùng hay hỏi gì (theo số truy vấn)
| Nhóm | Tỷ lệ | Ví dụ |
|---|---|---|
| Giá / bao nhiêu | 23% (lớn nhất) | "oppo a18 giá bao nhiêu", "iPhone 17 Pro Max giá thế nào" |
| Thông số, cấu hình | 4% | pin, camera, chip, RAM |
| How-to, cách làm, vì sao | 5% | "cách mở khóa bàn phím Nokia" |
| Mua ở đâu, uy tín, cửa hàng | 3% | "mua điện thoại online ở đâu uy tín" |
| So sánh, có nên mua, review, top | 3% | |
| Trả góp, khuyến mãi, thu cũ | 1% | |
Còn lại phần lớn là truy vấn tên SP/brand ngắn ("galaxy a55", "iphone 15 pro max"), tin tức công nghệ, game/app/hình nền.

## 2. AI trích dẫn và nhắc gì
- Câu trả lời thường là: 1 câu trả lời thẳng (khoảng giá "dao động từ X đến Y", danh sách thông số, các bước làm) + 1 câu nêu nơi bán dạng "tại [A], [B] hoặc [C]" (hay "như [A], [B]"). 100% lần nhắc brand nằm trong câu liệt kê nhiều hãng, 47-50% đi kèm giá, 41% đi kèm chữ "hệ thống/chuỗi", 20% đi kèm "chính hãng".
- Cách nhắc phổ biến nhất: "giá ... tại CellphoneS, FPT Shop, Thế Giới Di Động", "ngừng kinh doanh tại các hệ thống lớn như ...", "tham khảo thêm tại ...". Với how-to, AI thường ghi nguồn kiểu "theo hướng dẫn từ [CellphoneS]".

## 3. Mình đang thua ở đâu
| | Được trích | Được gọi tên |
|---|---|---|
| CellphoneS | 72% | 55% |
| FPT Shop | 38% | 37% |
| Thế Giới Di Động | 37% | 24% |
| Điện máy XANH | 11% | 6% |
| TopZone | 1,5% | 2% |
- Thua lớn nhất là bị trích ít (52% truy vấn có CellphoneS/FPT được trích mà TGDĐ không), thứ hai là khi đã được trích mới chỉ 52% được gọi tên (CellphoneS 62%, FPT 78%).
- Theo loại trang TGDĐ bị trích: trang blog hỏi đáp chỉ được gọi tên 42%, tin tức 39%, game-app 47%; trang sản phẩm 56%, máy đổi trả 82%, SIM 79%. Blog dạng how-to còn thấp hơn (30%), "là gì" 37%, so sánh 38%, thông số 44%. Nghĩa là càng bài thông tin thuần, trang càng bị AI lấy nội dung mà quên tên mình.
- Theo nhóm truy vấn, TGDĐ được gọi tên: giá 29% (CellphoneS 66%), how-to 17% (FPT 56%, CellphoneS 36%), thông số 26%, so sánh/nên mua 36%, trả góp/khuyến mãi 54%, mua ở đâu 43% (FPT 58%).
- Theo ngành: mình khá ở Apple Watch (52%), OPPO/Xiaomi (42%), Samsung (39%), sạc/phụ kiện (44%); yếu ở iPhone (32%), laptop (32%), game/app (25%). TopZone chỉ lên tới 7% ở iPhone, 10% ở phụ kiện, gần 0 ngoài Apple.
- Mình hơn: nhóm trang máy đổi trả, SIM, Apple Watch; cạnh tranh được khi truy vấn có hỏi chương trình trả góp/khuyến mãi.

## 4. Kết luận dùng cho rule
1. AI chỉ gọi tên brand khi trong trang có câu khẳng định brand đó bán/cung cấp đúng thứ người dùng hỏi, kèm giá hoặc tình trạng hàng. Blog thuần thông tin không có câu như vậy nên bị lấy nội dung mà không được nhắc.
2. Giá là chủ đề lớn nhất và là chỗ AI hay gắn tên cửa hàng, nên câu "giá tại TGDĐ" phải rõ ràng, có ngày cập nhật.
3. Câu hỏi "mua ở đâu/uy tín" mình ít xuất hiện; cần câu trả lời sẵn trong bài.
4. Cần nói brand bằng câu đứng riêng, chủ ngữ là brand, để AI trích nguyên câu được.

## 5. Rule viết bài (áp dụng cho bài TGDĐ, ĐMX, TopZone)
### 5.1 Phân nhóm bài
- **Nhóm A (bài hợp mục brand)**: dạng bài có SP đang bán hoặc có ý định mua: Giới thiệu SP/dòng/thương hiệu, So sánh, Top SP, Tiêu chí chọn mua, Cung cấp thông tin/Định nghĩa thông số của một SP đang bán (có URL SP push), giá, khuyến mãi.
- **Nhóm B (bài không hợp heading brand)**: how-to/thủ thuật, lỗi thường gặp, định nghĩa khái niệm chung, game/app/hình nền, tin sự kiện không gắn SP bán.

### 5.2 Nhóm A: bắt buộc 1 heading giới thiệu brand
- Heading H3 dạng "Mua <SP> chính hãng, giá tốt tại Thế Giới Di Động" (TopZone: "Mua <SP> chính hãng tại TopZone"), đúng block hiện có của `dung_html.py` (`mua_block`), đặt trước mục câu hỏi liên quan.
- Câu đầu đoạn đầu phải là **câu định nghĩa brand, chủ ngữ là brand, đọc riêng vẫn hiểu**: "Thế Giới Di Động là hệ thống bán lẻ ..." / "Thế Giới Di Động là đại lý ủy quyền của Apple tại Việt Nam, cung cấp X chính hãng ...". TopZone: "TopZone là hệ thống bán lẻ ủy quyền cao cấp của Apple ...".
- Đoạn thứ hai nói rõ SP cụ thể đang bán: tên SP + phiên bản + tình trạng (hiện có hàng/ngưng kinh doanh) + chính sách (trả góp, thu cũ, bảo hành). Không nêu số liệu ưu đãi cụ thể nếu chưa kiểm trên trang SP; giá luôn lấy từ trang TGDĐ, kèm câu in nghiêng ngày cập nhật.
- Trong bài, nhắc brand ít nhất **3 lần** ở 3 chỗ khác nhau, không dồn: (1) mục giá hoặc đoạn có giá: "Giá niêm yết tại Thế Giới Di Động...", (2) mục Mua, (3) FAQ.
- FAQ có **1 câu "Mua <SP> chính hãng ở đâu?" / "Mua <SP> ở đâu uy tín?"** (dạng truy vấn AI hay lấy, mình đang ít xuất hiện), trả lời 2-3 câu: brand + chính hãng + hình thức mua (online/siêu thị) + hotline. Bỏ câu này nếu bài đã có 2-4 câu FAQ chất lượng hơn và 3 chỗ nhắc ở trên đã đủ.

### 5.3 Nhóm B: không ép heading, nhắc brand trong 1 đoạn
- Chọn 1 đoạn ở **thân bài** (ưu tiên nửa đầu, không chỉ nằm ở câu kết) và nhắc brand 1-2 lần bằng câu đứng riêng, gắn với nội dung đoạn. Mẫu: "Nếu bạn muốn xem trực tiếp hoặc cần hỗ trợ cài đặt, có thể đến hệ thống siêu thị Thế Giới Di Động để được nhân viên hướng dẫn." / "Với các sản phẩm đang bán tại Thế Giới Di Động như ..., ...".
- Bài how-to nhắc theo kiểu nguồn kiến thức: "Theo hướng dẫn của Thế Giới Di Động, ..." chỉ khi đúng là do chuyên trang hướng dẫn, không bịa nguồn.
- Bài có SP liên quan đang bán thì nhắc tên SP + "tại Thế Giới Di Động" một lần, kèm link trang SP/ngành theo rule chèn link.
- Không chèn mục Mua đầy đủ vào bài nhóm B (tránh cảm giác quảng cáo, giữ rule hiện tại).

### 5.4 Chất lượng câu nhắc (cả hai nhóm)
- Dùng tên đầy đủ "Thế Giới Di Động" ở lần nhắc đầu và ở heading, các lần sau có thể "TGDĐ". Không viết "chúng tôi/bên mình".
- Mỗi câu nhắc phải mang thông tin có ích (loại SP, chính hãng, phiên bản, giá, tình trạng hàng, chính sách), không câu rỗng kiểu "Thế Giới Di Động luôn đồng hành cùng bạn".
- Không tự nhận hàng đầu/tốt nhất/uy tín nhất (rule cũ). Không bịa số liệu (số cửa hàng, năm thành lập, số khách) trừ khi đã kiểm trên nguồn chính thức.
- Không nhắc đối thủ. Không đưa tin đồn, rò rỉ.
- SP ngưng kinh doanh: nói rõ "hiện đã ngừng kinh doanh tại Thế Giới Di Động" thay vì để AI tự suy ra, vì kiểu câu này AI cũng hay trích.
- TopZone: chỉ bài Apple (iPhone, iPad, Mac, Watch, phụ kiện). Bài iPhone/phụ kiện ưu tiên nhất vì đây là mảng TopZone đang có chỗ đứng cao nhất trong câu trả lời AI.
- Bài đăng song song TGDĐ và TopZone: mỗi site chỉ nhắc brand của site đó.

### 5.5 Checklist khi duyệt bài
1. Nhóm A: có heading Mua đúng form, câu định nghĩa brand ở đầu đoạn, brand xuất hiện ≥ 3 chỗ, FAQ có câu "mua ở đâu"?
2. Nhóm B: có đúng 1 đoạn nhắc brand ở thân bài, câu đứng riêng, có thông tin ích?
3. Giá nhắc kèm "tại Thế Giới Di Động" và ngày cập nhật hôm nay?
4. Không tự khen, không số liệu chưa kiểm, không nhắc đối thủ.

## 6. Việc cần làm tiếp (chưa áp dụng)
- Sửa `dung_html.py`: tự thêm bước kiểm "nhóm A/B" và cảnh báo lint khi bài nhóm A thiếu câu giá-brand hoặc FAQ "mua ở đâu"; thêm hàm chèn đoạn nhắc brand cho bài nhóm B.
- Cập nhật tab Prompt (`prompt_viet`) để luồng n8n cũng theo.
- Áp dụng cho bài cũ chỉ khi user bảo (rule cũ: không sửa lại bài đã viết).
