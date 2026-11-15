import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Avatar as AvatarData, MeView, UpdateProfileBody } from '../../../lib/types';
import { AVATAR_COLORS, Avatar, Squish, inkOn, useToast } from '@/components/fx';
import { Banner, Button, Card, Field, Icon, Label, Row, Screen, TopBar } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { goBack } from '@/lib/nav';
import { useAuth } from '@/lib/auth';
import { colors, space } from '@/lib/theme';

export default function EditProfile() {
  const { me, setMe } = useAuth();
  const toast = useToast();
  const [displayName, setDisplayName] = useState(me?.displayName ?? '');
  const [bio, setBio] = useState(me?.bio ?? '');
  const [avatar, setAvatar] = useState<AvatarData>(me?.avatar ?? { color: AVATAR_COLORS[0] });
  const [busy, setBusy] = useState<'save' | 'photo' | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;

  const pickPhoto = async (from: 'library' | 'camera') => {
    setError(null);
    setBusy('photo');
    try {
      if (from === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return setError('Camera access is off. Turn it on in Settings, or pick from your library.');
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
      const res = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets[0]) return;
      // Shrink to a small square JPEG so it fits in the profile record.
      const small = await ImageManipulator.manipulateAsync(res.assets[0].uri, [{ resize: { width: 192, height: 192 } }], { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      if (!small.base64) return setError("Couldn't read that photo. Try another one.");
      setAvatar((a) => ({ ...a, image: `data:image/jpeg;base64,${small.base64}` }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy('save');
    setError(null);
    try {
      const body: UpdateProfileBody = { displayName: displayName.trim(), bio: bio.trim(), avatar };
      setMe(await api<MeView>('/me/profile', { body }));
      toast('Profile updated', 'success', 'account-check');
      goBack('/profile');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen footer={<Button title="Save profile" loading={busy === 'save'} onPress={() => void save()} />}>
      <TopBar title="Edit profile" onBack={() => goBack('/profile')} />

      <View style={styles.preview}>
        <Avatar username={me.username} avatar={avatar} size={96} />
        <Row gap={space.sm} style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button small title="Upload photo" loading={busy === 'photo'} onPress={() => void pickPhoto('library')} />
          <Button small variant="secondary" title="Take photo" onPress={() => void pickPhoto('camera')} />
          {avatar.image ? <Button small variant="ghost" title="Remove photo" onPress={() => setAvatar((a) => ({ ...a, image: undefined }))} /> : null}
        </Row>
      </View>

      {error ? <Banner text={error} /> : null}

      <Card>
        <Label>Colour</Label>
        <View style={styles.swatches} accessibilityRole="radiogroup">
          {AVATAR_COLORS.map((c) => {
            const on = avatar.color === c;
            return (
              <Squish key={c} accessibilityRole="radio" accessibilityLabel={`Colour ${c}`} onPress={() => setAvatar((a) => ({ ...a, color: c, emoji: undefined }))} style={[styles.swatch, { backgroundColor: c }, on && styles.swatchOn]}>
                {on ? <Icon name="check-bold" color={inkOn(c)} size={18} /> : null}
              </Squish>
            );
          })}
        </View>
      </Card>

      <Field label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={30} placeholder={me.username} hint="Shown to friends. Your @username stays the same." />
      <Field label="Bio" value={bio} onChangeText={setBio} maxLength={160} multiline placeholder="Training for a half marathon. 1200 rapid by summer." hint={`${bio.length}/160`} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { alignItems: 'center', gap: space.lg, paddingVertical: space.md },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatch: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  swatchOn: { borderWidth: 3, borderColor: colors.text },
});
