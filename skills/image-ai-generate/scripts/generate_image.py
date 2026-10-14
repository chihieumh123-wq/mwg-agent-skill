#!/usr/bin/env python3
"""Gọi GPT Image 2.5 Flare qua OpenRouter tạo ảnh raw 1536x864 (16:9).

Endpoint duy nhất: POST https://openrouter.ai/api/v1/images
Có --reference -> gửi kèm input_references (base64 data URL), giữ sản phẩm thật.
Không có       -> text-to-image thuần.

API TỐN PHÍ. Chỉ chạy sau khi user đã duyệt cost gate ở Bước 4 của SKILL.md.

Key OPEN_ROUTER_KEY đọc theo thứ tự: biến môi trường -> root .env. Script không bao giờ in key ra output.
"""

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request

MODEL = "openai/gpt-image-2.5-flare"
GENERATE_SIZE = "1536x864"
QUALITY = "medium"
OUTPUT_FORMAT = "png"
API_URL = "https://openrouter.ai/api/v1/images"
ENV_KEY_NAME = "OPEN_ROUTER_KEY"
ENV_FILES = [".env"]
MAX_REFERENCES = 4

# Ràng buộc cứng khi reference là ảnh sản phẩm thật. Mục đích: đổi bối cảnh
# nhưng không được đổi bất kỳ chi tiết nhận dạng nào của máy, vì ảnh sai chi
# tiết đăng lên trang bán hàng là misrepresent sản phẩm.
PRESERVE_PRODUCT_GUARD = """
CRITICAL PRODUCT FIDELITY CONSTRAINT — this overrides all style instructions:
The product in the reference image is a real retail SKU. You MUST reproduce it
exactly as-is. Keep identical: overall shape and proportions, screen bezel and
size ratio, keyboard layout, hinge design, port count and placement, brand logo
shape/position/color, chassis color and material finish, and every visible
marking. Do NOT redesign, restyle, beautify, straighten, recolor, add, or remove
any part of the product. Do NOT invent a different model.
Change ONLY the background environment and the lighting on the scene.
Replace the plain white background with a realistic, contextual setting that
matches the article topic. The product must stay the unmodified hero subject.
""".strip()

# Ràng buộc cứng về ngôn ngữ: Text chủ đạo bắt buộc là tiếng Việt, cấm full tiếng Anh
VIETNAMESE_TEXT_GUARD = """
CRITICAL TEXT LANGUAGE CONSTRAINT:
All headlines, titles, full sentences, panel descriptions, and primary copy rendered inside the image MUST be in Vietnamese language (Tiếng Việt). Common technical terms and loan words (such as 'Arm màn hình', 'OLED', 'Gaming', 'Setup', 'RAM', 'SSD', 'RTX', 'Type-C', 'Hz', 'FPS') are fully allowed, but absolutely NO full English sentences, full English headlines, or purely English-only copy allowed in the generated image.
""".strip()


def find_repo_root(start):
    """Đi ngược lên tìm thư mục có .env (root workspace)."""
    current = os.path.abspath(start)
    while True:
        if os.path.isfile(os.path.join(current, ".env")):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            return None
        current = parent


