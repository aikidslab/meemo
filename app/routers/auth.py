import os
import uuid
import base64
import hashlib
import secrets
import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse, JSONResponse
from google_auth_oauthlib.flow import Flow
from app.sessions import create_session, delete_session, get_session, session_cookie_max_age

router = APIRouter()

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/gmail.send",
]


def _build_flow(redirect_uri: str) -> Flow:
    return Flow.from_client_config(
        {
            "web": {
                "client_id": os.environ["GOOGLE_CLIENT_ID"],
                "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [redirect_uri],
            }
        },
        scopes=SCOPES,
        redirect_uri=redirect_uri,
    )


def _redirect_uri(request: Request) -> str:
    public_base_url = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
    if public_base_url:
        return f"{public_base_url}/auth/callback"

    forwarded_proto = request.headers.get("x-forwarded-proto")
    scheme = (forwarded_proto or request.url.scheme or "https").split(",")[0].strip()
    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "localhost:8443")
    return f"{scheme}://{host}/auth/callback"


def _secure_cookie(request: Request) -> bool:
    public_base_url = os.environ.get("PUBLIC_BASE_URL", "")
    if public_base_url:
        return public_base_url.startswith("https://")
    forwarded_proto = request.headers.get("x-forwarded-proto")
    scheme = (forwarded_proto or request.url.scheme or "").split(",")[0].strip()
    return scheme == "https"


def _make_pkce():
    """PKCE code_verifier + code_challenge 생성"""
    code_verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(code_verifier.encode()).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return code_verifier, code_challenge


@router.get("/login")
async def login(request: Request):
    if not os.environ.get("GOOGLE_CLIENT_ID") or not os.environ.get("GOOGLE_CLIENT_SECRET"):
        return RedirectResponse("/?google_error=1")
    redirect_uri = _redirect_uri(request)
    flow = _build_flow(redirect_uri)
    code_verifier, code_challenge = _make_pkce()
    auth_url, state = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        code_challenge=code_challenge,
        code_challenge_method="S256",
    )
    response = RedirectResponse(auth_url)
    secure = _secure_cookie(request)
    response.set_cookie("oauth_state", state, httponly=True, samesite="lax", secure=secure, max_age=600)
    response.set_cookie("code_verifier", code_verifier, httponly=True, samesite="lax", secure=secure, max_age=600)
    return response


@router.get("/callback")
async def callback(request: Request, code: str, state: str = ""):
    expected_state = request.cookies.get("oauth_state", "")
    if not expected_state or state != expected_state:
        raise HTTPException(status_code=400, detail="OAuth state 검증에 실패했습니다. 다시 로그인해 주세요.")

    redirect_uri = _redirect_uri(request)
    code_verifier = request.cookies.get("code_verifier", "")
    if not code_verifier:
        raise HTTPException(status_code=400, detail="OAuth verifier가 없습니다. 다시 로그인해 주세요.")
    flow = _build_flow(redirect_uri)
    flow.fetch_token(code=code, code_verifier=code_verifier)
    creds = flow.credentials

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {creds.token}"},
        )
    resp.raise_for_status()
    userinfo = resp.json()

    session_id = str(uuid.uuid4())
    create_session(session_id, {
        "email": userinfo.get("email", ""),
        "name": userinfo.get("name", ""),
        "picture": userinfo.get("picture", ""),
        "access_token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes or SCOPES),
    })

    response = RedirectResponse("/")
    secure = _secure_cookie(request)
    response.set_cookie(
        "session_id",
        session_id,
        httponly=True,
        samesite="lax",
        secure=secure,
        max_age=session_cookie_max_age(),
    )
    response.delete_cookie("oauth_state", httponly=True, samesite="lax", secure=secure)
    response.delete_cookie("code_verifier", httponly=True, samesite="lax", secure=secure)
    return response


@router.get("/logout")
async def logout(request: Request):
    session_id = request.cookies.get("session_id")
    delete_session(session_id)
    response = RedirectResponse("/")
    secure = _secure_cookie(request)
    response.delete_cookie("session_id", httponly=True, samesite="lax", secure=secure)
    return response


@router.get("/status")
async def status():
    configured = bool(os.environ.get("GOOGLE_CLIENT_ID") and os.environ.get("GOOGLE_CLIENT_SECRET"))
    return JSONResponse({"configured": configured})


@router.get("/me")
async def me(request: Request):
    session = get_session(request.cookies.get("session_id"))
    if not session:
        return JSONResponse({"logged_in": False})
    return JSONResponse({
        "logged_in": True,
        "email": session["email"],
        "name": session["name"],
        "picture": session["picture"],
    })
