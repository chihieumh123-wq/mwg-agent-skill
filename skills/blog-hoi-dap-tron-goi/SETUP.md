# Cài đặt và chạy thử: Blog Hỏi Đáp trọn gói

Quy trình viết bài Hỏi Đáp từ keyword tới lúc lên CMS (TGDĐ hoặc TopZone), gồm 5 skill chạy cùng nhau.
Làm theo thứ tự dưới đây, cuối cùng chạy `scripts/kiem_moi_truong.sh` để biết còn thiếu gì.

## 1. Bộ skill cần cài (cùng một thư mục `skills/`)

Các skill gọi nhau bằng đường dẫn tương đối `../../<skill>/...`, nên **phải nằm chung một thư mục cha**.

| Skill | Vai trò |
| --- | --- |
| `blog-hoi-dap-tron-goi` | Điều phối: làm hình, upload ảnh CDN, chèn ảnh, up CMS, ghi sheet |
| `viet-blog` | Research, outline, viết bài, QC, dựng HTML, lint, kiểm link, xuất Google Doc |
| `cms-faq-tao-bai` | Tạo/xuất bản/cập nhật bài Hỏi Đáp trên CMS TGDĐ (Faq V1) |
| `cms-topzone-tao-bai` | Như trên nhưng cho CMS V2 TopZone (`siteId=16`). Bỏ qua nếu không viết TopZone |
| `chen-link-noi-bo` | Rule + script quét link nội bộ từ sheet All KW |
| `onpage-mdm-khai-bao` | Chỉ lấy `scripts/cms-cli-mcp.mjs` (client Chrome DevTools MCP dùng chung) |
| `chrome-profile` | CLI mở đúng profile Chrome đã đăng nhập CMS, kèm hướng dẫn DevTools Hub |

```bash
git clone https://github.com/ntcong248820-gif/mwg-agent-skill.git
cd mwg-agent-skill/skills
for s in blog-hoi-dap-tron-goi viet-blog cms-faq-tao-bai cms-topzone-tao-bai chen-link-noi-bo onpage-mdm-khai-bao chrome-profile; do
  cp -R "$s" ~/.claude/skills/
done
```

Dùng cho Codex/Antigravity/Gemini: copy cùng bộ vào thư mục skill của agent đó, hoặc symlink từ bản canonical
(xem `seo-skill-sync` ở README gốc).

## 2. Công cụ hệ thống

| Cần | Kiểm tra | Ghi chú |
| --- | --- | --- |
| Node.js 18+ | `node -v` | Chạy các script `.mjs` nói chuyện với CMS |
| Python 3.9+ | `python3 -V` | Script viết bài, dựng HTML, xử lý ảnh |
| Pillow | `python3 -c "import PIL"` | `pip install pillow` (xử lý/kiểm ảnh). Không còn thư viện Python ngoài nào khác |
| `gws` CLI | `gws auth status` | Google Workspace CLI, đọc/ghi Google Sheet và tạo Google Doc. `gws auth login` rồi chọn account có quyền sửa sheet |
| `chrome-profile` CLI | `chrome-profile list` | Từ skill `chrome-profile`: `sh chrome-profile/scripts/install.sh` |
| Google Chrome + Chrome DevTools MCP | | Script CMS điều khiển một tab Chrome đã đăng nhập, không tự đăng nhập |
| DevTools Hub (nên có) | `ls ~/.local/bin/devtools-mcp-bridge` | Không có thì Chrome hỏi Allow mỗi lần chạy. Cài theo `chrome-profile/references/mcp-config-recipes.md` |
| Antigravity (không bắt buộc) | | Nhận việc viết văn phong (`viet-blog/scripts/giao_anti.py`). Không có thì script báo `ANTI_LOI` và agent chính tự viết |

## 3. Chrome profile đã đăng nhập CMS

1. Mở Chrome bằng profile cá nhân, đăng nhập `https://cms.thegioididong.com` (tài khoản có quyền tạo bài Hỏi Đáp,
   và quyền site TopZone nếu viết TopZone).
2. Khai báo profile cho `chrome-profile` (xem `chrome-profile/SKILL.md`, `profiles.example.json`), ví dụ key `cms-cua-toi`.
3. Đặt biến `CMS_CHROME_PROFILE=cms-cua-toi`. Bài TopZone dùng profile khác thì thêm `CMS_CHROME_PROFILE_TOPZONE`.

Script luôn mở **tab mới** (`cp-force.sh` thêm `--force`), không đụng tab bạn đang sửa. Nếu thấy lỗi `No page found`,
script tự thử lại; vẫn lỗi thì chờ 1 phút chạy lại.

## 4. Biến môi trường

Thêm vào `~/.zshrc` (hoặc `~/.bashrc`):

```bash
export HOI_DAP_SHEET_ID=...            # bắt buộc: ID file Google Sheet "Hỏi Đáp n8n" (mục 5)
export CMS_CHROME_PROFILE=cms-cua-toi  # bắt buộc: key profile chrome-profile đã đăng nhập CMS
export SHEET_ALL_KW_ID=...             # kho kw TGDĐ/ĐMX cho chen-link-noi-bo (mục 6)
export SHEET_ALL_KW_TOPZONE_ID=...     # kho kw TopZone (chỉ cần khi viết TopZone)
```

