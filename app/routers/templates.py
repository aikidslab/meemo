import uuid
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from app.data.templates import (
    get_all_templates, get_template,
    save_custom_template, delete_custom_template,
    LANGUAGES,
)

router = APIRouter()


class TemplateBody(BaseModel):
    name: str
    description: str = ""
    prompt: str


@router.get("/templates")
async def list_templates():
    return JSONResponse({"templates": get_all_templates(), "languages": LANGUAGES})


@router.post("/templates")
async def create_template(body: TemplateBody):
    template = {
        "id": f"custom_{uuid.uuid4().hex[:8]}",
        "name": body.name,
        "description": body.description,
        "prompt": body.prompt,
        "is_preset": False,
    }
    save_custom_template(template)
    return JSONResponse(template)


@router.put("/templates/{template_id}")
async def update_template(template_id: str, body: TemplateBody):
    existing = get_template(template_id)
    if not existing:
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다.")
    if existing.get("is_preset"):
        # 프리셋은 복사본으로 저장
        template = {
            "id": f"custom_{uuid.uuid4().hex[:8]}",
            "name": body.name,
            "description": body.description,
            "prompt": body.prompt,
            "is_preset": False,
            "forked_from": template_id,
        }
    else:
        template = {**existing, "name": body.name, "description": body.description, "prompt": body.prompt}
    save_custom_template(template)
    return JSONResponse(template)


@router.delete("/templates/{template_id}")
async def remove_template(template_id: str):
    existing = get_template(template_id)
    if not existing:
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다.")
    if existing.get("is_preset"):
        raise HTTPException(status_code=400, detail="기본 템플릿은 삭제할 수 없습니다.")
    delete_custom_template(template_id)
    return JSONResponse({"ok": True})
