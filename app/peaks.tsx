import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { circularMeanDeg, wrapTo180 } from '../src/core/angles';
import { ScreenLayout } from '../src/components/ScreenLayout';
import { Card, EmptyState, ListRow, SectionTitle, text } from '../src/components/ui';
import { useSceneStore } from '../src/store/sceneStore';
import { strings } from '../src/strings';

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const describe = (elevationM: number, distanceM: number, azimuthDeg: number) =>
  `${elevationM.toLocaleString('en-US')} m · ${(distanceM / 1000).toFixed(0)} km · ${COMPASS[Math.round(azimuthDeg / 45) % 8]} ${Math.round(azimuthDeg)}°`;

/** Visible peaks, left to right as you face the main peaks. */
export default function PeaksScreen() {
  const { scene, label } = useSceneStore();
  const P = strings.peaks;
  if (!scene) {
    return (
      <ScreenLayout title={P.title} scroll={false}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState icon="list" title={P.title} text={P.none} />
        </View>
      </ScreenLayout>
    );
  }
  const visible = scene.peaks.filter((r) => r.visible);
  const center = circularMeanDeg(visible.filter((r) => r.peak.rank === 1).map((r) => r.azimuthDeg));
  const byDirection = [...visible].sort(
    (a, b) => wrapTo180(a.azimuthDeg - center) - wrapTo180(b.azimuthDeg - center),
  );
  const groups = [
    { title: P.main, items: byDirection.filter((r) => r.peak.rank === 1) },
    { title: P.other, items: byDirection.filter((r) => r.peak.rank !== 1) },
  ].filter((g) => g.items.length > 0);

  return (
    <ScreenLayout title={P.title}>
      {label ? <Text style={[text.muted, { marginTop: 4 }]}>{P.from(label)}</Text> : null}
      {groups.map((g) => (
        <View key={g.title}>
          <SectionTitle>{`${g.title} (${g.items.length})`}</SectionTitle>
          <Card>
            {g.items.map((r, i) => (
              <ListRow
                key={r.peak.id}
                icon={r.peak.rank === 1 ? 'triangle' : 'triangle-outline'}
                title={r.peak.name}
                subtitle={describe(r.peak.elevationM, r.distanceM, r.azimuthDeg)}
                chevron
                last={i === g.items.length - 1}
                onPress={() => router.push({ pathname: '/peak/[id]', params: { id: r.peak.id } })}
              />
            ))}
          </Card>
        </View>
      ))}
      <Text style={[text.small, { marginTop: 16 }]}>
        {P.hidden(scene.peaks.length - visible.length)}
      </Text>
    </ScreenLayout>
  );
}
