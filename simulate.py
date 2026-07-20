#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Simulateur d'utilisation FamiLyfe — écrit de vraies données dans l'app via l'API,
comme le feraient de vrais utilisateurs.

Crée 4 foyers couvrant tous les cas (couple marié avec/sans enfants, couple non
marié, colocation) et exerce TOUTES les fonctionnalités : profils, membres et
rôles (chef, co-chef, enfant, visiteur, liens familiaux), pièces, tâches (fixes,
rotation, gage, validées/à faire), activités « à faire ensemble », agenda + RSVP,
votes, règles, dépenses partagées, liste de courses, menu de la semaine,
récompenses/échanges, défis, anniversaires.

Usage :
    BASE_URL=http://localhost:8005 python simulate.py
(défaut : http://localhost:8005)

À la fin, la liste de TOUS les comptes (email + mot de passe) est affichée :
connectez-vous avec n'importe lequel dans l'app pour voir sa vue.
"""
import os
import sys
import time
import json
from datetime import date, datetime, timedelta

import urllib.request
import urllib.parse
import urllib.error

BASE = os.environ.get("BASE_URL", "http://localhost:8005").rstrip("/")
PASSWORD = "Familyfe2026!"
TODAY = date.today()


class Resp:
    """Petite réponse type requests, pour ne dépendre que de la lib standard."""
    def __init__(self, status, body):
        self.status_code = status
        self._body = body or b""

    @property
    def text(self):
        try:
            return self._body.decode("utf-8", "replace")
        except Exception:
            return str(self._body)

    def json(self):
        return json.loads(self._body.decode("utf-8"))

# Journal des comptes créés, pour le récapitulatif final.
ACCOUNTS = []      # (foyer, nom, email, role)
HOUSES = []        # dict par foyer
WARN = []

def log(msg): print(msg, flush=True)
def warn(msg):
    WARN.append(msg); print("  ⚠️  " + msg, flush=True)

def req(method, path, token=None, json_body=None, form=None, retries=5):
    url = BASE + path
    for attempt in range(retries):
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        data = None
        if form is not None:
            data = urllib.parse.urlencode(form).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        elif json_body is not None:
            data = json.dumps(json_body).encode()
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=30) as resp:
                return Resp(resp.status, resp.read())
        except urllib.error.HTTPError as e:
            body = e.read()
            if e.code == 429:
                # Rate limit (ex : 5 signups/minute) : on attend la fenêtre d'1 minute.
                wait = 62 if attempt == 0 else 30
                print(f"    ⏳ rate limit sur {path} — attente {wait}s…", flush=True)
                time.sleep(wait)
                continue
            return Resp(e.code, body)
        except urllib.error.URLError as e:
            print(f"    ❌ Connexion impossible à {url} — {e}. Le backend est-il démarré ?", flush=True)
            return Resp(0, b"")
    return Resp(0, b"")

# ---------------------------------------------------------------- utilisateurs
class User:
    def __init__(self, foyer, nom, email, dob=None, tel=None):
        self.foyer = foyer
        self.nom = nom
        self.email = email
        self.token = None
        self.id = None
        self.dob = dob
        self.tel = tel

def creer_utilisateur(u: User):
    body = {"nom": u.nom, "email": u.email, "password": PASSWORD}
    if u.tel: body["telephone"] = u.tel
    if u.dob: body["date_naissance"] = u.dob
    r = req("POST", "/signup", json_body=body)
    if r.status_code not in (200, 201) and "existe" not in r.text.lower() and "exist" not in r.text.lower():
        warn(f"signup {u.email}: {r.status_code} {r.text[:120]}")
    # login
    r = req("POST", "/token", form={"username": u.email, "password": PASSWORD})
    if r.status_code != 200:
        warn(f"login {u.email}: {r.status_code} {r.text[:120]}")
        return u
    u.token = r.json()["access_token"]
    me = req("GET", "/me", token=u.token)
    if me.status_code == 200:
        u.id = me.json().get("id")
    ACCOUNTS.append((u.foyer, u.nom, u.email, "membre"))
    return u

# ------------------------------------------------------------------ helpers API
def creer_maison(chef: User, nom, emoji, couleur):
    r = req("POST", "/maisons", token=chef.token, json_body={"nom": nom, "emoji": emoji, "couleur": couleur})
    if r.status_code not in (200, 201):
        warn(f"maison {nom}: {r.status_code} {r.text[:150]}"); return None
    return r.json()

def maj_maison(chef, mid, **kw):
    r = req("PUT", f"/maisons/{mid}", token=chef.token, json_body=kw)
    if r.status_code not in (200, 201): warn(f"maj maison {mid}: {r.status_code} {r.text[:120]}")

def ajouter_membre(chef, mid, u: User):
    r = req("POST", f"/maisons/{mid}/membres", token=chef.token, json_body={"utilisateur_id": u.id})
    if r.status_code not in (200, 201): warn(f"add membre {u.nom}: {r.status_code} {r.text[:120]}")

def set_role(chef, mid, uid, role=None, lien=None, enfant=None, expire=None):
    body = {}
    if role is not None: body["role"] = role
    if lien is not None: body["lien_famille"] = lien
    if enfant is not None: body["est_enfant"] = enfant
    if expire is not None: body["expire_le"] = expire
    r = req("POST", f"/maisons/{mid}/membres/{uid}/role", token=chef.token, json_body=body)
    if r.status_code not in (200, 201): warn(f"role uid={uid}: {r.status_code} {r.text[:120]}")

def creer_piece(chef, mid, nom, typ, affecte_a=None):
    r = req("POST", f"/maisons/{mid}/pieces", token=chef.token, json_body={"nom": nom, "type": typ, "affecte_a": affecte_a})
    if r.status_code not in (200, 201): warn(f"piece {nom}: {r.status_code} {r.text[:120]}")
    return r.json() if r.status_code in (200,201) else None

def creer_tache(chef, mid, **kw):
    r = req("POST", f"/maisons/{mid}/taches", token=chef.token, json_body=kw)
    if r.status_code not in (200, 201):
        warn(f"tache {kw.get('titre')}: {r.status_code} {r.text[:150]}"); return None
    return r.json()

def valider_tache(u: User, tid):
    r = req("POST", f"/taches/{tid}/valider", token=u.token)
    if r.status_code not in (200, 201): warn(f"valider tache {tid} par {u.nom}: {r.status_code} {r.text[:120]}")

def creer_activite(chef, mid, **kw):
    r = req("POST", f"/maisons/{mid}/activites", token=chef.token, json_body=kw)
    if r.status_code not in (200, 201): warn(f"activite {kw.get('titre')}: {r.status_code} {r.text[:150]}"); return None
    return r.json()

def set_statut_activite(u, aid, statut):
    r = req("PATCH", f"/activites/{aid}/statut", token=u.token, json_body={"statut": statut})
    if r.status_code not in (200, 201): warn(f"statut activite {aid}: {r.status_code} {r.text[:120]}")

def creer_evenement(chef, mid, **kw):
    r = req("POST", f"/maisons/{mid}/evenements", token=chef.token, json_body=kw)
    if r.status_code not in (200, 201): warn(f"evenement {kw.get('titre')}: {r.status_code} {r.text[:150]}"); return None
    return r.json()

def repondre_evenement(u, eid, reponse):
    r = req("POST", f"/evenements/{eid}/reponse", token=u.token, json_body={"reponse": reponse})
    if r.status_code not in (200, 201): warn(f"rsvp {eid} par {u.nom}: {r.status_code} {r.text[:120]}")

def creer_vote(chef, mid, question, options, description=None):
    r = req("POST", f"/maisons/{mid}/votes", token=chef.token, json_body={"question": question, "options": options, "description": description})
    if r.status_code not in (200, 201): warn(f"vote {question}: {r.status_code} {r.text[:150]}"); return None
    return r.json()

def voter(u, vid, option_id):
    r = req("POST", f"/votes/{vid}/voter", token=u.token, json_body={"option_id": option_id})
    if r.status_code not in (200, 201): warn(f"voter {vid} par {u.nom}: {r.status_code} {r.text[:120]}")

def cloturer_vote(chef, vid):
    r = req("POST", f"/votes/{vid}/cloturer", token=chef.token)
    if r.status_code not in (200, 201): warn(f"cloturer vote {vid}: {r.status_code} {r.text[:120]}")

def creer_regle(chef, mid, titre, contenu, vote=False):
    r = req("POST", f"/maisons/{mid}/regles", token=chef.token, json_body={"titre": titre, "contenu": contenu, "soumettre_au_vote": vote})
    if r.status_code not in (200, 201): warn(f"regle {titre}: {r.status_code} {r.text[:150]}"); return None
    return r.json()

def adopter_regle(chef, rid):
    r = req("POST", f"/regles/{rid}/adopter", token=chef.token)
    if r.status_code not in (200, 201): warn(f"adopter regle {rid}: {r.status_code} {r.text[:120]}")

def creer_depense(u, mid, titre, montant, paye_par=None, participants=None, categorie=None):
    body = {"titre": titre, "montant": montant, "paye_par": paye_par, "participants": participants, "categorie": categorie}
    r = req("POST", f"/maisons/{mid}/depenses", token=u.token, json_body=body)
    if r.status_code not in (200, 201): warn(f"depense {titre}: {r.status_code} {r.text[:150]}"); return None
    return r.json()

def creer_course(u, mid, nom, quantite=None, categorie=None):
    r = req("POST", f"/maisons/{mid}/courses", token=u.token, json_body={"nom": nom, "quantite": quantite, "categorie": categorie})
    if r.status_code not in (200, 201): warn(f"course {nom}: {r.status_code} {r.text[:120]}"); return None
    return r.json()

def cocher_course(u, item_id):
    r = req("PATCH", f"/courses/{item_id}", token=u.token, json_body={"achete": True})
    if r.status_code not in (200, 201): warn(f"cocher course {item_id}: {r.status_code} {r.text[:120]}")

def creer_repas(u, mid, d, moment, titre, notes=None):
    r = req("POST", f"/maisons/{mid}/repas", token=u.token, json_body={"date": d, "moment": moment, "titre": titre, "notes": notes})
    if r.status_code not in (200, 201): warn(f"repas {titre}: {r.status_code} {r.text[:120]}")

def creer_recompense(chef, mid, nom, cout, description=None):
    r = req("POST", f"/maisons/{mid}/boutique", token=chef.token, json_body={"nom": nom, "cout_points": cout, "description": description})
    if r.status_code not in (200, 201): warn(f"recompense {nom}: {r.status_code} {r.text[:120]}"); return None
    return r.json()

def echanger(u, rid):
    r = req("POST", f"/boutique/{rid}/echanger", token=u.token)
    if r.status_code not in (200, 201): warn(f"echanger {rid} par {u.nom}: {r.status_code} {r.text[:120]}"); return None
    return r.json() if r.status_code in (200,201) else None

def valider_echange(chef, eid):
    r = req("POST", f"/echanges/{eid}/valider", token=chef.token)
    if r.status_code not in (200, 201): warn(f"valider echange {eid}: {r.status_code} {r.text[:120]}")

def creer_defi(chef, mid, titre, points, description=None, date_fin=None):
    r = req("POST", f"/maisons/{mid}/defis", token=chef.token, json_body={"titre": titre, "points": points, "description": description, "date_fin": date_fin})
    if r.status_code not in (200, 201): warn(f"defi {titre}: {r.status_code} {r.text[:120]}"); return None
    return r.json()

def rejoindre_defi(u, did):
    r = req("POST", f"/defis/{did}/rejoindre", token=u.token)
    if r.status_code not in (200, 201): warn(f"rejoindre defi {did} par {u.nom}: {r.status_code} {r.text[:120]}")

def terminer_defi(u, did):
    r = req("POST", f"/defis/{did}/terminer", token=u.token)
    if r.status_code not in (200, 201): warn(f"terminer defi {did} par {u.nom}: {r.status_code} {r.text[:120]}")

# --------------------------------------------------------------- utilitaires date
def dob(month, day, year=1988):
    return f"{year:04d}-{month:02d}-{day:02d}"

def dob_today(year=1990):
    return f"{year:04d}-{TODAY.month:02d}-{TODAY.day:02d}"

def iso_at(days_offset, hour=19, minute=0):
    d = datetime(TODAY.year, TODAY.month, TODAY.day) + timedelta(days=days_offset)
    d = d.replace(hour=hour, minute=minute)
    return d.isoformat()

def date_offset(days_offset):
    return (TODAY + timedelta(days=days_offset)).isoformat()

# =============================================================================
#  CONSTRUCTION DES FOYERS
# =============================================================================

def foyer_famille_avec_enfants():
    log("\n🏠 Foyer 1 — Famille (couple marié + 2 enfants)")
    paul   = creer_utilisateur(User("Famille Martin", "Paul Martin",   "paul.martin@sim.familyfe",   dob(3,12,1985), "+33600000101"))
    sophie = creer_utilisateur(User("Famille Martin", "Sophie Martin", "sophie.martin@sim.familyfe", dob_today(1987), "+33600000102"))
    lucas  = creer_utilisateur(User("Famille Martin", "Lucas Martin",  "lucas.martin@sim.familyfe",  dob(9,4,2012),  "+33600000103"))
    emma   = creer_utilisateur(User("Famille Martin", "Emma Martin",   "emma.martin@sim.familyfe",   dob(11,22,2015),"+33600000104"))

    m = creer_maison(paul, "Maison des Martin", "🏡", "#EC5F4E")
    if not m: return
    mid = m["id"]
    maj_maison(paul, mid, type_logement="maison", adresse="14 rue des Lilas", ville="Lyon", code_postal="69003", surface=110)
    for u in (sophie, lucas, emma): ajouter_membre(paul, mid, u)
    set_role(paul, mid, sophie.id, role="co_chef", lien="conjoint")
    set_role(paul, mid, lucas.id, enfant=True, lien="enfant")
    set_role(paul, mid, emma.id,  enfant=True, lien="enfant")
    HOUSES.append({"nom": "Maison des Martin", "type": "maison", "code": m.get("code_invitation"),
                   "membres": [("Paul Martin (chef)", paul.email), ("Sophie Martin (co-chef, conjointe)", sophie.email),
                               ("Lucas Martin (enfant)", lucas.email), ("Emma Martin (enfant)", emma.email)]})

    # Pièces
    creer_piece(paul, mid, "Chambre parentale", "chambre", sophie.id)
    creer_piece(paul, mid, "Chambre de Lucas", "chambre", lucas.id)
    creer_piece(paul, mid, "Salon", "salon")
    cuisine = creer_piece(paul, mid, "Cuisine", "cuisine")
    creer_piece(paul, mid, "Salle de bain", "salle_de_bain")

    # Tâches fixes (assignées), variées, certaines validées
    t1 = creer_tache(paul, mid, titre="Sortir les poubelles", frequence="quotidien", assignation="fixe",
                     assigne_id=lucas.id, gage_actif=True, recompense="30 min d'écran", penalite="Pas de dessert",
                     points_recompense=15, points_penalite=10, echeance_date=date_offset(0), echeance_heure="19:00")
    t2 = creer_tache(paul, mid, titre="Faire la vaisselle du soir", frequence="quotidien", assignation="fixe",
                     assigne_id=sophie.id, gage_actif=True, recompense="Café au lit", points_recompense=10, echeance_date=date_offset(0), echeance_heure="21:00")
    t3 = creer_tache(paul, mid, titre="Passer l'aspirateur au salon", frequence="hebdo", assignation="fixe",
                     assigne_id=paul.id, echeance_jour_semaine=5)
    # Tâche en ROTATION avec gage cumulatif
    t4 = creer_tache(paul, mid, titre="Nettoyer la salle de bain", frequence="hebdo", assignation="rotation",
                     rotation_ordre=[paul.id, sophie.id, lucas.id], gage_actif=True, gage_semaines=2,
                     recompense="Choisir le film du samedi", points_recompense=20, points_penalite=15,
                     echeance_jour_semaine=6)
    t5 = creer_tache(paul, mid, titre="Ranger sa chambre", frequence="hebdo", assignation="fixe", assigne_id=emma.id,
                     gage_actif=True, recompense="Une histoire en plus", points_recompense=10)

    # Validations → génère du « fait », des points, une série (streak)
    if t1: valider_tache(lucas, t1["id"])
    if t2: valider_tache(sophie, t2["id"])
    if t5: valider_tache(emma, t5["id"])

    # Activité « à faire ensemble »
    a1 = creer_activite(paul, mid, titre="Grand ménage de printemps", statut="a_faire",
                        date_echeance=date_offset(3), assignes=[paul.id, sophie.id], points_recompense=25, gage_actif=True, recompense="Resto en famille")
    if a1: set_statut_activite(paul, a1["id"], "en_cours")

    # Agenda + RSVP
    e1 = creer_evenement(paul, mid, titre="Dîner chez Mamie", date_debut=iso_at(2, 19, 30), lieu="Chez Mamie", description="Apporter le dessert")
    e2 = creer_evenement(paul, mid, titre="Anniversaire d'Emma 🎂", date_debut=iso_at(10, 0), toute_la_journee=True)
    if e1:
        repondre_evenement(sophie, e1["id"], "oui"); repondre_evenement(lucas, e1["id"], "oui"); repondre_evenement(emma, e1["id"], "peut_etre")

    # Votes
    v1 = creer_vote(paul, mid, "Destination des vacances d'été ?", ["Bord de mer", "Montagne", "Camping"], "On décide ensemble !")
    if v1 and v1.get("options"):
        opts = v1["options"]
        voter(paul, v1["id"], opts[0]["id"]); voter(sophie, v1["id"], opts[0]["id"]); voter(lucas, v1["id"], opts[2]["id"]); voter(emma, v1["id"], opts[1]["id"])

    # Règles
    r1 = creer_regle(paul, mid, "Écrans", "Pas d'écran pendant les repas.")
    if r1: adopter_regle(paul, r1["id"])
    creer_regle(paul, mid, "Devoirs", "Devoirs faits avant de jouer.", vote=True)

    # Dépenses partagées
    creer_depense(paul, mid, "Courses Carrefour", 128.40, paye_par=paul.id, participants=[paul.id, sophie.id], categorie="Alimentation")
    creer_depense(sophie, mid, "Cantine scolaire", 84.00, paye_par=sophie.id, participants=[paul.id, sophie.id])
    creer_depense(paul, mid, "Sortie cinéma", 42.00, paye_par=paul.id, participants=[paul.id, sophie.id, lucas.id, emma.id], categorie="Loisirs")

    # Courses
    for nom, qt, cat in [("Lait", "2L", "Frais"), ("Pain", None, "Boulangerie"), ("Pommes", "1kg", "Fruits"), ("Lessive", None, "Ménage")]:
        it = creer_course(paul, mid, nom, qt, cat)
    it = creer_course(sophie, mid, "Yaourts", "x8", "Frais")
    if it: cocher_course(sophie, it["id"])

    # Menu de la semaine
    creer_repas(sophie, mid, date_offset(0), "soir", "Gratin de courgettes")
    creer_repas(sophie, mid, date_offset(1), "midi", "Pâtes bolognaise")
    creer_repas(paul, mid, date_offset(1), "soir", "Poulet rôti", "Avec des frites maison")

    # Boutique + échange + validation
    creer_recompense(paul, mid, "Soirée pizza + film", 50, "Le vainqueur choisit le film")
    rec_game = creer_recompense(paul, mid, "1h de jeu vidéo bonus", 15)
    if rec_game:
        ech = echanger(lucas, rec_game["id"])  # Lucas a 15 pts via t1 (gage)
        if ech and ech.get("id"): valider_echange(paul, ech["id"])

    # Défis
    d1 = creer_defi(paul, mid, "Une semaine sans se disputer 🕊️", 40, "Toute la famille", date_offset(7))
    if d1:
        rejoindre_defi(sophie, d1["id"]); rejoindre_defi(lucas, d1["id"]); terminer_defi(sophie, d1["id"])
    log("   ✔ Foyer 1 construit")

def foyer_couple_non_marie():
    log("\n🏠 Foyer 2 — Couple non marié, sans enfant (appartement)")
    lea = creer_utilisateur(User("Léa & Tom", "Léa Dubois", "lea.dubois@sim.familyfe", dob(6,18,1994), "+33600000201"))
    tom = creer_utilisateur(User("Léa & Tom", "Tom Bernard", "tom.bernard@sim.familyfe", dob_today(1992), "+33600000202"))
    m = creer_maison(lea, "Chez Léa & Tom", "💜", "#6B4460")
    if not m: return
    mid = m["id"]
    maj_maison(lea, mid, type_logement="appartement", ville="Paris", code_postal="75011", surface=52, etage="3", digicode="A1234")
    ajouter_membre(lea, mid, tom)
    set_role(lea, mid, tom.id, lien="conjoint")  # conjoint, pas marié → juste le lien
    HOUSES.append({"nom": "Chez Léa & Tom", "type": "appartement", "code": m.get("code_invitation"),
                   "membres": [("Léa Dubois (chef)", lea.email), ("Tom Bernard (conjoint)", tom.email)]})

    creer_piece(lea, mid, "Chambre", "chambre")
    creer_piece(lea, mid, "Salon", "salon")
    creer_piece(lea, mid, "Cuisine", "cuisine")

    # Rotation stricte à 2 sur le ménage
    t1 = creer_tache(lea, mid, titre="Ménage complet", frequence="hebdo", assignation="rotation",
                     rotation_ordre=[lea.id, tom.id], gage_actif=True, gage_semaines=1, points_recompense=20, echeance_jour_semaine=6)
    t2 = creer_tache(lea, mid, titre="Vider le lave-vaisselle", frequence="quotidien", assignation="fixe",
                     assigne_id=tom.id, gage_actif=True, recompense="Choix de la série", points_recompense=8, echeance_date=date_offset(0))
    t3 = creer_tache(lea, mid, titre="Arroser les plantes", frequence="hebdo", assignation="fixe", assigne_id=lea.id, gage_actif=True, points_recompense=5)
    if t2: valider_tache(tom, t2["id"])
    if t3: valider_tache(lea, t3["id"])

    e1 = creer_evenement(lea, mid, titre="Brunch dominical", date_debut=iso_at(1, 11, 0), lieu="Café de Flore")
    if e1: repondre_evenement(tom, e1["id"], "oui")
    creer_evenement(lea, mid, titre="Ciné : nouveau film", date_debut=iso_at(4, 20, 30))

    v1 = creer_vote(lea, mid, "On adopte un chat ? 🐱", ["Oui, un chaton", "Plutôt un chien", "Pas d'animal pour l'instant"])
    if v1 and v1.get("options"):
        voter(lea, v1["id"], v1["options"][0]["id"]); voter(tom, v1["id"], v1["options"][2]["id"])

    creer_depense(lea, mid, "Loyer (part commune)", 900.00, paye_par=lea.id, participants=[lea.id, tom.id], categorie="Logement")
    creer_depense(tom, mid, "Courses de la semaine", 76.30, paye_par=tom.id, participants=[lea.id, tom.id])
    creer_depense(lea, mid, "Électricité", 61.00, paye_par=lea.id, participants=[lea.id, tom.id])

    creer_course(lea, mid, "Café", None, "Épicerie")
    creer_course(tom, mid, "Bière", "x6", "Boissons")
    creer_repas(lea, mid, date_offset(0), "soir", "Risotto aux champignons")

    r1 = creer_regle(lea, mid, "Vaisselle", "Celui qui cuisine ne fait pas la vaisselle.")
    if r1: adopter_regle(lea, r1["id"])
    log("   ✔ Foyer 2 construit")

def foyer_colocation():
    log("\n🏠 Foyer 3 — Colocation (4 colocataires)")
    marc  = creer_utilisateur(User("Coloc Rivoli", "Marc Petit",  "marc.petit@sim.familyfe",  dob(1,30,1998), "+33600000301"))
    julie = creer_utilisateur(User("Coloc Rivoli", "Julie Roche", "julie.roche@sim.familyfe", dob(7,9,1999),  "+33600000302"))
    karim = creer_utilisateur(User("Coloc Rivoli", "Karim Aziz",  "karim.aziz@sim.familyfe",  dob_today(1997), "+33600000303"))
    nadia = creer_utilisateur(User("Coloc Rivoli", "Nadia Sow",   "nadia.sow@sim.familyfe",   dob(4,2,2000),  "+33600000304"))
    m = creer_maison(marc, "Coloc du 12 Rivoli", "🏢", "#3E9A9E")
    if not m: return
    mid = m["id"]
    maj_maison(marc, mid, type_logement="appartement", adresse="12 rue de Rivoli", ville="Paris", code_postal="75004", surface=95, etage="4", interphone="PETIT")
    for u in (julie, karim, nadia): ajouter_membre(marc, mid, u)
    set_role(marc, mid, julie.id, role="co_chef")  # co-chef, pas de lien familial (coloc)
    HOUSES.append({"nom": "Coloc du 12 Rivoli", "type": "appartement", "code": m.get("code_invitation"),
                   "membres": [("Marc Petit (chef)", marc.email), ("Julie Roche (co-chef)", julie.email),
                               ("Karim Aziz", karim.email), ("Nadia Sow", nadia.email)]})

    creer_piece(marc, mid, "Chambre 1", "chambre", marc.id)
    creer_piece(marc, mid, "Chambre 2", "chambre", julie.id)
    creer_piece(marc, mid, "Chambre 3", "chambre", karim.id)
    creer_piece(marc, mid, "Chambre 4", "chambre", nadia.id)
    creer_piece(marc, mid, "Cuisine commune", "cuisine")
    creer_piece(marc, mid, "Salon", "salon")

    # Rotation du ménage entre les 4 + gage argent (amende)
    t1 = creer_tache(marc, mid, titre="Ménage des parties communes", frequence="hebdo", assignation="rotation",
                     rotation_ordre=[marc.id, julie.id, karim.id, nadia.id], gage_actif=True, gage_semaines=1,
                     points_recompense=15, points_penalite=10,
                     gage_effets_echec=[{"type": "amende", "montant": 5}], echeance_jour_semaine=0)
    t2 = creer_tache(marc, mid, titre="Sortir les poubelles", frequence="hebdo", assignation="rotation",
                     rotation_ordre=[karim.id, nadia.id, marc.id, julie.id], points_recompense=8, echeance_jour_semaine=3)
    t3 = creer_tache(marc, mid, titre="Nettoyer la cuisine", frequence="quotidien", assignation="fixe", assigne_id=julie.id, gage_actif=True, recompense="Petit-déj préparé", points_recompense=15, echeance_date=date_offset(0))
    t4 = creer_tache(marc, mid, titre="Courses communes", frequence="hebdo", assignation="fixe", assigne_id=nadia.id, points_recompense=12)
    if t3: valider_tache(julie, t3["id"])
    if t1: valider_tache(marc, t1["id"])

    # Visiteur temporaire (un ami de passage) — 5e compte, rôle visiteur
    invite = creer_utilisateur(User("Coloc Rivoli", "Hugo (invité)", "hugo.invite@sim.familyfe", dob(2,14,1996)))
    ajouter_membre(marc, mid, invite)
    set_role(marc, mid, invite.id, role="visiteur", expire=iso_at(7, 12, 0))
    HOUSES[-1]["membres"].append(("Hugo (visiteur temporaire)", invite.email))

    # Dépenses de coloc (bilan « qui doit qui »)
    creer_depense(marc, mid, "Loyer total", 1600.00, paye_par=marc.id, participants=[marc.id, julie.id, karim.id, nadia.id], categorie="Logement")
    creer_depense(karim, mid, "Internet + électricité", 120.00, paye_par=karim.id, participants=[marc.id, julie.id, karim.id, nadia.id])
    creer_depense(nadia, mid, "Courses communes", 88.60, paye_par=nadia.id, participants=[marc.id, julie.id, karim.id, nadia.id], categorie="Alimentation")
    creer_depense(julie, mid, "Produits ménagers", 24.90, paye_par=julie.id, participants=[marc.id, julie.id, karim.id, nadia.id])

    # Votes de coloc
    v1 = creer_vote(marc, mid, "Soirée coloc ce week-end ?", ["Samedi soir", "Dimanche midi", "On zappe cette semaine"])
    if v1 and v1.get("options"):
        for u, i in [(marc,0),(julie,0),(karim,1),(nadia,0)]:
            voter(u, v1["id"], v1["options"][i]["id"])
    v2 = creer_vote(marc, mid, "Qui prend la grande chambre l'an prochain ?", ["Tirage au sort", "Au plus ancien", "On garde nos chambres"])
    if v2: cloturer_vote(marc, v2["id"])

    # Règles de coloc
    r1 = creer_regle(marc, mid, "Invités", "Prévenir le groupe avant d'inviter quelqu'un à dormir.")
    if r1: adopter_regle(marc, r1["id"])
    r2 = creer_regle(marc, mid, "Frigo", "On ne touche pas à la nourriture des autres 😤", vote=True)

    # Courses + menu + boutique + défis
    for nom, cat in [("Papier toilette", "Ménage"), ("Café", "Épicerie"), ("Pâtes", "Épicerie"), ("Éponges", "Ménage")]:
        creer_course(marc, mid, nom, None, cat)
    creer_repas(nadia, mid, date_offset(0), "soir", "Tacos party 🌮")
    creer_recompense(marc, mid, "Dispensé de ménage 1 semaine", 60)
    rec_cheap = creer_recompense(marc, mid, "Choisir le resto du vendredi", 15)
    if rec_cheap:
        ech = echanger(julie, rec_cheap["id"])  # Julie a 15 pts via t3 (gage)
        if ech and ech.get("id"): valider_echange(marc, ech["id"])
    d1 = creer_defi(marc, mid, "Zéro vaisselle sale dans l'évier pendant 5 jours", 30, None, date_offset(5))
    if d1:
        rejoindre_defi(karim, d1["id"]); rejoindre_defi(nadia, d1["id"])

    # Agenda
    creer_evenement(marc, mid, titre="Apéro coloc 🍻", date_debut=iso_at(3, 20, 0), lieu="Salon")
    log("   ✔ Foyer 3 construit")

def foyer_couple_marie_sans_enfant():
    log("\n🏠 Foyer 4 — Couple marié sans enfant (maison)")
    anto  = creer_utilisateur(User("Villa Rossi", "Antonio Rossi", "antonio.rossi@sim.familyfe", dob(8,8,1983), "+33600000401"))
    chiara= creer_utilisateur(User("Villa Rossi", "Chiara Rossi", "chiara.rossi@sim.familyfe", dob(12,1,1986), "+33600000402"))
    m = creer_maison(anto, "Villa Rossi", "🏠", "#DB8A57")
    if not m: return
    mid = m["id"]
    maj_maison(anto, mid, type_logement="maison", adresse="7 chemin des Oliviers", ville="Nice", code_postal="06000", surface=140)
    ajouter_membre(anto, mid, chiara)
    set_role(anto, mid, chiara.id, role="co_chef", lien="conjoint")
    HOUSES.append({"nom": "Villa Rossi", "type": "maison", "code": m.get("code_invitation"),
                   "membres": [("Antonio Rossi (chef)", anto.email), ("Chiara Rossi (co-chef, conjointe)", chiara.email)]})

    creer_piece(anto, mid, "Chambre", "chambre")
    creer_piece(anto, mid, "Bureau", "bureau", anto.id)
    creer_piece(anto, mid, "Jardin", "autre")
    creer_piece(anto, mid, "Garage", "garage", anto.id)

    t1 = creer_tache(anto, mid, titre="Tondre la pelouse", frequence="hebdo", assignation="fixe", assigne_id=anto.id, points_recompense=15, echeance_jour_semaine=5)
    t2 = creer_tache(anto, mid, titre="Nettoyer la cuisine", frequence="quotidien", assignation="rotation",
                     rotation_ordre=[anto.id, chiara.id], gage_actif=True, points_recompense=8, echeance_date=date_offset(0))
    t3 = creer_tache(anto, mid, titre="Faire les vitres", frequence="mensuel", assignation="fixe", assigne_id=chiara.id, points_recompense=20)
    if t2: valider_tache(anto, t2["id"])

    creer_evenement(anto, mid, titre="Dîner anniversaire de mariage 💍", date_debut=iso_at(6, 20, 0), lieu="Restaurant La Terrasse")
    v1 = creer_vote(anto, mid, "Travaux : on refait la cuisine cette année ?", ["Oui, cet automne", "L'an prochain", "On garde comme ça"])
    if v1 and v1.get("options"):
        voter(anto, v1["id"], v1["options"][0]["id"]); voter(chiara, v1["id"], v1["options"][1]["id"])
    creer_depense(anto, mid, "Jardinier", 150.00, paye_par=anto.id, participants=[anto.id, chiara.id], categorie="Maison")
    creer_depense(chiara, mid, "Restaurant", 92.00, paye_par=chiara.id, participants=[anto.id, chiara.id], categorie="Loisirs")
    creer_repas(chiara, mid, date_offset(0), "soir", "Osso buco")
    r1 = creer_regle(anto, mid, "Jardin", "Arroser le jardin uniquement le soir en été.")
    if r1: adopter_regle(anto, r1["id"])
    log("   ✔ Foyer 4 construit")

def main():
    log(f"=== Simulateur FamiLyfe → {BASE} ===")
    h = req("GET", "/health")
    if h.status_code != 200:
        log(f"❌ Backend injoignable sur {BASE} (health {h.status_code}). Lancez le backend puis réessayez."); sys.exit(1)
    foyer_famille_avec_enfants()
    foyer_couple_non_marie()
    foyer_colocation()
    foyer_couple_marie_sans_enfant()

    # -------------------------------------------------- récapitulatif des comptes
    log("\n" + "=" * 70)
    log("✅ SIMULATION TERMINÉE — comptes créés (mot de passe commun : " + PASSWORD + ")")
    log("=" * 70)
    for house in HOUSES:
        code = f"  ·  code d'invitation : {house['code']}" if house.get("code") else ""
        log(f"\n🏠 {house['nom']}  ({house['type']}){code}")
        for nom, email in house["membres"]:
            log(f"     • {nom:42}  {email}")
    log(f"\nTotal : {len(ACCOUNTS)} comptes, {len(HOUSES)} foyers.")
    if WARN:
        log(f"\n⚠️  {len(WARN)} avertissement(s) pendant la simulation (voir ci-dessus).")
    else:
        log("\n✨ Aucun avertissement — toutes les opérations ont réussi.")
    # Écrit aussi le récap en JSON pour réutilisation.
    with open("comptes_simulation.json", "w", encoding="utf-8") as f:
        json.dump({"password": PASSWORD, "foyers": HOUSES}, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
