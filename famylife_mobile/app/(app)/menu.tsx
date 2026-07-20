// app/(app)/menu.tsx
// ANNEXE V7 — Le menu de la semaine a fusionné dans "Courses & repas"
// (`(app)/courses.tsx`, segment "Repas"). Route conservée pour les liens
// directs, redirige vers le bon segment.
import { Redirect } from 'expo-router';

export default function MenuRedirect() {
  return <Redirect href="/(app)/courses?segment=repas" />;
}
