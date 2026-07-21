#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Contrôle de fidélité des pages d'aide.
═══════════════════════════════════════════════════════════════════════

Le problème que ce script existe pour empêcher
──────────────────────────────────────────────
Les pages d'aide de la vitrine reproduisent l'interface de l'application
sous forme de maquettes dessinées à la main. Rien ne les rattachait au
code : quand un libellé changeait dans l'app, l'aide continuait de citer
l'ancien. Un audit a relevé une centaine d'écarts — des boutons nommés
autrement, et même des écrans entiers qui n'existaient pas.

Un utilisateur qui cherche « Qui s'en occupe » alors que le champ
s'appelle « Assignation » est exactement l'utilisateur perdu que cette
aide devait sauver.

Le contrat
──────────
Tout texte d'INTERFACE reproduit dans une maquette porte l'attribut
`data-ui`, et doit exister MOT POUR MOT dans `fr.ts` :

    <div class="ph-btn" data-ui>Créer la tâche</div>
    <div class="ph-label" data-ui>Assignation</div>

Les contenus d'EXEMPLE (ce qu'un utilisateur fictif a tapé) n'en portent
pas, puisqu'ils ne viennent pas du code :

    <div class="ph-input filled">Étendre le linge</div>

Usage
─────
    python outils/verifier-aide.py
    python outils/verifier-aide.py --lister-inconnus   (aide au diagnostic)

