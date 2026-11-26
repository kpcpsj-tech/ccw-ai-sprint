/**
 * POST /api/vote   { email, token, targets: [id, ...] }
 * 이메일 인증(/api/otp)으로 받은 토큰이 있어야 합니다. 한 주소당 정확히 3표(서로 다른 3명).
 */
import { castVote } from "./_lib/store.js";
import { checkToken } from "./_lib/otp.js";
import { FINALISTS, MAX_VOTES_PER_PHONE, json, fail, readBody, votingWindow,
         normalizeEmail, maskEmail, hashPhone, clientIp, maskIp, newId, nowIso, ballotStatus } from "./_lib/util.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "POST만 지원합니다.");

  const w = votingWindow();
  if (w.state === "before") return fail(res, 403, "청중 투표는 11월 30일(월)에 열립니다.", { window: w });
  if (w.state === "closed") return fail(res, 403, "청중 투표가 마감되었습니다.", { window: w });

  const body = await readBody(req);
  const phone = normalizeEmail(body.email);   /* 시트 열 이름(phone_*)은 그대로 두고 이메일을 넣습니다 */
  if (!phone) return fail(res, 400, "이메일 주소를 확인해 주세요. (예: name@gmail.com)");

  if (!checkToken(body.token, hashPhone(phone)))
    return fail(res, 401, "이메일 인증이 만료되었습니다. 다시 인증해 주세요.", { reauth: true });

  const wanted = Array.isArray(body.targets) ? [...new Set(body.targets.map(String))] : [];
  if (wanted.some((t) => !FINALISTS.some((f) => f.id === t)))
    return fail(res, 400, "알 수 없는 투표 대상입니다.");
  if (wanted.length !== MAX_VOTES_PER_PHONE)
    return fail(res, 400, `결과물을 꼭 ${MAX_VOTES_PER_PHONE}개 골라 투표해 주세요.`);

  try {
    const hash = hashPhone(phone);
    const status = ballotStatus(w);
    const ip = clientIp(req), at = nowIso();
    const rows = wanted.map((t) => {
      const f = FINALISTS.find((x) => x.id === t);
      return { id: newId(), created_at: at, phone_hash: hash, phone_masked: maskEmail(phone),
               target_id: t, target_name: f.name, ip, ip_masked: maskIp(ip), status };
    });
    const r = await castVote(hash, status, rows);
    json(res, 200, { ok: true, votes: wanted, left: MAX_VOTES_PER_PHONE - wanted.length,
                     added: r.added || 0, test: status === "테스트" });
  } catch (e) {
    fail(res, 500, e.message);
  }
}
