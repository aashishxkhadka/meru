/**
 * Panorama view (SPEC 3.4): Skia terrain + decluttered, tappable peak labels.
 * Labels are React Native views so they render (and tap) identically on web and native.
 */
import { useMemo, useRef } from 'react';
import { type GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import { wrapTo360 } from '../../core/angles';
import { declutterLabels } from '../../core/declutter';
import type { PackScene } from '../../store/sceneStore';
import { colors } from '../theme';
import {
  H_FOV_DEG,
  LABEL_ROWS,
  LABEL_ROW_HEIGHT,
  makeLayout,
  xOfAzimuth,
  yOfAngle,
} from './layout';
import Terrain from './Terrain';

const COMPASS: Record<number, string> = {
  0: 'N',
  45: 'NE',
  90: 'E',
  135: 'SE',
  180: 'S',
  225: 'SW',
  270: 'W',
  315: 'NW',
};

const subtitle = (elevationM: number, distanceM: number) =>
  `${elevationM.toLocaleString('en-US')} m · ${(distanceM / 1000).toFixed(distanceM < 10_000 ? 1 : 0)} km`;
/** Width of a label pill for placement (bold 12.5 pt names, 10.5 pt subtitle, padding). */
const labelWidth = (name: string, sub: string, main: boolean) =>
  Math.ceil(Math.max(name.length * (main ? 8.1 : 7.3), sub.length * 6.1) + 16);

interface Props {
  scene: PackScene;
  width: number;
  height: number;
  centerDeg: number;
  /** Space kept free at the top for overlays. */
  topInset?: number;
  onDrag: (centerDeg: number) => void;
  onPeakPress: (peakId: string) => void;
}

export function Panorama({
  scene,
  width,
  height,
  centerDeg,
  topInset = 0,
  onDrag,
  onPeakPress,
}: Props) {
  const layout = useMemo(
    () => makeLayout(scene.horizon, width, height, topInset),
    [scene, width, height, topInset],
  );

  // Drag to rotate. Movements under 5 px fall through to label taps.
  const drag = useRef({ startX: 0, startDeg: 0 });
  const responder = {
    onTouchStart: (e: GestureResponderEvent) => {
      drag.current = { startX: e.nativeEvent.pageX, startDeg: centerDeg };
    },
    onMoveShouldSetResponderCapture: (e: GestureResponderEvent) =>
      Math.abs(e.nativeEvent.pageX - drag.current.startX) > 4,
    onResponderGrant: (e: GestureResponderEvent) => {
      drag.current = { startX: e.nativeEvent.pageX, startDeg: centerDeg };
    },
    onResponderMove: (e: GestureResponderEvent) =>
      onDrag(
        wrapTo360(
          drag.current.startDeg - (e.nativeEvent.pageX - drag.current.startX) / layout.pxPerDegX,
        ),
      ),
    onResponderTerminationRequest: () => false,
  };

  const visible = scene.peaks.filter((r) => r.visible);
  const placed = declutterLabels(
    visible.map((r) => ({
      id: r.peak.id,
      rank: r.peak.rank,
      elevationM: r.peak.elevationM,
      anchorX: xOfAzimuth(layout, centerDeg, r.azimuthDeg),
      widthPx: labelWidth(r.peak.name, subtitle(r.peak.elevationM, r.distanceM), r.peak.rank === 1),
      compactWidthPx: labelWidth(r.peak.name, '', r.peak.rank === 1),
    })),
    { screenWidthPx: width, maxShiftPx: 140, gapPx: 4, rowCount: LABEL_ROWS },
  );
  const byId = new Map(visible.map((r) => [r.peak.id, r]));

  const ticks: { x: number; az: number }[] = [];
  for (
    let az = Math.ceil((centerDeg - H_FOV_DEG / 2) / 5) * 5;
    az <= centerDeg + H_FOV_DEG / 2;
    az += 5
  ) {
    ticks.push({ x: xOfAzimuth(layout, centerDeg, az), az: wrapTo360(az) });
  }

  return (
    <View style={{ width, height }} {...responder}>
      <Terrain horizon={scene.horizon} layout={layout} centerDeg={centerDeg} />

      {ticks.map(({ x, az }) => (
        <View
          key={`t${az}`}
          style={[
            styles.tick,
            { left: x, top: layout.terrainBottom, height: az % 45 === 0 ? 8 : 4 },
          ]}
        />
      ))}
      {ticks
        .filter(({ az }) => az % 15 === 0)
        .map(({ x, az }) => (
          <Text
            key={`l${az}`}
            numberOfLines={1}
            style={[
              styles.tickText,
              { left: x - 20, top: layout.terrainBottom + 9 },
              az % 45 === 0 && styles.tickTextMajor,
            ]}
          >
            {COMPASS[az] ?? `${az}°`}
          </Text>
        ))}

      {placed.map((p) => {
        const r = byId.get(p.id)!;
        const summitY = yOfAngle(layout, r.elevationAngleDeg);
        const labelTop = layout.labelBottom - (p.row + 1) * LABEL_ROW_HEIGHT;
        const lineTop = labelTop + LABEL_ROW_HEIGHT - 4;
        const lineX = Math.min(Math.max(p.anchorX, p.left + 6), p.right - 6);
        const main = r.peak.rank === 1;
        return (
          <View key={p.id} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            {lineX !== p.anchorX && (
              <View
                style={[
                  styles.line,
                  {
                    left: Math.min(lineX, p.anchorX),
                    top: lineTop,
                    width: Math.abs(p.anchorX - lineX),
                    height: 1,
                  },
                ]}
              />
            )}
            <View
              style={[
                styles.line,
                { left: p.anchorX, top: lineTop, width: 1, height: Math.max(0, summitY - lineTop) },
              ]}
            />
            <View style={[styles.dot, { left: p.anchorX - 3, top: summitY - 3 }]} />
            <Pressable
              onPress={() => onPeakPress(p.id)}
              hitSlop={4}
              style={({ pressed }) => [
                styles.label,
                { left: p.left, top: labelTop, width: p.right - p.left },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${r.peak.name}, ${subtitle(r.peak.elevationM, r.distanceM)}`}
            >
              <Text style={[styles.name, main && styles.nameMain]} numberOfLines={1}>
                {r.peak.name}
              </Text>
              {!p.compact && (
                <Text style={styles.sub} numberOfLines={1}>
                  {subtitle(r.peak.elevationM, r.distanceM)}
                </Text>
              )}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tick: { position: 'absolute', width: 1, backgroundColor: colors.faint },
  tickText: {
    position: 'absolute',
    width: 40,
    textAlign: 'center',
    color: colors.muted,
    fontSize: 11,
  },
  tickTextMajor: { color: colors.text, fontWeight: '700', fontSize: 12 },
  line: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.7)' },
  dot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: '#fff',
  },
  label: {
    position: 'absolute',
    height: LABEL_ROW_HEIGHT - 6,
    paddingHorizontal: 7,
    justifyContent: 'center',
    borderRadius: 7,
    backgroundColor: 'rgba(11,18,32,0.78)',
  },
  name: { color: colors.text, fontSize: 12, fontWeight: '600' },
  nameMain: { fontWeight: '800', fontSize: 12.5 },
  sub: { color: '#c3cfdf', fontSize: 10.5 },
});
