"""Giao bước 5 (viết bai.md theo văn phong) cho Antigravity, agent điều phối chỉ QC + các bước còn lại.
  python3 giao_anti.py <thư mục bài> [--model pro|flash] [--timeout 25m] [--sua "góp ý cần viết lại"]

Cần trong thư mục bài: outline.md, research.json, bai.json (keyword, kw_phu, dang_bai), tgdd.json (nếu có).
Script gói brief (system_chung + prompt_viet + bai-hoc-da-chot + quy ước markdown + outline + dữ kiện) vào
brief_viet.md, gọi anti-run.mjs (app mode, workspace $ANTI_WORKSPACE), chờ Antigravity ghi bai.md và
$ANTI_WORKSPACE/tasks/viet-blog/<slug>/anti_report.md (dòng "Status: done"). bai*.md cũ được cất vào ~/.cache/viet-blog/bai_cu/<slug>/ (bai_truoc_anti.md).
Lỗi/timeout → in "ANTI_LOI: ..." và thoát mã 2: agent điều phối tự viết bước 5 rồi ghi vào Cảnh báo.
"""
import fcntl, json, os, re, shutil, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _chung import *

SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKSPACE = os.path.expanduser(os.environ.get('ANTI_WORKSPACE') or os.environ.get('BLOG_ROOT') or '~/blog-hoi-dap')   # phải gắn project trong app Antigravity
ANTI_RUN = os.path.expanduser(os.environ.get('ANTI_RUN') or '~/mwg-agent-crew/scripts/anti-run.mjs')   # thiếu file này → ANTI_LOI, agent tự viết


def doc(p, mac=''):
    return open(p).read() if os.path.exists(p) else mac


def tom_tgdd(p):
    """Rút gọn tgdd.json: tên, thông số, phiên bản/giá. Bỏ list dài của trang ngành/dòng."""
    if not os.path.exists(p): return '(không có)'
    d = json.load(open(p)); d = d if isinstance(d, list) else [d]
    ra = []
    for x in d:
        sp = x.get('product')
        if not sp: continue
        ra.append({'ten': sp.get('ten'), 'url': sp.get('url'), 'thong_so': sp.get('thong_so'),
                   'phien_ban': [{'size': v.get('size'), 'gia': v.get('gia_text')} for v in sp.get('phien_ban', [])]})
    return json.dumps(ra, ensure_ascii=False, indent=1) if ra else '(không có)'


def bao_cao(thu_muc):
    """anti-run chỉ nhận evidence trong <workspace>/tasks/."""
    d = os.path.join(WORKSPACE, 'tasks', 'viet-blog', os.path.basename(thu_muc)); os.makedirs(d, exist_ok=True)
    return os.path.join(d, 'anti_report.md')


