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

### github.get_issue_context
GitHub Issue의 전체 컨텍스트 조회

- owner: 저장소 소유자
- repo: 저장소 이름
- issue_number: 이슈 번호

### github.get_pr_context
GitHub Pull Request의 전체 컨텍스트 조회 (커밋 포함)

- owner: 저장소 소유자
- repo: 저장소 이름
- pull_number: PR 번호

## 라이선스

MIT
