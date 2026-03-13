import httpx
from app.data.templates import get_template, LANGUAGE_NAMES, PRESET_TEMPLATES

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"

_DEFAULT_PROMPT = next(t["prompt"] for t in PRESET_TEMPLATES if t["id"] == "general")


async def generate_minutes(
    transcript: str,
    api_key: str,
    template_id: str = "general",
    output_language: str = "ko",
    template_prompt: str | None = None,
) -> str:
    if template_prompt and template_prompt.strip():
        system_prompt = template_prompt.strip()
    else:
        template = get_template(template_id)
        system_prompt = template["prompt"] if template else _DEFAULT_PROMPT

    lang_name = LANGUAGE_NAMES.get(output_language, "한국어")
    lang_instruction = (
        f"\n\n**중요: 회의록은 반드시 {lang_name}로 작성하세요. "
        f"녹취록 언어와 관계없이 출력은 {lang_name}이어야 합니다.**"
    )

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            GROQ_CHAT_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {"role": "system", "content": system_prompt + lang_instruction},
                    {"role": "user", "content": f"다음 회의 녹취록으로 회의록을 작성해줘:\n\n{transcript}"},
                ],
                "max_tokens": 4096,
                "temperature": 0.3,
            },
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]
