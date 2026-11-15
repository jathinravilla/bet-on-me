import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// The session token lives in the iOS Keychain. (The web preview has no Keychain, so it uses localStorage, so you stay logged in.)
const web = Platform.OS === 'web';

export const storage = {
  get: async (key: string) => (web ? globalThis.localStorage?.getItem(key) ?? null : SecureStore.getItemAsync(key)),
  set: async (key: string, value: string) => (web ? globalThis.localStorage?.setItem(key, value) : SecureStore.setItemAsync(key, value)),
  remove: async (key: string) => (web ? globalThis.localStorage?.removeItem(key) : SecureStore.deleteItemAsync(key)),
};
