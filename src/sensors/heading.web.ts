/** Web: no compass. Panorama falls back to drag-only. */
import type { HeadingSample } from './heading';

export type { HeadingSample };
export const headingSupported = false;

export async function startHeadingWatch(
  _onSample: (s: HeadingSample) => void,
): Promise<{ stop: () => void } | null> {
  return null;
}
