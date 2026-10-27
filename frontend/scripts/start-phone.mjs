// `npm run dev` (or `npm run phone`): one Expo server for the browser and the phone at the same time, plus the API relay.
//   Browser: http://localhost:8081 (talks to the API on localhost:8000 directly)
//   Phone:   scan the QR code (talks to the API through the relay on port 8001, which the firewall allows)
// The phone build gets the relay's port through EXPO_PUBLIC_API_PORT, which Expo builds into the app. Metro's cache is
// cleared only when that port differs from the last start, so normal starts stay fast.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRelay } from './dev-api-relay.mjs';

const relayPort = String(Number(process.env.RELAY_PORT || 8001));
const marker = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '.cache', 'finext-api-port');
let lastPort = null;
try {
  lastPort = readFileSync(marker, 'utf8').trim();
} catch {
  // first start
}
const clear = lastPort !== relayPort;
mkdirSync(dirname(marker), { recursive: true });
writeFileSync(marker, relayPort);

const relay = startRelay({ relayPort: Number(relayPort) });
console.log(`[dev] browser: http://localhost:8081   phone: scan the QR code${clear ? '   (clearing cache: API port changed)' : ''}`);
const expo = spawn('npx', ['expo', 'start', ...(clear ? ['-c'] : [])], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, EXPO_PUBLIC_API_PORT: relayPort },
});
const stop = () => {
  relay.close();
  expo.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
expo.on('exit', (code) => {
  relay.close();
  process.exit(code ?? 0);
});
