# AgentPay

AgentPay is a chat-approved stablecoin payment layer for AI agents, starting from BNB Chain with direct same-chain transfers and LI.FI swap/bridge routes.

`AGENTPAY_CONCEPT.md` remains the product and architecture source of truth. This repository implements the plugin-first, MCP-first AgentPay runtime with:

- `apps/mcp-server` for agent-facing MCP tools.
- `apps/setup-web` for wallet setup and signing.
- `packages/cli` for `npx @agentpay-ai/agentpay install`.
- `packages/skill` for the AgentPay `SKILL.md` behavior pack.
- `packages/shared` for shared types, chain metadata, tokens, and validation.
- `contracts` for the AgentPay smart account.
- `supabase/migrations` for offchain intent and audit storage.

## Commands

```bash
npm test
npm run typecheck
npm run demo:local
npm run contracts:bytecode
npm run release:smoke
npm run contracts:deploy:bnb
npx @agentpay-ai/agentpay doctor
npx @agentpay-ai/agentpay setup-web
npm --workspace @agentpay-ai/mcp-server test
npm --workspace @agentpay-ai/setup-web test
cd contracts && forge test
```

Use workspace tests while iterating on one package, then run `npm test` and `npm run typecheck` before handing off changes.

`npm run demo:local` runs a deterministic in-memory AgentPay flow with the real runtime tools: wallet setup intent, setup completion, wallet lookup, balance, invoice parsing, x402 parsing, LI.FI-style quote, `prepare_payment`, exact approval, `execute_payment`, `track_payment`, transaction history, and payment events. It does not need Supabase, RPC credentials, or private keys.

`npm run release:smoke` packs `@agentpay-ai/skill`, `@agentpay-ai/shared`, `@agentpay-ai/mcp-server`, `@agentpay-ai/setup-web`, and `@agentpay-ai/agentpay` into local tarballs, installs them into a temporary project, runs `npx @agentpay-ai/agentpay install`, and verifies `npx @agentpay-ai/agentpay doctor` with dummy non-secret config. Run it before publishing npm packages.

Use `docs/release-handoff.md` for the current local readiness summary, then `docs/launch-checklist.md` for the remaining external launch steps: Supabase project setup, BNB Chain testnet deployment, npm publish order, and demo video capture.

## Local Runtime Configuration

`npx @agentpay-ai/agentpay install` detects the target runtime from local project markers when possible, falls back to generic MCP instructions, and accepts `--runtime codex|claude|cursor|generic|hermes` when you want to choose explicitly. It writes an `AGENTPAY_CONFIG`-compatible JSON file, runtime-specific MCP instructions, `skills/agentpay/SKILL.md`, and the bundled smart account bytecode. The MCP server and setup web both read the generated config:

```bash
AGENTPAY_CONFIG=~/.agentpay/config.json npx @agentpay-ai/agentpay setup-web
```

After filling `~/.agentpay/config.json`, run `npx @agentpay-ai/agentpay doctor` to check MCP and setup-web readiness without starting services or printing secret values.

For setup web, fill `SETUP_DEPLOYER_PRIVATE_KEY` and either `AGENTPAY_ACCOUNT_BYTECODE` or `AGENTPAY_ACCOUNT_BYTECODE_PATH`. To generate a bytecode file from the Foundry artifact:

```bash
npm run contracts:bytecode
```

`npx @agentpay-ai/agentpay install` already writes `AgentPayAccount.bin` and points `AGENTPAY_ACCOUNT_BYTECODE_PATH` at it. Use `npm run contracts:bytecode` when developing contracts and refreshing the packaged bytecode asset.

## Contract Deployment

To deploy the standalone smart account with Foundry, set `BNB_RPC_URL`, `SETUP_DEPLOYER_PRIVATE_KEY`, `AGENTPAY_OWNER_ADDRESS`, and `AGENTPAY_EXECUTOR_ADDRESS`, then run:

```bash
npm run contracts:deploy:bnb
```

The script deploys `AgentPayAccount` with BNB Chain USDC and USDT pre-allowed and no initial route targets. Allow route targets later with `prepare_route_target_allowance`, or use setup web when route targets must be configured during wallet creation.

Wallet setup deploys `AgentPayAccount` with BNB Chain USDC and USDT pre-allowed so same-chain stablecoin payments can execute immediately after funding. Route targets remain separately allowlisted by the owner. To allow known LI.FI route targets at setup, set `AGENTPAY_INITIAL_ROUTE_TARGETS` to a comma-separated EVM address list before starting setup web. After setup, agents can call `check_route_target_allowance` and `prepare_route_target_allowance` to prepare the owner transaction for a new LI.FI target only when needed.

Setup signing messages include the setup ID, owner context, executor address, BNB Chain, expiry, and a warning that the signature only proves wallet ownership. They never approve a payment or token transfer.

Payment lifecycle changes are written to `payment_events`. Use `list_payment_events` with a payment intent ID to inspect audit history, failure details, and status transitions.

`quote_payment_route`, `prepare_payment`, and `prepare_contract_call` check the AgentPay wallet source-token balance before returning approval instructions. If the wallet is underfunded, top it up and prepare a fresh intent instead of asking for approval.

`execute_payment` claims an approved intent in storage before submitting the relayer transaction. Concurrent approval submissions for the same intent can only claim once, which prevents duplicate on-chain sends.

Invoice payments can start with `parse_invoice_payment`, which accepts structured invoice JSON or simple `key: value` invoice text and returns normalized `prepare_payment` fields for user review. Parser outputs include `paymentType` so prepared intents remain auditable as wallet, invoice, or x402 payments in `list_transactions`.

x402 payment prompts can start with `parse_x402_payment_required`, which accepts a v2 `PAYMENT-REQUIRED` object, JSON string, or base64 header and returns normalized `prepare_payment` fields. AgentPay can prepare the stablecoin transfer, but standard x402 exact endpoints still require a `PAYMENT-SIGNATURE` from an x402-capable signer unless the merchant supports direct/custom settlement.

Same-chain contract payments can use `prepare_contract_call` when the user has confirmed the target address, calldata, max token spend, max native fee, and purpose. The smart account enforces target allowlisting, calldata hash, max token spend, max native fee, nonce, deadline, and token allowance reset after the call.

Owner controls use `prepare_account_admin_transaction` to prepare pause, unpause, executor rotation, nonce cancellation, token allowlist, and withdrawal transactions. The owner wallet must still review and submit the returned transaction.
