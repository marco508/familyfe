"""Sauvegarde des fichiers uploadés (avatars, preuves d'activité) — ANNEXE V3.

Les fichiers sont écrits dans `uploads/<subdir>/<uuid>.<ext>` (relatif au
répertoire de travail du process API) et servis en statique via `/uploads`
(voir `app/main.py`).
"""
import os
import uuid

from fastapi import HTTPException, UploadFile, status

ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}
MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5 Mo

UPLOAD_ROOT = "uploads"


async def save_upload(file: UploadFile, subdir: str) -> str:
    """Valide (extension, taille) et sauvegarde un fichier uploadé.
    Renvoie l'URL relative (`/uploads/<subdir>/<fichier>`)."""
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Extension de fichier non autorisée (jpg, jpeg, png, gif, webp)",
        )

    content = await file.read()
    if len(content) > MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fichier trop volumineux (5 Mo maximum)",
        )
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Fichier vide")

    dirpath = os.path.join(UPLOAD_ROOT, subdir)
    os.makedirs(dirpath, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(dirpath, stored_name)
    with open(filepath, "wb") as f:
        f.write(content)

    return f"/uploads/{subdir}/{stored_name}"
