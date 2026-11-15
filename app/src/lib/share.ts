import * as Clipboard from 'expo-clipboard';
import { Platform, Share } from 'react-native';

/**
 * Opens the system share sheet. Where there isn't one (most desktop browsers), copies the text instead.
 * Resolves to what happened so the caller can show the right toast.
 */
export async function shareText(message: string): Promise<'shared' | 'copied' | 'dismissed'> {
  const nav = globalThis.navigator as (Navigator & { share?: (d: { text: string }) => Promise<void> }) | undefined;
  if (Platform.OS === 'web' && !nav?.share) {
    await Clipboard.setStringAsync(message);
    return 'copied';
  }
  try {
    const r = await Share.share({ message });
    return r.action === Share.dismissedAction ? 'dismissed' : 'shared';
  } catch {
    await Clipboard.setStringAsync(message);
    return 'copied';
  }
}
