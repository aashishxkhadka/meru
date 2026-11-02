/**
 * Panorama mode view (SPEC 3.4): Skia terrain + decluttered, tappable peak labels.
 * Labels are plain React Native views so they render (and tap) identically on web and native.
 */
import { useMemo, useRef } from 'react';
import { type GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import { wrapTo360 } from '../../core/angles';
import { declutterLabels } from '../../core/declutter';
import type { PackScene } from '../../store/sceneStore';
import { colors } from '../theme';
import {
  AXIS_HEIGHT,
  H_FOV_DEG,
  LABEL_AREA,
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
/** Label width for placement: bold 13 pt names are wider than 12 pt ones; + padding. */
const estimateWidth = (name: string, sub: string, main: boolean) =>
  Math.ceil(Math.max(name.length * (main ? 8.4 : 7.4), sub.length * 6.6) + 16);
const subtitle = (elevationM: number, distanceM: number) =>
  `${elevationM.toLocaleString('en-US')} m · ${(distanceM / 1000).toFixed(distanceM < 10_000 ? 1 : 0)} km`;

interface Props {
  scene: PackScene;
  width: number;
  height: number;
  centerDeg: number;
  /** Called while dragging with the new centre azimuth. */
  onDrag: (centerDeg: number) => void;
  onPeakPress: (peakId: string) => void;
}

export function Panorama({ scene, width, height, centerDeg, onDrag, onPeakPress }: Props) {
  const layout = useMemo(() => makeLayout(scene.horizon, width, height), [scene, width, height]);

  // Drag to rotate (responder props, so handlers always see current values).
  // Movements under 5 px fall through to label taps.
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
  const candidates = visible.map((r) => ({
    id: r.peak.id,
    rank: r.peak.rank,
    elevationM: r.peak.elevationM,
    anchorX: xOfAzimuth(layout, centerDeg, r.azimuthDeg),
    widthPx: estimateWidth(
      r.peak.name,
      subtitle(r.peak.elevationM, r.distanceM),
      r.peak.rank === 1,
    ),
    compactWidthPx: estimateWidth(r.peak.name, '', r.peak.rank === 1),
  }));
  const placed = declutterLabels(candidates, { screenWidthPx: width, maxShiftPx: 160 });
  const byId = new Map(visible.map((r) => [r.peak.id, r]));

  const ticks: { x: number; az: number }[] = [];
  const first = Math.ceil((centerDeg - H_FOV_DEG / 2) / 5) * 5;
  for (let az = first; az <= centerDeg + H_FOV_DEG / 2; az += 5) {
    ticks.push({ x: xOfAzimuth(layout, centerDeg, az), az: wrapTo360(az) });
  }

  return (
    <View style={{ width, height }} {...responder}>
      <Terrain horizon={scene.horizon} layout={layout} centerDeg={centerDeg} />

      {/* compass axis */}
      {ticks.map(({ x, az }) => (
        <View
          key={`t${az}`}
          style={[
            styles.tick,
            { left: x, top: layout.terrainBottom, height: az % 45 === 0 ? 10 : 5 },
          ]}
        />
      ))}
      {ticks
        .filter(({ az }) => az % 15 === 0)
        .map(({ x, az }) => (
          <Text
            key={`l${az}`}
            style={[
              styles.tickText,
              { left: x - 20, top: layout.terrainBottom + 11 },
              az % 45 === 0 && styles.tickTextMajor,
            ]}
            numberOfLines={1}
          >
            {COMPASS[az] ?? `${az}°`}
          </Text>
        ))}

      {/* labels: leader line from label to summit, dot on the summit */}
      {placed.map((p) => {
        const r = byId.get(p.id)!;
        const summitY = yOfAngle(layout, r.elevationAngleDeg);
        const labelTop = LABEL_AREA - (p.row + 1) * LABEL_ROW_HEIGHT;
        const lineTop = labelTop + LABEL_ROW_HEIGHT - 4;
        // Shifted labels: the leader drops from inside the label box (nearest the summit),
        // then runs straight down to the summit.
        const lineX = Math.min(Math.max(p.anchorX, p.left + 6), p.right - 6);
        return (
          <View key={p.id} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            {lineX !== p.anchorX && (
              <View
                style={[
                  styles.connector,
                  {
                    left: Math.min(lineX, p.anchorX),
                    top: lineTop,
                    width: Math.abs(p.anchorX - lineX),
                  },
                ]}
              />
            )}
            <View
              style={[
                styles.leader,
                { left: p.anchorX, top: lineTop, height: Math.max(0, summitY - lineTop) },
              ]}
            />
            <View style={[styles.dot, { left: p.anchorX - 3, top: summitY - 3 }]} />
            <Pressable
              onPress={() => onPeakPress(p.id)}
              hitSlop={4}
              style={[styles.label, { left: p.left, top: labelTop, width: p.right - p.left }]}
              accessibilityRole="button"
              accessibilityLabel={`${r.peak.name}, ${subtitle(r.peak.elevationM, r.distanceM)}`}
            >
              <Text style={[styles.name, r.peak.rank === 1 && styles.nameMain]} numberOfLines={1}>
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
  tick: { position: 'absolute', width: 1, backgroundColor: colors.muted },
  tickText: {
    position: 'absolute',
    top: 10,
    left: -20,
    width: 40,
    textAlign: 'center',
    color: colors.muted,
    fontSize: 11,
  },
  tickTextMajor: { color: colors.text, fontWeight: '700', fontSize: 12 },
  leader: { position: 'absolute', width: 1, backgroundColor: 'rgba(255,255,255,0.75)' },
  connector: { position: 'absolute', height: 1, backgroundColor: 'rgba(255,255,255,0.75)' },
  dot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  label: {
    position: 'absolute',
    height: LABEL_ROW_HEIGHT - 4,
    paddingHorizontal: 6,
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: 'rgba(11,18,32,0.72)',
  },
  name: { color: colors.text, fontSize: 12, fontWeight: '600' },
  nameMain: { fontWeight: '800', fontSize: 13 },
  sub: { color: colors.muted, fontSize: 11 },
});

export { AXIS_HEIGHT };
