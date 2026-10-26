### Bước 1: Research (Semantic SEO + phân tích đối thủ)
Dựa trên TỪ KHÓA CHÍNH, KẾT QUẢ GOOGLE, NỘI DUNG BÀI THAM KHẢO và DỮ LIỆU TGDĐ, làm bộ dữ liệu nền cho outline. Chưa lên outline, chưa viết bài.
Phần A - Semantic (SMT): xác định các yếu tố ngữ nghĩa giúp bài bao phủ chủ đề toàn diện, đúng cách Google hiểu chủ đề. Bám từ khóa và ngữ cảnh TGDĐ, không đưa website/cửa hàng đối thủ làm thực thể.
Quy tắc SMT:
- Chủ thể là đúng thứ từ khóa nói tới. Từ khóa về chip, linh kiện, công nghệ thì mọi mục SMT, intent, content_goal, chủ đề bỏ sót xoay quanh linh kiện đó (hiệu năng, kiến trúc, tiến trình, AI, nhiệt, tiết kiệm điện), máy dùng linh kiện chỉ là thực thể liên quan. Không đưa pin, sạc, camera, thiết kế, chọn mua điện thoại vào trừ khi do linh kiện quyết định.
- holonyms: khái niệm cha bao trùm chủ thể (VD chip A20 Pro → SoC di động, chip Apple A-series, vi xử lý điện thoại), KHÔNG phải sản phẩm dùng chủ thể.
- synonyms: tên gọi khác của CHÍNH chủ thể (VD Apple A20 Pro, chip iPhone 18 Pro), không lặp long_tail.
- long_tail: cụm người dùng thật sự gõ, đúng chủ thể.
- lsi_entities: chỉ thực thể có trong nguồn và đúng là thành phần/đối tượng liên quan trực tiếp (không đưa modem, linh kiện khác nếu không thuộc chủ thể).
- eav, triples: giá trị số phải có trong du_kien (có URL nguồn); chưa có nguồn thì không ghi số.
- KHÔNG đưa giá bán, chênh lệch giá, khuyến mãi vào bất kỳ mục nào, trừ khi từ khóa chính hoặc từ khóa phụ chứa "giá" (VD "giá đập hộp", "bảng giá", "giá bao nhiêu"): khi đó thu thập giá có nguồn rõ ràng vào du_kien (ghi rõ đơn vị tiền và nước/thị trường nếu là giá nước ngoài).
- paa: KHÔNG tự nghĩ câu hỏi. Chỉ chọn từ truy vấn thật ở mục People Also Ask, Tìm kiếm liên quan, Gợi ý tìm kiếm Google, ưu tiên truy vấn đúng chủ thể từ khóa và mỗi câu một nhu cầu khác nhau (VD kích thước, cân nặng, pin, camera, hiệu năng). Truy vấn tiếng Anh thì dịch ý sang tiếng Việt (VD "iphone 18 pro max vs iphone 13 pro max size" → "iPhone 18 Pro Max và iPhone 13 Pro Max chênh nhau bao nhiêu về kích thước?"). Bỏ truy vấn về màu sắc, hỏi giá, nhà mạng, tên cửa hàng, ngôn ngữ khác, truy vấn trùng ý H3 chính hoặc nguồn không có dữ liệu để trả lời. Không có truy vấn phù hợp thì paa = []. Có SẢN PHẨM CẦN PUSH thì paa ưu tiên truy vấn về sản phẩm đó: ít nhất một nửa số câu (tối thiểu 1 câu) hỏi về sản phẩm push. Truy vấn tiếng Anh về sản phẩm push (VD "poco c95 pro 5g", "poco c95 pro antutu") vẫn dùng được, dịch thành câu hỏi tiếng Việt, miễn nguồn có dữ liệu trả lời. Bài so sánh thì các câu còn lại về sản phẩm kia hoặc so sánh trực tiếp hai máy.
Phần B - Phân tích: mục tiêu bài, đối tượng, search intent, cấu trúc và độ sâu từng bài top (gọi "Bài 1", "Bài 2"..., không ghi tên website), chủ đề cốt lõi bài top đều có, chủ đề họ bỏ sót hoặc làm sơ sài, cơ hội để bài TGDĐ tốt hơn (bảng so sánh, số liệu có nguồn hãng/benchmark, giải thích thuật ngữ dễ hiểu, tư vấn theo nhu cầu sử dụng).
Sản phẩm mới: bài tham khảo trong top Google thường nói về máy khác. Vẫn khai thác các bài top đó để lấy cấu trúc bài, các nhóm thông số họ đối chiếu, chủ đề và câu hỏi khách quan tâm (điền doi_thu như bình thường), tuyệt đối không lấy số liệu của máy khác thay cho số liệu của sản phẩm cần viết. Số liệu của từng sản phẩm chỉ lấy từ DỮ LIỆU TGDĐ, NGUỒN UY TÍN và mục THÔNG SỐ TRA THÊM BẰNG PERPLEXITY (nếu có; chỉ dùng dòng có nguồn trang hãng hoặc trang công nghệ uy tín, thông số nào các nguồn mâu thuẫn thì dùng trang hãng VN trước và nêu trong chu_de_bo_sot). du_kien gom thông số từng sản phẩm theo nhóm (thiết kế, màn hình, hiệu năng, camera, pin, kết nối...), mỗi mục ghi đủ giá trị của tất cả sản phẩm được so sánh kèm nguồn, tối đa 30 mục. Khi không có bài tham khảo nào: doi_thu = [], core_topics và content_goal lấy từ ý định tìm kiếm và các nhóm thông số.
Phần C - Dữ kiện: số liệu, dữ kiện cụ thể kèm URL nguồn. Thứ tự ưu tiên: NGUỒN UY TÍN [TRANG CHÍNH THỨC CỦA HÃNG] > NGUỒN UY TÍN [TRANG CÔNG NGHỆ NƯỚC NGOÀI] > bài tham khảo. Số liệu lệch nhau thì lấy theo thứ tự ưu tiên này. Giá, phiên bản bán tại Việt Nam vẫn theo DỮ LIỆU TGDĐ. Bỏ tin đồn, rò rỉ. Dữ kiện mâu thuẫn với DỮ LIỆU TGDĐ thì theo DỮ LIỆU TGDĐ và ghi vào luu_y.
Trả về JSON đúng schema, mỗi mục là chuỗi ngắn (tối đa 25 từ):
{
 "smt": {
  "holonyms": ["3-5 khái niệm bao trùm"],
  "synonyms": ["3-5 cách gọi khác của chủ đề"],
  "long_tail": ["5 từ khóa dài người dùng hay tìm"],
  "semantic_keywords": ["5-8 từ khóa ngữ nghĩa, thuật ngữ"],
  "lsi_entities": ["5-8 thực thể: hãng, công nghệ, sản phẩm, tổ chức"],
  "root_attributes": ["3 thuộc tính mọi bài cùng chủ đề phải có"],
  "rare_attributes": ["3 thuộc tính ít bài nói nhưng có giá trị"],
  "unique_attributes": ["3 điểm riêng giúp bài TGDĐ khác biệt"],
  "eav": ["5-7 bộ Thực thể - Thuộc tính - Giá trị, giá trị lấy từ dữ liệu"],
  "triples": ["5-7 bộ Chủ thể - Vị ngữ - Đối tượng"]
 },
 "muc_tieu": "mục đích chính của bài",
 "doi_tuong": ["nhóm người đọc, kèm nhu cầu riêng của từng nhóm"],
 "search_intent": "loại intent chính + 1 câu: người tìm muốn biết/làm gì nhất",
 "intent_phu": ["3-5 ý định phụ cụ thể"],
 "content_goal": ["tối đa 5 vấn đề bài phải giải quyết triệt để"],
 "doi_thu": [{"bai": "Bài 1", "url": "", "cau_truc": "các mục chính", "uu_diem": "", "nhuoc_diem": ""}],
 "core_topics": [""],
 "chu_de_bo_sot": [""],
 "co_hoi": [""],
 "paa": ["2-5 câu hỏi, mỗi câu chuyển từ 1 truy vấn có thật trong People Also Ask / Tìm kiếm liên quan / Gợi ý tìm kiếm Google, giữ đúng ý truy vấn, viết thành câu hỏi tiếng Việt tự nhiên"],
 "du_kien": [{"noi_dung": "", "nguon": "url"}],
 "luu_y": "thông tin dễ sai, đã cũ hoặc mâu thuẫn"
}
du_kien tối đa 20 mục, không lặp ý. Ưu tiên dữ kiện có số: điểm benchmark (ghi tên bài test, điểm từng sản phẩm, % chênh lệch), xung nhịp, số lõi, tiến trình, băng thông, kết quả test thực tế (FPS game, nhiệt độ, thời lượng pin). Mỗi mục ghi đủ số của các sản phẩm được so sánh.