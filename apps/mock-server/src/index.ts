import { networkInterfaces } from 'node:os';
import { DEFAULT_DYNK_MINT, buildServer } from './server';
import { MockChain, SolanaRpcChain, type ChainClient } from './solana/chain';
import { addressOnlyWallet, generateWallet, walletFromSecret, type MerchantWallet } from './solana/wallet';

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';

type Level = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

// ---- DYNK Bluetooth Tap to Pay ----
// Receiving wallet: with its secret key sessions are signed (customers see a verified merchant);
// with only an address they go out unsigned (customers confirm the address first).
const notes: string[] = [];
let wallet: MerchantWallet;
if (process.env.MERCHANT_SOL_SECRET) wallet = walletFromSecret(process.env.MERCHANT_SOL_SECRET);
else if (process.env.MERCHANT_SOL_ADDRESS) {
  wallet = addressOnlyWallet(process.env.MERCHANT_SOL_ADDRESS);
  notes.push('MERCHANT_SOL_SECRET is not set: Bluetooth sessions are unsigned, so customers must confirm the address');
} else {
  wallet = generateWallet();
  notes.push(`No merchant wallet configured: generated ${wallet.address} for this run (set MERCHANT_SOL_SECRET to keep one)`);
}
const mint = process.env.DYNK_MINT || DEFAULT_DYNK_MINT;
let chain: ChainClient;
let decimals = process.env.DYNK_DECIMALS ? Number(process.env.DYNK_DECIMALS) : undefined;
if (process.env.SOLANA_RPC_URL) {
  chain = new SolanaRpcChain(process.env.SOLANA_RPC_URL);
  // Read decimals from chain rather than assuming them.
  decimals ??= (await chain.getDecimals(mint)) ?? undefined;
  if (decimals === undefined) throw new Error(`Could not read decimals for DYNK mint ${mint}`);
} else {
  decimals ??= 6;
  chain = new MockChain({ [mint]: decimals });
  notes.push('SOLANA_RPC_URL is not set: DYNK payments are checked against the in-memory mock chain');
}

// Structured JSON logs are on by default; LOG=0 turns them off, LOG_LEVEL picks the level.
const { app, store } = await buildServer({
  logger: process.env.LOG === '0' ? false : ((process.env.LOG_LEVEL as Level | undefined) ?? 'info'),
  publicUrl: process.env.PUBLIC_URL,
  seedActivity: process.env.SEED_ACTIVITY !== '0',
  devPassword: process.env.DEV_PASSWORD || undefined,
  tokenSecret: process.env.TOKEN_SECRET || undefined,
  dataFile: process.env.DATA_FILE || undefined,
  dynk: { wallet, chain, mint, decimals },
});
for (const note of notes) app.log.warn(note);
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
