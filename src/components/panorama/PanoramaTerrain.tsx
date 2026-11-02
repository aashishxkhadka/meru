/** Skia drawing of the panorama terrain. On web this module loads only after CanvasKit. */
import { Canvas, Group, LinearGradient, Path, Rect, Skia, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';

import type { Horizon } from '../../core/horizon';
import { computeBandSilhouettes } from '../../core/panoramaBands';
import { H_FOV_DEG, type PanoramaLayout, yOfAngle } from './layout';

/** Near = dark, far = light (SPEC 3.4). */
const NEAR = [30, 41, 56];
const FAR = [200, 212, 226];
const bandColor = (i: number, n: number) => {
  const t = n <= 1 ? 1 : i / (n - 1);
  const c = NEAR.map((v, k) => Math.round(v + (FAR[k]! - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};

export interface PanoramaTerrainProps {
  horizon: Horizon;
  layout: PanoramaLayout;
  centerDeg: number;
}

export default function PanoramaTerrain({ horizon, layout, centerDeg }: PanoramaTerrainProps) {
  // Paths in strip pixel space, built once per scene/layout. Panning only translates them.
  const { bands, skyline } = useMemo(() => {
    const { anglesDeg } = computeBandSilhouettes(horizon);
    const n = horizon.rays.length;
    const dx = (360 / n) * layout.pxPerDegX;
    const yOf = (a: number) => (Number.isFinite(a) ? yOfAngle(layout, a) : layout.terrainBottom);
    const filled = anglesDeg.map((angles) => {
      const b = Skia.PathBuilder.Make();
      b.moveTo(0, layout.terrainBottom);
      for (let i = 0; i <= n; i++) b.lineTo(i * dx, yOf(angles[i % n]!));
      b.lineTo(n * dx, layout.terrainBottom);
      b.close();
      return b.detach();
    });
    const sky = Skia.PathBuilder.Make();
    const top = anglesDeg[anglesDeg.length - 1]!;
    sky.moveTo(0, yOf(top[0]!));
    for (let i = 1; i <= n; i++) sky.lineTo(i * dx, yOf(top[i % n]!));
    // farthest band (full skyline) first, nearest last
    return { bands: filled.reverse(), skyline: sky.detach() };
  }, [horizon, layout]);

  const leftDeg = centerDeg - H_FOV_DEG / 2;
  const offset = -(((leftDeg % 360) + 360) % 360) * layout.pxPerDegX;
  const copies = [offset, offset + layout.stripWidth];

  return (
    <Canvas style={{ width: layout.width, height: layout.height }}>
      <Rect x={0} y={0} width={layout.width} height={layout.terrainBottom}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, layout.terrainBottom)}
          colors={['#3f6d9c', '#9cc0e2', '#d6e6f4']}
        />
      </Rect>
      {copies.map((x) => (
        <Group key={x} transform={[{ translateX: x }]}>
          {bands.map((path, i) => (
            <Path key={i} path={path} color={bandColor(bands.length - 1 - i, bands.length)} />
          ))}
          <Path path={skyline} style="stroke" strokeWidth={1.5} color="rgba(255,255,255,0.9)" />
        </Group>
      ))}
      <Rect
        x={0}
        y={layout.terrainBottom}
        width={layout.width}
        height={layout.height - layout.terrainBottom}
        color="#0b1220"
      />
    </Canvas>
  );
}
