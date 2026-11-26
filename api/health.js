/** GET /api/health — 시트 스크립트 연결과 새 기능(한 번에 저장) 여부만 확인합니다. 투표 내용은 읽지 않습니다. */
import { json } from "./_lib/util.js";
import * as script from "./_lib/script-store.js";
import { MAIL_ON, MAILER_COUNT, mailerQuotas } from "./_lib/otp.js";

export default async function handler(req, res) {
  const out = { ok: true, mail: MAIL_ON, mailers: MAILER_COUNT, store: process.env.APPS_SCRIPT_URL ? "script" : (process.env.STORE || "sheets") };
  if (out.store === "script") {
    const t0 = Date.now();
    try {
      await script.myVotes("health-check-no-such-phone", "유효");
      out.sheet = "연결됨"; out.fastVote = true;
    } catch (e) {
      out.sheet = /알 수 없는 action/.test(e.message) ? "연결됨" : "오류: " + e.message;
      out.fastVote = false;
    }
    out.ms = Date.now() - t0;
  }
  /* ?mail=1 이면 각 발송 계정의 오늘 남은 발송량도 확인합니다 */
  if (new URL(req.url, "http://x").searchParams.get("mail") === "1") {
    out.mailQuota = await mailerQuotas();
    out.mailLeft = out.mailQuota.reduce((a, m) => a + (m.quota || 0), 0);
  }
  json(res, 200, out);
}
