/**
 * Live camera view (SPEC 3.2, 6.5): full-screen preview + projected skyline + peak labels.
 * Per frame only projection runs; horizon and visibility come precomputed from SceneStore.
 */
import { Ionicons } from '@expo/vector-icons';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';

import {
  DEFAULT_SENSOR_FOV,
  NO_CALIBRATION,
  type CameraPose,
  type CameraView,
  projectToScreen,
  sensorFovFromFocalLength35mm,
  visibleFovForCover,
} from '../../core/projection';
import { useOrientationStore } from '../../store/orientationStore';
import type { PackScene } from '../../store/sceneStore';
import { strings } from '../../strings';
import { LABEL_ROW_HEIGHT, type LabelItem, PeakLabels, placeLabels } from '../labels/PeakLabels';
import { colors, radius, space } from '../theme';
import { Button, EmptyState } from '../ui';

/** SPEC 6.6: up to 3 label rows over the camera. */
const LABEL_ROWS = 3;
/** SPEC 11: pause the camera after 3 minutes without interaction. */
const IDLE_PAUSE_MS = 3 * 60 * 1000;
/** SPEC 3.2: phone pointed at the ground. */
const POINTING_DOWN_DEG = -30;

export const cameraSupported = true;

interface Props {
  scene: PackScene;
  width: number;
  height: number;
  /** Space kept clear at the top (location bar). */
  topInset: number;
  onPeakPress: (id: string) => void;
}

