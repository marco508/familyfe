// app/(app)/equite.tsx
// ANNEXE V7 — L'équité est passée en onglet principal et sert désormais de hub
// du "jeu de points" (Équité · Classement · Défis · Boutique) : voir
// `(app)/(tabs)/equite.tsx`. Cette route est conservée pour les liens directs
// existants et redirige vers l'onglet.
import { Redirect } from 'expo-router';

export default function EquiteRedirect() {
  return <Redirect href="/(app)/(tabs)/equite" />;
}
