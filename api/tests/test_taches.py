"""Tests tâches : multi-pièces, gage cumulatif, échéance par jour-seuil."""


def _piece(c, h, mid, nom):
    return c.post(f"/maisons/{mid}/pieces", json={"nom": nom, "type": "autre"}, headers=h).json()


def test_tache_multi_pieces(authed):
    c, h, mid = authed["client"], authed["headers"], authed["maison_id"]
    p1 = _piece(c, h, mid, "Cuisine")
    p2 = _piece(c, h, mid, "Salon")
    r = c.post(
        f"/maisons/{mid}/taches",
        json={
            "titre": "Ménage",
            "piece_ids": [p1["id"], p2["id"]],
            "frequence": "hebdo",
            "assignation": "fixe",
            "assigne_id": authed["user"]["id"],
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert sorted(p["id"] for p in body["pieces"]) == sorted([p1["id"], p2["id"]])


def test_piece_hors_maison_rejetee(authed):
    c, h, mid = authed["client"], authed["headers"], authed["maison_id"]
    r = c.post(
        f"/maisons/{mid}/taches",
        json={
            "titre": "X",
            "assignation": "fixe",
            "assigne_id": authed["user"]["id"],
            "piece_ids": [999999],
        },
        headers=h,
    )
    assert r.status_code == 400


def test_gage_et_jour_seuil(authed):
    c, h, mid = authed["client"], authed["headers"], authed["maison_id"]
    r = c.post(
        f"/maisons/{mid}/taches",
        json={
            "titre": "Vaisselle",
            "frequence": "hebdo",
            "assignation": "fixe",
            "assigne_id": authed["user"]["id"],
            "gage_actif": True,
            "gage_semaines": 3,
            "echeance_jour_semaine": 2,  # mercredi
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["gage_semaines"] == 3
    assert b["gage_semaines_restantes"] == 0
    assert b["echeance_jour_semaine"] == 2
    # L'échéance a été calée sur une date (le prochain mercredi).
    assert b["echeance_date"] is not None


def test_points_negatifs_rejetes(authed):
    c, h, mid = authed["client"], authed["headers"], authed["maison_id"]
    r = c.post(
        f"/maisons/{mid}/taches",
        json={
            "titre": "X",
            "assignation": "fixe",
            "assigne_id": authed["user"]["id"],
            "points_penalite": -5,
        },
        headers=h,
    )
    assert r.status_code == 422  # Field(ge=0)
