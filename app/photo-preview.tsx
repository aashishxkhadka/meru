import { File } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Alert, Image, Linking, StyleSheet, View, useWindowDimensions } from 'react-native';

import { ScreenLayout } from '../src/components/ScreenLayout';
import { space } from '../src/components/theme';
import { Button, EmptyState } from '../src/components/ui';
import { strings } from '../src/strings';

/** Photo preview (SPEC 3.7): the composited photo, Save to gallery and Share. */
export default function PhotoPreviewScreen() {
  const params = useLocalSearchParams<{ uri?: string; w?: string; h?: string }>();
  const { width, height } = useWindowDimensions();
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const uri = typeof params.uri === 'string' ? params.uri : null;
  const exists = uri !== null && new File(uri).exists;
  const aspect = Number(params.w) / Number(params.h);

  // The photo lives in the cache folder; tidy it up when leaving without saving or sharing.
  useEffect(() => {
    if (!uri) return;
    return () => {
      try {
        new File(uri).delete();
      } catch {
        // already gone
      }
    };
  }, [uri]);

  if (!uri || !exists) {
    return (
      <ScreenLayout title={strings.photo.title} scroll={false}>
        <View style={styles.center}>
          <EmptyState icon="image-outline" title={strings.photo.missing} />
        </View>
      </ScreenLayout>
    );
  }

  const save = async () => {
    if (saveState !== 'idle') return;
    setSaveState('saving');
    try {
      const perm = await requestPermissionsAsync(true, ['photo']);
      if (!perm.granted) {
        setSaveState('idle');
        Alert.alert(strings.photo.saveDeniedTitle, strings.photo.saveDeniedText, [
          { text: strings.close, style: 'cancel' },
          { text: strings.openSettings, onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      await Asset.create(uri);
      setSaveState('saved');
    } catch (e) {
      setSaveState('idle');
      Alert.alert(strings.photo.saveFailed, e instanceof Error ? e.message : String(e));
    }
  };

  const share = async () => {
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert(strings.photo.shareUnavailable);
      return;
    }
    await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg' });
  };

  // Fit the whole photo (incl. frame) above the buttons.
  const maxH = height * 0.68;
  const imgW = Number.isFinite(aspect) ? Math.min(width - space.lg * 2, maxH * aspect) : width;
  const imgH = Number.isFinite(aspect) ? imgW / aspect : maxH;

  return (
    <ScreenLayout title={strings.photo.title} scroll={false}>
      <View style={styles.center}>
        <Image source={{ uri }} style={{ width: imgW, height: imgH, borderRadius: 6 }} />
      </View>
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button
            label={
              saveState === 'saved'
                ? strings.photo.saved
                : saveState === 'saving'
                  ? strings.photo.saving
                  : strings.photo.save
            }
            icon={saveState === 'saved' ? 'checkmark-circle' : 'download-outline'}
            onPress={save}
          />
        </View>
        <View style={styles.action}>
          <Button label={strings.photo.share} icon="share-outline" onPress={share} />
        </View>
      </View>
      <Button
        label={strings.photo.retake}
        icon="camera-outline"
        variant="secondary"
        onPress={() => router.back()}
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: space.md, marginBottom: space.md },
  action: { flex: 1 },
});
