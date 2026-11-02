import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, space } from './theme';
import { Header } from './ui';

/** Standard screen: header + scrollable content, safe-area aware. */
export function ScreenLayout({
  title,
  back = true,
  scroll = true,
  onLongPressTitle,
  children,
}: {
  title: string;
  back?: boolean;
  scroll?: boolean;
  onLongPressTitle?: () => void;
  children: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Header title={title} back={back} onLongPressTitle={onLongPressTitle} />
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xl },
});
