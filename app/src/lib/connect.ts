import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import type { MeView } from '../../../lib/types';
import { api } from './api';

/** Runs the Strava connect flow (demo or real OAuth). Resolves with the fresh profile and what happened. */
export async function connectStrava(refresh: () => Promise<MeView | null>): Promise<{ ok: boolean; demo: boolean; me: MeView | null }> {
  const returnTo = Linking.createURL('/strava-connected');
  const { url, demo } = await api<{ url?: string; demo?: boolean }>(`/strava/connect?returnTo=${encodeURIComponent(returnTo)}`);
  if (demo || !url) {
    const me = await refresh();
    return { ok: !!me?.stravaConnected, demo: true, me };
  }
  await WebBrowser.openAuthSessionAsync(url, returnTo);
  const me = await refresh();
  return { ok: !!me?.stravaConnected, demo: false, me };
}

export const linkChess = (username: string) => api<MeView>('/me/chess', { body: { username: username.trim() } });

export const linkGithub = (username: string) => api<MeView>('/me/github', { body: { username: username.trim() } });
export const linkDuolingo = (username: string) => api<MeView>('/me/duolingo', { body: { username: username.trim() } });
