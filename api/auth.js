/** POST /api/auth  { role: "finalist" | "admin" } — 비밀번호만 확인합니다. */
import { json, fail, readBody, checkPassword } from "./_lib/util.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "POST만 지원합니다.");
  const { role } = await readBody(req);
  const envName = role === "admin" ? "ADMIN_PW" : role === "finalist" ? "FINALIST_PW" : null;
  if (!envName) return fail(res, 400, "알 수 없는 자격입니다.");
  const auth = checkPassword(req, envName);
  if (!auth.ok) return fail(res, 401, auth.reason);
  json(res, 200, { ok: true, role });
}
