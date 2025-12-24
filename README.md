# issue-scribe-mcp

GitHub Issue/PR 컨텍스트를 수집하는 MCP 서버

## 설치

```bash
npm install -g issue-scribe-mcp
```

## 로컬 개발

```bash
# 의존성 설치
npm install

# 빌드
npm run build

# 환경변수 설정
export GITHUB_TOKEN=your_github_token_here

# 직접 실행
node dist/index.js
```

## MCP 클라이언트 설정

Claude Desktop 등의 MCP 클라이언트에서 사용:

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

## 제공 Tools

### github_get_issue_context
GitHub Issue의 전체 컨텍스트 조회

- owner: 저장소 소유자
- repo: 저장소 이름
- issue_number: 이슈 번호

### github_get_pr_context
GitHub Pull Request의 전체 컨텍스트 조회 (커밋 포함)

- owner: 저장소 소유자
- repo: 저장소 이름
- pull_number: PR 번호

### github_create_issue
새로운 GitHub Issue 생성

- owner: 저장소 소유자
- repo: 저장소 이름
- title: 이슈 제목 (필수)
- body: 이슈 본문 (옵션)
- labels: 라벨 배열 (옵션)
- assignees: 담당자 배열 (옵션)

### github_update_issue
기존 GitHub Issue 수정

- owner: 저장소 소유자
- repo: 저장소 이름
- issue_number: 이슈 번호
- title: 새 제목 (옵션)
- body: 새 본문 (옵션)
- state: "open" 또는 "closed" (옵션)
- labels: 새 라벨 배열 (옵션)
- assignees: 새 담당자 배열 (옵션)

### github_create_pr
새로운 GitHub Pull Request 생성

- owner: 저장소 소유자
- repo: 저장소 이름
- title: PR 제목 (필수)
- body: PR 설명 (옵션)
- head: 병합할 브랜치 (필수, 예: "feature-branch")
- base: 병합 대상 브랜치 (필수, 예: "main")
- draft: Draft PR로 생성 (옵션)
- maintainer_can_modify: 메인테이너 수정 허용 (옵션)

## 라이선스

ISC
