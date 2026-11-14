import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, icon, radius, space, touch } from '@/lib/theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Decorative by default (hidden from screen readers) — pass `label` when the icon carries meaning alone. */
export function Icon({ name, size = icon.md, color = colors.text, label }: { name: IconName; size?: number; color?: string; label?: string }) {
  return (
    <MaterialCommunityIcons
      name={name}
      size={size}
      color={color}
      accessible={!!label}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    />
  );
}

// ---------- Text ----------

type TProps = TextProps & { color?: string; center?: boolean };
const mk = (base: object, maxScale = 1.4) =>
  function T({ style, color, center, ...p }: TProps) {
    return <Text maxFontSizeMultiplier={maxScale} {...p} style={[base, color ? { color } : null, center ? { textAlign: 'center' } : null, style]} />;
  };

export const Display = mk({ fontFamily: fonts.display, fontSize: 44, lineHeight: 44, color: colors.text, textTransform: 'uppercase', letterSpacing: 0.5 }, 1.15);
export const Title = mk({ fontFamily: fonts.display, fontSize: 28, lineHeight: 30, color: colors.text, textTransform: 'uppercase', letterSpacing: 0.4 }, 1.2);
export const Heading = mk({ fontFamily: fonts.displaySemi, fontSize: 20, lineHeight: 24, color: colors.text, textTransform: 'uppercase', letterSpacing: 0.6 }, 1.3);
export const Body = mk({ fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.text });
export const BodyStrong = mk({ fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 24, color: colors.text });
export const Muted = mk({ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textMuted });
export const Label = mk({ fontFamily: fonts.bodySemi, fontSize: 12, lineHeight: 16, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.2 }, 1.3);
export const Money = mk({ fontFamily: fonts.display, fontSize: 40, lineHeight: 42, color: colors.primary, fontVariant: ['tabular-nums'] }, 1.15);

// ---------- Layout ----------

export function Screen({
  children,
  scroll = true,
  footer,
  refreshControl,
  padded = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
  refreshControl?: ComponentProps<typeof ScrollView>['refreshControl'];
  padded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const pad = padded ? { paddingHorizontal: space.lg } : null;
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[pad, { paddingBottom: space.xxl + (footer ? 0 : insets.bottom), gap: space.lg, paddingTop: space.sm }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, pad]}>{children}</View>
      )}
      {footer ? <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>{footer}</View> : null}
    </View>
  );
}

export function TopBar({ title, onBack, right }: { title?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <View style={styles.topBar}>
      {onBack ? <IconButton name="chevron-left" label="Go back" onPress={onBack} /> : <View style={{ width: touch }} />}
      <Heading numberOfLines={1} style={styles.flex} center>
        {title ?? ''}
      </Heading>
      {right ?? <View style={{ width: touch }} />}
    </View>
  );
}

export function Card({ children, style, tone }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'primary' | 'success' | 'danger' }) {
  const toneStyle =
    tone === 'primary'
      ? { borderColor: colors.primary }
      : tone === 'success'
        ? { borderColor: colors.success, backgroundColor: colors.successBg }
        : tone === 'danger'
          ? { borderColor: colors.danger, backgroundColor: colors.dangerBg }
          : null;
  return <View style={[styles.card, toneStyle, style]}>{children}</View>;
}

