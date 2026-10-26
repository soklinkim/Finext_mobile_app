// Keep this first so Expo Fast Refresh is initialized before the app starts.
import '@expo/metro-runtime';
import * as SQLite from 'expo-sqlite';

async function startApp() {
  if (process.env.EXPO_OS === 'web') {
    // Let the SQLite worker start before Expo Router imports screens that open it synchronously.
    const database = await SQLite.openDatabaseAsync('finext.db');
    globalThis.__FINEXT_WEB_SQLITE__ = database;
  }

  await import('expo-router/entry');
}

void startApp().catch((error) => {
  console.error('Finext startup failed:', error);
  const root = document.getElementById('root');
  if (root) {
    const message = document.createElement('pre');
    message.style.cssText = 'margin: 24px; white-space: pre-wrap; font: 14px monospace; color: #9b1c1c;';
    message.textContent = `Finext could not start.\n\n${error instanceof Error ? error.stack ?? error.message : String(error)}`;
    root.replaceChildren(message);
  }
});
