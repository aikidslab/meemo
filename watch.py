#!/usr/bin/env python3
"""
구글 드라이브 MoM/transcripts 폴더를 감시합니다.
새로운 .txt 파일이 생기면 자동으로 회의록을 생성합니다.
"""

import os
import time
from pathlib import Path
from dotenv import load_dotenv
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from process_transcript import process

load_dotenv(Path(__file__).parent / ".env")

GOOGLE_DRIVE = os.environ.get("GOOGLE_DRIVE_PATH", "")
WATCH_DIR = Path(GOOGLE_DRIVE) / "MoM" / "transcripts"


class TranscriptHandler(FileSystemEventHandler):
    def on_created(self, event):
        if event.is_directory:
            return
        path = Path(event.src_path)
        if path.suffix == ".txt":
            print(f"📄 새 트랜스크립트 감지: {path.name}")
            time.sleep(1)  # 파일 쓰기 완료 대기
            try:
                process(str(path))
            except Exception as e:
                print(f"❌ 오류 발생: {e}")


def main():
    if not GOOGLE_DRIVE:
        print("❌ .env 파일에 GOOGLE_DRIVE_PATH를 설정해주세요.")
        return

    if not WATCH_DIR.exists():
        WATCH_DIR.mkdir(parents=True)
        print(f"📁 폴더 생성: {WATCH_DIR}")

    print(f"👀 감시 시작: {WATCH_DIR}")
    print("새 트랜스크립트가 들어오면 자동으로 회의록을 생성합니다. (Ctrl+C로 종료)")

    observer = Observer()
    observer.schedule(TranscriptHandler(), str(WATCH_DIR), recursive=False)
    observer.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        print("\n종료됨")

    observer.join()


if __name__ == "__main__":
    main()
