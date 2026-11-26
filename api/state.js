/** GET /api/state — 누구나 볼 수 있는 현재 상태 (투표 기간, 진출자, 문자 인증 여부)
 *  인증 토큰(x-vote-token)과 번호를 함께 주면 그 번호가 이미 투표한 대상도 알려 줍니다. */
import { myVotes as storeMyVotes, read, VOTE_TAB } from "./_lib/store.js";

/* 누적 투표수(살아 있는 표 줄 수). 접속할 때마다 시트를 읽지 않도록 서버에 1분간 기억해 둡니다. */
const TOTAL_TTL = 60 * 1000;
let totalCache = { at: 0, status: "", n: null };
async function totalVotes(status) {
  if (totalCache.status === status && Date.now() - totalCache.at < TOTAL_TTL) return totalCache.n;
  try {
    const n = (await read(VOTE_TAB)).filter((v) => v.status === status).length;
    totalCache = { at: Date.now(), status, n };
  } catch { /* 시트가 잠시 바쁘면 예전 값을 그대로 씁니다 */ }
  return totalCache.n;
}
import { FINALISTS, MAX_VOTES_PER_PHONE, json, fail, votingWindow, normalizeEmail, hashPhone, ballotStatus } from "./_lib/util.js";
import { MAIL_ON, checkToken } from "./_lib/otp.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return fail(res, 405, "GET만 지원합니다.");

  try {
    const window = votingWindow();
    let myVotes = null;
    const q = new URL(req.url, "http://x").searchParams;
    const phone = normalizeEmail(req.query?.email ?? q.get("email"));
    if (phone) {
      const hash = hashPhone(phone);
      if (checkToken(req.headers["x-vote-token"], hash)) {
        myVotes = await storeMyVotes(hash, ballotStatus(window));
      }
    }
    const total = (window.state === "open" || window.state === "test" || window.state === "closed")
      ? await totalVotes(ballotStatus(window)) : null;
    json(res, 200, {
      ok: true,
      total,
      finalists: FINALISTS,
      vote: { ...window, maxPerPhone: MAX_VOTES_PER_PHONE, sms: MAIL_ON, myVotes }
    });
  } catch (e) {
    fail(res, 500, e.message);
  }
}
