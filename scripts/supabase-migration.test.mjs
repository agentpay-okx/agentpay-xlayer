import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const migrationPath = "supabase/migrations/20260702143000_agentpay_schema.sql";
const migrationsDir = "supabase/migrations";
const requiredTables = ["setup_intents", "agent_wallets", "payment_intents", "payment_events"];
const requiredSecurityStatements = [
  "alter table public.setup_intents enable row level security",
  "alter table public.agent_wallets enable row level security",
  "alter table public.payment_intents enable row level security",
  "alter table public.payment_events enable row level security",
  "revoke all on table public.setup_intents from anon, authenticated",
  "revoke all on table public.agent_wallets from anon, authenticated",
  "revoke all on table public.payment_intents from anon, authenticated",
  "revoke all on table public.payment_events from anon, authenticated",
];
const requiredIndexes = [
  "create index if not exists setup_intents_status_expires_at_idx on public.setup_intents (status, expires_at)",
  "create index if not exists agent_wallets_status_created_at_idx on public.agent_wallets (status, created_at desc)",
  "create index if not exists payment_intents_created_at_idx on public.payment_intents (created_at desc)",
  "create index if not exists payment_intents_status_deadline_idx on public.payment_intents (status, deadline)",
  "create index if not exists payment_events_payment_intent_id_created_at_idx on public.payment_events (payment_intent_id, created_at desc)",
];

function normalizeSql(sql) {
  return sql
    .replace(/\s+/g, " ")
    .replace(/\s*;\s*/g, ";")
    .trim()
    .toLowerCase();
}

describe("AgentPay Supabase migration", () => {
  it("defines runtime tables with RLS and query-aligned indexes", async () => {
    const sql = normalizeSql(await readFile(migrationPath, "utf8"));

    for (const tableName of requiredTables) {
      assert.match(sql, new RegExp(`create table if not exists public\\.${tableName}\\b`), tableName);
    }

    for (const statement of requiredSecurityStatements) {
      assert.ok(sql.includes(statement), statement);
    }

    for (const index of requiredIndexes) {
      assert.ok(sql.includes(index), index);
    }
  });

  it("includes an upgrade migration for payment intent direct tracking schema drift", async () => {
    const migrationNames = await readdir(migrationsDir);
    const upgradeMigrationName = migrationNames.find((name) => name.endsWith("_align_payment_intents_live_schema.sql"));

    assert.ok(upgradeMigrationName, "Expected a live schema alignment migration");

    const sql = normalizeSql(await readFile(`${migrationsDir}/${upgradeMigrationName}`, "utf8"));

    assert.ok(sql.includes("add column if not exists completed_at timestamptz"), "completed_at upgrade");
    assert.ok(sql.includes("drop constraint if exists payment_intents_route_provider_check"), "route provider drop");
    assert.ok(
      sql.includes("add constraint payment_intents_route_provider_check check (route_provider in ('direct', 'li.fi', 'contract_call'))"),
      "route provider direct/contract-call check",
    );
    assert.ok(sql.includes("drop constraint if exists payment_intents_payment_type_check"), "payment type drop");
    assert.ok(
      sql.includes(
        "add constraint payment_intents_payment_type_check check (payment_type in ('wallet_payment', 'invoice_payment', 'x402_payment', 'contract_call'))",
      ),
      "payment type contract-call check",
    );
    assert.ok(sql.includes("notify pgrst, 'reload schema'"), "PostgREST schema cache reload");
  });
});
