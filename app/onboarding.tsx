import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, space } from '../src/components/theme';
import { Button, type IconName } from '../src/components/ui';
import { strings } from '../src/strings';

/** Onboarding (SPEC 3.1). First-launch logic + permission requests come in step 11. */
export default function OnboardingScreen() {
  const O = strings.onboarding;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <Text style={styles.title}>{O.title}</Text>
        <Text style={styles.subtitle}>{O.subtitle}</Text>
      </View>
      <View style={styles.features}>
        {O.features.map((f) => (
          <View key={f.title} style={styles.feature}>
            <View style={styles.icon}>
              <Ionicons name={f.icon as IconName} size={24} color={colors.accent} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={styles.bottom}>
        <Button label={O.start} onPress={() => router.replace('/')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.xl },
  top: { marginTop: 72, gap: space.sm },
  title: { color: colors.text, fontSize: 34, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 17 },
  features: { marginTop: 48, gap: space.xl },
  feature: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  featureText: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  bottom: { marginTop: 'auto', marginBottom: space.lg },
});
