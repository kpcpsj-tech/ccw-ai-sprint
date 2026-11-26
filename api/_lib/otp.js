/**
 * 이메일 인증. 서버에 따로 저장하지 않는 방식입니다.
 *  1) 인증번호를 메일로 보내고, 그 번호를 확인할 수 있는 "티켓"(서명된 쪽지)을 화면에 돌려줍니다.
 *  2) 화면이 티켓 + 사용자가 넣은 번호를 보내면, 맞을 때 "투표 토큰"을 줍니다.
 *  3) 투표할 때 이 토큰이 있어야 표가 들어갑니다. 토큰은 3시간 동안 유효합니다.
 *
 * 메일은 여러 Gmail 계정에 하나씩 붙인 "발송 스크립트"(apps-script/Mailer.gs)가 보냅니다.
 * Gmail 무료 계정은 하루 약 100통까지라, 한 계정이 다 쓰면 다음 계정으로 자동으로 넘어갑니다.
 *
 * Vercel 환경변수
 *   MAILER_URLS     발송 스크립트 웹앱 주소들. 쉼표나 줄바꿈으로 구분합니다.
 *   APPS_SCRIPT_SECRET  발송 스크립트 안의 SECRET 과 같은 값 (시트 스크립트와 같은 값을 씁니다)
 *   VOTE_SECRET     (선택) 서명용 비밀값. 없으면 APPS_SCRIPT_SECRET 을 씁니다.
 *   MAIL_MOCK=1     (개발용) 메일을 보내지 않고 인증번호를 응답에 담아 줍니다.
 * MAILER_URLS 가 비어 있으면 이메일 형식만 확인합니다.
 */
import crypto from "node:crypto";

const MAILERS = String(process.env.MAILER_URLS || "").split(/[\s,]+/).filter((u) => /^https?:\/\//.test(u));
const SECRET = process.env.APPS_SCRIPT_SECRET || "";
export const MAIL_MOCK = process.env.MAIL_MOCK === "1";
export const MAIL_ON = MAIL_MOCK || !!(MAILERS.length && SECRET);
export const MAILER_COUNT = MAILERS.length;

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

/* ---- 발송 스크립트 호출 ---- */
async function callMailer(url, payload, ms = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, {
      method: "POST", redirect: "follow", signal: ctl.signal,
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...payload, secret: SECRET })
    });
    const t2 = await r.text();
    try { return JSON.parse(t2); } catch { return { ok: false, message: "응답 " + r.status }; }
  } catch (e) {
    return { ok: false, message: e.name === "AbortError" ? "시간 초과" : e.message };
  } finally { clearTimeout(t); }
}

/* 오늘 한도를 다 쓴 계정은 잠시 건너뜁니다 (서버 한 대 안에서 기억) */
const spentUntil = new Map();
let cursor = 0;

/** 인증번호 메일 보내기. 한도가 남은 계정을 차례로 찾아 보냅니다. */
export async function sendMail(to, code) {
  if (MAIL_MOCK) return { mock: true };
  const now = Date.now();
  const order = MAILERS.map((_, k) => MAILERS[(cursor + k) % MAILERS.length]);
  const fresh = order.filter((u) => !(spentUntil.get(u) > now));
  const tryList = fresh.length ? fresh : order;   // 모두 다 썼다고 기억돼 있어도 한 번은 다시 확인
  const why = [];
  for (const url of tryList) {
    const j = await callMailer(url, { action: "send", to, code });
    if (j.ok) {
      cursor = (MAILERS.indexOf(url) + 1) % MAILERS.length;   // 다음 메일은 다음 계정부터 (고르게 나눠 쓰기)
      if (j.quota === 0) spentUntil.set(url, now + 60 * 60 * 1000);
      return j;
    }
    if (j.quota === 0) spentUntil.set(url, now + 60 * 60 * 1000);
    if (j.bad) {   /* 받는 주소 자체가 잘못된 경우 다른 계정으로 다시 보내지 않음 */
      const e = new Error("이 이메일 주소로는 메일을 보낼 수 없습니다. 주소를 확인해 주세요.");
      e.detail = j.message || ""; throw e;
    }
    why.push(MAILERS.indexOf(url) + 1 + ":" + (j.quota === 0 ? "한도" : String(j.message || "").slice(0, 60)));
  }
  console.error("mailer all failed", why.join(" | "));
  const err = new Error(why.every((w) => /한도/.test(w))
    ? "오늘 인증 메일 발송량이 많아 잠시 보낼 수 없습니다. 운영사무국(koccaccw@gmail.com)에 알려 주세요."
    : "인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
  err.detail = why.join(" | ");
  throw err;
}

/** 계정별 남은 발송량 (상태 확인용) */
export async function mailerQuotas() {
  return Promise.all(MAILERS.map(async (url, k) => {
    const j = await callMailer(url, { action: "quota" }, 15000);
    return { no: k + 1, ok: !!j.ok, quota: j.ok ? j.quota : null, account: j.account || "", error: j.ok ? undefined : j.message };
  }));
}
