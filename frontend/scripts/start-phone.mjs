// `npm run phone`: Expo plus the API relay, for testing on a phone when the firewall blocks the API port.
// The app is told to use the relay's port (EXPO_PUBLIC_API_PORT); the computer's address still comes from Expo.
// `-c` clears Metro's cache so the new port is built into the app.
import { spawn } from 'node:child_process';
import { startRelay } from './dev-api-relay.mjs';

const relayPort = Number(process.env.RELAY_PORT || 8001);
const relay = startRelay({ relayPort });
const expo = spawn('npx', ['expo', 'start', '-c'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, EXPO_PUBLIC_API_PORT: String(relayPort) },
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
