/** Thin wrapper around expo-location for GPS position updates (offline: GPS needs no data). */
import * as Location from 'expo-location';

export interface GpsFix {
  lat: number;
  lon: number;
  accuracyM: number | null;
  altitudeM: number | null;
  timestamp: number;
}

export type GpsStartResult = 'started' | 'denied' | 'services-off';

export interface GpsWatch {
  stop: () => void;
}

export async function startGpsWatch(
  onFix: (fix: GpsFix) => void,
  onError: (message: string) => void,
): Promise<{ result: GpsStartResult; watch: GpsWatch | null }> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') return { result: 'denied', watch: null };
  if (!(await Location.hasServicesEnabledAsync())) return { result: 'services-off', watch: null };

  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 2000,
      distanceInterval: 5,
      mayShowUserSettingsDialog: true,
    },
    (loc) =>
      onFix({
        lat: loc.coords.latitude,
        lon: loc.coords.longitude,
        accuracyM: loc.coords.accuracy,
        altitudeM: loc.coords.altitude,
        timestamp: loc.timestamp,
      }),
    (reason) => onError(String(reason)),
  );
  return { result: 'started', watch: { stop: () => subscription.remove() } };
}
