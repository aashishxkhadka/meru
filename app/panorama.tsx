import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { circularMeanDeg } from '../src/core/angles';
import { Panorama } from '../src/components/panorama/Panorama';
import { colors } from '../src/components/theme';
import { useOrientationStore } from '../src/store/orientationStore';
import { useSceneStore } from '../src/store/sceneStore';
import { strings } from '../src/strings';

/** Panorama mode (SPEC 3.4): 360° drawn horizon, drag to rotate, follows the compass. */
export default function PanoramaScreen() {
  const { scene, label } = useSceneStore();
  const { width, height } = useWindowDimensions();
  const { supported, headingDeg, start, stop } = useOrientationStore();
  const [follow, setFollow] = useState(supported);
  const [manualDeg, setManualDeg] = useState<number | null>(null);

  useEffect(() => {
    if (!supported) return;
    start();
    return stop;
  }, [supported, start, stop]);

  const P = strings.panorama;
  if (!scene) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header title={P.title} />
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{P.noScene}</Text>
          <Pressable style={styles.button} onPress={() => router.push('/viewpoints')}>
            <Text style={styles.buttonText}>{strings.location.pickViewpoint}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const mainPeaks = scene.peaks
    .filter((r) => r.visible && r.peak.rank === 1)
    .map((r) => r.azimuthDeg);
  const defaultDeg = mainPeaks.length ? circularMeanDeg(mainPeaks) : 0;
  const following = follow && headingDeg !== null;
  const centerDeg = following ? headingDeg : (manualDeg ?? defaultDeg);
  const panoHeight = Math.min(height * 0.62, 460);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Header title={P.title} subtitle={label ?? undefined} />
      <Panorama
        scene={scene}
        width={width}
        height={panoHeight}
        centerDeg={centerDeg}
        onDrag={(deg) => {
          setFollow(false);
          setManualDeg(deg);
        }}
        onPeakPress={(id) => router.push({ pathname: '/peak/[id]', params: { id } })}
      />
      <View style={styles.footer}>
        <Text style={styles.heading}>
          {Math.round(centerDeg)}° {following ? P.followingCompass : P.dragHint}
        </Text>
        {supported && !following && (
          <Pressable style={styles.button} onPress={() => setFollow(true)}>
            <Text style={styles.buttonText}>{P.followCompass}</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={12}>
        <Text style={styles.back}>‹ {strings.back}</Text>
      </Pressable>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingVertical: 10, gap: 2 },
  back: { color: colors.accent, fontSize: 16 },
  title: { color: colors.text, fontSize: 24, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 14 },
  footer: { padding: 16, gap: 12 },
  heading: { color: colors.muted, fontSize: 14 },
  empty: { padding: 16, gap: 16 },
  emptyText: { color: colors.text, fontSize: 16, lineHeight: 22 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#1a1205', fontSize: 15, fontWeight: '700' },
});
