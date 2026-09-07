import secrets

from itsdangerous import BadSignature, URLSafeSerializer

from .config import get_settings

# A serialized protected payload holds a non-secret email id plus an HMAC
# signature, so we can reference an email safely in a pixel URL without
# exposing recipient addresses or other PII.

_serializer: URLSafeSerializer | None = None


def _get_serializer() -> URLSafeSerializer:
    global _serializer
    if _serializer is None:
        _serializer = URLSafeSerializer(get_settings().secret_key)
    return _serializer


def generate_token(email_id: int) -> str:
    """Generate a signed, opaque token for an email id."""
    payload = {"eid": email_id, "n": secrets.token_hex(3)}
    return _get_serializer().dumps(payload)


def decode_token(token: str) -> int | None:
    """Decode a token back to an email id, or None if invalid."""
    try:
        payload = _get_serializer().loads(token)
    except BadSignature:
        return None
    eid = payload.get("eid")
    return eid if isinstance(eid, int) else None
