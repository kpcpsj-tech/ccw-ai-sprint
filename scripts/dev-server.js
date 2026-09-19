/** 로컬 확인용 서버. Vercel 의 파일 기반 라우팅을 흉내냅니다.  node scripts/dev-server.js */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 3000);
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
                ".js": "text/javascript; charset=utf-8", ".png": "image/png",
                ".svg": "image/svg+xml", ".ico": "image/x-icon" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname.startsWith("/api/")) {
    const file = path.join(root, "api", url.pathname.slice(5) + ".js");
    if (!fs.existsSync(file)) { res.statusCode = 404; return res.end("no such endpoint"); }
    try {
      const mod = await import(`${file}?v=${Date.now()}`);
      req.query = Object.fromEntries(url.searchParams);
      await mod.default(req, res);
    } catch (e) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, message: e.message, stack: e.stack }));
    }
    return;
  }

  const rel = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = path.join(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file)) {
    res.statusCode = 404; return res.end("not found");
  }
  res.setHeader("content-type", TYPES[path.extname(file)] || "application/octet-stream");
  res.end(fs.readFileSync(file));
});

server.listen(PORT, () => console.log(`http://localhost:${PORT}  (STORE=${process.env.STORE || "sheets"})`));
