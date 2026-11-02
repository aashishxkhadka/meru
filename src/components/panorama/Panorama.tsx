/**
 * Panorama view (SPEC 3.4): Skia terrain + decluttered, tappable peak labels.
 * Labels are React Native views so they render (and tap) identically on web and native.
 */
import { useMemo, useRef } from 'react';
import { type GestureResponderEvent, StyleSheet, Text, View } from 'react-native';

import { wrapTo360 } from '../../core/angles';
import type { PackScene } from '../../store/sceneStore';
import { colors } from '../theme';
import { H_FOV_DEG, LABEL_ROWS, makeLayout, xOfAzimuth, yOfAngle } from './layout';
import Terrain from './Terrain';
import { type LabelItem, PeakLabels, placeLabels } from '../labels/PeakLabels';

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

  const items: LabelItem[] = scene.peaks
    .filter((r) => r.visible)
    .map((r) => ({
      id: r.peak.id,
      name: r.peak.name,
      rank: r.peak.rank,
      elevationM: r.peak.elevationM,
      distanceM: r.distanceM,
      x: xOfAzimuth(layout, centerDeg, r.azimuthDeg),
      y: yOfAngle(layout, r.elevationAngleDeg),
    }));
  const placed = placeLabels(items, width, LABEL_ROWS);

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

      <PeakLabels
        items={items}
        placed={placed}
        labelBottom={layout.labelBottom}
        onPress={onPeakPress}
      />
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
});
