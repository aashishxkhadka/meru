import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenLayout } from '../src/components/ScreenLayout';
import { colors, space } from '../src/components/theme';
import { Card, KeyValue, SectionTitle, text } from '../src/components/ui';
import { usePack } from '../src/store/packStore';
import { strings } from '../src/strings';

/** About (SPEC 3.8): version, data attribution (required by the data licences), feedback. */
export default function AboutScreen() {
  const { manifest } = usePack();
  const A = strings.about;
  return (
    <ScreenLayout title={A.title}>
      <Pressable onLongPress={() => router.push('/debug')} delayLongPress={600} style={styles.hero}>
        <Text style={styles.appName}>{strings.appName}</Text>
        <Text style={text.muted}>{strings.tagline}</Text>
      </Pressable>

      <Card>
        <KeyValue label={A.version} value={Constants.expoConfig?.version ?? '?'} />
        <KeyValue label={A.dataPack} value={`${manifest.name} · v${manifest.version}`} last />
      </Card>

      <SectionTitle>{A.dataSources}</SectionTitle>
      <Card style={styles.padded}>
        {manifest.attribution.map((line, i) => (
          <Text key={line} style={[text.small, i > 0 && { marginTop: space.sm }]}>
            {line}
          </Text>
        ))}
      </Card>

      <SectionTitle>{A.feedback}</SectionTitle>
      <Card style={styles.padded}>
        <Text style={text.muted}>{A.feedbackText}</Text>
      </Card>

      <View style={{ marginTop: space.xl }}>
        <Text style={[text.small, { textAlign: 'center' }]}>{A.debugHint}</Text>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: space.xl, gap: space.xs },
  appName: { color: colors.text, fontSize: 40, fontWeight: '800', letterSpacing: 1 },
  padded: { padding: space.lg },
});
