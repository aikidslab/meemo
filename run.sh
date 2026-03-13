#!/bin/bash
set -e
cd "$(dirname "$0")"

CERT=certs/cert.pem
KEY=certs/key.pem

# HTTPS 인증서가 없으면 자동 생성
if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
  echo "🔐 HTTPS 인증서 생성 중..."
  if ! command -v mkcert &>/dev/null; then
    echo "⚙️  mkcert 설치 중..."
    brew install mkcert
    mkcert -install
  fi
  mkdir -p certs
  LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")
  mkcert -cert-file "$CERT" -key-file "$KEY" "$LOCAL_IP" localhost 127.0.0.1
  # iPhone 인증서 설치용 CA 파일 복사
  cp "$(mkcert -CAROOT)/rootCA.pem" app/static/rootCA.pem
  echo ""
  echo "📱 iPhone 첫 설정 안내:"
  echo "  1. iPhone Safari에서 https://$LOCAL_IP:8443/static/rootCA.pem 접속"
  echo "  2. 설정 > 일반 > VPN 및 기기 관리 > 프로파일 설치"
  echo "  3. 설정 > 일반 > 정보 > 인증서 신뢰 설정 > mkcert 활성화"
  echo ""
fi

LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")
echo "🚀 서버 시작: https://$LOCAL_IP:8443"
echo "📱 iPhone에서 위 주소로 접속하세요"
echo ""

uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8443 \
  --ssl-keyfile "$KEY" \
  --ssl-certfile "$CERT"
