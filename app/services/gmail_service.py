import base64
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build


def send_minutes_email(session: dict, minutes: str, filename: str, drive_link: str = ""):
    creds = Credentials(
        token=session["access_token"],
        refresh_token=session["refresh_token"],
        token_uri=session["token_uri"],
        client_id=session["client_id"],
        client_secret=session["client_secret"],
        scopes=session["scopes"],
    )
    service = build("gmail", "v1", credentials=creds)
    email = session["email"]

    msg = MIMEMultipart()
    msg["To"] = email
    msg["From"] = email
    msg["Subject"] = f"[회의록] {filename}"

    body_text = minutes
    if drive_link:
        body_text += f"\n\n---\n📁 Google Drive: {drive_link}"
    msg.attach(MIMEText(body_text, "plain", "utf-8"))

    attachment = MIMEBase("text", "markdown")
    attachment.set_payload(minutes.encode("utf-8"))
    encoders.encode_base64(attachment)
    attachment.add_header("Content-Disposition", f'attachment; filename="{filename}"')
    msg.attach(attachment)

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
    service.users().messages().send(userId="me", body={"raw": raw}).execute()