def read_env_value(env_path, name):
    with open(env_path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            if key.strip().removeprefix("export ").strip() == name:
                return value.strip().strip('"').strip("'")
    return None


def load_api_key():
    """Đọc OPEN_ROUTER_KEY từ env hoặc file .env của workspace. Không in giá trị ra ngoài."""
    key = os.environ.get(ENV_KEY_NAME)
    if key:
        return key.strip()

    root = find_repo_root(os.path.dirname(os.path.abspath(__file__))) or find_repo_root(os.getcwd())
    if not root:
        sys.exit("ERROR: không tìm thấy root workspace để đọc .env.")

    for rel in ENV_FILES:
        env_path = os.path.join(root, rel)
        if os.path.isfile(env_path):
            value = read_env_value(env_path, ENV_KEY_NAME)
            if value:
                return value

    sys.exit(f"ERROR: không file nào trong {ENV_FILES} có biến {ENV_KEY_NAME}.")


def guess_mime(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in (".jpg", ".jpeg"):
        return "image/jpeg"
    if ext == ".webp":
        return "image/webp"
    return "image/png"


def to_data_url(path):
    with open(path, "rb") as handle:
        encoded = base64.b64encode(handle.read()).decode("ascii")
    return f"data:{guess_mime(path)};base64,{encoded}"


def call_api(payload, api_key):
    request = urllib.request.Request(API_URL, data=json.dumps(payload).encode(), method="POST")
    request.add_header("Authorization", f"Bearer {api_key}")
    request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=300) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        # Không echo header/key, chỉ body lỗi từ phía OpenRouter.
        sys.exit(f"ERROR: OpenRouter trả HTTP {exc.code}\n{detail[:1500]}")
    except urllib.error.URLError as exc:
        sys.exit(f"ERROR: không gọi được OpenRouter: {exc.reason}")


def request_image(prompt, references, api_key):
    payload = {
        "model": MODEL,
        "prompt": prompt,
        "size": GENERATE_SIZE,
        "quality": QUALITY,
        "output_format": OUTPUT_FORMAT,
        "n": 1,
    }
    if references:
        payload["input_references"] = [
            {"type": "image_url", "image_url": {"url": to_data_url(path)}} for path in references
        ]
    return call_api(payload, api_key)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=["infobox", "blog"], required=True,
                        help="Chỉ dùng để ghi metadata; size generate luôn 1536x864")
    parser.add_argument("--prompt-file", help="File chứa prompt (ưu tiên)")
    parser.add_argument("--prompt", help="Prompt inline")
    parser.add_argument("--reference", nargs="*", default=[],
                        help=f"1-{MAX_REFERENCES} ảnh reference; gửi kèm input_references")
    parser.add_argument("--preserve-product", action="store_true",
                        help="Chèn ràng buộc giữ nguyên sản phẩm thật (bắt buộc khi ref là ảnh SP)")
    parser.add_argument("--out", required=True, help="File ảnh raw đầu ra (.png)")
    args = parser.parse_args()

    if args.prompt_file:
        if not os.path.isfile(args.prompt_file):
            sys.exit(f"ERROR: không thấy file prompt: {args.prompt_file}")
        with open(args.prompt_file, "r", encoding="utf-8") as handle:
            prompt = handle.read().strip()
        if not prompt:
            sys.exit(f"ERROR: file prompt rỗng: {args.prompt_file}")
    elif args.prompt is not None:
        prompt = args.prompt.strip()
        if not prompt:
            sys.exit("ERROR: --prompt rỗng.")
    else:
        sys.exit("ERROR: cần --prompt-file hoặc --prompt.")

    if len(args.reference) > MAX_REFERENCES:
        sys.exit(f"ERROR: tối đa {MAX_REFERENCES} ảnh reference, đang có {len(args.reference)}.")

    for path in args.reference:
        if not os.path.isfile(path):
            sys.exit(f"ERROR: không thấy ảnh reference: {path}")

    if args.preserve_product and not args.reference:
        sys.exit("ERROR: --preserve-product cần ít nhất 1 --reference.")

    if args.preserve_product:
        prompt = f"{prompt}\n\n{PRESERVE_PRODUCT_GUARD}"

    # Luôn đính kèm ràng buộc ngôn ngữ: text trong ảnh phải là tiếng Việt
    prompt = f"{prompt}\n\n{VIETNAMESE_TEXT_GUARD}"

    api_key = load_api_key()

    kind = f"{len(args.reference)} reference" if args.reference else "no reference"
    print(f"[{MODEL}] {kind} | {GENERATE_SIZE} | {QUALITY}")
    result = request_image(prompt, args.reference, api_key)

    data = result.get("data") or []
    if not data:
        sys.exit(f"ERROR: OpenRouter không trả ảnh. Response keys: {list(result.keys())}")

    b64 = data[0].get("b64_json")
    if not b64:
        url = data[0].get("url")
        if not url:
            sys.exit("ERROR: response thiếu cả b64_json lẫn url.")
        with urllib.request.urlopen(url, timeout=120) as resp:
            binary = resp.read()
    else:
        binary = base64.b64decode(b64)

    os.makedirs(os.path.dirname(os.path.abspath(args.out)) or ".", exist_ok=True)
    with open(args.out, "wb") as handle:
        handle.write(binary)

    usage = result.get("usage") or {}
    print(f"OK raw image -> {args.out} ({len(binary)} bytes)")
    if usage:
        print(f"   usage: {json.dumps(usage, ensure_ascii=False)}")
    if args.preserve_product:
        print("   NHỚ: phải chạy fidelity gate (Read ảnh, đối chiếu reference) trước khi dùng.")


if __name__ == "__main__":
    main()
