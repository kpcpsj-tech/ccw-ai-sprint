/**
 * 동시 투표 부하 시험.  node scripts/load-test.js <서버주소> <사람 수> [시트스크립트주소]
 * 사람마다 인증번호 받기 → 확인 → 투표(3개)를 동시에 진행하고, 걸린 시간과 실패를 셉니다.
 * 서버는 SOLAPI_MOCK=1 (문자 대신 응답으로 인증번호를 줌) 로 띄워야 합니다.
 */
const BASE = process.argv[2] || "http://localhost:3300";
const N = Number(process.argv[3] || 50);
const DUMP = process.argv[4];
const post = async (p, body, ip) => {
  const t0 = Date.now();
  const r = await fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip },
                                    body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ ok: false, message: "응답 아님 " + r.status }));
  return { ms: Date.now() - t0, j };
};
const ids = ["1","2","3","4","5","6","7","8","9"];
async function voter(i) {
  const phone = "010-7" + String(i).padStart(3, "0") + "-" + String(1000 + i).slice(-4);
  const ip = "10.0." + (i >> 8) + "." + (i & 255);
  const s = await post("/api/otp", { action: "send", phone }, ip);
  if (!s.j.ok) return { i, step: "send", err: s.j.message };
  const v = await post("/api/otp", { action: "verify", phone, code: s.j.mockCode, ticket: s.j.ticket }, ip);
  if (!v.j.ok) return { i, step: "verify", err: v.j.message };
  const pick = [...ids].sort(() => Math.random() - .5).slice(0, 3);
  const b = await post("/api/vote", { phone, token: v.j.token, targets: pick }, ip);
  if (!b.j.ok) return { i, step: "vote", err: b.j.message, ms: b.ms };
  // 절반은 마음을 바꿔 한 번 더 투표 (바꿔치기도 시험)
  let again = null;
  if (i % 2 === 0) {
    const pick2 = [...ids].sort(() => Math.random() - .5).slice(0, 3);
    again = await post("/api/vote", { phone, token: v.j.token, targets: pick2 }, ip);
    if (!again.j.ok) return { i, step: "revote", err: again.j.message, ms: again.ms };
    return { i, ok: true, ms: b.ms, ms2: again.ms, final: pick2, phone };
  }
  return { i, ok: true, ms: b.ms, final: pick, phone };
}
const t0 = Date.now();
const res = await Promise.all(Array.from({ length: N }, (_, i) => voter(i + 1)));
const ok = res.filter((r) => r.ok), bad = res.filter((r) => !r.ok);
const ms = ok.flatMap((r) => [r.ms, r.ms2].filter(Boolean)).sort((a, b) => a - b);
const q = (p) => ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * p))] : 0;
console.log(`사람 ${N}명 · 전체 ${((Date.now() - t0) / 1000).toFixed(1)}초`);
console.log(`성공 ${ok.length} · 실패 ${bad.length}`);
console.log(`투표 저장 시간: 중간값 ${(q(.5)/1000).toFixed(1)}초 · 90% ${(q(.9)/1000).toFixed(1)}초 · 최대 ${(q(1)/1000).toFixed(1)}초`);
console.log(`10초 넘은 투표 ${ms.filter((x) => x > 10000).length}건 · 30초 넘은 투표 ${ms.filter((x) => x > 30000).length}건`);
if (bad.length) console.log("실패 예:", bad.slice(0, 3));
if (DUMP) {
  const r = await fetch(DUMP, { method: "POST", body: JSON.stringify({ secret: "test-secret", action: "dump" }) });
  const { votes } = await r.json();
  const live = votes.filter((v) => v.status === "테스트" || v.status === "유효");
  const byHash = {}; live.forEach((v) => { (byHash[v.phone_hash] = byHash[v.phone_hash] || []).push(v.target_id); });
  const counts = Object.values(byHash).map((a) => a.length);
  const wrong = counts.filter((c) => c !== 3).length;
  const dup = Object.values(byHash).filter((a) => new Set(a).size !== a.length).length;
  console.log(`시트 확인: 투표한 번호 ${Object.keys(byHash).length}개 · 살아 있는 표 ${live.length}줄 · 3표가 아닌 번호 ${wrong}개 · 같은 사람에게 중복 ${dup}개`);
}
