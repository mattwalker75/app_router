/**
 * Start App Router: read config.json, open the links file, listen, and begin
 * the health checks. By default only this computer can connect; Settings →
 * Access → "Allow other devices on my network" opens it to the network
 * (takes effect after a restart).
 */
import http from "node:http";
import { createApp, VERSION } from "./app.js";
import { Config } from "./config.js";
import { listen, networkUrls, urlFor } from "./security.js";

let config: Config, handle: ReturnType<typeof createApp>;
try {
  config = new Config();
  handle = createApp(config);
} catch (e) {
  // a config.json or links file that can't be read: say so plainly and change nothing
  console.error((e as Error).message);
  process.exit(1);
}
const c = config.get();
const port = Number(process.env.PORT) || c.server.port;
const server = http.createServer(handle.app);

try {
  handle.listening = await listen(server, port, c.server.allowNetwork);
} catch (e) {
  const err = e as NodeJS.ErrnoException;
  console.error(err.code === "EADDRINUSE" ? `Port ${port} is already in use — is App Router already running (./ROUTER.sh --status), or is another web server using it? Change server.port in config.json to use another port.`
    : err.code === "EACCES" ? `This computer does not allow port ${port} without administrator rights. Use a port of 1024 or higher (server.port in config.json), or start with sudo.`
    : err.message);
  process.exit(1);
}

console.log(`App Router ${VERSION} — ${urlFor("localhost", port)}`);
if (c.server.allowNetwork) for (const u of networkUrls(port)) console.log(`  on your network: ${u}`);
else console.log(handle.listening.localOnlyFilter ? "  only this computer can open it (a low port: listening on every address, accepting this computer only)" : "  only this computer can open it");
console.log(`  config: ${config.file}`);
console.log(`  links:  ${handle.service.dataFile()} (${handle.service.page().links.length} links)`);
console.log(`  login:  ${c.security.loginEnabled ? "on" : "off"}`);
console.log(`  health checks: ${c.health.enabled ? `every ${c.health.intervalSeconds} seconds` : "off"}`);
if (c.server.allowNetwork && !c.security.loginEnabled) console.log("  NOTE: network access is on and the login is off — anyone on your network can open the page and change it.");
handle.health.start();

function shutdown(signal: string) {
  console.log(`\n${signal} — shutting down…`);
  handle.health.stop();
  server.close();
  server.closeAllConnections?.();
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (e) => console.error("[unhandled]", e));
