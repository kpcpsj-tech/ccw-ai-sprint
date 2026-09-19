/**
 * 저장소 어댑터.
 *   STORE=sheets  (기본, 운영)  → 구글 시트
 *   STORE=memory  (로컬 확인용) → 프로세스 메모리. 재시작하면 사라집니다.
 */
import * as sheets from "./sheets.js";

export const BOOKING_TAB = "bookings";
export const BOOKING_COLS = ["id", "name", "slot", "method", "created_at", "status"];

export const VOTE_TAB = "votes";
export const VOTE_COLS = [
  "id", "created_at", "phone_hash", "phone_masked",
  "target_id", "target_name", "ip", "ip_masked", "status"
];

const mem = { bookings: [], votes: [] };
const driver = () => (process.env.STORE === "memory" ? "memory" : "sheets");

function memRows(tab) {
  return (tab === BOOKING_TAB ? mem.bookings : mem.votes).map((r, i) => ({ ...r, _row: i + 2 }));
}

export async function read(tab) {
  if (driver() === "memory") return memRows(tab);
  return sheets.readRows(tab);
}

export async function append(tab, obj) {
  const cols = tab === BOOKING_TAB ? BOOKING_COLS : VOTE_COLS;
  if (driver() === "memory") {
    (tab === BOOKING_TAB ? mem.bookings : mem.votes).push({ ...obj });
    return;
  }
  await sheets.appendRow(tab, cols, obj);
}

export async function setStatus(tab, row, status) {
  const cols = tab === BOOKING_TAB ? BOOKING_COLS : VOTE_COLS;
  if (driver() === "memory") {
    const arr = tab === BOOKING_TAB ? mem.bookings : mem.votes;
    if (arr[row - 2]) arr[row - 2].status = status;
    return;
  }
  await sheets.updateCell(tab, row, cols, "status", status);
}

export async function setup() {
  if (driver() === "memory") return { store: "memory" };
  await sheets.ensureTab(BOOKING_TAB, BOOKING_COLS);
  await sheets.ensureTab(VOTE_TAB, VOTE_COLS);
  return { store: "sheets" };
}

/** 테스트 전용 */
export function _reset() { mem.bookings = []; mem.votes = []; }
