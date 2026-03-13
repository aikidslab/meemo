from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaInMemoryUpload


def _creds(session: dict) -> Credentials:
    return Credentials(
        token=session["access_token"],
        refresh_token=session["refresh_token"],
        token_uri=session["token_uri"],
        client_id=session["client_id"],
        client_secret=session["client_secret"],
        scopes=session["scopes"],
    )


def _get_or_create_folder(service, name: str, parent_id: str = None) -> str:
    query = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent_id:
        query += f" and '{parent_id}' in parents"
    results = service.files().list(q=query, fields="files(id)").execute()
    files = results.get("files", [])
    if files:
        return files[0]["id"]
    meta = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
    if parent_id:
        meta["parents"] = [parent_id]
    return service.files().create(body=meta, fields="id").execute()["id"]


def upload_to_drive(session: dict, content: bytes, filename: str, mime_type: str, subfolder: str) -> str:
    """
    MoM/{subfolder}/{filename} 경로로 업로드하고 webViewLink 반환
    """
    service = build("drive", "v3", credentials=_creds(session))
    mom_id = _get_or_create_folder(service, "MoM")
    sub_id = _get_or_create_folder(service, subfolder, mom_id)

    media = MediaInMemoryUpload(content, mimetype=mime_type)
    file = service.files().create(
        body={"name": filename, "parents": [sub_id]},
        media_body=media,
        fields="id,webViewLink",
    ).execute()
    return file.get("webViewLink", "")
