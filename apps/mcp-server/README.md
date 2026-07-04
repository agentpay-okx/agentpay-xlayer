# @agentpay-ai/mcp-server

AgentPay MCP server and payment runtime tools.

Most users get this package through the CLI:

```bash
npx @agentpay-ai/agentpay install
npx @agentpay-ai/agentpay mcp
```

## Tools

The server exposes tools for wallet setup, balance checks, LI.FI route quotes, payment preparation, exact approval execution, payment tracking, invoice parsing, x402 parsing, route target allowance, and account admin transactions.

## Programmatic Usage

```ts
import { startAgentPayMcpServer } from "@agentpay-ai/mcp-server";

await startAgentPayMcpServer();
```

## Configuration

Provide runtime config through `AGENTPAY_CONFIG` or environment variables such as `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BNB_RPC_URL`, `EXECUTOR_PRIVATE_KEY`, `SETUP_WEB_URL`, and `LIFI_API_KEY`.

Keep service role keys and executor private keys on the server side only.
