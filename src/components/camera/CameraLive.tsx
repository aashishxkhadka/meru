/**
 * Live camera view (SPEC 3.2, 6.5): full-screen preview + projected skyline + peak labels.
 * Per frame only projection runs; horizon and visibility come precomputed from SceneStore.
 */
import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, memo, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  type CameraPhotoOutput,
  CommonResolutions,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';

import { viewWithFovOverride } from '../../core/calibration';
import {
  type CalibrationOffsets,
  DEFAULT_SENSOR_FOV,
  type CameraPose,
  type CameraView,
  sensorFovFromFocalLength35mm,
  visibleFovForCover,
} from '../../core/projection';
import { type CapturedPhoto, captureLabelledPhoto } from '../../photo/captureLabelledPhoto';
import { useOrientationStore } from '../../store/orientationStore';
import type { PackScene } from '../../store/sceneStore';
import { strings } from '../../strings';
import { colors, radius, space } from '../theme';
import { Button, EmptyState } from '../ui';
import { CameraOverlay } from './CameraOverlay';

/** SPEC 11: pause the camera after 3 minutes without interaction. */
const IDLE_PAUSE_MS = 3 * 60 * 1000;
/** SPEC 3.2: phone pointed at the ground. */
const POINTING_DOWN_DEG = -30;
const SHUTTER_SIZE = 72;

export const cameraSupported = true;

interface Props {
  scene: PackScene;
  width: number;
  height: number;
  /** Space kept clear at the top (location bar). */
  topInset: number;
  onPeakPress: (id: string) => void;
  /** Saved (or, while calibrating, draft) offsets applied to every projection. */
  calibration: CalibrationOffsets;
  /** Hand-set horizontal FOV (advanced calibration); null = from the lens. */
  hFovOverrideDeg: number | null;
  /** Shutter button (hidden while calibrating). Called with the labelled photo. */
  onPhotoCaptured?: (photo: CapturedPhoto) => void;
  /** Caption for the photo frame. */
  placeName?: string;
  /** Peak to emphasise (calibration "tap a peak"). */
  highlightPeakId?: string | null;
  /** Extra layer above the overlay (calibration controls), given the live view and pose. */
  renderExtra?: (ctx: {
    view: CameraView;
    pose: CameraPose | null;
    autoHFovDeg: number;
  }) => ReactNode;
}

export function CameraLive({
  scene,
  width,
  height,
  topInset,
  onPeakPress,
  calibration,
  hFovOverrideDeg,
  highlightPeakId = null,
  renderExtra,
  onPhotoCaptured,
  placeName = '',
}: Props) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back', { physicalDevices: ['wide-angle'] });
  // ~5 MP 4:3 still: plenty for sharing, light enough to composite on mid-range phones.
  const photoOutput = usePhotoOutput({
    targetResolution: CommonResolutions.QHD_4_3,
    qualityPrioritization: 'balanced',
  });
  const [capturing, setCapturing] = useState(false);
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
  const sensorFov = useMemo(
    () => (focalLengthMm ? sensorFovFromFocalLength35mm(focalLengthMm) : DEFAULT_SENSOR_FOV),
    [focalLengthMm],
  );
  const autoView: CameraView = useMemo(
    () => ({ widthPx: width, heightPx: height, ...visibleFovForCover(sensorFov, width, height) }),
    [sensorFov, width, height],
  );
  const view = useMemo(
    () => viewWithFovOverride(autoView, hFovOverrideDeg),
    [autoView, hFovOverrideDeg],
  );

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
  const showShutter = !!onPhotoCaptured && !renderExtra && !paused;

  const takePhoto = async () => {
    if (capturing || !onPhotoCaptured) return;
    wake();
    setCapturing(true);
    try {
      const photo = await captureLabelledPhoto({
        photoOutput,
        readPose: () => {
          const o = useOrientationStore.getState();
          return o.headingDeg !== null && o.pitchDeg !== null && o.rollDeg !== null
            ? { headingDeg: o.headingDeg, pitchDeg: o.pitchDeg, rollDeg: o.rollDeg }
            : null;
        },
        scene,
        calibration,
        sensorFov,
        screenAutoHFovDeg: autoView.hFovDeg,
        hFovOverrideDeg,
        placeName,
      });
      onPhotoCaptured(photo);
    } catch (e) {
      Alert.alert(strings.photo.failedTitle, e instanceof Error ? e.message : String(e));
    } finally {
      setCapturing(false);
    }
  };

  return (
    <View style={{ width, height }} onTouchStart={wake}>
      <Preview device={device} active={!paused} photoOutput={photoOutput} />
      {pose && !paused ? (
        <CameraOverlay
          scene={scene}
          pose={pose}
          view={view}
          topInset={topInset}
          onPeakPress={onPeakPress}
          calibration={calibration}
          highlightPeakId={highlightPeakId}
        />
      ) : null}
      {!paused && renderExtra ? renderExtra({ view, pose, autoHFovDeg: autoView.hFovDeg }) : null}

      {!pose && !paused ? (
        <Hint icon="compass-outline" text={strings.camera.waitingForSensors} />
      ) : null}
      {pose && pose.pitchDeg < POINTING_DOWN_DEG && !paused ? (
        <Hint icon="arrow-up-circle-outline" text={strings.camera.pointUp} />
      ) : null}
      {showShutter ? (
        <View style={styles.shutterWrap} pointerEvents="box-none">
          <Pressable
            onPress={takePhoto}
            disabled={!pose || capturing}
            style={({ pressed }) => [
              styles.shutter,
              (!pose || capturing) && { opacity: 0.5 },
              pressed && { transform: [{ scale: 0.94 }] },
            ]}
            accessibilityRole="button"
            accessibilityLabel={strings.photo.shutter}
          >
            <View style={styles.shutterInner}>
              {capturing ? <ActivityIndicator color={colors.bg} /> : null}
            </View>
          </Pressable>
        </View>
      ) : null}
      {compassPoor && !paused ? (
        <View
          style={[styles.banner, showShutter && { bottom: SHUTTER_SIZE + space.lg * 2 }]}
          pointerEvents="none"
        >
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
  photoOutput,
}: {
  device: NonNullable<ReturnType<typeof useCameraDevice>>;
  active: boolean;
  photoOutput: CameraPhotoOutput;
}) {
  return (
    <Camera
      style={StyleSheet.absoluteFill}
      device={device}
      isActive={active}
      outputs={[photoOutput]}
      // stills follow the (portrait-locked) UI, so they share the screen's axes and roll
      orientationSource="interface"
      resizeMode="cover"
      zoom={1}
    />
  );
});

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
  shutterWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: space.lg,
    alignItems: 'center',
  },
  shutter: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    borderRadius: SHUTTER_SIZE / 2,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  shutterInner: {
    width: SHUTTER_SIZE - 16,
    height: SHUTTER_SIZE - 16,
    borderRadius: (SHUTTER_SIZE - 16) / 2,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
