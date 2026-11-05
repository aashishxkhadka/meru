import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { circularMeanDeg, wrapTo360 } from '../src/core/angles';
import { photoPlaceName } from '../src/core/photoComposition';
import { CameraLive, cameraSupported } from '../src/components/camera/CameraLive';
import { Calibrator, useCalibrationSession } from '../src/components/camera/Calibrator';
import { Panorama } from '../src/components/panorama/Panorama';
import { colors, radius, space } from '../src/components/theme';
import { Button, EmptyState, type IconName } from '../src/components/ui';
import { useCalibrationStore } from '../src/store/calibrationStore';
import { useLocationStore } from '../src/store/locationStore';
import { useOrientationStore } from '../src/store/orientationStore';
import { usePack } from '../src/store/packStore';
import { logEvent } from '../src/store/eventLogStore';
import { useSceneStore } from '../src/store/sceneStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { strings } from '../src/strings';

const TOP_BAR = 56;
const BOTTOM_BAR = 64;
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/**
 * Home (SPEC 3.2): live camera with peak labels on phones (drawn panorama on web, or when
 * toggled). Location chip + heading on top; Places / Peaks / mode / Calibrate / Info below.
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const location = useLocationStore();
  const { status, scene, label } = useSceneStore();
  const orientation = useOrientationStore();
  const [follow, setFollow] = useState(orientation.supported);
  const [manualDeg, setManualDeg] = useState<number | null>(null);
  const [mode, setMode] = useState<'camera' | 'panorama'>(cameraSupported ? 'camera' : 'panorama');
  const saved = useCalibrationStore();
  const calib = useCalibrationSession();
  const pack = usePack();
  const onboarded = useSettingsStore((s) => s.onboarded) === true;

  // Start GPS once onboarding has explained why (and asked for permission).
  const { source, gpsStatus, startGps } = location;
  useEffect(() => {
    if (onboarded && source === 'gps' && gpsStatus === 'idle') startGps();
  }, [onboarded, source, gpsStatus, startGps]);
  useEffect(() => {
    if (onboarded) logEvent('mode_changed', { mode });
  }, [onboarded, mode]);
  const { supported, start, stop } = orientation;
  useEffect(() => {
    if (!supported) return;
    start();
    return stop;
  }, [supported, start, stop]);

  const mainPeaks =
    scene?.peaks.filter((r) => r.visible && r.peak.rank === 1).map((r) => r.azimuthDeg) ?? [];
  const defaultDeg = mainPeaks.length ? circularMeanDeg(mainPeaks) : 0;
  const inCamera = mode === 'camera';
  const following = (inCamera || follow) && orientation.headingDeg !== null;
  // The calibrated heading offset corrects the compass in both views.
  const centerDeg = following
    ? wrapTo360(orientation.headingDeg! + saved.offsets.headingOffsetDeg)
    : (manualDeg ?? defaultDeg);
  const calibrating = calib.active && inCamera;
  const openPeak = (id: string) => router.push({ pathname: '/peak/[id]', params: { id } });
  const panoHeight = height - insets.bottom - BOTTOM_BAR;
  const placeName = scene
    ? photoPlaceName(
        scene.position,
        location.source === 'simulated' ? (location.viewpoint?.name ?? null) : null,
        pack.viewpoints,
        pack.manifest.name,
        strings.photo.near,
      )
    : '';

  if (!onboarded) return <Redirect href="/onboarding" />;

  return (
    <View style={styles.root}>
      {scene && inCamera ? (
        <CameraLive
          scene={scene}
          width={width}
          height={panoHeight}
          topInset={insets.top + TOP_BAR}
          onPeakPress={calibrating ? calib.pickPeak : openPeak}
          calibration={calibrating ? calib.draft.offsets : saved.offsets}
          hFovOverrideDeg={calibrating ? calib.draft.hFovOverrideDeg : saved.hFovOverrideDeg}
          highlightPeakId={calibrating ? calib.pickedPeakId : null}
          placeName={placeName}
          onPhotoCaptured={(p) =>
            router.push({
              pathname: '/photo-preview',
              params: { uri: p.uri, w: String(p.widthPx), h: String(p.heightPx) },
            })
          }
          renderExtra={
            calibrating
              ? ({ view, pose, autoHFovDeg }) => (
                  <Calibrator
                    session={calib}
                    scene={scene}
                    view={view}
                    pose={pose}
                    autoHFovDeg={autoHFovDeg}
                    topInset={insets.top}
                  />
                )
              : undefined
          }
        />
      ) : scene ? (
        <Panorama
          scene={scene}
          width={width}
          height={panoHeight}
          centerDeg={centerDeg}
          topInset={insets.top + TOP_BAR}
          onDrag={(deg) => {
            setFollow(false);
            setManualDeg(deg);
          }}
          onPeakPress={openPeak}
        />
      ) : (
        <View style={[styles.emptyArea, { height: panoHeight, paddingTop: insets.top + TOP_BAR }]}>
          <NoScene />
        </View>
      )}

      {/* top bar (calibration shows its own title instead) */}
      <View
        style={[styles.topBar, { top: insets.top + space.sm }, calibrating && styles.hidden]}
        pointerEvents={calibrating ? 'none' : 'box-none'}
      >
        <Pressable
          style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
          onPress={() => router.push('/viewpoints')}
          accessibilityRole="button"
        >
          <Ionicons
            name={location.source === 'simulated' ? 'location' : 'navigate'}
            size={16}
            color={colors.accent}
          />
          <Text style={styles.chipText} numberOfLines={1}>
            {chipLabel(location, label)}
          </Text>
          {status === 'computing' ? (
            <ActivityIndicator size="small" color={colors.muted} />
          ) : (
            <Ionicons name="chevron-down" size={16} color={colors.muted} />
          )}
        </Pressable>
        {scene ? (
          <Pressable
            style={({ pressed }) => [styles.chip, styles.headingChip, pressed && { opacity: 0.7 }]}
            onPress={() => orientation.supported && setFollow(true)}
            disabled={!orientation.supported || following || inCamera}
            accessibilityLabel={
              orientation.supported && !following ? strings.home.followCompass : undefined
            }
          >
            {orientation.supported && (
              <Ionicons
                name={following ? 'compass' : 'compass-outline'}
                size={16}
                color={following ? colors.accent : colors.muted}
              />
            )}
            <Text style={styles.chipText}>
              {Math.round(centerDeg) % 360}° {COMPASS[Math.round(centerDeg / 45) % 8]}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* bottom bar */}
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: insets.bottom, height: BOTTOM_BAR + insets.bottom },
        ]}
      >
        {calibrating ? (
          <>
            <BarButton
              icon="refresh"
              label={strings.calibration.reset}
              onPress={calib.resetDraft}
            />
            <BarButton icon="close" label={strings.calibration.cancel} onPress={calib.cancel} />
            <BarButton
              icon="checkmark-circle"
              label={strings.calibration.done}
              onPress={calib.done}
              highlight
            />
          </>
        ) : (
          <>
            <BarButton
              icon="map-outline"
              label={strings.home.places}
              onPress={() => router.push('/viewpoints')}
            />
            <BarButton
              icon="list"
              label={strings.home.peaks}
              onPress={() => router.push('/peaks')}
            />
            {cameraSupported ? (
              <BarButton
                icon={inCamera ? 'image-outline' : 'camera-outline'}
                label={inCamera ? strings.camera.modePanorama : strings.camera.modeCamera}
                onPress={() => setMode(inCamera ? 'panorama' : 'camera')}
              />
            ) : null}
            <BarButton
              icon={saved.calibratedAt !== null ? 'checkmark-circle' : 'compass-outline'}
              label={
                saved.calibratedAt !== null
                  ? strings.calibration.calibrated
                  : strings.camera.calibrate
              }
              highlight={saved.calibratedAt !== null}
              onPress={() => {
                if (!cameraSupported) {
                  router.push('/calibration');
                  return;
                }
                setMode('camera');
                calib.begin();
              }}
            />
            <BarButton
              icon="information-circle-outline"
              label={strings.home.info}
              onPress={() => router.push('/about')}
            />
          </>
        )}
      </View>
    </View>
  );
}

