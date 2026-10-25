// explain_lease_rule: one template per rule of the contract, filled with the
// values recorded on-chain for this lease. Nothing is generated: if a rule
// is not in this table, the agent says so instead of inventing one.

import type { Lease } from "lease-vault-client";
import { usdc } from "./rules.js";

export const RULES = [
  "first_rent",
  "monthly_rent",
  "unpaid_rent",
  "end_of_lease",
  "damage_claim",
  "tenant_response",
  "arbitration",
  "dispute_bond",
  "no_keys",
  "early_seizure",
  "yield",
  "yield_loss",
  "yield_exit",
  "invest_during_lease",
  "rating",
] as const;

export type RuleId = (typeof RULES)[number];

export interface Context {
  lease: Lease;
  disputeBond: bigint;
}

function duration(seconds: bigint | number): string {
  const s = Number(seconds);
  if (s % 86400 === 0) return `${s / 86400} day(s)`;
  if (s % 3600 === 0) return `${s / 3600} hour(s)`;
  if (s % 60 === 0) return `${s / 60} minute(s)`;
  return `${s} second(s)`;
}

const pct = (bps: number) => `${bps / 100} %`;

export function explainRule(rule: RuleId, { lease, disputeBond }: Context): string {
  const t = lease.terms;
  const fundShare = 10_000 - t.tenant_share_bps - t.landlord_share_bps;
  const buffer = (t.deposit * BigInt(t.buffer_bps)) / 10_000n;
  switch (rule) {
    case "first_rent":
      return (
        `When you fund the lease, the first rent (${usdc(t.rent)}) is locked with the guarantee. ` +
        `It goes to the landlord only once both of you co-sign the move-in inventory.`
      );
    case "monthly_rent":
      return (
        `Rent is ${usdc(t.rent)} every ${duration(t.period)}, for ${t.months} months. ` +
        `Each payment goes straight from the tenant to the landlord; the contract only records it.`
      );
    case "unpaid_rent":
      return (
        `If a month is not paid ${duration(t.grace)} after its due date, exactly one month (${usdc(t.rent)}) ` +
        `is paid to the landlord from the guarantee. Anyone can trigger it, the coordinator does it automatically, ` +
        `and the money can only go to the landlord. One month always stays in the contract, ` +
        `so this works instantly even when part of the guarantee is lent on Blend.`
      );
    case "end_of_lease":
      return (
        `After ${t.months} months, either party ends the lease and can record the exit inventory. ` +
        `The landlord then has ${duration(t.claim_window)} to claim damage. ` +
        `Months still unpaid are paid to the landlord first (the tenant can still pay them late). ` +
        `With no claim, anyone can then release the rest of the guarantee to the tenant.`
      );
    case "damage_claim":
      return (
        `A damage claim states an amount, comes with the hash of the evidence and a ${usdc(disputeBond)} bond. ` +
        `It can never exceed the guarantee. Everything not claimed goes back to the tenant at once.`
      );
    case "tenant_response":
      return (
        `The tenant has ${duration(t.response_window)} to answer a claim: accept it, or offer a lower amount. ` +
        `Silence counts as acceptance and anyone can then execute the claim.`
      );
    case "arbitration":
      return (
        `If the tenant counters, the landlord can accept the offer, or the arbiter named in the lease decides. ` +
        `The arbiter can only split the disputed amount between the two parties: ` +
        `the contract refuses any other destination or a larger amount. ` +
        `If the arbiter does not decide within ${duration(t.arbitration_window)}, anyone can settle halfway ` +
        `between the claim and the offer, so the guarantee can never stay locked.`
      );
    case "dispute_bond":
      return (
        `The landlord posts ${usdc(disputeBond)} with a claim. It comes back unless the arbiter awards ` +
        `less than half of the claim, in which case it goes to the arbitration fund.`
      );
    case "no_keys":
      return (
        `If both parties have not confirmed the move-in within ${duration(t.move_in_window)} of the offer, ` +
        `anyone can send everything back to the tenant.`
      );
    case "early_seizure":
      return (
        `Nobody can take the guarantee during the lease. An unpaid month goes to the landlord after the grace ` +
        `period, and claim damage only after the lease ends. Any other attempt is rejected by the contract.`
      );
    case "yield":
      return t.yield_offered
        ? `The landlord offered the yield option. If the tenant accepts, the tenant also locks a ` +
            `${pct(t.buffer_bps)} buffer (${usdc(buffer)}) and the guarantee minus one month ` +
            `(${usdc(t.deposit - t.rent)}) is lent on Blend. The return is variable and not guaranteed. ` +
            `Any gain is shared ${pct(t.tenant_share_bps)} tenant, ${pct(t.landlord_share_bps)} landlord, ` +
            `${pct(fundShare)} arbitration fund.`
        : `This lease does not offer the yield option: the whole guarantee stays in the contract.`;
    case "yield_loss":
      return (
        `If Blend loses value, the loss is absorbed first by the buffer, then by the tenant's part. ` +
        `The landlord is always paid first: unpaid rent and accepted claims come before the tenant's refund.`
      );
    case "invest_during_lease":
      return (
        `During the lease, either party can propose to lend part of the guarantee on Blend. ` +
        `The proposal says how much stays in the contract (at least one month, ${usdc(t.rent)}) and how any gain is shared. ` +
        `Nothing moves until the other party approves. The tenant locks a ${pct(t.buffer_bps)} buffer (${usdc(buffer)}) on approval; ` +
        `withdrawing the proposal gives it back. Once invested, either party can stop at any time.`
      );
    case "rating":
      return (
        `Once the lease is settled (no claim left open), the tenant and the landlord each rate the other from 1 to 5, once. ` +
        `A score always shows on the lease, but it only counts towards reputation if the lease met the minimum length ` +
        `and guarantee set for this deployment. Reputation also shows how many different parties gave the scores, ` +
        `so five stars from the same friend stand out.`
      );
    case "yield_exit":
      return (
        `The tenant or the landlord can end the yield option at any time. Anyone, including the coordinator, ` +
        `can pull the guarantee out if the Blend position loses value or the pool gets close to full use.`
      );
  }
}

/** Picks the rule that answers a free-form keyword, deterministically. */
export function ruleFor(topic: string): RuleId | undefined {
  const k = topic.toLowerCase();
  const table: [RegExp, RuleId][] = [
    [/seiz|take (all|the whole)|grab|now/, "early_seizure"],
    [/unpaid|late|overdue|miss/, "unpaid_rent"],
    [/first|move.?in|keys? hand/, "first_rent"],
    [/no keys|never moved|refund/, "no_keys"],
    [/damage|claim/, "damage_claim"],
    [/answer|respond|counter|reply/, "tenant_response"],
    [/arbit|judge|mediat|dispute/, "arbitration"],
    [/bond/, "dispute_bond"],
    [/rate|rating|review|reputation|star|score/, "rating"],
    [/propose|approve|invest|reserve|keep/, "invest_during_lease"],
    [/lose|loss|hack|risk/, "yield_loss"],
    [/stop|exit|withdraw|opt.?out/, "yield_exit"],
    [/yield|interest|blend|inflation|earn/, "yield"],
    [/end|leave|move.?out|return|deposit back/, "end_of_lease"],
    [/rent|pay/, "monthly_rent"],
  ];
  return table.find(([re]) => re.test(k))?.[1];
}
