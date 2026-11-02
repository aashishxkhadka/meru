/** Web: no camera overlay (no reliable device orientation). Home shows the panorama instead. */
import type { PackScene } from '../../store/sceneStore';

export const cameraSupported = false;

export function CameraLive(_props: {
  scene: PackScene;
  width: number;
  height: number;
  topInset: number;
  onPeakPress: (id: string) => void;
}) {
  return null;
}
