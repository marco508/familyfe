"""Smoke test ANNEXE V8 — couverture des notifications + préférences par catégorie.

Ce que ce fichier verrouille :
  1. les 5 routeurs autrefois muets (maisons, depenses, courses, repas, pieces)
     émettent bien leur notification ;
  2. l'auteur d'une action n'est JAMAIS notifié de sa propre action ;
  3. le chat émet `type="chat"` (et non plus `type="activite"`) ;
  4. une catégorie désactivée bloque réellement, les autres continuent de passer ;
  5. `[]` réactive tout ; une catégorie inconnue → 400 ;
  6. migration : sur une base existante, la colonne apparaît à '' (tout activé).

Note d'exécution : `httpx.ASGITransport` ne joue PAS le lifespan de FastAPI. On
crée donc les tables et on ouvre la connexion à la main. `pytest-asyncio` n'étant
pas installé, chaque test est synchrone et pilote sa propre boucle via
`asyncio.run` — d'où le connect/disconnect encadrant CHAQUE test : une connexion
aiosqlite est liée à sa boucle, la réutiliser d'une boucle à l'autre casse.
"""
import asyncio
import uuid
from datetime import date

import httpx
from sqlalchemy import create_engine, inspect, text

import app.main as app_main
from app.database.database import database, engine, metadata
from app.main import app
from app.services import notifications as notif_service


# ==================== Tuyauterie ====================

async def _drain_push() -> None:
    """Attend les tâches push détachées (fire-and-forget) avant de fermer la base.

    Sans ça, `envoyer_push` peut encore requêter une base déconnectée pendant que
    la boucle se ferme : bruit de logs et flakiness. En test les comptes n'ont pas
    de `push_token`, la tâche sort donc immédiatement.
    """
    tasks = list(notif_service._background_tasks)
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


def run_scenario(scenario) -> None:
    """Joue `scenario(ac)` avec une app câblée sur une base prête."""
    metadata.create_all(engine)
    app_main._ensure_columns()

    async def _main():
        await database.connect()
        try:
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
                await scenario(ac)
            await _drain_push()
        finally:
            await database.disconnect()

    asyncio.run(_main())


async def _compte(ac, nom: str) -> dict:
    """Crée un compte et renvoie {headers, id, nom}."""
    email = f"{nom.lower()}-{uuid.uuid4().hex[:8]}@test.local"
    r = await ac.post("/signup", json={"nom": nom, "email": email, "password": "motdepasse8"})
    assert r.status_code == 201, r.text
    r = await ac.post("/token", data={"username": email, "password": "motdepasse8"})
    assert r.status_code == 200, r.text
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    me = (await ac.get("/me", headers=headers)).json()
    return {"headers": headers, "id": me["id"], "nom": nom, "me": me}


async def _notifs(ac, compte: dict, type_: str = None) -> list:
    r = await ac.get("/notifications", headers=compte["headers"], params={"limit": 200})
    assert r.status_code == 200, r.text
    return [n for n in r.json() if type_ is None or n["type"] == type_]


async def _foyer(ac):
    """Alice (chef) + Bob (membre ayant rejoint). Renvoie (alice, bob, maison)."""
    alice = await _compte(ac, "Alice")
    r = await ac.post("/maisons", json={"nom": "Le Nid"}, headers=alice["headers"])
    assert r.status_code == 201, r.text
    maison = r.json()

    bob = await _compte(ac, "Bob")
    r = await ac.post(
        "/maisons/join",
        json={"code_invitation": maison["code_invitation"]},
        headers=bob["headers"],
    )
    assert r.status_code == 200, r.text
    return alice, bob, maison


# ==================== 1 & 2 — Les 5 trous comblés, sans notifier l'auteur ====================

def test_membre_rejoint_notifie_les_autres_pas_larrivant():
    async def scenario(ac):
        alice, bob, maison = await _foyer(ac)

        recues = await _notifs(ac, alice, "maison")
        assert len(recues) == 1, "Alice doit apprendre que Bob a rejoint le foyer"
        assert "Bob" in recues[0]["message"]

        # L'arrivant n'a pas à apprendre sa propre arrivée.
        assert await _notifs(ac, bob, "maison") == []

    run_scenario(scenario)


