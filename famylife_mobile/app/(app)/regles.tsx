// app/(app)/regles.tsx
// ANNEXE V7 — Les règles ont fusionné avec les votes dans "Décisions"
// (`(app)/decisions.tsx`). Route conservée pour les liens directs (dont le
// rappel des règles à la connexion), redirige vers l'écran Décisions.
import { Redirect } from 'expo-router';

export default function ReglesRedirect() {
  return <Redirect href="/(app)/decisions?segment=regles" />;
}
