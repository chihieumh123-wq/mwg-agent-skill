# mwg-agent-skill

Agent skills dùng lại được cho SEO và content ops, viết cho Claude Code và các
runtime tương thích (Codex, Antigravity, Gemini CLI).

Mỗi skill là một thư mục có `SKILL.md` (chỉ dẫn) và tuỳ chọn `scripts/`,
`references/`. Runtime đọc `SKILL.md` khi mô tả khớp với việc người dùng đang làm.

## Skill trong repo

| Skill | Làm gì | Cần gì |
| --- | --- | --- |
| [`onpage-cms-product-link-insert`](skills/onpage-cms-product-link-insert) | Chèn hàng loạt một câu kèm internal link vào đoạn văn có sẵn của bài sản phẩm trên CMS, splice trên string thô và verify byte-exact | Node (để chạy test), một tab CMS đã đăng nhập |
| [`batch-llm-skill`](skills/batch-llm-skill) | Đẩy CSV/JSONL qua batch API của OpenAI / Gemini để phân loại, trích xuất, tóm tắt — có ước tính chi phí và cổng xác nhận trước khi submit | Python, `OPENAI_API_KEY` hoặc `GEMINI_API_KEY` |
| [`image-seo-pipeline`](skills/image-seo-pipeline) | Nén ảnh, sinh alt text/metadata bằng Gemini, bắn EXIF, ghi CSV metadata | Python, ImageMagick (`magick`), `exiftool`, `GEMINI_API_KEY` |
| [`seo-keyword-research`](skills/seo-keyword-research) | Research keyword bằng Ahrefs API có cổng chi phí (mặc định chỉ ước lượng units, gọi thật khi `--approve`) + bộ lọc keep/review/drop theo dạng trang và intent (tách blog/review/SKU lạ/nhà bán lẻ/thiếu dấu) | `AHREFS_API_KEY` |
| [`seo-skill-sync`](skills/seo-skill-sync) | Đồng bộ skill một chiều từ surface canonical ra các surface khác và kiểm parity | Node |
| [`tgdd-bai-pr-bao-ngoai`](skills/tgdd-bai-pr-bao-ngoai) | Viết bài PR đăng báo (booking PR) giọng kể chuyện 800-1000 chữ, rồi giao ra một thư mục Drive có Google Doc rich text (ảnh inline, link click được) — kèm linter và một gate fact-check bắt buộc | Python, ImageMagick, `gws` CLI |
| [`seo-gsc-rank-check`](skills/seo-gsc-rank-check) | Lấy thứ hạng keyword từ Google Search Console, chọn URL tốt nhất theo impressions, ghi ngược vào Google Sheet bất kỳ (mọi cột là tham số CLI) | Python, `gws` CLI, MCP `google-search-console` |
| [`gsc-index-check`](skills/gsc-index-check) | Kiểm tra trạng thái index của URL qua Google Search Console URL Inspection, chỉ đọc | Project checker đã cài, quyền GSC chỉ đọc |
| [`gsc-request-indexing`](skills/gsc-request-indexing) | Gửi yêu cầu Google crawl lại URL qua giao diện Search Console, có bước xác nhận danh sách trước khi gửi | Project checker đã cài, Chrome đăng nhập GSC |
| [`content-html-optimizer`](skills/content-html-optimizer) | Tối ưu HTML bài viết: xếp ảnh vào đúng section, điền alt/title/caption, chèn internal link từ Google Sheet với chống trùng và chống cắt chữ | Python, `gws` CLI |
| [`image-ai-generate`](skills/image-ai-generate) | Sinh ảnh minh hoạ cho bài bằng OpenAI image API, dùng ảnh sản phẩm làm reference, resize và đóng logo | Python, `OPENAI_API_KEY` |
| [`tgdd-infobox-nganh-hang`](skills/tgdd-infobox-nganh-hang) | Viết/audit Infobox cho trang ngành hàng tổng | — |
| [`tgdd-infobox-nganh-hang-hang`](skills/tgdd-infobox-nganh-hang-hang) | Viết/audit Infobox cho trang ngành hàng + hãng | — |
| [`tgdd-infobox-nganh-hang-thuoc-tinh`](skills/tgdd-infobox-nganh-hang-thuoc-tinh) | Viết/audit Infobox cho trang ngành hàng + thuộc tính | — |
| [`tgdd-infobox-dong-san-pham`](skills/tgdd-infobox-dong-san-pham) | Viết/audit Infobox cho trang ngành hàng + dòng sản phẩm | — |
| [`tgdd-review-outline-infobox`](skills/tgdd-review-outline-infobox) | Chấm outline Infobox và so với outline đối thủ để tìm chỗ còn thiếu | — |
| [`content-cms-air-infobox`](skills/content-cms-air-infobox) | Đăng bài Infobox lên CMS, 2 mode: `--news` cho trang Filter/dòng (có thể tạo bài mới trả `newsId`) và `--brand` cho trang Hãng. Upload ảnh hàng loạt, ghi thân bài và verify byte-exact | Một tab CMS đã đăng nhập, Chrome DevTools MCP (hoặc tương đương) |
| [`onpage-cms-news-insert`](skills/onpage-cms-news-insert) | Chèn hàng loạt một câu kèm internal link (hoặc biên tập nội dung) vào bài Tin tức/Kinh nghiệm hay/Tekzone trên CMS, splice trên string thô, giữ nguyên taxonomy + trạng thái xuất bản, verify byte-exact | Một tab CMS đã đăng nhập |
| [`onpage-internal-link`](skills/onpage-internal-link) | Đề xuất chèn internal link vào bài Hỏi đáp/Game App hoặc Kinh nghiệm hay: crawl bài live, chọn đúng đoạn văn theo chủ đề (rải đều vị trí, không dồn cuối bài), viết câu mention tự nhiên, điền sheet WF đi link | Python (bs4), `gws` CLI, 1-2 Google Sheet của riêng bạn |
| [`tgdd-top-product-article`](skills/tgdd-top-product-article) | Viết mới/renew bài "Top N sản phẩm": verify sản phẩm còn kinh doanh bằng script (không cần mở browser), dựng source HTML chuẩn CMS, chèn shortcode `[sosanh]`/`[Product_Promotion]`, validate 21 check trước khi giao | Python (bs4), dùng chung với `content-html-optimizer` |
| [`onpage-mdm-khai-bao`](skills/onpage-mdm-khai-bao) | Khai báo SEO trên hệ MDM/PIM (thay CMS) cho trang Danh mục, Hãng, Filter/Dòng Filter, Hãng+Filter: tra URL web ra bản ghi, ghi Title/Meta/Keyword/Infobox có khoá rowVersion + backup + đọc lại so từng byte, khôi phục, upload ảnh CDN, chờ web core mới hiện đúng. Sản phẩm PIM: ghi Title/Meta, bài viết (`product_articles`) và đặc điểm nổi bật (`key_features`) — thay cả bài hoặc sửa từng chỗ theo ops có guard sha256; `batch` nhiều việc một kết nối; token cất trong Keychain macOS nên lệnh sau không cần mở tab | Node 18+, `chrome-devtools-mcp`, một tab MDM đã đăng nhập, file config (`MDM_CONFIG`) |
| [`fable-thinking`](skills/fable-thinking) | Quy trình suy luận đa giả định (distilled từ Claude Fable 5): Floor check tránh câu trả lời bẫy, Constraint Loop kiểm soát ràng buộc bề mặt, kiểm chứng bằng chứng trước khi kết luận | — |
| [`chrome-profile`](skills/chrome-profile) | Mở URL trên đúng profile Google Chrome thật (cookies, session, account) qua CLI `chrome-profile` + gắn token định vị tab chính xác cho Chrome DevTools MCP (kèm hướng dẫn cấu hình DevTools Hub để Allow 1 lần dùng cả ngày) | Python 3.9+, Google Chrome, Chrome DevTools MCP |
| [`blog-hoi-dap-tron-goi`](skills/blog-hoi-dap-tron-goi) | Quy trình trọn gói 1 bài blog Hỏi Đáp từ dòng sheet tới CMS: viết (qua `viet-blog`), làm hình (thumb 560x292 + ảnh bài 1200x675, kiểm rule), upload ảnh CDN, chèn ảnh đúng đoạn với alt/caption, up bài, hẹn giờ xuất bản, ghi sheet. **Đọc [SETUP.md](skills/blog-hoi-dap-tron-goi/SETUP.md) trước** | Node 18+, Python 3.9+ (Pillow), `gws` CLI, `chrome-profile`, một profile Chrome đã đăng nhập CMS, 4 skill đi kèm bên dưới |
| [`viet-blog`](skills/viet-blog) | Viết blog Hỏi Đáp bằng AI agent: research SERP/gợi ý/đối thủ, dữ liệu sản phẩm từ trang bán hàng, outline theo 13 dạng bài, viết (giao Antigravity được), QC số liệu, chèn link + shortcode, dựng HTML, lint (có lint nhắc brand), kiểm link chết, xuất Google Doc. Kèm `khoi_tao_sheet.py` tạo sheet mẫu | Python 3.9+, `gws` CLI, `HOI_DAP_SHEET_ID` |
| [`cms-faq-tao-bai`](skills/cms-faq-tao-bai) | Tạo bài Hỏi Đáp mới trên CMS TGDĐ (dry run trước, mỗi bài POST 1 lần), xuất bản, hẹn giờ 02:00, đổi thumb/trạng thái, cập nhật nội dung từ bản live, đọc lại verify | Node 18+, `chrome-profile`, `CMS_CHROME_PROFILE`, skill `onpage-mdm-khai-bao` (lấy `cms-cli-mcp.mjs`) |
| [`cms-topzone-tao-bai`](skills/cms-topzone-tao-bai) | Như `cms-faq-tao-bai` cho CMS V2 TopZone (`siteId=16`): thumb 1200x628, mục Mua TopZone, nút CTA, shortcode `[product]` | Như trên |
| [`chen-link-noi-bo`](skills/chen-link-noi-bo) | Rule + script quét internal link cho bài TGDĐ/ĐMX/TopZone theo 5 loại keyword và link tối thiểu từng dạng bài; chống trùng URL/anchor | Python 3.9+, `gws` CLI, `SHEET_ALL_KW_ID` |
| [`seo-datastudio-dashboard`](skills/seo-datastudio-dashboard) | Đọc, dựng và sửa dashboard Data Studio / Looker Studio bằng RPC nội bộ chạy trong tab Chrome đã đăng nhập: thêm/sửa/xoá page, chart, text, filter, blend, calculated field, đổi theme; dry-run trước khi ghi, tự tạo revision checkpoint và khôi phục được; render kiểm chart lỗi + screenshot. Kèm chuẩn thiết kế dashboard | Node 18+, `chrome-devtools-mcp`, skill `chrome-profile`, profile Chrome có quyền sửa report (`--profile` hoặc `DATASTUDIO_CHROME_PROFILE`) |


