// Motion + flair building blocks: gradients, pulsing live dots, press-to-squish, avatars, ticker, toasts, sheets.
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeInUp,
  FadeOutUp,
  SlideInDown,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Avatar as AvatarData } from '../../../lib/types';
import { Body, Button, Heading, Icon, Muted, type IconName } from '@/components/ui';
import { categoryMeta, colors, fonts, radius, space } from '@/lib/theme';

// ---------- Gradient ----------

export function Gradient({ colors: c, style, children, diagonal = true }: { colors: readonly [string, string]; style?: StyleProp<ViewStyle>; children?: ReactNode; diagonal?: boolean }) {
  return (
    <LinearGradient colors={c as unknown as [string, string]} start={{ x: 0, y: 0 }} end={diagonal ? { x: 1, y: 1 } : { x: 1, y: 0 }} style={style}>
      {children}
    </LinearGradient>
  );
}

// ---------- Live dot ----------

export function LiveDot({ color = colors.volt, size = 8 }: { color?: string; size?: number }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    p.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(p);
  }, [p, reduce]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - p.value), transform: [{ scale: 1 + p.value * 1.8 }] }));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessible={false}>
      <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size, backgroundColor: color }, ring]} />
      <View style={{ width: size, height: size, borderRadius: size, backgroundColor: color }} />
    </View>
  );
}

// ---------- Press to squish ----------

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Squish({
  children,
  onPress,
  style,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  haptic = true,
  disabled,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'link' | 'radio' | 'checkbox';
  haptic?: boolean;
  disabled?: boolean;
}) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      style={[style, a, disabled && { opacity: 0.45 }]}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPressIn={() => s.set(withTiming(0.985, { duration: 90 }))}
      onPressOut={() => s.set(withTiming(1, { duration: 140 }))}
      onPress={() => {
        if (haptic) void Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}>
      {children}
    </AnimatedPressable>
  );
}

/** Springs its child up for a moment whenever `trigger` changes (pot grew, rank moved, ...). */
export function Pop({ trigger, children, style }: { trigger: unknown; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const s = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    s.value = withSequence(withTiming(1.05, { duration: 120 }), withTiming(1, { duration: 220 }));
  }, [trigger, s]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

// ---------- Avatars ----------

const SWATCHES = ['#9AD7F5', '#4E98C4', '#8FB2FF', '#7FE6EE', '#F7FBFF', '#1F4C8F', '#C9D6E8', '#5BE3A6'];
export const AVATAR_COLORS = SWATCHES;
export const AVATAR_EMOJIS = ['🧈', '🧊', '⚡', '🏃', '♞', '🎭', '🪙', '🚀', '👑', '🐋', '🐐', '🎯'];

/** Navy text on light swatches, white on dark ones. */
export function inkOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.55 ? colors.onPrimary : colors.text;
}

export function fallbackAvatar(username: string): AvatarData {
  let h = 0;
  for (const ch of username) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { color: SWATCHES[h % SWATCHES.length] };
}

export function Avatar({ username, avatar, size = 40, ring }: { username: string; avatar?: AvatarData; size?: number; ring?: string }) {
  const a = avatar ?? fallbackAvatar(username);
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: a.color,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderWidth: ring ? 2.5 : 0,
        borderColor: ring,
      }}>
      {a.image ? (
        <Image source={{ uri: a.image }} style={{ width: size, height: size }} />
      ) : a.emoji ? (
        <Text style={{ fontSize: size * 0.5 }}>{a.emoji}</Text>
      ) : (
        <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.bodySemi, fontSize: size * 0.42, color: inkOn(a.color), textTransform: 'uppercase' }}>
          {username.slice(0, 1)}
        </Text>
      )}
    </View>
  );
}