| Biến | Bắt buộc | Mặc định | Dùng cho |
| --- | --- | --- | --- |
| `HOI_DAP_SHEET_ID` | có | | `viet-blog/scripts/du_lieu.py` (đọc dòng, prompt, kho link; ghi kết quả) |
| `CMS_CHROME_PROFILE` | có | | Mọi script `.mjs` nói chuyện với CMS |
| `CMS_CHROME_PROFILE_TOPZONE` | không | = `CMS_CHROME_PROFILE` | `cms-topzone-tao-bai` |
| `SHEET_ALL_KW_ID` | khi chèn link TGDĐ/ĐMX | | `chen-link-noi-bo/scripts/scan_links.py` |
| `SHEET_ALL_KW_TOPZONE_ID` | khi chèn link TopZone | | `scan_links.py --site topzone` |
| `SHEET_KW_SP_ID` | không | | Sheet KW sản phẩm mới chưa có trong All KW (đọc tay qua `gws`) |
| `SHEET_KW_TIEN_ICH_ID` | không | | Sheet kw SIM/thẻ cào/tiện ích (đọc tay qua `gws`) |
| `SHORTCODE_SHEET_ID` | không | = `HOI_DAP_SHEET_ID` | Sheet có tab `Hãng`, `ID thuộc tính` để lấy ID shortcode |
| `HOI_DAP_DRIVE_FOLDER_ID` | không | Drive gốc | Thư mục Drive chứa Google Doc bài viết |
| `BLOG_ROOT` | không | `~/blog-hoi-dap` | Thư mục làm việc: mỗi bài một thư mục con `<slug>/`, bản ghi bài đã up ở `_cms-tao-bai/` |
| `ANTI_WORKSPACE` | không | = `BLOG_ROOT` | Workspace đã gắn project trong app Antigravity |
| `ANTI_RUN` | không | `~/mwg-agent-crew/scripts/anti-run.mjs` | Script gọi Antigravity |
| `VIET_BLOG_CACHE` | không | `~/.cache/viet-blog` | Cache prompt và kho link |
| `CHROME_DEVTOOLS_MCP_BIN` | không | `~/.local/bin/devtools-mcp-bridge` nếu có | Bridge DevTools MCP |
| `GOOGLE_WORKSPACE_CLI_CONFIG_DIR` | không | | Dùng account gws khác account mặc định |

Không có key/token nào lưu trong skill. CMS dùng phiên đăng nhập sẵn có của Chrome.

## 5. Tạo Google Sheet "Hỏi Đáp n8n"

Cách nhanh nhất: để script tạo sheet mẫu đúng cấu trúc, nạp sẵn prompt và 13 template outline:

```bash
python3 ~/.claude/skills/viet-blog/scripts/khoi_tao_sheet.py "Hỏi Đáp n8n"
# in ra link + dòng: export HOI_DAP_SHEET_ID=<id>
```

Hoặc xin bản copy sheet của team (File → Tạo bản sao) rồi đặt `HOI_DAP_SHEET_ID`.

Cấu trúc các tab (header ở dòng 1, script đọc theo **tên header**):

| Tab | Nội dung |
| --- | --- |
| `skill_hoi_dap` | Dòng việc. Biên tập điền A-G: `Site` (TGDĐ/TopZone, trống = TGDĐ), `Keyword`, `KW phụ`, `Dạng bài`, `URL SP cần push`, `Link tham khảo`, `Ghi chú`. Skill ghi: `Status`, `Title`, `Meta`, `Link SERP research`, `Outline`, `Docs HTML`, `Link đã chèn`, `Cảnh báo`, `QC`, `Cập nhật`, `Link CMS`, `Ngày xuất bản dự kiến` (biên tập điền dd/mm/yyyy), `Link air`, `Trạng thái up CMS`, `Note CMS`. Cột `ID` tự tách từ `Link CMS` bằng công thức ở ô header (tuỳ chọn). Nên đặt dropdown cho `Site`, `Status` (Run/Doing/Done/Lỗi) và `Trạng thái up CMS` (Chờ làm hình, Chờ duyệt, Hẹn xuất bản, Xuất bản, Lỗi) |
| `Prompt` | 3 cột `key`, `value`, `ghi chú`. Gồm `system_chung`, `prompt_*`, `outline_<dạng bài>` (13 dạng), `trang_hang` và các dòng config (`so_doi_thu`, `so_sp_lay_thong_so`, `link_bao_hanh`, `nguon_uy_tin`, `ty_le_kw`). Team sửa prompt trên sheet là skill dùng bản mới sau lần `du_lieu.py tai --force` |
| `internal_link_sp` | Kho link sản phẩm/ngành hàng: `Keyword`, `Volume Search`, `URL TGDD`, `URL DMX`, `Loại KW`, `KW chính`, `Trạng thái KD`, `ID NH`, `ID Hãng`, `ID Filter`, `ID SP`. Thường là công thức lấy từ sheet All KW |
| `internal_link_thuat_ngu` | Thuật ngữ đã có bài Hỏi Đáp: `STT`, `Chuyên mục`, `URL`, `Title` |
| `sitemap_hoi_dap` | Bài Hỏi Đáp hiện có (cho "Xem thêm"): `STT`, `Tiêu đề (Title)`, `URL`, `Danh mục`, `Ngày đăng`, `ID bài` |
| `Hãng`, `ID thuộc tính` | Tra ID shortcode listing (`categoryid`, `properties`). Có thể nằm ở sheet riêng (`SHORTCODE_SHEET_ID`) |

