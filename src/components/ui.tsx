/** Small shared UI kit so every screen looks the same. */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { strings } from '../strings';
import { colors, radius, space } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Header({
  title,
  back = true,
  right,
  onLongPressTitle,
}: {
  title: string;
  back?: boolean;
  right?: ReactNode;
  onLongPressTitle?: () => void;
}) {
  return (
    <View style={styles.header}>
      {back ? (
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={12}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={strings.back}
        >
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
      ) : null}
      <Pressable
        onLongPress={onLongPressTitle}
        delayLongPress={600}
        disabled={!onLongPressTitle}
        style={{ flex: 1 }}
      >
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
      </Pressable>
      {right}
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.section}>{children.toUpperCase()}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ListRow({
  icon,
  title,
  subtitle,
  selected,
  chevron,
  onPress,
  last,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  selected?: boolean;
  chevron?: boolean;
  onPress?: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && styles.pressed]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={selected !== undefined ? { selected } : undefined}
    >
      {icon ? (
        <View style={[styles.rowIcon, selected && styles.rowIconSelected]}>
          <Ionicons name={icon} size={18} color={selected ? colors.onAccent : colors.muted} />
        </View>
      ) : null}
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {selected ? <Ionicons name="checkmark" size={22} color={colors.accent} /> : null}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={colors.faint} /> : null}
    </Pressable>
  );
}

export function Button({
  label,
  icon,
  onPress,
  variant = 'primary',
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
    >
      {icon ? (
        <Ionicons name={icon} size={18} color={primary ? colors.onAccent : colors.text} />
      ) : null}
      <Text style={[styles.buttonText, { color: primary ? colors.onAccent : colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  busy,
  children,
}: {
  icon: IconName;
  title: string;
  text?: string;
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        {busy ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Ionicons name={icon} size={30} color={colors.accent} />
        )}
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {text ? <Text style={styles.emptyText}>{text}</Text> : null}
      {children ? <View style={styles.emptyActions}>{children}</View> : null}
    </View>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function Pill({
  icon,
  label,
  tone = 'neutral',
}: {
  icon?: IconName;
  label: string;
  tone?: 'good' | 'neutral';
}) {
  const color = tone === 'good' ? colors.success : colors.muted;
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      {icon ? <Ionicons name={icon} size={14} color={color} /> : null}
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export const text = StyleSheet.create({
  body: { color: colors.text, fontSize: 16, lineHeight: 23 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  small: { color: colors.faint, fontSize: 12, lineHeight: 17 },
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    height: 52,
    gap: space.xs,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -4,
  },
  headerTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  section: {
    color: colors.faint,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: space.xl,
    marginBottom: space.sm,
    marginLeft: space.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.md,
    minHeight: 56,
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pressed: { opacity: 0.6 },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconSelected: { backgroundColor: colors.accent },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  rowSubtitle: { color: colors.muted, fontSize: 13 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: space.lg,
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonSecondary: {
    backgroundColor: colors.surfaceHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  empty: { alignItems: 'center', paddingHorizontal: space.xl, gap: space.sm },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  emptyActions: { alignSelf: 'stretch', gap: space.sm, marginTop: space.lg },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    gap: 2,
  },
  statValue: { color: colors.text, fontSize: 18, fontWeight: '700' },
  statLabel: { color: colors.muted, fontSize: 12 },
  pill: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: { fontSize: 13, fontWeight: '600' },
});

/** Label/value line inside a Card (About, Diagnostics). */
export function KeyValue({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[kvStyles.row, !last && kvStyles.divider]}>
      <Text style={kvStyles.label}>{label}</Text>
      <Text style={kvStyles.value} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const kvStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  label: { color: colors.muted, fontSize: 15 },
  value: { color: colors.text, fontSize: 15, fontWeight: '500', flexShrink: 1, textAlign: 'right' },
});
