import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocationStore } from '../store/locationStore';
import { useSceneStore } from '../store/sceneStore';
import { strings } from '../strings';
import { colors } from './theme';

/** Top-bar location status: searching / ±accuracy / simulated viewpoint (SPEC 3.2). */
export function LocationStatus() {
  const { source, gpsStatus, fix, viewpoint, searchStartedAt } = useLocationStore();
  const sceneStatus = useSceneStore((s) => s.status);
  // Clock for the "searching 42s" counter, updated once a second while searching.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    if (gpsStatus !== 'searching') return;
    const update = () => setNowMs(Date.now());
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [gpsStatus]);

  const pick = () => router.push('/viewpoints');
  const L = strings.location;
  let line: string;
  let hint: string | null = null;
  let offerPicker = false;
  if (source === 'simulated' && viewpoint) {
    line = L.simulated(viewpoint.name);
  } else if (gpsStatus === 'fixed' && fix) {
    line = L.fixed(Math.round(fix.accuracyM ?? 0));
  } else if (gpsStatus === 'denied') {
    line = L.denied;
    offerPicker = true;
  } else if (gpsStatus === 'services-off') {
    line = L.servicesOff;
    offerPicker = true;
  } else if (gpsStatus === 'error') {
    line = L.error;
    offerPicker = true;
  } else if (gpsStatus === 'requesting') {
    line = L.requesting;
  } else {
    const secs = searchStartedAt && nowMs ? Math.round((nowMs - searchStartedAt) / 1000) : 0;
    line = `${L.searching}${secs > 0 ? ` ${secs}s` : ''}${fix?.accuracyM ? ` (±${Math.round(fix.accuracyM)} m)` : ''}`;
    hint = L.searchingHint;
    offerPicker = true;
  }
  if (sceneStatus === 'outside') {
    hint = L.outside;
    offerPicker = true;
  }

  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <Text style={styles.line} numberOfLines={2}>
          {line}
        </Text>
        {!offerPicker && (
          <Pressable onPress={pick} hitSlop={10}>
            <Text style={styles.link}>{L.change}</Text>
          </Pressable>
        )}
      </View>
      {hint && <Text style={styles.hint}>{hint}</Text>}
      {offerPicker && (
        <Pressable onPress={pick} style={styles.button}>
          <Text style={styles.buttonText}>{L.pickViewpoint}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  line: { color: colors.text, fontSize: 16, fontWeight: '600', flexShrink: 1 },
  link: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  hint: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonText: { color: '#1a1205', fontSize: 15, fontWeight: '700' },
});