Sau khi có sheet, tải dữ liệu về cache và thử đọc một dòng:

```bash
python3 ~/.claude/skills/viet-blog/scripts/du_lieu.py tai --force
python3 ~/.claude/skills/viet-blog/scripts/du_lieu.py dong 2
```

Account `gws` đang đăng nhập phải có quyền sửa sheet.

## 6. Kho từ khoá cho chèn link

`chen-link-noi-bo/scripts/scan_links.py` đọc tab `All KW` của sheet `SHEET_ALL_KW_ID` (cột: `Keyword` L, `Volume` M,
`KW chính` N, `URL TGDD` O, `URL DMX` P, `Loại KW` B, `Trạng thái KD` R) và cache vào `chen-link-noi-bo/cache/`.
Bản TopZone đọc 4 tab `KW Ngành hàng`, `KW Hãng`, `KW Ngành hàng Filter`, `KW Sản Phẩm` của `SHEET_ALL_KW_TOPZONE_ID`.
Sheet của bạn có cột khác thì sửa chỉ số cột trong `scan_links.py` (dict `C`). Kho của team là dữ liệu nội bộ,
không nằm trong repo: xin bản copy từ team SEO.

## 7. Kiểm tra môi trường

```bash
sh ~/.claude/skills/blog-hoi-dap-tron-goi/scripts/kiem_moi_truong.sh
```

In `OK` / `THIEU` / `LUU Y` cho từng mục. `THIEU` là chặn, `LUU Y` là tuỳ chọn.

## 8. Chạy lần đầu (an toàn)

1. Điền 1 dòng ở tab `skill_hoi_dap` (Keyword, Dạng bài), đặt `Status = Run`.
2. Trong agent (Claude Code): `/blog-hoi-dap-tron-goi chạy dòng 2`. Agent viết bài, hỏi kho ảnh, làm hình, rồi dừng ở bước dry run.
3. `tao_bai.mjs form.json` **không có `--go`** là dry run: in toàn bộ khai báo để bạn duyệt, **không tạo bài**.
4. Chỉ khi duyệt xong mới `--go`. Ngày xuất bản (cột `Ngày xuất bản dự kiến`) trống thì bài ở trạng thái **Chờ duyệt**,
   không tự xuất bản. Chỉ chạy `xuat_ban.mjs` khi bạn chủ động muốn xuất bản bài đó.

## 9. Lưu ý an toàn

- Skill **ghi lên CMS production** (tạo bài, upload ảnh lên CDN, đổi trạng thái). Ảnh đã lên CDN không xoá được và tên file
  trùng là mất tên đó: luôn chạy `kiem_anh.py` và dry run trước.
- Mỗi bài chỉ POST 1 lần. Lỗi không rõ kết quả thì kiểm danh sách bài trên CMS trước khi chạy lại.
- Quy ước nghiệp vụ (văn phong, rule ảnh/alt/thumb, giá lấy theo site, hotline, brand) nằm trong
  `viet-blog/references/` và các `SKILL.md`. Bạn đổi site/thương hiệu thì sửa các file đó và template trong `dung_html*.py`.

## 10. Xử lý lỗi thường gặp

| Triệu chứng | Cách xử |
| --- | --- |
| `Thiếu biến môi trường ...` | Đặt biến theo mục 4, mở lại terminal |
| `gws lỗi ... 403/404` | Account gws chưa có quyền với sheet/Doc, hoặc token cũ: `gws auth login` lại, kiểm `GOOGLE_WORKSPACE_CLI_CONFIG_DIR` |
| `No page found` / `list_pages treo` | Hub DevTools chập chờn; script tự thử lại 4 lần, vẫn lỗi thì chờ 1 phút |
| Chrome hỏi Allow liên tục | Chưa cài DevTools Hub, xem `chrome-profile/references/mcp-config-recipes.md` |
| Node chạy một vòng rồi thoát khi gọi trong vòng lặp shell | Thêm `< /dev/null` sau lệnh `node ...` |
| `ANTI_LOI` | Chưa mở app Antigravity / hết quota / thiếu `ANTI_RUN`: agent chính tự viết bước 5 |
| Trang web trống sau khi Xuất bản | Bình thường, thường lên sau vài phút đến ~25 phút (TopZone); bài Chờ duyệt thì luôn trống |
