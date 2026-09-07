from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from .config import get_settings
from . import models, tokens

settings = get_settings()

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False}
    if settings.database_url.startswith("sqlite")
    else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False)

models.Base.metadata.create_all(bind=engine)

# A 1x1 transparent GIF.
TRANSPARENT_GIF = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff"
    b"!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D"
    b"\x01\x00;"
)

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["chrome-extension://*", "https://mail.google.com"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _verify_api_key(x_api_key: str | None) -> None:
    if not x_api_key or x_api_key != settings.api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/events")
async def receive_events(
    request: Request, x_api_key: str = Header(default=None)
):
    """Register an outgoing email from the extension before/after sending."""
    _verify_api_key(x_api_key)

    body = await request.json()
    db = SessionLocal()
    try:
        email = models.Email(
            user_email=body["user_email"],
            recipient=body["recipient"],
            subject=body.get("subject", ""),
            thread_id=body.get("thread_id"),
            gmail_message_id=body.get("gmail_message_id"),
            token=tokens.generate_token(0),  # placeholder, replaced below
        )
        db.add(email)
        db.flush()
        email.token = tokens.generate_token(email.id)
        db.commit()
        db.refresh(email)
    finally:
        db.close()

    return {"email_id": email.id, "tracking_token": email.token}


@app.get("/track/{token}.gif")
def track_open(token: str, request: Request):
    """Serves the 1x1 pixel and records an open event (deduplicated)."""
    email_id = tokens.decode_token(token)
    if email_id is None:
        return Response(
            content=TRANSPARENT_GIF,
            media_type="image/gif",
            headers=_no_cache_headers(),
        )

    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        email = db.get(models.Email, email_id)
        if email is None:
            return Response(
                content=TRANSPARENT_GIF,
                media_type="image/gif",
                headers=_no_cache_headers(),
            )

        # Dedup: ignore opens within the window of the last recorded one.
        if email.opened_at and (now - email.opened_at) < timedelta(
            seconds=settings.open_dedup_window
        ):
            db.close()
            return Response(
                content=TRANSPARENT_GIF,
                media_type="image/gif",
                headers=_no_cache_headers(),
            )

        email.opened_at = now
        email.open_count += 1
        db.add(
            models.OpenEvent(
                email_id=email.id,
                ip=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
                opened_at=now,
            )
        )
        db.commit()
    finally:
        db.close()

    return Response(
        content=TRANSPARENT_GIF,
        media_type="image/gif",
        headers=_no_cache_headers(),
    )


@app.get("/status")
def get_status(
    token: str,
    user_email: str,
    x_api_key: str = Header(default=None),
):
    """Returns the tracked state for an email."""
    _verify_api_key(x_api_key)

    email_id = tokens.decode_token(token)
    if email_id is None:
        raise HTTPException(status_code=404, detail="Unknown token")

    db = SessionLocal()
    try:
        email = db.get(models.Email, email_id)
        if email is None:
            raise HTTPException(status_code=404, detail="Email not found")
        if email.user_email != user_email:
            raise HTTPException(status_code=403, detail="Forbidden")
        return {
            "email_id": email.id,
            "token": email.token,
            "recipient": email.recipient,
            "subject": email.subject,
            "sent_at": email.sent_at.isoformat() if email.sent_at else None,
            "opened_at": email.opened_at.isoformat() if email.opened_at else None,
            "open_count": email.open_count,
            "state": "read" if email.opened_at else "sent",
        }
    finally:
        db.close()


@app.get("/status/batch")
def get_status_batch(
    tokens_str: str,
    user_email: str,
    x_api_key: str = Header(default=None),
):
    """Returns states for multiple tokens, comma-separated."""
    _verify_api_key(x_api_key)

    tokens_list = [t for t in tokens_str.split(",") if t]
    if not tokens_list:
        return {"emails": []}

    db = SessionLocal()
    try:
        email_ids = []
        for t in tokens_list:
            eid = tokens.decode_token(t)
            if eid is not None:
                email_ids.append(eid)

        result = []
        for email in db.query(models.Email).filter(models.Email.id.in_(email_ids)):
            if email.user_email != user_email:
                continue
            result.append(
                {
                    "email_id": email.id,
                    "token": email.token,
                    "recipient": email.recipient,
                    "subject": email.subject,
                    "sent_at": email.sent_at.isoformat() if email.sent_at else None,
                    "opened_at": email.opened_at.isoformat() if email.opened_at else None,
                    "open_count": email.open_count,
                    "state": "read" if email.opened_at else "sent",
                }
            )
        return {"emails": result}
    finally:
        db.close()


def _no_cache_headers() -> dict:
    return {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
    }
