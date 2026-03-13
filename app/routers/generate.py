import asyncio
import os
import uuid
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from app.services.groq_llm import generate_minutes
from app.sessions import get_session

router = APIRouter()
MINUTES_DIR = Path(__file__).parent.parent.parent / "minutes"


class GenerateRequest(BaseModel):
    transcript: str
    save: bool = False
    template_id: str = "general"
    output_language: str = "ko"
    template_prompt: str | None = None


@router.post("/generate")
async def generate(req: GenerateRequest, request: Request):
    groq_key = request.headers.get("X-Groq-Key") or os.environ.get("GROQ_API_KEY", "")
    if not groq_key:
        raise HTTPException(status_code=400, detail="Groq API 키가 없습니다. 설정에서 입력해 주세요.")

    if not req.transcript.strip():
        raise HTTPException(status_code=422, detail="트랜스크립트가 비어 있습니다.")

    try:
        minutes = await generate_minutes(
            req.transcript,
            groq_key,
            req.template_id,
            req.output_language,
            req.template_prompt,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Groq API 오류: {str(e)}")

    date_str = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    filename = f"{date_str}_{uuid.uuid4().hex[:8]}_meeting.md"
    result = {"minutes": minutes, "filename": filename, "drive_link": "", "email_sent": False}

    # 로컬 저장
    if req.save:
        MINUTES_DIR.mkdir(exist_ok=True)
        (MINUTES_DIR / filename).write_text(minutes, encoding="utf-8")

    # Google Drive 저장 + 이메일 전송 (로그인 상태일 때)
    session = get_session(request.cookies.get("session_id"))
    if session:
        loop = asyncio.get_running_loop()

        # Drive 업로드
        try:
            from app.services.google_drive import upload_to_drive
            drive_link = await loop.run_in_executor(
                None, upload_to_drive,
                session, minutes.encode("utf-8"), filename, "text/markdown", "minutes"
            )
            result["drive_link"] = drive_link
        except Exception as e:
            result["drive_error"] = str(e)

        # 이메일 전송
        try:
            from app.services.gmail_service import send_minutes_email
            await loop.run_in_executor(
                None, send_minutes_email,
                session, minutes, filename, result.get("drive_link", "")
            )
            result["email_sent"] = True
        except Exception as e:
            result["email_error"] = str(e)

    return result


@router.get("/download/{filename}")
async def download(filename: str, request: Request):
    if not get_session(request.cookies.get("session_id")):
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")

    minutes_root = MINUTES_DIR.resolve()
    path = (MINUTES_DIR / filename).resolve()
    if (
        path.parent != minutes_root
        or not path.exists()
        or not path.is_file()
        or path.suffix != ".md"
    ):
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")
    return FileResponse(
        path,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
