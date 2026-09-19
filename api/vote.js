/**
 * POST /api/vote   { phone, targets: [id, ...] }
 * 비밀번호 없이 누구나. 한 번호당 최대 3표, 같은 대상에는 1표.
 */
import { read, append, setStatus, VOTE_TAB } from "./_lib/store.js";
import { FINALISTS, MAX_VOTES_PER_PHONE, json, fail, readBody, votingWindow,
         normalizePhone, maskPhone, hashPhone, clientIp, maskIp, newId, nowIso } from "./_lib/util.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "POST만 지원합니다.");

  const w = votingWindow();
  if (w.state === "before") return fail(res, 403, "청중 투표는 11월 23일(월)에 열립니다.", { window: w });
  if (w.state === "closed") return fail(res, 403, "청중 투표가 마감되었습니다.", { window: w });

  const body = await readBody(req);
  const phone = normalizePhone(body.phone);
  if (!phone) return fail(res, 400, "휴대폰 번호 형식이 올바르지 않습니다. (예: 010-1234-5678)");

  const wanted = Array.isArray(body.targets) ? [...new Set(body.targets.map(String))] : [];
  if (wanted.some((t) => !FINALISTS.some((f) => f.id === t)))
    return fail(res, 400, "알 수 없는 투표 대상입니다.");
  if (wanted.length > MAX_VOTES_PER_PHONE)
    return fail(res, 400, `한 번호당 최대 ${MAX_VOTES_PER_PHONE}표까지 투표할 수 있습니다.`);

  try {
    const hash = hashPhone(phone);
    const all = await read(VOTE_TAB);
    const mine = all.filter((v) => v.phone_hash === hash && v.status !== "취소");
    const current = new Set(mine.map((v) => v.target_id));
    const target = new Set(wanted);

    // 뺀 표는 취소, 새로 넣은 표는 추가 — 화면 상태를 그대로 반영합니다.
    for (const v of mine) {
      if (!target.has(v.target_id)) await setStatus(VOTE_TAB, v._row, "취소");
    }

    const ip = clientIp(req);
    const added = [];
    for (const t of wanted) {
      if (current.has(t)) continue;
      const f = FINALISTS.find((x) => x.id === t);
      const row = {
        id: newId(), created_at: nowIso(),
        phone_hash: hash, phone_masked: maskPhone(phone),
        target_id: t, target_name: f.name,
        ip, ip_masked: maskIp(ip), status: "유효"
      };
      await append(VOTE_TAB, row);
      added.push(t);
    }

    json(res, 200, {
      ok: true,
      votes: wanted,
      left: MAX_VOTES_PER_PHONE - wanted.length,
      added: added.length
    });
  } catch (e) {
    fail(res, 500, e.message);
  }
}
