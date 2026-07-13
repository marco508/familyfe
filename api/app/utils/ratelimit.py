"""Limiteur de débit partagé (slowapi, stockage en mémoire).

Protège les routes sensibles (login, inscription, rejoindre une maison,
recherche d'utilisateurs) contre le brute-force et l'énumération.

Note : le stockage en mémoire suffit pour une instance unique. Pour plusieurs
workers/instances, configurer un backend Redis via `storage_uri`.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
