/** Skyline + peak labels projected over the camera preview (per-frame projection only). */
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  type CalibrationOffsets,
  type CameraPose,
  type CameraView,
  projectToScreen,
} from '../../core/projection';
import type { PackScene } from '../../store/sceneStore';
import { LABEL_ROW_HEIGHT, type LabelItem, PeakLabels, placeLabels } from '../labels/PeakLabels';

/** SPEC 6.6: up to 3 label rows over the camera. */
export const LABEL_ROWS = 3;

export function CameraOverlay({
  scene,
  pose,
  view,
  topInset,
  onPeakPress,
  calibration,
  highlightPeakId,
}: {
  scene: PackScene;
  pose: CameraPose;
  view: CameraView;
  topInset: number;
  onPeakPress: (id: string) => void;
  calibration: CalibrationOffsets;
  highlightPeakId: string | null;
}) {
  // Skyline: project every horizon ray in view; break the line where rays leave the screen.
  const { path, topY } = useMemo(() => {
    const b = Skia.PathBuilder.Make();
    let drawing = false;
    let top = view.heightPx;
    for (const ray of scene.horizon.rays) {
      const p = Number.isFinite(ray.maxAngleDeg)
        ? projectToScreen(ray.azimuthDeg, ray.maxAngleDeg, pose, view, calibration, 2)
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
  }, [scene, pose, view, calibration]);

  const items: LabelItem[] = [];
  for (const r of scene.peaks) {
    if (!r.visible) continue;
    const p = projectToScreen(r.azimuthDeg, r.elevationAngleDeg, pose, view, calibration, 0);
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
      <PeakLabels
        items={items}
        placed={placed}
        labelBottom={labelBottom}
        onPress={onPeakPress}
        highlightId={highlightPeakId}
      />
    </View>
  );
}