4 skill `tgdd-infobox-*` và `tgdd-review-outline-infobox` là **bộ rule biên tập**,
không có script — chúng viết cho ngành hàng và văn phong thương mại điện tử Việt
Nam, dùng được nhất khi bạn sửa lại cho site của mình.

### Biến môi trường

Vài skill đọc Google Sheet của riêng bạn. Không có ID nào hardcode; script dừng
kèm thông báo nếu thiếu biến:

| Biến | Skill dùng |
| --- | --- |
| `SHEET_ALL_KW_ID`, `SHEET_BAI_TIN_ID` | `content-html-optimizer`, `tgdd-top-product-article` (box "Xem thêm" dùng chung `SHEET_BAI_TIN_ID`) |
| `SPREADSHEET_ID` | `image-ai-generate` |
| `GWS_EXPECTED_ACCOUNT` | `tgdd-bai-pr-bao-ngoai` (chốt chặn ghi nhầm tài khoản; bỏ trống thì bỏ qua kiểm) |
| `SHEET_GAME_APP_ID`, `SHEET_KINH_NGHIEM_HAY_ID` | `onpage-internal-link` (2 hệ sheet WF đi link) |
| `SHEET_SHORTCODE_MAU_ID` | `tgdd-top-product-article` (sheet mẫu `categoryid`/`properties` cho shortcode `[sosanh]`) |
| `MDM_CONFIG` | `onpage-mdm-khai-bao` (đường dẫn file JSON theo mẫu `config.example.json`; hoặc truyền `--config`) |
| `MDM_TOKEN_CACHE` | `onpage-mdm-khai-bao` (`on` mặc định trên macOS: cất token MDM trong Keychain để lệnh sau không cần tab; `off` để tắt) |
| `HOI_DAP_SHEET_ID`, `SHORTCODE_SHEET_ID`, `HOI_DAP_DRIVE_FOLDER_ID` | `viet-blog`, `blog-hoi-dap-tron-goi` (sheet "Hỏi Đáp n8n", sheet shortcode, thư mục Drive chứa Doc; tạo sheet mẫu bằng `viet-blog/scripts/khoi_tao_sheet.py`) |
| `CMS_CHROME_PROFILE`, `CMS_CHROME_PROFILE_TOPZONE` | `cms-faq-tao-bai`, `cms-topzone-tao-bai`, `blog-hoi-dap-tron-goi` (key profile `chrome-profile` đã đăng nhập CMS) |
| `SHEET_ALL_KW_ID`, `SHEET_ALL_KW_TOPZONE_ID` | `chen-link-noi-bo` (kho kw TGDĐ/ĐMX và TopZone) |
| `BLOG_ROOT`, `ANTI_WORKSPACE`, `ANTI_RUN`, `VIET_BLOG_CACHE` | `viet-blog`, `cms-*-tao-bai` (thư mục làm việc, Antigravity, cache; đều có mặc định) |
| `DATASTUDIO_CHROME_PROFILE` | `seo-datastudio-dashboard` (key profile của `chrome-profile`; hoặc truyền `--profile`) |

