import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Claim, Lease, Status } from "lease-vault-client";
import { explainRule, ruleFor, RULES } from "../src/explain.js";
import { checkAction } from "../src/guards.js";
import { actionsFor, analyze, coordinatorDuties, usdc, type Snapshot } from "../src/rules.js";

const U = 10_000_000n;
const T0 = 1_000;
const LANDLORD = "GLANDLORD";
const TENANT = "GTENANT";

function lease(status: Status["tag"], over: Partial<Lease> = {}): Lease {
  return {
    landlord: LANDLORD,
    tenant: TENANT,
    status: { tag: status, values: undefined } as Status,
    terms: {
      rent: 100n * U,
      deposit: 200n * U,
      months: 3,
      period: 60n,
      grace: 10n,
      move_in_window: 600n,
      claim_window: 60n,
      response_window: 60n,
      arbiter: "GARBITER",
      yield_offered: true,
      buffer_bps: 500,
      tenant_share_bps: 7000,
      landlord_share_bps: 2000,
    },
    created_at: BigInt(T0),
    start: BigInt(T0),
    ended_at: 0n,
    months_settled: 1,
    months_unpaid: 0,
    rent_escrow: 0n,
    liquid: 200n * U,
    shares: 0n,
    placed: 0n,
    yield_active: false,
    entry_hash: undefined,
    tenant_moved_in: true,
    landlord_moved_in: true,
    exit_hash: undefined,
    ...over,
  };
}

function snap(l: Lease, now: number, extra: Partial<Snapshot> = {}): Snapshot {
  return { id: 0n, lease: l, now, guaranteeValue: l.liquid, blendAtRisk: false, ...extra };
}

const fns = (s: Snapshot, role: Parameters<typeof actionsFor>[1]) =>
  actionsFor(analyze(s), role).map((a) => a.fn);

describe("rule engine", () => {
  it("formats USDC amounts", () => {
    assert.equal(usdc(1_234_567_890n), "123.45 USDC");
    assert.equal(usdc(-5n * U), "-5.00 USDC");
  });

  it("offers both funding choices when the landlord offered the yield", () => {
    const s = snap(lease("Created", { tenant: undefined }), T0 + 10);
    const funds = analyze(s).actions.filter((a) => a.fn === "fund");
    assert.deepEqual(funds.map((a) => a.args?.accept_yield), [false, true]);
    assert.match(funds[1].label, /310\.00 USDC/); // rent + deposit + 5 % buffer
  });

  it("refunds through the coordinator once the move-in deadline passed", () => {
    const l = lease("Funded", { tenant_moved_in: true, landlord_moved_in: false });
    assert.deepEqual(fns(snap(l, T0 + 600), "landlord"), ["confirm_move_in"]);
    assert.deepEqual(coordinatorDuties(snap(l, T0 + 601)).map((a) => a.fn), ["refund_no_keys"]);
  });

  it("lets the landlord take unpaid rent only after the grace period, like the contract", () => {
    const l = lease("Active", { months_settled: 1 });
    // month 1 due at T0 + 60, grace 10 s: claimable strictly after T0 + 70
    assert.ok(!fns(snap(l, T0 + 70), "landlord").includes("claim_unpaid"));
    assert.ok(fns(snap(l, T0 + 71), "landlord").includes("claim_unpaid"));
  });

  it("never offers to seize the guarantee during the lease", () => {
    const s = snap(lease("Active"), T0 + 100);
    assert.ok(!fns(s, "landlord").includes("claim_damage"));
    const guard = checkAction(s, "landlord", "claim_damage", { amount: 200n * U, evidence: "x" });
    assert.equal(guard.ok, false);
    assert.match((guard as { reason: string }).reason, /cannot be claimed during the lease/);
  });

  it("opens the claim window, then hands release to the coordinator", () => {
    const l = lease("Ended", { months_settled: 3, ended_at: BigInt(T0 + 180) });
    assert.ok(fns(snap(l, T0 + 240), "landlord").includes("claim_damage"));
    assert.deepEqual(coordinatorDuties(snap(l, T0 + 240)), []);
    assert.deepEqual(coordinatorDuties(snap(l, T0 + 241)).map((a) => a.fn), ["release"]);
  });

  it("bounds claims, offers and arbitration to the amounts the contract allows", () => {
    const ended = snap(lease("Ended", { months_settled: 3, ended_at: BigInt(T0 + 180) }), T0 + 200);
    assert.equal(checkAction(ended, "landlord", "claim_damage", { amount: 201n * U, evidence: "x" }).ok, false);
    assert.equal(checkAction(ended, "landlord", "claim_damage", { amount: 50n * U }).ok, false);
    assert.equal(checkAction(ended, "landlord", "claim_damage", { amount: 50n * U, evidence: "x" }).ok, true);

    const claim: Claim = { amount: 80n * U, bond: 20n * U, evidence: Buffer.alloc(32), filed_at: BigInt(T0 + 200), offer: 30n * U };
    const disputed = snap(lease("Disputed"), T0 + 300, { claim });
    assert.equal(checkAction(disputed, "arbiter", "resolve", { to_landlord: 81n * U }).ok, false);
    assert.equal(checkAction(disputed, "arbiter", "resolve", { to_landlord: 40n * U }).ok, true);
    assert.equal(checkAction(disputed, "tenant", "resolve", { to_landlord: 40n * U }).ok, false);
  });

  it("executes a claim when the tenant stays silent", () => {
    const claim: Claim = { amount: 80n * U, bond: 20n * U, evidence: Buffer.alloc(32), filed_at: BigInt(T0 + 200), offer: undefined };
    const l = lease("Claimed");
    assert.ok(fns(snap(l, T0 + 260, { claim }), "tenant").includes("respond"));
    assert.deepEqual(coordinatorDuties(snap(l, T0 + 261, { claim })).map((a) => a.fn), ["execute_claim"]);
  });

  it("lets anyone exit Blend only when the position is at risk", () => {
    const l = lease("Active", { shares: 95n * U, placed: 100n * U, yield_active: true });
    assert.deepEqual(coordinatorDuties(snap(l, T0 + 10)), []);
    assert.ok(fns(snap(l, T0 + 10), "tenant").includes("exit_blend"));
    assert.deepEqual(coordinatorDuties(snap(l, T0 + 10, { blendAtRisk: true })).map((a) => a.fn), ["exit_blend"]);
  });
});

describe("rule explanations", () => {
  it("has a template for every rule, filled with the lease values", () => {
    const l = lease("Active");
    for (const rule of RULES) {
      const text = explainRule(rule, { lease: l, disputeBond: 20n * U });
      assert.ok(text.length > 40, rule);
    }
    assert.match(explainRule("yield", { lease: l, disputeBond: 0n }), /10\.00 USDC.*100\.00 USDC/);
    assert.match(explainRule("unpaid_rent", { lease: l, disputeBond: 0n }), /10 second\(s\)/);
  });

  it("maps questions to rules and admits when it has none", () => {
    assert.equal(ruleFor("Seize the whole guarantee now"), "early_seizure");
    assert.equal(ruleFor("what if Blend gets hacked?"), "yield_loss");
    assert.equal(ruleFor("when do I get my deposit back"), "end_of_lease");
    assert.equal(ruleFor("can I have a cat?"), undefined);
  });
});
