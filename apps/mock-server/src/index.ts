import { networkInterfaces } from 'node:os';
import { buildServer } from './server';

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';

const { app } = await buildServer({
  logger: process.env.LOG === '1',
  publicUrl: process.env.PUBLIC_URL,
  seedActivity: process.env.SEED_ACTIVITY !== '0',
  devPassword: process.env.DEV_PASSWORD || undefined,
});
await app.listen({ port, host });

const lan = Object.values(networkInterfaces())
  .flat()
  .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
console.log(`Dynkle mock dashboard on http://localhost:${port}`);
if (lan) console.log(`  LAN:        http://${lan}:${port}   (set EXPO_PUBLIC_API_URL to this on a real terminal)`);
console.log(`  Dev panel:  http://localhost:${port}/dev${process.env.DEV_PASSWORD ? '  (password protected)' : ''}`);
console.log(`  Emulator:   http://10.0.2.2:${port}`);
