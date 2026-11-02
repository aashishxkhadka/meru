import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Text } from 'react-native';

import { circularMeanDeg, wrapTo180 } from '../src/core/angles';
import { LocationStatus } from '../src/components/LocationStatus';
import { NavButton, Placeholder, Screen, screenStyles } from '../src/components/Screen';
import { colors } from '../src/components/theme';
import { useLocationStore } from '../src/store/locationStore';
import { useSceneStore } from '../src/store/sceneStore';
import { strings } from '../src/strings';

const compass = (az: number) =>
  ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(az / 45) % 8];

/** Camera view (home, SPEC 3.2). Until step 8 it lists the visible peaks instead of a camera. */
export default function CameraScreen() {
  const { source, gpsStatus, startGps } = useLocationStore();
  const { status, scene } = useSceneStore();

  useEffect(() => {
    if (source === 'gps' && gpsStatus === 'idle') startGps();
  }, [source, gpsStatus, startGps]);

  // Left to right as you face the main peaks (like the panorama).
  const all = scene?.peaks ?? [];
  const main = all.filter((r) => r.visible && r.peak.rank === 1).map((r) => r.azimuthDeg);
  const centerDeg = main.length ? circularMeanDeg(main) : 0;
  const visible = all
    .filter((r) => r.visible)
    .sort((a, b) => wrapTo180(a.azimuthDeg - centerDeg) - wrapTo180(b.azimuthDeg - centerDeg));
  const hiddenCount = (scene?.peaks.length ?? 0) - visible.length;

  return (
    <Screen title={strings.appName} back={false}>
      <LocationStatus />
      <NavButton label={strings.camera.panorama} onPress={() => router.push('/panorama')} />
      <NavButton label={strings.camera.calibrate} onPress={() => router.push('/calibration')} />
      <NavButton label={strings.camera.about} onPress={() => router.push('/about')} />
      <Placeholder step={8} />

      {status === 'computing' && (
        <Text style={screenStyles.muted}>
          <ActivityIndicator color={colors.accent} size="small" /> {strings.scene.computing}
        </Text>
      )}
      {scene && (
        <>
          <Text style={screenStyles.section}>{strings.scene.visibleTitle(visible.length)}</Text>
          {visible.map((r) => (
            <NavButton
              key={r.peak.id}
              label={`${r.peak.name} · ${r.peak.elevationM} m · ${(r.distanceM / 1000).toFixed(0)} km · ${compass(r.azimuthDeg)} ${r.azimuthDeg.toFixed(0)}°`}
              onPress={() => router.push({ pathname: '/peak/[id]', params: { id: r.peak.id } })}
            />
          ))}
          <Text style={screenStyles.muted}>{strings.scene.hiddenNote(hiddenCount)}</Text>
        </>
      )}
    </Screen>
  );
}
