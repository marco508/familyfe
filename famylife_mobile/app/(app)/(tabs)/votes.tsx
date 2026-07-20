// app/(app)/(tabs)/votes.tsx
// ANNEXE V7 — Les votes ont fusionné avec les règles dans "Décisions"
// (`(app)/decisions.tsx`) : voter une règle EST un vote. La route est conservée
// (liens directs, notifications de vote) mais redirige.
// Le détail d'un vote reste sur `(app)/votes/[id]`.
import { Redirect } from 'expo-router';

export default function VotesRedirect() {
  return <Redirect href="/(app)/decisions" />;
}
