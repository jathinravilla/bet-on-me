import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// The session token lives in the iOS Keychain. (The web preview has no Keychain, so it uses sessionStorage.)
const web = Platform.OS === 'web';

export const storage = {
  get: async (key: string) => (web ? globalThis.sessionStorage?.getItem(key) ?? null : SecureStore.getItemAsync(key)),
  set: async (key: string, value: string) => (web ? globalThis.sessionStorage?.setItem(key, value) : SecureStore.setItemAsync(key, value)),
  remove: async (key: string) => (web ? globalThis.sessionStorage?.removeItem(key) : SecureStore.deleteItemAsync(key)),
};
