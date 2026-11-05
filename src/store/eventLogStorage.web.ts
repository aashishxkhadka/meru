/** Web: the log lives in memory for the session; export downloads the JSON file. */
import type { AppEvent, EventExport } from '../core/eventLog';

export async function readStoredEvents(): Promise<AppEvent[]> {
  return [];
}

export async function appendStoredEvents(_events: readonly AppEvent[]): Promise<void> {}

export async function rewriteStoredEvents(_events: readonly AppEvent[]): Promise<void> {}

export async function shareEventExport(doc: EventExport): Promise<void> {
  const blob = new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `meru-events-${doc.exportedAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
