import { createSetupWebDependencies, loadSetupWebConfigEnv, parseSetupWebEnv } from "./runtime.ts";
import { startSetupWebServer } from "./server.ts";

const config = parseSetupWebEnv(loadSetupWebConfigEnv(process.env));
const server = await startSetupWebServer(createSetupWebDependencies(config), {
  port: config.setupWebPort ?? 3000,
});

console.log(`AgentPay setup web listening at ${server.url}`);
