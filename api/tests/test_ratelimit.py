"""Test du rate-limiting sur /token (désactivé par défaut ailleurs)."""
from app.utils.ratelimit import limiter


def test_login_rate_limited(client):
    limiter.enabled = True
    try:
        codes = [
            client.post("/token", data={"username": "x@y.z", "password": "nope"}).status_code
            for _ in range(13)
        ]
    finally:
        limiter.enabled = False
    # /token est limité à 10/minute → au moins un 429 dans le lot.
    assert 429 in codes
