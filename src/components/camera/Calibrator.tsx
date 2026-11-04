/**
 * Calibration mode over the live camera (SPEC 3.3): drag the drawn skyline onto the real ridge,
 * or use sliders, or tap a peak label and then where that peak really is. Advanced: FOV.
 * Rendered inside CameraLive (same camera session) and saved to CalibrationStore on Done.
 */
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useRef, useState } from 'react';
import { type GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  CALIBRATION_LIMITS,
  FOV_OVERRIDE_RANGE,
  alignTargetToPoint,
  clampOffsets,
  shiftOffsets,
} from '../../core/calibration';
import type { CalibrationOffsets, CameraPose, CameraView } from '../../core/projection';
import { useCalibrationStore } from '../../store/calibrationStore';
import type { PackScene } from '../../store/sceneStore';
import { strings } from '../../strings';
import { Slider } from '../Slider';
import { colors, radius, space } from '../theme';

export type CalibrationTool = 'drag' | 'sliders' | 'tap';

export interface CalibrationDraft {
  offsets: CalibrationOffsets;
  hFovOverrideDeg: number | null;
}

/** Calibration session state, owned by the screen that hosts the camera. */
export function useCalibrationSession() {
  const [active, setActive] = useState(false);
  const [draft, setDraft] = useState<CalibrationDraft>({
    offsets: { headingOffsetDeg: 0, pitchOffsetDeg: 0 },
    hFovOverrideDeg: null,
  });
  const [tool, setToolState] = useState<CalibrationTool>('drag');
  const [pickedPeakId, setPickedPeakId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const begin = useCallback(() => {
    const saved = useCalibrationStore.getState();
    setDraft({ offsets: saved.offsets, hFovOverrideDeg: saved.hFovOverrideDeg });
    setToolState('drag');
    setPickedPeakId(null);
    setMessage(null);
    setActive(true);
  }, []);
  const cancel = useCallback(() => setActive(false), []);
  const done = useCallback(() => {
    useCalibrationStore.getState().save(draft.offsets, draft.hFovOverrideDeg);
    setActive(false);
  }, [draft]);
  const resetDraft = useCallback(() => {
    setDraft({ offsets: { headingOffsetDeg: 0, pitchOffsetDeg: 0 }, hFovOverrideDeg: null });
    setPickedPeakId(null);
    setMessage(null);
  }, []);
  const setTool = useCallback((t: CalibrationTool) => {
    setToolState(t);
    setPickedPeakId(null);
    setMessage(null);
  }, []);
  const pickPeak = useCallback(
    (id: string) => {
      if (tool !== 'tap') return;
      setPickedPeakId(id);
      setMessage(null);
    },
    [tool],
  );

  return {
    active,
    draft,
    setDraft,
    tool,
    setTool,
    pickedPeakId,
    setPickedPeakId,
    message,
    setMessage,
    begin,
    cancel,
    done,
    resetDraft,
    pickPeak,
  };
}

export type CalibrationSession = ReturnType<typeof useCalibrationSession>;

const signed = (v: number) => `${v > 0.05 ? '+' : v < -0.05 ? '−' : ''}${Math.abs(v).toFixed(1)}°`;

export function Calibrator({
  session,
  scene,
  view,
  pose,
  autoHFovDeg,
  topInset,
}: {
  session: CalibrationSession;
  scene: PackScene;
  view: CameraView;
  pose: CameraPose | null;
  autoHFovDeg: number;
  /** Safe-area top. */
  topInset: number;
}) {
  const { draft, setDraft, tool, setTool, pickedPeakId, setPickedPeakId, message, setMessage } =
    session;
  const [advanced, setAdvanced] = useState(draft.hFovOverrideDeg !== null);
  const C = strings.calibration;

  // Drag: offsets follow the finger from where the drag started.
  const start = useRef<{
    x: number;
    y: number;
    pageX: number;
    pageY: number;
    offsets: CalibrationOffsets;
  } | null>(null);
  const onDragGrant = (e: GestureResponderEvent) => {
    const n = e.nativeEvent;
    start.current = {
      x: n.locationX,
      y: n.locationY,
      pageX: n.pageX,
      pageY: n.pageY,
      offsets: draft.offsets,
    };
  };
  const onDragMove = (e: GestureResponderEvent) => {
    const s = start.current;
    if (!s || !pose) return;
    const to = { x: s.x + e.nativeEvent.pageX - s.pageX, y: s.y + e.nativeEvent.pageY - s.pageY };
    const next = shiftOffsets(s.offsets, { x: s.x, y: s.y }, to, pose, view);
    setDraft((d) => ({ ...d, offsets: clampOffsets(next).offsets }));
  };

  // Tap a peak: step 2, the tap where the picked peak really is.
  const picked = pickedPeakId ? scene.peaks.find((r) => r.peak.id === pickedPeakId) : undefined;
  const onPlace = (e: GestureResponderEvent) => {
    if (!picked || !pose) return;
    const point = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
    const r = alignTargetToPoint(
      picked.azimuthDeg,
      picked.elevationAngleDeg,
      point,
      pose,
      view,
      draft.offsets,
    );
    setPickedPeakId(null);
    if (!r) {
      setMessage(C.tapBehind);
      return;
    }
    setDraft((d) => ({ ...d, offsets: r.offsets }));
    setMessage(r.clamped ? C.tooFar : C.tapDone(picked.peak.name));
  };

  const help =
    tool === 'drag'
      ? C.dragHelp
      : tool === 'tap'
        ? picked
          ? C.tapPlace(picked.peak.name)
          : C.tapPick
        : null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {tool === 'drag' && pose ? (
        <View
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={onDragGrant}
          onResponderMove={onDragMove}
          onResponderRelease={() => (start.current = null)}
          onResponderTerminationRequest={() => false}
        />
      ) : null}
      {tool === 'tap' && picked && pose ? (
        <View
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => true}
          onResponderRelease={onPlace}
        />
      ) : null}

      <View style={[styles.title, { top: topInset + space.sm }]} pointerEvents="none">
        <Text style={styles.titleText}>{C.heading}</Text>
        <Text style={styles.subText}>{C.subheading}</Text>
      </View>

      <View style={styles.panel}>
        <View style={styles.segment} accessibilityRole="tablist">
          {(
            [
              ['drag', C.toolDrag, 'hand-left-outline'],
              ['sliders', C.toolSliders, 'options-outline'],
              ['tap', C.toolTap, 'locate-outline'],
            ] as const
          ).map(([id, label, icon]) => {
            const on = tool === id;
            return (
              <Pressable
                key={id}
                onPress={() => setTool(id)}
                style={[styles.segBtn, on && styles.segBtnOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Ionicons name={icon} size={16} color={on ? colors.onAccent : colors.muted} />
                <Text style={[styles.segText, on && styles.segTextOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {tool === 'sliders' ? (
          <View>
            <Slider
              label={C.headingLabel}
              value={draft.offsets.headingOffsetDeg}
              min={-CALIBRATION_LIMITS.headingDeg}
              max={CALIBRATION_LIMITS.headingDeg}
              step={0.1}
              format={signed}
              onChange={(v) =>
                setDraft((d) => ({ ...d, offsets: { ...d.offsets, headingOffsetDeg: v } }))
              }
            />
            <Slider
              label={C.tiltLabel}
              value={draft.offsets.pitchOffsetDeg}
              min={-CALIBRATION_LIMITS.pitchDeg}
              max={CALIBRATION_LIMITS.pitchDeg}
              step={0.1}
              format={signed}
              onChange={(v) =>
                setDraft((d) => ({ ...d, offsets: { ...d.offsets, pitchOffsetDeg: v } }))
              }
            />
          </View>
        ) : (
          <View style={styles.helpRow}>
            <Text style={styles.help}>{help}</Text>
            {picked ? (
              <Pressable onPress={() => setPickedPeakId(null)} hitSlop={8}>
                <Ionicons name="close-circle" size={22} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
        )}

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <View style={styles.readoutRow}>
          {tool === 'sliders' ? (
            <View />
          ) : (
            <Text style={styles.readout}>
              {C.headingLabel} {signed(draft.offsets.headingOffsetDeg)} · {C.tiltLabel}{' '}
              {signed(draft.offsets.pitchOffsetDeg)}
            </Text>
          )}
          <Pressable
            onPress={() => setAdvanced((a) => !a)}
            hitSlop={8}
            style={styles.advBtn}
            accessibilityRole="button"
            accessibilityState={{ expanded: advanced }}
          >
            <Text style={styles.advText}>{C.advanced}</Text>
            <Ionicons
              name={advanced ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.muted}
            />
          </Pressable>
        </View>

        {advanced ? (
          <View>
            <Slider
              label={C.fovLabel}
              value={draft.hFovOverrideDeg ?? autoHFovDeg}
              min={FOV_OVERRIDE_RANGE.minDeg}
              max={FOV_OVERRIDE_RANGE.maxDeg}
              step={0.5}
              format={(v) => `${v.toFixed(1)}°`}
              onChange={(v) => setDraft((d) => ({ ...d, hFovOverrideDeg: v }))}
            />
            <View style={styles.readoutRow}>
              <Text style={styles.small}>{C.fovAuto(autoHFovDeg)}</Text>
              {draft.hFovOverrideDeg !== null ? (
                <Pressable
                  onPress={() => setDraft((d) => ({ ...d, hFovOverrideDeg: null }))}
                  hitSlop={8}
                >
                  <Text style={styles.link}>{C.fovUseLens}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    alignItems: 'center',
    backgroundColor: 'rgba(11,18,32,0.82)',
    borderRadius: radius.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  titleText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  subText: { color: colors.muted, fontSize: 13, marginTop: 2 },
  panel: {
    position: 'absolute',
    left: space.sm,
    right: space.sm,
    bottom: space.sm,
    backgroundColor: 'rgba(11,18,32,0.92)',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.md,
    gap: space.sm,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: 3,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 34,
    borderRadius: radius.pill,
  },
  segBtnOn: { backgroundColor: colors.accent },
  segText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  segTextOn: { color: colors.onAccent },
  helpRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 40 },
  help: { color: colors.text, fontSize: 15, lineHeight: 20, flex: 1 },
  message: { color: colors.accent, fontSize: 13, lineHeight: 18 },
  readoutRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  readout: { color: colors.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
  advBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  advText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  small: { color: colors.faint, fontSize: 12 },
  link: { color: colors.accent, fontSize: 13, fontWeight: '600' },
});
