#!/usr/bin/env python3
"""Kiểm tra ảnh reference trước khi gọi API tạo ảnh: phát hiện nền trắng, đọc kích thước.

Dùng để quyết định ảnh nào cần đưa qua mode sửa nền (`--preserve-product`).
Không gọi API nào, không tốn phí.

whiteScore = tỉ lệ pixel viền gần trắng. >= 0.9 coi là ảnh catalog nền trắng.
"""

import argparse
import json
import os
import sys
import urllib.request

from PIL import Image

WHITE_THRESHOLD = 235          # kênh RGB >= ngưỡng này coi là "gần trắng"
BORDER_FRACTION = 0.12         # lấy 12% mép mỗi cạnh làm vùng mẫu
WHITE_SCORE_FLAG = 0.9         # >= ngưỡng này báo nền trắng
MIN_USABLE_WIDTH = 400         # nhỏ hơn thì reference quá thấp phân giải


def load_image(source, tmp_dir):
    """Mở ảnh từ path local hoặc URL. Trả về (PIL.Image, local_path)."""
    if source.startswith(("http://", "https://")):
        os.makedirs(tmp_dir, exist_ok=True)
        name = os.path.basename(source.split("?")[0]) or "reference.jpg"
        local = os.path.join(tmp_dir, name)
        req = urllib.request.Request(
            source,
            headers={"User-Agent": "Mozilla/5.0 (compatible; mwg-ai-worker/1.0)"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp, open(local, "wb") as out:
            out.write(resp.read())
        return Image.open(local), local
    return Image.open(source), source


def white_score(img):
    """Tỉ lệ pixel gần trắng ở vùng viền ảnh."""
    rgb = img.convert("RGB")
    width, height = rgb.size
    bw = max(1, int(width * BORDER_FRACTION))
    bh = max(1, int(height * BORDER_FRACTION))

    pixels = rgb.load()
    near_white = 0
    total = 0

    for y in range(height):
        in_horizontal_band = y < bh or y >= height - bh
        for x in range(width):
            # chỉ lấy pixel nằm trong khung viền
            if not in_horizontal_band and not (x < bw or x >= width - bw):
                continue
            r, g, b = pixels[x, y]
            total += 1
            if r >= WHITE_THRESHOLD and g >= WHITE_THRESHOLD and b >= WHITE_THRESHOLD:
                near_white += 1

    if total == 0:
        return 0.0
    return round(near_white / total, 4)


def inspect(source, tmp_dir):
    try:
        img, local = load_image(source, tmp_dir)
    except Exception as exc:  # noqa: BLE001 - báo lỗi từng ảnh, không dừng cả batch
        return {"source": source, "error": str(exc)}

    with img:
        score = white_score(img)
        width, height = img.size
        result = {
            "source": source,
            "localPath": local,
            "width": width,
            "height": height,
            "aspect": round(width / height, 3) if height else None,
            "whiteScore": score,
            "isWhiteBackground": score >= WHITE_SCORE_FLAG,
            "warnings": [],
        }

    if width < MIN_USABLE_WIDTH:
        result["warnings"].append(
            f"độ phân giải thấp ({width}px) — reference yếu, ảnh ra dễ mờ"
        )
    if result["isWhiteBackground"]:
        result["recommendation"] = "sửa nền: dùng --preserve-product"
    else:
        result["recommendation"] = "dùng trực tiếp làm reference"

    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--images", nargs="+", required=True,
                        help="Đường dẫn file hoặc URL ảnh")
    parser.add_argument("--tmp-dir", default="/tmp/ai-image-refs",
                        help="Thư mục tải ảnh URL về")
    parser.add_argument("--json", action="store_true", help="In JSON thay vì bảng")
    args = parser.parse_args()

    results = [inspect(src, args.tmp_dir) for src in args.images]

    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        for item in results:
            if "error" in item:
                print(f"[ERR ] {item['source']}: {item['error']}")
                continue
            flag = "NỀN TRẮNG" if item["isWhiteBackground"] else "OK       "
            print(
                f"[{flag}] white={item['whiteScore']:.2f} "
                f"{item['width']}x{item['height']} {os.path.basename(item['source'])}"
            )
            for warn in item["warnings"]:
                print(f"          WARN: {warn}")

    failed = [r for r in results if "error" in r]
    white = [r for r in results if r.get("isWhiteBackground")]
    if not args.json:
        print(f"\nTổng {len(results)} ảnh | nền trắng {len(white)} | lỗi {len(failed)}")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
