"""Tests d'authentification : inscription, login, /me, et révocation de token."""


def _signup(client, email, password="motdepasse8"):
    return client.post("/signup", json={"nom": "Test", "email": email, "password": password})


def _login(client, email, password="motdepasse8"):
    r = client.post("/token", data={"username": email, "password": password})
    return r


def test_signup_password_too_short(client, unique_email):
    r = _signup(client, unique_email, password="court")
    assert r.status_code == 400


def test_signup_and_login(client, unique_email):
    assert _signup(client, unique_email).status_code == 201
    r = _login(client, unique_email)
    assert r.status_code == 200
    token = r.json()["access_token"]
    me = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    body = me.json()
    assert body["email"] == unique_email
    # Le champ interne token_version ne doit jamais être exposé.
    assert "token_version" not in body


def test_login_wrong_password(client, unique_email):
    _signup(client, unique_email)
    r = _login(client, unique_email, password="mauvaispass")
    assert r.status_code == 401


def test_duplicate_email_rejected(client, unique_email):
    assert _signup(client, unique_email).status_code == 201
    assert _signup(client, unique_email).status_code == 400


def test_token_revocation_globale(client, unique_email):
    """Après une déconnexion globale, l'ancien token est rejeté (401), et un
    nouveau login redonne un token valide."""
    _signup(client, unique_email)
    token = _login(client, unique_email).json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}

    # Le token fonctionne
    assert client.get("/me", headers=h).status_code == 200

    # Déconnexion globale → incrémente la version de session
    assert client.post("/me/deconnexion-globale", headers=h).status_code == 200

    # L'ancien token est désormais invalide
    assert client.get("/me", headers=h).status_code == 401

    # Un nouveau login fonctionne (nouvelle version embarquée)
    token2 = _login(client, unique_email).json()["access_token"]
    assert client.get("/me", headers={"Authorization": f"Bearer {token2}"}).status_code == 200
