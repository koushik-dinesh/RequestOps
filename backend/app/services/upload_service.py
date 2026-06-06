from pathlib import Path
import shutil
import time
import uuid

from fastapi import UploadFile

from app.core.config import settings
from app.utils.http import ApiError


ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/msword",
    "application/vnd.ms-excel",
    "image/png",
    "image/jpeg",
    "image/webp",
}


def save_upload(file: UploadFile) -> dict:
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise ApiError(400, "Unsupported attachment type.")
    settings.upload_path.mkdir(parents=True, exist_ok=True)
    extension = Path(file.filename or "").suffix
    file_name = f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:10]}{extension}"
    storage_path = settings.upload_path / file_name
    size = 0
    max_size = settings.max_upload_mb * 1024 * 1024
    with storage_path.open("wb") as target:
        while chunk := file.file.read(1024 * 1024):
            size += len(chunk)
            if size > max_size:
                target.close()
                storage_path.unlink(missing_ok=True)
                raise ApiError(413, f"Attachment exceeds {settings.max_upload_mb} MB.")
            target.write(chunk)
    file.file.seek(0)
    return {
        "file_name": file_name,
        "original_file_name": file.filename,
        "mime_type": file.content_type,
        "file_size_bytes": size,
        "storage_path": str(storage_path),
    }


def copy_existing_to_uploads(source: Path) -> Path:
    settings.upload_path.mkdir(parents=True, exist_ok=True)
    target = settings.upload_path / source.name
    shutil.copy2(source, target)
    return target
