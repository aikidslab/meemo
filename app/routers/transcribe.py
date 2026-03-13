import asyncio
import os
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, HTTPException, Request
from app.services.groq_stt import transcribe_audio
from app.sessions import get_session

router = APIRouter()


@router.post("/transcribe")
async def transcribe(request: Request, audio: UploadFile = File(...)):
    groq_key = request.headers.get("X-Groq-Key") or os.environ.get("GROQ_API_KEY", "")
    if not groq_key:
        raise HTTPException(status_code=400, detail="Groq API 키가 없습니다. 설정에서 입력해 주세요.")

    audio_bytes = await audio.read()
    filename = audio.filename or "recording.mp4"

    try:
        transcript = await transcribe_audio(audio_bytes, filename, groq_key)
    except ValueError as e:
        raise HTTPException(status_code=413, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Groq API 오류: {str(e)}")

    # Google Drive 업로드 (로그인 상태일 때)
    drive_link = ""
    session = get_session(request.cookies.get("session_id"))
    if session:
        try:
            date_str = datetime.now().strftime("%Y-%m-%d_%H%M")
            ext = "mp4" if filename.endswith(".mp4") else "webm"
            drive_filename = f"{date_str}_recording.{ext}"
            mime = "audio/mp4" if ext == "mp4" else "audio/webm"
            loop = asyncio.get_event_loop()
            from app.services.google_drive import upload_to_drive
            drive_link = await loop.run_in_executor(
                None, upload_to_drive, session, audio_bytes, drive_filename, mime, "recordings"
            )
        except Exception:
            pass  # Drive 업로드 실패해도 STT 결과는 반환

    return {"transcript": transcript, "audio_drive_link": drive_link}
