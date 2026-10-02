const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const selfsigned = require("selfsigned");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, "public");
const CERT_DIR = path.join(__dirname, "certs");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
}

async function loadCert(ips) {
  const keyFile = path.join(CERT_DIR, "key.pem");
  const certFile = path.join(CERT_DIR, "cert.pem");
  const ipsFile = path.join(CERT_DIR, "ips.json");
  const same = () => {
    try {
      return (
        JSON.stringify(JSON.parse(fs.readFileSync(ipsFile, "utf8"))) ===
        JSON.stringify(ips)
      );
    } catch {
      return false;
    }
  };
  if (fs.existsSync(keyFile) && fs.existsSync(certFile) && same()) {
    return { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) };
  }
  const altNames = [
    { type: 2, value: "localhost" },
    { type: 7, ip: "127.0.0.1" },
    ...ips.map((ip) => ({ type: 7, ip })),
  ];
  const notBeforeDate = new Date();
  const notAfterDate = new Date(notBeforeDate.getTime() + 365 * 864e5);
  const pems = await selfsigned.generate(
    [{ name: "commonName", value: "local-camera" }],
    {
      algorithm: "sha256",
      notBeforeDate,
      notAfterDate,
      extensions: [
        { name: "basicConstraints", cA: false },
        { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
        { name: "extKeyUsage", serverAuth: true },
        { name: "subjectAltName", altNames },
      ],
    },
  );
  fs.mkdirSync(CERT_DIR, { recursive: true });
  fs.writeFileSync(keyFile, pems.private);
  fs.writeFileSync(certFile, pems.cert);
  fs.writeFileSync(ipsFile, JSON.stringify(ips));
  return { key: pems.private, cert: pems.cert };
}

function serveStatic(req, res) {
  const url = new URL(req.url, "https://x");
  const name =
    url.pathname === "/"
      ? "broadcast.html"
      : url.pathname === "/watch"
        ? "watch.html"
        : url.pathname.slice(1);
  const file = path.join(PUBLIC, name);
  if (
    !file.startsWith(PUBLIC + path.sep) ||
    !TYPES[path.extname(file)] ||
    !fs.existsSync(file)
  ) {
    res.writeHead(404).end("Not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(file)],
    "Cache-Control": "no-store",
  });
  fs.createReadStream(file).pipe(res);
}

function attachSignaling(server) {
  const wss = new WebSocketServer({ server, path: "/ws" });
  let broadcaster = null;
  const viewers = new Map();
  const send = (ws, msg) =>
    ws && ws.readyState === 1 && ws.send(JSON.stringify(msg));

  wss.on("connection", (ws) => {
    ws.id = crypto.randomUUID();
    ws.on("message", (raw) => {
      let m;
      try {
        m = JSON.parse(raw);
      } catch {
        return;
      }
      switch (m.type) {
        case "broadcaster":
          if (broadcaster && broadcaster !== ws)
            send(broadcaster, { type: "replaced" });
          broadcaster = ws;
          ws.role = "broadcaster";
          viewers.forEach((v) => {
            send(v, { type: "live" });
            send(ws, { type: "viewer-joined", id: v.id });
          });
          break;
        case "viewer":
          ws.role = "viewer";
          viewers.set(ws.id, ws);
          if (broadcaster) {
            send(ws, { type: "live" });
            send(broadcaster, { type: "viewer-joined", id: ws.id });
          } else send(ws, { type: "waiting" });
          break;
        case "offer":
        case "candidate":
          if (ws === broadcaster)
            send(viewers.get(m.to), { ...m, to: undefined });
          break;
        case "answer":
          send(broadcaster, { ...m, from: ws.id });
          break;
        case "viewer-candidate":
          send(broadcaster, {
            type: "candidate",
            candidate: m.candidate,
            from: ws.id,
          });
          break;
      }
    });
    ws.on("close", () => {
      if (ws === broadcaster) {
        broadcaster = null;
        viewers.forEach((v) => send(v, { type: "waiting" }));
      } else if (viewers.delete(ws.id))
        send(broadcaster, { type: "viewer-left", id: ws.id });
    });
  });
}

(async () => {
  const ips = lanAddresses();
  const server = https.createServer(await loadCert(ips), serveStatic);
  attachSignaling(server);
  server.listen(PORT, "0.0.0.0", () => {
    console.log("\nЛокальная камера запущена (видео не уходит в интернет)\n");
    console.log(`  Mac (вещание):  https://localhost:${PORT}/`);
    if (!ips.length)
      console.log(
        "  iPhone: не найден IP в локальной сети — подключитесь к Wi-Fi",
      );
    ips.forEach((ip) =>
      console.log(`  iPhone (Safari): https://${ip}:${PORT}/watch`),
    );
    console.log(
      "\nSafari покажет предупреждение о сертификате: «Показать детали» → «посетить этот веб-сайт».\n",
    );
  });
})();
