// Deterministic rule engine. Pure functions, no network, no LLM: given the
// on-chain state of a lease and the clock, it says where the lease stands,
// which deadlines are coming and which contract calls each role may make.
// Every condition mirrors a check in contracts/lease_vault/src/lib.rs, so
// the engine never proposes a call the contract would reject.

import type { Claim, Lease } from "lease-vault-client";

export type Role = "tenant" | "landlord" | "arbiter" | "anyone";

export type ContractFn =
  | "fund"
  | "confirm_move_in"
  | "refund_no_keys"
  | "pay_rent"
  | "claim_unpaid"
  | "end_lease"
  | "claim_damage"
  | "respond"
  | "accept_counter"
  | "execute_claim"
  | "resolve"
  | "release"
  | "exit_blend";

export type Phase =
  | "awaiting_funding"
  | "awaiting_move_in"
  | "active"
  | "claim_window"
  | "awaiting_response"
  | "in_dispute"
  | "closed"
  | "refunded";

export interface Snapshot {
  id: bigint;
  lease: Lease;
  claim?: Claim;
  /** Unix seconds. */
  now: number;
  /** Liquid part plus Blend position, from `guarantee_value`. */
  guaranteeValue: bigint;
  /** From `blend_at_risk`: anyone may pull the lease out of Blend. */
  blendAtRisk: boolean;
}

export interface Action {
  fn: ContractFn;
  /** Who signs. "anyone" calls are what the coordinator runs. */
  role: Role;
  label: string;
  /** Fixed arguments; the UI adds amounts, hashes and choices. */
  args?: Record<string, unknown>;
}

export interface Blocked {
  fn: ContractFn;
  role: Role;
  label: string;
  reason: string;
  /** When it becomes possible, if a deadline is the only obstacle. */
  availableAt?: number;
}

export interface Deadline {
  label: string;
  at: number;
}

export interface Insight {
  phase: Phase;
  headline: string;
  facts: string[];
  deadlines: Deadline[];
  actions: Action[];
  blocked: Blocked[];
}

const DECIMALS = 7n;
const UNIT = 10n ** DECIMALS;

export function usdc(amount: bigint): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const whole = abs / UNIT;
  const cents = (abs % UNIT) / 10n ** (DECIMALS - 2n);
  return `${negative ? "-" : ""}${whole}.${cents.toString().padStart(2, "0")} USDC`;
}

export function when(at: number, now: number): string {
  const d = at - now;
  if (d <= 0) return "now";
  if (d < 120) return `in ${d} s`;
  if (d < 7200) return `in ${Math.round(d / 60)} min`;
  if (d < 172800) return `in ${Math.round(d / 3600)} h`;
  return `in ${Math.round(d / 86400)} days`;
}

/** Contract timestamps are u64 (bigint); the engine works in numbers. */
const n = (v: bigint | number) => Number(v);

export function timeline(lease: Lease) {
  const t = lease.terms;
  const start = n(lease.start);
  const period = n(t.period);
  const month = lease.months_settled;
  return {
    moveInDeadline: n(lease.created_at) + n(t.move_in_window),
    nextDue: month < t.months ? start + month * period : undefined,
    unpaidClaimableAt: month < t.months ? start + month * period + n(t.grace) + 1 : undefined,
    endAt: start + t.months * period,
    claimWindowEnd: n(lease.ended_at) + n(t.claim_window),
  };
}

export function phaseOf(lease: Lease): Phase {
  switch (lease.status.tag) {
    case "Created":
      return "awaiting_funding";
    case "Funded":
      return "awaiting_move_in";
    case "Active":
      return "active";
    case "Ended":
      return "claim_window";
    case "Claimed":
      return "awaiting_response";
    case "Disputed":
      return "in_dispute";
    case "Closed":
      return "closed";
    case "Refunded":
      return "refunded";
  }
}

