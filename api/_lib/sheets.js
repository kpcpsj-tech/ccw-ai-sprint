/**
 * Google Sheets 드라이버 — 외부 패키지 없이 서비스 계정 JWT로 직접 인증합니다.
 * 필요한 환경변수:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL   서비스 계정 이메일
 *   GOOGLE_PRIVATE_KEY             서비스 계정 비공개 키 (PEM, \n 이스케이프 허용)
 *   SHEET_ID                       스프레드시트 ID
 */
import crypto from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const API = "https://sheets.googleapis.com/v4/spreadsheets";

let cachedToken = null; // { token, expiresAt }

function b64url(buf) {
  return Buffer.from(buf).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function privateKey() {
  const raw = process.env.GOOGLE_PRIVATE_KEY || "";
  // Vercel 환경변수에 붙여넣으면 줄바꿈이 \n 문자열로 들어옵니다.
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = privateKey();
  if (!email || !key) throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY 가 설정되지 않았습니다.");

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600
  }));
  const signature = b64url(
    crypto.sign("RSA-SHA256", Buffer.from(`${header}.${claim}`), key)
  );

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${signature}`
    })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`구글 인증 실패: ${json.error_description || json.error || res.status}`);

  cachedToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.token;
}

async function call(path, init = {}) {
  const token = await accessToken();
  const res = await fetch(`${API}/${process.env.SHEET_ID}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers || {}) }
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`시트 오류 ${res.status}: ${json.error?.message || text.slice(0, 200)}`);
  return json;
}

/** 탭 전체를 읽어 [헤더, ...행] 형태의 객체 배열로 돌려줍니다. */
export async function readRows(tab) {
  const json = await call(`/values/${encodeURIComponent(tab)}!A:Z`);
  const values = json.values || [];
  if (values.length < 2) return [];
  const head = values[0];
  return values.slice(1)
    .map((row, i) => {
      const o = { _row: i + 2 };
      head.forEach((h, j) => { o[h] = row[j] ?? ""; });
      return o;
    })
    .filter((o) => Object.keys(o).some((k) => k !== "_row" && o[k] !== ""));
}

/** 탭 끝에 한 줄 붙입니다. 헤더 순서를 따릅니다. */
export async function appendRow(tab, columns, obj) {
  await call(
    `/values/${encodeURIComponent(tab)}!A:Z:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [columns.map((c) => String(obj[c] ?? ""))] }) }
  );
}

/** 특정 행의 한 칸을 고쳐 씁니다. */
export async function updateCell(tab, rowNumber, columns, column, value) {
  const idx = columns.indexOf(column);
  if (idx < 0) throw new Error(`알 수 없는 열: ${column}`);
  const col = String.fromCharCode(65 + idx);
  await call(
    `/values/${encodeURIComponent(tab)}!${col}${rowNumber}?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ values: [[String(value)]] }) }
  );
}

/** 탭이 없으면 만들고 헤더를 넣습니다. */
export async function ensureTab(tab, columns) {
  const meta = await call("?fields=sheets.properties.title");
  const exists = (meta.sheets || []).some((s) => s.properties.title === tab);
  if (!exists) {
    await call(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] })
    });
  }
  const head = await call(`/values/${encodeURIComponent(tab)}!A1:Z1`);
  if (!head.values || !head.values[0] || head.values[0].length === 0) {
    await call(`/values/${encodeURIComponent(tab)}!A1?valueInputOption=RAW`, {
      method: "PUT", body: JSON.stringify({ values: [columns] })
    });
  }
}
