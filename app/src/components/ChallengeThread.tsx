// The challenge's thread: who spectators are backing, a pinned comment, a composer with replies and
// @mentions, and a newest-first feed mixing comments with automatic bet updates.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { BackingView, CommentView, ThreadEventType, ThreadEventView, ThreadItem, ThreadView } from '../../../lib/types';
import { Avatar, Sheet, Squish, useConfirm, useToast } from '@/components/fx';
import { Button, Card, Chip, Heading, Icon, Muted, Row, type IconName } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { colors, fonts, radius, space } from '@/lib/theme';

const MAX = 280;
const EVENT_ICON: Record<ThreadEventType, IconName> = {
  started: 'flag-outline',
  joined: 'account-plus-outline',
  progress: 'trending-up',
  completed: 'check-circle-outline',
  lead: 'crown-outline',
  proof: 'video-outline',
  settled: 'flag-checkered',
  nudge: 'bell-ring-outline',
  backed: 'thumb-up-outline',
};

export function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Comment text with @mentions highlighted. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(@[a-zA-Z0-9_]{3,16})/g);
  return (
    <Text style={styles.body}>
      {parts.map((part, i) =>
        part.startsWith('@') ? (
          <Text key={i} style={styles.mention} onPress={() => router.push(`/u/${part.slice(1).toLowerCase()}`)}>
            {part}
          </Text>
        ) : (
          part
        )
      )}
    </Text>
  );
}

