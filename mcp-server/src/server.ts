import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";

function readPackageVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8")
  ) as { version?: unknown };

  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error("mcp-server/package.json must contain a non-empty version");
  }

  return packageJson.version;
}

export const SERVER_VERSION = readPackageVersion();

export function createServer(): McpServer {
  const server = new McpServer({
    name: "design-screenshots",
    version: SERVER_VERSION,
  });

  registerTools(server);
  return server;
}
