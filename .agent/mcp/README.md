# MCP Server Configuration Library

This directory contains reusable MCP (Model Context Protocol) server configurations
that can be enabled on a per-project basis.

## Quick Start

Use the `mcp-enable` command to add servers to your project:

```bash
# List available servers
mcp-enable --list

# Enable specific servers
mcp-enable github playwright

# Enable all web development servers
mcp-enable github playwright chrome-devtools
```

## Available Servers

| Server | Description | Required Environment |
|--------|-------------|---------------------|
| `github` | GitHub API operations (issues, PRs, repos) | `GITHUB_TOKEN` |
| `playwright` | Browser automation for testing | None |
| `chrome-devtools` | Chrome DevTools for debugging | None |
| `cdk` | AWS CDK infrastructure as code | AWS credentials |
| `bedrock` | Amazon Bedrock AI services | AWS credentials |
| `strands` | Strands agent framework | None |
| `aws-knowledge` | AWS documentation and recommendations (HTTP) | None |
| `context7` | Library documentation lookup (HTTP) | None |

## How It Works

1. Global config (`~/.claude.json`) contains only lightweight HTTP servers
2. Project-specific servers go in `.mcp.json` at project root
3. `mcp-enable` merges server configs from this library into `.mcp.json`

## Environment Variables

Some servers require environment variables:

### GitHub Server
```bash
export GITHUB_TOKEN="ghp_xxxxxxxxxxxx"
```

### AWS Servers (cdk, bedrock)
```bash
# Via AWS CLI configuration or:
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_REGION="us-east-1"
```

## Manual Configuration

If you prefer manual configuration, compose your own `.mcp.json` at the
project root. Individual server config templates are planned; for now,
use the examples below as a starting point:

```json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

## DevContainer Usage

When working inside a DevContainer, **HTTP MCP servers declared in `.mcp.json`
work automatically** because the project root is mounted into the container.

However, servers defined only in the global `~/.claude.json` require extra
propagation steps (bind mounts, path rewriting in `post-start.sh`). To avoid
this complexity, **add HTTP servers to `.mcp.json` via `mcp-enable`**:

```bash
# Add HTTP servers to the project (works on host and in container)
mcp-enable aws-knowledge context7
```

This is the recommended approach for downstream projects that use DevContainers.
Stdio-based servers (e.g., `github`, `playwright`) must still be declared in
`.mcp.json` since they require local binaries.

## Directory Structure

```
mcp/
├── README.md           # This file
└── servers/
    ├── github.json          # GitHub MCP server
    ├── playwright.json      # Playwright browser automation
    ├── chrome-devtools.json
    ├── cdk.json             # AWS CDK
    ├── bedrock.json         # AWS Bedrock
    ├── strands.json         # Strands agents
    ├── aws-knowledge.json   # AWS documentation (HTTP)
    └── context7.json        # Library docs lookup (HTTP)
```
