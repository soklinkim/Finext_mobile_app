// Development only: lets a phone reach the FINEXT API when Windows Firewall blocks Python (port 8000) but allows Node.
//
// Listens on 0.0.0.0:RELAY_PORT (default 8001) and passes every request, unchanged, to the API on
// 127.0.0.1:API_PORT (default 8000). Traffic between the relay and the API stays on this computer, so the firewall
// never sees it. Started by `npm run phone`; can also run alone with `node scripts/dev-api-relay.mjs`.
import http from 'node:http';

export function startRelay({ relayPort = Number(process.env.RELAY_PORT || 8001), apiPort = Number(process.env.API_PORT || 8000), host = '0.0.0.0' } = {}) {
  const server = http.createServer((req, res) => {
    const upstream = http.request(
      { host: '127.0.0.1', port: apiPort, method: req.method, path: req.url, headers: { ...req.headers, host: `127.0.0.1:${apiPort}` } },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(res);
      },
    );
    upstream.on('error', (error) => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ detail: `FINEXT API not running on port ${apiPort}: ${error.code ?? error.message}` }));
    });
    req.pipe(upstream);
  });
  server.listen(relayPort, host, () => {
    console.log(`[relay] phone -> :${relayPort} -> FINEXT API on 127.0.0.1:${apiPort}`);
  });
  return server;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('dev-api-relay.mjs')) {
  startRelay();
}
