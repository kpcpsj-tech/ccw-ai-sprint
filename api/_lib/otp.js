/**
 * 휴대폰 문자 인증 (솔라피). 서버에 따로 저장하지 않는 방식입니다.
 *  1) 인증번호를 문자로 보내고, 그 번호를 확인할 수 있는 "티켓"(서명된 쪽지)을 화면에 돌려줍니다.
 *  2) 화면이 티켓 + 사용자가 넣은 번호를 보내면, 맞을 때 "투표 토큰"을 줍니다.
 *  3) 투표할 때 이 토큰이 있어야 표가 들어갑니다. 토큰은 3시간 동안 유효합니다.
 *
 * Vercel 환경변수
 *   SOLAPI_API_KEY, SOLAPI_API_SECRET  솔라피 콘솔 → API Key 관리
 *   SOLAPI_SENDER                      솔라피에 등록한 발신번호 (숫자만)
 *   VOTE_SECRET                        (선택) 서명용 비밀값. 없으면 SOLAPI_API_SECRET 를 씁니다.
 *   SOLAPI_MOCK=1                      (개발용) 문자를 보내지 않고 인증번호를 응답에 담아 줍니다.
 * 세 값(키 · 비밀키 · 발신번호)이 모두 있어야 문자 인증이 켜집니다. 없으면 번호 형식만 확인합니다.
 */
import crypto from "node:crypto";

const KEY = process.env.SOLAPI_API_KEY || "";
const SECRET = process.env.SOLAPI_API_SECRET || "";
const SENDER = (process.env.SOLAPI_SENDER || "").replace(/\D/g, "");
export const SMS_MOCK = process.env.SOLAPI_MOCK === "1";
export const SMS_ON = SMS_MOCK || !!(KEY && SECRET && SENDER);

const SIGN_KEY = process.env.VOTE_SECRET || SECRET || "ccw-dev-only-secret";
const CODE_TTL = 5 * 60 * 1000;          // 인증번호 5분
const TOKEN_TTL = 3 * 60 * 60 * 1000;    // 투표 토큰 3시간

const b64 = (s) => Buffer.from(s).toString("base64url");
const unb64 = (s) => Buffer.from(String(s || ""), "base64url").toString("utf8");
const hmac = (s) => crypto.createHmac("sha256", SIGN_KEY).update(s).digest("base64url");
function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* ---- 남용 방지 (서버 한 대 안에서의 간단한 제한) ---- */
const hits = new Map();
export function limited(key, max, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) { hits.set(key, list); return true; }
  list.push(now); hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return false;
}

export function newCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

/** 인증번호 확인용 티켓 */
export function makeTicket(phoneHash, code) {
  const body = b64(JSON.stringify({ p: phoneHash, e: Date.now() + CODE_TTL }));
  return body + "." + hmac("code|" + body + "|" + code);
}
export function checkTicket(ticket, phoneHash, code) {
  const [body, sig] = String(ticket || "").split(".");
  if (!body || !sig) return "인증 정보가 없습니다. 인증번호를 다시 받아 주세요.";
  let d; try { d = JSON.parse(unb64(body)); } catch { return "인증 정보가 올바르지 않습니다."; }
  if (d.p !== phoneHash) return "인증번호를 받은 번호와 다릅니다.";
  if (Date.now() > d.e) return "인증번호 유효시간(5분)이 지났습니다. 다시 받아 주세요.";
  if (!same(sig, hmac("code|" + body + "|" + String(code || "").trim()))) return "인증번호가 맞지 않습니다.";
  return null;
}

/** 투표 토큰 */
export function makeToken(phoneHash) {
  const body = b64(JSON.stringify({ p: phoneHash, e: Date.now() + TOKEN_TTL }));
  return body + "." + hmac("vote|" + body);
}
export function checkToken(token, phoneHash) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig || !same(sig, hmac("vote|" + body))) return false;
  try { const d = JSON.parse(unb64(body)); return d.p === phoneHash && Date.now() <= d.e; }
  catch { return false; }
}

/** 솔라피로 문자 보내기 */
export async function sendSms(to, text) {
  if (SMS_MOCK) return { mock: true };
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString("hex");
  const signature = crypto.createHmac("sha256", SECRET).update(date + salt).digest("hex");
  const r = await fetch("https://api.solapi.com/messages/v4/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `HMAC-SHA256 apiKey=${KEY}, date=${date}, salt=${salt}, signature=${signature}`
    },
    body: JSON.stringify({ message: { to: to.replace(/\D/g, ""), from: SENDER, text } })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    console.error("solapi", r.status, t.slice(0, 300));
    throw new Error("인증 문자를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  return r.json().catch(() => ({}));
}
