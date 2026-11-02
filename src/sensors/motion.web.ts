/** Web: no reliable device orientation for the camera overlay. */
import type { Vec3 } from '../core/orientation';

export const motionSupported = false;
export const SENSOR_INTERVAL_MS = 33;

export async function startMotionWatch(
  _onGravity: (g: Vec3) => void,
  _onMagnetic: (m: Vec3) => void,
): Promise<{ stop: () => void; hasMagnetometer: boolean } | null> {
  return null;
}
