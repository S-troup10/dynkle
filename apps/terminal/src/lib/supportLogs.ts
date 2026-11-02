import { api } from '@/api/client';
import { log } from './logger';

/** Uploads the terminal's log to the dashboard for support. Returns a message for the merchant. */
export async function sendLogsToSupport(): Promise<{ ok: boolean; message: string }> {
  try {
    const { received } = await api.uploadLogs(log.entries());
    log.info('Logs sent to support', { entries: received });
    return { ok: true, message: `Sent ${received} log entries. Support will be in touch if they need anything else.` };
  } catch (e) {
    return { ok: false, message: `Couldn't send logs: ${(e as Error).message}. Try again when the terminal is online.` };
  }
}