export function analyze(s: Snapshot): Insight {
  const { lease, now } = s;
  const t = lease.terms;
  const tl = timeline(lease);
  const phase = phaseOf(lease);
  const out: Insight = { phase, headline: "", facts: [], deadlines: [], actions: [], blocked: [] };
  const act = (a: Action) => out.actions.push(a);
  const block = (b: Blocked) => out.blocked.push(b);

  out.facts.push(
    `Rent ${usdc(t.rent)} per month for ${t.months} months, guarantee ${usdc(t.deposit)}.`,
  );
  if (lease.yield_active) {
    out.facts.push(
      `${usdc(lease.placed)} of the guarantee is lent on Blend; ${usdc(lease.liquid)} stays in the contract. ` +
        `Current value of the guarantee: ${usdc(s.guaranteeValue)}.`,
    );
  }

  // Applies in every phase where money sits on Blend.
  if (lease.shares > 0n) {
    if (s.blendAtRisk) {
      act({ fn: "exit_blend", role: "anyone", label: "Pull the guarantee out of Blend (position at risk)" });
    } else {
      act({ fn: "exit_blend", role: "tenant", label: "Stop the yield option and bring the guarantee back" });
      act({ fn: "exit_blend", role: "landlord", label: "Stop the yield option and bring the guarantee back" });
      block({
        fn: "exit_blend",
        role: "anyone",
        label: "Pull the guarantee out of Blend",
        reason: "The Blend position is healthy; only the tenant or the landlord can end the option.",
      });
    }
  }

  switch (phase) {
    case "awaiting_funding": {
      out.headline = `Lease offer waiting for the tenant to fund it.`;
      out.deadlines.push({ label: "Funding and move-in deadline", at: tl.moveInDeadline });
      if (now <= tl.moveInDeadline) {
        const buffer = (t.deposit * BigInt(t.buffer_bps)) / 10_000n;
        act({
          fn: "fund",
          role: "tenant",
          label: `Lock ${usdc(t.rent + t.deposit)} (first rent + guarantee)`,
          args: { accept_yield: false },
        });
        if (t.yield_offered) {
          act({
            fn: "fund",
            role: "tenant",
            label: `Lock ${usdc(t.rent + t.deposit + buffer)} and accept the Blend yield option`,
            args: { accept_yield: true },
          });
        }
      }
      break;
    }

    case "awaiting_move_in": {
      out.headline = `Funded. Both parties must co-sign the move-in inventory.`;
      out.deadlines.push({ label: "Move-in deadline", at: tl.moveInDeadline });
      if (now <= tl.moveInDeadline) {
        if (!lease.tenant_moved_in) {
          act({ fn: "confirm_move_in", role: "tenant", label: "Confirm move-in and sign the inventory hash" });
        }
        if (!lease.landlord_moved_in) {
          act({ fn: "confirm_move_in", role: "landlord", label: "Confirm move-in and sign the inventory hash" });
        }
      } else {
        act({ fn: "refund_no_keys", role: "anyone", label: "Refund everything to the tenant (no move-in)" });
      }
      block({
        fn: "pay_rent",
        role: "tenant",
        label: "Pay rent",
        reason: "Rent starts once both parties confirmed the move-in.",
      });
      break;
    }

    case "active": {
      const months = t.months;
      const settled = lease.months_settled;
      out.headline =
        settled < months
          ? `Lease active: ${settled} of ${months} months settled.`
          : `Lease active: ${months === 1 ? "the month is" : `all ${months} months are`} settled.`;
      if (lease.months_unpaid > 0) {
        out.facts.push(`${lease.months_unpaid} month(s) were taken from the guarantee.`);
      }
      if (tl.nextDue !== undefined && tl.unpaidClaimableAt !== undefined) {
        out.deadlines.push({ label: `Rent for month ${settled + 1} due`, at: tl.nextDue });
        out.deadlines.push({ label: "Landlord can take it from the guarantee", at: tl.unpaidClaimableAt });
        act({ fn: "pay_rent", role: "tenant", label: `Pay month ${settled + 1} (${usdc(t.rent)})` });
        if (now >= tl.unpaidClaimableAt) {
          act({
            fn: "claim_unpaid",
            role: "landlord",
            label: `Take month ${settled + 1} (${usdc(t.rent)}) from the guarantee`,
          });
        } else {
          block({
            fn: "claim_unpaid",
            role: "landlord",
            label: "Take unpaid rent from the guarantee",
            reason: `Month ${settled + 1} is not overdue yet: the grace period ends ${when(tl.unpaidClaimableAt, now)}.`,
            availableAt: tl.unpaidClaimableAt,
          });
        }
      }
      out.deadlines.push({ label: "End of the lease", at: tl.endAt });
      if (now >= tl.endAt) {
        act({ fn: "end_lease", role: "tenant", label: "End the lease and record the exit inventory" });
        act({ fn: "end_lease", role: "landlord", label: "End the lease and record the exit inventory" });
      } else {
        block({
          fn: "end_lease",
          role: "tenant",
          label: "End the lease",
          reason: `The lease runs until its term, ${when(tl.endAt, now)}.`,
          availableAt: tl.endAt,
        });
      }
      block({
        fn: "claim_damage",
        role: "landlord",
        label: "Claim the guarantee",
        reason:
          "The guarantee cannot be claimed during the lease. Damage can only be claimed after the lease ends, " +
          "within the claim window, and only for a stated amount; unpaid rent is taken month by month.",
      });
      break;
    }

    case "claim_window": {
      out.headline = `Lease ended. The landlord can file a damage claim until the window closes.`;
      out.deadlines.push({ label: "Damage-claim window closes", at: tl.claimWindowEnd });
      if (lease.months_settled < t.months && tl.unpaidClaimableAt !== undefined && now >= tl.unpaidClaimableAt) {
        act({ fn: "claim_unpaid", role: "landlord", label: `Take unpaid month ${lease.months_settled + 1} from the guarantee` });
      }
      if (now <= tl.claimWindowEnd) {
        act({
          fn: "claim_damage",
          role: "landlord",
          label: `Claim damage, up to ${usdc(s.guaranteeValue)}, with evidence and a dispute bond`,
        });
        block({
          fn: "release",
          role: "anyone",
          label: "Release the guarantee",
          reason: `The landlord can still file a claim; release opens ${when(tl.claimWindowEnd + 1, now)}.`,
          availableAt: tl.claimWindowEnd + 1,
        });
      } else {
        act({ fn: "release", role: "anyone", label: `Release the guarantee (${usdc(s.guaranteeValue)}) to the tenant` });
      }
      break;
    }

    case "awaiting_response": {
      const c = s.claim!;
      const end = n(c.filed_at) + n(t.response_window);
      out.headline = `Damage claim of ${usdc(c.amount)} filed. The rest of the guarantee was returned.`;
      out.deadlines.push({ label: "Tenant response deadline", at: end });
      if (now <= end) {
        act({ fn: "respond", role: "tenant", label: `Accept the claim (${usdc(c.amount)})`, args: { offer: c.amount } });
        act({ fn: "respond", role: "tenant", label: "Make a counter-offer (sends the rest to arbitration)" });
      } else {
        act({ fn: "execute_claim", role: "anyone", label: `Pay the claim (${usdc(c.amount)}): the tenant did not answer` });
      }
      break;
    }

    case "in_dispute": {
      const c = s.claim!;
      out.headline = `Dispute over ${usdc(c.amount)}: tenant offered ${usdc(c.offer ?? 0n)}.`;
      act({ fn: "accept_counter", role: "landlord", label: `Accept the counter-offer (${usdc(c.offer ?? 0n)})` });
      act({ fn: "resolve", role: "arbiter", label: `Split the ${usdc(c.amount)} between the two parties` });
      out.facts.push(
        `If the landlord gets less than half of the claim, the ${usdc(c.bond)} bond goes to the arbitration fund.`,
      );
      break;
    }

    case "closed":
      out.headline = "Lease closed. Every amount has been paid out.";
      break;

    case "refunded":
      out.headline = "Move-in never happened. Everything went back to the tenant.";
      break;
  }

  out.deadlines.sort((a, b) => a.at - b.at);
  return out;
}

/** Actions available to one role, including public ones it may run. */
export function actionsFor(insight: Insight, role: Role): Action[] {
  return insight.actions.filter((a) => a.role === role || a.role === "anyone");
}

/** What the coordinator runs: public calls whose deadline has passed. */
export function coordinatorDuties(s: Snapshot): Action[] {
  return analyze(s).actions.filter((a) => a.role === "anyone");
}
