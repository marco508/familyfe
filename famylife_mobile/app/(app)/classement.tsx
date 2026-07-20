// app/(app)/classement.tsx
// ANNEXE V7 — Le classement est devenu un segment du hub Équité (voir
// `(app)/(tabs)/equite.tsx` et `components/sections/ClassementSection.tsx`).
// Route conservée pour les liens directs, redirige vers l'onglet Équité.
import { Redirect } from 'expo-router';

export default function ClassementRedirect() {
  return <Redirect href="/(app)/(tabs)/equite" />;
}
