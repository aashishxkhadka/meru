/** Native compass heading via expo-location (true north when available). */
import * as Location from 'expo-location';

export interface HeadingSample {
  /** Degrees clockwise from true north (falls back to magnetic; declination is ~0° in Nepal). */
  headingDeg: number;
  isTrueNorth: boolean;
  /** 0 = none, 1 = low, 2 = medium, 3 = high. */
  accuracy: number;
}

export const headingSupported = true;

export async function startHeadingWatch(
  onSample: (s: HeadingSample) => void,
): Promise<{ stop: () => void } | null> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') return null;
  const sub = await Location.watchHeadingAsync((h) => {
    const isTrueNorth = h.trueHeading >= 0;
    onSample({
      headingDeg: isTrueNorth ? h.trueHeading : h.magHeading,
      isTrueNorth,
      accuracy: h.accuracy,
    });
  });
  return { stop: () => sub.remove() };
}
