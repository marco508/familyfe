# FamyLife — Spécification technique (contrat partagé backend ⇄ mobile)

> **Addendum v2 (gage, notifications, planning/rotation, anniversaires) — voir la
> section « ANNEXE V2 » en bas du fichier. Elle prévaut sur les points antérieurs.**


Application mobile pour organiser le quotidien d'une maison : comptes, création
d'une maison (le créateur devient **chef**), ajout de membres (recherche par
téléphone / nom / email), **activités** assignées, **agenda** partagé, **votes**.

Mêmes technos que `Mo/yomu` :
- **Backend** : FastAPI + `databases` (async) + SQLAlchemy Core + JWT (`python-jose`) + `bcrypt`.
- **Mobile** : Expo **SDK 54**, `expo-router`, TypeScript, `apiClient`/`AuthContext`, `expo-linear-gradient`, `lucide-react-native`.
- **Design** : inspiration **Candy Crush** (couleurs vives, dégradés sucrés, boutons ronds « bonbon », ombres colorées, coins très arrondis, ambiance joyeuse).

Le backend tourne en local sur `:8000`, la base par défaut est **SQLite**
(`sqlite+aiosqlite:///./famylife.db`) avec `AUTO_CREATE_TABLES=True` pour un
démarrage sans Postgres/Redis. Redis est optionnel (mode dégradé comme yomu).

---

## 1. Schéma de base de données (SQLAlchemy Core — `app/database/tables.py`)

### utilisateurs
| colonne | type | notes |
|---|---|---|
| id | Integer PK | |
| nom | String NOT NULL | |
| email | String UNIQUE NOT NULL | index |
| telephone | String UNIQUE NULL | index — sert à la recherche par contact |
| mot_de_passe_hash | String NOT NULL | |
| image | String NULL | url/emoji avatar |
| date_creation | TIMESTAMP default now | |

### maisons
| id | Integer PK |
| nom | String NOT NULL |
| code_invitation | String UNIQUE NOT NULL | 6 caractères A-Z0-9, pour rejoindre |
| chef_id | Integer FK utilisateurs.id NOT NULL |
| emoji | String NULL default '🏠' |
| couleur | String NULL default '#FF4E9B' |
| date_creation | TIMESTAMP default now |

### membres_maison
| id | Integer PK |
| maison_id | FK maisons.id |
| utilisateur_id | FK utilisateurs.id |
| role | String NOT NULL default 'membre' | 'chef' | 'membre' |
| date_ajout | TIMESTAMP default now |
| UNIQUE(maison_id, utilisateur_id) |

### activites
| id | Integer PK |
| maison_id | FK maisons.id |
| titre | String NOT NULL |
| description | Text NULL |
| statut | String default 'a_faire' | 'a_faire' | 'en_cours' | 'termine' |
| date_echeance | Date NULL |
| createur_id | FK utilisateurs.id |
| date_creation | TIMESTAMP default now |

### activite_assignations
| id | Integer PK |
| activite_id | FK activites.id (ON DELETE CASCADE au niveau app) |
| utilisateur_id | FK utilisateurs.id |
| UNIQUE(activite_id, utilisateur_id) |

### evenements  (agenda)
| id | Integer PK |
| maison_id | FK maisons.id |
| titre | String NOT NULL |
| description | Text NULL |
| date_debut | TIMESTAMP NOT NULL | ISO |
| date_fin | TIMESTAMP NULL |
| toute_la_journee | Boolean default false |
| lieu | String NULL |
| couleur | String default '#7B5CFF' |
| createur_id | FK utilisateurs.id |
| date_creation | TIMESTAMP default now |

### votes
| id | Integer PK |
| maison_id | FK maisons.id |
| question | String NOT NULL |
| description | Text NULL |
| statut | String default 'ouvert' | 'ouvert' | 'clos' |
| createur_id | FK utilisateurs.id |
| date_creation | TIMESTAMP default now |
| date_cloture | TIMESTAMP NULL |

### vote_options
| id | Integer PK | vote_id FK | texte String NOT NULL |

### vote_bulletins
| id | Integer PK | vote_id FK | option_id FK | utilisateur_id FK | date_creation TIMESTAMP | UNIQUE(vote_id, utilisateur_id) |

---

