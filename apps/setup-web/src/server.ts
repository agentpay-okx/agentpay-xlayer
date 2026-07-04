import { createServer } from "node:http";

import {
  checkWalletCreationInputSchema,
  completeWalletSetupInputSchema,
  type CompleteWalletSetupInput,
  type SetupIntentRecord,
} from "@agentpay-ai/shared";

import type { CompleteWalletSetupOutput } from "./services/complete-wallet-setup.ts";

export interface SetupWebDependencies {
  getSetupIntent(setupIntentId: string): Promise<SetupIntentRecord | null>;
  completeWalletSetup(input: CompleteWalletSetupInput): Promise<CompleteWalletSetupOutput>;
  clock: () => Date;
}

export function createSetupWebHandler(dependencies: SetupWebDependencies) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/setup")) {
      return htmlResponse(renderSetupPage());
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/setup-intents/")) {
      return handleGetSetupIntent(url.pathname, dependencies);
    }

    if (request.method === "POST" && url.pathname === "/api/setup-complete") {
      return handleSetupComplete(request, dependencies);
    }

    return jsonResponse({ error: "Not found." }, 404);
  };
}

export function renderSetupPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AgentPay setup</title>
    <style>${setupPageCss}</style>
  </head>
  <body>
    <main class="setup-shell" id="setup-root">
      <section class="setup-panel" aria-labelledby="setup-title">
        <div class="setup-header">
          <div>
            <p class="setup-kicker">AgentPay setup</p>
            <h1 id="setup-title">Create the wallet your agent can use with approval.</h1>
          </div>
          <span class="status-pill" id="status-pill">Loading</span>
        </div>

        <div class="notice" id="notice" role="status">
          Loading setup intent...
        </div>

        <dl class="intent-grid" aria-label="Setup details">
          <div>
            <dt>Setup intent</dt>
            <dd id="setup-intent-id">-</dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd id="owner-address">-</dd>
          </div>
          <div>
            <dt>Executor</dt>
            <dd id="executor-address">-</dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd id="expires-at">-</dd>
          </div>
        </dl>

        <label class="message-label" for="message-to-sign">Message to sign</label>
        <pre class="message-box" id="message-to-sign">-</pre>

        <div class="action-row">
          <button class="primary-action" id="connect-button" type="button">Connect wallet</button>
          <button class="secondary-action" id="sign-button" type="button" disabled>Sign setup message</button>
        </div>

        <p class="footnote">
          This signature only proves wallet ownership for setup. It does not approve a payment or token transfer.
        </p>
      </section>
    </main>
    <script>
      window.AgentPaySetup = ${clientScript};
      window.AgentPaySetup.start();
    </script>
  </body>