function chipLabel(
  location: ReturnType<typeof useLocationStore.getState>,
  sceneLabel: string | null,
): string {
  if (location.source === 'simulated' && location.viewpoint) return location.viewpoint.name;
  if (location.gpsStatus === 'fixed' && location.fix) {
    return strings.location.chipGps(Math.round(location.fix.accuracyM ?? 0));
  }
  if (location.gpsStatus === 'searching' || location.gpsStatus === 'requesting') {
    return strings.location.chipSearching;
  }
  return sceneLabel ?? strings.location.pickViewpoint;
}

/** What to show while there is no scene yet. */
function NoScene() {
  const { source, gpsStatus, searchStartedAt, startGps, gpsError } = useLocationStore();
  const sceneStatus = useSceneStore((s) => s.status);
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    if (gpsStatus !== 'searching') return;
    const tick = () => setNowMs(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [gpsStatus]);

  const L = strings.location;
  const pick = () => router.push('/viewpoints');

  if (sceneStatus === 'computing' || (source === 'simulated' && sceneStatus !== 'outside')) {
    return <EmptyState icon="hourglass-outline" busy title={strings.home.computing} />;
  }
  if (sceneStatus === 'outside') {
    return (
      <EmptyState icon="map-outline" title={L.outsideTitle} text={L.outsideText}>
        <Button label={L.pickViewpoint} icon="location" onPress={pick} />
      </EmptyState>
    );
  }
  if (gpsStatus === 'searching') {
    const secs = searchStartedAt && nowMs ? Math.round((nowMs - searchStartedAt) / 1000) : 0;
    return (
      <EmptyState icon="navigate" busy title={L.searchingTitle} text={L.searchingText(secs)}>
        <Button label={L.pickInstead} icon="location" variant="secondary" onPress={pick} />
      </EmptyState>
    );
  }
  const problem: Partial<Record<string, { icon: IconName; title: string; text: string }>> = {
    denied: { icon: 'location-outline', title: L.deniedTitle, text: L.deniedText },
    'services-off': {
      icon: 'location-outline',
      title: L.servicesOffTitle,
      text: L.servicesOffText,
    },
    error: { icon: 'warning-outline', title: L.errorTitle, text: gpsError ?? '' },
  };
  const p = problem[gpsStatus];
  if (p) {
    return (
      <EmptyState icon={p.icon} title={p.title} text={p.text}>
        <Button label={L.pickViewpoint} icon="location" onPress={pick} />
        <Button label={strings.retry} variant="secondary" onPress={() => startGps()} />
      </EmptyState>
    );
  }
  return (
    <EmptyState
      icon="navigate"
      busy={gpsStatus === 'requesting'}
      title={L.whereTitle}
      text={L.whereText}
    >
      <Button label={L.useMyLocation} icon="navigate" onPress={() => startGps()} />
      <Button label={L.pickViewpoint} icon="location" variant="secondary" onPress={pick} />
    </EmptyState>
  );
}

function BarButton({
  icon,
  label,
  onPress,
  highlight = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Accent colour (calibrated badge, primary action). */
  highlight?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.barButton, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={24} color={highlight ? colors.accent : colors.text} />
      <Text style={[styles.barLabel, highlight && { color: colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  emptyArea: { justifyContent: 'center' },
  hidden: { opacity: 0 },
  topBar: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    height: TOP_BAR - space.sm * 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(11,18,32,0.82)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    flexShrink: 1,
  },
  headingChip: { flexShrink: 0 },
  chipText: { color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  barButton: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  barLabel: { color: colors.muted, fontSize: 11, fontWeight: '600' },
});
