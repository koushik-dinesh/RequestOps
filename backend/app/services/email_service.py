from email.message import EmailMessage
from pathlib import Path
import smtplib

from app.core.config import settings


def send_email(to_email: str | None, subject: str, body: str) -> None:
    if not to_email:
        return

    mode = settings.email_mode.lower()
    if mode == "smtp" and settings.smtp_host:
        message = EmailMessage()
        message["From"] = settings.smtp_from
        message["To"] = to_email
        message["Subject"] = subject
        message.set_content(body)
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as smtp:
            if settings.smtp_tls:
                smtp.starttls()
            if settings.smtp_user and settings.smtp_password:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(message)
        return

    line = f"TO: {to_email}\nSUBJECT: {subject}\n{body}\n---\n"
    if mode == "file":
        path = Path(settings.email_log_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(path.read_text() + line if path.exists() else line)
    else:
        print(f"[RequestOps email]\n{line}")
