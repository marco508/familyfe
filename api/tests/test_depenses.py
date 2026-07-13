"""Tests dépenses : validation du montant, montant renvoyé en nombre, bilan."""


def test_montant_negatif_rejete(authed):
    c, h, mid = authed["client"], authed["headers"], authed["maison_id"]
    r = c.post(f"/maisons/{mid}/depenses", json={"titre": "X", "montant": -5}, headers=h)
    assert r.status_code == 422  # Field(gt=0)


def test_montant_zero_rejete(authed):
    c, h, mid = authed["client"], authed["headers"], authed["maison_id"]
    r = c.post(f"/maisons/{mid}/depenses", json={"titre": "X", "montant": 0}, headers=h)
    assert r.status_code == 422


def test_creation_et_montant_numerique(authed):
    c, h, mid = authed["client"], authed["headers"], authed["maison_id"]
    r = c.post(f"/maisons/{mid}/depenses", json={"titre": "Courses", "montant": 10.5}, headers=h)
    assert r.status_code == 201, r.text
    body = r.json()
    # Contrat API : le montant reste un nombre JSON (pas une chaîne), malgré le
    # stockage en Numeric côté base.
    assert isinstance(body["montant"], (int, float))
    assert abs(body["montant"] - 10.5) < 1e-9


def test_bilan_structure(authed):
    c, h, mid = authed["client"], authed["headers"], authed["maison_id"]
    c.post(f"/maisons/{mid}/depenses", json={"titre": "A", "montant": 20}, headers=h)
    b = c.get(f"/maisons/{mid}/depenses/bilan", headers=h).json()
    assert "soldes" in b and "reglements" in b
    assert isinstance(b["soldes"], list)
