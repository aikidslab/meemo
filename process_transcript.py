#!/usr/bin/env python3
"""
회의록 생성기
텍스트 파일(트랜스크립트)을 읽어 Claude API로 회의록 .md 파일을 생성합니다.
"""

import os
import sys
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv
import anthropic

load_dotenv(Path(__file__).parent / ".env")

MINUTES_DIR = Path(__file__).parent / "minutes"
MINUTES_DIR.mkdir(exist_ok=True)

SYSTEM_PROMPT = (Path(__file__).parent / ".claude/agents/meeting-minutes.md").read_text()

def process(transcript_path: str) -> str:
    transcript = Path(transcript_path).read_text(encoding="utf-8")
    date_str = datetime.now().strftime("%Y-%m-%d")

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": f"다음 회의 녹취록으로 회의록을 작성해줘:\n\n{transcript}"
            }
        ]
    )

    minutes = message.content[0].text
    source_name = Path(transcript_path).stem
    output_path = MINUTES_DIR / f"{date_str}_{source_name}.md"
    output_path.write_text(minutes, encoding="utf-8")

    print(f"✅ 회의록 생성 완료: {output_path}")
    return str(output_path)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("사용법: python3 process_transcript.py <트랜스크립트 파일 경로>")
        sys.exit(1)
    process(sys.argv[1])
