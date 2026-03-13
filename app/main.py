from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.routers import transcribe, generate, auth, templates

# minutes 폴더는 없을 수 있으므로 미리 생성
(Path(__file__).parent.parent / "minutes").mkdir(exist_ok=True)

app = FastAPI(title="Meemo")

app.include_router(auth.router, prefix="/auth")
app.include_router(transcribe.router, prefix="/api")
app.include_router(generate.router, prefix="/api")
app.include_router(templates.router, prefix="/api")

app.mount("/static", StaticFiles(directory=Path(__file__).parent / "static"), name="static")


@app.get("/")
async def index():
    return FileResponse(Path(__file__).parent / "static" / "index.html")