Sortie : 0 si tout concorde, 1 sinon.
"""

import sys
import re
import html
import unicodedata
from html.parser import HTMLParser
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
FR_TS = RACINE / "famylife_mobile" / "app" / "src" / "i18n" / "fr.ts"
VITRINE = RACINE / "vitrine"

# ─────────────────────────────────────────────────────────────────────
# Normalisation
#
# L'app et le HTML n'écrivent pas les mêmes caractères pour la même
# chose : apostrophe droite contre typographique, espace insécable
# contre espace ordinaire. Comparer sans normaliser produirait un
# torrent de faux positifs, et un script qu'on finit par ignorer.
# ─────────────────────────────────────────────────────────────────────
def normaliser(texte: str) -> str:
    t = html.unescape(texte)
    t = unicodedata.normalize("NFC", t)
    for avant, apres in [
        ("’", "'"), ("‘", "'"),      # apostrophes courbes
        ("“", '"'), ("”", '"'),      # guillemets courbes
        (" ", " "), (" ", " "),      # espaces insécables
        ("–", "-"), ("—", "-"),      # tirets longs
    ]:
        t = t.replace(avant, apres)
    return re.sub(r"\s+", " ", t).strip()


# ─────────────────────────────────────────────────────────────────────
# 1) Extraction des libellés de fr.ts
# ─────────────────────────────────────────────────────────────────────
CLE_VALEUR = re.compile(
    r"""^\s*[A-Za-z_$][\w$]*\s*:\s*         # la clé
        (?P<q>['"])                          # quote ouvrante
        (?P<val>(?:\\.|(?!(?P=q)).)*)        # valeur, échappements gérés
        (?P=q)\s*,?\s*$""",
    re.VERBOSE,
)


def libelles_app() -> set:
    if not FR_TS.exists():
        sys.exit(f"Introuvable : {FR_TS}")
    valeurs, ignorees = set(), 0
    for ligne in FR_TS.read_text(encoding="utf-8").splitlines():
        m = CLE_VALEUR.match(ligne)
        if m:
            brut = m.group("val").replace("\\'", "'").replace('\\"', '"')
            valeurs.add(normaliser(brut))
        elif re.match(r"^\s*[A-Za-z_$][\w$]*\s*:\s*[`]", ligne):
            ignorees += 1  # gabarit multi-ligne : hors de portée du contrôle
    if ignorees:
        print(f"  (note : {ignorees} libellé(s) en gabarit multi-ligne non contrôlés)")
    return valeurs


# ─────────────────────────────────────────────────────────────────────
# 2) Extraction des textes marqués data-ui dans les pages
# ─────────────────────────────────────────────────────────────────────
class Extracteur(HTMLParser):
    """Récupère le texte des éléments portant `data-ui`, imbrication comprise."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.trouves = []          # (ligne, texte)
        self._pile = []            # profondeur des éléments capturés
        self._tampon = []
        # Dans les maquettes, <i> porte toujours une icône décorative
        # (l'emoji d'un onglet, par exemple). Elle ne vient pas de fr.ts
        # et ne doit pas polluer la comparaison.
        self._icone = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("br", "img", "input", "hr", "meta", "link"):
            return
        noms = [a for a, _ in attrs]
        if self._pile:
            self._pile[-1][1] += 1
            if tag == "i":
                self._icone += 1
        if "data-ui" in noms:
            self._pile.append([self.getpos()[0], 0, len(self._tampon)])

    def handle_endtag(self, tag):
        if not self._pile:
            return
        if self._pile[-1][1] > 0:
            self._pile[-1][1] -= 1
            if tag == "i" and self._icone > 0:
                self._icone -= 1
            return
        ligne, _, depart = self._pile.pop()
        texte = "".join(self._tampon[depart:])
        del self._tampon[depart:]
        self.trouves.append((ligne, normaliser(texte)))

    def handle_data(self, data):
        if self._pile and self._icone == 0:
            self._tampon.append(data)


def textes_page(chemin: Path):
    p = Extracteur()
    p.feed(chemin.read_text(encoding="utf-8"))
    return p.trouves


# ─────────────────────────────────────────────────────────────────────
# 3) Contrôle
# ─────────────────────────────────────────────────────────────────────
def option(nom, defaut):
    """Lit `--nom valeur` dans la ligne de commande."""
    if nom in sys.argv:
        i = sys.argv.index(nom)
        if i + 1 < len(sys.argv):
            return Path(sys.argv[i + 1])
    return defaut


def main() -> int:
    global FR_TS, VITRINE
    lister = "--lister-inconnus" in sys.argv
    # `--vitrine` permet de contrôler une copie de travail : le montage
    # Linux sert des versions tronquées des fichiers fraîchement réécrits.
    VITRINE = option("--vitrine", VITRINE)
    FR_TS = option("--fr", FR_TS)
    reference = libelles_app()
    print(f"fr.ts : {len(reference)} libellés de référence\n")

    pages = sorted(VITRINE.glob("aide*.html"))
    if not pages:
        sys.exit(f"Aucune page d'aide dans {VITRINE}")

    total, fautifs, sans_marque = 0, [], []

    for page in pages:
        source = page.read_text(encoding="utf-8")
        textes = textes_page(page)
        total += len(textes)
        manquants = [(l, t) for l, t in textes if t and t not in reference]
        vides = [l for l, t in textes if not t]

        if not textes:
            # Une page sans maquette (l'index des catégories) ne reproduit
            # aucune interface : il n'y a rien à contrôler, ce n'est pas un
            # manquement. En revanche une page AVEC maquettes et sans
            # marquage échapperait au contrôle — c'est une faute.
            if 'class="phone"' not in source:
                print(f"  --  {page.name:<24} aucune maquette, rien à contrôler")
            else:
                sans_marque.append(page.name)
                print(f"  X   {page.name:<24} des maquettes, mais aucun texte "
                      f"marqué data-ui")
            continue

        if manquants or vides:
            fautifs.append(page.name)
            print(f"  X   {page.name:<24} {len(manquants)} écart(s) sur {len(textes)}")
            for ligne, texte in manquants:
                print(f"        l.{ligne:<5} « {texte} »  ->  absent de fr.ts")
            for ligne in vides:
                print(f"        l.{ligne:<5} élément data-ui vide")
        else:
            print(f"  OK  {page.name:<24} {len(textes)} libellés, tous conformes")

    print(f"\n{total} texte(s) d'interface contrôlé(s) sur {len(pages)} page(s).")

    if lister:
        print("\nLibellés de fr.ts contenant un mot-clé d'interface :")
        for v in sorted(x for x in reference if len(x) < 40):
            print("   ", v)

    if sans_marque:
        print(f"\n{len(sans_marque)} page(s) reproduisent l'interface sans "
              f"marquage : le contrôle ne les couvre pas. "
              f"{', '.join(sans_marque)}")
    if fautifs:
        print(f"\nECHEC : {len(fautifs)} page(s) citent un libellé qui n'existe "
              f"pas dans l'application.")
        return 1
    if sans_marque:
        return 1
    print("\nOK : toutes les pages citent l'application mot pour mot.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
