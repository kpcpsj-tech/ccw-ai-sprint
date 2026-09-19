/**
 * Apps Script 드라이버 — 시트에 붙인 웹 앱을 통해 읽고 씁니다.
 * 서비스 계정도 JSON 키도 필요 없습니다.
 *   APPS_SCRIPT_URL      배포 주소 (/exec 로 끝남)
 *   APPS_SCRIPT_SECRET   스크립트 안의 SECRET 과 같은 값
 */

async function call(payload) {
  const url = process.env.APPS_SCRIPT_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url || !secret) throw new Error("APPS_SCRIPT_URL / APPS_SCRIPT_SECRET 이 설정되지 않았습니다.");

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, secret }),
      redirect: "follow"
    });
  } catch {
    throw new Error("시트 스크립트에 연결하지 못했습니다.");
  }

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch {
    // 로그인 화면 HTML 이 돌아오면 배포 설정이 잘못된 것입니다.
    throw new Error(/accounts\.google\.com|로그인/.test(text)
      ? "스크립트 배포의 액세스 권한이 '모든 사용자'인지 확인해 주세요."
      : `스크립트 응답을 읽지 못했습니다 (${res.status}).`);
  }
  if (!json.ok && json.conflict !== true) throw new Error(json.message || "시트 오류");
  return json;
}

export const read        = (tab)                   => call({ action: "read", tab }).then((j) => j.rows || []);
export const append      = (tab, row)              => call({ action: "append", tab, row }).then(() => undefined);
export const setStatus   = (tab, row, status)      => call({ action: "setStatus", tab, row, status }).then(() => undefined);
export const appendUnique= (tab, row, conflicts)   => call({ action: "appendUnique", tab, row, conflicts });
export const setup       = ()                      => call({ action: "setup" });