</html>`;
}

export async function startSetupWebServer(
  dependencies: SetupWebDependencies,
  options: { port?: number; hostname?: string } = {},
): Promise<{ close(): Promise<void>; url: string }> {
  const handler = createSetupWebHandler(dependencies);
  const server = createServer(async (request, response) => {
    const origin = `http://${request.headers.host ?? "localhost"}`;
    const webRequest = new Request(new URL(request.url ?? "/", origin), {
      method: request.method,
      headers: request.headers as HeadersInit,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request,
      duplex: "half",
    } as RequestInit);
    const webResponse = await handler(webRequest);

    response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers.entries()));
    response.end(Buffer.from(await webResponse.arrayBuffer()));
  });
  const port = options.port ?? 3000;
  const hostname = options.hostname ?? "127.0.0.1";

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, hostname, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return {
    url: `http://${hostname}:${port}/setup`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function handleGetSetupIntent(pathname: string, dependencies: SetupWebDependencies): Promise<Response> {
  const setupIntentId = decodeURIComponent(pathname.replace("/api/setup-intents/", ""));
  const input = checkWalletCreationInputSchema.parse({ setupIntentId });
  const intent = await dependencies.getSetupIntent(input.setupIntentId);

  if (!intent) {
    return jsonResponse({ error: `Setup intent ${input.setupIntentId} was not found.` }, 404);
  }

  return jsonResponse({
    setupIntentId: intent.id,
    ownerAddress: intent.ownerAddress,
    executorAddress: intent.executorAddress,
    messageToSign: intent.messageToSign,
    status: pendingExpiredStatus(intent, dependencies.clock()),
    expiresAt: intent.expiresAt,
    accountAddress: intent.accountAddress,
    completedAt: intent.completedAt,
  });
}

async function handleSetupComplete(request: Request, dependencies: SetupWebDependencies): Promise<Response> {
  try {
    const input = completeWalletSetupInputSchema.parse(await request.json());
    return jsonResponse(await dependencies.completeWalletSetup(input));
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Setup completion failed." }, 400);
  }
}

function pendingExpiredStatus(intent: SetupIntentRecord, now: Date): SetupIntentRecord["status"] {
  return ["PENDING", "SIGNED", "DEPLOYING"].includes(intent.status) && new Date(intent.expiresAt).getTime() <= now.getTime()
    ? "EXPIRED"
    : intent.status;
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

const setupPageCss = `
:root {
  color-scheme: light;
  --bg: oklch(1 0 0);
  --surface: oklch(0.973 0.006 170);
  --surface-strong: oklch(0.938 0.012 170);
  --ink: oklch(0.185 0.026 184);
  --muted: oklch(0.426 0.022 184);
  --primary: oklch(0.445 0.092 172);
  --primary-hover: oklch(0.390 0.096 172);
  --accent: oklch(0.590 0.152 26);
  --border: oklch(0.868 0.012 176);
  --danger: oklch(0.540 0.170 29);
  --success: oklch(0.470 0.120 150);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
}

button,
pre {
  font: inherit;
}

.setup-shell {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 18px;
  background:
    linear-gradient(180deg, var(--surface), transparent 42%),
    var(--bg);
}

.setup-panel {
  width: min(760px, 100%);
  border: 1px solid var(--border);
  background: var(--bg);
  border-radius: 12px;
  padding: 28px;
}

.setup-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 22px;
}

.setup-kicker {
  margin: 0 0 8px;
  color: var(--primary);
  font-size: 0.93rem;
  font-weight: 700;
}

h1 {
  margin: 0;
  max-width: 13ch;
  font-size: 2rem;
  line-height: 1.08;
  letter-spacing: 0;
  text-wrap: balance;
}

.status-pill {
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--surface-strong);
  color: var(--ink);
  padding: 7px 11px;
  font-size: 0.84rem;
  font-weight: 700;
}

.notice {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--ink);
  padding: 13px 14px;
  margin-bottom: 18px;
  line-height: 1.45;
}

.notice[data-tone="error"] {
  border-color: var(--danger);
  color: var(--danger);
  background: oklch(0.975 0.018 29);
}

.notice[data-tone="success"] {
  border-color: var(--success);
  color: var(--success);
  background: oklch(0.975 0.018 150);
}

.intent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px;
  margin: 0 0 18px;
}

.intent-grid div {
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  background: var(--surface);
}

dt {
  margin-bottom: 5px;
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 700;
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.88rem;
}

.message-label {
  display: block;
  margin-bottom: 8px;
  color: var(--muted);
  font-weight: 700;
}

.message-box {
  min-height: 128px;
  max-height: 240px;
  overflow: auto;
  margin: 0;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: oklch(0.985 0.004 170);
  color: var(--ink);
  padding: 14px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.88rem;
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

button {
  min-height: 42px;
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0 15px;
  font-weight: 800;
  cursor: pointer;
  transition: background-color 160ms ease-out, border-color 160ms ease-out, color 160ms ease-out;
}

button:focus-visible {
  outline: 3px solid oklch(0.760 0.105 172);
  outline-offset: 2px;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.primary-action {
  background: var(--primary);
  color: white;
}

.primary-action:hover:not(:disabled) {
  background: var(--primary-hover);
}

.secondary-action {
  background: var(--bg);
  border-color: var(--border);
  color: var(--ink);
}

.secondary-action:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--primary);
}

.footnote {
  margin: 18px 0 0;
  max-width: 68ch;
  color: var(--muted);
  line-height: 1.55;
}

@media (max-width: 640px) {
  .setup-panel {
    padding: 20px;
  }

  .setup-header {
    display: block;
  }

  .status-pill {
    display: inline-flex;
    margin-top: 14px;
  }

  h1 {
    max-width: none;
    font-size: 1.6rem;
  }

  .action-row button {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    transition-duration: 1ms !important;
  }
}
`;

const clientScript = `(() => {
  const state = {
    setupIntentId: new URLSearchParams(window.location.search).get("setup_intent_id") || "",
    intent: null,
    account: "",
  };

  const elements = {};

  function get(id) {
    return document.getElementById(id);
  }

  function setNotice(message, tone) {
    elements.notice.textContent = message;
    if (tone) {
      elements.notice.dataset.tone = tone;
    } else {
      delete elements.notice.dataset.tone;
    }
  }

  function setStatus(status) {
    elements.status.textContent = status;
  }

  function sameAddress(left, right) {
    return left && right && left.toLowerCase() === right.toLowerCase();
  }

  function hasOwnerMismatch() {
    return Boolean(state.intent && state.intent.ownerAddress && state.account && !sameAddress(state.intent.ownerAddress, state.account));
  }

  function setBusy(isBusy) {
    elements.connect.disabled = isBusy;
    elements.sign.disabled = isBusy || !state.intent || !state.account || state.intent.status !== "PENDING" || hasOwnerMismatch();
  }

  async function loadIntent() {
    if (!state.setupIntentId) {
      setStatus("Missing");
      setNotice("The setup link is missing a setup_intent_id.", "error");
      setBusy(false);
      return;
    }

    const response = await fetch("/api/setup-intents/" + encodeURIComponent(state.setupIntentId));
    const body = await response.json();

    if (!response.ok) {
      setStatus("Unavailable");
      setNotice(body.error || "Setup intent could not be loaded.", "error");
      setBusy(false);
      return;
    }

    state.intent = body;
    elements.intentId.textContent = body.setupIntentId;
    elements.owner.textContent = body.ownerAddress || "Signing wallet";
    elements.executor.textContent = body.executorAddress;
    elements.expires.textContent = new Date(body.expiresAt).toLocaleString();
    elements.message.textContent = body.messageToSign;
    setStatus(body.status);

    if (body.status === "COMPLETED") {
      setNotice("Wallet setup is complete. You can return to chat and ask AgentPay to check the wallet.", "success");
    } else if (body.status === "EXPIRED") {
      setNotice("This setup link has expired. Return to chat and ask AgentPay for a new setup link.", "error");
    } else {
      setNotice("Review this setup message, connect the owner wallet, then sign. This does not approve a payment.");
    }

    setBusy(false);
  }

  async function connectWallet() {
    if (!window.ethereum) {
      setNotice("No injected wallet was found. Open this page in a browser with an EVM wallet extension.", "error");
      return;
    }

    setBusy(true);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      state.account = accounts[0] || "";
      if (hasOwnerMismatch()) {
        setNotice("Connected wallet does not match the expected owner address. Switch wallets before signing.", "error");
      } else {
        setNotice("Connected " + state.account + ". Review the message before signing.");
      }
    } catch (error) {
      setNotice(error && error.message ? error.message : "Wallet connection failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function signSetupMessage() {
    if (!window.ethereum || !state.intent || !state.account) {
      return;
    }

    if (hasOwnerMismatch()) {
      setNotice("Connected wallet does not match the expected owner address. Switch wallets before signing.", "error");
      setBusy(false);
      return;
    }

    setBusy(true);
    try {
      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [state.intent.messageToSign, state.account],
      });
      const response = await fetch("/api/setup-complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupIntentId: state.setupIntentId, signature }),
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || "Setup completion failed.");
      }

      setStatus("COMPLETED");
      setNotice("AgentPay wallet created at " + body.accountAddress + ". Return to chat to continue.", "success");
      state.intent.status = "COMPLETED";
    } catch (error) {
      setNotice(error && error.message ? error.message : "Signing failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  function start() {
    elements.notice = get("notice");
    elements.status = get("status-pill");
    elements.intentId = get("setup-intent-id");
    elements.owner = get("owner-address");
    elements.executor = get("executor-address");
    elements.expires = get("expires-at");
    elements.message = get("message-to-sign");
    elements.connect = get("connect-button");
    elements.sign = get("sign-button");
    elements.connect.addEventListener("click", connectWallet);
    elements.sign.addEventListener("click", signSetupMessage);
    loadIntent().catch((error) => {
      setStatus("Error");
      setNotice(error && error.message ? error.message : "Setup intent could not be loaded.", "error");
    });
  }

  return { start };
})()`;
