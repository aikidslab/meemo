from fastapi import APIRouter
from fastapi.responses import JSONResponse
from app.data.templates import get_all_templates, LANGUAGES

router = APIRouter()


@router.get("/templates")
async def list_templates():
    return JSONResponse({"templates": get_all_templates(), "languages": LANGUAGES})
