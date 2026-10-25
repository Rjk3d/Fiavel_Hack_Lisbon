// Lease Coordinator: a loop with its own wallet (fees only). It watches every
// lease and calls the public functions whose deadline has passed: release,
// execute_claim, refund_no_keys, and exit_blend when a Blend position is at
// risk. The contract re-checks every condition, so a wrong call just fails.
//
//   npm run coordinator            # loop every 10 s
//   npm run coordinator -- --once  # one pass (see cli.ts)

import { appendFileSync } from "node:fs";
import { explorer, keypairFor, leaseCount, signer, snapshot } from "./chain.js";
import { coordinatorDuties, type Action } from "./rules.js";
import { contractError } from "./tools.js";

let wallet: { keypair: ReturnType<typeof keypairFor>; client: ReturnType<typeof signer> } | undefined;
function coordinator() {
  if (!wallet) {
    const keypair = keypairFor("coordinator");
    wallet = { keypair, client: signer(keypair) };
  }
  return wallet;
}
const JOURNAL = new URL("../journal.jsonl", import.meta.url);

export interface Run {
  id: bigint;
  fn: Action["fn"];
  ok: boolean;
  tx?: string;
  error?: string;
}

function log(entry: Record<string, unknown>) {
  const line = { at: new Date().toISOString(), agent: "coordinator", ...entry };
  appendFileSync(JOURNAL, JSON.stringify(line, (_, v) => (typeof v === "bigint" ? v.toString() : v)) + "\n");
  console.log(`[coordinator] ${line.at} ${JSON.stringify(entry, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);
}

async function call(id: bigint, fn: Action["fn"]): Promise<Run> {
  const { keypair, client } = coordinator();
  try {
    const args = fn === "exit_blend" ? { id, caller: keypair.publicKey() } : { id };
    const tx = await (client as unknown as Record<string, (a: unknown) => Promise<any>>)[fn](args);
    const sent = await tx.signAndSend();
    const hash: string = sent.sendTransactionResponse?.hash ?? sent.getTransactionResponse?.txHash;
    log({ lease: id, fn, ok: true, tx: explorer(hash) });
    return { id, fn, ok: true, tx: hash };
  } catch (e) {
    const error = contractError(String(e));
    log({ lease: id, fn, ok: false, error });
    return { id, fn, ok: false, error };
  }
}

// Storage entries live 7 days unless extended: the coordinator extends every open
// lease once a day, so a long lease with no activity is never archived (v4 `bump`).
const BUMP_EVERY_MS = 24 * 3600 * 1000;
const lastBump = new Map<string, number>();
const OPEN = new Set(["Created", "Funded", "Active", "Ended", "Claimed", "Disputed"]);

async function keepAlive(id: bigint, status: string) {
  const key = id.toString();
  if (!OPEN.has(status) || Date.now() - (lastBump.get(key) ?? 0) < BUMP_EVERY_MS) return;
  lastBump.set(key, Date.now());
  try {
    const tx = await (coordinator().client as unknown as Record<string, (a: unknown) => Promise<any>>).bump({ id });
    await tx.signAndSend();
    log({ lease: id, fn: "bump", ok: true });
  } catch (e) {
    log({ lease: id, fn: "bump", ok: false, error: contractError(String(e)) });
  }
}

/** One pass over all leases. Returns what was attempted. */
export async function tick(only?: bigint[]): Promise<Run[]> {
  const count = await leaseCount();
  const ids = only ?? Array.from({ length: Number(count) }, (_, i) => BigInt(i));
  const runs: Run[] = [];
  for (const id of ids) {
    const s = await snapshot(id);
    for (const duty of coordinatorDuties(s)) {
      runs.push(await call(id, duty.fn));
    }
    if (s.v4) await keepAlive(id, s.lease.status.tag);
  }
  return runs;
}

export async function runLoop(once = false) {
  console.log(`[coordinator] wallet ${coordinator().keypair.publicKey()}`);
  do {
    try {
      const runs = await tick();
      if (runs.length === 0) console.log(`[coordinator] ${new Date().toISOString()} nothing due`);
    } catch (e) {
      console.error(`[coordinator] pass failed: ${e}`);
    }
    if (!once) await new Promise((r) => setTimeout(r, 10_000));
  } while (!once);
}
