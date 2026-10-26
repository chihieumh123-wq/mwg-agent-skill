---
name: viet-blog
description: >
  Viết bài blog Hỏi Đáp TGDĐ (thegioididong.com/hoi-dap) hoàn chỉnh bằng AI agent (Claude Code, Codex, Antigravity), cùng chuẩn với luồng
  n8n "SEO TGDĐ - Content Blog Auto": research SERP + Google gợi ý + đối thủ + dữ liệu TGDĐ (giá,
  thông số, ID) + nguồn uy tín, lên outline theo template 13 dạng bài và prompt trong tab Prompt,
  viết bài, tự kiểm chứng số liệu, chèn link nội bộ đúng ngữ cảnh, shortcode, mục Mua chuẩn, FAQ,
  Xem thêm, dựng HTML dán CMS, lint, kiểm link chết, xuất Google Doc và ghi kết quả vào tab
  skill_hoi_dap của sheet "Hỏi Đáp n8n".
user-invocable: true
when_to_use: >
  Khi user bảo viết bài Hỏi Đáp/blog TGDĐ theo keyword, chạy dòng (hoặc các dòng Status=Run) trong tab
  skill_hoi_dap, viết lại bài Hỏi Đáp, hoặc gõ /viet-blog. Không dùng cho bài PR báo
  (viet-bao-PR), bài sản phẩm/infobox tĩnh, hay để sửa luồng n8n.
---

# Viết blog Hỏi Đáp TGDĐ

Skill = luồng n8n Hỏi Đáp chạy bằng AI agent. Agent điều phối (Claude/Codex) làm research, outline, QC, đặt link, xuất; bước VIẾT giao cho Antigravity (bước 5), script làm phần cơ học (tải dữ liệu, parse TGDĐ, dựng HTML, lint, kiểm link, xuất).

- Sheet: `$HOI_DAP_SHEET_ID` (tạo mới bằng `python3 $S/khoi_tao_sheet.py`, chi tiết cấu trúc ở `blog-hoi-dap-tron-goi/SETUP.md`), **tab `skill_hoi_dap`** (cùng cột với tab main của n8n,
  không có nút Chạy). A-F biên tập điền: Keyword | KW phụ | Dạng bài | URL SP cần push | Link tham khảo | Ghi chú.
  G Status (Run/Doing/Done/Done - thiếu link SP/Lỗi), H-P output.
  **Tab `skill_hoi_dap` có cột A `Site` (dropdown TGDĐ/TopZone, trống = TGDĐ); mọi cột chữ cái dịch +1** (Keyword=B ... Status=H, Link CMS=R, ID=S, Ngày XB=T, Link air=U, Trạng thái=V, Note CMS=W). Luôn tra cột theo tên header; `du_lieu.py dong` trả thêm `site`. Site=TopZone thì viết theo phong cách TopZone (không tô màu chữ/bảng, chỉ link topzone.vn, hotline 1900 9696 42); lưu ý cms-faq-tao-bai hiện chỉ up CMS TGDĐ.
- gws dùng account đang đăng nhập (`gws auth status`); muốn account khác đặt `GOOGLE_WORKSPACE_CLI_CONFIG_DIR`. Lỗi 403/404: kiểm quyền share của sheet/Doc với account đó.
- Scripts ở `<skills>/viet-blog/scripts/` (`<skills>` = thư mục cài skill, thường `~/.claude/skills`; gọi bằng đường dẫn đầy đủ, ký hiệu `$S` dưới đây).
- **Dùng chung cho mọi agent**: cài 1 bản canonical (vd `~/.claude/skills/viet-blog`) rồi symlink sang thư mục skill của agent khác
  (`~/.codex/skills`, `~/.gemini/config/skills`, `~/.agents/skills`...), sửa 1 chỗ là tất cả cùng dùng. Tên tool trong
  skill theo Claude Code, agent khác dùng tool tương đương: WebSearch = công cụ tìm web của agent; WebFetch = đọc URL
  (hoặc `curl -s https://r.jina.ai/<url>`); subagent = luồng/agent con của agent đó, không có thì chạy tuần tự từng dòng.
- Thư mục làm việc mỗi bài: `$BLOG_ROOT/<slug-keyword>/` (`BLOG_ROOT` mặc định `~/blog-hoi-dap`) (lưu research, outline, bài, html).

