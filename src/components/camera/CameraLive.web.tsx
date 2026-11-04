/** Web: no camera overlay (no reliable device orientation). Home shows the panorama instead. */
import type { ReactNode } from 'react';

import type { CalibrationOffsets, CameraPose, CameraView } from '../../core/projection';
import type { PackScene } from '../../store/sceneStore';

export const cameraSupported = false;

export function CameraLive(_props: {
  scene: PackScene;
  width: number;
  height: number;
  topInset: number;
  onPeakPress: (id: string) => void;
  calibration: CalibrationOffsets;
  hFovOverrideDeg: number | null;
  highlightPeakId?: string | null;
  renderExtra?: (ctx: {
    view: CameraView;
    pose: CameraPose | null;
    autoHFovDeg: number;
  }) => ReactNode;
}) {
  return null;
}
