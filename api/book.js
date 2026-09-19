/**
 * POST /api/book   { action: "create" | "cancel", name, slot }
 * 진출자 비밀번호(x-ccw-pw)가 필요합니다. 10월 2일 대면 멘토링 1회 선착순.
 */
import { read, append, setStatus, BOOKING_TAB } from "./_lib/store.js";
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
    const all = await read(BOOKING_TAB);
    const live = all.filter((b) => b.status === "확정" && b.method === "대면");

    if (body.action === "cancel") {
      const mine = all.find((b) => b.name === name && b.method === "대면" && b.status === "확정");
      if (!mine) return fail(res, 404, "취소할 예약이 없습니다.");
      await setStatus(BOOKING_TAB, mine._row, "취소");
      return json(res, 200, { ok: true, cancelled: mine.slot });
    }

    const slot = String(body.slot || "").trim();
    const known = SLOTS.find((s) => s.time === slot && s.open);
    if (!known) return fail(res, 400, "선택할 수 없는 시간입니다.");

    if (live.some((b) => b.name === name))
      return fail(res, 409, "이미 10월 2일 대면 멘토링을 신청하셨습니다. 1회만 신청할 수 있습니다.");
    if (live.some((b) => b.slot === slot))
      return fail(res, 409, `${slot} 은(는) 이미 신청된 시간입니다.`, { taken: true });

    const row = {
      id: newId(), name, slot, method: "대면",
      created_at: nowIso(), status: "확정"
    };
    await append(BOOKING_TAB, row);

    // 같은 순간에 두 명이 같은 슬롯을 눌렀을 때를 대비해 다시 읽어 확인합니다.
    const after = (await read(BOOKING_TAB))
      .filter((b) => b.status === "확정" && b.method === "대면" && b.slot === slot)
      .sort((a, b) => (a.created_at === b.created_at ? a.id.localeCompare(b.id)
                                                     : a.created_at.localeCompare(b.created_at)));
    if (after.length > 1 && after[0].id !== row.id) {
      const mine = after.find((b) => b.id === row.id);
      if (mine) await setStatus(BOOKING_TAB, mine._row, "취소");
      return fail(res, 409, `${slot} 은(는) 방금 다른 분이 먼저 신청했습니다. 다른 시간을 골라 주세요.`, { taken: true });
    }

    json(res, 200, { ok: true, booking: { name, slot, date: FACE_DATE, at: kst(row.created_at) } });
  } catch (e) {
    fail(res, 500, e.message);
  }
}
