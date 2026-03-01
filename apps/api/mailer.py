import os
import resend


def send_email(to_email: str, subject: str, body: str) -> None:
    """
    Email sender via Resend API.
    Requires env vars:
      RESEND_API_KEY=...
      RESEND_FROM="Lumiroute <onboarding@resend.dev>"
    """
    api_key = os.getenv("RESEND_API_KEY")
    from_email = os.getenv("RESEND_FROM", "Lumiroute <onboarding@resend.dev>")

    if not api_key:
        raise RuntimeError("Missing RESEND_API_KEY env var")

    resend.api_key = api_key

    resend.Emails.send(
        {
            "from": from_email,
            "to": [to_email],
            "subject": subject,
            "text": body,
        }
    )