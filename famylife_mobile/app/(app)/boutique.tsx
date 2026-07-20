// app/(app)/boutique.tsx
// ANNEXE V7 — La boutique est devenue un segment du hub Équité (voir
// `(app)/(tabs)/equite.tsx` et `components/sections/BoutiqueSection.tsx`).
// Route conservée pour les liens directs, redirige vers l'onglet Équité.
import { Redirect } from 'expo-router';

export default function BoutiqueRedirect() {
  return <Redirect href="/(app)/(tabs)/equite" />;
}