def test_depense_notifie_les_participants_avec_montant_et_payeur():
    async def scenario(ac):
        alice, bob, maison = await _foyer(ac)

        r = await ac.post(
            f"/maisons/{maison['id']}/depenses",
            json={"titre": "Courses Lidl", "montant": 12.5, "participants": [alice["id"], bob["id"]]},
            headers=alice["headers"],
        )
        assert r.status_code == 201, r.text

        recues = await _notifs(ac, bob, "depense")
        assert len(recues) == 1
        # Le montant ET le payeur sont dans le message : décider sans ouvrir l'app.
        assert "12.50" in recues[0]["message"]
        assert "Alice" in recues[0]["message"]

        assert await _notifs(ac, alice, "depense") == [], "l'auteur ne se notifie pas"

    run_scenario(scenario)


def test_course_notifie_une_seule_fois_par_jour_et_par_auteur():
    async def scenario(ac):
        alice, bob, maison = await _foyer(ac)

        for article in ("Lait", "Pain", "Œufs"):
            r = await ac.post(
                f"/maisons/{maison['id']}/courses",
                json={"nom": article},
                headers=bob["headers"],
            )
            assert r.status_code == 201, r.text

        # ANTI-SPAM : 3 articles ajoutés par Bob → 1 seule notification pour
        # Alice (clé d'idempotence jour+auteur+maison), pas 3.
        recues = await _notifs(ac, alice, "course")
        assert len(recues) == 1, f"anti-spam cassé : {len(recues)} notifications pour 3 articles"
        assert "Lait" in recues[0]["message"]

        assert await _notifs(ac, bob, "course") == [], "l'auteur ne se notifie pas"

        # Un AUTRE auteur le même jour = une autre information = une notification.
        r = await ac.post(
            f"/maisons/{maison['id']}/courses", json={"nom": "Café"}, headers=alice["headers"]
        )
        assert r.status_code == 201, r.text
        assert len(await _notifs(ac, bob, "course")) == 1

    run_scenario(scenario)


def test_repas_planifie_notifie_le_foyer():
    async def scenario(ac):
        alice, bob, maison = await _foyer(ac)

        r = await ac.post(
            f"/maisons/{maison['id']}/repas",
            json={"date": str(date.today()), "moment": "soir", "titre": "Raclette"},
            headers=alice["headers"],
        )
        assert r.status_code == 201, r.text

        recues = await _notifs(ac, bob, "repas")
        assert len(recues) == 1
        assert "Raclette" in recues[0]["message"]

        assert await _notifs(ac, alice, "repas") == [], "l'auteur ne se notifie pas"

    run_scenario(scenario)


def test_piece_affectee_notifie_le_seul_interesse():
    async def scenario(ac):
        alice, bob, maison = await _foyer(ac)

        r = await ac.post(
            f"/maisons/{maison['id']}/pieces",
            json={"nom": "Garage", "type": "garage"},
            headers=alice["headers"],
        )
        assert r.status_code == 201, r.text
        piece_id = r.json()["id"]

        r = await ac.post(
            f"/pieces/{piece_id}/affecter",
            json={"utilisateur_id": bob["id"]},
            headers=alice["headers"],
        )
        assert r.status_code == 200, r.text

        recues = await _notifs(ac, bob, "piece")
        assert len(recues) == 1
        assert "Garage" in recues[0]["message"]

        assert await _notifs(ac, alice, "piece") == [], "l'auteur ne se notifie pas"

    run_scenario(scenario)


def test_role_change_et_transfert_de_chef():
    async def scenario(ac):
        alice, bob, maison = await _foyer(ac)

        # Changement de rôle : seul l'intéressé est prévenu.
        r = await ac.post(
            f"/maisons/{maison['id']}/membres/{bob['id']}/role",
            json={"role": "co_chef"},
            headers=alice["headers"],
        )
        assert r.status_code == 200, r.text
        roles = [n for n in await _notifs(ac, bob, "maison") if "rôle" in n["titre"]]
        assert len(roles) == 1
        assert "co-chef" in roles[0]["message"], "libellé lisible attendu, pas 'co_chef'"

        # Transfert de chef : TOUT le foyer est prévenu (ici : le nouveau chef).
        r = await ac.post(
            f"/maisons/{maison['id']}/transferer-chef",
            json={"utilisateur_id": bob["id"]},
            headers=alice["headers"],
        )
        assert r.status_code == 200, r.text
        chefs = [n for n in await _notifs(ac, bob, "maison") if "chef" in n["titre"].lower()]
        assert len(chefs) == 1
        assert "Bob" in chefs[0]["message"]

        # L'ancien chef, auteur du transfert, ne se notifie pas lui-même.
        assert [n for n in await _notifs(ac, alice, "maison") if "chef" in n["titre"].lower()] == []

    run_scenario(scenario)


