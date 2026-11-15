import { router, type Href } from 'expo-router';

/** Go back if there is somewhere to go back to (deep links and web reloads have no history); otherwise go to `fallback`. */
export function goBack(fallback: Href = '/home') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
