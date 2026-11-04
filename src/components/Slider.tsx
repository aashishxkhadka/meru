/** Minimal slider (pure JS, works on web and native) with − / + buttons for fine steps. */
import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { type GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from './theme';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  /** Step of the − / + buttons. */
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}

const THUMB = 22;

export function Slider({ label, value, min, max, step, format, onChange }: Props) {
  const [trackW, setTrackW] = useState(0);
  const grab = useRef({ pageX: 0, value: 0 });
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const fromX = (x: number) => clamp(min + (x / Math.max(1, trackW)) * (max - min));
  const frac = (clamp(value) - min) / (max - min);

  const onGrant = (e: GestureResponderEvent) => {
    const v = fromX(e.nativeEvent.locationX);
    grab.current = { pageX: e.nativeEvent.pageX, value: v };
    onChange(v);
  };
  const onMove = (e: GestureResponderEvent) => {
    const dx = e.nativeEvent.pageX - grab.current.pageX;
    onChange(clamp(grab.current.value + (dx / Math.max(1, trackW)) * (max - min)));
  };
  const nudge = (d: number) => onChange(clamp(Math.round((value + d) / step) * step));

  return (
    <View style={styles.row}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Pressable
        onPress={() => nudge(-step)}
        hitSlop={8}
        style={styles.btn}
        accessibilityLabel={`${label} −`}
      >
        <Ionicons name="remove" size={18} color={colors.text} />
      </Pressable>
      <View
        style={styles.track}
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={onGrant}
        onResponderMove={onMove}
        onResponderTerminationRequest={() => false}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: format(value) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) =>
          nudge(e.nativeEvent.actionName === 'increment' ? step : -step)
        }
      >
        <View style={styles.rail} pointerEvents="none" />
        {min < 0 && max > 0 ? (
          <View
            style={[styles.zero, { left: ((0 - min) / (max - min)) * trackW }]}
            pointerEvents="none"
          />
        ) : null}
        <View style={[styles.thumb, { left: frac * trackW - THUMB / 2 }]} pointerEvents="none" />
      </View>
      <Pressable
        onPress={() => nudge(step)}
        hitSlop={8}
        style={styles.btn}
        accessibilityLabel={`${label} +`}
      >
        <Ionicons name="add" size={18} color={colors.text} />
      </Pressable>
      <Text style={styles.value}>{format(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40 },
  label: { color: colors.muted, fontSize: 13, fontWeight: '600', width: 62 },
  btn: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: { flex: 1, height: 40, justifyContent: 'center' },
  rail: { height: 4, borderRadius: 2, backgroundColor: colors.border },
  zero: { position: 'absolute', top: 13, width: 2, height: 14, backgroundColor: colors.faint },
  thumb: {
    position: 'absolute',
    top: (40 - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: '#fff',
  },
  value: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    width: 52,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});
