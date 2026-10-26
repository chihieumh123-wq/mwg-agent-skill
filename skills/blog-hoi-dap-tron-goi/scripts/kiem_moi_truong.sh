#!/bin/sh
# Kiểm môi trường trước khi chạy quy trình trọn gói Blog Hỏi Đáp. Không ghi gì, chỉ báo thiếu gì.
#   sh kiem_moi_truong.sh
HERE="$(cd "$(dirname "$0")" && pwd)"
SKILLS="$(cd "$HERE/../.." && pwd)"
loi=0
ok()   { printf '  OK   %s\n' "$1"; }
thieu(){ printf '  THIEU %s\n' "$1"; loi=$((loi+1)); }
warn() { printf '  LUU Y %s\n' "$1"; }

echo "Công cụ:"
command -v node >/dev/null && node -e 'process.exit(+process.versions.node.split(".")[0]>=18?0:1)' && ok "node $(node -v)" || thieu "node >= 18"
command -v python3 >/dev/null && ok "$(python3 -V)" || thieu "python3 >= 3.9"
python3 -c 'import PIL' 2>/dev/null && ok "Pillow (PIL)" || thieu "Pillow: pip install pillow"
command -v gws >/dev/null && ok "gws CLI" || thieu "gws CLI (Google Workspace CLI), đăng nhập bằng: gws auth login"
command -v chrome-profile >/dev/null && ok "chrome-profile CLI" || thieu "chrome-profile CLI (skill chrome-profile, chạy scripts/install.sh)"
[ -x "$HOME/.local/bin/devtools-mcp-bridge" ] || [ -n "$CHROME_DEVTOOLS_MCP_BIN" ] && ok "DevTools bridge" || warn "chưa có ~/.local/bin/devtools-mcp-bridge hoặc CHROME_DEVTOOLS_MCP_BIN: mỗi lần chạy sẽ bị hỏi Allow (xem skill chrome-profile)"

echo "Skill phụ thuộc (cùng thư mục $SKILLS):"
for s in viet-blog cms-faq-tao-bai chen-link-noi-bo onpage-mdm-khai-bao chrome-profile; do
  [ -f "$SKILLS/$s/SKILL.md" ] && ok "$s" || thieu "skill $s"
done
[ -f "$SKILLS/cms-topzone-tao-bai/SKILL.md" ] && ok "cms-topzone-tao-bai" || warn "không có cms-topzone-tao-bai (chỉ cần khi viết bài TopZone)"

echo "Biến môi trường:"
[ -n "$HOI_DAP_SHEET_ID" ] && ok "HOI_DAP_SHEET_ID" || thieu "HOI_DAP_SHEET_ID (python3 viet-blog/scripts/khoi_tao_sheet.py để tạo sheet mẫu)"
[ -n "$CMS_CHROME_PROFILE" ] && ok "CMS_CHROME_PROFILE=$CMS_CHROME_PROFILE" || thieu "CMS_CHROME_PROFILE (key profile chrome-profile đã đăng nhập CMS)"
[ -n "$SHEET_ALL_KW_ID" ] && ok "SHEET_ALL_KW_ID" || warn "SHEET_ALL_KW_ID chưa đặt: chen-link-noi-bo không quét được link TGDĐ/ĐMX"
[ -n "$SHEET_ALL_KW_TOPZONE_ID" ] || warn "SHEET_ALL_KW_TOPZONE_ID chưa đặt (chỉ cần cho bài TopZone)"
[ -n "$HOI_DAP_DRIVE_FOLDER_ID" ] || warn "HOI_DAP_DRIVE_FOLDER_ID chưa đặt: Doc bài sẽ nằm ở gốc Drive"

echo "Chrome profile:"
if command -v chrome-profile >/dev/null && [ -n "$CMS_CHROME_PROFILE" ]; then
  chrome-profile list 2>/dev/null | grep -q "$CMS_CHROME_PROFILE" && ok "profile '$CMS_CHROME_PROFILE' có trong chrome-profile list" || thieu "profile '$CMS_CHROME_PROFILE' chưa khai báo (chrome-profile list)"
fi

echo
[ "$loi" -eq 0 ] && echo "Đủ điều kiện chạy." || { echo "Còn $loi mục thiếu, xem SETUP.md."; exit 1; }
