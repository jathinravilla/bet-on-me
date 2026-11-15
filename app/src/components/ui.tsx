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

import { TAB_BAR_HEIGHT, colors, fonts, icon, radius, space } from '@/lib/theme';

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

const tnum = { fontVariant: ['tabular-nums'] as ('tabular-nums')[] };
export const Display = mk({ fontFamily: fonts.display, fontSize: 32, lineHeight: 38, color: colors.text, letterSpacing: -0.8 }, 1.2);
export const Title = mk({ fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.text, letterSpacing: -0.5 }, 1.25);
export const Heading = mk({ fontFamily: fonts.displaySemi, fontSize: 16, lineHeight: 22, color: colors.text, letterSpacing: -0.2 }, 1.3);
export const Body = mk({ fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text });
export const BodyStrong = mk({ fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 22, color: colors.text });
export const Muted = mk({ fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textMuted });
export const Label = mk({ fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16, color: colors.textMuted, letterSpacing: 0.1 }, 1.3);
export const Money = mk({ fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: colors.text, letterSpacing: -0.8, ...tnum }, 1.2);
export const Num = mk({ fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20, color: colors.text, ...tnum }, 1.3);

// ---------- Layout ----------

export function Screen({
  children,
  scroll = true,
  footer,
  refreshControl,
  padded = true,
  tabbed = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
  refreshControl?: ComponentProps<typeof ScrollView>['refreshControl'];
  padded?: boolean;
  /** Leaves room for the tab bar. */
  tabbed?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const bottomPad = tabbed ? TAB_BAR_HEIGHT + insets.bottom + space.xl : space.xxl + (footer ? 0 : insets.bottom);
  const pad = padded ? { paddingHorizontal: space.lg } : null;
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[pad, { paddingBottom: bottomPad, gap: space.lg, paddingTop: space.sm }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, pad]}>{children}</View>
      )}
      {footer ? <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.md) }]}>{footer}</View> : null}
    </View>
  );
}

export function TopBar({ title, onBack, right }: { title?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <View style={styles.topBar}>
      {onBack ? <IconButton name="chevron-left" label="Go back" onPress={onBack} /> : <View style={{ width: 40 }} />}
      <Heading numberOfLines={1} style={styles.flex} center>
        {title ?? ''}
      </Heading>
      {right ?? <View style={{ width: 40 }} />}
    </View>
  );
}

/** Small section title with an optional action on the right ("See all"). */
export function Section({ title, action, onAction, children }: { title: string; action?: string; onAction?: () => void; children?: ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Heading accessibilityRole="header">{title}</Heading>
        {action && onAction ? (
          <Text onPress={onAction} accessibilityRole="button" style={styles.link}>
            {action}
          </Text>
        ) : null}
      </Row>
      {children}
    </View>
  );
}

export function Card({ children, style, tone }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'primary' | 'success' | 'danger' | 'attention' }) {
  const toneStyle =
    tone === 'attention'
      ? { borderColor: colors.attention }
      : tone === 'primary'
        ? { borderColor: colors.borderHi }
        : tone === 'success'
          ? { borderColor: colors.success, backgroundColor: colors.successBg }
          : tone === 'danger'
            ? { borderColor: colors.danger, backgroundColor: colors.dangerBg }
            : null;
  return <View style={[styles.card, toneStyle, style]}>{children}</View>;
}

export const Divider = ({ inset = 0 }: { inset?: number }) => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: inset }} />;

export const Row = ({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) => (
  <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>
);

// ---------- Controls ----------

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'attention';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

export function Button({ title, onPress, variant = 'primary', icon: iconName, loading, disabled, small, style, accessibilityHint }: ButtonProps) {
  const off = disabled || loading;
  const fg =
    variant === 'primary' ? colors.onPrimary : variant === 'attention' ? colors.onAttention : variant === 'danger' ? colors.danger : variant === 'ghost' ? colors.primary : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={() => {
        if (variant === 'primary' || variant === 'attention') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        variant === 'attention' && styles.buttonAttention,
        pressed && styles.pressed,
        off && styles.disabled,
        style,
      ]}>
      {loading ? <ActivityIndicator color={fg} size="small" /> : iconName ? <Icon name={iconName} color={fg} size={small ? 16 : 18} /> : null}
      <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={[styles.buttonText, small && { fontSize: 13 }, { color: fg }]}>
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
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, active && { backgroundColor: colors.surfaceHi }, pressed && styles.pressed, disabled && styles.disabled]}>
      <Icon name={name} color={color} size={20} />
    </Pressable>
  );
}

