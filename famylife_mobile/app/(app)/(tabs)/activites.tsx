// app/(app)/(tabs)/activites.tsx
// ANNEXE V7 — L'onglet "Activités" a fusionné dans l'Agenda : les deux
// sections étaient quasi-synonymes et personne ne devinait la différence.
// La route est conservée (liens directs, raccourcis, anciennes notifications)
// mais ne fait plus que rediriger vers l'agenda, qui présente désormais une
// liste unique d'activités + événements.
// Les détails d'une activité restent sur `(app)/activites/[id]`.
import { Redirect } from 'expo-router';

export default function ActivitesRedirect() {
  return <Redirect href="/(app)/(tabs)/agenda" />;
}
