// Backend guard (first of the three locks): an agent may only prepare a call
// that the rule engine lists for that role, with arguments inside the
// bounds the contract enforces. The user's signature and the contract are
// the second and third locks.

import { analyze, type ContractFn, type Role, type Snapshot } from "./rules.js";

export type GuardResult = { ok: true } | { ok: false; reason: string };

export function checkAction(
  s: Snapshot,
  role: Role,
  fn: ContractFn,
  args: Record<string, unknown> = {},
): GuardResult {
  const insight = analyze(s);
  const allowed = insight.actions.some((a) => a.fn === fn && (a.role === role || a.role === "anyone"));
  if (!allowed) {
    const blocked = insight.blocked.find((b) => b.fn === fn && (b.role === role || b.role === "anyone"));
    return {
      ok: false,
      reason: blocked?.reason ?? `"${fn}" is not possible for the ${role} while the lease is ${insight.phase.replace(/_/g, " ")}.`,
    };
  }

  const amount = (key: string): bigint | undefined => {
    const v = args[key];
    return typeof v === "bigint" ? v : typeof v === "number" || typeof v === "string" ? BigInt(v) : undefined;
  };

  switch (fn) {
    case "claim_damage": {
      const a = amount("amount");
      if (a === undefined || a <= 0n) return { ok: false, reason: "A claim needs a positive amount." };
      if (a > s.guaranteeValue) return { ok: false, reason: "A claim cannot exceed the guarantee." };
      if (!args.evidence) return { ok: false, reason: "A claim needs the hash of its evidence." };
      break;
    }
    case "respond": {
      const a = amount("offer");
      if (a === undefined || a < 0n || a > s.claim!.amount) {
        return { ok: false, reason: "The offer must be between 0 and the claimed amount." };
      }
      break;
    }
    case "resolve": {
      const a = amount("to_landlord");
      if (a === undefined || a < 0n || a > s.claim!.amount) {
        return { ok: false, reason: "The arbiter can only split the disputed amount." };
      }
      break;
    }
    case "propose_yield": {
      const keep = amount("keep");
      const t = Number(args.tenant_share_bps ?? -1);
      const l = Number(args.landlord_share_bps ?? -1);
      if (keep === undefined || keep < s.lease.terms.rent) {
        return { ok: false, reason: "At least one month of rent must stay in the contract." };
      }
      if (keep >= s.lease.liquid) return { ok: false, reason: "Keep less than the whole guarantee, or nothing is invested." };
      if (t < 0 || l < 0 || t + l > 10_000) return { ok: false, reason: "The yield shares must add up to 100 % or less." };
      break;
    }
    case "rate": {
      const score = Number(args.score);
      if (!Number.isInteger(score) || score < 1 || score > 5) return { ok: false, reason: "A rating is a whole number from 1 to 5." };
      break;
    }
    case "confirm_move_in": {
      if (!args.entry_hash) return { ok: false, reason: "Move-in needs the hash of the inventory." };
      break;
    }
  }
  return { ok: true };
}
