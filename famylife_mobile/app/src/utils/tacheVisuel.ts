// src/utils/tacheVisuel.ts
// « Moins de texte, plus de visuel » : déduit une icône de catégorie (emoji) à
// partir de l'intitulé d'une corvée, pour donner à chaque tâche une image
// reconnaissable d'un coup d'œil. Repli neutre si rien ne correspond.
const RULES: [RegExp, string][] = [
  [/vaisselle|assiette|évier|evier|verre/, '🍽️'],
  [/poubelle|ordures?|déchet|dechet|tri\b|recycl/, '🗑️'],
  [/aspirat|balai|balay|\bsol\b|poussière|poussiere|ménage|menage|nettoy/, '🧹'],
  [/linge|lessive|machine|repass|étend|etend|sécher|secher/, '🧺'],
  [/\blit\b|draps?|chambre|couette/, '🛏️'],
  [/salle de bain|douche|toilette|\bwc\b|baignoire|lavabo/, '🛁'],
  [/cuisine|cuisiner|repas|plat|marmite|casserole/, '🍳'],
  [/table|dresser|débarrass|debarrass/, '🍴'],
  [/plante|arros|jardin|pelouse|tondre|fleur|potager/, '🪴'],
  [/chien|chat|animal|litière|litiere|aquarium|promener/, '🐾'],
  [/course|magasin|supermarch|épicerie|epicerie/, '🛒'],
  [/voiture|\bauto\b|lavage/, '🚗'],
  [/fenêtre|fenetre|vitre|carreau/, '🪟'],
  [/repasser/, '👔'],
  [/bébé|bebe|enfant|goûter|gouter/, '🍼'],
];

export function tacheEmoji(titre?: string | null): string {
  const s = (titre || '').toLowerCase();
  for (const [re, emoji] of RULES) {
    if (re.test(s)) return emoji;
  }
  return '🧽';
}
