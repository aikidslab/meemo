import json
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

SESSIONS_FILE = Path(__file__).parent / "data" / "sessions.json"
SESSION_TTL = timedelta(days=7)

_lock = threading.RLock()
sessions: dict[str, dict] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _is_expired(session: dict, now: datetime | None = None) -> bool:
    expires_at = session.get("expires_at")
    if not expires_at:
        return True
    current = now or _now()
    return current >= datetime.fromisoformat(expires_at)


def _load_locked():
    global sessions
    if not SESSIONS_FILE.exists():
        sessions = {}
        return
    try:
        sessions = json.loads(SESSIONS_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        sessions = {}


def _save_locked():
    SESSIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
    temp_file = SESSIONS_FILE.with_suffix(".json.tmp")
    temp_file.write_text(json.dumps(sessions, ensure_ascii=False, indent=2), encoding="utf-8")
    temp_file.replace(SESSIONS_FILE)


def _cleanup_locked() -> None:
    now = _now()
    expired_ids = [session_id for session_id, session in sessions.items() if _is_expired(session, now)]
    if not expired_ids:
        return
    for session_id in expired_ids:
        sessions.pop(session_id, None)
    _save_locked()


def session_cookie_max_age() -> int:
    return int(SESSION_TTL.total_seconds())


def create_session(session_id: str, data: dict) -> dict:
    with _lock:
        _load_locked()
        session = {
            **data,
            "expires_at": (_now() + SESSION_TTL).isoformat(),
        }
        sessions[session_id] = session
        _cleanup_locked()
        _save_locked()
        return session


def get_session(session_id: str | None) -> dict | None:
    if not session_id:
        return None
    with _lock:
        _load_locked()
        _cleanup_locked()
        session = sessions.get(session_id)
        if not session:
            return None
        if _is_expired(session):
            sessions.pop(session_id, None)
            _save_locked()
            return None
        return session


def delete_session(session_id: str | None) -> None:
    if not session_id:
        return
    with _lock:
        _load_locked()
        if sessions.pop(session_id, None) is not None:
            _save_locked()
