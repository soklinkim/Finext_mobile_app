// Keep this first so Expo Fast Refresh is initialized before the app starts.
import '@expo/metro-runtime';
import * as SQLite from 'expo-sqlite';

// The browser lets only one open copy of the app hold the database file. Right after a reload or a dev-server
// restart, the previous copy can take a moment to let go, so opening is retried before giving up.
const OPEN_ATTEMPTS = 5;
const isLockedByAnotherCopy = (error) => /Access Handle|NoModificationAllowedError|createSyncAccessHandle/i.test(String(error?.message ?? error));

async function openWebDatabase() {
  for (let attempt = 1; ; attempt++) {
    try {
      return await SQLite.openDatabaseAsync('finext.db');
    } catch (error) {
      if (!isLockedByAnotherCopy(error) || attempt >= OPEN_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
}

async function startApp() {
  if (process.env.EXPO_OS === 'web') {
    // Let the SQLite worker start before Expo Router imports screens that open it synchronously.
    globalThis.__FINEXT_WEB_SQLITE__ = await openWebDatabase();
  }

  await import('expo-router/entry');
}

void startApp().catch((error) => {
  console.error('Finext startup failed:', error);
  const root = document.getElementById('root');
  if (!root) return;
  const box = document.createElement('div');
  box.style.cssText = 'margin: 24px; max-width: 520px; font: 15px/1.5 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1f2937;';
  const title = document.createElement('p');
  title.style.cssText = 'font-weight: 700; font-size: 17px; margin: 0 0 8px;';
  const body = document.createElement('p');
  body.style.margin = '0 0 16px';
  if (isLockedByAnotherCopy(error)) {
    title.textContent = 'FINEXT is already open somewhere else';
    body.textContent = 'In the browser, only one copy of FINEXT can use its saved data at a time. Close the other tabs or previews showing this address (for example VS Code\'s browser and Chrome), then press Reload.';
  } else {
    title.textContent = 'FINEXT could not start';
    body.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
    body.style.cssText += 'white-space: pre-wrap; font: 13px monospace; color: #9b1c1c;';
  }
  const reload = document.createElement('button');
  reload.textContent = 'Reload';
  reload.style.cssText = 'padding: 10px 22px; border: 0; border-radius: 999px; background: #0D47A1; color: #fff; font: 600 15px -apple-system, "Segoe UI", Roboto, Arial, sans-serif; cursor: pointer;';
  reload.onclick = () => window.location.reload();
  box.append(title, body, reload);
  root.replaceChildren(box);
});