## Cài

Chép thư mục skill bạn cần vào surface của runtime:

```bash
git clone https://github.com/<owner>/mwg-agent-skill.git
cp -R mwg-agent-skill/skills/onpage-cms-product-link-insert ~/.claude/skills/
```

Hoặc cài vào scope dự án: `<repo>/.claude/skills/`.

### Dùng cho nhiều surface cùng lúc

`seo-skill-sync` fan-out từ một bản canonical ra các surface còn lại, nên bạn chỉ
sửa một chỗ:

```bash
cp -R mwg-agent-skill/skills/* .claude/skills/
node .claude/skills/seo-skill-sync/scripts/sync-skill-surfaces.mjs --apply
node .claude/skills/seo-skill-sync/scripts/sync-skill-surfaces.mjs --check
```

Mặc định ghi ra `.codex/skills`, `.agents/skills`, `.gemini/skills`. Đổi bằng
`--canonical`, `--targets`, `--prefixes`, `--root`. Script **chỉ ghi một chiều** —
không có đường sync ngược về canonical, và không bao giờ xoá file (`ORPHAN` chỉ
được báo).

## Trước khi chạy skill ghi dữ liệu

`onpage-cms-product-link-insert`, `content-cms-air-infobox` và `onpage-mdm-khai-bao`
**sửa nội dung production**. Cả ba được viết với giả định là hệ đích không rollback được, nên có
sẵn các cổng chặn: backup từng bài trước khi ghi, bộ bất biến phải xanh hết mới
POST, đọc lại sát trước khi ghi để không đè người đang sửa tay, và verify
byte-exact sau khi ghi.

