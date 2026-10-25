import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Claim, Lease, Status } from "lease-vault-client";
import { explainRule, ruleFor, RULES } from "../src/explain.js";
import { checkAction } from "../src/guards.js";
import { actionsFor, analyze, bufferToLock, coordinatorDuties, damageClaimable, usdc, type Snapshot } from "../src/rules.js";

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
      arbitration_window: 120n,
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
    // Public: the coordinator pays it to the landlord without waiting for them.
    assert.deepEqual(coordinatorDuties(snap(l, T0 + 71)).map((a) => a.fn), ["claim_unpaid"]);
  });

  it("pays months left unpaid to the landlord before any refund or claim", () => {
    const l = lease("Ended", { months_settled: 2, ended_at: BigInt(T0 + 180) });
    const s = snap(l, T0 + 200);
    assert.equal(damageClaimable(s), 100n * U);
    assert.ok(fns(s, "tenant").includes("pay_rent"));
    assert.equal(checkAction(s, "landlord", "claim_damage", { amount: 101n * U, evidence: "x" }).ok, false);
    const release = actionsFor(analyze(snap(l, T0 + 241)), "anyone").find((a) => a.fn === "release")!;
    assert.match(release.label, /100.00 USDC unpaid to the landlord/);
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

    const claim: Claim = { amount: 80n * U, bond: 20n * U, evidence: Buffer.alloc(32), filed_at: BigInt(T0 + 200), offer: 30n * U, answered_at: BigInt(T0 + 250) };
    const disputed = snap(lease("Disputed"), T0 + 300, { claim });
    assert.equal(checkAction(disputed, "arbiter", "resolve", { to_landlord: 81n * U }).ok, false);
    assert.equal(checkAction(disputed, "arbiter", "resolve", { to_landlord: 40n * U }).ok, true);
    assert.equal(checkAction(disputed, "tenant", "resolve", { to_landlord: 40n * U }).ok, false);
  });

  it("settles halfway when the arbiter stays silent past the deadline", () => {
    const claim: Claim = { amount: 80n * U, bond: 20n * U, evidence: Buffer.alloc(32), filed_at: BigInt(T0 + 200), offer: 30n * U, answered_at: BigInt(T0 + 250) };
    const l = lease("Disputed");
    assert.deepEqual(coordinatorDuties(snap(l, T0 + 370, { claim })), []);
    const duties = coordinatorDuties(snap(l, T0 + 371, { claim }));
    assert.deepEqual(duties.map((a) => a.fn), ["expire_dispute"]);
    assert.match(duties[0].label, /55.00 USDC/);
  });

  it("executes a claim when the tenant stays silent", () => {
    const claim: Claim = { amount: 80n * U, bond: 20n * U, evidence: Buffer.alloc(32), filed_at: BigInt(T0 + 200), offer: undefined, answered_at: 0n };
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

  it("offers to invest during the lease only on a v2 contract, then waits for the other party", () => {
    const l = lease("Active", { yield_active: false });
    assert.ok(!fns(snap(l, T0 + 10), "tenant").includes("propose_yield"));
    assert.ok(fns(snap(l, T0 + 10, { v2: true }), "tenant").includes("propose_yield"));
    assert.ok(fns(snap(l, T0 + 10, { v2: true }), "landlord").includes("propose_yield"));

    const proposal = {
      proposer: LANDLORD,
      keep: 100n * U,
      tenant_share_bps: 7000,
      landlord_share_bps: 2000,
      buffer: 10n * U,
      tenant_ok: false,
      landlord_ok: true,
    };
    const s = snap(l, T0 + 10, { v2: true, proposal });
    assert.deepEqual(fns(s, "landlord").filter((f) => f.endsWith("_yield")), ["cancel_yield"]);
    const approve = actionsFor(analyze(s), "tenant").find((a) => a.fn === "approve_yield")!;
    assert.match(approve.label, /100\.00 USDC.*10\.00 USDC buffer/);
    assert.equal(checkAction(s, "landlord", "approve_yield").ok, false);
  });

  it("guards the investment proposal like the contract", () => {
    const s = snap(lease("Active"), T0 + 10, { v2: true });
    const ok = (keep: bigint, t = 7000, l = 2000) =>
      checkAction(s, "tenant", "propose_yield", { keep, tenant_share_bps: t, landlord_share_bps: l }).ok;
    assert.ok(ok(100n * U));
    assert.ok(!ok(99n * U)); // less than one month
    assert.ok(!ok(200n * U)); // nothing left to invest
    assert.ok(!ok(100n * U, 8000, 3000)); // shares above 100 %
  });

  it("lets each party rate the other once, after the lease", () => {
    assert.ok(!fns(snap(lease("Active"), T0 + 10, { v2: true }), "tenant").includes("rate"));
    assert.ok(!fns(snap(lease("Ended"), T0 + 10, { v2: true, ratings: {} }), "tenant").includes("rate"));
    const ended = lease("Closed");
    assert.ok(fns(snap(ended, T0 + 10, { v2: true, ratings: {} }), "tenant").includes("rate"));
    const s = snap(ended, T0 + 10, { v2: true, ratings: { by_tenant: 5 } });
    assert.ok(!fns(s, "tenant").includes("rate"));
    assert.ok(fns(s, "landlord").includes("rate"));
    assert.equal(checkAction(s, "landlord", "rate", { score: 6 }).ok, false);
    assert.equal(checkAction(s, "landlord", "rate", { score: 4 }).ok, true);
    assert.ok(!fns(s, "arbiter").includes("rate"));
    // The chain returns null, not undefined, for a score not given yet.
    const fromChain = snap(ended, T0 + 10, { v2: true, ratings: { by_tenant: null, by_landlord: 4 } });
    assert.ok(fns(fromChain, "tenant").includes("rate"));
    assert.ok(!fns(fromChain, "landlord").includes("rate"));
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
    assert.equal(ruleFor("how do ratings work"), "rating");
    assert.equal(ruleFor("approve the investment"), "invest_during_lease");
  });
});

describe('investment buffer', () => {
  it('asks for the buffer only if it is not already in the contract', () => {
    // No yield at funding: 200 held for a 200 guarantee, the 10 buffer is still to lock.
    assert.equal(bufferToLock(lease('Active', { liquid: 200n * U })), 10n * U);
    // Yield accepted at funding then stopped: 210 held, nothing more to lock.
    assert.equal(bufferToLock(lease('Active', { liquid: 210n * U })), 0n);
    // Same, after one unpaid month was taken from the guarantee.
    assert.equal(bufferToLock(lease('Active', { liquid: 110n * U, months_unpaid: 1 })), 0n);
  });
});