| File | Đọc khi nào |
|---|---|
| Prompt trong cache `~/.cache/viet-blog/prompts/*.md` (tải từ tab Prompt) | Bước 3-6, nguồn rule chính, team sửa trên sheet là skill dùng bản mới |
| `references/bai-hoc-da-chot.md` | **Luôn đọc** trước bước 4 và trước khi tự soát |
| `references/dinh-dang-markdown.md` | Trước khi viết bai.md / bai.json, khi làm shortcode |
| `references/chen-link.md` | Bước 7 |
| `references/rule-nhac-brand.md` | Bước 4-5 và 9: nhắc brand TGDĐ/TopZone trong bài (nhóm A heading Mua, nhóm B 1 đoạn), số liệu Brand Radar 26/10/2026 |
| `references/guideline-hoi-dap.md` | Khi cần rule gốc của team (dấu câu, in đậm, đơn vị, outline từng dạng) |
| `references/prompt-snapshot/` | Chỉ khi không tải được tab Prompt |

## Ưu tiên khi rule lệch nhau
Góp ý đã chốt (`bai-hoc-da-chot.md`) > Prompt trên sheet > guideline gốc. Prompt viết cho LLM n8n nhận JSON:
áp dụng đúng **nội dung rule**, còn định dạng đầu vào/đầu ra thì theo skill này. Các tên trong prompt như
"DỮ LIỆU TGDĐ", "du_kien", "SẢN PHẨM CẦN PUSH", "paa" ứng với dữ liệu agent tự thu ở bước 2-3.

## Site TopZone
Dòng có cột A Site = TopZone: làm theo skill `cms-topzone-tao-bai` (dựng HTML TopZone, link `scan_links.py --site topzone`, ảnh `--site topzone`, up CMS V2). Văn phong/research/QC giữ nguyên.

## Quy trình

### 0. Nhận việc
- "chạy dòng 5" / "dòng 5-8" / "chạy các dòng Run": `python3 $S/du_lieu.py dong <n>` lấy input. Không nói dòng thì
  đọc tab, lấy các dòng Status=Run.
- User đưa keyword thẳng (không có dòng): ghi vào dòng trống đầu tiên của tab `skill_hoi_dap` (A-F) rồi chạy như trên,
  để kết quả có chỗ lưu. Thiếu Dạng bài thì tự chọn theo search intent top SERP và nói rõ đã chọn gì. Keyword hỏi 1 khía cạnh của 1 sản phẩm/dòng
  ("kích thước iPhone Duo", "iPhone Duo có mấy camera", "vỏ ... làm bằng gì", "... bao nhiêu gb", "... có gì mới",
  "tính năng ...") là dạng **Cung cấp thông tin**, không phải Giới thiệu sản phẩm (không viết tổng quan/đánh giá toàn diện).
- Đặt Status = Doing: `python3 $S/du_lieu.py status <n> Doing`.
- **Nhiều dòng**: mỗi dòng 1 subagent (general-purpose) chạy song song, prompt gồm số dòng + "dùng skill
  viet-blog, làm đủ bước 1-10, trả về link Doc + lint còn lại". Tối đa 4 bài cùng lúc.

### 1. Tải dữ liệu
`python3 $S/du_lieu.py tai` (cache 12h; user vừa sửa Prompt/kho link thì thêm `--force`). Đọc các prompt:
`system_chung`, `prompt_b1_research`, `prompt_b2_outline`, `prompt_b3_toi_uu`, `outline_<dạng bài không dấu>`,
`prompt_viet`, `prompt_qc`, `prompt_link`; `prompt_thong_so` khi SP thiếu thông số. Config (`config.json`):
`nguon_uy_tin`, `trang_hang` (prompt), `link_bao_hanh`, `ty_le_kw`.

### 2. Research
1. **SERP**: WebSearch keyword (tiếng Việt). Chọn 3 bài đối thủ đúng intent (bỏ thegioididong.com, YouTube,
   Facebook, sàn TMĐT, trang danh mục). Đọc bằng WebFetch (lỗi thì `curl -s https://r.jina.ai/<url>`). Cộng
   Link tham khảo của biên tập (cột E, đọc hết, ưu tiên khai thác ý, không chép câu).
2. **Truy vấn thật**: `python3 $S/goi_y.py "<keyword>" ["<tên SP push> có" ...]` → nguồn FAQ/PAA. SP push chỉ có gợi ý
   tiếng Anh thì thêm truy vấn tên SP + "có", "giá", "antutu"... để có đủ câu hỏi về SP push.
3. **Dữ liệu TGDĐ**:
   - Có URL push: `python3 $S/tgdd.py lay <url...> -o tgdd.json`.
   - Bài So sánh/Top mà thiếu URL máy còn lại, hoặc không có URL: `python3 $S/tgdd.py tim "<tên máy>"` → khớp trọn tên
     ("iphone 13" không nhận "iphone 13 pro max"), rồi `lay`. Máy ngưng bán/không có trang: ghi Cảnh báo, không lấy máy khác thay.
   - Bài Top không có danh sách: lấy SP từ heading các bài đối thủ, đối chiếu kho (bỏ NKD), tối đa 8.
   - Lấy thêm trang ngành/hãng/dòng filter (`tim` trả URL) để có danh sách SP, `info.brandId`, cate cho shortcode.
