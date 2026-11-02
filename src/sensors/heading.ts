/** Native: expo-location heading, used for compass accuracy and magnetic declination. */
import * as Location from 'expo-location';

export interface HeadingSample {
  /** Heading of the phone's top edge (unreliable when the phone is upright). */
  headingDeg: number;
  isTrueNorth: boolean;
  /** 0 = none, 1 = low, 2 = medium, 3 = high. */
  accuracy: number;
  /** trueHeading − magHeading when both are known, else null. */
  declinationDeg: number | null;
}

export const headingSupported = true;

export async function startHeadingWatch(
  onSample: (s: HeadingSample) => void,
): Promise<{ stop: () => void } | null> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') return null;
  const sub = await Location.watchHeadingAsync((h) => {
    const isTrueNorth = h.trueHeading >= 0;
    const raw = isTrueNorth ? h.trueHeading - h.magHeading : null;
    onSample({
      headingDeg: isTrueNorth ? h.trueHeading : h.magHeading,
      isTrueNorth,
      accuracy: h.accuracy,
      declinationDeg: raw === null ? null : ((((raw + 180) % 360) + 360) % 360) - 180,
    });
  });
  return { stop: () => sub.remove() };
}
