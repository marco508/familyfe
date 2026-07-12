// src/utils/logement.ts
// Helpers partagés pour distinguer visuellement "maison" vs "appartement"
// (champ `type_logement` sur `Maison`/`MaisonListItem`, voir maisonService.ts)
// dans toutes les interfaces qui représentent un foyer.

/** Icône représentant le type de logement : 🏢 pour un appartement, 🏠 sinon. */
export function logementIcon(type?: string | null): string {
  return type === 'appartement' ? '🏢' : '🏠';
}

/** Clé i18n du libellé du type de logement (déjà présente en fr.ts/en.ts). */
export function logementLabelKey(type?: string | null): string {
  return type === 'appartement' ? 'logement.appartement' : 'logement.maison';
}

/** Libellé localisé du type de logement, via la fonction `t` de `useT()`. */
export function logementLabel(t: (path: string, fallback?: string) => string, type?: string | null): string {
  return t(logementLabelKey(type));
}
