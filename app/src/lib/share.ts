import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import type { ComponentRef, RefObject } from 'react';
import { Platform, Share, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

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

/** The public web version of the app: anyone can open it from a link or QR code. */
export const WEB_URL = 'https://bet-on-me-web.vercel.app';

/** Shares a rendered card as a picture on phones; on the web (no image capture) it shares the text and link instead. */
export async function shareCard(ref: RefObject<ComponentRef<typeof View> | null>, fallbackText: string): Promise<'shared' | 'copied' | 'dismissed'> {
  if (Platform.OS !== 'web' && ref.current) {
    try {
      if (await Sharing.isAvailableAsync()) {
        const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your result', UTI: 'public.png' });
        return 'shared';
      }
    } catch {
      /* fall back to text below */
    }
  }
  return shareText(fallbackText);
}
