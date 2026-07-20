"""Retrait de la rotation des ACTIVITÉS — et non-régression sur les TÂCHES.

Une activité est un moment à vivre ensemble (barbecue, restau) : elle ne
« tourne » pas entre les membres. Une tâche est une corvée ménagère : sa
rotation reste le cœur de l'app et doit continuer de fonctionner.
"""


def _second_membre(authed, email="second@test.local"):
    """Crée un 2e utilisateur et le fait rejoindre la maison de `authed`."""
    c, h, mid = authed["client"], authed["headers"], authed["maison_id"]
    c.post("/signup", json={"nom": "Membre2", "email": email, "password": "motdepasse8"})
    tok = c.post("/token", data={"username": email, "password": "motdepasse8"}).json()["access_token"]
    h2 = {"Authorization": f"Bearer {tok}"}
    u2 = c.get("/me", headers=h2).json()
    code = c.get(f"/maisons/{mid}", headers=h).json()["code_invitation"]
    c.post("/maisons/join", json={"code_invitation": code}, headers=h2)
    return h2, u2["id"]


# ─── Activités : plus de rotation ──────────────────────────────────────────

def test_creation_activite_avec_champs_rotation_est_ignoree(authed):
    """Compat : un vieil APK peut encore envoyer des champs rotation → ils sont
    ignorés en silence (surtout pas de 500), et l'activité est créée sans."""
    c, h, mid = authed["client"], authed["headers"], authed["maison_id"]
    h2, u2 = _second_membre(authed, "rot1@test.local")
    r = c.post(
        f"/maisons/{mid}/activites",
        json={
            "titre": "Barbecue",
            "rappel": False,
            "rotation_active": True,
            "rotation_ordre": [authed["user"]["id"], u2],
            "rotation_delai_jours": 3,
            "rotation_index": 0,
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["titre"] == "Barbecue"
    # Aucun champ rotation ne doit ressortir dans la réponse.
    assert [k for k in body if "rotation" in k.lower()] == []
    # La rotation étant ignorée, personne n'est assigné d'office comme titulaire.
    assert body["assignes"] == []


def test_reponse_activite_sans_champs_rotation(authed):
    c, h, mid = authed["client"], authed["headers"], authed["maison_id"]
    aid = c.post(f"/maisons/{mid}/activites", json={"titre": "Restau", "rappel": False},
                 headers=h).json()["id"]

    detail = c.get(f"/activites/{aid}", headers=h).json()
    assert [k for k in detail if "rotation" in k.lower()] == []

    liste = c.get(f"/maisons/{mid}/activites", headers=h).json()
    assert [k for a in liste for k in a if "rotation" in k.lower()] == []


def test_update_activite_avec_champs_rotation_est_ignoree(authed):
    c, h, mid = authed["client"], authed["headers"], authed["maison_id"]
    aid = c.post(f"/maisons/{mid}/activites", json={"titre": "Pique-nique", "rappel": False},
                 headers=h).json()["id"]
    r = c.put(f"/activites/{aid}",
              json={"titre": "Pique-nique v2", "rotation_active": True, "rotation_ordre": [1, 2]},
              headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["titre"] == "Pique-nique v2"
    assert [k for k in r.json() if "rotation" in k.lower()] == []


def test_endpoint_rotation_activite_supprime(authed):
    c, h, mid = authed["client"], authed["headers"], authed["maison_id"]
    aid = c.post(f"/maisons/{mid}/activites", json={"titre": "Ciné", "rappel": False},
                 headers=h).json()["id"]
    assert c.post(f"/activites/{aid}/rotation/suivant", headers=h).status_code in (404, 405)


def test_table_activites_sans_colonnes_rotation():
    from app.database.database import activites

    assert [col.name for col in activites.columns if "rotation" in col.name] == []


def test_type_notification_rotation_reste_mappe():
    """Des notifications historiques `type="rotation"` existent en base : le
    mapping doit rester, même si plus rien n'émet ce type."""
    from app.services.notifications import CATEGORIE_PAR_TYPE

    assert CATEGORIE_PAR_TYPE.get("rotation") == "corvees"


# ─── Tâches : la rotation DOIT continuer de fonctionner ────────────────────

def test_table_taches_conserve_la_rotation():
    from app.database.database import taches

    cols = {col.name for col in taches.columns}
    assert {"rotation_ordre", "rotation_index", "rotation_conditions"} <= cols


def test_rotation_tache_passe_au_membre_suivant(authed):
    """Non-régression cœur de l'app : la corvée tourne toujours."""
    c, h, mid = authed["client"], authed["headers"], authed["maison_id"]
    u1 = authed["user"]["id"]
    h2, u2 = _second_membre(authed, "rot2@test.local")

    r = c.post(
        f"/maisons/{mid}/taches",
        json={
            "titre": "Vaisselle",
            "frequence": "hebdo",
            "assignation": "rotation",
            "rotation_ordre": [u1, u2],
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    tache = r.json()
    assert tache["rotation_ordre"] == [u1, u2]
    assert tache["titulaire"]["id"] == u1  # 1er de l'ordre

    # Le titulaire valide sa corvée → le tour passe au suivant.
    r = c.post(f"/taches/{tache['id']}/valider", headers=h)
    assert r.status_code == 200, r.text
    apres = r.json()
    assert apres["rotation_index"] == 1
    assert apres["titulaire"]["id"] == u2
