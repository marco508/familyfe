"""Petits helpers de formatage des réponses (évite de fuiter des colonnes sensibles)."""


def public_user(row) -> dict:
    """Vue publique minimale d'un utilisateur (jamais mot_de_passe_hash)."""
    data = dict(row)
    return {
        "id": data["id"],
        "nom": data["nom"],
        "email": data.get("email"),
        "telephone": data.get("telephone"),
        "image": data.get("image"),
    }


def mini_user(row) -> dict:
    """Vue minimale (createur / assignés d'activité) : id, nom, image."""
    data = dict(row)
    return {
        "id": data["id"],
        "nom": data["nom"],
        "image": data.get("image"),
    }
