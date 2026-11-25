/**
 * Apps Script 웹 앱 흉내내기 — apps-script/Code.gs 와 같은 규약으로 응답합니다.
 * 실제 배포 전에 드라이버가 제대로 붙는지 확인하는 용도입니다.
 *   node scripts/mock-apps-script.js
 */
import http from "node:http";

const SECRET = process.env.MOCK_SECRET || "test-secret";
const COLS = {
  bookings: ["id", "name", "slot", "method", "created_at", "status"],
  votes:    ["id", "created_at", "phone_hash", "phone_masked",
             "target_id", "target_name", "ip", "ip_masked", "status"]
};
const db = { bookings: [], votes: [] };

// 실제 시트에 들어 있는 줄 (MOCK_SEED=1 일 때만). 시트가 "17:00" 을 시각으로 바꿔
// 보여 주는 상황도 함께 흉내 냅니다.
if (process.env.MOCK_SEED) {
  db.bookings = [
    { id:"a", name:"성원제", slot:"13:00", method:"대면", created_at:"2026-09-19T11:48:35.338Z", status:"취소" },
    { id:"b", name:"전혜선", slot:"5:00:00 PM", method:"대면", created_at:"2026-09-20T09:22:34.024Z", status:"확정" },
    { id:"c", name:"양영주", slot:"14:00",      method:"대면", created_at:"2026-09-21T01:13:09.853Z", status:"확정" },
    { id:"d", name:"최예지", slot:"오후 4:00",  method:"대면", created_at:"2026-09-21T06:54:56.349Z", status:"확정" }
  ];
}
const rows = (tab) => db[tab].map((r, i) => ({ ...r, _row: i + 2 }));

http.createServer(async (req, res) => {
  const send = (o) => {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(o));
  };
  if (req.method === "GET") return send({ ok: true, message: "CCW AI 스프린트 저장소가 동작 중입니다." });

  const chunks = [];
  for await (const c of req) chunks.push(c);
  let b; try { b = JSON.parse(Buffer.concat(chunks).toString()); }
  catch { return send({ ok: false, message: "요청을 읽지 못했습니다." }); }

  if (b.secret !== SECRET) return send({ ok: false, message: "인증에 실패했습니다." });

  /* 실제 Apps Script 처럼: 한 번에 한 요청만(잠금), 호출마다 MOCK_LATENCY ms 걸림 */
  const prev = lockChain; let release; lockChain = new Promise((r) => (release = r));
  await prev;
  await new Promise((r) => setTimeout(r, LATENCY));
  try { return handle(b, send); } finally { release(); }
}).listen(3200, () => console.log("mock apps script on :3200"));

let lockChain = Promise.resolve();
const LATENCY = Number(process.env.MOCK_LATENCY || 0);
const OLD = process.env.MOCK_OLD === "1";   /* 예전 스크립트 흉내 (castVote 없음) */
function handle(b, send) {

  switch (b.action) {
    case "ping":
    case "setup":     return send({ ok: true, store: "script" });
    case "read":      return send({ ok: true, rows: rows(b.tab) });
    case "append":    db[b.tab].push({ ...b.row }); return send({ ok: true });
    case "setStatus": {
      const r = db[b.tab][b.row - 2];
      if (r) r.status = b.status;
      return send({ ok: true });
    }
    case "appendUnique": {
      for (const c of b.conflicts || []) {
        if (rows(b.tab).some((r) => r.status !== "취소" && String(r[c.col]) === String(c.value)))
          return send({ ok: false, conflict: true, message: c.message });
      }
      db[b.tab].push({ ...b.row });
      return send({ ok: true });
    }
    case "castVote": {
      if (OLD) return send({ ok: false, message: "알 수 없는 action: castVote" });
      const want = new Set(b.rows.map((r) => String(r.target_id))), have = new Set();
      for (const r of db.votes) {
        if (r.phone_hash !== b.hash || r.status !== b.status) continue;
        const t = String(r.target_id);
        if (want.has(t) && !have.has(t)) have.add(t); else r.status = "취소";
      }
      let added = 0;
      for (const r of b.rows) if (!have.has(String(r.target_id))) { db.votes.push({ ...r }); added++; }
      return send({ ok: true, added });
    }
    case "myVotes": {
      if (OLD) return send({ ok: false, message: "알 수 없는 action: myVotes" });
      return send({ ok: true, votes: db.votes.filter((r) => r.phone_hash === b.hash && r.status === b.status).map((r) => r.target_id) });
    }
    case "dump": return send({ ok: true, votes: db.votes });
    default: return send({ ok: false, message: "알 수 없는 action: " + b.action });
  }
}
