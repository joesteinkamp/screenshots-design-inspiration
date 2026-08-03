import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, SERVER_VERSION } from "../dist/server.js";

const EXPECTED_PLATFORMS = ["Web", "iOS", "Android", "Email"];
const EXPECTED_PLATFORM_TOOLS = [
  "browse_by_platform",
  "get_product_screenshots",
  "get_random_inspiration",
  "list_tags",
  "search_inspiration",
  "search_screenshots_by_tags",
];

test("advertises the released version and split mobile platforms", async (t) => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8")
  );
  const server = createServer();
  const client = new Client({ name: "platform-regression-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  assert.equal(SERVER_VERSION, packageJson.version);
  assert.equal(client.getServerVersion()?.version, packageJson.version);

  const { tools } = await client.listTools();
  const platformTools = tools.filter(
    (tool) => tool.inputSchema.properties?.platform
  );

  assert.deepEqual(
    platformTools.map((tool) => tool.name).sort(),
    EXPECTED_PLATFORM_TOOLS
  );
  for (const tool of platformTools) {
    assert.deepEqual(
      tool.inputSchema.properties.platform.enum,
      EXPECTED_PLATFORMS,
      `${tool.name} should expose Android and iOS instead of Mobile`
    );
  }

  assert.equal(JSON.stringify(tools).includes('"Mobile"'), false);
});
