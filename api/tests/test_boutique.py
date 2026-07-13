"""Tests boutique : validation du coût, échange sans points suffisants."""


def test_cout_negatif_rejete(authed):
    c, h, mid = authed["client"], authed["headers"], authed["maison_id"]
    r = c.post(f"/maisons/{mid}/boutique", json={"nom": "X", "cout_points": -5}, headers=h)
    assert r.status_code == 422  # Field(ge=0) — un coût négatif crédirait des points


def test_echange_points_insuffisants(authed):
    c, h, mid = authed["client"], authed["headers"], authed["maison_id"]
    rid = c.post(
        f"/maisons/{mid}/boutique", json={"nom": "Ciné", "cout_points": 100}, headers=h
    ).json()["id"]
    # Le chef part avec 0 point → l'échange doit être refusé (débit conditionnel).
    r = c.post(f"/boutique/{rid}/echanger", headers=h)
    assert r.status_code == 400


def test_echange_gratuit_ok(authed):
    c, h, mid = authed["client"], authed["headers"], authed["maison_id"]
    rid = c.post(
        f"/maisons/{mid}/boutique", json={"nom": "Gratuit", "cout_points": 0}, headers=h
    ).json()["id"]
    r = c.post(f"/boutique/{rid}/echanger", headers=h)
    assert r.status_code == 201, r.text
