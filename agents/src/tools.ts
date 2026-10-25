// The agents' tools. Tenant Guardian and Landlord Assistant are the same
// engine with a different role; the coordinator only uses public calls.
// Reading tools never move money. request_contract_action only builds an
// unsigned transaction: the user signs it (Face ID in the app).

import { Client, Errors } from "lease-vault-client";
import { deployment, leaseEvents, server, snapshot } from "./chain.js";
import { explainRule, ruleFor, RULES, type RuleId } from "./explain.js";
import { checkAction } from "./guards.js";
import { actionsFor, analyze, usdc, type ContractFn, type Role } from "./rules.js";

/** get_lease_status: where the lease stands for this role. */
export async function getLeaseStatus(id: bigint, role: Role) {
  const s = await snapshot(id);
  const insight = analyze(s);
  return {
    phase: insight.phase,
    headline: insight.headline,
    facts: insight.facts,
    deadlines: insight.deadlines,
    youCan: actionsFor(insight, role).map((a) => a.label),
    notYet: insight.blocked.filter((b) => b.role === role).map((b) => `${b.label}: ${b.reason}`),
  };
}

/** get_rent_history: payments, unpaid months and settlements from events. */
export async function getRentHistory(id: bigint) {
  const events = await leaseEvents(id);
  return events
    .filter((e) => ["rent_paid", "unpaid_claimed", "moved_in", "lease_settled", "blend_exited"].includes(e.name))
    .map((e) => {
      const d = e.data as Record<string, bigint | number>;
      switch (e.name) {
        case "rent_paid":
          return { at: e.at, tx: e.tx, text: `Month ${Number(d.month) + 1} paid by the tenant (${usdc(BigInt(d.amount))})` };
        case "unpaid_claimed":
          return { at: e.at, tx: e.tx, text: `Month ${Number(d.month) + 1} taken from the guarantee (${usdc(BigInt(d.amount))})` };
        case "moved_in":
          return { at: e.at, tx: e.tx, text: "Move-in co-signed: first rent released to the landlord" };
        case "blend_exited":
          return { at: e.at, tx: e.tx, text: `Guarantee back from Blend, yield ${usdc(BigInt(d.gain))}` };
        default:
          return {
            at: e.at,
            tx: e.tx,
            text: `Settled: ${usdc(BigInt(d.to_landlord))} to the landlord, ${usdc(BigInt(d.to_tenant))} to the tenant`,
          };
      }
    });
}

/** explain_lease_rule: a rule id, or a question matched to one. */
export async function explainLeaseRule(id: bigint, ruleOrQuestion: string) {
  const rule = (RULES as readonly string[]).includes(ruleOrQuestion)
    ? (ruleOrQuestion as RuleId)
    : ruleFor(ruleOrQuestion);
  if (!rule) {
    return {
      rule: undefined,
      text: "This lease has no rule about that. I can explain: " + RULES.join(", ") + ".",
    };
  }
  const { lease } = await snapshot(id);
  return { rule, text: explainRule(rule, { lease, disputeBond: BigInt(deployment.disputeBond) }) };
}

/**
 * request_contract_action: checks the call against the rules, then builds
 * and simulates it for `publicKey`. Returns the unsigned XDR, or the reason
 * it was refused. Nothing is signed or sent here.
 */
export async function requestContractAction(
  id: bigint,
  role: Role,
  publicKey: string,
  fn: ContractFn,
  args: Record<string, unknown> = {},
): Promise<{ ok: true; xdr: string; fee: string } | { ok: false; reason: string }> {
  const s = await snapshot(id);
  const guard = checkAction(s, role, fn, args);
  if (!guard.ok) return guard;

  const client = new Client({
    contractId: deployment.leaseVault,
    networkPassphrase: deployment.networkPassphrase,
    rpcUrl: server.serverURL.toString(),
    publicKey,
  });
  const call = { id, ...withCaller(fn, publicKey, args) };
  // The generated client has one typed method per contract function.
  try {
    const tx = await (client as unknown as Record<string, (a: unknown) => Promise<any>>)[fn](call);
    if (tx.simulation && "error" in tx.simulation) {
      return { ok: false, reason: `The contract would reject it: ${contractError(tx.simulation.error)}` };
    }
    return { ok: true, xdr: tx.toXDR(), fee: tx.built?.fee ?? "?" };
  } catch (e) {
    return { ok: false, reason: `The contract would reject it: ${contractError(String(e))}` };
  }
}

/** Turns "Error(Contract, #3)" into the contract's error name. */
export function contractError(message: string): string {
  const m = /Error\(Contract, #(\d+)\)/.exec(message);
  if (!m) return message.split("\n")[0];
  return (Errors as Record<number, { message: string }>)[Number(m[1])]?.message ?? `error #${m[1]}`;
}

/** Functions that take the signer's address as an argument. */
function withCaller(fn: ContractFn, publicKey: string, args: Record<string, unknown>) {
  switch (fn) {
    case "fund":
      return { tenant: publicKey, ...args };
    case "confirm_move_in":
    case "end_lease":
      return { who: publicKey, exit_hash: undefined, ...args };
    case "exit_blend":
      return { caller: publicKey, ...args };
    case "propose_yield":
    case "approve_yield":
    case "cancel_yield":
    case "rate":
      return { who: publicKey, ...args };
    default:
      return args;
  }
}
