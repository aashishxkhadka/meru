import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Text } from 'react-native';

import { Row, Screen, screenStyles } from '../src/components/Screen';
import { usePack } from '../src/store/packStore';
import { strings } from '../src/strings';

/** About (SPEC 3.8): version, data attribution (required by the data licences), feedback. */
export default function AboutScreen() {
  const { manifest } = usePack();
  return (
    <Screen title={strings.appName} onLongPressTitle={() => router.push('/debug')}>
      <Text style={screenStyles.muted}>{strings.tagline}</Text>
      <Row label={strings.about.version} value={Constants.expoConfig?.version ?? '?'} />
      <Row label={strings.debug.pack} value={`${manifest.name} v${manifest.version}`} />
      <Text style={screenStyles.section}>{strings.about.dataSources}</Text>
      {manifest.attribution.map((line) => (
        <Text key={line} style={screenStyles.muted}>
          {line}
        </Text>
      ))}
      <Text style={screenStyles.section}>{strings.about.feedback}</Text>
      <Text style={screenStyles.muted}>{strings.about.feedbackText}</Text>
      <Text style={[screenStyles.muted, { marginTop: 24, opacity: 0.5 }]}>
        {strings.about.debugHint}
      </Text>
    </Screen>
  );
}
