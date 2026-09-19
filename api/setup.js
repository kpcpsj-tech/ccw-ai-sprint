/** GET /api/setup — 시트 탭과 헤더를 만듭니다. 운영사무국 비밀번호 필요. */
import { setup } from "./_lib/store.js";
import { json, fail, checkPassword } from "./_lib/util.js";

export default async function handler(req, res) {
  const auth = checkPassword(req, "ADMIN_PW");
  if (!auth.ok) return fail(res, 401, auth.reason);
  try {
    json(res, 200, { ok: true, ...(await setup()) });
  } catch (e) {
    fail(res, 500, e.message);
  }
}
