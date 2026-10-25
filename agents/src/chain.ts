// Network access: deployment config, contract clients, lease snapshots,
// event history and local signers.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { Client, type Lease } from "lease-vault-client";
import type { Snapshot } from "./rules.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export interface Deployment {
  network: string;
  rpcUrl: string;
  networkPassphrase: string;
  leaseVault: string;
  usdc: string;
  blendPool: string;
  disputeBond: string;
  accounts: Record<"deployer" | "landlord" | "tenant" | "arbiter" | "arbitrationFund" | "coordinator", string>;
}

export const deployment: Deployment = JSON.parse(
  readFileSync(resolve(root, `deployments/${process.env.STELLAR_NETWORK ?? "testnet"}.json`), "utf8"),
);

export const server = new rpc.Server(process.env.STELLAR_RPC_URL ?? deployment.rpcUrl);

export const explorer = (hash: string) => `https://stellar.expert/explorer/${deployment.network}/tx/${hash}`;

/** Read-only client: simulations need a source account, any funded one works. */
export function reader(): Client {
  return new Client({
    contractId: deployment.leaseVault,
    networkPassphrase: deployment.networkPassphrase,
    rpcUrl: server.serverURL.toString(),
    publicKey: deployment.accounts.coordinator,
  });
}

/** Client that signs with `keypair` (tenant, landlord, arbiter or coordinator). */
export function signer(keypair: Keypair): Client {
  const { signTransaction, signAuthEntry } = basicNodeSigner(keypair, deployment.networkPassphrase);
  return new Client({
    contractId: deployment.leaseVault,
    networkPassphrase: deployment.networkPassphrase,
    rpcUrl: server.serverURL.toString(),
    publicKey: keypair.publicKey(),
    signTransaction,
    signAuthEntry,
  });
}

/**
 * Secret for a role: `<ROLE>_SECRET_KEY` in the environment, or, for local
 * development, the matching `stellar keys` identity (fiavel-<role>).
 */
export function keypairFor(role: string): Keypair {
  const env = process.env[`${role.toUpperCase()}_SECRET_KEY`];
  if (env) return Keypair.fromSecret(env);
  const secret = execFileSync("stellar", ["keys", "show", `fiavel-${role}`], { encoding: "utf8" }).trim();
  return Keypair.fromSecret(secret);
}

/** Signs and submits an assembled call; returns its result and tx hash. */
export async function send<T>(tx: {
  signAndSend: () => Promise<{
    result: T;
    sendTransactionResponse?: { hash: string };
  }>;
}): Promise<{ result: T; hash: string }> {
  const sent = await tx.signAndSend();
  return { result: sent.result, hash: sent.sendTransactionResponse?.hash ?? "" };
}

export async function snapshot(id: bigint, now = Math.floor(Date.now() / 1000)): Promise<Snapshot> {
  const c = reader();
  const lease = (await c.get_lease({ id })).result as Lease;
  const [claim, value, risk] = await Promise.all([
    c.get_claim({ id }).then((t) => t.result ?? undefined),
    c.guarantee_value({ id }).then((t) => t.result),
    c.blend_at_risk({ id }).then((t) => t.result),
  ]);
  return { id, lease, claim, now, guaranteeValue: value, blendAtRisk: risk, ...(await v2State(c, id)) };
}

/**
 * Investment proposal and ratings. A deployment that predates these functions
 * fails the simulation: the snapshot then says v2 = false and the rule engine
 * does not offer them.
 */
export async function v2State(c: Client, id: bigint): Promise<Pick<Snapshot, "proposal" | "ratings" | "v2">> {
  try {
    const [proposal, ratings] = await Promise.all([
      c.get_yield_proposal({ id }).then((t) => t.result ?? undefined),
      c.get_ratings({ id }).then((t) => t.result),
    ]);
    return { proposal, ratings, v2: true };
  } catch {
    return { v2: false };
  }
}

export async function leaseCount(): Promise<bigint> {
  return (await reader().lease_count()).result;
}

export interface LeaseEvent {
  name: string;
  ledger: number;
  at: string;
  tx: string;
  data: unknown;
}

/** Contract events of one lease (RPC keeps about 7 days of events). */
export async function leaseEvents(id: bigint): Promise<LeaseEvent[]> {
  const latest = await server.getLatestLedger();
  const idTopic = xdr.ScVal.scvU64(new xdr.Uint64(id)).toXDR("base64");
  const filters: rpc.Api.EventFilter[] = [
    { type: "contract", contractIds: [deployment.leaseVault], topics: [["*", idTopic, "**"]] },
  ];
  // The RPC scans a bounded range of ledgers per request and returns a
  // cursor: follow it until the latest ledger.
  let res = await server.getEvents({ startLedger: Math.max(latest.sequence - 17_000, 1), filters, limit: 200 });
  const events = [...res.events];
  for (let page = 0; page < 20 && res.cursor && res.events.length < 200; page++) {
    const next = await server.getEvents({ cursor: res.cursor, filters, limit: 200 });
    if (next.cursor === res.cursor) break;
    events.push(...next.events);
    res = next;
    if (next.events.length === 0 && next.latestLedger <= (next.events.at(-1)?.ledger ?? 0)) break;
  }
  return events.map((e) => ({
    name: String(scValToNative(e.topic[0])),
    ledger: e.ledger,
    at: e.ledgerClosedAt,
    tx: e.txHash,
    data: scValToNative(e.value),
  }));
}
