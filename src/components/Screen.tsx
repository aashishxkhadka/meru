import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { strings } from '../strings';
import { colors } from './theme';

interface Props {
  title: string;
  children?: ReactNode;
  /** Show a back button (default true). */
  back?: boolean;
  onLongPressTitle?: () => void;
}

/** Simple full-screen layout for placeholder screens. */
export function Screen({ title, children, back = true, onLongPressTitle }: Props) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        {back && (
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
            <Text style={styles.back}>‹ {strings.back}</Text>
          </Pressable>
        )}
        <Pressable onLongPress={onLongPressTitle} delayLongPress={600} disabled={!onLongPressTitle}>
          <Text style={styles.title}>{title}</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
    </SafeAreaView>
  );
}

export function Placeholder({ step }: { step: number }) {
  return <Text style={styles.placeholder}>{strings.comingSoon(step)}</Text>;
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export function NavButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      accessibilityRole="button"
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export const screenStyles = StyleSheet.create({
  text: { color: colors.text, fontSize: 16, lineHeight: 22 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  section: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 6,
  },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingVertical: 12, gap: 6 },
  back: { color: colors.accent, fontSize: 16 },
  title: { color: colors.text, fontSize: 28, fontWeight: '700' },
  body: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  placeholder: { color: colors.muted, fontStyle: 'italic', marginBottom: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 12,
  },
  rowLabel: { color: colors.muted, fontSize: 15 },
  rowValue: { color: colors.text, fontSize: 15, flexShrink: 1, textAlign: 'right' },
  button: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  buttonPressed: { opacity: 0.7 },
  buttonText: { color: colors.text, fontSize: 16, fontWeight: '600' },
});