export const Row = ({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) => (
  <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>
);

// ---------- Controls ----------

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

export function Button({ title, onPress, variant = 'primary', icon: iconName, loading, disabled, small, style, accessibilityHint }: ButtonProps) {
  const off = disabled || loading;
  const fg = variant === 'primary' ? colors.onPrimary : variant === 'danger' ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={() => {
        if (variant === 'primary') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        pressed && (variant === 'primary' ? styles.buttonPrimaryPressed : styles.pressed),
        off && styles.disabled,
        style,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : iconName ? <Icon name={iconName} color={fg} size={small ? icon.sm + 2 : icon.md} /> : null}
      <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={[styles.buttonText, small && { fontSize: 16 }, { color: fg }]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function IconButton({ name, label, onPress, color = colors.text, active, disabled }: { name: IconName; label: string; onPress: () => void; color?: string; active?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.iconButton, active && { backgroundColor: colors.surfaceHi, borderColor: color }, pressed && styles.pressed, disabled && styles.disabled]}>
      <Icon name={name} color={color} />
    </Pressable>
  );
}

export function Chip({ text, icon: iconName, tone = 'neutral' }: { text: string; icon?: IconName; tone?: 'neutral' | 'primary' | 'success' | 'danger' | 'warn' }) {
  const fg = tone === 'primary' ? colors.primary : tone === 'success' ? colors.success : tone === 'danger' ? colors.danger : tone === 'warn' ? colors.warn : colors.textMuted;
  return (
    <View style={[styles.chip, { borderColor: tone === 'neutral' ? colors.border : fg }]}>
      {iconName ? <Icon name={iconName} size={14} color={fg} /> : null}
      <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.chipText, { color: fg }]}>
        {text}
      </Text>
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            onPress={() => {
              void Haptics.selectionAsync().catch(() => {});
              onChange(o.value);
            }}
            style={({ pressed }) => [styles.segment, on && styles.segmentOn, pressed && !on && styles.pressed]}>
            <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={[styles.segmentText, on && { color: colors.onPrimary }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A big selectable tile (radio behaviour). */
export function Choice({ title, subtitle, icon: iconName, selected, onPress, disabled, right }: { title: string; subtitle?: string; icon?: IconName; selected: boolean; onPress: () => void; disabled?: boolean; right?: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !!disabled }}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      disabled={disabled}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [styles.choice, selected && styles.choiceOn, pressed && styles.pressed, disabled && styles.disabled]}>
      {iconName ? (
        <View style={[styles.choiceIcon, selected && { backgroundColor: colors.primary }]}>
          <Icon name={iconName} color={selected ? colors.onPrimary : colors.primary} size={icon.lg} />
        </View>
      ) : null}
      <View style={styles.flex}>
        <Heading>{title}</Heading>
        {subtitle ? <Muted>{subtitle}</Muted> : null}
      </View>
      {right ?? <Icon name={selected ? 'radiobox-marked' : 'radiobox-blank'} color={selected ? colors.primary : colors.textMuted} />}
    </Pressable>
  );
}

export function Field({ label, hint, error, ...input }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  return (
    <View style={{ gap: space.xs + 2 }}>
      <Label>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor="#8A90A0"
        selectionColor={colors.primary}
        {...input}
        style={[styles.input, error ? { borderColor: colors.danger } : null, input.multiline ? { minHeight: 96, textAlignVertical: 'top', paddingTop: space.md } : null, input.style]}
      />
      {error ? (
        <Row gap={space.xs + 2}>
          <Icon name="alert-circle" size={icon.sm} color={colors.danger} />
          <Muted color={colors.danger} style={styles.flex} accessibilityLiveRegion="polite">
            {error}
          </Muted>
        </Row>
      ) : hint ? (
        <Muted>{hint}</Muted>
      ) : null}
    </View>
  );
}

export function Banner({ text, tone = 'danger', icon: iconName }: { text: string; tone?: 'danger' | 'success' | 'info'; icon?: IconName }) {
  const fg = tone === 'danger' ? colors.danger : tone === 'success' ? colors.success : colors.primary;
  const bg = tone === 'danger' ? colors.dangerBg : tone === 'success' ? colors.successBg : colors.surfaceHi;
  return (
    <View style={[styles.banner, { backgroundColor: bg, borderColor: fg }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Icon name={iconName ?? (tone === 'danger' ? 'alert-circle' : tone === 'success' ? 'check-circle' : 'information')} color={fg} />
      <Body style={styles.flex}>{text}</Body>
    </View>
  );
}

export function ProgressBar({ value, tone = 'primary' }: { value: number; tone?: 'primary' | 'success' }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: tone === 'success' ? colors.success : colors.primary }]} />
    </View>
  );
}

export function DevnetTag({ mock }: { mock?: boolean }) {
  return <Chip icon="flask-outline" text={mock ? 'Simulated chain · test only' : 'Devnet · test money only'} tone="warn" />;
}

export const Loading = ({ label = 'Loading' }: { label?: string }) => (
  <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={label}>
    <ActivityIndicator color={colors.primary} size="large" />
  </View>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', minHeight: touch + space.sm, gap: space.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, padding: space.lg, gap: space.md },
  button: { minHeight: 56, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.xl },
  buttonSmall: { minHeight: touch, paddingHorizontal: space.lg, borderRadius: radius.sm + 4 },
  buttonPrimary: { backgroundColor: colors.primary, borderBottomWidth: 5, borderBottomColor: colors.primaryDeep },
  buttonPrimaryPressed: { borderBottomWidth: 5, borderBottomColor: colors.primary, backgroundColor: colors.primaryDeep },
  buttonSecondary: { backgroundColor: colors.surfaceHi, borderWidth: 1.5, borderColor: colors.border },
  buttonDanger: { backgroundColor: colors.dangerBg, borderWidth: 1.5, borderColor: colors.danger },
  buttonText: { fontFamily: fonts.display, fontSize: 20, letterSpacing: 0.8, textTransform: 'uppercase' },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
  iconButton: { width: touch, height: touch, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 1, paddingHorizontal: space.sm + 2, paddingVertical: space.xs + 1, borderRadius: radius.pill, borderWidth: 1.5, alignSelf: 'flex-start' },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' },
  segmented: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: space.xs, borderWidth: 1.5, borderColor: colors.border },
  segment: { flex: 1, minHeight: touch - 4, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm + 2, paddingHorizontal: space.sm },
  segmentOn: { backgroundColor: colors.primary },
  segmentText: { fontFamily: fonts.display, fontSize: 17, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textMuted },
  choice: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, minHeight: 76, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  choiceOn: { borderColor: colors.primary, backgroundColor: colors.surfaceHi },
  choiceIcon: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHi },
  input: { minHeight: 56, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: space.lg, color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 18 },
  banner: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', padding: space.md, borderRadius: radius.md, borderWidth: 1.5 },
  track: { height: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceHi, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxxl },
});