export function AvatarStack({ people, max = 4, size = 26 }: { people: { username: string; avatar?: AvatarData }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }} accessible={false}>
      {shown.map((p, i) => (
        <View key={p.username + i} style={{ marginLeft: i === 0 ? 0 : -size * 0.35, borderRadius: size, borderWidth: 2, borderColor: colors.surface }}>
          <Avatar username={p.username} avatar={p.avatar} size={size} />
        </View>
      ))}
      {extra > 0 ? (
        <View style={[styles.more, { width: size + 4, height: size + 4, borderRadius: size, marginLeft: -size * 0.35 }]}>
          <Text style={styles.moreText}>+{extra}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ---------- Ticker ----------

/** A looping marquee of short items (the "live wire" across the top of the feed). */
export function Ticker({ items }: { items: { key: string; icon: IconName; text: string; color: string }[] }) {
  const reduce = useReducedMotion();
  const x = useSharedValue(0);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (reduce || w === 0) return;
    x.value = 0;
    x.value = withRepeat(withTiming(-w, { duration: Math.max(8000, w * 22), easing: Easing.linear }), -1, false);
    return () => cancelAnimation(x);
  }, [w, x, reduce]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  if (items.length === 0) return null;
  const row = (copy: number) => (
    <View style={styles.tickerRow} onLayout={copy === 0 ? (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width) : undefined}>
      {items.map((it) => (
        <View key={`${copy}${it.key}`} style={styles.tickerItem}>
          <Icon name={it.icon} size={14} color={it.color} />
          <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={styles.tickerText}>
            {it.text}
          </Text>
          <Text style={[styles.tickerText, { color: colors.textDim }]}>•</Text>
        </View>
      ))}
    </View>
  );
  return (
    <View style={styles.ticker} accessibilityRole="text" accessibilityLabel={items.map((i) => i.text).join('. ')}>
      <Animated.View style={[{ flexDirection: 'row' }, a]}>
        {row(0)}
        {row(1)}
      </Animated.View>
    </View>
  );
}

// ---------- Toasts ----------

type Toast = { id: number; text: string; tone: 'success' | 'danger' | 'info'; icon?: IconName };
const ToastCtx = createContext<((text: string, tone?: Toast['tone'], icon?: IconName) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const insets = useSafeAreaInsets();
  const seq = useRef(0);
  const show = useCallback((text: string, tone: Toast['tone'] = 'success', iconName?: IconName) => {
    const id = ++seq.current;
    if (tone === 'success') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (tone === 'danger') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    setToasts((t) => [...t.slice(-2), { id, text, tone, icon: iconName }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);
  return (
    <ToastCtx value={show}>
      {children}
      <View pointerEvents="box-none" style={[styles.toastHost, { top: insets.top + space.sm }]}>
        {toasts.map((t) => {
          const fg = t.tone === 'success' ? colors.success : t.tone === 'danger' ? colors.danger : colors.primary;
          return (
            <Animated.View key={t.id} pointerEvents="none" entering={FadeInUp.duration(220)} exiting={FadeOutUp.duration(180)} style={[styles.toast, { borderColor: fg }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Icon name={t.icon ?? (t.tone === 'success' ? 'check-circle' : t.tone === 'danger' ? 'alert-circle' : 'information')} color={fg} />
              <Body style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>{t.text}</Body>
            </Animated.View>
          );
        })}
      </View>
    </ToastCtx>
  );
}

export function useToast() {
  const ctx = use(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

// ---------- Bottom sheet + confirm ----------

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <View style={styles.sheetHost} pointerEvents="box-none">
        <Animated.View entering={SlideInDown.duration(260)} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) + space.sm }]}>
          <View style={styles.grabber} />
          {title ? <Heading>{title}</Heading> : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

type ConfirmOpts = { title: string; message?: string; confirm: string; destructive?: boolean; icon?: IconName };
const ConfirmCtx = createContext<((o: ConfirmOpts) => Promise<boolean>) | null>(null);

/** Promise-based confirm dialog that works on iOS, Android and web (Alert.alert is a no-op on web). */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const ask = useCallback((o: ConfirmOpts) => {
    setOpts(o);
    return new Promise<boolean>((r) => (resolver.current = r));
  }, []);
  const done = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };
  const value = useMemo(() => ask, [ask]);
  return (
    <ConfirmCtx value={value}>
      {children}
      <Sheet visible={!!opts} onClose={() => done(false)} title={opts?.title}>
        {opts?.message ? <Muted>{opts.message}</Muted> : null}
        <Button title={opts?.confirm ?? 'OK'} icon={opts?.icon} variant={opts?.destructive ? 'danger' : 'primary'} onPress={() => done(true)} />
        <Button title="Cancel" variant="ghost" onPress={() => done(false)} />
      </Sheet>
    </ConfirmCtx>
  );
}

export function useConfirm() {
  const ctx = use(ConfirmCtx);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ctx;
}

const styles = StyleSheet.create({
  more: { backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface },
  moreText: { color: colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 11 },
  ticker: { height: 34, overflow: 'hidden', borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  tickerRow: { flexDirection: 'row', alignItems: 'center' },
  tickerItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: space.md },
  tickerText: { color: colors.textMuted, fontFamily: fonts.bodyMedium, fontSize: 12.5 },
  toastHost: { position: 'absolute', left: space.lg, right: space.lg, gap: space.sm, zIndex: 100 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm + 2, borderRadius: radius.md, borderWidth: 1, backgroundColor: colors.surfaceHi, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  sheetHost: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bgRaised, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.md, maxHeight: '88%' },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.borderHi, marginBottom: space.xs },
});

// ---------- Ratings ----------

/** "★ 4.6 (12)" — or "New" when nobody has rated them yet. */
export function RatingBadge({ rating, size = 'md' }: { rating: { avg: number; count: number }; size?: 'sm' | 'md' }) {
  const small = size === 'sm';
  const label = rating.count ? `Challenges rated ${rating.avg.toFixed(1)} out of 5 from ${rating.count} rating${rating.count === 1 ? '' : 's'}` : 'No ratings yet';
  return (
    <View accessible accessibilityLabel={label} style={[ratingStyles.badge, small && { paddingHorizontal: 6, height: 22 }]}>
      <Icon name={rating.count ? 'star' : 'star-outline'} size={small ? 13 : 16} color={colors.primary} />
      <Text maxFontSizeMultiplier={1.2} style={[ratingStyles.text, small && { fontSize: 12 }]}>
        {rating.count ? rating.avg.toFixed(1) : 'New'}
      </Text>
      {rating.count ? <Text style={[ratingStyles.count, small && { fontSize: 11 }]}>({rating.count})</Text> : null}
    </View>
  );
}

/** Tap-to-rate row of five stars. */
export function StarInput({ value, onChange, label, disabled }: { value: number; onChange: (stars: number) => void; label: string; disabled?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          disabled={disabled}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === n, disabled: !!disabled }}
          accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
          hitSlop={4}
          onPress={() => {
            void Haptics.selectionAsync().catch(() => {});
            onChange(n);
          }}
          style={({ pressed }) => [{ width: 36, height: 40, alignItems: 'center', justifyContent: 'center' }, pressed && { transform: [{ scale: 0.85 }] }]}>
          <Icon name={n <= value ? 'star' : 'star-outline'} size={28} color={n <= value ? colors.primary : colors.textDim} />
        </Pressable>
      ))}
    </View>
  );
}

const ratingStyles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: space.sm, height: 26, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceHi, alignSelf: 'flex-start' },
  text: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  count: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
});

// ---------- Category mark ----------

/** Flat rounded square with the category's icon — the "ticker symbol" of a challenge. */
export function CategoryMark({ category, size = 40 }: { category: keyof typeof categoryMeta; size?: number }) {
  const m = categoryMeta[category];
  return (
    <View accessible={false} style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: colors.surfaceHi, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={m.icon} size={size * 0.5} color={m.color} />
    </View>
  );
}