# ==================== 3 — Le chat est du chat, pas une « activité » ====================

def test_commentaire_emet_type_chat_et_non_activite():
    async def scenario(ac):
        alice, bob, maison = await _foyer(ac)

        r = await ac.post(
            f"/maisons/{maison['id']}/activites",
            json={"titre": "Restau japonais", "assignes": [bob["id"]]},
            headers=alice["headers"],
        )
        assert r.status_code == 201, r.text
        activite_id = r.json()["id"]

        r = await ac.post(
            f"/activites/{activite_id}/commentaires",
            json={"contenu": "On réserve pour 20h ?"},
            headers=alice["headers"],
        )
        assert r.status_code == 201, r.text

        chat = await _notifs(ac, bob, "chat")
        assert len(chat) == 1, "le commentaire doit émettre type='chat'"
        assert "Restau japonais" in chat[0]["message"]

        # Le bug historique : le commentaire était étiqueté 'activite'. Seule la
        # notification de création d'activité a le droit de porter ce type.
        activites = await _notifs(ac, bob, "activite")
        assert all("commentaire" not in n["titre"].lower() for n in activites)

    run_scenario(scenario)


# ==================== 4 & 5 — Préférences par catégorie ====================

def test_categorie_desactivee_bloque_et_les_autres_passent():
    async def scenario(ac):
        alice, bob, maison = await _foyer(ac)

        # Bob coupe « courses » (couvre les types `course` ET `repas`).
        r = await ac.put(
            "/me/notifications", json={"desactivees": ["courses"]}, headers=bob["headers"]
        )
        assert r.status_code == 200, r.text
        assert r.json() == {"desactivees": ["courses"]}

        # GET /me expose une LISTE, pas la chaîne CSV.
        me = (await ac.get("/me", headers=bob["headers"])).json()
        assert me["notif_desactivees"] == ["courses"]

        await ac.post(
            f"/maisons/{maison['id']}/repas",
            json={"date": str(date.today()), "moment": "midi", "titre": "Pâtes"},
            headers=alice["headers"],
        )
        await ac.post(
            f"/maisons/{maison['id']}/courses", json={"nom": "Lait"}, headers=alice["headers"]
        )
        assert await _notifs(ac, bob, "repas") == [], "catégorie courses coupée → repas bloqué"
        assert await _notifs(ac, bob, "course") == [], "catégorie courses coupée → course bloquée"

        # Les autres catégories continuent de passer : couper n'est pas tout couper.
        await ac.post(
            f"/maisons/{maison['id']}/depenses",
            json={"titre": "Essence", "montant": 40, "participants": [alice["id"], bob["id"]]},
            headers=alice["headers"],
        )
        assert len(await _notifs(ac, bob, "depense")) == 1

        # Alice, qui n'a rien coupé, reçoit tout normalement.
        assert len(await _notifs(ac, alice, "maison")) == 1

    run_scenario(scenario)


