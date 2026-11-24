/**
 * POST /api/otp  { action:"send", phone }                 → 인증번호 문자 발송, { ticket }
 * POST /api/otp  { action:"verify", phone, code, ticket } → { token } (투표할 때 사용)
 * 문자 인증이 꺼져 있으면(솔라피 키 없음) send 는 { sms:false, token } 을 바로 돌려줍니다.
 */
import { json, fail, readBody, votingWindow, normalizePhone, hashPhone, clientIp } from "./_lib/util.js";
import { SMS_ON, SMS_MOCK, limited, newCode, makeTicket, checkTicket, makeToken, sendSms } from "./_lib/otp.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "POST만 지원합니다.");

  const w = votingWindow();
  if (w.state === "before") return fail(res, 403, "청중 투표는 11월 30일(월) 00:00에 열립니다.");
  if (w.state === "closed") return fail(res, 403, "청중 투표가 마감되었습니다.");

  const body = await readBody(req);
  const phone = normalizePhone(body.phone);
  if (!phone) return fail(res, 400, "휴대폰 번호 형식이 올바르지 않습니다. (예: 010-1234-5678)");
  const hash = hashPhone(phone);
  const ip = clientIp(req);

  if (body.action === "verify") {
    if (limited("v:" + ip, 20, 10 * 60 * 1000) || limited("vp:" + hash, 8, 10 * 60 * 1000))
      return fail(res, 429, "확인 시도가 너무 많습니다. 10분 뒤 다시 시도해 주세요.");
    const why = checkTicket(body.ticket, hash, body.code);
    if (why) return fail(res, 400, why);
    return json(res, 200, { ok: true, token: makeToken(hash) });
  }

  // send
  if (!SMS_ON) return json(res, 200, { ok: true, sms: false, token: makeToken(hash) });

  if (limited("p:" + hash, 1, 60 * 1000))
    return fail(res, 429, "인증번호는 1분에 한 번만 받을 수 있습니다. 잠시 후 다시 눌러 주세요.");
  if (limited("pd:" + hash, 5, 24 * 60 * 60 * 1000))
    return fail(res, 429, "이 번호로는 오늘 인증번호를 더 받을 수 없습니다.");
  if (limited("i:" + ip, 15, 10 * 60 * 1000))
    return fail(res, 429, "요청이 너무 많습니다. 10분 뒤 다시 시도해 주세요.");

  const code = newCode();
  try {
    await sendSms(phone, `[CCW AI SPRINT] 청중 투표 인증번호 [${code}] 5분 안에 입력해 주세요.`);
  } catch (e) {
    return fail(res, 502, e.message);
  }
  json(res, 200, { ok: true, sms: true, ticket: makeTicket(hash, code), ...(SMS_MOCK ? { mockCode: code } : {}) });
}