Đừng bỏ các cổng đó để chạy nhanh hơn. Chạy `dryRun: true` (skill MDM: bỏ `--live`) một lô nhỏ trước.

Riêng `content-cms-air-infobox` còn upload ảnh lên CDN, và **ảnh đã lên CDN thì
không xoá được** — tên file trùng là mất vĩnh viễn tên đó. Kiểm HEAD 404 trước
khi upload, và đặt tên file có tiền tố từ khoá của bài.

Ba skill này mô tả hợp đồng endpoint của hệ CMS/MDM nội bộ. Chúng **không** chứa
credential và không tự đăng nhập — phải có sẵn một phiên đăng nhập hợp lệ do bạn
tự mở.

## Cấu hình

Không skill nào chứa key. Tất cả đọc từ biến môi trường:

| Biến | Dùng bởi |
| --- | --- |
| `OPENAI_API_KEY` | `batch-llm-skill` |
| `GEMINI_API_KEY` | `batch-llm-skill`, `image-seo-pipeline` |
| `AHREFS_API_KEY` | `seo-keyword-research` |

## Test

```bash
node skills/onpage-cms-product-link-insert/scripts/test-runner-logic.mjs
```

19 assert cho phần logic thuần: định vị đoạn qua markup lồng và HTML entity, bọc
anchor chồng tiền tố, 6 bất biến, và 3 nhánh chẩn đoán khi không chèn được.
Không cần mạng, không đụng CMS.

## Ghi chú về ngôn ngữ

Phần lớn `SKILL.md` viết bằng tiếng Việt vì đó là ngôn ngữ làm việc của nhóm tạo
ra chúng. Script và tên biến bằng tiếng Anh.

## License

MIT — xem [LICENSE](LICENSE).
