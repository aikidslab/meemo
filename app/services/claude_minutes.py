from pathlib import Path
import anthropic

SYSTEM_PROMPT = (
    Path(__file__).parent.parent.parent / ".claude" / "agents" / "meeting-minutes.md"
).read_text(encoding="utf-8")


async def generate_minutes(transcript: str, api_key: str) -> str:
    client = anthropic.AsyncAnthropic(api_key=api_key)
    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": f"다음 회의 녹취록으로 회의록을 작성해줘:\n\n{transcript}",
            }
        ],
    )
    return message.content[0].text
