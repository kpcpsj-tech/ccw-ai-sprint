/**
 * CCW AI SPRINT 청중 투표 — 인증 메일 발송 스크립트
 *
 * 인증번호 메일을 보내는 Gmail 계정마다 이 스크립트를 하나씩 만듭니다.
 * (Gmail 무료 계정은 하루 약 100통. 계정이 여러 개면 사이트가 차례로 돌려 씁니다.)
 *
 * 설치 (계정마다 한 번)
 *   1) 그 Gmail 계정으로 script.google.com 접속 → 새 프로젝트
 *   2) 이 파일 내용을 통째로 붙여넣기
 *   3) 아래 SECRET 줄을 시트 스크립트(Code.gs)의 SECRET 줄과 똑같이 바꾸기
 *   4) 위쪽 함수 고르는 칸에서 "권한승인" 선택 → 실행 → 권한 허용
 *   5) 배포 → 새 배포 → 유형: 웹 앱
 *        다음 사용자 인증 정보로 실행: 나
 *        액세스 권한이 있는 사용자: 모든 사용자
 *   6) 나온 웹 앱 URL(…/exec)을 Vercel 환경변수 MAILER_URLS 에 추가
 */
var SECRET = "여기에-시트-스크립트와-같은-SECRET-을-넣으세요";

var FROM_NAME = "CCW AI SPRINT";
var REPLY_TO = "koccaccw@gmail.com";

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) {}
  if (!SECRET || SECRET.indexOf("여기에") === 0) return out({ ok: false, message: "SECRET 을 아직 바꾸지 않았습니다." });
  if (body.secret !== SECRET) return out({ ok: false, message: "비밀값이 맞지 않습니다." });

  var left = MailApp.getRemainingDailyQuota();
  if (body.action === "quota") return out({ ok: true, quota: left, account: masked() });
  if (body.action !== "send") return out({ ok: false, message: "알 수 없는 action" });
  if (left < 1) return out({ ok: false, quota: 0, message: "오늘 발송 한도를 다 썼습니다." });

  var code = String(body.code || "");
  if (!/^\d{6}$/.test(code)) return out({ ok: false, message: "인증번호 형식 오류" });
  try {
    MailApp.sendEmail({
      to: String(body.to || ""),
      subject: "[CCW AI SPRINT] 청중 투표 인증번호 " + code,
      name: FROM_NAME,
      replyTo: REPLY_TO,
      body: "CCW AI SPRINT 청중 투표 인증번호는 " + code + " 입니다.\n5분 안에 투표 화면에 입력해 주세요.\n\n"
          + "직접 요청하지 않으셨다면 이 메일은 무시하셔도 됩니다.",
      htmlBody: '<div style="font-family:Apple SD Gothic Neo,Malgun Gothic,sans-serif;max-width:420px;margin:0 auto;padding:28px 24px;color:#111">'
          + '<div style="font-size:13px;letter-spacing:.08em;color:#666">CCW AI SPRINT · 청중 투표</div>'
          + '<h2 style="margin:10px 0 18px;font-size:20px">인증번호를 입력해 주세요</h2>'
          + '<div style="font-size:34px;font-weight:700;letter-spacing:.25em;background:#f4f2ee;border-radius:12px;padding:18px 0;text-align:center">' + code + '</div>'
          + '<p style="font-size:14px;line-height:1.6;color:#444;margin-top:18px">5분 안에 투표 화면에 입력해 주세요.<br>'
          + '직접 요청하지 않으셨다면 이 메일은 무시하셔도 됩니다.</p></div>'
    });
  } catch (err) {
    var m = String(err && err.message || err);
    if (/too many times|한도|limit/i.test(m)) return out({ ok: false, quota: 0, message: m });
    if (/invalid email|잘못된 이메일|recipient/i.test(m)) return out({ ok: false, bad: true, message: m });
    return out({ ok: false, message: m });
  }
  return out({ ok: true, quota: left - 1 });
}

/** 처음 한 번 실행해서 메일 보내기 권한을 허용합니다. */
function 권한승인() {
  Logger.log("오늘 남은 발송량: " + MailApp.getRemainingDailyQuota());
}

function masked() {
  var m = Session.getEffectiveUser().getEmail() || "";
  var p = m.split("@");
  return p.length === 2 ? p[0].slice(0, 3) + "***@" + p[1] : "";
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
