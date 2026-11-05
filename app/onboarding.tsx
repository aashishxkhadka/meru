import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, space } from '../src/components/theme';
import { Button, type IconName } from '../src/components/ui';
import { useCameraPermission } from '../src/sensors/cameraPermission';
import { logEvent } from '../src/store/eventLogStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { strings } from '../src/strings';

/**
 * Onboarding (SPEC 3.1): three short slides, then location + camera permission requests.
 * Shown on first launch only (SettingsStore); "Skip" leaves the permission prompts for later
 * (the camera and GPS screens ask again when needed).
 */
export default function OnboardingScreen() {
  const O = strings.onboarding;
  const { width } = useWindowDimensions();
  const scroller = useRef<ScrollViewInstance>(null);
  const [page, setPage] = useState(0);
  const [asking, setAsking] = useState(false);
  const camera = useCameraPermission();
  const completeOnboarding = useSettingsStore((s) => s.completeOnboarding);
  const last = page === O.slides.length - 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)));
  const goTo = (i: number) => {
    scroller.current?.scrollTo({ x: i * width, animated: true });
    setPage(i);
  };

  const finish = async (permissions: { location: string; camera: string }) => {
    logEvent('onboarding_done', permissions);
    await completeOnboarding();
    router.replace('/');
  };

  const allowAndStart = async () => {
    if (asking) return;
    setAsking(true);
    let location = 'error';
    let cam = 'skipped';
    try {
      location = (await Location.requestForegroundPermissionsAsync()).status;
    } catch {
      // GPS screen asks again later
    }
    if (Platform.OS !== 'web') {
      try {
        cam = (await camera.requestPermission()) ? 'granted' : 'denied';
      } catch {
        cam = 'error';
      }
    }
    setAsking(false);
    await finish({ location, camera: cam });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topRow}>
        <Text style={styles.brand}>{strings.appName}</Text>
        {!last ? (
          <Pressable
            onPress={() => finish({ location: 'skipped', camera: 'skipped' })}
            hitSlop={12}
            accessibilityRole="button"
          >
            <Text style={styles.skip}>{O.skip}</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        onScroll={Platform.OS === 'web' ? onScroll : undefined}
        scrollEventThrottle={64}
        style={{ flex: 1 }}
      >
        {O.slides.map((s) => (
          <View key={s.title} style={[styles.slide, { width }]}>
            <View style={styles.iconCircle}>
              <Ionicons name={s.icon as IconName} size={56} color={colors.accent} />
            </View>
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.text}>{s.text}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {O.slides.map((s, i) => (
          <View key={s.title} style={[styles.dot, i === page && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.bottom}>
        {last ? (
          <>
            <Text style={styles.permText}>{O.permissionsText}</Text>
            <Button
              label={asking ? O.asking : O.allow}
              icon="checkmark-circle"
              onPress={allowAndStart}
            />
          </>
        ) : (
          <Button label={O.next} icon="arrow-forward" onPress={() => goTo(page + 1)} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    height: 48,
  },
  brand: { color: colors.accent, fontSize: 18, fontWeight: '800', letterSpacing: 3 },
  skip: { color: colors.muted, fontSize: 16, fontWeight: '600' },
  slide: {
    flex: 1,
    paddingHorizontal: space.xl * 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', textAlign: 'center' },
  text: { color: colors.muted, fontSize: 17, lineHeight: 24, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: space.sm, marginBottom: space.lg },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.border },
  dotActive: { width: 24, backgroundColor: colors.accent },
  bottom: { paddingHorizontal: space.xl, paddingBottom: space.lg, gap: space.md, minHeight: 120 },
  permText: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