type Tone = 'neutral' | 'primary' | 'success' | 'danger' | 'warn' | 'attention';
const toneFg = (t: Tone) =>
  t === 'attention' ? colors.attention : t === 'primary' ? colors.primary : t === 'success' ? colors.success : t === 'danger' ? colors.danger : t === 'warn' ? colors.warn : colors.textMuted;
const toneBg = (t: Tone) =>
  t === 'attention' ? colors.attentionSoft : t === 'primary' ? colors.primarySoft : t === 'success' ? colors.successBg : t === 'danger' ? colors.dangerBg : colors.surfaceHi;

export function Chip({ text, icon: iconName, tone = 'neutral' }: { text: string; icon?: IconName; tone?: Tone }) {
  const fg = toneFg(tone);
  return (
    <View style={[styles.chip, { backgroundColor: toneBg(tone) }]}>
      {iconName ? <Icon name={iconName} size={12} color={fg} /> : null}
      <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.chipText, { color: fg }]}>
        {text}
      </Text>
    </View>
  );
}

/** Underlined text tabs. */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string; badge?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.badge ? `${o.label}, ${o.badge} new` : o.label}
            onPress={() => {
              void Haptics.selectionAsync().catch(() => {});
              onChange(o.value);
            }}
            style={({ pressed }) => [styles.segment, on && styles.segmentOn, pressed && !on && styles.pressed]}>
            <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={[styles.segmentText, on && { color: colors.text }]}>
              {o.label}
            </Text>
            {o.badge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{o.badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** A selectable row (radio behaviour). */
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
        <View style={styles.choiceIcon}>
          <Icon name={iconName} color={selected ? colors.primary : colors.textMuted} size={20} />
        </View>
      ) : null}
      <View style={styles.flex}>
        <Heading>{title}</Heading>
        {subtitle ? <Muted>{subtitle}</Muted> : null}
      </View>
      {right ?? (
        <View style={[styles.radio, selected && styles.radioOn]}>
          {selected ? <View style={styles.radioDot} /> : null}
        </View>
      )}
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
        placeholderTextColor={colors.textDim}
        selectionColor={colors.primary}
        {...input}
        style={[styles.input, error ? { borderColor: colors.danger } : null, input.multiline ? { minHeight: 92, textAlignVertical: 'top', paddingTop: space.md } : null, input.style]}
      />
      {error ? (
        <Row gap={space.xs + 2}>
          <Icon name="alert-circle-outline" size={icon.sm} color={colors.danger} />
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

export function Banner({ text, tone = 'danger', icon: iconName }: { text: string; tone?: 'danger' | 'success' | 'info' | 'attention'; icon?: IconName }) {
  const fg = tone === 'danger' ? colors.danger : tone === 'success' ? colors.success : tone === 'attention' ? colors.attention : colors.primary;
  const bg = tone === 'danger' ? colors.dangerBg : tone === 'success' ? colors.successBg : tone === 'attention' ? colors.attentionSoft : colors.primarySoft;
  return (
    <View style={[styles.banner, { backgroundColor: bg }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Icon name={iconName ?? (tone === 'danger' ? 'alert-circle-outline' : tone === 'success' ? 'check-circle-outline' : 'information-outline')} color={fg} size={18} />
      <Muted color={colors.text} style={styles.flex}>
        {text}
      </Muted>
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
  return <Chip icon="flask-outline" text={mock ? 'Simulated chain · test coins' : 'Solana devnet · test coins'} />;
}

export const Loading = ({ label = 'Loading' }: { label?: string }) => (
  <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={label}>
    <ActivityIndicator color={colors.primary} />
  </View>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: space.sm },
  link: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.primary },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.border, padding: space.lg, gap: space.md },
  button: { minHeight: 48, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.lg },
  buttonSmall: { minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.sm + 2 },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonAttention: { backgroundColor: colors.attention },
  buttonSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.borderHi },
  buttonDanger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.danger },
  buttonText: { fontFamily: fonts.bodySemi, fontSize: 15, letterSpacing: -0.1 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.4 },
  iconButton: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 22, borderRadius: radius.sm, alignSelf: 'flex-start' },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 11.5, letterSpacing: 0.1 },
  segmented: { flexDirection: 'row', gap: space.xl, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  segment: { minHeight: 40, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -StyleSheet.hairlineWidth },
  segmentOn: { borderBottomColor: colors.primary },
  segmentText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.textMuted },
  choice: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingVertical: space.md, minHeight: 64, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  choiceOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  choiceIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHi },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.borderHi, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: space.md, color: colors.text, fontFamily: fonts.body, fontSize: 16 },
  banner: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', paddingHorizontal: space.md, paddingVertical: space.sm + 2, borderRadius: radius.md },
  track: { height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceHi, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  badge: { minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: colors.attention, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.onAttention, fontFamily: fonts.bodySemi, fontSize: 10 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxxl },
});
