import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';

import { Placeholder, Row, Screen, screenStyles } from '../../src/components/Screen';
import { usePack } from '../../src/store/packStore';
import { strings } from '../../src/strings';

/** Peak detail sheet (SPEC 3.5). Distance/bearing/visibility come with step 6. */
export default function PeakSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const peak = usePack().peaks.find((p) => p.id === id);
  if (!peak) {
    return <Screen title={strings.peak.notFound} />;
  }
  return (
    <Screen title={peak.name}>
      {peak.nameNe ? (
        <Text style={[screenStyles.text, { fontSize: 20 }]}>{peak.nameNe}</Text>
      ) : null}
      <Row label={strings.peak.elevation} value={`${peak.elevationM.toLocaleString('en-US')} m`} />
      {peak.description ? <Text style={screenStyles.text}>{peak.description}</Text> : null}
      <Placeholder step={6} />
    </Screen>
  );
}
