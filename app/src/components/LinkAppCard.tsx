// Link a public username (GitHub, Duolingo): shows the linked name with "Change", or a field to link one.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { MeView } from '../../../lib/types';
import { useToast } from '@/components/fx';
import { BodyStrong, Button, Card, Field, Icon, Muted, Row, type IconName } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, space } from '@/lib/theme';

export function LinkAppCard({
  name,
  icon,
  color,
  linkedAs,
  purpose,
  placeholder,
  maxLength,
  note,
  link,
}: {
  name: string;
  icon: IconName;
  color: string;
  linkedAs?: string;
  /** e.g. "Needed for GitHub challenges" */
  purpose: string;
  placeholder: string;
  maxLength: number;
  /** Small print under the field, e.g. what gets counted. */
  note?: string;
  link: (username: string) => Promise<MeView>;
}) {
  const { setMe } = useAuth();
  const toast = useToast();
  const [value, setValue] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = !linkedAs || editing;

  const save = async () => {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setMe(await link(value));
      setEditing(false);
      setValue('');
      toast(`${name} linked`, 'success', icon);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Row>
        <View style={styles.icon}>
          <Icon name={icon} color={color} size={20} />
        </View>
        <View style={styles.flex}>
          <BodyStrong>{name}</BodyStrong>
          <Muted>{linkedAs ? `Linked as ${linkedAs}` : purpose}</Muted>
        </View>
        {linkedAs && !editing ? (
          <Button
            small
            variant="secondary"
            title="Change"
            onPress={() => {
              setValue(linkedAs);
              setEditing(true);
            }}
          />
        ) : null}
      </Row>
      {open ? (
        <>
          <Field
            label={`${name} username`}
            value={value}
            onChangeText={(t) => {
              setValue(t);
              setError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={maxLength}
            placeholder={placeholder}
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            error={error}
            hint={note}
          />
          <Row gap={space.sm}>
            <Button small title="Link account" icon="link-variant" loading={busy} disabled={!value.trim()} onPress={() => void save()} style={styles.flex} />
            {editing ? <Button small variant="ghost" title="Cancel" onPress={() => setEditing(false)} /> : null}
          </Row>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHi, borderWidth: 1, borderColor: colors.border },
});

export const GITHUB_NOTE = 'Counts contributions on your public GitHub calendar (commits, pull requests, issues, reviews) made after you join.';
export const DUOLINGO_NOTE = 'Your Duolingo profile must be public. Counts XP earned after you join.';
