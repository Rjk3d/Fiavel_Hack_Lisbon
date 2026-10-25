// End-to-end demo on testnet, in demo mode (1 month = 60 s). Follows the
// pitch scenario: offer with the yield option, funding (Blend deposit),
// co-signed move-in, the refusal scene, one rent paid, one month unpaid and
// taken from the guarantee, end of lease, release by the coordinator.
// Every transaction link is written to deployments/testnet-demo.json.
//
//   npm run demo

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import type { Terms } from "lease-vault-client";
import { deployment, explorer, keypairFor, send, signer, snapshot } from "./chain.js";
import { tick } from "./coordinator.js";
import { explainRule, ruleFor } from "./explain.js";
import { checkAction } from "./guards.js";
import { analyze, timeline, usdc, when } from "./rules.js";
import { contractError, requestContractAction } from "./tools.js";

const U = 10_000_000n;
const landlordKey = keypairFor("landlord");
const tenantKey = keypairFor("tenant");
const landlord = signer(landlordKey);
const tenant = signer(tenantKey);
const steps: { step: string; tx: string }[] = [];

const say = (who: string, text: string) => console.log(`\n${who.padEnd(18)} ${text}`);
const now = () => Math.floor(Date.now() / 1000);
const sha256 = (text: string) => createHash("sha256").update(text).digest();

function record(step: string, hash: string) {
  steps.push({ step, tx: explorer(hash) });
  console.log(`${"".padEnd(18)} ↳ ${explorer(hash)}`);
}

/** Waits until `at` (unix s) plus a margin for ledger close time. */
async function waitUntil(at: number, why: string) {
  const target = at + 6;
  if (now() >= target) return;
  say("⏳", `${why} (${when(target, now())})`);
  while (now() < target) await new Promise((r) => setTimeout(r, 1000));
}

async function main() {
  const disputeBond = BigInt(deployment.disputeBond);

  // ── 1. The offer ────────────────────────────────────────────────────
  const terms: Terms = {
    rent: 100n * U,
    deposit: 200n * U,
    months: 3,
    period: 60n,
    grace: 10n,
    move_in_window: 600n,
    claim_window: 60n,
    response_window: 60n,
    arbitration_window: 120n,
    arbiter: deployment.accounts.arbiter,
    yield_offered: true,
    buffer_bps: 500,
    tenant_share_bps: 7000,
    landlord_share_bps: 2000,
  };
  const created = await send(await landlord.create_lease({ landlord: landlordKey.publicKey(), terms }));
  const id = created.result;
  say("Landlord", `Manuel offers lease #${id}: ${usdc(terms.rent)}/month, guarantee ${usdc(terms.deposit)}, yield option.`);
  record("create_lease", created.hash);

  // ── 2. Tenant Guardian explains, tenant funds ───────────────────────
  let s = await snapshot(id);
  say("Tenant Guardian", explainRule("yield", { lease: s.lease, disputeBond }));
  const funded = await send(await tenant.fund({ id, tenant: tenantKey.publicKey(), accept_yield: true }));
  s = await snapshot(id);
  say("Tenant", `Ana funds with Face ID. ${usdc(s.lease.placed)} goes to Blend, ${usdc(s.lease.liquid)} stays liquid.`);
  record("fund (Blend deposit)", funded.hash);

  // ── 3. Co-signed move-in ────────────────────────────────────────────
  const inventory = sha256("Rua de Arroios 12, 2nd floor: walls clean, 4 photos, 2026-10-25");
  await send(await tenant.confirm_move_in({ id, who: tenantKey.publicKey(), entry_hash: inventory }));
  const movedIn = await send(await landlord.confirm_move_in({ id, who: landlordKey.publicKey(), entry_hash: inventory }));
  say("Both", "Move-in inventory hash co-signed. First rent released to Manuel.");
  record("confirm_move_in", movedIn.hash);

  // ── 4. Refusal scene ────────────────────────────────────────────────
  s = await snapshot(id);
  const question = "Seize the whole guarantee now";
  say("Landlord", `"${question}."`);
  const rule = ruleFor(question)!;
  say("Landlord Assistant", explainRule(rule, { lease: s.lease, disputeBond }));
  const guard = checkAction(s, "landlord", "claim_damage", { amount: s.guaranteeValue, evidence: inventory });
  say("Backend guard", guard.ok ? "allowed" : `refused: ${guard.reason}`);
  try {
    await send(await landlord.claim_damage({ id, amount: s.guaranteeValue, evidence: inventory }));
    say("Contract", "accepted (this should not happen)");
  } catch (e) {
    say("Contract", `forced call rejected: ${contractError(String(e))}`);
  }

  // ── 5. Month 2 paid, month 3 unpaid ─────────────────────────────────
  const paid = await send(await tenant.pay_rent({ id }));
  say("Tenant", `Ana pays month 2 (${usdc(terms.rent)}).`);
  record("pay_rent", paid.hash);

  s = await snapshot(id);
  const due = timeline(s.lease).unpaidClaimableAt!;
  say("Landlord Assistant", analyze(s).blocked.find((b) => b.fn === "claim_unpaid")?.reason ?? "");
  await waitUntil(due, "Month 3 is not paid. Waiting for the grace period to end");

  s = await snapshot(id);
  say("Landlord Assistant", `Month 3 is overdue. Proposed: ${analyze(s).actions.find((a) => a.fn === "claim_unpaid")?.label}`);
  const prepared = await requestContractAction(id, "landlord", landlordKey.publicKey(), "claim_unpaid");
  if (!prepared.ok) throw new Error(prepared.reason);
  say("Landlord", "Manuel reviews the prepared transaction and signs it.");
  const unpaid = await send(await landlord.claim_unpaid({ id }));
  record("claim_unpaid", unpaid.hash);

  // ── 6. End of lease, release by the coordinator ─────────────────────
  s = await snapshot(id);
  await waitUntil(timeline(s.lease).endAt, "Waiting for the end of the lease");
  const ended = await send(
    await tenant.end_lease({ id, who: tenantKey.publicKey(), exit_hash: sha256("Exit inventory: walls clean, 4 photos") }),
  );
  say("Tenant", "Ana moves out and records the exit inventory.");
  record("end_lease", ended.hash);

  s = await snapshot(id);
  await waitUntil(timeline(s.lease).claimWindowEnd + 1, "No damage claim. Waiting for the claim window to close");
  const before = s.guaranteeValue;
  const runs = await tick([id]);
  for (const r of runs) {
    say("Coordinator", `${r.fn}: ${r.ok ? "done" : r.error}`);
    if (r.tx) record(`coordinator ${r.fn}`, r.tx);
  }

  s = await snapshot(id);
  say("Result", `${analyze(s).headline} Guarantee returned to Ana: about ${usdc(before)} (incl. her yield share).`);

  writeFileSync(
    new URL(`../../deployments/${deployment.network}-demo.json`, import.meta.url),
    JSON.stringify({ leaseVault: deployment.leaseVault, lease: id.toString(), ranAt: new Date().toISOString(), steps }, null, 2),
  );
  console.log(`\nTransaction links written to deployments/${deployment.network}-demo.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
