/** Native storage for the offline event log: JSON lines in the app's documents folder. */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { type AppEvent, type EventExport, parseEventLines, serializeEvent } from '../core/eventLog';

const logFile = () => new File(Paths.document, 'meru-events.jsonl');

export async function readStoredEvents(): Promise<AppEvent[]> {
  const f = logFile();
  if (!f.exists) return [];
  return parseEventLines(await f.text());
}

export async function appendStoredEvents(events: readonly AppEvent[]): Promise<void> {
  if (events.length === 0) return;
  const f = logFile();
  if (!f.exists) f.create();
  await f.write(`${events.map(serializeEvent).join('\n')}\n`, { append: true });
}

/** Replace the file (used to trim it, or with [] to clear). */
export async function rewriteStoredEvents(events: readonly AppEvent[]): Promise<void> {
  const f = logFile();
  if (f.exists) f.delete();
  f.create();
  if (events.length) await f.write(`${events.map(serializeEvent).join('\n')}\n`);
}

/** Write the export JSON to the cache folder and open the share sheet. */
export async function shareEventExport(doc: EventExport): Promise<void> {
  const stamp = doc.exportedAt.slice(0, 19).replace(/[:T]/g, '-');
  const f = new File(Paths.cache, `meru-events-${stamp}.json`);
  if (f.exists) f.delete();
  f.create();
  await f.write(JSON.stringify(doc, null, 1));
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available');
  await Sharing.shareAsync(f.uri, { mimeType: 'application/json', UTI: 'public.json' });
}
