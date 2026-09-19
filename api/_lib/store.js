/**
 * 저장소 어댑터.
 *   STORE=script  (권장, 운영) → 시트에 붙인 Apps Script 웹 앱
 *   STORE=sheets              → 구글 서비스 계정으로 Sheets API 직접 호출
 *   STORE=memory (로컬 확인용) → 프로세스 메모리. 재시작하면 사라집니다.
 *
 * APPS_SCRIPT_URL 이 설정돼 있으면 STORE 를 따로 주지 않아도 script 를 씁니다.
 */
import * as sheets from "./sheets.js";
import * as script from "./script-store.js";

export const BOOKING_TAB = "bookings";
export const BOOKING_COLS = ["id", "name", "slot", "method", "created_at", "status"];

export const VOTE_TAB = "votes";
export const VOTE_COLS = [
  "id", "created_at", "phone_hash", "phone_masked",
  "target_id", "target_name", "ip", "ip_masked", "status"
];

const mem = { bookings: [], votes: [] };
function driver() {
  if (process.env.STORE) return process.env.STORE;
  return process.env.APPS_SCRIPT_URL ? "script" : "sheets";
}

function memRows(tab) {
  return (tab === BOOKING_TAB ? mem.bookings : mem.votes).map((r, i) => ({ ...r, _row: i + 2 }));
}

export async function read(tab) {
  const d = driver();
  if (d === "memory") return memRows(tab);
  if (d === "script") return script.read(tab);
  return sheets.readRows(tab);
}

export async function append(tab, obj) {
  const d = driver();
  if (d === "memory") {
    (tab === BOOKING_TAB ? mem.bookings : mem.votes).push({ ...obj });
    return;
  }
  if (d === "script") return script.append(tab, obj);
  await sheets.appendRow(tab, tab === BOOKING_TAB ? BOOKING_COLS : VOTE_COLS, obj);
}

/**
 * conflicts 에 걸리는 줄이 없을 때만 추가합니다.
 * conflicts: [{ col, value, message }] — status 가 "취소"가 아닌 줄만 봅니다.
 * 반환: { ok: true } 또는 { ok: false, conflict: true, message }
 *
 * script 드라이버는 스크립트 잠금 안에서 처리해 동시 신청을 원천 차단합니다.
 * sheets 드라이버는 추가 후 다시 읽어 먼저 들어온 쪽을 가리고, 진 쪽을 취소합니다.
 */
export async function appendUnique(tab, obj, conflicts) {
  const d = driver();

  if (d === "script") return script.appendUnique(tab, obj, conflicts);

  const hit = (rows) => {
    for (const c of conflicts) {
      if (rows.some((r) => r.status !== "취소" && String(r[c.col]) === String(c.value))) return c;
    }
    return null;
  };

  if (d === "memory") {
    const c = hit(await read(tab));
    if (c) return { ok: false, conflict: true, message: c.message };
    await append(tab, obj);
    return { ok: true };
  }

  const pre = hit(await read(tab));
  if (pre) return { ok: false, conflict: true, message: pre.message };
  await append(tab, obj);

  // 같은 순간에 들어온 요청이 있었는지 다시 확인합니다.
  const after = await read(tab);
  for (const c of conflicts) {
    const same = after
      .filter((r) => r.status !== "취소" && String(r[c.col]) === String(c.value))
      .sort((a, b) => (a.created_at === b.created_at ? String(a.id).localeCompare(String(b.id))
                                                     : String(a.created_at).localeCompare(String(b.created_at))));
    if (same.length > 1 && same[0].id !== obj.id) {
      const mine = same.find((r) => r.id === obj.id);
      if (mine) await setStatus(tab, mine._row, "취소");
      return { ok: false, conflict: true, message: c.message };
    }
  }
  return { ok: true };
}

export async function setStatus(tab, row, status) {
  const d = driver();
  if (d === "script") return script.setStatus(tab, row, status);
  const cols = tab === BOOKING_TAB ? BOOKING_COLS : VOTE_COLS;
  if (d === "memory") {
    const arr = tab === BOOKING_TAB ? mem.bookings : mem.votes;
    if (arr[row - 2]) arr[row - 2].status = status;
    return;
  }
  await sheets.updateCell(tab, row, cols, "status", status);
}

export async function setup() {
  const d = driver();
  if (d === "memory") return { store: "memory" };
  if (d === "script") { await script.setup(); return { store: "script" }; }
  await sheets.ensureTab(BOOKING_TAB, BOOKING_COLS);
  await sheets.ensureTab(VOTE_TAB, VOTE_COLS);
  return { store: "sheets" };
}

/** 테스트 전용 */
export function _reset() { mem.bookings = []; mem.votes = []; }
