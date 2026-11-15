import type { IconName } from '@/components/ui';

/** Apps we can't verify yet. Players vote for them from the profile and the custom-challenge builder. */
export const UPCOMING: { key: string; name: string; icon: IconName; what: string }[] = [
  { key: 'leetcode', name: 'LeetCode', icon: 'code-braces', what: 'Problems solved' },
  { key: 'apple_health', name: 'Apple Health', icon: 'heart-pulse', what: 'Steps, workouts, sleep' },
  { key: 'fitbit', name: 'Fitbit', icon: 'watch', what: 'Steps and active minutes' },
  { key: 'goodreads', name: 'Goodreads', icon: 'book-open-page-variant', what: 'Books finished' },
  { key: 'peloton', name: 'Peloton', icon: 'bike', what: 'Rides and output' },
  { key: 'spotify', name: 'Spotify', icon: 'spotify', what: 'Practice-playlist minutes' },
];