4. **Nguồn uy tín**: trang hãng theo `trang_hang` (có trang VN thì chỉ dùng VN) tối đa 2, trang công nghệ trong
   `nguon_uy_tin` tối đa 3 (WebSearch `site:<domain> <SP>`). SP mới thiếu thông số: tra thêm theo `prompt_thong_so`.
   Lưu mọi dữ kiện kèm nguồn vào `research.json` (`du_kien: [{noi_dung, nguon}]`).
5. Ghi danh sách link đã đọc (SERP/đối thủ/nguồn hãng/nguồn công nghệ, link không đọc được thì ghi "KHÔNG đọc được")
   để điền cột "Link SERP research".

### 3. B1 Research
Theo `prompt_b1_research`: SMT (holonym, synonym, long-tail, semantic, LSI entity, root/rare/unique attribute, EAV,
triple), intent, phân tích đối thủ, chủ đề đối thủ bỏ sót, paa (truy vấn thật, ưu tiên SP push), du_kien có nguồn.
Lưu `research.json`.

### 4. B2 Outline → B3 tự tối ưu
Đọc `bai-hoc-da-chot.md`. Lên outline theo `outline_<dạng>` + `prompt_b2_outline` (mỗi heading có CORE/SUPPLEMENTARY,
hướng dẫn viết, SMT cần phủ, dạng trình bày). Rồi tự duyệt đúng checklist `prompt_b3_toi_uu`, sửa ngay.
Chốt Title (≤ 65 ký tự), Meta (140-160 ký tự, kết "Click xem ngay!"), ý sapo. Lưu `outline.md` (dạng như cột Outline
của n8n: Title/Meta/Sapo, các H3/H4 kèm [CORE]/[SUPPLEMENTARY], hướng dẫn, SMT, cuối là "--- Bước tối ưu đã sửa ---").
Ghi nhanh Title/Meta/Outline lên sheet ngay (cột H, I, K) qua `du_lieu.py ghi` để biên tập theo dõi được.

### 5. Viết bai.md: GIAO CHO ANTIGRAVITY (mặc định)
Agent điều phối không tự viết. Chuẩn bị đủ `outline.md`, `research.json` (du_kien có nguồn, paa), `tgdd.json`, `bai.json`
(keyword, kw_phu, dang_bai, urls_push) rồi chạy (chạy nền, 3-10 phút):
`python3 $S/giao_anti.py <thư mục bài> --model pro`
- Script gói brief (`brief_viet.md`: bai-hoc-da-chot + system_chung + prompt_viet + quy ước markdown + outline + dữ kiện),
  gọi Antigravity app mode qua `$ANTI_RUN` (mặc định `~/mwg-agent-crew/scripts/anti-run.mjs`; workspace `$ANTI_WORKSPACE`, mặc định `$BLOG_ROOT`, phải gắn
  project trong app), chờ Anti ghi `bai.md` + `anti_report.md` ("Status: done").
- `ANTI_OK` → sang bước 6. `ANTI_LOI` (app chưa mở, hết quota, timeout) → agent điều phối tự viết theo `prompt_viet`
  + `system_chung` + `bai-hoc-da-chot.md`, ghi Cảnh báo "Antigravity lỗi, Claude viết thay: <lý do>".
- Thư mục bài phải nằm trong `$ANTI_WORKSPACE` (thư mục khác chưa gắn project trong app Antigravity). Không có Antigravity (thiếu `anti-run.mjs`) thì script báo `ANTI_LOI` và agent điều phối tự viết bước 5.
- Agent đang chạy skill CHÍNH LÀ Antigravity thì bỏ qua script, tự viết.

### 5b. Duyệt văn phong bài Anti viết
Đọc toàn bộ bai.md như biên tập viên, đối chiếu `bai-hoc-da-chot.md` và outline: đủ mục, đúng thứ tự, H3 8-15 tiếng, H4 ≤ ~50 ký tự,
câu đủ chủ ngữ, không câu cụt/rào đón/sáo rỗng, không suy diễn ngoài nguồn. Lỗi nhỏ (vài câu) thì tự sửa thẳng.
Lỗi nhiều/hệ thống (lệch outline, văn phong sai cả bài) thì trả lại:
`python3 $S/giao_anti.py <thư mục bài> --model pro --sua "<góp ý cụ thể, dẫn câu sai>"` (tối đa 2 vòng, sau đó tự sửa).

