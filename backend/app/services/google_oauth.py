"""Verifies Google ID tokens issued by Google Identity Services on the frontend."""

from typing import Any

from google.auth.transport import requests
from google.oauth2 import id_token

from app.core.config import settings


# Raises ValueError when the token is invalid or the client id does not match.
def verify_google_id_token(token: str) -> dict[str, Any]:
  # Prevents auth when Google OAuth is not configured in the deployment environment.
  if not settings.GOOGLE_CLIENT_ID:
    raise ValueError("Google OAuth is not configured")

  # Validates signature, audience, and expiry against Google's public keys.
  payload = id_token.verify_oauth2_token(
    token,
    requests.Request(),
    settings.GOOGLE_CLIENT_ID,
  )

  # Ensures the token was issued for a verified Google account email address.
  if not payload.get("email_verified"):
    raise ValueError("Google email is not verified")

  return payload
