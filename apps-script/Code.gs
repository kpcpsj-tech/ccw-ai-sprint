/**
 * CCW AI 스프린트 — 구글 시트 저장소
 *
 * 이 스크립트는 "CCW Final sprint 운영" 시트에 붙어서, 시트 주인 권한으로 돌아갑니다.
 * 서비스 계정도, JSON 키도 필요 없습니다.
 *
 * 설치
 *   1) 시트에서 확장 프로그램 → Apps Script
 *   2) 이 파일 내용을 전부 붙여넣기
 *   3) 아래 SECRET 을 길고 아무도 모르는 문자열로 바꾸기
 *   4) 배포 → 새 배포 → 유형 "웹 앱"
 *        실행 계정 : 나
 *        액세스 권한: 모든 사용자
 *   5) 나온 주소(/exec 로 끝남)를 Vercel 의 APPS_SCRIPT_URL 에 넣기
 *      SECRET 은 APPS_SCRIPT_SECRET 에 넣기
 */

/* ⬇⬇⬇ 이 줄만 바꾸세요 ⬇⬇⬇ */
var SECRET = "여기에-길고-아무도-모르는-문자열을-넣으세요";
/* ⬆⬆⬆ 이 줄만 바꾸세요 ⬆⬆⬆ */

var COLS = {
  bookings: ["id", "name", "slot", "method", "created_at", "status"],
  votes:    ["id", "created_at", "phone_hash", "phone_masked",
             "target_id", "target_name", "ip", "ip_masked", "status"]
};

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheetFor(tab) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(tab);
  if (!sh) {
    sh = ss.insertSheet(tab);
    sh.getRange(1, 1, 1, COLS[tab].length).setValues([COLS[tab]]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** 시트를 [{col: value, _row: n}, ...] 로 읽습니다. */
function readRows(tab) {
  var sh = sheetFor(tab);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var cols = COLS[tab];
  var values = sh.getRange(2, 1, last - 1, cols.length).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var empty = true, o = { _row: i + 2 };
    for (var j = 0; j < cols.length; j++) {
      var v = values[i][j];
      if (v instanceof Date) v = v.toISOString();
      o[cols[j]] = v === null || v === undefined ? "" : String(v);
      if (o[cols[j]] !== "") empty = false;
    }
    if (!empty) rows.push(o);
  }
  return rows;
}

function appendRow(tab, obj) {
  var sh = sheetFor(tab), cols = COLS[tab], row = [];
  for (var i = 0; i < cols.length; i++) row.push(obj[cols[i]] === undefined ? "" : String(obj[cols[i]]));
  sh.appendRow(row);
  return sh.getLastRow();
}

function setStatus(tab, rowNumber, status) {
  var sh = sheetFor(tab);
  var idx = COLS[tab].indexOf("status") + 1;
  sh.getRange(rowNumber, idx).setValue(status);
}

/**
 * 조건에 걸리는 줄이 없을 때만 추가합니다. 스크립트 잠금 안에서 처리하므로
 * 두 사람이 같은 순간에 같은 시간대를 눌러도 한 명만 들어갑니다.
 * conflicts: [{col, value, message}]  — status 가 "확정"/"유효" 인 줄만 봅니다.
 */
function appendUnique(tab, obj, conflicts) {
  var rows = readRows(tab);
  for (var c = 0; c < conflicts.length; c++) {
    var k = conflicts[c];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].status === "취소") continue;
      if (String(rows[i][k.col]) === String(k.value)) {
        return { ok: false, conflict: true, message: k.message };
      }
    }
  }
  appendRow(tab, obj);
  return { ok: true };
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return out({ ok: false, message: "요청을 읽지 못했습니다." }); }

  if (!SECRET || SECRET.indexOf("여기에") === 0)
    return out({ ok: false, message: "스크립트의 SECRET 을 아직 바꾸지 않았습니다." });
  if (body.secret !== SECRET)
    return out({ ok: false, message: "인증에 실패했습니다." });

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); }
  catch (err) { return out({ ok: false, message: "다른 요청을 처리 중입니다. 잠시 후 다시 시도해 주세요." }); }

  try {
    switch (body.action) {
      case "ping":         return out({ ok: true, store: "script" });
      case "setup":        sheetFor("bookings"); sheetFor("votes");
                           return out({ ok: true, store: "script" });
      case "read":         return out({ ok: true, rows: readRows(body.tab) });
      case "append":       appendRow(body.tab, body.row);
                           return out({ ok: true });
      case "setStatus":    setStatus(body.tab, body.row, body.status);
                           return out({ ok: true });
      case "appendUnique": return out(appendUnique(body.tab, body.row, body.conflicts || []));
      default:             return out({ ok: false, message: "알 수 없는 action: " + body.action });
    }
  } catch (err) {
    return out({ ok: false, message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** 브라우저로 주소를 열었을 때 살아 있는지 확인용 */
function doGet() {
  return out({ ok: true, message: "CCW AI 스프린트 저장소가 동작 중입니다." });
}
