# LlamaCloud MCP Server

A MCP server connecting to multiple managed indexes on [LlamaCloud](https://cloud.llamaindex.ai/)

This is a TypeScript-based MCP server that creates multiple tools, each connected to a specific managed index on LlamaCloud. Each tool is defined through command-line arguments.

<a href="https://glama.ai/mcp/servers/o4fcj7x2cg"><img width="380" height="200" src="https://glama.ai/mcp/servers/o4fcj7x2cg/badge" alt="LlamaCloud Server MCP server" /></a>

## Features

### Tools

- Creates a separate tool for each index you define
- Each tool provides a `query` parameter to search its specific index
- Auto-generates tool names like `get_information_index_name` based on index names

## Development

Install dependencies:

```bash
npm install
```

Build the server:

```bash
npm run build
```

For development with auto-rebuild:

```bash
npm run watch
```

## Installation

To use with Claude Desktop, add the server config:

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "llamacloud": {
      "command": "node",
      "args": [
        "/path/to/llamacloud/build/index.js",
        "--index",
        "10k-SEC-Tesla",
        "--description",
        "10k SEC documents from 2023 for Tesla",
        "--index",
        "10k-SEC-Apple",
        "--description",
        "10k SEC documents from 2023 for Apple"
      ],
      "env": {
        "LLAMA_CLOUD_PROJECT_NAME": "<YOUR_PROJECT_NAME>",
        "LLAMA_CLOUD_API_KEY": "<YOUR_API_KEY>"
      }
    }
  }
}
```

### Tool Definition Format

You can define multiple tools by providing pairs of `--index` and `--description` arguments. Each tool definition follows this format:

```
--index "IndexName" --description "Description text"
```

For example:

```bash
node build/index.js --index "10k-SEC-Tesla" --description "10k SEC documents from 2023 for Tesla" --index "10k-SEC-Apple" --description "10k SEC documents from 2023 for Apple"
```

This will create two tools:

1. `get_information_10k_sec_tesla` - For querying the 10k-SEC-Tesla index
2. `get_information_10k_sec_apple` - For querying the 10k-SEC-Apple index

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.