def brief(thu_muc, sua):
    P = os.path.join(CACHE, 'prompts')
    meta = json.load(open(os.path.join(thu_muc, 'bai.json')))
    ngay, nam = time.strftime('%d/%m/%Y'), time.strftime('%Y')
    thay = lambda s: s.replace('{ngay}', ngay).replace('{nam}', nam)
    md_rule = doc(os.path.join(SKILL, 'references', 'dinh-dang-markdown.md'))
    md_rule = md_rule.split('## bai.json')[0]   # chỉ phần quy ước bai.md
    out_md = os.path.join(thu_muc, 'bai.md'); rp = bao_cao(thu_muc)
    phan = [
        '# VIỆC CỦA BẠN: viết bài Hỏi Đáp TGDĐ hoàn chỉnh (bước viết của skill viet-blog)',
        'Bạn là người viết. Người điều phối (Claude) sẽ QC số liệu, chèn link, dựng HTML sau, nên bạn CHỈ viết nội dung.',
        f'- Ghi bài markdown vào: {out_md} (ghi đè).',
        f'- Xong thì ghi {rp}: vài dòng tự soát (số H3/H4, số câu FAQ, chỗ nào thiếu dữ kiện nên viết gọn), dòng cuối đúng "Status: done".',
        '- Viết mới từ outline và dữ kiện bên dưới. Không mở file bài cũ nào khác trong thư mục hay trong workspace.',
        '- Không chèn link, không shortcode, không mục "Mua ... tại Thế Giới Di Động", không box Xem thêm, không dòng Nguồn tham khảo, không [IMG].',
        '- Mọi số liệu, giá, ngày CHỈ lấy từ DỮ LIỆU TGDĐ và DU_KIEN bên dưới. Không có thì bỏ ý, không tự suy ra số, không suy diễn kết quả thực tế (thời gian sạc, điểm game, chất lượng ảnh) khi nguồn không nêu.',
        f'- Ngày hôm nay: {ngay}. Mọi ngày cập nhật giá = hôm nay.',
        f'\n## THÔNG TIN BÀI\n- Từ khóa chính: {meta.get("keyword")}\n- Từ khóa phụ: {", ".join(meta.get("kw_phu", [])) or "(không)"}\n- Dạng bài: {meta.get("dang_bai")}\n- Sản phẩm cần push: {", ".join(meta.get("urls_push", [])) or "(không)"}',
    ]
    if sua:
        phan.append('\n## GÓP Ý CẦN SỬA (viết lại bai.md hiện có theo góp ý, giữ phần không bị góp ý)\n' + sua
                    + '\n\n### BÀI HIỆN TẠI\n' + doc(os.path.join(CACHE, 'bai_cu', os.path.basename(thu_muc), 'bai_truoc_anti.md')))
    phan += [
        '\n## GÓP Ý ĐÃ CHỐT (ưu tiên cao nhất)\n' + doc(os.path.join(SKILL, 'references', 'bai-hoc-da-chot.md')),
        '\n## QUY TẮC CHUNG\n' + thay(doc(os.path.join(P, 'system_chung.md'))),
        '\n## HƯỚNG DẪN VIẾT VÀ VĂN PHONG\n' + thay(doc(os.path.join(P, 'prompt_viet.md'))),
        '\n## QUY ƯỚC FILE bai.md\n' + md_rule,
        '\n## OUTLINE CUỐI (giữ đúng heading, thứ tự)\n' + doc(os.path.join(thu_muc, 'outline.md')),
        '\n## DU_KIEN VÀ PAA (RESEARCH)\n' + doc(os.path.join(thu_muc, 'research.json')),
        '\n## DỮ LIỆU TGDĐ\n' + tom_tgdd(os.path.join(thu_muc, 'tgdd.json')),
    ]
    p = os.path.join(thu_muc, 'brief_viet.md'); open(p, 'w').write('\n'.join(phan))
    return p, out_md, rp


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: print(__doc__); sys.exit()
    thu_muc = os.path.abspath(os.path.expanduser(a[0]))
    model = a[a.index('--model') + 1] if '--model' in a else 'pro'
    to = a[a.index('--timeout') + 1] if '--timeout' in a else '25m'
    sua = a[a.index('--sua') + 1] if '--sua' in a else ''
    if not thu_muc.startswith(WORKSPACE + '/'):
        print('ANTI_LOI: thư mục bài phải nằm trong %s (workspace đã gắn với app Antigravity)' % WORKSPACE); sys.exit(2)
    md = os.path.join(thu_muc, 'bai.md')
    # Bài cũ (nếu có) cất ra ngoài workspace để Anti không đọc rồi chép lại; --sua thì đưa bài cũ vào brief.
    cat = os.path.join(CACHE, 'bai_cu', os.path.basename(thu_muc)); os.makedirs(cat, exist_ok=True)
    for f in os.listdir(thu_muc):
        if re.match(r'(bai(_.+)?\.(md|html)|ket_qua\.json|quet\.json)$', f): shutil.move(os.path.join(thu_muc, f), os.path.join(cat, f))
    if os.path.exists(os.path.join(cat, 'bai.md')): shutil.copy(os.path.join(cat, 'bai.md'), os.path.join(cat, 'bai_truoc_anti.md'))
    bp, out_md, rp = brief(thu_muc, sua)
    if os.path.exists(rp): os.remove(rp)
    lenh = ['node', ANTI_RUN, '--mode', 'app', '--model', model, '--title', 'viet-blog: ' + os.path.basename(thu_muc),
            '--workspace', WORKSPACE, '--evidence', rp, '--timeout', to,
            '--prompt', 'Đọc kỹ toàn bộ file %s rồi làm đúng việc trong đó. File đó là toàn bộ yêu cầu.' % bp]
    # App Antigravity chạy song song nhiều job dễ treo → xếp hàng: mỗi lúc 1 bài (các bài khác chờ khóa).
    khoa = open(os.path.join(CACHE, 'anti.lock'), 'w'); print('Chờ hàng đợi Antigravity...', flush=True)
    fcntl.flock(khoa, fcntl.LOCK_EX); print('Bắt đầu giao Anti: %s' % time.strftime('%H:%M:%S'), flush=True)
    try: p = subprocess.run(lenh, capture_output=True, text=True, env={**os.environ, 'MWG_CREW_ROLE': 'worker'})
    finally: fcntl.flock(khoa, fcntl.LOCK_UN)
    i = p.stdout.find('{'); kq = {}
    try: kq = json.loads(p.stdout[i:]) if i >= 0 else {}
    except json.JSONDecodeError: pass
    st = kq.get('status', '')
    ok = os.path.exists(out_md) and os.path.getmtime(out_md) > os.path.getmtime(bp) and os.path.exists(rp) and re.search(r'^Status:\s*done', doc(rp), re.I | re.M)
    if not ok:
        print('ANTI_LOI: status=%s, bai.md mới=%s. %s' % (st or '?', os.path.exists(out_md) and os.path.getmtime(out_md) > os.path.getmtime(bp),
                                                          (p.stderr or p.stdout)[-500:].strip()))
        sys.exit(2)
    print('ANTI_OK: %s (%ss, conversation %s)\n--- anti_report.md ---\n%s' % (out_md, kq.get('durationSec'), kq.get('conversationId'), doc(rp)))
