# FamiLyfe Mobile

Application mobile FamiLyfe (organisation du quotidien d'une maison :
membres, activités, agenda, votes) — **Expo SDK 54 + expo-router +
TypeScript**, exécutable dans **Expo Go**.

Design "Candy Crush" : couleurs vives et saturées, dégradés sucrés, coins
très arrondis, boutons ronds "bonbon" avec ombres colorées et haptics. Voir
`app/theme/designTokens.ts` et `../SPEC.md` (section 4).

## Prérequis

- Node.js 18+ et npm
- L'application [Expo Go](https://expo.dev/go) sur votre téléphone (Android
  ou iOS), connecté **au même réseau Wi-Fi** que votre ordinateur
- Le backend FamiLyfe (`../api`) démarré (voir plus bas)

## 1. Démarrer le backend

```bash
cd ../api
python -m venv .venv
source .venv/bin/activate   # ou .venv\Scripts\activate sous Windows
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

L'API tourne sur `http://localhost:8000` (SQLite, aucune configuration
requise). Vérifiez que `http://localhost:8000/health` répond bien
`{"status":"healthy"}`.

## 2. Démarrer l'application mobile

```bash
cd famylife_mobile
npm install
npx expo start
```

Scannez le QR code avec l'app **Expo Go** (Android : scanner intégré à Expo
Go ; iOS : appareil photo). L'app détecte automatiquement l'IP LAN de votre
ordinateur (via le serveur Metro) pour joindre le backend sur le port 8000 —
aucune configuration d'URL n'est nécessaire (voir
`app/src/services/apiClient.ts`, repris de `Mo/yomu`).

Si votre téléphone ne peut pas atteindre l'IP locale (réseau d'entreprise,
VPN...), utilisez le mode tunnel :

```bash
npx expo start --tunnel
```

## Comptes de test

Créez un compte depuis l'écran d'inscription, puis créez une maison (vous
devenez automatiquement "chef") ou rejoignez une maison existante avec un
code d'invitation à 6 caractères.

## Structure du projet

```
app/
  theme/designTokens.ts        # design system "Candy Crush" (couleurs, dégradés, ombres...)
  src/
    utils/EventEmitter.ts      # bus d'événements (401, changement de maison)
    services/                  # apiClient + services REST (auth, maisons, activités, agenda, votes)
    contexts/                  # AuthContext (session) + MaisonContext (maison active)
  components/
    ScreenBackground.tsx       # fond dégradé pastel commun à tous les écrans
    ui/                        # CandyButton, CandyCard, CandyInput, Avatar, Badge, SectionTitle, EmptyState
  _layout.tsx, index.tsx       # racine + redirection selon l'auth
  (auth)/                      # login, signup
  (app)/                       # zone protégée : onboarding, tabs, membres, détails activité/vote
```

## Notes / déviations par rapport au SPEC

- Les icônes/splash (`assets/images/*.png`) sont des placeholders générés
  localement (dégradé rose→violet + silhouette de maison) en attendant une
  charte graphique définitive.
- Les dates d'échéance d'activité et les heures d'événements sont saisies en
  texte libre (`AAAA-MM-JJ` / `HH:MM`) plutôt qu'avec un date-picker natif,
  pour ne pas ajouter de dépendance absente de la stack `yomu` de référence.
- Le calendrier de l'agenda est une grille 7 colonnes faite en React Native
  pur (aucune librairie de calendrier tierce), conformément à la consigne.
- `DELETE /maisons/{id}/membres/{uid}` est réservé au chef côté API (voir
  SPEC section 3). Le bouton "Quitter la maison" (membre non-chef) appelle
  ce même endpoint ; l'API renverra une erreur 403 tant qu'un endpoint de
  départ volontaire dédié n'existe pas côté backend — l'app affiche alors le
  message d'erreur renvoyé par l'API.
