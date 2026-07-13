"""Sauvegarde des fichiers uploadés (avatars, preuves d'activité) — ANNEXE V3.

Les fichiers sont écrits dans `uploads/<subdir>/<uuid>.<ext>` (relatif au
répertoire de travail du process API) et servis en statique via `/uploads`
(voir `app/main.py`).

Sécurité :
- le nom stocké est un UUID (le nom fourni par le client n'est jamais réutilisé,
  donc pas de path traversal via le filename) ;
- `subdir` est validé contre une liste blanche (pas de "../") ;
- la taille est vérifiée en streaming (par blocs) : on rejette dès dépassement
  sans jamais bufferiser tout le fichier en mémoire (évite un DoS mémoire) ;
- le type réel est vérifié par signature (magic bytes), pas seulement par
  l'extension du nom de fichier.
"""
import os
import uuid

from fastapi import HTTPException, UploadFile, status

ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}
MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5 Mo
_CHUNK = 64 * 1024  # 64 Ko

UPLOAD_ROOT = "uploads"
# Sous-dossiers autorisés (empêche subdir="../.." de sortir de l'arborescence).
ALLOWED_SUBDIRS = {"avatars", "preuves"}


def _sniff_image_type(header: bytes) -> str | None:
    """Renvoie l'extension canonique déduite de la signature, ou None si le
    contenu ne correspond à aucun format image autorisé."""
    if header.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if header.startswith(b"GIF87a") or header.startswith(b"GIF89a"):
        return "gif"
    if header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return "webp"
    return None


async def save_upload(file: UploadFile, subdir: str) -> str:
    """Valide (extension, type réel, taille) et sauvegarde un fichier uploadé.
    Renvoie l'URL relative (`/uploads/<subdir>/<fichier>`)."""
    if subdir not in ALLOWED_SUBDIRS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Destination d'upload invalide",
        )

    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Extension de fichier non autorisée (jpg, jpeg, png, gif, webp)",
        )

    dirpath = os.path.join(UPLOAD_ROOT, subdir)
    os.makedirs(dirpath, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(dirpath, stored_name)

    # Écriture en streaming avec contrôle de taille + vérification du type réel
    # sur les premiers octets. On n'accumule jamais tout le fichier en mémoire.
    total = 0
    first_chunk = b""
    try:
        with open(filepath, "wb") as out:
            while True:
                chunk = await file.read(_CHUNK)
                if not chunk:
                    break
                if not first_chunk:
                    first_chunk = chunk
                    if _sniff_image_type(chunk[:16]) is None:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Le contenu n'est pas une image valide",
                        )
                total += len(chunk)
                if total > MAX_SIZE_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Fichier trop volumineux (5 Mo maximum)",
                    )
                out.write(chunk)
        if total == 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Fichier vide")
    except HTTPException:
        # Nettoie le fichier partiel avant de propager l'erreur.
        if os.path.exists(filepath):
            os.remove(filepath)
        raise

    return f"/uploads/{subdir}/{stored_name}"
