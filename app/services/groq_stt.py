import httpx

GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB


async def transcribe_audio(audio_bytes: bytes, filename: str, api_key: str) -> str:
    if len(audio_bytes) > MAX_FILE_SIZE:
        raise ValueError(f"파일 크기가 25MB를 초과합니다 ({len(audio_bytes) // 1024 // 1024}MB)")

    mime_type = "audio/mp4" if filename.endswith(".mp4") else "audio/webm"

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            GROQ_API_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            files={"file": (filename, audio_bytes, mime_type)},
            data={
                "model": "whisper-large-v3",
                "language": "ko",
                "response_format": "text",
            },
        )
        response.raise_for_status()
        return response.text.strip()
