import { networkInterfaces } from 'node:os';
import { buildServer } from './server';

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';

type Level = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

// Structured JSON logs are on by default; LOG=0 turns them off, LOG_LEVEL picks the level.
const { app, store } = await buildServer({
  logger: process.env.LOG === '0' ? false : ((process.env.LOG_LEVEL as Level | undefined) ?? 'info'),
  publicUrl: process.env.PUBLIC_URL,
  seedActivity: process.env.SEED_ACTIVITY !== '0',
  devPassword: process.env.DEV_PASSWORD || undefined,
  tokenSecret: process.env.TOKEN_SECRET || undefined,
  dataFile: process.env.DATA_FILE || undefined,
});
if (!process.env.TOKEN_SECRET) {
  app.log.warn('TOKEN_SECRET is not set: terminals will need to pair again after every restart');
}

// Save the data file and close sockets cleanly when Render (or Ctrl-C) stops the server.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
    store.flush();
    process.exit(0);
  });
}

await app.listen({ port, host });

const lan = Object.values(networkInterfaces())
  .flat()
  .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
console.log(`Dynkle mock dashboard on http://localhost:${port}`);
if (lan) console.log(`  LAN:        http://${lan}:${port}   (set EXPO_PUBLIC_API_URL to this on a real terminal)`);
console.log(`  Dev panel:  http://localhost:${port}/dev${process.env.DEV_PASSWORD ? '  (password protected)' : ''}`);
console.log(`  Emulator:   http://10.0.2.2:${port}`);
