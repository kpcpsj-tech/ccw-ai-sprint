/**
 * Apps Script 드라이버 — 시트에 붙인 웹 앱을 통해 읽고 씁니다.
 * 서비스 계정도 JSON 키도 필요 없습니다.
 *   APPS_SCRIPT_URL      배포 주소 (/exec 로 끝남)
 *   APPS_SCRIPT_SECRET   스크립트 안의 SECRET 과 같은 값
 */

/** 구글 쪽이 잠시 바쁠 때(5xx · 연결 끊김) 두 번까지 다시 시도합니다.
 *  투표 저장(castVote)은 같은 내용을 다시 보내도 표가 겹치지 않으므로 다시 시도해도 안전합니다. */
async function call(payload) {
  let last;
  for (let i = 0; i < 3; i++) {
    try { return await callOnce(payload); }
    catch (e) {
      last = e;
      if (!e.retry) throw e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1) + Math.random() * 300));
    }
  }
  throw last;
}

async function callOnce(payload) {
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
    throw Object.assign(new Error("시트 스크립트에 연결하지 못했습니다."), { retry: true });
  }

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch {
    // 로그인 화면 HTML 이 돌아오면 배포 설정이 잘못된 것입니다.
    if (/accounts\.google\.com|로그인/.test(text))
      throw new Error("스크립트 배포의 액세스 권한이 '모든 사용자'인지 확인해 주세요.");
    throw Object.assign(new Error(`스크립트 응답을 읽지 못했습니다 (${res.status}).`), { retry: res.status >= 500 || res.status === 429 });
  }
  if (!json.ok && json.conflict !== true)
    throw Object.assign(new Error(json.message || "시트 오류"), { retry: /다른 요청을 처리 중/.test(json.message || "") });
  return json;
}

export const read        = (tab)                   => call({ action: "read", tab }).then((j) => j.rows || []);
export const append      = (tab, row)              => call({ action: "append", tab, row }).then(() => undefined);
export const setStatus   = (tab, row, status)      => call({ action: "setStatus", tab, row, status }).then(() => undefined);
export const appendUnique= (tab, row, conflicts)   => call({ action: "appendUnique", tab, row, conflicts });
export const setup       = ()                      => call({ action: "setup" });
export const castVote    = (hash, status, rows)     => call({ action: "castVote", hash, status, rows });
export const myVotes     = (hash, status)           => call({ action: "myVotes", hash, status }).then((j) => j.votes || []);
