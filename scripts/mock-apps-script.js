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
    default: return send({ ok: false, message: "알 수 없는 action: " + b.action });
  }
}).listen(3200, () => console.log("mock apps script on :3200"));
