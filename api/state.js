/** GET /api/state — 누구나 볼 수 있는 현재 상태 (투표 기간, 진출자, 문자 인증 여부)
 *  인증 토큰(x-vote-token)과 번호를 함께 주면 그 번호가 이미 투표한 대상도 알려 줍니다. */
import { read, VOTE_TAB } from "./_lib/store.js";
import { FINALISTS, MAX_VOTES_PER_PHONE, json, fail, votingWindow, normalizePhone, hashPhone } from "./_lib/util.js";
import { SMS_ON, checkToken } from "./_lib/otp.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return fail(res, 405, "GET만 지원합니다.");

  try {
    const window = votingWindow();
    let myVotes = null;
    const q = new URL(req.url, "http://x").searchParams;
    const phone = normalizePhone(req.query?.phone ?? q.get("phone"));
    if (phone) {
      const hash = hashPhone(phone);
      if (checkToken(req.headers["x-vote-token"], hash)) {
        myVotes = (await read(VOTE_TAB))
          .filter((v) => v.phone_hash === hash && v.status !== "취소")
          .map((v) => v.target_id);
      }
    }
    json(res, 200, {
      ok: true,
      finalists: FINALISTS,
      vote: { ...window, maxPerPhone: MAX_VOTES_PER_PHONE, sms: SMS_ON, myVotes }
    });
  } catch (e) {
    fail(res, 500, e.message);
  }
}