export function CameraLive({ scene, width, height, topInset, onPeakPress }: Props) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back', { physicalDevices: ['wide-angle'] });
  const { headingDeg, pitchDeg, rollDeg, headingAccuracy, magneticDisturbed } =
    useOrientationStore();

  // Idle auto-pause: any touch, or turning the phone more than 10°, counts as activity.
  const lastActivity = useRef(0); // set when the idle timer starts
  const lastHeading = useRef<number | null>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    lastActivity.current = Date.now();
    const id = setInterval(() => {
      if (Date.now() - lastActivity.current > IDLE_PAUSE_MS) setPaused(true);
    }, 10_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (headingDeg === null) return;
    const prev = lastHeading.current;
    if (prev === null || Math.abs(((headingDeg - prev + 540) % 360) - 180) > 10) {
      lastHeading.current = headingDeg;
      lastActivity.current = Date.now();
    }
  }, [headingDeg]);
  const wake = () => {
    lastActivity.current = Date.now();
    if (paused) setPaused(false);
  };

  // Field of view actually visible on screen (preview fills the view, cropping the sides).
  const focalLengthMm = device?.focalLength;
  const view: CameraView = useMemo(() => {
    const sensor = focalLengthMm ? sensorFovFromFocalLength35mm(focalLengthMm) : DEFAULT_SENSOR_FOV;
    return { widthPx: width, heightPx: height, ...visibleFovForCover(sensor, width, height) };
  }, [focalLengthMm, width, height]);

  if (!hasPermission) {
    return (
      <View style={[styles.center, { width, height }]}>
        <EmptyState
          icon="camera-outline"
          title={strings.camera.permissionTitle}
          text={strings.camera.permissionText}
        >
          <Button
            label={strings.camera.allowCamera}
            icon="camera"
            onPress={() => requestPermission()}
          />
        </EmptyState>
      </View>
    );
  }
  if (!device) {
    return (
      <View style={[styles.center, { width, height }]}>
        <EmptyState icon="camera-outline" title={strings.camera.noCamera} />
      </View>
    );
  }

  const pose: CameraPose | null =
    headingDeg !== null && pitchDeg !== null && rollDeg !== null
      ? { headingDeg, pitchDeg, rollDeg }
      : null;
  const compassPoor = magneticDisturbed || (headingAccuracy !== null && headingAccuracy <= 1);

  return (
    <View style={{ width, height }} onTouchStart={wake}>
      <Preview device={device} active={!paused} />
      {pose && !paused ? (
        <Overlay
          scene={scene}
          pose={pose}
          view={view}
          topInset={topInset}
          onPeakPress={onPeakPress}
        />
      ) : null}

      {!pose && !paused ? (
        <Hint icon="compass-outline" text={strings.camera.waitingForSensors} />
      ) : null}
      {pose && pose.pitchDeg < POINTING_DOWN_DEG && !paused ? (
        <Hint icon="arrow-up-circle-outline" text={strings.camera.pointUp} />
      ) : null}
      {compassPoor && !paused ? (
        <View style={styles.banner} pointerEvents="none">
          <Ionicons name="infinite" size={20} color={colors.accent} />
          <Text style={styles.bannerText}>{strings.camera.calibrateCompass}</Text>
        </View>
      ) : null}
      {paused ? (
        <Pressable style={[StyleSheet.absoluteFill, styles.paused]} onPress={wake}>
          <Ionicons name="pause-circle-outline" size={48} color={colors.text} />
          <Text style={styles.pausedText}>{strings.camera.paused}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Camera preview; memoised so 30 Hz sensor updates never re-render it. */
const Preview = memo(function Preview({
  device,
  active,
}: {
  device: NonNullable<ReturnType<typeof useCameraDevice>>;
  active: boolean;
}) {
  return (
    <Camera
      style={StyleSheet.absoluteFill}
      device={device}
      isActive={active}
      resizeMode="cover"
      zoom={1}
    />
  );
});

function Overlay({
  scene,
  pose,
  view,
  topInset,
  onPeakPress,
}: {
  scene: PackScene;
  pose: CameraPose;
  view: CameraView;
  topInset: number;
  onPeakPress: (id: string) => void;
}) {
  // Skyline: project every horizon ray in view; break the line where rays leave the screen.
  const { path, topY } = useMemo(() => {
    const b = Skia.PathBuilder.Make();
    let drawing = false;
    let top = view.heightPx;
    for (const ray of scene.horizon.rays) {
      const p = Number.isFinite(ray.maxAngleDeg)
        ? projectToScreen(ray.azimuthDeg, ray.maxAngleDeg, pose, view, NO_CALIBRATION, 2)
        : null;
      if (!p) {
        drawing = false;
        continue;
      }
      if (drawing) b.lineTo(p.x, p.y);
      else b.moveTo(p.x, p.y);
      drawing = true;
      if (p.x >= 0 && p.x <= view.widthPx) top = Math.min(top, p.y);
    }
    return { path: b.detach(), topY: top };
  }, [scene, pose, view]);

  const items: LabelItem[] = [];
  for (const r of scene.peaks) {
    if (!r.visible) continue;
    const p = projectToScreen(r.azimuthDeg, r.elevationAngleDeg, pose, view, NO_CALIBRATION, 0);
    if (!p || p.y < 0 || p.y > view.heightPx) continue;
    items.push({
      id: r.peak.id,
      name: r.peak.name,
      rank: r.peak.rank,
      elevationM: r.peak.elevationM,
      distanceM: r.distanceM,
      x: p.x,
      y: p.y,
    });
  }
  const placed = placeLabels(items, view.widthPx, LABEL_ROWS);
  // Labels ride just above the skyline, but never under the top bar or too low on screen.
  const minBottom = topInset + LABEL_ROWS * LABEL_ROW_HEIGHT + 8;
  const labelBottom = Math.min(Math.max(minBottom, topY - 10), view.heightPx * 0.7);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Path path={path} style="stroke" strokeWidth={4} color="rgba(0,0,0,0.25)" />
        <Path path={path} style="stroke" strokeWidth={1.75} color="rgba(255,255,255,0.85)" />
      </Canvas>
      <PeakLabels items={items} placed={placed} labelBottom={labelBottom} onPress={onPeakPress} />
    </View>
  );
}

function Hint({
  icon,
  text,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
}) {
  return (
    <View style={styles.hintWrap} pointerEvents="none">
      <View style={styles.hint}>
        <Ionicons name={icon} size={22} color={colors.text} />
        <Text style={styles.hintText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', backgroundColor: colors.bg },
  hintWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: 'rgba(11,18,32,0.8)',
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  hintText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  banner: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    bottom: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: 'rgba(11,18,32,0.88)',
    borderRadius: radius.md,
    padding: space.md,
  },
  bannerText: { color: colors.text, fontSize: 14, flex: 1, lineHeight: 19 },
  paused: {
    backgroundColor: 'rgba(11,18,32,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
  },
  pausedText: {
    color: colors.text,
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: space.xl,
  },
});
