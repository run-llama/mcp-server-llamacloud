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

// Define the tool definition interface
interface ToolDefinition {
  indexName: string;
  description: string;
  toolName?: string;
}

// Parse command line arguments
function parseToolDefinitions(): ToolDefinition[] {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(
      'No tool definitions provided. Use format: --index "IndexName" --description "Description"',
    );
    process.exit(1);
  }

  const toolDefinitions: ToolDefinition[] = [];
  let currentIndexName: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--index" && i + 1 < args.length) {
      // Save the current index name. We'll wait for the description to complete the definition
      currentIndexName = args[i + 1].trim();
      i++; // Skip the next argument since we consumed it
    } else if (
      args[i] === "--description" &&
      i + 1 < args.length &&
      currentIndexName
    ) {
      // We have both an index name and a description, so we can create a tool definition
      const description = args[i + 1].trim();
      const toolName = `get_information_${currentIndexName.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

      toolDefinitions.push({
        indexName: currentIndexName,
        description,
        toolName,
      });

      // Reset for the next pair
      currentIndexName = null;
      i++; // Skip the next argument since we consumed it
    }
  }

  // Check if we have an index without a description at the end
  if (currentIndexName) {
    console.warn(
      `Warning: Index '${currentIndexName}' was specified without a description.`,
    );
  }

  if (toolDefinitions.length === 0) {
    console.error(
      'No valid tool definitions found. Use format: --index "IndexName" --description "Description"',
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
    version: "0.1.0",
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

  const retriever = index.asRetriever();
  const nodesWithScore = await retriever.retrieve({ query });

  const nodes = nodesWithScore.map((node) => node.node);
  const context = nodes
    .map((r) => r.getContent(MetadataMode.NONE))
    .join("\n\n");

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
