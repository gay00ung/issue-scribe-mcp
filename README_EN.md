# issue-scribe-mcp

[![한국어](https://img.shields.io/badge/lang-한국어-blue.svg)](README.md)
[![English](https://img.shields.io/badge/lang-English-red.svg)](README_EN.md)

![npm version](https://img.shields.io/npm/v/issue-scribe-mcp.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![GitHub stars](https://img.shields.io/github/stars/gay00ung/issue-scribe-mcp.svg)

> An MCP (Model Context Protocol) server for collecting and managing GitHub Issue and Pull Request contexts. Easily query and create Issues and PRs from AI assistants like Claude Desktop.

## ✨ Features

- 🔍 **Context Retrieval**: Collect complete context including issue/PR details, comments, and commit history
- 📝 **Issue Management**: Create new issues and update existing ones
- 🔀 **PR Creation**: Automatically create Pull Requests with Draft PR support
- 🤖 **AI Integration**: Seamless integration with MCP-compatible AI tools like Claude Desktop
- 🔐 **Simple Authentication**: Secure API access via GitHub Personal Access Token

## 📋 Prerequisites

### GitHub Personal Access Token Setup

1. Navigate to [GitHub Personal Access Token creation page](https://github.com/settings/tokens/new)
2. Configure token settings:
   - **Note**: `issue-scribe-mcp` (or your preferred name)
   - **Expiration**: Select desired expiration period
   - **Select scopes**: Check the following permissions
     - ✅ `repo` (Full repository access)
     - ✅ `read:org` (Read organization info, optional)
3. Click `Generate token`
4. **Safely copy the generated token** (you won't be able to see it again!)

### Environment Variable Setup

Create a `.env` file in the project root:

```bash
GITHUB_TOKEN=your_github_personal_access_token_here
```

## 🚀 Installation

### Global Installation via NPM

```bash
npm install -g issue-scribe-mcp
```

## 🔄 Update

To update to the latest version:

```bash
npm update -g issue-scribe-mcp
```

Or reinstall with a specific version:

```bash
npm install -g issue-scribe-mcp@latest
```

Check currently installed version:

```bash
npm list -g issue-scribe-mcp
```

### Local Development

```bash
# Clone repository
git clone https://github.com/gay00ung/issue-scribe-mcp.git
cd issue-scribe-mcp

# Install dependencies
npm install

# Build
npm run build

# Set up environment variables
cp .env.example .env
# Add your GitHub Token to .env file

# Run directly
node dist/index.js
```

### Test with MCP Inspector

We provide a convenient script to test the MCP server locally:

```bash
./test-local.sh
```

This script automatically:
- ✅ Loads `.env` file
- ✅ Verifies `GITHUB_TOKEN`
- ✅ Checks build status
- ✅ **Launches MCP Inspector** (opens browser automatically)

You can test all Tools with a GUI and inspect API responses in MCP Inspector!

## ⚙️ MCP Client Configuration

### Claude Desktop Setup

Add the following to Claude Desktop's configuration file (`claude_desktop_config.json`):

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

Restart Claude Desktop after configuration.

## 🛠️ Available Tools

### github_get_issue_context
Retrieve full context of a GitHub Issue.

**Parameters:**
- `owner` (string, required): Repository owner
- `repo` (string, required): Repository name
- `issue_number` (number, required): Issue number

**Returns:**
- Issue title, body, state
- Author and assignee information
- Labels, milestones
- All comments and reactions

### github_get_pr_context
Retrieve full context of a GitHub Pull Request (including commits).

**Parameters:**
- `owner` (string, required): Repository owner
- `repo` (string, required): Repository name
- `pull_number` (number, required): PR number

**Returns:**
- PR title, body, state
- Source/target branches
- Commit list and changed files
- Review comments and approval status

### github_create_issue
Create a new GitHub Issue.

**Parameters:**
- `owner` (string, required): Repository owner
- `repo` (string, required): Repository name
- `title` (string, required): Issue title
- `body` (string, optional): Issue body
- `labels` (string[], optional): Array of labels
- `assignees` (string[], optional): Array of assignees

### github_update_issue
Update an existing GitHub Issue.

**Parameters:**
- `owner` (string, required): Repository owner
- `repo` (string, required): Repository name
- `issue_number` (number, required): Issue number
- `title` (string, optional): New title
- `body` (string, optional): New body
- `state` (string, optional): `"open"` or `"closed"`
- `labels` (string[], optional): New labels array
- `assignees` (string[], optional): New assignees array

### github_create_pr
Create a new GitHub Pull Request.

**Parameters:**
- `owner` (string, required): Repository owner
- `repo` (string, required): Repository name
- `title` (string, required): PR title
- `body` (string, optional): PR description
- `head` (string, required): Branch to merge from (e.g., `"feature-branch"`)
- `base` (string, required): Branch to merge into (e.g., `"main"`)
- `draft` (boolean, optional): Create as draft PR
- `maintainer_can_modify` (boolean, optional): Allow maintainer modifications

---

### github_add_comment
Add a comment to a GitHub Issue or Pull Request.

**Parameters:**
- `owner` (string, required): Repository owner
- `repo` (string, required): Repository name
- `issue_number` (number, required): Issue or PR number
- `body` (string, required): Comment body text

**Returns:**
- Comment ID, body, author
- Comment URL and creation time

### github_update_comment
Update an existing comment.

**Parameters:**
- `owner` (string, required): Repository owner
- `repo` (string, required): Repository name
- `comment_id` (number, required): Comment ID to update
- `body` (string, required): New comment body text

### github_delete_comment
Delete a comment.

**Parameters:**
- `owner` (string, required): Repository owner
- `repo` (string, required): Repository name
- `comment_id` (number, required): Comment ID to delete

### github_add_reaction
Add an emoji reaction to a comment or directly to an issue/PR.

**Parameters:**
- `owner` (string, required): Repository owner
- `repo` (string, required): Repository name
- `comment_id` (number, optional): Comment ID to react to
- `issue_number` (number, optional): Issue/PR number to react to
- `reaction` (string, required): Reaction type
  - `thumbs_up` 👍, `thumbs_down` 👎, `laugh` 😄, `confused` 😕, `heart` ❤️, `hooray` 🎉, `rocket` 🚀, `eyes` 👀

**Note**: Either `comment_id` OR `issue_number` must be provided.

### github_create_label
Create a new label in the repository.

**Parameters:**
- `owner` (string, required): Repository owner
- `repo` (string, required): Repository name
- `name` (string, required): Label name
- `color` (string, required): Hex color code without '#' (e.g., 'FF0000')
- `description` (string, optional): Label description

**Returns:**
- Label name, color, description
- Label URL

### github_update_label
Update an existing label's name, color, or description.

**Parameters:**
- `owner` (string, required): Repository owner
- `repo` (string, required): Repository name
- `name` (string, required): Current label name to update
- `new_name` (string, optional): New label name
- `color` (string, optional): New hex color code without '#'
- `description` (string, optional): New description

### github_delete_label
Delete a label from the repository.

**Parameters:**
- `owner` (string, required): Repository owner
- `repo` (string, required): Repository name
- `name` (string, required): Label name to delete

### github_list_labels
List all labels in the repository.

**Parameters:**
- `owner` (string, required): Repository owner
- `repo` (string, required): Repository name
- `per_page` (number, optional): Results per page, max 100 (default: 30)

**Returns:**
- Label count
- Each label's name, color, description, and URL

### github_list_branches
List all branches in the repository.

**Parameters:**
- `owner` (string, required): Repository owner
- `repo` (string, required): Repository name
- `protected` (boolean, optional): Filter by protected status
- `per_page` (number, optional): Results per page, max 100 (default: 30)

**Returns:**
- Branch count
- Each branch's name, commit SHA, and protected status

### github_create_branch
Create a new branch from an existing branch or commit.

**Parameters:**
- `owner` (string, required): Repository owner
- `repo` (string, required): Repository name
- `branch` (string, required): New branch name
- `ref` (string, required): Source branch name or commit SHA (e.g., 'main' or 'abc123')

**Returns:**
- Branch name, ref, SHA
- Branch URL

### github_delete_branch
Delete a branch from the repository.

**Parameters:**
- `owner` (string, required): Repository owner
- `repo` (string, required): Repository name
- `branch` (string, required): Branch name to delete

### github_compare_branches
Compare two branches and show the differences.

**Parameters:**
- `owner` (string, required): Repository owner
- `repo` (string, required): Repository name
- `base` (string, required): Base branch name
- `head` (string, required): Head branch name to compare

**Returns:**
- Comparison status (ahead/behind)
- Commit difference count
- Changed files list (additions/deletions/changes)
- Commit list

## 💡 Usage Examples

### Using with Claude Desktop

Once configured, you can use it in Claude Desktop like this:

```
"Check issue #5 in the gay00ung/issue-scribe-mcp repository"

"Create a new issue in issue-scribe-mcp. 
Title is 'Improve README' and body is 'Need to add Features section'"

"Show me the commit history of PR #3"
```

Claude will automatically call the appropriate MCP tools to fetch the information!

## 🔧 Troubleshooting

### "GITHUB_TOKEN is not set" Error

**Cause**: GitHub Personal Access Token is not set as an environment variable.

**Solution**:
1. Check if `.env` file exists in project root
2. Verify `.env` file is formatted as `GITHUB_TOKEN=your_token`
3. Confirm token is valid in [GitHub Settings](https://github.com/settings/tokens)

### "Bad credentials" Error

**Cause**: GitHub Token is expired or invalid.

**Solution**:
1. Generate a new Personal Access Token from GitHub
2. Update the token in `.env` file
3. Verify required permissions (`repo` scope) are granted

### MCP Server Not Recognized in Claude Desktop

**Cause**: Configuration file path is incorrect or JSON format error.

**Solution**:
1. Verify `claude_desktop_config.json` file location
2. Validate JSON format using [JSONLint](https://jsonlint.com/)
3. Ensure file paths are absolute and correct
4. Restart Claude Desktop

### "Cannot find module" Error

**Cause**: Dependencies are not installed or build has not been run.

**Solution**:
```bash
npm install
npm run build
```

## 📝 License

MIT License

## 🤝 Contributing

Issue reports and Pull Requests are welcome!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📮 Contact

Project Link: [https://github.com/gay00ung/issue-scribe-mcp](https://github.com/gay00ung/issue-scribe-mcp)
