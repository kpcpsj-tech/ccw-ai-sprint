/**
 * 내부 공유용 미리보기 파일 만들기.
 * 실제 화면(index.html)을 그대로 쓰되, /api/* 호출만 브라우저 안에서 흉내내도록
 * 얇은 층을 앞뒤로 덧댑니다. 서버 없이 한 파일로 열립니다.
 *   node scripts/make-preview.js <나올-파일-경로>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2] || path.join(root, "preview.html");
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");

const BEFORE = `
<script>
/* ===================================================================
   미리보기 전용 층 — 실제 배포본에는 없습니다.
   서버 대신 브라우저 안에서 /api/* 응답을 만들어 줍니다.
   여기 쌓이는 값은 새로고침하면 사라집니다.
   =================================================================== */
(function(){
  var PW = { finalist: "DEMO-111", admin: "DEMO-222" };
  var norm = function(v){ return String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,""); };

  var NAMES = ["성원제","전혜선","최예지","신은정","김민지","양영주","남가현","조은지","박성현","조하늘"];
  var TASKS = ["자동영상편집 (타임라인 기준)","정산합시다 — 웹소설 정산 효율화 사이트",
    "레퍼런스를 기획 방향으로 번역하는 AI 콘텐츠 디렉터","K-IP 1page report",
    "해외 콘텐츠 배급 통합 대시보드","웹소설 퍼블리싱 & 투고 자동화 에이전트",
    "가현 피디 스튜디오","ScenePulse — 업로드 영상 반응 추이 분석",
    "contest brief","라이츠가이드 대시보드"];
  var COHORT = [4,5,5,5,2,3,4,5,5,4];

  /* 예시 예약 — 실제 운영에서는 구글 시트에서 옵니다 */
  var bookings = [
    { name:"최예지", slot:"10:00", at:"2026-09-22 14:02", status:"확정" },
    { name:"성원제", slot:"11:00", at:"2026-09-23 10:08", status:"확정" },
    { name:"조은지", slot:"14:00", at:"2026-09-22 16:20", status:"확정" }
  ];

  /* 예시 투표 원장 */
  var ballot = (function(){
    var seed = 20261204;
    function rnd(){ seed = (seed*1103515245+12345) & 0x7fffffff; return seed/0x7fffffff; }
    function p2(n){ return (n<10?"0":"")+n; }
    var base = [18,27,6,34,11,4,14,9,7,5], bad = [2,5,0,7,1,0,3,1,1,0];
    var flagIps = ["203.241.***.118","121.162.***.7","175.223.***.44"];
    var flagPhones = ["010-****-2244","010-****-9080","010-****-5512","010-****-7781"];
    var out = [];
    for (var i=0;i<10;i++){
      for (var j=0;j<base[i];j++){
        var ex = j < bad[i];
        var day = 23 + Math.floor(rnd()*12);
        var mo = day>30?12:11, dd = day>30?day-30:day;
        out.push({
          at: "2026-"+p2(mo)+"-"+p2(dd)+" "+p2(Math.floor(rnd()*13)+9)+":"+p2(Math.floor(rnd()*60)),
          phone: ex ? flagPhones[j%flagPhones.length]
                    : "010-****-"+(Math.floor(rnd()*9000)+1000),
          name: NAMES[i], task: TASKS[i], cohort: COHORT[i], target: String(i+1),
          ip: ex ? flagIps[j%flagIps.length]
                 : "1"+(Math.floor(rnd()*80)+10)+"."+(Math.floor(rnd()*200)+20)+".***."+(Math.floor(rnd()*240)+5),
          ok: !ex
        });
      }
    }
    return out.sort(function(a,b){ return a.at < b.at ? 1 : -1; });
  })();

  var myVotes = {};   /* 번호 → [대상id] */

  function json(body, status){
    return Promise.resolve(new Response(JSON.stringify(body),
      { status: status || 200, headers: { "content-type": "application/json" } }));
  }
  function live(){ return bookings.filter(function(b){ return b.status === "확정"; }); }

  var realFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    var url = typeof input === "string" ? input : (input && input.url) || "";
    if (url.indexOf("/api/") !== 0) return realFetch(input, init);

    init = init || {};
    var head = init.headers || {};
    var pw = norm(head["x-ccw-pw"]);
    var body = {};
    try { body = init.body ? JSON.parse(init.body) : {}; } catch(e){}

    if (url.indexOf("/api/auth") === 0){
      var want = body.role === "admin" ? PW.admin : PW.finalist;
      return pw === norm(want)
        ? json({ ok:true, role: body.role })
        : json({ ok:false, message:"비밀번호가 일치하지 않습니다." }, 401);
    }

    if (url.indexOf("/api/state") === 0){
      var taken = {};
      live().forEach(function(b){ taken[b.slot] = { name:b.name, at:b.at }; });
      var m = /phone=([^&]+)/.exec(url);
      var phone = m ? decodeURIComponent(m[1]).replace(/\\D/g,"") : null;
      return json({ ok:true, taken: taken,
        vote: { state:"before", opensAt:"2026-11-23T00:00:00+09:00",
                maxPerPhone:3, myVotes: phone ? (myVotes[phone] || []) : null } });
    }

    if (url.indexOf("/api/book") === 0){
      if (pw !== norm(PW.finalist)) return json({ ok:false, message:"비밀번호가 필요합니다." }, 401);
      if (body.action === "cancel"){
        var mine = live().filter(function(b){ return b.name === body.name; })[0];
        if (!mine) return json({ ok:false, message:"취소할 예약이 없습니다." }, 404);
        mine.status = "취소";
        return json({ ok:true });
      }
      if (live().some(function(b){ return b.name === body.name; }))
        return json({ ok:false, message:"이미 10월 2일 대면 멘토링을 신청하셨습니다. 1회만 신청할 수 있습니다." }, 409);
      if (live().some(function(b){ return b.slot === body.slot; }))
        return json({ ok:false, message: body.slot + " 은(는) 이미 신청된 시간입니다. 다른 시간을 골라 주세요." }, 409);
      var now = new Date(), z = function(n){ return (n<10?"0":"")+n; };
      bookings.push({ name:body.name, slot:body.slot, status:"확정",
        at: now.getFullYear()+"-"+z(now.getMonth()+1)+"-"+z(now.getDate())+" "+z(now.getHours())+":"+z(now.getMinutes()) });
      return json({ ok:true });
    }

    if (url.indexOf("/api/vote") === 0){
      /* 미리보기에서도 투표 기간 밖이라 서버가 받지 않습니다 — 실제와 같습니다 */
      return json({ ok:false, message:"청중 투표는 11월 23일(월)에 열립니다." }, 403);
    }

    if (url.indexOf("/api/admin") === 0){
      if (pw !== norm(PW.admin)) return json({ ok:false, message:"비밀번호가 필요합니다." }, 401);

      var csv = /csv=(\\w+)/.exec(url);
      if (csv){
        var rows;
        if (csv[1] === "ballot"){
          rows = [["연번","투표시각","휴대폰번호","투표대상","기수","과제명","IP","판정"]];
          ballot.forEach(function(v,i){
            rows.push([i+1, v.at, v.phone, v.name, v.cohort+"기", v.task, v.ip, v.ok?"유효":"자동제외"]);
          });
        } else if (csv[1] === "flag"){
          rows = [["IP","사용된 번호","표 수","최근 시각","판정"]];
          flags().forEach(function(f){ rows.push([f.ip, f.phones.join(" / "), f.n, f.at, "자동 제외"]); });
        } else {
          rows = [["성명","일자","시간","방식","신청시각","상태"]];
          bookings.forEach(function(b){ rows.push([b.name,"2026-10-02",b.slot,"대면",b.at,b.status]); });
        }
        var text = "\\ufeff" + rows.map(function(r){
          return r.map(function(c){
            c = String(c == null ? "" : c);
            return /[",\\r\\n]/.test(c) ? '"' + c.replace(/"/g,'""') + '"' : c;
          }).join(",");
        }).join("\\r\\n");
        return Promise.resolve(new Response(text, { status:200, headers:{ "content-type":"text/csv" } }));
      }

      var tally = NAMES.map(function(n,i){
        var list = ballot.filter(function(v){ return v.target === String(i+1); });
        var x = list.filter(function(v){ return !v.ok; }).length;
        return { id:String(i+1), name:n, task:TASKS[i], total:list.length, excluded:x, net:list.length-x };
      }).sort(function(a,b){ return b.net - a.net; });

      var phones = {}; ballot.forEach(function(v){ phones[v.phone] = 1; });
      return json({ ok:true,
        kpi: { faceOpen: 8 - live().length, faceTotal: 8,
               votesTotal: ballot.length, votersApprox: Object.keys(phones).length,
               autoExcluded: ballot.filter(function(v){ return !v.ok; }).length,
               flaggedIps: flags().length },
        tally: tally,
        bookings: bookings,
        ballot: ballot.slice(0,50),
        ballotCount: ballot.length,
        flags: flags() });
    }

    return json({ ok:false, message:"미리보기에서는 지원하지 않는 요청입니다." }, 404);
  };

  function flags(){
    var byIp = {};
    ballot.forEach(function(v){ (byIp[v.ip] = byIp[v.ip] || []).push(v); });
    return Object.keys(byIp).filter(function(ip){ return byIp[ip].length >= 5; })
      .map(function(ip){
        var l = byIp[ip], ps = {};
        l.forEach(function(v){ ps[v.phone] = 1; });
        return { ip: ip, phones: Object.keys(ps), n: l.length,
                 at: l.map(function(v){ return v.at; }).sort().pop() };
      }).sort(function(a,b){ return b.n - a.n; });
  }
})();
</script>
`;

const AFTER = `
<script>
/* 미리보기에서는 아티팩트 뷰어의 저장 권한으로 CSV 를 내려받습니다. */
(function(){
  var DL = null;
  if (window.claude && typeof window.claude.use === "function"){
    try { window.claude.use("downloads").then(function(d){ DL = d; }, function(){}); } catch(e){}
  }
  var orig = window.downloadCsv;
  window.downloadCsv = function(kind, btn){
    if (!DL) return orig(kind, btn);
    var label = { ballot:"투표원장", flag:"중복의심", book:"대면예약" }[kind] || kind;
    var idle = btn.textContent;
    btn.disabled = true; btn.textContent = "내려받는 중…";
    fetch("/api/admin?csv=" + kind, { headers: { "x-ccw-pw": "DEMO-222" } })
      .then(function(r){ return r.text(); })
      .then(function(t){ return DL.save({ filename: "CCW_" + label + "_미리보기.csv", data: t }); })
      .catch(function(){})
      .then(function(){ btn.disabled = false; btn.textContent = idle; });
  };
})();
</script>
`;

// 비밀번호 안내를 미리보기용으로 바꿉니다.
html = html
  .replace("var HINT_F = '사무국이 진출자 10인에게만 개별 안내한 비밀번호입니다.';",
           "var HINT_F = '<b>미리보기</b> 화면입니다. 비밀번호 <b>DEMO-111</b> 을 입력해 주세요.';")
  .replace("var HINT_A = '운영사무국에만 공유하는 비밀번호입니다.';",
           "var HINT_A = '<b>미리보기</b> 화면입니다. 비밀번호 <b>DEMO-222</b> 를 입력해 주세요.';")
  .replace('<p class="authnote" id="authNote">사무국이 진출자 10인에게만 개별 안내한 비밀번호입니다.</p>',
           '<p class="authnote" id="authNote"><b>미리보기</b> 화면입니다. 비밀번호 <b>DEMO-111</b> 을 입력해 주세요.</p>')
  .replace('<p class="authnote" id="adminNote">운영사무국에만 공유하는 비밀번호입니다.</p>',
           '<p class="authnote" id="adminNote"><b>미리보기</b> 화면입니다. 비밀번호 <b>DEMO-222</b> 를 입력해 주세요.</p>')
  .replace("<title>", "<title>[미리보기] ")
  .replace("<script>", BEFORE + "<script>")   // 첫 번째 script 앞에 끼워 넣습니다
  .replace("</body>", AFTER + "</body>");

fs.writeFileSync(out, html);
console.log("만들었습니다:", out, "(" + html.length + "자)");
