/**
 * Photo export (SPEC 8): capture a still, re-project the labels for the still's size and field
 * of view with the pose recorded at capture time, composite offscreen with Skia, write a JPEG
 * to the cache folder. Never uses a screenshot of the preview (that is often black).
 */
import { Skia } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
import type { CameraPhotoOutput } from 'react-native-vision-camera';

import { composePhoto, type PhotoPeak, stillPhotoView } from '../core/photoComposition';
import type { CalibrationOffsets, CameraPose } from '../core/projection';
import type { PackScene } from '../store/sceneStore';
import { strings } from '../strings';
import { measureWithSkia, renderCompositionToJpeg } from './renderPhoto';

export interface CapturedPhoto {
  uri: string;
  widthPx: number;
  heightPx: number;
  peakNames: string[];
  timingMs: { capture: number; decode: number; compose: number; total: number };
}

export interface CaptureRequest {
  photoOutput: CameraPhotoOutput;
  /** Returns the current raw (uncalibrated) pose; read again at the moment of exposure. */
  readPose: () => CameraPose | null;
  scene: PackScene;
  calibration: CalibrationOffsets;
  sensorFov: { hFovDeg: number; vFovDeg: number };
  screenAutoHFovDeg: number;
  hFovOverrideDeg: number | null;
  placeName: string;
}

export async function captureLabelledPhoto(req: CaptureRequest): Promise<CapturedPhoto> {
  const t0 = performance.now();
  let pose = req.readPose();
  if (!pose) throw new Error(strings.photo.noPose);

  const photo = await req.photoOutput.capturePhoto(
    { flashMode: 'off', enableShutterSound: true },
    {
      onWillCapturePhoto: () => {
        pose = req.readPose() ?? pose; // closest to the exposure
      },
    },
  );
  const t1 = performance.now();

  // Photo -> upright image (orientation applied) -> Skia image.
  let skImage;
  try {
    const upright = await photo.toImageAsync();
    const encoded = await upright.toEncodedImageDataAsync('jpg', 95);
    upright.dispose();
    skImage = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(new Uint8Array(encoded.buffer)));
  } finally {
    photo.dispose();
  }
  if (!skImage) throw new Error('Could not read the captured photo');
  const t2 = performance.now();

  const w = skImage.width();
  const h = skImage.height();
  const view = stillPhotoView(req.sensorFov, w, h, req.screenAutoHFovDeg, req.hFovOverrideDeg);
  const peaks: PhotoPeak[] = req.scene.peaks
    .filter((r) => r.visible)
    .map((r) => ({
      id: r.peak.id,
      name: r.peak.name,
      rank: r.peak.rank,
      elevationM: r.peak.elevationM,
      distanceM: r.distanceM,
      azimuthDeg: r.azimuthDeg,
      elevationAngleDeg: r.elevationAngleDeg,
    }));
  const composition = composePhoto({
    photoWidthPx: w,
    photoHeightPx: h,
    pose: pose!,
    view,
    calibration: req.calibration,
    horizonRays: req.scene.horizon.rays,
    peaks,
    appName: strings.appName,
    placeName: req.placeName,
    dateText: formatPhotoDate(new Date()),
    peaksPrefix: strings.photo.peaksPrefix,
    moreText: strings.photo.more,
    measure: measureWithSkia,
  });
  const bytes = renderCompositionToJpeg(skImage, composition);
  skImage.dispose();

  const file = new File(Paths.cache, `meru-${Date.now()}.jpg`);
  await file.write(bytes);
  const t3 = performance.now();

  return {
    uri: file.uri,
    widthPx: composition.widthPx,
    heightPx: composition.heightPx,
    peakNames: composition.peakNames,
    timingMs: { capture: t1 - t0, decode: t2 - t1, compose: t3 - t2, total: t3 - t0 },
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "5 Nov 2026" without depending on the device's Intl data. */
export const formatPhotoDate = (d: Date) =>
  `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
