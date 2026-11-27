/**
 * GET /api/kakao — 카카오 로그인으로 본인 확인
 *   1) 코드 없이 열면 카카오 로그인 화면으로 보냅니다.
 *   2) 카카오가 ?code= 를 붙여 다시 보내면 회원번호를 확인하고,
 *      투표 토큰을 만들어 "/#kakao=토큰" 으로 사이트에 돌려보냅니다.
 * 닉네임 · 전화번호 · 이메일은 받지 않고 회원번호만 씁니다. 회원번호는 해시해서만 저장합니다.
 *
 * Vercel 환경변수
 *   KAKAO_REST_KEY        카카오 디벨로퍼스 → 내 애플리케이션 → 앱 키 → REST API 키
 *   KAKAO_CLIENT_SECRET   (선택) 카카오 로그인 → 보안 → Client Secret 을 "사용함"으로 둔 경우 그 코드
 * 카카오 디벨로퍼스에 등록할 Redirect URI:  https://(사이트 주소)/api/kakao
 */
import crypto from "node:crypto";
import { hashPhone, votingWindow } from "./_lib/util.js";
import { makeToken } from "./_lib/otp.js";

const KEY = process.env.KAKAO_REST_KEY || "";
const CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET || "";
const COOKIE = "ccw_kst";
const AUTH = process.env.KAKAO_AUTH_BASE || "https://kauth.kakao.com";   /* 테스트용으로만 바꿉니다 */
const API = process.env.KAKAO_API_BASE || "https://kapi.kakao.com";

function go(res, location, cookie) {
  res.statusCode = 302;
  res.setHeader("location", location);
  res.setHeader("cache-control", "no-store");
  if (cookie) res.setHeader("set-cookie", cookie);
  res.end();
}
const back = (res, msg) =>
  go(res, "/#kakao_err=" + encodeURIComponent(msg), `${COOKIE}=; Path=/api/kakao; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);

export default async function handler(req, res) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || (/^localhost|^127\./.test(host) ? "http" : "https");
  const redirectUri = `${proto}://${host}/api/kakao`;
  const q = new URL(req.url, redirectUri).searchParams;

  if (!KEY) return back(res, "카카오 인증이 아직 설정되지 않았습니다. 운영사무국에 알려 주세요.");
  const w = votingWindow();
  if (w.state === "before") return back(res, "청중 투표는 11월 30일(월) 00:00에 열립니다.");
  if (w.state === "closed") return back(res, "청중 투표가 마감되었습니다.");

  if (q.get("error")) return back(res, "카카오 인증을 취소했습니다. 다시 시도해 주세요.");

  /* 1) 로그인 시작 */
  if (!q.get("code")) {
    const nonce = crypto.randomBytes(16).toString("hex");
    const url = AUTH + "/oauth/authorize?response_type=code"
      + "&client_id=" + encodeURIComponent(KEY)
      + "&redirect_uri=" + encodeURIComponent(redirectUri)
      + "&state=" + nonce;
    return go(res, url, `${COOKIE}=${nonce}; Path=/api/kakao; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);
  }

  /* 2) 카카오에서 돌아옴 */
  const cookie = String(req.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  const nonce = cookie ? cookie.slice(COOKIE.length + 1) : "";
  if (!nonce || nonce !== q.get("state"))
    return back(res, "인증 시간이 지났거나 다른 창에서 열렸습니다. 같은 창에서 다시 시도해 주세요.");

  try {
    const form = new URLSearchParams({ grant_type: "authorization_code", client_id: KEY,
      redirect_uri: redirectUri, code: q.get("code") });
    if (CLIENT_SECRET) form.set("client_secret", CLIENT_SECRET);
    const tr = await fetch(AUTH + "/oauth/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" }, body: form
    });
    const tj = await tr.json().catch(() => ({}));
    if (!tj.access_token) {
      console.error("kakao token", tr.status, JSON.stringify(tj).slice(0, 300));
      return back(res, "카카오 인증에 실패했습니다. 다시 시도해 주세요. (" + (tj.error_code || tj.error || tr.status) + ")");
    }
    const ur = await fetch(API + "/v2/user/me", { headers: { authorization: "Bearer " + tj.access_token } });
    const uj = await ur.json().catch(() => ({}));
    if (!uj.id) {
      console.error("kakao me", ur.status, JSON.stringify(uj).slice(0, 300));
      return back(res, "카카오 회원 정보를 확인하지 못했습니다. 다시 시도해 주세요.");
    }
    const id = String(uj.id);
    const token = makeToken(hashPhone("kakao:" + id), "카카오 ****" + id.slice(-4));
    /* 카카오 접속 토큰은 더 쓰지 않으므로 바로 끊어 둡니다 (실패해도 무시) */
    fetch(API + "/v1/user/logout", { method: "POST", headers: { authorization: "Bearer " + tj.access_token } }).catch(() => {});
    return go(res, "/#kakao=" + token, `${COOKIE}=; Path=/api/kakao; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  } catch (e) {
    console.error("kakao", e);
    return back(res, "카카오 인증 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.");
  }
}