export function ChallengeThread({
  challengeId,
  players,
  isPlayer,
  onBackingChange,
}: {
  challengeId: string;
  /** Usernames offered as @mention suggestions. */
  players: string[];
  isPlayer: boolean;
  onBackingChange?: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [thread, setThread] = useState<ThreadView | null>(null);
  const [older, setOlder] = useState<ThreadItem[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | undefined>(undefined);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<CommentView | null>(null);
  const [posting, setPosting] = useState(false);
  const [menu, setMenu] = useState<CommentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const fetchedOlder = useRef(false);

  // Polling only refreshes the newest page, so older pages and your draft stay put.
  const load = useCallback(async () => {
    try {
      const t = await api<ThreadView>(`/challenges/${challengeId}/thread`);
      setThread(t);
      if (!fetchedOlder.current) setOlderCursor(t.nextBefore);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [challengeId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const poll = setInterval(() => void load(), 10_000);
      return () => clearInterval(poll);
    }, [load])
  );

  const loadOlder = async () => {
    if (!olderCursor) return;
    setLoadingOlder(true);
    try {
      const t = await api<ThreadView>(`/challenges/${challengeId}/thread?before=${olderCursor}`);
      fetchedOlder.current = true;
      setOlder((o) => [...o, ...t.items]);
      setOlderCursor(t.nextBefore);
    } catch (e) {
      toast(errorMessage(e), 'danger');
    } finally {
      setLoadingOlder(false);
    }
  };

  const post = async () => {
    const text = draft.trim();
    if (!text) return;
    setPosting(true);
    setError(null);
    try {
      await api<CommentView>(`/challenges/${challengeId}/comments`, { body: { text, replyTo: replyTo?.id ?? null } });
      setDraft('');
      setReplyTo(null);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPosting(false);
    }
  };

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMenu(null);
    try {
      await fn();
      toast(ok, 'success');
      await load();
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  };

  const back = async (userId: string | null) => {
    try {
      const b = await api<BackingView>(`/challenges/${challengeId}/back`, { body: { userId } });
      setThread((t) => (t ? { ...t, backing: b } : t));
      onBackingChange?.();
      void load();
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  };

  // @mention suggestions for the word being typed.
  const tail = /@([a-zA-Z0-9_]{0,16})$/.exec(draft);
  const suggestions = tail ? players.filter((p) => p.toLowerCase().startsWith(tail[1].toLowerCase()) && p.toLowerCase() !== tail[1].toLowerCase()).slice(0, 4) : [];

  if (!thread) return null;
  const seen = new Set(thread.items.map((i) => i.id));
  const items = [...thread.items, ...older.filter((i) => !seen.has(i.id))];
  const b = thread.backing;

  return (
    <View style={{ gap: space.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Heading accessibilityRole="header">Discussion</Heading>
        <Muted>
          {thread.commentCount} {thread.commentCount === 1 ? 'comment' : 'comments'}
        </Muted>
      </Row>

      {/* Spectators backing players (no money involved) */}
      {b.total > 0 || b.canBack ? (
        <Card style={{ gap: space.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={styles.cardTitle}>Who wins? · spectators’ picks</Text>
            <Muted>{b.total} {b.total === 1 ? 'pick' : 'picks'}</Muted>
          </Row>
          {b.total > 0 ? (
            <View style={styles.split} accessible accessibilityLabel={b.options.map((o) => `${o.username} ${o.pct}%`).join(', ')}>
              {b.options
                .filter((o) => o.count > 0)
                .map((o, i) => (
                  <View key={o.userId} style={[styles.splitPart, { flex: o.count, backgroundColor: i === 0 ? colors.primary : i === 1 ? colors.primaryDeep : colors.borderHi }]} />
                ))}
            </View>
          ) : null}
          <View style={{ gap: 6 }}>
            {b.options.map((o) => {
              const picked = b.mine === o.userId;
              return (
                <Row key={o.userId} style={{ justifyContent: 'space-between' }}>
                  <Row gap={space.sm} style={styles.flex}>
                    <Avatar username={o.username} avatar={o.avatar} size={22} />
                    <Text style={styles.name} numberOfLines={1}>
                      {o.username}
                    </Text>
                    <Text style={styles.pct}>{b.total ? `${o.pct}%` : ''}</Text>
                  </Row>
                  {b.canBack ? (
                    <Button small variant={picked ? 'primary' : 'secondary'} title={picked ? 'Backing' : 'Back'} onPress={() => void back(picked ? null : o.userId)} />
                  ) : null}
                </Row>
              );
            })}
          </View>
          {b.canBack ? <Muted>Not playing? Pick who you think takes the pot, then cheer them on below.</Muted> : null}
        </Card>
      ) : null}

      {thread.pinned ? (
        <Card style={{ gap: space.xs }}>
          <Row gap={6}>
            <Icon name="pin-outline" size={14} color={colors.primary} />
            <Text style={styles.pinLabel}>Pinned by the creator</Text>
          </Row>
          <CommentRow c={thread.pinned} onReply={() => startReply(thread.pinned!)} onMenu={() => setMenu(thread.pinned!)} compact />
        </Card>
      ) : null}

      {/* Composer */}
      {thread.canComment ? (
        <Card style={{ gap: space.sm, padding: space.md }}>
          {replyTo ? (
            <Row style={styles.replying}>
              <Icon name="reply" size={14} color={colors.textMuted} />
              <Muted style={styles.flex} numberOfLines={1}>
                Replying to @{replyTo.author.username}
              </Muted>
              <Pressable accessibilityRole="button" accessibilityLabel="Cancel reply" hitSlop={8} onPress={() => setReplyTo(null)}>
                <Icon name="close" size={16} color={colors.textMuted} />
              </Pressable>
            </Row>
          ) : null}
          <TextInput
            ref={input}
            accessibilityLabel="Write a comment"
            value={draft}
            onChangeText={(t) => {
              setDraft(t.slice(0, MAX));
              setError(null);
            }}
            placeholder={isPlayer ? 'Talk your talk… use @ to call someone out' : 'Cheer someone on… use @ to mention'}
            placeholderTextColor={colors.textDim}
            selectionColor={colors.primary}
            multiline
            maxLength={MAX}
            style={styles.input}
          />
          {suggestions.length ? (
            <Row style={{ flexWrap: 'wrap' }}>
              {suggestions.map((u) => (
                <Pressable key={u} accessibilityRole="button" accessibilityLabel={`Mention ${u}`} onPress={() => setDraft(draft.replace(/@([a-zA-Z0-9_]{0,16})$/, `@${u} `))} style={styles.suggest}>
                  <Text style={styles.suggestText}>@{u}</Text>
                </Pressable>
              ))}
            </Row>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Row style={{ justifyContent: 'space-between' }}>
            <Muted>
              {draft.length}/{MAX}
            </Muted>
            <Button small title="Post" loading={posting} disabled={!draft.trim()} onPress={() => void post()} />
          </Row>
        </Card>
      ) : null}

      {/* Feed */}
      <View>
        {items.length === 0 ? <Muted>No messages yet. Start the trash talk.</Muted> : null}
        {items.map((it) =>
          it.kind === 'event' ? <EventRow key={it.id} e={it} /> : <CommentRow key={it.id} c={it} onReply={() => startReply(it)} onMenu={() => setMenu(it)} />
        )}
      </View>
      {olderCursor ? <Button small variant="secondary" title="Show older" loading={loadingOlder} onPress={() => void loadOlder()} /> : null}

      <Sheet visible={!!menu} onClose={() => setMenu(null)} title="Comment">
        {menu ? (
          <View style={{ gap: space.sm }}>
            <Button variant="secondary" title="Reply" onPress={() => (setMenu(null), startReply(menu))} />
            {menu.canPin ? (
              thread.pinned?.id === menu.id ? (
                <Button variant="secondary" title="Unpin" onPress={() => void act(() => api(`/challenges/${challengeId}/pin`, { body: { commentId: null } }), 'Unpinned')} />
              ) : (
                <Button variant="secondary" title="Pin to top" onPress={() => void act(() => api(`/challenges/${challengeId}/pin`, { body: { commentId: menu.id } }), 'Pinned')} />
              )
            ) : null}
            {menu.canDelete ? (
              <Button
                variant="danger"
                title="Delete"
                onPress={async () => {
                  const target = menu;
                  setMenu(null);
                  if (await confirm({ title: 'Delete this comment?', message: 'It will show as deleted for everyone.', confirm: 'Delete', destructive: true })) {
                    await act(() => api(`/comments/${target.id}/delete`, { method: 'POST' }), 'Comment deleted');
                  }
                }}
              />
            ) : null}
            {menu.canReport ? (
              <Button
                variant="ghost"
                title={menu.iReported ? 'Reported' : 'Report'}
                disabled={menu.iReported}
                onPress={() => void act(() => api(`/comments/${menu.id}/report`, { method: 'POST' }), 'Reported. Comments are hidden after 3 reports.')}
              />
            ) : null}
          </View>
        ) : null}
      </Sheet>
    </View>
  );

  function startReply(c: CommentView) {
    setReplyTo(c);
    if (!draft.includes(`@${c.author.username}`)) setDraft((d) => (d ? d : `@${c.author.username} `));
    setTimeout(() => input.current?.focus(), 50);
  }
}

function EventRow({ e }: { e: ThreadEventView }) {
  return (
    <View style={styles.event} accessible accessibilityLabel={`${e.text}, ${ago(e.at)} ago`}>
      <View style={styles.eventIcon}>
        <Icon name={EVENT_ICON[e.type] ?? 'information-outline'} size={14} color={e.type === 'nudge' ? colors.attention : colors.primary} />
      </View>
      <Text style={styles.eventText}>{e.text}</Text>
      <Text style={styles.time}>{ago(e.at)}</Text>
    </View>
  );
}

function CommentRow({ c, onReply, onMenu, compact }: { c: CommentView; onReply: () => void; onMenu: () => void; compact?: boolean }) {
  const name = c.author.displayName || c.author.username;
  return (
    <View style={[styles.comment, compact && { borderBottomWidth: 0, paddingVertical: 0 }]}>
      <Squish accessibilityLabel={`Open ${c.author.username}'s profile`} onPress={() => router.push(`/u/${c.author.username}`)}>
        <Avatar username={c.author.username} avatar={c.author.avatar} size={32} />
      </Squish>
      <View style={[styles.flex, { gap: 3 }]}>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {c.byCreator ? <Chip text="Creator" tone="primary" /> : c.isPlayer ? <Chip text="Player" /> : null}
          <Text style={styles.time}>· {ago(c.at)}</Text>
        </Row>
        {c.replyTo ? <Text style={styles.replyTo}>↳ replying to @{c.replyTo.username}</Text> : null}
        {c.text !== null ? <RichText text={c.text} /> : <Text style={styles.removed}>{c.removed === 'hidden' ? 'Hidden after reports' : 'Comment deleted'}</Text>}
        {c.text !== null ? (
          <Row gap={space.lg} style={{ marginTop: 2 }}>
            <Text style={styles.action} onPress={onReply} accessibilityRole="button">
              Reply
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="More actions" hitSlop={8} onPress={onMenu}>
              <Icon name="dots-horizontal" size={18} color={colors.textMuted} />
            </Pressable>
          </Row>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cardTitle: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text },
  split: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2 },
  splitPart: { height: '100%' },
  name: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text, maxWidth: 160 },
  pct: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  pinLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.primary },
  replying: { backgroundColor: colors.surfaceHi, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 6 },
  input: { minHeight: 64, maxHeight: 140, color: colors.text, fontFamily: fonts.body, fontSize: 15, lineHeight: 21, textAlignVertical: 'top', paddingVertical: 4 },
  suggest: { paddingHorizontal: space.sm, height: 28, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  suggestText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.primary },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger },
  comment: { flexDirection: 'row', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text },
  mention: { color: colors.primary, fontFamily: fonts.bodyMedium },
  removed: { fontFamily: fonts.body, fontSize: 14, fontStyle: 'italic', color: colors.textDim },
  replyTo: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  action: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
  time: { fontFamily: fonts.body, fontSize: 12, color: colors.textDim },
  event: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  eventIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center', marginLeft: 3 },
  eventText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted },
});
