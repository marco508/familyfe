# FamiLyfe 🏠🍬

Application mobile pour organiser le quotidien d'une maison : comptes, création
d'une maison (le créateur devient **chef**), ajout de membres (recherche par
nom / email / téléphone ou import des contacts), **activités** assignées,
**agenda** partagé, et **votes** pour les décisions communes.

Mêmes technos que `Mo/yomu`, design inspiré de **Candy Crush** (couleurs vives,
dégradés sucrés, boutons « bonbon », coins très arrondis).

```
famylife/
├── SPEC.md            → contrat API + schéma DB + design system (référence)
├── api/               → backend FastAPI (databases + SQLAlchemy Core + JWT)
└── famylife_mobile/   → app Expo SDK 54 (expo-router + TypeScript)
```

## 1. Lancer le backend

```bash
cd api
python -m venv .venv && source .venv/bin/activate   # Windows : .venv\Scripts\activate
pip install -r requirements.txt
bash run.sh          # ou : uvicorn app.main:app --host 0.0.0.0 --port 8005 --reload
```

- Base **SQLite** par défaut (`famylife.db`), tables créées automatiquement au démarrage.
- Aucune config obligatoire (un `SECRET_KEY` de dev est prévu). Voir `api/.env.example` pour personnaliser.
- Vérifier : http://localhost:8005/health et la doc interactive http://localhost:8005/docs

## 2. Lancer l'app mobile (Expo Go)

```bash
cd famylife_mobile
npm install
npx expo start
```

Scanner le QR code avec **Expo Go** (SDK 54). Le téléphone et l'ordinateur
doivent être sur le **même Wi-Fi** : l'app détecte automatiquement l'IP du PC
et tape sur `http://<ip-du-pc>:8005` (comme yomu). Pour forcer une autre URL,
modifier `extra.apiUrlLocal` dans `app.json`.

## Fonctionnalités avancées (v2)

- **Gage par activité** : activer une pénalité (gage) et/ou une récompense, en points. Réussite → récompense aux assignés ; échec → pénalité. Un **classement de points** par membre est affiché dans la maison.
- **Activité planifiée** : date + heure, avec **notifications** envoyées aux membres concernés (« à faire ensemble »).
- **Rotation / relais de tours** paramétrable : ex. le ménage tourne entre plusieurs membres ; si le tour n'est pas fait dans le délai, il passe automatiquement au membre suivant (avec pénalité si un gage est actif). Bouton « tour suivant » quand c'est fait.
- **Centre de notifications** in-app (cloche + badge non-lues) : nouvelles activités, événements, votes, tours de rotation, anniversaires.
- **Anniversaires** des membres : date de naissance au profil, bannière festive 🎂 le jour J et section « à venir ».

> Note : le **push distant** n'est pas disponible dans Expo Go (SDK 54). Le centre de notifications in-app fonctionne sans push ; des rappels **locaux** sont planifiés au mieux via `expo-notifications` (nécessite `npm install`). Après un `git pull` / une mise à jour, relancer `npm install` (nouvelle dépendance `expo-notifications`). Sur une base SQLite déjà créée, les nouvelles colonnes sont ajoutées automatiquement au démarrage.

## Lot complet (v3)

Vie de maison : **liste de courses** partagée, **dépenses partagées** avec bilan « qui doit combien à qui », **menu de la semaine** (→ liste de courses), **chat de maison** et **commentaires** sur les activités.

Gamification : **boutique de récompenses** (échange de points), **défis**, **classement** (semaine/mois/total) et **badges**, en plus des points de gage.

Tâches & agenda : **sous-tâches** (checklist), **activités récurrentes**, **photo preuve**, **RSVP** sur les événements, **événements récurrents**, **export iCal** de l'agenda.

Maison & rôles : **co-chef**, **profils enfants** (droits limités), **transfert du rôle de chef**, **avatars** (upload photo).

Confort : **mode sombre** et **langue FR/EN** (dans Réglages), **centre de notifications** in-app.

> Les onglets secondaires (Courses, Dépenses, Menu, Chat, Boutique, Défis, Classement, Réglages) sont regroupés dans l'onglet **« Plus »**.

### À installer avant de lancer le mobile

```bash
cd famylife_mobile
npm install          # installe notamment expo-notifications et expo-image-picker (nouvelles dépendances)
npx expo start -c
```

Limites connues : le **push distant** nécessite un *dev build* (pas Expo Go) ; la **sync Google Agenda** deux sens n'est pas incluse (export iCal fourni à la place) ; le mode sombre et l'i18n couvrent les nouveaux écrans et la navigation (quelques écrans plus anciens restent en thème clair).

## Logement, tâches & organisation (v4)

Logement : chaque maison a une **adresse** (ou infos d'appartement : étage, n°, digicode, interphone, accès), un **type** et une **surface**, plus une liste de **pièces** (assignables à un membre). Le chef retrouve toutes ses maisons dans un **portefeuille immobilier**.

**Tâches** domestiques (section distincte des Activités) : on crée les corvées avec fréquence (routine quotidienne/hebdo/mensuelle), assignation **fixe** ou **rotation** (avec conditions), et **gage** ; les tâches du jour s'affichent à tous avec le nom du responsable, qui **coche pour valider** — sinon le gage s'applique à l'échéance. Les **Activités** deviennent sociales : « à faire ensemble », avec choix des **participants** (seuls les concernés voient et sont notifiés).

Vie commune : **règles de la maison** (proposées par la gestion, éventuellement **votées**) avec **rappel automatique** à l'arrivée d'un nouveau membre. Rôles étendus : **co-chef**, **chef temporaire** (délégation avec expiration), **liens familiaux** (père/mère/enfant/frère/sœur…), et **visiteurs** temporaires en lecture seule.

## Parcours utilisateur

1. Créer un compte (nom, email, téléphone, mot de passe).
2. Créer une maison (→ tu deviens **chef**) ou en rejoindre une via son **code d'invitation**.
3. Ajouter des membres : recherche par nom/email/téléphone, ou import des contacts du téléphone.
4. Créer des **activités** et les assigner aux membres, suivre leur statut.
5. Partager un **agenda** (calendrier mensuel de la maison).
6. Lancer des **votes** pour trancher les décisions de la maison.

Le contrat complet des endpoints et le design system sont décrits dans `SPEC.md`.
