from email.message import EmailMessage
from email.utils import make_msgid
from datetime import datetime
from html import escape
from pathlib import Path
import smtplib

from app.core.config import settings


COMPANY_NAME = "Violin Technologies"
PLATFORM_NAME = "RequestOps Platform"
LOGO_CID_NAME = "violin-technologies-logo"


def _email_footer_text() -> str:
    return f"""--------------------------------------------------
{COMPANY_NAME}
RequestOps Workflow Management Platform
This is an automated email. Please do not reply to this message.
Copyright (c) {datetime.now().year} {COMPANY_NAME}. All rights reserved.
--------------------------------------------------"""


def _with_footer(body: str) -> str:
    footer = _email_footer_text()
    if "This is an automated email. Please do not reply to this message." in body:
        return body
    return f"{body.rstrip()}\n\n{footer}\n"


def _text_to_html(body: str) -> str:
    paragraphs = [paragraph.strip() for paragraph in body.strip().split("\n\n") if paragraph.strip()]
    return "\n".join(
        f'<p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.65;">{escape(paragraph).replace(chr(10), "<br />")}</p>'
        for paragraph in paragraphs
    )


def _logo_path() -> Path:
    return Path(settings.email_logo_path)


def _render_email_html(subject: str, body: str, html_body: str | None, logo_cid: str) -> str:
    content = html_body.strip() if html_body else _text_to_html(body)
    year = datetime.now().year
    logo_src = f"cid:{logo_cid}"
    return f"""<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{escape(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#f1f5f9;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:28px 14px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:680px;border-collapse:collapse;">
            <tr>
              <td style="padding:0 0 14px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#0f172a;border-radius:18px 18px 0 0;">
                  <tr>
                    <td style="padding:22px 24px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                        <tr>
                          <td style="width:132px;vertical-align:middle;">
                            <img src="{logo_src}" width="116" alt="Violin Technologies" style="display:block;width:116px;max-width:116px;height:auto;border:0;outline:none;text-decoration:none;" />
                          </td>
                          <td style="vertical-align:middle;padding-left:16px;">
                            <div style="font-size:21px;line-height:1.2;font-weight:700;color:#ffffff;letter-spacing:.2px;">Violin Technologies</div>
                            <div style="margin-top:5px;font-size:13px;line-height:1.4;color:#bfdbfe;font-weight:700;letter-spacing:.7px;text-transform:uppercase;">RequestOps Platform</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 18px 18px;box-shadow:0 12px 30px rgba(15,23,42,.08);overflow:hidden;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="padding:28px 30px 8px;">
                      <div style="font-size:11px;line-height:1.4;color:#64748b;font-weight:700;letter-spacing:.9px;text-transform:uppercase;">System Notification</div>
                      <h1 style="margin:8px 0 0;color:#0f172a;font-size:22px;line-height:1.35;font-weight:800;">{escape(subject)}</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 30px 30px;">
                      <div style="color:#334155;font-size:14px;line-height:1.65;">
                        {content}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 30px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                      <p style="margin:0;color:#475569;font-size:12px;line-height:1.6;font-weight:700;">Violin Technologies</p>
                      <p style="margin:2px 0 0;color:#64748b;font-size:12px;line-height:1.6;">RequestOps Workflow Management Platform</p>
                      <p style="margin:12px 0 0;color:#64748b;font-size:12px;line-height:1.6;">This is an automated email. Please do not reply to this message.</p>
                      <p style="margin:8px 0 0;color:#94a3b8;font-size:11px;line-height:1.5;">Copyright &copy; {year} Violin Technologies. All rights reserved.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


def _attach_logo(html_part, logo_cid: str) -> None:
    logo_path = _logo_path()
    if not logo_path.exists():
        return
    html_part.add_related(
        logo_path.read_bytes(),
        maintype="image",
        subtype=logo_path.suffix.lstrip(".") or "png",
        cid=f"<{logo_cid}>",
        filename="violin-technologies-logo.png",
    )


def send_email(to_email: str | None, subject: str, body: str, html_body: str | None = None) -> None:
    if not to_email:
        return

    text_body = _with_footer(body)
    logo_cid = make_msgid(LOGO_CID_NAME)[1:-1]
    branded_html = _render_email_html(subject, body, html_body, logo_cid)

    mode = settings.email_mode.lower()
    if mode == "smtp" and settings.smtp_host:
        message = EmailMessage()
        message["From"] = settings.smtp_from
        message["To"] = to_email
        message["Subject"] = subject
        message.set_content(text_body)
        message.add_alternative(branded_html, subtype="html")
        _attach_logo(message.get_payload()[-1], logo_cid)
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as smtp:
            if settings.smtp_tls:
                smtp.starttls()
            if settings.smtp_user and settings.smtp_password:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(message)
        return

    line = f"TO: {to_email}\nSUBJECT: {subject}\n{text_body}\n---\n"
    if mode == "file":
        path = Path(settings.email_log_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(path.read_text() + line if path.exists() else line)
    else:
        print(f"[RequestOps email]\n{line}")
