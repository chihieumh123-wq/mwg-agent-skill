/**
 * mdm-keychain-cache.mjs — cache token MDM trong Keychain macOS để lệnh sau gọi API thẳng mà không cần tab.
 *
 * Token MDM là chuỗi đục, không refresh token, `expires_in` 30 ngày (đo 23/10/2026). Lệnh đầu tiên đọc token
 * từ tab rồi cất vào đây; lệnh sau lấy ra dùng luôn. Server trả 401 thì AutoSession xoá cache và lấy lại từ tab.
 *
 * Bảo mật:
 *  - Ghi qua stdin của `security -i`, không đặt token lên dòng lệnh (dòng lệnh lộ trong `ps`).
 *  - Đọc bằng `security find-generic-password -w`: giá trị chỉ đi vào stdout của tiến trình con, không in, không log.
 *  - Mọi lệnh `security` có timeout: Keychain đang khoá có thể treo vô hạn (đã gặp với gws) → coi như không có cache.
 *  - Ngoài macOS, hoặc tắt bằng `--token-cache off` / `MDM_TOKEN_CACHE=off`: không có cache (NullTokenCache).
 */
import { execFile as nodeExecFile } from 'node:child_process';
import { MdmError } from './mdm-core.mjs';

export const TOKEN_MAX_AGE_MS = 30 * 24 * 3600 * 1000;
const SERVICE = 'mwg-mdm-token';

/** Cache rỗng: dùng khi tắt cache hoặc không phải macOS. */
export class NullTokenCache {
  get enabled() { return false; }
  async get() { return null; }
  async set() { return false; }
  async clear() { return false; }
}

/** Keychain ở dạng chuỗi hex của JSON {token, savedAt} — hex để khỏi lo dấu nháy khi đi qua `security -i`. */
export const encodeEntry = (token, savedAt) => Buffer.from(JSON.stringify({ token, savedAt }), 'utf8').toString('hex');
export function decodeEntry(hex) {
  try {
    const o = JSON.parse(Buffer.from(String(hex).trim(), 'hex').toString('utf8'));
    return o && typeof o.token === 'string' && o.token.length >= 16 && Number.isFinite(o.savedAt) ? o : null;
  } catch { return null; }
}

export class KeychainTokenCache {
  /** `account` tách cache theo máy chủ API (đổi config sang hệ khác thì không lẫn token). */
  constructor({ account, execFileFn = nodeExecFile, timeoutMs = 5000, maxAgeMs = TOKEN_MAX_AGE_MS, now = Date.now } = {}) {
    if (!account) throw new Error('KeychainTokenCache cần account');
    Object.assign(this, { account, execFileFn, timeoutMs, maxAgeMs, now });
  }

  get enabled() { return true; }

  /** Chạy `security`, trả {ok, stdout}; lỗi, timeout hay Keychain khoá đều thành ok:false (không ném, không lộ chi tiết). */
  _security(args, input) {
    return new Promise((resolve) => {
      let child;
      try {
        child = this.execFileFn('security', args, { timeout: this.timeoutMs, maxBuffer: 64 * 1024 }, (err, stdout) => {
          resolve(err ? { ok: false } : { ok: true, stdout: String(stdout || '') });
        });
      } catch { resolve({ ok: false }); return; }
      if (input != null && child && child.stdin) { child.stdin.on('error', () => {}); child.stdin.end(input); }
    });
  }

  /** Token còn trong hạn, hoặc null. Quá hạn thì xoá luôn. */
  async get() {
    const r = await this._security(['find-generic-password', '-s', SERVICE, '-a', this.account, '-w']);
    if (!r.ok) return null;
    const e = decodeEntry(r.stdout);
    if (!e) return null;
    if (this.now() - e.savedAt > this.maxAgeMs) { await this.clear(); return null; }
    return e.token;
  }

  async set(token) {
    if (typeof token !== 'string' || token.length < 16) return false;
    const line = `add-generic-password -U -s "${SERVICE}" -a "${this.account}" -l "MDM token (onpage-mdm-khai-bao)" -w "${encodeEntry(token, this.now())}"\n`;
    return (await this._security(['-i'], line)).ok;
  }

  async clear() {
    return (await this._security(['delete-generic-password', '-s', SERVICE, '-a', this.account])).ok;
  }
}

/** Cache theo cờ CLI/env: `off` hoặc không phải macOS → NullTokenCache. */
export function tokenCacheFor(cfg, setting = process.env.MDM_TOKEN_CACHE || 'on', platform = process.platform) {
  if (!['on', 'off'].includes(setting)) throw new MdmError(`--token-cache phải là on | off (nhận "${setting}")`, 2);
  if (setting === 'off' || platform !== 'darwin') return new NullTokenCache();
  return new KeychainTokenCache({ account: new URL(cfg.apiBase).host });
}
