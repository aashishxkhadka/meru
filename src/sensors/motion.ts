/** Native motion sensors: gravity (DeviceMotion) + calibrated magnetic field (Magnetometer). */
import { DeviceMotion, Magnetometer } from 'expo-sensors';

import type { Vec3 } from '../core/orientation';

export const motionSupported = true;
export const SENSOR_INTERVAL_MS = 33; // ~30 Hz

export async function startMotionWatch(
  onGravity: (g: Vec3) => void,
  onMagnetic: (m: Vec3) => void,
): Promise<{ stop: () => void; hasMagnetometer: boolean } | null> {
  if (!(await DeviceMotion.isAvailableAsync())) return null;
  const permission = await DeviceMotion.requestPermissionsAsync();
  if (!permission.granted) return null;

  DeviceMotion.setUpdateInterval(SENSOR_INTERVAL_MS);
  const motionSub = DeviceMotion.addListener((m) => {
    const g = m.accelerationIncludingGravity;
    if (g) onGravity({ x: g.x, y: g.y, z: g.z });
  });

  const hasMagnetometer = await Magnetometer.isAvailableAsync();
  let magSub: { remove: () => void } | null = null;
  if (hasMagnetometer) {
    Magnetometer.setUpdateInterval(SENSOR_INTERVAL_MS);
    magSub = Magnetometer.addListener((m) => onMagnetic({ x: m.x, y: m.y, z: m.z }));
  }
  return {
    hasMagnetometer,
    stop: () => {
      motionSub.remove();
      magSub?.remove();
    },
  };
}
