/**
 * POST /api/book   { action: "create" | "cancel", name, slot }
 * 진출자 비밀번호(x-ccw-pw)가 필요합니다. 10월 2일 대면 멘토링 1회 선착순.
 */
import { read, appendUnique, setStatus, BOOKING_TAB } from "./_lib/store.js";
import { FINALISTS, SLOTS, json, fail, readBody, checkPassword, newId, nowIso, kst } from "./_lib/util.js";

const FACE_DATE = "2026-10-02";

export default async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "POST만 지원합니다.");

  const auth = checkPassword(req, "FINALIST_PW");
  if (!auth.ok) return fail(res, 401, auth.reason);

  const body = await readBody(req);
  const name = String(body.name || "").trim();
  if (!FINALISTS.some((f) => f.name === name)) return fail(res, 400, "진출자 명단에 없는 이름입니다.");

  try {
    if (body.action === "cancel") {
      const all = await read(BOOKING_TAB);
      const mine = all.find((b) => b.name === name && b.method === "대면" && b.status === "확정");
      if (!mine) return fail(res, 404, "취소할 예약이 없습니다.");
      await setStatus(BOOKING_TAB, mine._row, "취소");
      return json(res, 200, { ok: true, cancelled: mine.slot });
    }

    const slot = String(body.slot || "").trim();
    const known = SLOTS.find((s) => s.time === slot && s.open);
    if (!known) return fail(res, 400, "선택할 수 없는 시간입니다.");

    const row = {
      id: newId(), name, slot, method: "대면",
      created_at: nowIso(), status: "확정"
    };

    // 이름 중복(1회 제한)과 시간대 중복을 한 번에, 경합 없이 확인하고 넣습니다.
    const r = await appendUnique(BOOKING_TAB, row, [
      { col: "name", value: name,
        message: "이미 10월 2일 대면 멘토링을 신청하셨습니다. 1회만 신청할 수 있습니다." },
      { col: "slot", value: slot,
        message: `${slot} 은(는) 이미 신청된 시간입니다. 다른 시간을 골라 주세요.` }
    ]);
    if (!r.ok) return fail(res, 409, r.message, { taken: true });

    json(res, 200, { ok: true, booking: { name, slot, date: FACE_DATE, at: kst(row.created_at) } });
  } catch (e) {
    fail(res, 500, e.message);
  }
}
