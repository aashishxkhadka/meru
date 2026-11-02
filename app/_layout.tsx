import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../src/components/theme';
import { usePackStore } from '../src/store/packStore';
import { useSceneSync } from '../src/store/useSceneSync';
import { strings } from '../src/strings';

// Keep the native splash up until the data pack is in memory.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const status = usePackStore((s) => s.state.status);
  const error = usePackStore((s) => s.state.error);
  const load = usePackStore((s) => s.load);
  const retry = usePackStore((s) => s.retry);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (status === 'ready' || status === 'error') SplashScreen.hideAsync().catch(() => {});
  }, [status]);

  if (status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>{strings.packErrorTitle}</Text>
        <Text style={styles.error}>{error}</Text>
        <Pressable onPress={retry}>
          <Text style={styles.retry}>{strings.retry}</Text>
        </Pressable>
      </View>
    );
  }
  if (status !== 'ready') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loading}>{strings.loadingPack}</Text>
      </View>
    );
  }

  return (
    <>
      <SceneSync />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen
          name="peak/[id]"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.5, 1],
            sheetGrabberVisible: true,
          }}
        />
        <Stack.Screen name="viewpoints" options={{ presentation: 'modal' }} />
        <Stack.Screen name="photo-preview" options={{ presentation: 'modal' }} />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    padding: 24,
    gap: 12,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  error: { color: colors.danger, fontSize: 13, fontFamily: 'monospace' },
  retry: { color: colors.accent, fontSize: 16, fontWeight: '600', padding: 12 },
  loading: { color: colors.muted, fontSize: 15 },
});

/** Mounted only once the pack is ready (usePack() requires it). */
function SceneSync() {
  useSceneSync();
  return null;
}
