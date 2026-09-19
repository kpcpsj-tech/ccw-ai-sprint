import crypto from "node:crypto";

/* ===================== 고정 데이터 ===================== */

/** 결선 진출자 10인. id 는 투표·제출 식별자입니다. */
export const FINALISTS = [
  { id: "1", name: "성원제", cohort: 4, task: "자동영상편집 (타임라인 기준)" },
  { id: "2", name: "전혜선", cohort: 5, task: "정산합시다 — 웹소설 정산 효율화 사이트" },
  { id: "3",    name: "최예지", cohort: 5, task: "레퍼런스를 기획 방향으로 번역하는 AI 콘텐츠 디렉터" },
  { id: "4", name: "신은정", cohort: 5, task: "K-IP 1page report" },
  { id: "5",    name: "김민지", cohort: 2, task: "해외 콘텐츠 배급 통합 대시보드" },
  { id: "6", name: "양영주", cohort: 3, task: "웹소설 퍼블리싱 & 투고 자동화 에이전트" },
  { id: "7",  name: "남가현", cohort: 4, task: "가현 피디 스튜디오" },
  { id: "8",     name: "조은지", cohort: 5, task: "ScenePulse — 업로드 영상 반응 추이 분석" },
  { id: "9", name: "박성현", cohort: 5, task: "contest brief" },
  { id: "10",    name: "조하늘", cohort: 4, task: "라이츠가이드 대시보드" }
];

/** 대면 멘토링 10월 2일 슬롯. 12시는 점심. */
export const SLOTS = (() => {
  const out = [];
  for (let h = 9; h <= 17; h++) {
    out.push(h === 12
      ? { time: "12:00", open: false, why: "점심" }
      : { time: `${String(h).padStart(2, "0")}:00`, open: true });
  }
  return out;
})();

export const MAX_VOTES_PER_PHONE = 3;
/** 같은 IP에서 이 수 이상 들어오면 자동 제외 */
export const IP_FLAG_THRESHOLD = 5;
/** 투표 기간 (KST) */
export const VOTE_OPEN  = process.env.VOTE_OPEN  || "2026-11-23T00:00:00+09:00";
export const VOTE_CLOSE = process.env.VOTE_CLOSE || "2026-12-04T14:00:00+09:00";

/* ===================== 유틸 ===================== */

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

export function fail(res, status, message, extra = {}) {
  json(res, status, { ok: false, message, ...extra });
}

export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function constantEquals(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** 대소문자·하이픈·공백을 무시하고 비교합니다. */
export function normalizePw(v) {
  return String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function checkPassword(req, envName) {
  const expected = normalizePw(process.env[envName]);
  if (!expected) return { ok: false, reason: "서버에 비밀번호가 설정되지 않았습니다." };
  const given = normalizePw(req.headers["x-ccw-pw"]);
  if (!given) return { ok: false, reason: "비밀번호가 필요합니다." };
  if (!constantEquals(given, expected)) return { ok: false, reason: "비밀번호가 일치하지 않습니다." };
  return { ok: true };
}

export function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.socket?.remoteAddress || "unknown";
}

export function maskIp(ip) {
  const v4 = ip.match(/^(\d+)\.(\d+)\.\d+\.(\d+)$/);
  if (v4) return `${v4[1]}.${v4[2]}.***.${v4[3]}`;
  if (ip.includes(":")) return ip.split(":").slice(0, 2).join(":") + ":***";
  return ip;
}

/** 01012345678 / 010-1234-5678 → 01012345678. 형식이 아니면 null. */
export function normalizePhone(v) {
  const d = String(v || "").replace(/\D/g, "");
  return /^01[016789]\d{7,8}$/.test(d) ? d : null;
}

export function maskPhone(digits) {
  const head = digits.slice(0, 3);
  const tail = digits.slice(-4);
  return `${head}-****-${tail}`;
}

export function hashPhone(digits) {
  const salt = process.env.PHONE_SALT || "ccw-ai-sprint";
  return crypto.createHmac("sha256", salt).update(digits).digest("hex").slice(0, 32);
}

export function nowIso() {
  return new Date().toISOString();
}

export function newId() {
  return crypto.randomUUID();
}

export function votingWindow(at = new Date()) {
  const t = at.getTime();
  if (t < Date.parse(VOTE_OPEN)) return { state: "before", opensAt: VOTE_OPEN };
  if (t > Date.parse(VOTE_CLOSE)) return { state: "closed", closedAt: VOTE_CLOSE };
  return { state: "open", closesAt: VOTE_CLOSE };
}

/** 같은 IP에서 임계치 이상 들어온 표의 id 집합 */
export function autoExcludedIds(votes) {
  const byIp = new Map();
  for (const v of votes) {
    if (v.status === "취소") continue;
    if (!byIp.has(v.ip)) byIp.set(v.ip, []);
    byIp.get(v.ip).push(v);
  }
  const out = new Set();
  for (const [, list] of byIp) {
    if (list.length >= IP_FLAG_THRESHOLD) list.forEach((v) => out.add(v.id));
  }
  return out;
}

export function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  return "﻿" + rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
}

/** 2026-12-04T05:12:00.000Z → 2026-12-04 14:12 (KST) */
export function kst(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}
