# @agentpay-ai/setup-web

Local setup and signing web server for AgentPay wallets.

Most users start it through the CLI:

```bash
npx @agentpay-ai/agentpay setup-web
```

## What It Does

- Displays setup intent details for the human owner.
- Collects an owner signature that proves wallet ownership.
- Deploys or records the AgentPay smart account using server-side config.
- Keeps setup signatures separate from payment approval.

## Programmatic Usage

```ts
import { createSetupWebDependencies, parseSetupWebEnv, startSetupWebServer } from "@agentpay-ai/setup-web";

const config = parseSetupWebEnv(process.env);
await startSetupWebServer(createSetupWebDependencies(config));
```

## Configuration

Required values include `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `XLAYER_RPC_URL`, and `SETUP_DEPLOYER_PRIVATE_KEY`. Add `XLAYER_MAINNET_RPC_URL` and `XLAYER_TESTNET_RPC_URL` when setup intents may deploy on either X Layer network. Provide `AGENTPAY_ACCOUNT_BYTECODE_PATH` or `AGENTPAY_ACCOUNT_BYTECODE` when deploying accounts.