def test_liste_vide_reactive_tout_et_categorie_inconnue_est_refusee():
    async def scenario(ac):
        alice, bob, maison = await _foyer(ac)

        await ac.put("/me/notifications", json={"desactivees": ["courses"]}, headers=bob["headers"])
        await ac.post(
            f"/maisons/{maison['id']}/repas",
            json={"date": str(date.today()), "moment": "midi", "titre": "Soupe"},
            headers=alice["headers"],
        )
        assert await _notifs(ac, bob, "repas") == []

        # `[]` est un choix légitime (« je veux tout recevoir »), pas un no-op.
        r = await ac.put("/me/notifications", json={"desactivees": []}, headers=bob["headers"])
        assert r.status_code == 200, r.text
        assert r.json() == {"desactivees": []}

        await ac.post(
            f"/maisons/{maison['id']}/repas",
            json={"date": str(date.today()), "moment": "soir", "titre": "Gratin"},
            headers=alice["headers"],
        )
        recues = await _notifs(ac, bob, "repas")
        assert len(recues) == 1, "tout réactiver doit vraiment tout réactiver"
        assert "Gratin" in recues[0]["message"]

        # Catégorie inconnue → 400 (et non une préférence fantôme en base).
        r = await ac.put(
            "/me/notifications", json={"desactivees": ["licorne"]}, headers=bob["headers"]
        )
        assert r.status_code == 400, r.text
        me = (await ac.get("/me", headers=bob["headers"])).json()
        assert me["notif_desactivees"] == [], "un refus ne doit rien écrire"

        # Champ absent ≠ liste vide : c'est une requête malformée.
        r = await ac.put("/me/notifications", json={}, headers=bob["headers"])
        assert r.status_code == 400, r.text

    run_scenario(scenario)


def test_par_defaut_aucune_categorie_desactivee():
    async def scenario(ac):
        alice = await _compte(ac, "Alice")
        assert alice["me"]["notif_desactivees"] == [], "défaut = tout activé"

        r = await ac.get("/me/notifications", headers=alice["headers"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["desactivees"] == []
        # Le serveur expose la taxonomie : le client n'a pas à la coder en dur.
        assert body["categories"] == [
            "corvees", "sorties", "decisions", "depenses", "courses", "chat", "jeu", "foyer",
        ]

    run_scenario(scenario)


def test_tout_type_emis_est_rattache_a_une_categorie():
    """Garde-fou : un `type` non mappé échapperait silencieusement aux
    préférences (l'utilisateur coupe, et reçoit quand même)."""
    for type_, categorie in notif_service.CATEGORIE_PAR_TYPE.items():
        assert categorie in notif_service.CATEGORIES, f"{type_} → catégorie inconnue {categorie}"

    # La distinction métier qui a motivé toute cette tâche.
    assert notif_service.CATEGORIE_PAR_TYPE["tache"] == "corvees", "une tâche est une corvée"
    assert notif_service.CATEGORIE_PAR_TYPE["activite"] == "sorties", "une activité est une sortie"
    assert notif_service.CATEGORIE_PAR_TYPE["chat"] == "chat"


# ==================== 6 — Migration d'une base existante ====================

def test_migration_ajoute_la_colonne_a_vide_sur_base_existante(tmp_path, monkeypatch):
    """Une base d'AVANT la V8 : la colonne doit apparaître et valoir '' pour les
    comptes déjà là — personne ne perd de notification à la migration."""
    db_file = tmp_path / "legacy.db"
    legacy = create_engine(f"sqlite:///{db_file}")
    with legacy.begin() as conn:
        # Schéma d'époque : PAS de notif_desactivees.
        conn.execute(
            text(
                "CREATE TABLE utilisateurs ("
                " id INTEGER PRIMARY KEY, nom VARCHAR, email VARCHAR,"
                " mot_de_passe_hash VARCHAR, token_version INTEGER NOT NULL DEFAULT 0)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO utilisateurs (nom, email, mot_de_passe_hash)"
                " VALUES ('Ancien', 'ancien@test.local', 'x')"
            )
        )

    cols_avant = {c["name"] for c in inspect(legacy).get_columns("utilisateurs")}
    assert "notif_desactivees" not in cols_avant

    # `_ensure_columns` lit le moteur du module : on le pointe sur la base d'époque.
    monkeypatch.setattr(app_main, "engine", legacy)
    app_main._ensure_columns()

    cols_apres = {c["name"] for c in inspect(legacy).get_columns("utilisateurs")}
    assert "notif_desactivees" in cols_apres, "la migration doit ajouter la colonne"

    with legacy.begin() as conn:
        valeur = conn.execute(
            text("SELECT notif_desactivees FROM utilisateurs WHERE email = 'ancien@test.local'")
        ).scalar()
    assert valeur == "", "'' = rien de désactivé = tout activé : aucune perte"

    # Idempotent : un second passage (ex. autre worker) ne casse rien.
    app_main._ensure_columns()
    legacy.dispose()