## 2. Auth (JWT, identique à yomu)

- `hash_password`/`verify_password` bcrypt (72 bytes max).
- `create_access_token({"sub": str(user_id)})`, `HS256`, expire 7 jours.
- `OAuth2PasswordBearer(tokenUrl="token")`, `get_current_user` → dict user.
- Login accepte **email OU nom OU téléphone** dans `username`.

---

## 3. Endpoints REST

Tous les endpoints (sauf `/health`, `/token`, `/signup`) exigent `Authorization: Bearer <token>`.
Les erreurs renvoient `{ "detail": "..." }` avec le bon status (comme yomu).

### Santé & auth
- `GET  /health` → `{status:"healthy"}`
- `POST /signup` (JSON `{nom,email,password,telephone?}`) → `{message}` (crée l'utilisateur ; 400 si email/téléphone déjà pris ou password < 6)
- `POST /token` (form `username`,`password`) → `{access_token, token_type}`
- `POST /logout` → `{message}`
- `GET  /me` → utilisateur courant `{id,nom,email,telephone,image,date_creation}`
- `PUT  /me` (JSON `{nom,email,telephone,image?}`) → utilisateur mis à jour

### Recherche d'utilisateurs (pour ajouter des membres)
- `GET /users/search?q=...` → `[{id,nom,email,telephone,image}]`
  Recherche insensible à la casse sur nom, email, téléphone (LIKE). Exclut l'appelant. Limite 20.
- `POST /users/search/telephones` (JSON `{telephones:["+33...","..."]}`) → `[{id,nom,email,telephone,image}]`
  Match exact sur une liste de numéros (issus des contacts du téléphone).

### Maisons
- `POST   /maisons` (JSON `{nom,emoji?,couleur?}`) → maison créée ; l'appelant devient **chef** + membre.
- `GET    /maisons` → liste des maisons de l'appelant `[{...maison, role, nb_membres}]`
- `GET    /maisons/{id}` → détail maison `{...maison, role, membres:[{id,nom,email,telephone,image,role}]}` (403 si non membre)
- `PUT    /maisons/{id}` (chef) → maj nom/emoji/couleur
- `DELETE /maisons/{id}` (chef) → supprime la maison + dépendances
- `POST   /maisons/join` (JSON `{code_invitation}`) → rejoint la maison ; 404 si code inconnu ; 200 si déjà membre.
- `GET    /maisons/{id}/membres` → `[{id,nom,email,telephone,image,role,date_ajout}]`
- `POST   /maisons/{id}/membres` (chef) (JSON `{utilisateur_id}`) → ajoute un membre (400 si déjà membre)
- `DELETE /maisons/{id}/membres/{uid}` (chef) → retire un membre (impossible de retirer le chef)

### Activités
- `GET    /maisons/{id}/activites?statut=` → `[{...activite, createur:{...}, assignes:[{id,nom,image}]}]`
- `POST   /maisons/{id}/activites` (JSON `{titre,description?,statut?,date_echeance?,assignes?:[user_id]}`) → activité créée
- `GET    /activites/{aid}` → détail
- `PUT    /activites/{aid}` (JSON partiel `{titre?,description?,statut?,date_echeance?,assignes?}`) → maj (remplace la liste d'assignés si fournie)
- `PATCH  /activites/{aid}/statut` (JSON `{statut}`) → change juste le statut
- `DELETE /activites/{aid}` → supprime (chef ou créateur)

### Agenda / événements
- `GET    /maisons/{id}/evenements?debut=&fin=` → `[{...evenement, createur:{...}}]` triés par date_debut
- `POST   /maisons/{id}/evenements` (JSON `{titre,description?,date_debut,date_fin?,toute_la_journee?,lieu?,couleur?}`) → créé
- `PUT    /evenements/{eid}` → maj
- `DELETE /evenements/{eid}` → supprime (chef ou créateur)

### Votes
- `GET    /maisons/{id}/votes` → `[{...vote, createur:{...}, options:[{id,texte,nb_voix}], total_voix, mon_vote_option_id|null}]`
- `POST   /maisons/{id}/votes` (JSON `{question,description?,options:["A","B",...]}`) → vote créé (min 2 options)
- `GET    /votes/{vid}` → détail avec résultats
- `POST   /votes/{vid}/voter` (JSON `{option_id}`) → enregistre/replace le bulletin de l'appelant (400 si vote clos)
- `POST   /votes/{vid}/cloturer` (chef ou créateur) → statut 'clos'
- `DELETE /votes/{vid}` (chef ou créateur)

Autorisation : toute action sur une ressource d'une maison vérifie que
l'appelant est membre de cette maison ; les actions « chef » vérifient le rôle.

---

## 4. Design system Candy Crush (mobile — `app/theme/designTokens.ts`)

Palette bonbon (vives, saturées, joyeuses) :

```
colors.candy = {
  pink:    '#FF4E9B',  pinkDark: '#E23A82',
  purple:  '#7B5CFF',  purpleDark:'#5E3EE0',
  blue:    '#3AC8FF',  blueDark: '#1EA8E8',
  green:   '#3FD98B',  greenDark:'#22B86E',
  yellow:  '#FFD23F',  yellowDark:'#F5B700',
  orange:  '#FF8A3D',  orangeDark:'#F26C1B',
  red:     '#FF5B6E',
  cream:   '#FFF6E9',  // fond clair
  white:   '#FFFFFF',
}
text = { dark:'#3A2A5B', body:'#6B5B8A', light:'#FFFFFF', muted:'#A99BC4' }
```

Dégradés signature (`gradients`) :
- `appBackground`: `['#FFE9F3','#F3E8FF','#E8F6FF']` (fond pastel sucré, clair)
- `primary` (pink→purple): `['#FF6FB1','#FF4E9B','#7B5CFF']`
- `candyPink`: `['#FF8FC4','#FF4E9B']`
- `candyPurple`: `['#9B7BFF','#5E3EE0']`
- `candyBlue`: `['#7ADBFF','#1EA8E8']`
- `candyGreen`: `['#7DEBB2','#22B86E']`
- `candyOrange`: `['#FFB36B','#F26C1B']`
- `candyYellow`: `['#FFE27A','#F5B700']`

Style « bonbon » :
- **Coins ultra arrondis** (`borderRadius` md=16, lg=20, xl=28, pill=999).
- Boutons : dégradé + **double ombre colorée** (glow de la couleur) + bord blanc semi-opaque + effet « pressé » (scale 0.95) + `expo-haptics`.
- Cartes : fond blanc, coins 24, ombre douce colorée, petit liseré pastel.
- Titres : `fontWeight 800/900`, `letterSpacing` léger, texte violet foncé `#3A2A5B`.
- Accents ludiques : étoiles ✨, pastilles, badges ronds, emojis.
- Barre d'onglets custom flottante « bonbon » (pilule blanche, icône active dans une bulle en dégradé).

Composants UI attendus (`app/components/ui/`) :
`CandyButton`, `CandyCard`, `CandyInput`, `Avatar`, `Badge`, `SectionTitle`,
`EmptyState`, `ScreenBackground`.

---

## 5. Navigation mobile (expo-router)

```
app/
  _layout.tsx            → AuthProvider + MaisonProvider + Stack
  index.tsx              → redirige vers (auth)/login ou (app) selon auth
  (auth)/_layout.tsx     → Stack sur fond bonbon
  (auth)/login.tsx
  (auth)/signup.tsx
  (app)/_layout.tsx      → si aucune maison → redirige /(app)/onboarding
  (app)/onboarding.tsx   → créer OU rejoindre une maison
  (app)/(tabs)/_layout.tsx → Tabs bonbon flottants
  (app)/(tabs)/index.tsx    → Accueil (dashboard maison)
  (app)/(tabs)/activites.tsx
  (app)/(tabs)/agenda.tsx
  (app)/(tabs)/votes.tsx
  (app)/(tabs)/maison.tsx   → membres + profil + gestion
  (app)/membres/ajouter.tsx → recherche (nom/email/tel) + contacts
  (app)/activites/[id].tsx
  (app)/votes/[id].tsx
```

`MaisonContext` : maison active (persistée AsyncStorage `@maison_active`), liste
des maisons, membres, helpers `isChef`. Rechargement au focus.

---

# ANNEXE V2 — Gage, notifications, planning/rotation, anniversaires

Le backend a été étendu. Types et endpoints supplémentaires (à refléter côté mobile).

## Utilisateur — date de naissance
- `signup` accepte `date_naissance` (optionnel, `"AAAA-MM-JJ"`).
- `GET /me` et `PUT /me` incluent `date_naissance` (string|null). `PUT /me` accepte `date_naissance` (n'écrase que si fourni).

## Activités — champs ajoutés (présents en création, édition, et dans les réponses)
- `heure_echeance` : `"HH:MM"` | null — pour une activité à faire ensemble à une heure donnée.
- `rappel` : bool (défaut true) — envoie des notifications aux personnes concernées.
- **Gage** : `gage_actif` bool, `penalite` string|null (description du gage si échec),
  `recompense` string|null, `points_penalite` int, `points_recompense` int,
  `gage_resultat` : `'en_attente' | 'reussi' | 'echoue'` (lecture seule, géré par l'API).
- **Rotation / relais de tours** : `rotation_active` bool, `rotation_ordre` `number[]`
  (ids des membres, dans l'ordre des tours), `rotation_index` int, `rotation_delai_jours` int,
  `rotation_echeance` timestamp|null. La réponse ajoute `rotation_titulaire` `{id,nom,image}|null`
  (le membre dont c'est le tour maintenant).

Comportements :
- `PATCH /activites/{id}/statut` avec `statut:"termine"` et un gage encore `en_attente`
  → auto-résolution en **réussite** (récompense octroyée aux assignés).
- **Auto-escalade** : à chaque `GET /maisons/{id}/activites`, toute rotation dont
  `rotation_echeance` est dépassée et non terminée avance automatiquement au membre
  suivant (relais), applique la pénalité (si gage) au titulaire manquant et notifie.

Endpoints activités ajoutés :
- `POST /activites/{id}/gage/resoudre` (chef ou créateur) — body `{resultat:'reussi'|'echoue'}`.
  reussi → +points_recompense aux assignés + statut `termine` ; echoue → -points_penalite.
- `POST /activites/{id}/rotation/suivant` (chef, créateur, ou titulaire courant) —
  le titulaire a fait sa part : récompense (si gage) puis passage au membre suivant.

## Membres — points / classement
- `GET /maisons/{id}` (membres[]) et `GET /maisons/{id}/membres` incluent `points` (int, score cumulé via les gages). Afficher un petit **classement** (leaderboard) dans l'écran maison.

## Notifications (centre de notifications in-app)
> Le push distant n'est pas disponible dans Expo Go (SDK 54). On affiche un **centre
> de notifications** (cloche + badge non-lues) alimenté par l'API, et on planifie des
> **rappels locaux** best-effort via `expo-notifications` pour les activités/événements datés.

- `GET /notifications?non_lues=<bool>&limit=<n>` → `[{id,type,titre,message,lien,lu(bool),maison_id,date_creation}]`
  (types : `activite|evenement|vote|anniversaire|rotation`). `lien` ex : `"activite:5"`, `"vote:3"`, `"agenda"`, `"maison"`.
- `GET /notifications/compteur` → `{non_lues:int}` (à interroger au focus pour le badge).
- `POST /notifications/{id}/lu` ; `POST /notifications/lu-tout` ; `DELETE /notifications/{id}`.
- Générées automatiquement par l'API : nouvelle activité (assignés, ou toute la maison si commune),
  nouvel événement (toute la maison), nouveau vote (toute la maison), tour de rotation (nouveau titulaire),
  anniversaire du jour (toute la maison, idempotent).

## Anniversaires
- `GET /maisons/{id}/anniversaires` → `[{id,nom,image,date_naissance,prochaine_date,jours_restants,age_a_venir,aujourdhui(bool)}]`
  trié par `jours_restants`. À célébrer dans l'app : **bannière festive** 🎂 sur l'accueil quand
  `aujourdhui`, et section « anniversaires à venir ».

## Attendus UI mobile v2
- Champ **date de naissance** à l'inscription et dans le profil (écran maison).
- **Centre de notifications** : icône cloche avec badge (compteur non-lues) accessible depuis l'entête ;
  écran liste avec « tout marquer lu », tap → navigation selon `lien`. Rappels locaux best-effort.
- **Création/édition d'activité** : date + heure, toggle rappel, section **Gage**
  (activer, pénalité, récompense, points), section **Rotation** (activer, choisir l'ordre des
  membres, délai en jours). Cartes : badges gage 🎁/⚠️, titulaire du tour 🔄, heure ⏰.
- **Détail activité** : boutons « Réussi »/« Échoué » (résoudre le gage, chef/créateur),
  bouton « Tour suivant » (rotation), affichage du titulaire courant.
- **Accueil** : bannière anniversaire du jour, anniversaires à venir, événements du jour, votes ouverts.
- **Écran maison** : classement des points des membres, anniversaires, code d'invitation.

---

# ANNEXE V3 — Lot complet (courses, dépenses, menu, chat, boutique, défis, rôles…)

Toutes les ressources sont scellées à une maison ; l'appelant doit être membre.
Actions de gestion = chef **ou co-chef** (`require_gestion`) ; certaines réservées au chef.
Migrations SQLite auto au démarrage (ALTER/CREATE idempotents).

## Rôles & profils (extension)
- `membres_maison.role` ∈ `chef | co_chef | membre`. `membres_maison.est_enfant` bool.
- Un **enfant** ne peut pas : créer/clore un vote, gérer la maison, valider des récompenses (il peut faire ses activités, cocher ses tâches, demander une récompense).
- `POST /maisons/{id}/membres/{uid}/role` (chef) body `{role, est_enfant?}`.
- `POST /maisons/{id}/transferer-chef` (chef) body `{utilisateur_id}` → l'ancien chef devient membre.
- Membres/leaderboard renvoient `role`, `est_enfant`.

## Avatars & photos (upload)
- `POST /me/avatar` (multipart `image`) → `{image}` (stocké /uploads/avatars, URL relative servie en statique).
- `POST /activites/{id}/preuve` (multipart `image`) → `{preuve_url}` (photo « preuve » avant/après).
- Servir `/uploads` en statique (comme yomu). Champs : `utilisateurs.image`, `activites.preuve_url`.

## Liste de courses — `courses_items`
(id, maison_id, nom, quantite str?, categorie str?, achete bool, ajoute_par, achete_par?, date_creation)
- `GET /maisons/{id}/courses` → items triés (non achetés d'abord).
- `POST /maisons/{id}/courses` `{nom, quantite?, categorie?}`.
- `PATCH /courses/{itemId}` `{achete?, nom?, quantite?, categorie?}` (toggle achat).
- `DELETE /courses/{itemId}` ; `DELETE /maisons/{id}/courses/achetes` (vider les achetés).

## Dépenses partagées — `depenses` + `depense_parts`
depenses(id, maison_id, titre, montant float, paye_par, date, categorie?, description?)
depense_parts(depense_id, utilisateur_id) = membres qui partagent (répartition égale).
- `GET /maisons/{id}/depenses` → dépenses + `parts:[user_id]`.
- `POST /maisons/{id}/depenses` `{titre, montant, paye_par?, date?, categorie?, participants:[user_id]}` (défaut paye_par=appelant, participants=tous).
- `PUT /depenses/{did}` ; `DELETE /depenses/{did}`.
- `GET /maisons/{id}/depenses/bilan` → `{soldes:[{utilisateur_id,nom,paye,du,solde}], reglements:[{de,vers,montant}]}` (qui doit combien à qui, simplifié).

## Menu de la semaine — `repas`
(id, maison_id, date, moment ∈ petit_dej|midi|soir, titre, notes?)
- `GET /maisons/{id}/repas?debut=&fin=` ; `POST /maisons/{id}/repas` ; `PUT /repas/{rid}` ; `DELETE /repas/{rid}`.
- `POST /repas/{rid}/vers-courses` `{items:[str]}` → crée des `courses_items` (générer la liste depuis un repas).

## Chat de maison — `messages` ; Commentaires — `activite_commentaires`
messages(id, maison_id, utilisateur_id, contenu, date_creation)
- `GET /maisons/{id}/messages?avant_id=&limit=` (pagination), `POST /maisons/{id}/messages` `{contenu}`. (in-app, polling)
- `GET /activites/{id}/commentaires`, `POST /activites/{id}/commentaires` `{contenu}` (notifie les assignés).

## Boutique de récompenses — `boutique_recompenses` + `recompense_echanges`
boutique_recompenses(id, maison_id, nom, cout_points int, description?, actif bool)
recompense_echanges(id, recompense_id, maison_id, utilisateur_id, cout, statut ∈ demande|valide|refuse, date_creation)
- `GET /maisons/{id}/boutique` ; `POST /maisons/{id}/boutique` (gestion) ; `PUT /boutique/{rid}` ; `DELETE /boutique/{rid}`.
- `POST /boutique/{rid}/echanger` (membre) → 400 si points insuffisants ; **déduit** les points, crée un échange `demande` et notifie la gestion.
- `GET /maisons/{id}/echanges` ; `POST /echanges/{eid}/valider` / `POST /echanges/{eid}/refuser` (gestion ; refus → recrédite les points).

## Points, classement & badges — `points_log`
points_log(id, maison_id, utilisateur_id, delta int, motif str, date_creation). **Chaque** ajustement de points (gage, rotation, échange) écrit une ligne.
- `GET /maisons/{id}/classement?periode=semaine|mois|total` → `[{utilisateur_id,nom,image,points}]` trié desc.
- `GET /maisons/{id}/badges` → par membre, badges dérivés des stats (ex. « 🧹 10 activités terminées », « 🔥 série de 5 », « 🏆 1er du mois »). Calcul à la lecture.

## Défis de maison — `defis` + `defi_participants`
defis(id, maison_id, titre, description?, points int, date_fin?, statut ∈ ouvert|clos, createur_id, date_creation)
defi_participants(defi_id, utilisateur_id, termine bool)
- `GET /maisons/{id}/defis` (+ participants, mon état) ; `POST /maisons/{id}/defis` `{titre,description?,points,date_fin?}`.
- `POST /defis/{did}/rejoindre` ; `POST /defis/{did}/terminer` (le participant marque fait → +points) ; `POST /defis/{did}/cloturer` (gestion) ; `DELETE /defis/{did}`.

## Activités : sous-tâches, récurrence, preuve
- `activites.recurrence` ∈ `aucune|quotidien|hebdo|mensuel` (défaut aucune). À la clôture/`termine`, si récurrente → crée automatiquement la prochaine occurrence (échéance décalée).
- Sous-tâches `activite_sous_taches`(id, activite_id, titre, fait bool) : `GET/POST /activites/{id}/sous-taches`, `PATCH /sous-taches/{sid}` `{fait?,titre?}`, `DELETE /sous-taches/{sid}`. Réponse activité ajoute `sous_taches:[…]`, `preuve_url`, `recurrence`.

## Agenda : récurrence, RSVP, iCal
- `evenements.recurrence` ∈ `aucune|hebdo|mensuel` (à titre indicatif + prochaines occurrences calculées côté client, ou génération simple).
- RSVP `evenement_reponses`(evenement_id, utilisateur_id, reponse ∈ oui|non|peut_etre) : `POST /evenements/{id}/reponse` `{reponse}` ; la réponse de l'événement inclut `reponses:[{utilisateur_id,nom,reponse}]` + `ma_reponse`.
- `GET /maisons/{id}/agenda.ics` → `text/calendar` (export iCal, importable dans Google/Apple Calendar). *Sync Google deux sens = hors périmètre (OAuth requis), documenté.*

## Notifications push (dev build)
- `utilisateurs.push_token` (str) : `POST /me/push-token` `{token}`. Helper serveur d'envoi via l'API Expo (`https://exp.host/--/api/v2/push/send`) appelé en plus des notifications in-app.
- **Limite** : le push réel ne fonctionne qu'en *dev build*/standalone (pas Expo Go). Le centre de notifications in-app reste la source de vérité.

## Mobile v3 (UI)
Nouveaux onglets/écrans « bonbon » : **Courses**, **Dépenses** (+ bilan qui-doit-à-qui), **Menu** (semaine), **Chat**, **Boutique** (+ mes échanges), **Défis**, **Classement/Badges**. Détail activité : sous-tâches (checklist), récurrence, photo preuve, commentaires. Détail événement : RSVP + export iCal. Écran maison : gestion des rôles (co-chef/enfant), transfert de chef, avatar (upload). Réglages : **mode sombre** (ThemeContext + palette bonbon sombre) et **langue FR/EN** (i18n). Ajouter `expo-image-picker` pour les photos. Regrouper les onglets secondaires dans un menu « Plus » pour ne pas surcharger la barre.

Config : `app.json` slug `famylife_mobile`, scheme `famylife`, SDK 54,
`newArchEnabled`, plugins expo-router/splash/font, `expo-contacts` (permission
`NSContactsUsageDescription` / Android READ_CONTACTS). `apiClient` identique à
yomu (détection IP LAN pour Expo Go, `extra.apiUrlLocal`/`apiUrlRemote`).

---

# ANNEXE V4 — Logement/adresses, pièces, portefeuille, Tâches, règles, rôles étendus

Interprétation cadre : **Tâches** = corvées domestiques (assigné, fréquence/routine,
rotation, gage, validation en cochant, échéance → gage auto). **Activités** =
sociales (« à faire ensemble »), avec **participants** ; seuls les concernés voient
et sont notifiés. Migrations SQLite auto (ALTER/CREATE idempotents). Ajouts seulement,
sans casser l'existant.

## Adresse & logement (colonnes ajoutées à `maisons`)
`type_logement` (maison|appartement, défaut maison), `adresse`, `complement`
(bâtiment/résidence), `code_postal`, `ville`, `pays`, `etage`, `numero_appartement`,
`digicode`, `interphone`, `acces` (instructions texte), `surface` (float?, m²).
- `PUT /maisons/{id}` (gestion) accepte tous ces champs ; `GET /maisons/{id}` les renvoie.

## Pièces — `pieces`
(id, maison_id, nom, type ∈ chambre|salon|cuisine|salle_de_bain|bureau|garage|autre,
affecte_a → utilisateur_id nullable, date_creation)
- `GET /maisons/{id}/pieces` (+ membre affecté) ; `POST /maisons/{id}/pieces` (gestion) ;
  `PUT /pieces/{pid}` ; `DELETE /pieces/{pid}` ; `POST /pieces/{pid}/affecter` `{utilisateur_id|null}`.
- `GET /maisons/{id}` renvoie `nb_pieces`.

## Portefeuille immobilier — `GET /portefeuille`
Pour l'appelant : liste des maisons dont il est **chef** (ou chef_temporaire), avec
`type_logement`, résumé d'adresse, `nb_pieces`, `nb_membres`, `surface`. Vue « patrimoine ».

## Rôles étendus, famille & visiteurs (colonnes ajoutées à `membres_maison`)
- `role` ∈ `chef | co_chef | chef_temporaire | membre | visiteur`.
- `lien_famille` ∈ `pere|mere|enfant|frere|soeur|conjoint|autre|null`.
- `role_expire_le` (timestamp?, chef_temporaire), `visite_expire_le` (timestamp?, visiteur),
  `regles_vues_le` (timestamp?, dernière prise de connaissance des règles).
- `require_gestion` = chef, co_chef **ou** chef_temporaire (jamais enfant ni visiteur).
  Un **visiteur** est en lecture seule ; un **enfant** garde ses restrictions v3.
- `POST /maisons/{id}/membres/{uid}/role` (chef) `{role?, lien_famille?, est_enfant?, expire_le?}`
  (accepte co_chef/chef_temporaire/membre/visiteur ; `chef` reste réservé à `/transferer-chef`).
- `POST /maisons/{id}/chef-temporaire` (chef) `{utilisateur_id, expire_le?}` → role chef_temporaire.
- `POST /maisons/{id}/visiteurs` (gestion) `{utilisateur_id, expire_le}` → marque un membre `visiteur` temporaire + déclenche le rappel des règles.
- Membres/leaderboard renvoient `role`, `est_enfant`, `lien_famille`, dates d'expiration.
- Créer sa propre maison = libre (on en devient chef) ; devenir chef d'une maison **existante** = uniquement via `/transferer-chef` (désignation du chef).

## Règles de la maison (votées) — `regles` + rappel à l'arrivée
regles(id, maison_id, titre, contenu, statut ∈ proposee|adoptee|rejetee, vote_id nullable,
ordre int, createur_id, date_creation)
- `POST /maisons/{id}/regles` (gestion) `{titre, contenu, soumettre_au_vote?}` → si `soumettre_au_vote`,
  crée un vote lié (oui/non) + statut `proposee`, sinon `adoptee`.
- `GET /maisons/{id}/regles` (+ résultats de vote si lié) ; `POST /regles/{rid}/adopter` / `/rejeter` (gestion) ;
  `PUT /regles/{rid}` ; `DELETE /regles/{rid}`.
- **Rappel** : rejoindre / être ajouté / être marqué visiteur met `regles_vues_le=NULL` + notification.
  `GET /maisons/{id}/regles/a-lire` → `{doit_lire, regles:[adoptees]}` ; `POST /maisons/{id}/regles/lues` → `regles_vues_le=now`.
  Le mobile affiche une modale de rappel à la connexion tant que `doit_lire`.

## Tâches domestiques — `taches` (+ `tache_validations`)
taches(id, maison_id, titre, description?, piece_id?, frequence ∈ ponctuel|quotidien|hebdo|mensuel,
assignation ∈ fixe|rotation, assigne_id?, rotation_ordre json?, rotation_index int, rotation_conditions text?,
gage_actif bool, penalite?, recompense?, points_penalite int, points_recompense int,
echeance_date date?, echeance_heure str?, statut ∈ a_faire|fait, prochaine_echeance timestamp?, createur_id, date_creation)
tache_validations(id, tache_id, utilisateur_id, periode_cle str, date_creation)
- **Titulaire courant** = `assigne_id` (fixe) ou `rotation_ordre[rotation_index]` (rotation) → réponse expose `titulaire {id,nom,image}` + `fait_aujourdhui`.
- Tâches du jour visibles par TOUS avec le nom du titulaire ; seul le titulaire (ou la gestion) **valide**.
- `POST /taches/{tid}/valider` → validation période courante (statut `fait`) + **récompense** (gage) au titulaire ;
  si récurrente/rotation, programme la période suivante (échéance selon `frequence`, avance rotation, statut `a_faire`).
- **Auto-gage/routine** : au `GET /maisons/{id}/taches`, toute tâche dont `prochaine_echeance` est dépassée et non validée
  applique la **pénalité** (gage) au titulaire, notifie, puis programme la suite (régénère / passe au suivant). Écrit dans `points_log`.
- Endpoints : `GET /maisons/{id}/taches`, `POST /maisons/{id}/taches` (gestion), `GET /taches/{tid}`, `PUT /taches/{tid}`, `DELETE /taches/{tid}`, `POST /taches/{tid}/valider`.

## Activités = sociales à participants (extension)
- `activites.visibilite` ∈ `maison|participants` (défaut `maison`) + table `activite_participants(activite_id, utilisateur_id)`.
  Si `participants`, SEULS les participants (+ créateur) voient l'activité et reçoivent les notifications.
- `GET /maisons/{id}/activites` filtre : `visibilite=maison` OU appelant participant/créateur. `POST`/`PUT` acceptent `participants:[user_id]` et `visibilite`. Réponse expose `participants`.

## Mobile v4 (UI)
- **Écran maison** : bloc **Logement** (type + adresse complète / infos appartement : étage, n°, digicode, interphone, accès) éditable par la gestion ; section **Pièces** (liste, type, membre affecté) ; rôles étendus (co-chef, chef temporaire + expiration, visiteur, lien familial) + transfert de chef.
- **Portefeuille immobilier** (chef, depuis « Plus ») : cartes des maisons possédées (adresse, pièces, membres, surface).
- **Onglet/section Tâches** (distinct des Activités) : tâches **du jour** avec nom du titulaire + **case à cocher** pour valider (titulaire/gestion) ; badges gage/rotation/fréquence ; création (fréquence, fixe/rotation + conditions, gage, pièce liée).
- **Activités** : choix **visibilité** (toute la maison / participants) + liste de **participants** ; n'affiche que les activités visibles pour l'utilisateur.
- **Règles** (« Plus »/écran maison) : liste (adoptées / en vote), proposer une règle (gestion, éventuellement au vote) ; **modale de rappel des règles** à la connexion tant que non lues (« J'ai lu les règles »).
- **Visiteur** : bandeau « Visiteur » + lecture seule centrée sur les règles/le fonctionnement.
- i18n FR/EN + mode sombre appliqués aux nouveaux écrans.