### 6. QC kiểm chứng
Theo `prompt_qc`, nhưng tự làm kỹ hơn: rà TỪNG câu có số, thông số, giá, ngày, tên tính năng; đối chiếu `tgdd.json`
và `du_kien`. Sai/không nguồn thì sửa hoặc bỏ câu. Thông số mâu thuẫn giữa nguồn mà không phân xử được → hỏi user.
Ghi kết quả vào biến QC: "PASSED - đã kiểm N dữ kiện" hoặc danh sách câu đã sửa (câu gốc → câu sửa, lý do, nguồn).

### 7. Chèn link + shortcode
`python3 $S/tim_link.py quet bai.md bai.json` → đọc ứng viên, tầng bắt buộc còn thiếu, dòng filter cần có, thuật
ngữ, bài liên quan. Sapo không link. Đặt link tầng bắt buộc (ngành hàng, hãng, dòng filter, SP) trước, ở thân bài gần đầu chỗ dễ thấy (không chỉ trong FAQ/câu kết), rồi tới link thuật ngữ, theo `chen-link.md`; `quet` phải ra mọi tầng `da_chen: true` và không có lỗi "link bắt buộc chỉ nằm trong FAQ" (được sửa câu cho tự nhiên, không cắt từ).
Thuật ngữ chưa khớp: `tim_link.py tim "<cụm>" --loai thuat_ngu`. Chọn đúng 3 Xem thêm, 0-2 Đọc thêm. Làm `sc_dau`,
`sc_cuoi` (và shortcode bài Top) theo `dinh-dang-markdown.md`. Điền `bai.json`. Chạy lại `quet` để chắc
`loi_link_hien_co` rỗng.

### 8. Dựng HTML + lint
`python3 $S/dung_html.py bai.md bai.json -o bai.html`. Sửa bai.md/bai.json cho đến khi LINT sạch. Lint nào cố ý
giữ (VD KW chính hơi thấp vì keyword dài khó chèn tự nhiên) thì ghi lý do vào Cảnh báo.
Rồi `python3 $S/kiem_link.py bai.html --go` (gỡ link chết, ghi vào Cảnh báo "Link lỗi đã gỡ, báo team SEO check").

### 9. Tự soát cuối
Đọc lại toàn bài như người đọc, trả lời 4 câu của guideline: làm theo được không, có đúng không, có hơn đối thủ không,
có dám để người nhà làm theo không. Kiểm thêm: FAQ 2-4 câu, ≥ một nửa về SP push; H3 8-15 tiếng, H4 không số và ≤ ~50 ký tự; anchor link ưu tiên KW volume cao, đúng chính tả;
mọi ngày cập nhật = hôm nay; rà các câu tới 14 tiếng (kể cả câu chính bạn sửa lúc QC): câu chuyển ý cụt/chủ ngữ trừu tượng chỉ báo chủ đề, không có số ("Khác biệt lớn hơn là X.", "Pin là điểm khác lớn nhất giữa hai máy.") hay câu cụt nối đuôi ("B không có tính năng này.") thì gộp vào câu có thông tin bên cạnh; không tin đồn; giá khớp trang TGDĐ. Sửa thì dựng lại HTML.

### 10. Xuất
1. `python3 $S/xuat.py doc bai.html "<keyword>"` → link Doc (Doc chỉ chứa HTML bài).
2. Viết `ket_qua.json` rồi `python3 $S/du_lieu.py ghi <n> ket_qua.json`:
   `Status` (Done; thiếu link tầng SP/ngành do kho không có thì "Done - thiếu link SP"; lỗi thì "Lỗi"), `Title`, `Meta`,
   `Link SERP research`, `Outline` (nội dung outline.md + SMT), `Docs HTML` (link Doc), `Link đã chèn` (mỗi dòng
   "anchor | loại | url", thêm shortcode đầu/cuối, Xem thêm, nguồn đã dùng; bài không in Nguồn tham khảo), `Cảnh báo` (dữ liệu thiếu, link gỡ,
   lint cố ý giữ), `QC`.
3. Báo user: link Doc, tóm tắt bài (số H3, số link, FAQ), các cảnh báo cần xử lý tay.

## Sửa bài đã viết
User góp ý bài đã xuất: sửa trong thư mục bài (bai.md/bai.json), đổi mọi ngày cập nhật sang hôm nay, chạy lại bước
8-10 (tạo Doc mới, ghi đè dòng). Góp ý mang tính nguyên tắc thì đề nghị thêm vào `bai-hoc-da-chot.md` (và tab Prompt
nếu user muốn luồng n8n cũng theo).
