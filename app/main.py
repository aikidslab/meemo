from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from app.routers import transcribe, generate, auth, templates

# minutes 폴더는 없을 수 있으므로 미리 생성
(Path(__file__).parent.parent / "minutes").mkdir(exist_ok=True)
STATIC_DIR = Path(__file__).parent / "static"
INDEX_FILE = STATIC_DIR / "index.html"

app = FastAPI(title="Meemo")

app.include_router(auth.router, prefix="/auth")
app.include_router(transcribe.router, prefix="/api")
app.include_router(generate.router, prefix="/api")
app.include_router(templates.router, prefix="/api")

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def _asset_version() -> str:
    tracked_files = [STATIC_DIR / "style.css", STATIC_DIR / "app.js", INDEX_FILE]
    latest_mtime = max(int(path.stat().st_mtime) for path in tracked_files)
    return str(latest_mtime)


@app.get("/")
async def index():
    version = _asset_version()
    html = INDEX_FILE.read_text(encoding="utf-8").replace("__ASSET_VERSION__", version)
    return HTMLResponse(
        html,
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )
