import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MidiRepository } from "./midi-repo.js";
import { registerMidiTools } from "./tools.js";

const server = new McpServer(
  { name: "midi-file-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

const repo = new MidiRepository();
registerMidiTools(server, repo);

const transport = new StdioServerTransport();
await server.connect(transport);
