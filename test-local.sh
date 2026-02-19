#!/bin/bash

# MCP 서버 로컬 테스트 스크립트

echo "🧪 issue-scribe-mcp 로컬 테스트"
echo ""

# 1. .env 파일 로드
if [ -f ".env" ]; then
    echo "📋 .env 파일을 로드합니다..."
    export $(cat .env | grep -v '^#' | xargs)
    echo ""
else
    echo "⚠️  .env 파일이 없습니다."
    echo ""
fi

# 2. 환경 변수 확인
if [ -z "$GITHUB_TOKEN" ]; then
    echo "❌ GITHUB_TOKEN 환경 변수가 설정되지 않았습니다."
    echo ""
    echo "해결 방법:"
    echo "  1. .env 파일을 생성하세요:"
    echo "     cp .env.example .env"
    echo "  2. .env 파일을 열고 GITHUB_TOKEN을 입력하세요:"
    echo "     GITHUB_TOKEN=your_github_token_here"
    exit 1
fi

echo "✅ GITHUB_TOKEN이 설정되었습니다."
echo ""

# 3. 빌드 확인
if [ ! -f "dist/index.js" ]; then
    echo "⚠️  빌드 파일이 없습니다. 빌드를 시작합니다..."
    npm run build
    echo ""
fi

echo "✅ 빌드 파일이 존재합니다."
echo ""

# 4. MCP Inspector 설치 확인
if ! command -v npx &> /dev/null; then
    echo "❌ npx를 찾을 수 없습니다. Node.js가 설치되어 있는지 확인하세요."
    exit 1
fi

echo "🚀 MCP Inspector를 시작합니다..."
echo "브라우저가 자동으로 열립니다."
echo ""
echo "💡 사용 방법:"
echo "  1. 브라우저에서 'Connect' 버튼 클릭"
echo "  2. 왼쪽에서 사용 가능한 Tools 확인"
echo "  3. Tool을 선택하고 파라미터 입력 후 테스트"
echo "  4. 예시: github_get_issue_context"
echo "     - owner: gay00ung"
echo "     - repo: issue-scribe-mcp"
echo "     - issue_number: 1"
echo ""

# MCP Inspector 실행
npx @modelcontextprotocol/inspector node dist/index.js
