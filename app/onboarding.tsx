import { router } from 'expo-router';
import { Text } from 'react-native';

import { NavButton, Placeholder, Screen, screenStyles } from '../src/components/Screen';
import { strings } from '../src/strings';

/** Onboarding (SPEC 3.1): 3 slides + permissions, first launch only. Built in step 11. */
export default function OnboardingScreen() {
  return (
    <Screen title={strings.onboarding.title}>
      <Placeholder step={11} />
      {strings.onboarding.slides.map((s, i) => (
        <Text key={i} style={screenStyles.text}>
          {i + 1}. {s}
        </Text>
      ))}
      <NavButton label={strings.onboarding.start} onPress={() => router.replace('/')} />
    </Screen>
  );
}
