/**
 * mdm-direct.mjs — đường gọi API MDM/PIM THẲNG từ Node bằng bearer token (không lái tab).
 *
 * Hai đường tiếp cận của skill:
 *   direct  Token lấy từ Keychain (mdm-keychain-cache.mjs) hoặc đọc MỘT lần từ tab MDM (qua MCP), giữ trong RAM, rồi mọi lệnh
 *           HTTP đi thẳng từ Node (cùng ngữ nghĩa với mdm-page-runner.js). Không in token.
 *   tab     Lái tab bằng chrome-devtools-mcp, fetch chạy trong trang, token không rời tab (đường gốc).
 * Chế độ `auto` (mặc định) đi direct và RƠI VỀ tab khi direct gặp vấn đề — xem DirectUnavailable.
 *
 * Quy tắc rơi về tab: chỉ khi biết chắc request chưa gây ghi. Op đọc: rơi về với mọi lỗi mạng/HTTP đáng ngờ.
 * Op ghi/upload: chỉ rơi về khi server từ chối quyền (401/403) hoặc request chưa rời máy; lỗi mơ hồ
 * (timeout, đứt kết nối giữa chừng) thì KHÔNG gửi lại bằng đường khác — để lệnh ghi tự đọc lại và báo.
 */

export class DirectUnavailable extends Error {
  constructor(message, reason) { super(message); this.reason = reason; }
}

/** Op đọc (idempotent) → được phép thử lại bằng đường khác khi lỗi mơ hồ. */
export const isReadOp = (op) => !op.upload && /(^|\/)(getinfor|getlist\w*|getlistbyroot|getfamilyinfor)$/.test(String(op.path || ''));

/** Cắt bớt hàng trong danh sách lớn — bản sao của projectRow trong mdm-page-runner.js (test so khớp). */
export function projectRow(row, p) {
  const out = {};
  for (const k of p.top || []) if (k in row) out[k] = row[k];
  const raw = row.raw_values || row.rawValues;
  if (p.raw && raw) {
    const r = typeof raw === 'string' ? JSON.parse(raw) : raw;
    out.raw = {};
    for (const k of p.raw) if (k in r) out.raw[k] = r[k];
  }
  return out;
}

const NETWORK_NOT_SENT = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH']);

export class DirectRunner {
  constructor(cfg, token, { fetchFn = fetch, timeoutMs = 120000 } = {}) {
    this.cfg = cfg;
    this.token = token;
    this.fetchFn = fetchFn;
    this.timeoutMs = timeoutMs;
  }

  /** Che token khỏi mọi thông điệp lỗi trước khi nó rời module. */
  scrub(msg) { return String(msg ?? '').split(this.token).join('[redacted]'); }

  base(api) { return api === 'pim' ? this.cfg.pimApiBase : this.cfg.apiBase; }

  async one(op) {
    const auth = { authorization: `Bearer ${this.token}` };
    const signal = AbortSignal.timeout(this.timeoutMs);
    if (op.upload) {
      const bytes = Buffer.from(op.upload.b64, 'base64');
      const fd = new FormData();
      fd.append('resourceName', 'pim_product');
      fd.append('localeCode', 'vi_VN');
      fd.append('allowedExtensions', op.upload.allowedExtensions);
      fd.append('multipartFile', new Blob([bytes], { type: op.upload.mime }), op.upload.name);
      return this.fetchFn(this.base('pim') + 's3/cdnput', { method: 'POST', headers: auth, body: fd, signal });
    }
    return this.fetchFn(this.base(op.api) + op.path, { method: 'POST', headers: { 'content-type': 'application/json', ...auth }, body: JSON.stringify(op.body), signal });
  }

  /**
   * Cùng hình dạng kết quả với __mdmRun: [{ok,status,ms,json,text}|{ok:false,error}], dừng chuỗi ở op lỗi mạng.
   * Ném DirectUnavailable khi nên rơi về đường tab (và chắc chắn chưa ghi gì ở op đó).
   */
  async run(ops) {
    const results = [];
    for (const op of ops) {
      const t0 = Date.now();
      const read = isReadOp(op);
      let res;
      try {
        res = await this.one(op);
      } catch (e) {
        const code = e && (e.cause && e.cause.code || e.code);
        const msg = this.scrub(e && e.message || e);
        // Request chưa rời máy (DNS/refused) → luôn an toàn. Lỗi khác → chỉ an toàn nếu op đọc.
        if (read || NETWORK_NOT_SENT.has(code)) throw new DirectUnavailable(`gọi thẳng lỗi mạng: ${msg}`, 'network');
        results.push({ ok: false, ms: Date.now() - t0, error: msg });
        break;
      }
      if (res.status === 401 || res.status === 403) throw new DirectUnavailable(`server từ chối token (HTTP ${res.status})`, 'auth');
      const text = await res.text().catch(() => '');
      let json = null;
      try { json = JSON.parse(text); } catch { /* trả text thô bên dưới */ }
      // Op đọc mà nhận trang lỗi không phải JSON (cổng/proxy 5xx) → để đường tab thử lại.
      if (read && !json) throw new DirectUnavailable(`gọi thẳng nhận HTTP ${res.status} không phải JSON`, 'non-json');
      if (json && op.project && Array.isArray(json.object)) json.object = json.object.map((r) => projectRow(r, op.project));
      results.push({ ok: true, status: res.status, ms: Date.now() - t0, json, text: json ? undefined : this.scrub(text).slice(0, 500) });
    }
    return results;
  }
}
