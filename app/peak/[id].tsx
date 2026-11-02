import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenLayout } from '../../src/components/ScreenLayout';
import { colors, space } from '../../src/components/theme';
import { Pill, Stat, text } from '../../src/components/ui';
import { usePack } from '../../src/store/packStore';
import { useSceneStore } from '../../src/store/sceneStore';
import { strings } from '../../src/strings';

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Peak detail sheet (SPEC 3.5). */
export default function PeakSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const peak = usePack().peaks.find((p) => p.id === id);
  const result = useSceneStore((s) => s.scene?.peaks.find((r) => r.peak.id === id));
  const P = strings.peak;
  if (!peak) return <ScreenLayout title={P.notFound}>{null}</ScreenLayout>;

  return (
    <ScreenLayout title="">
      <Text style={styles.name}>{peak.name}</Text>
      {peak.nameNe ? <Text style={styles.nameNe}>{peak.nameNe}</Text> : null}
      {result ? (
        <View style={{ marginTop: space.md }}>
          <Pill
            icon={result.visible ? 'eye-outline' : 'eye-off-outline'}
            tone={result.visible ? 'good' : 'neutral'}
            label={result.visible ? P.visible : P.hidden(Math.round(result.occludedByM / 10) * 10)}
          />
        </View>
      ) : null}
      <View style={styles.stats}>
        <Stat label={P.height} value={`${peak.elevationM.toLocaleString('en-US')} m`} />
        {result ? (
          <Stat label={P.distance} value={`${(result.distanceM / 1000).toFixed(1)} km`} />
        ) : null}
        {result ? (
          <Stat
            label={P.direction}
            value={`${COMPASS[Math.round(result.azimuthDeg / 45) % 8]} ${Math.round(result.azimuthDeg)}°`}
          />
        ) : null}
      </View>
      {peak.description ? (
        <Text style={[text.body, { marginTop: space.lg }]}>{peak.description}</Text>
      ) : null}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  name: { color: colors.text, fontSize: 30, fontWeight: '800' },
  nameNe: { color: colors.muted, fontSize: 20, marginTop: 2 },
  stats: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
});
