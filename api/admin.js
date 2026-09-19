/**
 * GET /api/admin            운영 현황 (KPI · 집계 · 원장 · 중복 의심)
 * GET /api/admin?csv=ballot 투표 원장 CSV
 * GET /api/admin?csv=flag   중복 의심 CSV
 * GET /api/admin?csv=book   대면 예약 CSV
 * 운영사무국 비밀번호(x-ccw-pw) 필요.
 */
import { read, BOOKING_TAB, VOTE_TAB } from "./_lib/store.js";
import { FINALISTS, SLOTS, IP_FLAG_THRESHOLD, json, fail, checkPassword,
         autoExcludedIds, toCsv, kst } from "./_lib/util.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return fail(res, 405, "GET만 지원합니다.");

  const auth = checkPassword(req, "ADMIN_PW");
  if (!auth.ok) return fail(res, 401, auth.reason);

  try {
    const url = new URL(req.url, "http://x");
    const bookings = await read(BOOKING_TAB);
    const votes = (await read(VOTE_TAB)).filter((v) => v.status !== "취소");

    const excluded = autoExcludedIds(votes);
    const ballot = votes
      .map((v) => ({ ...v, excluded: excluded.has(v.id) }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    // IP별 묶음
    const ipMap = new Map();
    for (const v of votes) {
      if (!ipMap.has(v.ip)) ipMap.set(v.ip, []);
      ipMap.get(v.ip).push(v);
    }
    const flags = [...ipMap.entries()]
      .filter(([, list]) => list.length >= IP_FLAG_THRESHOLD)
      .map(([ip, list]) => ({
        ip: list[0].ip_masked || ip,
        phones: [...new Set(list.map((v) => v.phone_masked))],
        n: list.length,
        at: kst(list.map((v) => v.created_at).sort().at(-1))
      }))
      .sort((a, b) => b.n - a.n);

    const csv = url.searchParams.get("csv");
    if (csv) {
      let rows, name;
      if (csv === "ballot") {
        name = "CCW_투표원장";
        rows = [["연번", "투표시각", "휴대폰번호", "투표대상", "기수", "과제명", "IP", "판정"]];
        ballot.forEach((v, i) => {
          const f = FINALISTS.find((x) => x.id === v.target_id) || {};
          rows.push([i + 1, kst(v.created_at), v.phone_masked, v.target_name,
                     f.cohort ? `${f.cohort}기` : "", f.task || "", v.ip_masked,
                     v.excluded ? "자동제외" : "유효"]);
        });
      } else if (csv === "flag") {
        name = "CCW_중복의심";
        rows = [["IP", "사용된 번호", "표 수", "최근 시각", "판정"]];
        flags.forEach((f) => rows.push([f.ip, f.phones.join(" / "), f.n, f.at, "자동 제외"]));
      } else if (csv === "book") {
        name = "CCW_대면예약";
        rows = [["성명", "일자", "시간", "방식", "신청시각", "상태"]];
        bookings.forEach((b) => rows.push([b.name, "2026-10-02", b.slot, b.method, kst(b.created_at), b.status]));
      } else {
        return fail(res, 400, "알 수 없는 CSV 종류입니다.");
      }

      const stamp = kst(new Date().toISOString()).replace(/[-: ]/g, "").slice(0, 13);
      res.statusCode = 200;
      res.setHeader("content-type", "text/csv; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.setHeader("content-disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(`${name}_${stamp}.csv`)}`);
      return res.end(toCsv(rows));
    }

    // 집계
    const tally = FINALISTS.map((f) => {
      const list = votes.filter((v) => v.target_id === f.id);
      const x = list.filter((v) => excluded.has(v.id)).length;
      return { id: f.id, name: f.name, task: f.task, total: list.length, excluded: x, net: list.length - x };
    }).sort((a, b) => b.net - a.net);

    const faceLive = bookings.filter((b) => b.status === "확정" && b.method === "대면");
    const openSlots = SLOTS.filter((s) => s.open).length;

    json(res, 200, {
      ok: true,
      kpi: {
        faceOpen: openSlots - faceLive.length,
        faceTotal: openSlots,
        votesTotal: votes.length,
        votersApprox: new Set(votes.map((v) => v.phone_hash)).size,
        autoExcluded: excluded.size,
        flaggedIps: flags.length
      },
      tally,
      bookings: bookings
        .map((b) => ({ ...b, at: kst(b.created_at) }))
        .sort((a, b) => a.slot.localeCompare(b.slot)),
      ballot: ballot.slice(0, 50).map((v) => {
        const f = FINALISTS.find((x) => x.id === v.target_id) || {};
        return { at: kst(v.created_at), phone: v.phone_masked, name: v.target_name,
                 task: f.task || "", ip: v.ip_masked, ok: !v.excluded };
      }),
      ballotCount: ballot.length,
      flags
    });
  } catch (e) {
    fail(res, 500, e.message);
  }
}
