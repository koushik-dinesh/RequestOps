from datetime import datetime, timedelta, timezone
import re

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings
from app.utils.http import ApiError


def _parse_expiry(value: str) -> timedelta:
    match = re.fullmatch(r"(\d+)([smhd])", value.strip())
    if not match:
        return timedelta(minutes=30)
    amount = int(match.group(1))
    unit = match.group(2)
    return {
        "s": timedelta(seconds=amount),
        "m": timedelta(minutes=amount),
        "h": timedelta(hours=amount),
        "d": timedelta(days=amount),
    }[unit]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=10)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_token(payload: dict, secret: str, expires_in: str) -> str:
    now = datetime.now(timezone.utc)
    to_encode = payload.copy()
    to_encode.update({"iat": now, "exp": now + _parse_expiry(expires_in)})
    return jwt.encode(to_encode, secret, algorithm="HS256")


def sign_tokens(user: dict, role_code: str | None = None) -> dict:
    active_role = role_code or user.get("role_code")
    payload = {"sub": str(user["id"]), "role": active_role, "email": user.get("email")}
    return {
        "accessToken": create_token(payload, settings.jwt_access_secret, settings.jwt_access_expires_in),
        "refreshToken": create_token(payload, settings.jwt_refresh_secret, settings.jwt_refresh_expires_in),
    }


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_access_secret, algorithms=["HS256"])
    except JWTError as exc:
        raise ApiError(401, "Invalid or expired token.") from exc


def decode_refresh_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_refresh_secret, algorithms=["HS256"])
    except JWTError as exc:
        raise ApiError(401, "Refresh token is no longer valid.") from exc
