# 인메모리 세션 저장소 (서버 재시작 시 초기화됨)
sessions: dict[str, dict] = {}


def get_session(session_id: str | None) -> dict | None:
    if not session_id:
        return None
    return sessions.get(session_id)
