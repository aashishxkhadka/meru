import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';

import { Row, Screen, screenStyles } from '../../src/components/Screen';
import { usePack } from '../../src/store/packStore';
import { useSceneStore } from '../../src/store/sceneStore';
import { strings } from '../../src/strings';

/** Peak detail sheet (SPEC 3.5). */
export default function PeakSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const peak = usePack().peaks.find((p) => p.id === id);
  const result = useSceneStore((s) => s.scene?.peaks.find((r) => r.peak.id === id));
  if (!peak) return <Screen title={strings.peak.notFound} />;
  const P = strings.peak;
  return (
    <Screen title={peak.name}>
      {peak.nameNe ? (
        <Text style={[screenStyles.text, { fontSize: 20 }]}>{peak.nameNe}</Text>
      ) : null}
      <Row label={P.elevation} value={`${peak.elevationM.toLocaleString('en-US')} m`} />
      {result && (
        <>
          <Row label={P.distance} value={`${(result.distanceM / 1000).toFixed(1)} km`} />
          <Row label={P.bearing} value={`${result.azimuthDeg.toFixed(0)}°`} />
          <Row
            label={P.visibleFromHere}
            value={result.visible ? P.yes : P.hiddenBy(Math.round(result.occludedByM / 10) * 10)}
          />
        </>
      )}
      {peak.description ? <Text style={screenStyles.text}>{peak.description}</Text> : null}
    </Screen>
  );
}
