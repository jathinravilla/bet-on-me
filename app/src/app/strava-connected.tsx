// Landing route for the Strava deep link (when the OAuth sheet hands control back to the app).
import { Redirect } from 'expo-router';

export default function StravaConnected() {
  return <Redirect href="/profile" />;
}
