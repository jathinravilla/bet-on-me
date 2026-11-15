import * as Haptics from 'expo-haptics';
import { Redirect, Tabs, router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/fx';
import { Icon, type IconName } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { TAB_BAR_HEIGHT, colors, fonts, radius } from '@/lib/theme';

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<string, { label: string; icon: IconName; iconOn: IconName }> = {
  home: { label: 'Markets', icon: 'chart-box-outline', iconOn: 'chart-box' },
  friends: { label: 'Squad', icon: 'account-multiple-outline', iconOn: 'account-multiple' },
  profile: { label: 'You', icon: 'account-circle-outline', iconOn: 'account-circle' },
};

function TabItem({ name, focused, onPress, badge }: { name: string; focused: boolean; onPress: () => void; badge?: number }) {
  const { me } = useAuth();
  const t = TABS[name];
  const tint = focused ? colors.text : colors.textDim;
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={badge ? `${t.label}, ${badge} new` : t.label} onPress={onPress} style={styles.item}>
      <View>
        {name === 'profile' && me ? (
          <View style={[styles.avatarRing, focused && { borderColor: colors.text }]}>
            <Avatar username={me.username} avatar={me.avatar} size={22} />
          </View>
        ) : (
          <Icon name={focused ? t.iconOn : t.icon} color={tint} size={24} />
        )}
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        ) : null}
      </View>
      <Text maxFontSizeMultiplier={1.1} style={[styles.label, { color: tint }]}>
        {t.label}
      </Text>
    </Pressable>
  );
}

function TabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  const { me } = useAuth();
  const squadBadge = (me?.pendingRequests ?? 0) + (me?.pendingInvites ?? 0);
  const item = (name: string) => {
    const i = state.routes.findIndex((r) => r.name === name);
    if (i < 0) return null;
    const r = state.routes[i];
    return (
      <TabItem
        key={r.key}
        name={name}
        focused={state.index === i}
        badge={name === 'friends' ? squadBadge : undefined}
        onPress={() => {
          void Haptics.selectionAsync().catch(() => {});
          navigateToTab(r.key);
        }}
      />
    );
  };
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom, height: TAB_BAR_HEIGHT + insets.bottom }]} accessibilityRole="tablist">
      {item('home')}
      {item('friends')}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create a challenge"
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          router.push('/create');
        }}
        style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}>
        <View style={styles.create}>
          <Icon name="plus" color={colors.onPrimary} size={22} />
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Join with a code" onPress={() => router.push('/join')} style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}>
        <Icon name="ticket-outline" color={colors.textDim} size={24} />
        <Text maxFontSizeMultiplier={1.1} style={[styles.label, { color: colors.textDim }]}>
          Code
        </Text>
      </Pressable>
      {item('profile')}
    </View>
  );
}

export default function TabsLayout() {
  const { me } = useAuth();
  if (!me) return <Redirect href="/login" />;
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="friends" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-start', paddingTop: 8, backgroundColor: 'rgba(10,23,48,0.98)', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  item: { flex: 1, alignItems: 'center', gap: 3, minHeight: 44 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 10.5 },
  create: { width: 44, height: 32, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  avatarRing: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -3, right: -8, minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: colors.attention, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.onAttention, fontFamily: fonts.bodySemi, fontSize: 9.5 },
});
