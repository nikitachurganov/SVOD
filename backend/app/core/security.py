from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

ALGORITHM = "HS256"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


# Placeholder for accounts created by an organization owner: no password until the invitee
# activates the account by link. Never a valid bcrypt hash, so nobody can log in with it.
PENDING_ACTIVATION_HASH = "!pending-activation"


def is_pending_activation(password_hash: str) -> bool:
    return password_hash == PENDING_ACTIVATION_HASH


def verify_password(plain: str, hashed: str) -> bool:
    if hashed.startswith("!"):
        return False
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str, expires_delta: timedelta | None = None) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta
        or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> str | None:
    """Return the subject (user id) or None if the token is invalid."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None
