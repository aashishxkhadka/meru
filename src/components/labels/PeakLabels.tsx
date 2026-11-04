/**
 * Peak label pills + leader lines + summit dots, shared by panorama and camera views.
 * Labels are React Native views (tappable, same fonts on web and native).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type LabelCandidate, type PlacedLabel, declutterLabels } from '../../core/declutter';
import { colors } from '../theme';

export const LABEL_ROW_HEIGHT = 34;

export interface LabelItem {
  id: string;
  name: string;
  rank: number;
  elevationM: number;
  distanceM: number;
  /** Summit position on screen. */
  x: number;
  y: number;
}

export const labelSubtitle = (elevationM: number, distanceM: number) =>
  `${elevationM.toLocaleString('en-US')} m · ${(distanceM / 1000).toFixed(distanceM < 10_000 ? 1 : 0)} km`;

/** Width of a label pill for placement (bold 12.5 pt names, 10.5 pt subtitle, padding). */
export const labelWidth = (name: string, sub: string, main: boolean) =>
  Math.ceil(Math.max(name.length * (main ? 8.1 : 7.3), sub.length * 6.1) + 16);

export function placeLabels(
  items: LabelItem[],
  screenWidthPx: number,
  rowCount: number,
): PlacedLabel[] {
  const candidates: LabelCandidate[] = items.map((it) => ({
    id: it.id,
    rank: it.rank,
    elevationM: it.elevationM,
    anchorX: it.x,
    widthPx: labelWidth(it.name, labelSubtitle(it.elevationM, it.distanceM), it.rank === 1),
    compactWidthPx: labelWidth(it.name, '', it.rank === 1),
  }));
  return declutterLabels(candidates, { screenWidthPx, maxShiftPx: 140, gapPx: 4, rowCount });
}

export function PeakLabels({
  items,
  placed,
  labelBottom,
  onPress,
  highlightId = null,
}: {
  items: LabelItem[];
  placed: PlacedLabel[];
  /** Bottom edge of label row 0. */
  labelBottom: number;
  onPress: (id: string) => void;
  /** Label drawn with an accent outline (e.g. the peak picked during calibration). */
  highlightId?: string | null;
}) {
  const byId = new Map(items.map((it) => [it.id, it]));
  return (
    <>
      {placed.map((p) => {
        const it = byId.get(p.id)!;
        const labelTop = labelBottom - (p.row + 1) * LABEL_ROW_HEIGHT;
        const lineTop = labelTop + LABEL_ROW_HEIGHT - 4;
        const lineX = Math.min(Math.max(p.anchorX, p.left + 6), p.right - 6);
        const sub = labelSubtitle(it.elevationM, it.distanceM);
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
                { left: p.anchorX, top: lineTop, width: 1, height: Math.max(0, it.y - lineTop) },
              ]}
            />
            <View style={[styles.dot, { left: p.anchorX - 3, top: it.y - 3 }]} />
            <Pressable
              onPress={() => onPress(p.id)}
              hitSlop={4}
              style={({ pressed }) => [
                styles.label,
                { left: p.left, top: labelTop, width: p.right - p.left },
                p.id === highlightId && styles.labelHighlight,
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${it.name}, ${sub}`}
            >
              <Text style={[styles.name, it.rank === 1 && styles.nameMain]} numberOfLines={1}>
                {it.name}
              </Text>
              {!p.compact && (
                <Text style={styles.sub} numberOfLines={1}>
                  {sub}
                </Text>
              )}
            </Pressable>
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  line: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.75)' },
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
  labelHighlight: { borderWidth: 2, borderColor: colors.accent },
  name: { color: colors.text, fontSize: 12, fontWeight: '600' },
  nameMain: { fontWeight: '800', fontSize: 12.5 },
  sub: { color: '#c3cfdf', fontSize: 10.5 },
});
