// app/(app)/defis.tsx
// ANNEXE V7 — Les défis sont devenus un segment du hub Équité (voir
// `(app)/(tabs)/equite.tsx` et `components/sections/DefisSection.tsx`).
// Route conservée pour les liens directs, redirige vers l'onglet Équité.
import { Redirect } from 'expo-router';

export default function DefisRedirect() {
  return <Redirect href="/(app)/(tabs)/equite" />;
}
