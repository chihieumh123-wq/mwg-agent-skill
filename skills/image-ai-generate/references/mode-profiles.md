# Mode Profiles

## Thông số 2 mode

| | `infobox` | `blog` |
| --- | --- | --- |
| Size gọi API | `1536x864` | `1536x864` |
| Size cuối | **1200 x 675** | **800 x 450** |
| Tỉ lệ | 16:9 | 16:9 |
| Watermark TGDĐ | có | có |
| Logo | 64x64 tại (1124, 12) | 43x43 tại (749, 8) |
| Format | JPEG q95 | JPEG q95 |

Cả 2 mode cùng 16:9 nên dùng chung 1 lần generate, chỉ khác bước resize. Không
tạo 2 nhánh generate riêng.

Logo scale theo bề rộng khung (`canvas_width / 1200`) để mode blog giữ đúng tỉ lệ
thị giác như infobox. Vị trí luôn góc phải trên.

## Nguồn gốc thông số

Lấy từ workflow n8n `vTJmWPMVPL8G64dm` (`your n8n workflow folder`):

| Thông số | Bằng chứng |
| --- | --- |
| `1536x864`, `quality: medium` | `scripts/check-image-model-config.js` assert 5 node generate (n8n vẫn dùng `gpt-image-2`; skill local đã chuyển sang `openai/gpt-image-2.5-flare` qua OpenRouter từ 24/09/2026, giữ nguyên size/quality) |
| Resize `1200x675` | `docs/workflow-architecture.md`: "Throws if final binary is not exactly `1200x675`" |
| Logo 64x64 tại (1124, 12) | node `Composite TGDD Logo`: `positionX: 1124, positionY: 12` |
| Logo PNG | tự đặt vào `assets/logo.png`, hoặc trỏ `WATERMARK_LOGO_PATH` |

Mode `blog` (800x450) là mới, không có trong n8n.

## Vì sao generate 1536x864 rồi mới resize

Họ model GPT Image chỉ nhận vài size cố định; `1536x864` là size 16:9 gần nhất. Generate
thẳng ở 1200x675 hay 800x450 không được hỗ trợ.

Gate aspect ở `finalize_image.py` tồn tại để chặn ca model trả sai tỉ lệ — khi đó
resize sẽ kéo méo ảnh mà nhìn output cuối không phát hiện được (vẫn đúng số pixel).
n8n có đúng gate này với cùng lý do. **Không bypass gate để "cho xong".**

## Chọn mode

| Loại bài | Mode |
| --- | --- |
| Infobox ngành hàng / hãng / dòng SP / thuộc tính | `infobox` |
| Bài hỏi đáp (`hoidap-*`) | `blog` |
| Bài top N sản phẩm | `blog` |
| Bài blog thường | `blog` |

Suy từ tên workspace: `hoidap-`/`blog-` → `blog`; còn lại → `infobox`. Không chắc
thì hỏi user, đừng đoán — sai mode là sai size, phải làm lại từ đầu và tốn phí API.

## Ghi ảnh ra đâu

```
content-workspaces/{topic-slug}/
├── images-original/     <- ảnh reference tải về (ảnh SP gốc từ CDN)
├── images-processed/    <- ảnh AI đã finalize, sẵn sàng upload CMS
└── metadata/image-metadata.csv
```

Tên file kebab-case mô tả nội dung, `.jpg`. Không dùng tên `IMG_01.jpg` như n8n —
local cần tên đọc được để đối chiếu với section trong bài.
