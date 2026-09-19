/** GET /api/state — 누구나 볼 수 있는 현재 상태 (예약된 대면 슬롯, 투표 기간) */
import { read, BOOKING_TAB, VOTE_TAB } from "./_lib/store.js";
import { FINALISTS, SLOTS, MAX_VOTES_PER_PHONE, json, fail, votingWindow,
         normalizePhone, hashPhone, kst } from "./_lib/util.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return fail(res, 405, "GET만 지원합니다.");

  try {
    const bookings = (await read(BOOKING_TAB)).filter((b) => b.status === "확정");
    const taken = {};
    for (const b of bookings) if (b.method === "대면") taken[b.slot] = { name: b.name, at: kst(b.created_at) };

    const window = votingWindow();

    // 전화번호를 주면 그 번호가 이미 어디에 투표했는지 알려줍니다.
    let myVotes = null;
    const phone = normalizePhone(req.query?.phone ?? new URL(req.url, "http://x").searchParams.get("phone"));
    if (phone) {
      const hash = hashPhone(phone);
      myVotes = (await read(VOTE_TAB))
        .filter((v) => v.phone_hash === hash && v.status !== "취소")
        .map((v) => v.target_id);
    }

    json(res, 200, {
      ok: true,
      finalists: FINALISTS,
      slots: SLOTS,
      taken,
      vote: { ...window, maxPerPhone: MAX_VOTES_PER_PHONE, myVotes }
    });
  } catch (e) {
    fail(res, 500, e.message);
  }
}
