# issue-scribe-mcp

[![한국어](https://img.shields.io/badge/lang-한국어-blue.svg)](README.md)
[![English](https://img.shields.io/badge/lang-English-red.svg)](README_EN.md)

![npm version](https://img.shields.io/npm/v/issue-scribe-mcp.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![GitHub stars](https://img.shields.io/github/stars/gay00ung/issue-scribe-mcp.svg)

> GitHub Issue와 Pull Request의 전체 컨텍스트를 수집하고 관리하는 MCP(Model Context Protocol) 서버입니다. Claude Desktop과 같은 AI 어시스턴트에서 GitHub 저장소의 Issue와 PR을 손쉽게 조회하고 생성할 수 있습니다.

## ✨ 주요 기능

- 🔍 **컨텍스트 조회**: Issue와 PR의 상세 정보, 댓글, 커밋 내역 등 전체 컨텍스트 수집
- 📝 **Issue 관리**: 새로운 Issue 생성 및 기존 Issue 업데이트
- 🔀 **PR 생성**: Pull Request 자동 생성 및 Draft PR 지원
- 🤖 **AI 통합**: Claude Desktop 등 MCP를 지원하는 AI 도구와 완벽 통합
- 🔐 **간편 인증**: GitHub Personal Access Token을 통한 안전한 API 접근

## 📋 사전 준비

### GitHub Personal Access Token 발급

1. GitHub에서 [Personal Access Token 생성 페이지](https://github.com/settings/tokens/new)로 이동
2. Token 설정:
   - **Note**: `issue-scribe-mcp` (또는 원하는 이름)
   - **Expiration**: 원하는 만료 기간 선택
   - **Select scopes**: 다음 권한 체크
     - ✅ `repo` (전체 저장소 접근)
     - ✅ `read:org` (조직 정보 읽기, 선택사항)
3. `Generate token` 클릭
4. **생성된 토큰을 안전하게 복사** (다시 볼 수 없습니다!)

### 환경 변수 설정

프로젝트 루트에 `.env` 파일 생성:

```bash
GITHUB_TOKEN=your_github_personal_access_token_here
```

## 🚀 설치

### NPM을 통한 전역 설치

```bash
npm install -g issue-scribe-mcp
```

### 로컬 개발

```bash
# 저장소 클론
git clone https://github.com/gay00ung/issue-scribe-mcp.git
cd issue-scribe-mcp

# 의존성 설치
npm install

# 빌드
npm run build

# 환경변수 설정
cp .env.example .env
# .env 파일에 GitHub Token 입력

# 직접 실행
node dist/index.js
```

## ⚙️ MCP 클라이언트 설정

### Claude Desktop 설정

Claude Desktop의 설정 파일(`claude_desktop_config.json`)에 다음 내용 추가:

**Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "issue-scribe": {
      "command": "node",
      "args": ["/path/to/issue-scribe-mcp/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "your_github_token_here"
      }
    }
  }
}
```

설정 후 Claude Desktop을 재시작하세요.

## 🛠️ 제공 Tools

### github_get_issue_context
GitHub Issue의 전체 컨텍스트를 조회합니다.

**파라미터:**
- `owner` (string, 필수): 저장소 소유자
- `repo` (string, 필수): 저장소 이름
- `issue_number` (number, 필수): 이슈 번호

**반환 정보:**
- Issue 제목, 본문, 상태
- 작성자 및 담당자 정보
- 라벨, 마일스톤
- 모든 댓글 및 반응

### github_get_pr_context
GitHub Pull Request의 전체 컨텍스트를 조회합니다 (커밋 포함).

**파라미터:**
- `owner` (string, 필수): 저장소 소유자
- `repo` (string, 필수): 저장소 이름
- `pull_number` (number, 필수): PR 번호

**반환 정보:**
- PR 제목, 본문, 상태
- 소스/타겟 브랜치
- 커밋 목록 및 변경 파일
- 리뷰 댓글 및 승인 상태

### github_create_issue
새로운 GitHub Issue를 생성합니다.

**파라미터:**
- `owner` (string, 필수): 저장소 소유자
- `repo` (string, 필수): 저장소 이름
- `title` (string, 필수): 이슈 제목
- `body` (string, 옵션): 이슈 본문
- `labels` (string[], 옵션): 라벨 배열
- `assignees` (string[], 옵션): 담당자 배열

### github_update_issue
기존 GitHub Issue를 수정합니다.

**파라미터:**
- `owner` (string, 필수): 저장소 소유자
- `repo` (string, 필수): 저장소 이름
- `issue_number` (number, 필수): 이슈 번호
- `title` (string, 옵션): 새 제목
- `body` (string, 옵션): 새 본문
- `state` (string, 옵션): `"open"` 또는 `"closed"`
- `labels` (string[], 옵션): 새 라벨 배열
- `assignees` (string[], 옵션): 새 담당자 배열

### github_create_pr
새로운 GitHub Pull Request를 생성합니다.

**파라미터:**
- `owner` (string, 필수): 저장소 소유자
- `repo` (string, 필수): 저장소 이름
- `title` (string, 필수): PR 제목
- `body` (string, 옵션): PR 설명
- `head` (string, 필수): 병합할 브랜치 (예: `"feature-branch"`)
- `base` (string, 필수): 병합 대상 브랜치 (예: `"main"`)
- `draft` (boolean, 옵션): Draft PR로 생성 여부
- `maintainer_can_modify` (boolean, 옵션): 메인테이너 수정 허용 여부

## 💡 사용 예시

### Claude Desktop에서 사용하기

설정이 완료되면 Claude Desktop에서 다음과 같이 사용할 수 있습니다:

```
"gay00ung/issue-scribe-mcp 저장소의 5번 Issue를 확인해줘"

"issue-scribe-mcp에 새로운 Issue를 만들어줘. 
제목은 'README 개선' 이고 본문은 'Features 섹션 추가 필요'"

"PR #3의 커밋 내역을 보여줘"
```

Claude가 자동으로 적절한 MCP Tool을 호출하여 정보를 가져옵니다!

## 🔧 문제 해결

### "GITHUB_TOKEN is not set" 오류

**원인**: GitHub Personal Access Token이 환경 변수로 설정되지 않았습니다.

**해결**:
1. `.env` 파일이 프로젝트 루트에 있는지 확인
2. `.env` 파일에 `GITHUB_TOKEN=your_token` 형식으로 작성되어 있는지 확인
3. Token이 유효한지 [GitHub Settings](https://github.com/settings/tokens)에서 확인

### "Bad credentials" 오류

**원인**: GitHub Token이 만료되었거나 잘못되었습니다.

**해결**:
1. GitHub에서 새 Personal Access Token 발급
2. `.env` 파일의 토큰을 업데이트
3. 필요한 권한(`repo` scope)이 부여되었는지 확인

### MCP 서버가 Claude Desktop에서 인식되지 않음

**원인**: 설정 파일 경로가 잘못되었거나 JSON 형식 오류가 있습니다.

**해결**:
1. `claude_desktop_config.json` 파일 위치 확인
2. JSON 형식이 올바른지 검증 ([JSONLint](https://jsonlint.com/) 사용)
3. 파일 경로가 절대 경로로 정확히 입력되었는지 확인
4. Claude Desktop 재시작

### "Cannot find module" 오류

**원인**: 의존성이 설치되지 않았거나 빌드가 되지 않았습니다.

**해결**:
```bash
npm install
npm run build
```

## 📝 라이선스

MIT License

## 🤝 기여

이슈 리포트와 Pull Request를 환영합니다!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📮 문의

프로젝트 링크: [https://github.com/gay00ung/issue-scribe-mcp](https://github.com/gay00ung/issue-scribe-mcp)
