#!/usr/bin/env node

/**
 * This is a MCP server that connects to multiple managed indexes on LlamaCloud.
 * Each index is exposed as a separate tool.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { LlamaCloudIndex, MetadataMode } from "llamaindex";
import packageJson from "../package.json" with { type: "json" };

// Define the tool definition interface
interface ToolDefinition {
  indexName: string;
  description: string;
  toolName?: string;
  similarityTopK?: number;
}

// Parse command line arguments
function parseToolDefinitions(): ToolDefinition[] {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(
      'No tool definitions provided. Use format: --index "IndexName" --description "Description" [--topK N]',
    );
    process.exit(1);
  }

  const toolDefinitions: ToolDefinition[] = [];
  let currentTool: Partial<ToolDefinition> = {};

  const pushCurrentTool = () => {
    if (Object.keys(currentTool).length > 0) {
      if (currentTool.indexName && currentTool.description) {
        currentTool.toolName = `get_information_${currentTool.indexName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "_")}`;
        toolDefinitions.push(currentTool as ToolDefinition);
      } else {
        console.warn(
          `Warning: Incomplete tool definition for index '${currentTool.indexName}'. It requires at least --index and --description. Skipping.`,
        );
      }
    }
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const value = args[i + 1];

    if (arg === "--index") {
      pushCurrentTool();
      currentTool = { indexName: value?.trim() };
      i++;
    } else if (arg === "--description" && value) {
      currentTool.description = value.trim();
      i++;
    } else if (arg === "--topK" && value) {
      const topK = parseInt(value, 10);
      if (!isNaN(topK)) {
        currentTool.similarityTopK = topK;
      } else {
        console.warn(
          `Warning: Invalid value for --topK: ${value}. Must be an integer.`,
        );
      }
      i++;
    }
  }

  pushCurrentTool();

  if (toolDefinitions.length === 0) {
    console.error(
      'No valid tool definitions found. Use format: --index "IndexName" --description "Description" [--topK N]',
    );
    process.exit(1);
  }

  return toolDefinitions;
}

/**
 * Create an MCP server with capabilities for tools
 */
const server = new Server(
  {
    name: "llamacloud-mcp-server",
    version: packageJson.version,
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Get the project name and API key from environment variables
const projectName = process.env.LLAMA_CLOUD_PROJECT_NAME || "Default";
const apiKey =
  process.env.LLAMA_CLOUD_API_KEY ||
  (() => {
    throw new Error("LLAMA_CLOUD_API_KEY is not set");
  })();

// Parse tool definitions from command line arguments
const toolDefinitions = parseToolDefinitions();

// Create indexes for each tool definition
const indexes = new Map<string, LlamaCloudIndex>();

for (const definition of toolDefinitions) {
  const index = new LlamaCloudIndex({
    name: definition.indexName,
    projectName,
    apiKey,
  });

  indexes.set(definition.toolName!, index);
  process.stderr.write(
    `Created index for tool ${definition.toolName}: ${definition.indexName} - ${definition.description}\n`,
  );
}

/**
 * Handler that lists available tools.
 * Exposes a tool for each index that lets clients retrieve information.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: toolDefinitions.map((definition) => ({
      name: definition.toolName!,
      description: `Get information from the ${definition.indexName} index. The index contains ${definition.description}`,
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: `The query used to get information from the ${definition.indexName} index.`,
          },
        },
        required: ["query"],
      },
    })),
  };
});

/**
 * Handler for tool calls.
 * Routes requests to the appropriate index based on the tool name.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const index = indexes.get(toolName);

  if (!index) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  const query = String(request.params.arguments?.query);
  if (!query) {
    throw new Error("query parameter is required");
  }

  const toolDefinition = toolDefinitions.find(
    (def) => def.toolName === toolName,
  );

  const retriever = index.asRetriever({
    similarityTopK: toolDefinition?.similarityTopK,
  });
  const nodesWithScore = await retriever.retrieve({ query });

  const nodes = nodesWithScore.map((node) => node.node);
  const context = nodes.map((r) => r.getContent(MetadataMode.LLM)).join("\n\n");

  return {
    content: [
      {
        type: "text",
        text: context,
      },
    ],
  };
});

/**
 * Start the server using stdio transport.
 * This allows the server to communicate via standard input/output streams.
 */
async function main() {
  process.stderr.write(
    `Starting MCP server with ${toolDefinitions.length} tools:\n`,
  );
  toolDefinitions.forEach((def) => {
    process.stderr.write(
      `- ${def.toolName}: ${def.indexName} - ${def.description}\n`,
    );
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
