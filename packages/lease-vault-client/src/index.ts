import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}





















export interface Request {
  address: string;
  amount: i128;
  request_type: u32;
}


export interface Reserve {
  asset: string;
  config: ReserveConfig;
  data: ReserveData;
  scalar: i128;
}


export interface Positions {
  collateral: Map<u32, i128>;
  liabilities: Map<u32, i128>;
  supply: Map<u32, i128>;
}


export interface ReserveData {
  b_rate: i128;
  b_supply: i128;
  backstop_credit: i128;
  d_rate: i128;
  d_supply: i128;
  ir_mod: i128;
  last_time: u64;
}


export interface ReserveConfig {
  c_factor: u32;
  decimals: u32;
  enabled: boolean;
  index: u32;
  l_factor: u32;
  max_util: u32;
  r_base: u32;
  r_one: u32;
  r_three: u32;
  r_two: u32;
  reactivity: u32;
  supply_cap: i128;
  util: u32;
}


export interface Claim {
  amount: i128;
  bond: i128;
  evidence: Buffer;
  filed_at: u64;
  /**
 * Tenant counter-offer, once answered.
 */
offer: Option<i128>;
}

export const Errors = {
  1: {message:"LeaseNotFound"},
  2: {message:"InvalidTerms"},
  3: {message:"WrongStatus"},
  4: {message:"NotAParty"},
  5: {message:"DeadlinePassed"},
  6: {message:"TooEarly"},
  7: {message:"HashMismatch"},
  8: {message:"InvalidAmount"},
  9: {message:"NothingDue"},
  10: {message:"BlendIsSafe"},
  11: {message:"SameParty"},
  12: {message:"AlreadyConfirmed"},
  13: {message:"AlreadyRated"},
  14: {message:"InvalidScore"}
}


export interface Lease {
  created_at: u64;
  ended_at: u64;
  entry_hash: Option<Buffer>;
  exit_hash: Option<Buffer>;
  landlord: string;
  landlord_moved_in: boolean;
  /**
 * Guarantee tokens held by this contract for the lease.
 */
liquid: i128;
  /**
 * Months paid by the tenant or taken from the guarantee. Month 0 is the
 * first rent, locked at funding.
 */
months_settled: u32;
  /**
 * Months the landlord took from the guarantee.
 */
months_unpaid: u32;
  /**
 * Principal still placed on Blend.
 */
placed: i128;
  /**
 * First month of rent, released at move-in.
 */
rent_escrow: i128;
  /**
 * Blend b-tokens attributed to the lease.
 */
shares: i128;
  /**
 * Move-in time; month `m` is due at `start + m * period`.
 */
start: u64;
  status: Status;
  tenant: Option<string>;
  tenant_moved_in: boolean;
  terms: Terms;
  yield_active: boolean;
}


/**
 * Fixed by the landlord at creation and accepted by the tenant when funding.
 * Durations are in seconds so the demo can run with 1 month = 60 s.
 */
export interface Terms {
  arbiter: string;
  /**
 * Extra the tenant locks when the yield option is on, in basis points
 * of the deposit. It absorbs a Blend loss before anything else.
 */
buffer_bps: u32;
  /**
 * Time after the end of the lease to file a damage claim.
 */
claim_window: u64;
  /**
 * Guarantee, at least one month of rent.
 */
deposit: i128;
  /**
 * Delay after a due date before an unpaid month can be claimed.
 */
grace: u64;
  landlord_share_bps: u32;
  months: u32;
  /**
 * Time after creation to fund and confirm move-in.
 */
move_in_window: u64;
  /**
 * Length of one rental month.
 */
period: u64;
  rent: i128;
  /**
 * Time the tenant has to answer a damage claim.
 */
response_window: u64;
  /**
 * Yield split; the arbitration fund gets the rest.
 */
tenant_share_bps: u32;
  /**
 * Landlord offers to place the guarantee on Blend.
 */
yield_offered: boolean;
}


/**
 * Set once by the constructor. The pool cannot be changed afterwards:
 * nobody can redirect a guarantee to another protocol.
 */
export interface Config {
  /**
 * Receives its share of the yield and forfeited dispute bonds.
 */
arbitration_fund: string;
  /**
 * Bond the landlord posts with a damage claim.
 */
dispute_bond: i128;
  /**
 * ... and held at least this guarantee. Below either, faking a good
 * reputation with a second wallet would cost nothing.
 */
min_rated_deposit: i128;
  /**
 * A rating only counts towards reputation if the lease lasted at least
 * this long (months × period, seconds) ...
 */
min_rated_duration: u64;
  /**
 * The single whitelisted Blend pool.
 */
pool: string;
  /**
 * Index of `token` in the pool's reserve list.
 */
reserve_index: u32;
  /**
 * Stablecoin used for rent and guarantees (SAC address).
 */
token: string;
}

export type Status = {tag: "Created", values: void} | {tag: "Funded", values: void} | {tag: "Active", values: void} | {tag: "Ended", values: void} | {tag: "Claimed", values: void} | {tag: "Disputed", values: void} | {tag: "Closed", values: void} | {tag: "Refunded", values: void};

export type DataKey = {tag: "Config", values: void} | {tag: "NextId", values: void} | {tag: "Lease", values: readonly [u64]} | {tag: "Claim", values: readonly [u64]} | {tag: "YieldProposal", values: readonly [u64]} | {tag: "Ratings", values: readonly [u64]} | {tag: "Reputation", values: readonly [string]} | {tag: "RatedBy", values: readonly [string, string]} | {tag: "BufferLocked", values: readonly [u64]};


/**
 * Scores an address received on leases that met the rating thresholds.
 */
export interface Reputation {
  count: u32;
  /**
 * Different addresses that rated it: five stars from one friend show.
 */
counterparties: u32;
  /**
 * Total duration of the rated leases, in seconds.
 */
lease_seconds: u64;
  total: u32;
}


/**
 * Scores (1 to 5) the parties gave each other once the lease was over.
 */
export interface LeaseRatings {
  /**
 * Score the landlord gave the tenant.
 */
by_landlord: Option<u32>;
  /**
 * Score the tenant gave the landlord.
 */
by_tenant: Option<u32>;
}


/**
 * Proposal to lend the guarantee on Blend once the lease is running. It
 * only executes when both parties have approved it. The tenant's buffer is
 * locked when the tenant approves and refunded if the proposal is dropped.
 */
export interface YieldProposal {
  /**
 * Buffer the tenant locks on approval (terms.buffer_bps of the deposit).
 */
buffer: i128;
  /**
 * Part of the guarantee that stays liquid in the contract (≥ one month).
 */
keep: i128;
  landlord_ok: boolean;
  landlord_share_bps: u32;
  proposer: string;
  tenant_ok: boolean;
  tenant_share_bps: u32;
}

export interface Client {
  /**
   * Construct and simulate a fund transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Tenant accepts the terms and locks the first rent plus the guarantee.
   * With the yield option, the tenant also locks the buffer and everything
   * but one month of rent goes to Blend.
   */
  fund: ({id, tenant, accept_yield}: {id: u64, tenant: string, accept_yield: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a rate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Once the lease is over, each party rates the other from 1 to 5, once.
   * Only the two parties of a real lease can rate, so scores cannot be
   * bought without signing and funding a lease.
   */
  rate: ({id, who, score}: {id: u64, who: string, score: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a release transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * No damage claim within the window: the whole guarantee, and the
   * tenant's share of the yield, goes back to the tenant. Callable by anyone.
   */
  release: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a resolve transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Arbiter splits the disputed amount between the two parties only. If
   * the landlord gets less than half of the claim, the bond is forfeited
   * to the arbitration fund.
   */
  resolve: ({id, to_landlord}: {id: u64, to_landlord: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a respond transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Tenant answers a damage claim. Offering the full amount accepts it;
   * anything less is a counter-offer that the landlord can accept or the
   * arbiter settles.
   */
  respond: ({id, offer}: {id: u64, offer: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a pay_rent transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Tenant pays the next month directly to the landlord.
   */
  pay_rent: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a end_lease transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Either party ends the lease after its term and may record the exit
   * inventory hash. Opens the damage-claim window.
   */
  end_lease: ({id, who, exit_hash}: {id: u64, who: string, exit_hash: Option<Buffer>}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The damage claim of a lease, if one was filed.
   */
  get_claim: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Claim>>>

  /**
   * Construct and simulate a get_lease transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_lease: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Lease>>

  /**
   * Construct and simulate a exit_blend transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pulls a lease's guarantee out of Blend. The tenant or the landlord can
   * do it at any time (the option is reversible). Anyone else, such as the
   * coordinator agent, only when the position lost value or the pool is
   * close to full utilization.
   */
  exit_blend: ({id, caller}: {id: u64, caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_config: (options?: MethodOptions) => Promise<AssembledTransaction<Config>>

  /**
   * Construct and simulate a get_ratings transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_ratings: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<LeaseRatings>>

  /**
   * Construct and simulate a lease_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  lease_count: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a cancel_yield transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Either party withdraws a pending proposal; a locked buffer goes back
   * to the tenant. Once placed, `exit_blend` brings the funds back.
   */
  cancel_yield: ({id, who}: {id: u64, who: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a claim_damage transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Landlord claims `amount` for damage, with the hash of the evidence,
   * and posts the dispute bond. The undisputed part of the guarantee goes
   * back to the tenant immediately.
   */
  claim_damage: ({id, amount, evidence}: {id: u64, amount: i128, evidence: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a claim_unpaid transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Landlord takes an unpaid month from the guarantee once the grace
   * period has passed: liquid month first, then Blend.
   */
  claim_unpaid: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a create_lease transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Landlord publishes the terms. Returns the lease id to share with the tenant.
   */
  create_lease: ({landlord, terms}: {landlord: string, terms: Terms}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a approve_yield transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The other party approves the pending proposal. The second approval
   * places `liquid - keep` on Blend; the tenant's buffer joins the liquid part.
   */
  approve_yield: ({id, who}: {id: u64, who: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a blend_at_risk transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * True when anyone may call `exit_blend` for this lease.
   */
  blend_at_risk: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a execute_claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Tenant stayed silent past the response window: the claim is paid.
   * Callable by anyone.
   */
  execute_claim: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a propose_yield transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * A party proposes to lend part of the guarantee on Blend while the
   * lease runs. `keep` stays liquid in the contract and must cover at
   * least one month of rent. Nothing moves until the other party approves.
   */
  propose_yield: ({id, who, keep, tenant_share_bps, landlord_share_bps}: {id: u64, who: string, keep: i128, tenant_share_bps: u32, landlord_share_bps: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a accept_counter transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Landlord accepts the tenant's counter-offer.
   */
  accept_counter: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_reputation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Scores received by `who` across all leases: average = total / count.
   */
  get_reputation: ({who}: {who: string}, options?: MethodOptions) => Promise<AssembledTransaction<Reputation>>

  /**
   * Construct and simulate a refund_no_keys transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Move-in deadline passed without both confirmations: the tenant gets
   * everything back. Callable by anyone.
   */
  refund_no_keys: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a confirm_move_in transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Both parties co-sign the hash of the move-in inventory. The second
   * signature must match the first; it then releases the first rent.
   */
  confirm_move_in: ({id, who, entry_hash}: {id: u64, who: string, entry_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a guarantee_value transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Current value of the lease's guarantee: liquid part plus Blend position.
   */
  guarantee_value: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_yield_proposal transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_yield_proposal: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Option<YieldProposal>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {token, pool, arbitration_fund, dispute_bond, min_rated_duration, min_rated_deposit}: {token: string, pool: string, arbitration_fund: string, dispute_bond: i128, min_rated_duration: u64, min_rated_deposit: i128},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({token, pool, arbitration_fund, dispute_bond, min_rated_duration, min_rated_deposit}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABQAAAAAAAAAAAAAABVJhdGVkAAAAAAAAAQAAAAVyYXRlZAAAAAAAAAUAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAAAAAAFcmF0ZXIAAAAAAAATAAAAAQAAAAAAAAAFcmF0ZWUAAAAAAAATAAAAAAAAAAAAAAAFc2NvcmUAAAAAAAAEAAAAAAAAADVGYWxzZSB3aGVuIHRoZSBsZWFzZSB3YXMgYmVsb3cgdGhlIHJhdGluZyB0aHJlc2hvbGRzLgAAAAAAAAdjb3VudGVkAAAAAAEAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAB01vdmVkSW4AAAAAAQAAAAhtb3ZlZF9pbgAAAAIAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAAAAAAKZW50cnlfaGFzaAAAAAAD7gAAACAAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAACFJlbnRQYWlkAAAAAQAAAAlyZW50X3BhaWQAAAAAAAADAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABW1vbnRoAAAAAAAABAAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAACkxlYXNlRW5kZWQAAAAAAAEAAAALbGVhc2VfZW5kZWQAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAC0JsZW5kRXhpdGVkAAAAAAEAAAAMYmxlbmRfZXhpdGVkAAAAAwAAAAAAAAACaWQAAAAAAAYAAAABAAAAAAAAAAhyZWFsaXplZAAAAAsAAAAAAAAAAAAAAARnYWluAAAACwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAC0xlYXNlRnVuZGVkAAAAAAEAAAAMbGVhc2VfZnVuZGVkAAAABAAAAAAAAAACaWQAAAAAAAYAAAABAAAAAAAAAAZ0ZW5hbnQAAAAAABMAAAABAAAAAAAAAAV0b3RhbAAAAAAAAAsAAAAAAAAAAAAAAAx5aWVsZF9hY3RpdmUAAAABAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADExlYXNlQ3JlYXRlZAAAAAEAAAANbGVhc2VfY3JlYXRlZAAAAAAAAAQAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAAAAAAIbGFuZGxvcmQAAAATAAAAAQAAAAAAAAAEcmVudAAAAAsAAAAAAAAAAAAAAAdkZXBvc2l0AAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADExlYXNlU2V0dGxlZAAAAAEAAAANbGVhc2Vfc2V0dGxlZAAAAAAAAAMAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAAAAAALdG9fbGFuZGxvcmQAAAAACwAAAAAAAAAAAAAACXRvX3RlbmFudAAAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADUNsYWltQW5zd2VyZWQAAAAAAAABAAAADmNsYWltX2Fuc3dlcmVkAAAAAAACAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABW9mZmVyAAAAAAAACwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAADURhbWFnZUNsYWltZWQAAAAAAAABAAAADmRhbWFnZV9jbGFpbWVkAAAAAAADAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAAAAAADHJlZnVuZGVkX25vdwAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADUxlYXNlUmVmdW5kZWQAAAAAAAABAAAADmxlYXNlX3JlZnVuZGVkAAAAAAACAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAADVVucGFpZENsYWltZWQAAAAAAAABAAAADnVucGFpZF9jbGFpbWVkAAAAAAADAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABW1vbnRoAAAAAAAABAAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAADVlpZWxkQXBwcm92ZWQAAAAAAAABAAAADnlpZWxkX2FwcHJvdmVkAAAAAAACAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAACGFwcHJvdmVyAAAAEwAAAAEAAAAC",
        "AAAABQAAAAAAAAAAAAAADVlpZWxkUHJvcG9zZWQAAAAAAAABAAAADnlpZWxkX3Byb3Bvc2VkAAAAAAADAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAACHByb3Bvc2VyAAAAEwAAAAEAAAAAAAAABGtlZXAAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADkJsZW5kRGVwb3NpdGVkAAAAAAABAAAAD2JsZW5kX2RlcG9zaXRlZAAAAAACAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAADllpZWxkQ2FuY2VsbGVkAAAAAAABAAAAD3lpZWxkX2NhbmNlbGxlZAAAAAACAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAACHJlZnVuZGVkAAAACwAAAAAAAAAC",
        "AAAAAAAAALFUZW5hbnQgYWNjZXB0cyB0aGUgdGVybXMgYW5kIGxvY2tzIHRoZSBmaXJzdCByZW50IHBsdXMgdGhlIGd1YXJhbnRlZS4KV2l0aCB0aGUgeWllbGQgb3B0aW9uLCB0aGUgdGVuYW50IGFsc28gbG9ja3MgdGhlIGJ1ZmZlciBhbmQgZXZlcnl0aGluZwpidXQgb25lIG1vbnRoIG9mIHJlbnQgZ29lcyB0byBCbGVuZC4AAAAAAAAEZnVuZAAAAAMAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAZ0ZW5hbnQAAAAAABMAAAAAAAAADGFjY2VwdF95aWVsZAAAAAEAAAAA",
        "AAAAAAAAALRPbmNlIHRoZSBsZWFzZSBpcyBvdmVyLCBlYWNoIHBhcnR5IHJhdGVzIHRoZSBvdGhlciBmcm9tIDEgdG8gNSwgb25jZS4KT25seSB0aGUgdHdvIHBhcnRpZXMgb2YgYSByZWFsIGxlYXNlIGNhbiByYXRlLCBzbyBzY29yZXMgY2Fubm90IGJlCmJvdWdodCB3aXRob3V0IHNpZ25pbmcgYW5kIGZ1bmRpbmcgYSBsZWFzZS4AAAAEcmF0ZQAAAAMAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAN3aG8AAAAAEwAAAAAAAAAFc2NvcmUAAAAAAAAEAAAAAA==",
        "AAAAAAAAAIlObyBkYW1hZ2UgY2xhaW0gd2l0aGluIHRoZSB3aW5kb3c6IHRoZSB3aG9sZSBndWFyYW50ZWUsIGFuZCB0aGUKdGVuYW50J3Mgc2hhcmUgb2YgdGhlIHlpZWxkLCBnb2VzIGJhY2sgdG8gdGhlIHRlbmFudC4gQ2FsbGFibGUgYnkgYW55b25lLgAAAAAAAAdyZWxlYXNlAAAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAA==",
        "AAAAAAAAAKFBcmJpdGVyIHNwbGl0cyB0aGUgZGlzcHV0ZWQgYW1vdW50IGJldHdlZW4gdGhlIHR3byBwYXJ0aWVzIG9ubHkuIElmCnRoZSBsYW5kbG9yZCBnZXRzIGxlc3MgdGhhbiBoYWxmIG9mIHRoZSBjbGFpbSwgdGhlIGJvbmQgaXMgZm9yZmVpdGVkCnRvIHRoZSBhcmJpdHJhdGlvbiBmdW5kLgAAAAAAAAdyZXNvbHZlAAAAAAIAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAt0b19sYW5kbG9yZAAAAAALAAAAAA==",
        "AAAAAAAAAJlUZW5hbnQgYW5zd2VycyBhIGRhbWFnZSBjbGFpbS4gT2ZmZXJpbmcgdGhlIGZ1bGwgYW1vdW50IGFjY2VwdHMgaXQ7CmFueXRoaW5nIGxlc3MgaXMgYSBjb3VudGVyLW9mZmVyIHRoYXQgdGhlIGxhbmRsb3JkIGNhbiBhY2NlcHQgb3IgdGhlCmFyYml0ZXIgc2V0dGxlcy4AAAAAAAAHcmVzcG9uZAAAAAACAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAFb2ZmZXIAAAAAAAALAAAAAA==",
        "AAAAAAAAADRUZW5hbnQgcGF5cyB0aGUgbmV4dCBtb250aCBkaXJlY3RseSB0byB0aGUgbGFuZGxvcmQuAAAACHBheV9yZW50AAAAAQAAAAAAAAACaWQAAAAAAAYAAAAA",
        "AAAAAAAAAHFFaXRoZXIgcGFydHkgZW5kcyB0aGUgbGVhc2UgYWZ0ZXIgaXRzIHRlcm0gYW5kIG1heSByZWNvcmQgdGhlIGV4aXQKaW52ZW50b3J5IGhhc2guIE9wZW5zIHRoZSBkYW1hZ2UtY2xhaW0gd2luZG93LgAAAAAAAAllbmRfbGVhc2UAAAAAAAADAAAAAAAAAAJpZAAAAAAABgAAAAAAAAADd2hvAAAAABMAAAAAAAAACWV4aXRfaGFzaAAAAAAAA+gAAAPuAAAAIAAAAAA=",
        "AAAAAAAAAC5UaGUgZGFtYWdlIGNsYWltIG9mIGEgbGVhc2UsIGlmIG9uZSB3YXMgZmlsZWQuAAAAAAAJZ2V0X2NsYWltAAAAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAD6AAAB9AAAAAFQ2xhaW0AAAA=",
        "AAAAAAAAAAAAAAAJZ2V0X2xlYXNlAAAAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAH0AAAAAVMZWFzZQAAAA==",
        "AAAAAAAAAOxQdWxscyBhIGxlYXNlJ3MgZ3VhcmFudGVlIG91dCBvZiBCbGVuZC4gVGhlIHRlbmFudCBvciB0aGUgbGFuZGxvcmQgY2FuCmRvIGl0IGF0IGFueSB0aW1lICh0aGUgb3B0aW9uIGlzIHJldmVyc2libGUpLiBBbnlvbmUgZWxzZSwgc3VjaCBhcyB0aGUKY29vcmRpbmF0b3IgYWdlbnQsIG9ubHkgd2hlbiB0aGUgcG9zaXRpb24gbG9zdCB2YWx1ZSBvciB0aGUgcG9vbCBpcwpjbG9zZSB0byBmdWxsIHV0aWxpemF0aW9uLgAAAApleGl0X2JsZW5kAAAAAAACAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAA==",
        "AAAAAAAAAAAAAAAKZ2V0X2NvbmZpZwAAAAAAAAAAAAEAAAfQAAAABkNvbmZpZwAA",
        "AAAAAAAAAAAAAAALZ2V0X3JhdGluZ3MAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAH0AAAAAxMZWFzZVJhdGluZ3M=",
        "AAAAAAAAAAAAAAALbGVhc2VfY291bnQAAAAAAAAAAAEAAAAG",
        "AAAAAAAAAIRFaXRoZXIgcGFydHkgd2l0aGRyYXdzIGEgcGVuZGluZyBwcm9wb3NhbDsgYSBsb2NrZWQgYnVmZmVyIGdvZXMgYmFjawp0byB0aGUgdGVuYW50LiBPbmNlIHBsYWNlZCwgYGV4aXRfYmxlbmRgIGJyaW5ncyB0aGUgZnVuZHMgYmFjay4AAAAMY2FuY2VsX3lpZWxkAAAAAgAAAAAAAAACaWQAAAAAAAYAAAAAAAAAA3dobwAAAAATAAAAAA==",
        "AAAAAAAAAKlMYW5kbG9yZCBjbGFpbXMgYGFtb3VudGAgZm9yIGRhbWFnZSwgd2l0aCB0aGUgaGFzaCBvZiB0aGUgZXZpZGVuY2UsCmFuZCBwb3N0cyB0aGUgZGlzcHV0ZSBib25kLiBUaGUgdW5kaXNwdXRlZCBwYXJ0IG9mIHRoZSBndWFyYW50ZWUgZ29lcwpiYWNrIHRvIHRoZSB0ZW5hbnQgaW1tZWRpYXRlbHkuAAAAAAAADGNsYWltX2RhbWFnZQAAAAMAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAACGV2aWRlbmNlAAAD7gAAACAAAAAA",
        "AAAAAAAAAHNMYW5kbG9yZCB0YWtlcyBhbiB1bnBhaWQgbW9udGggZnJvbSB0aGUgZ3VhcmFudGVlIG9uY2UgdGhlIGdyYWNlCnBlcmlvZCBoYXMgcGFzc2VkOiBsaXF1aWQgbW9udGggZmlyc3QsIHRoZW4gQmxlbmQuAAAAAAxjbGFpbV91bnBhaWQAAAABAAAAAAAAAAJpZAAAAAAABgAAAAA=",
        "AAAAAAAAAExMYW5kbG9yZCBwdWJsaXNoZXMgdGhlIHRlcm1zLiBSZXR1cm5zIHRoZSBsZWFzZSBpZCB0byBzaGFyZSB3aXRoIHRoZSB0ZW5hbnQuAAAADGNyZWF0ZV9sZWFzZQAAAAIAAAAAAAAACGxhbmRsb3JkAAAAEwAAAAAAAAAFdGVybXMAAAAAAAfQAAAABVRlcm1zAAAAAAAAAQAAAAY=",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAYAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAEcG9vbAAAABMAAAAAAAAAEGFyYml0cmF0aW9uX2Z1bmQAAAATAAAAAAAAAAxkaXNwdXRlX2JvbmQAAAALAAAAAAAAABJtaW5fcmF0ZWRfZHVyYXRpb24AAAAAAAYAAAAAAAAAEW1pbl9yYXRlZF9kZXBvc2l0AAAAAAAACwAAAAA=",
        "AAAAAAAAAI5UaGUgb3RoZXIgcGFydHkgYXBwcm92ZXMgdGhlIHBlbmRpbmcgcHJvcG9zYWwuIFRoZSBzZWNvbmQgYXBwcm92YWwKcGxhY2VzIGBsaXF1aWQgLSBrZWVwYCBvbiBCbGVuZDsgdGhlIHRlbmFudCdzIGJ1ZmZlciBqb2lucyB0aGUgbGlxdWlkIHBhcnQuAAAAAAANYXBwcm92ZV95aWVsZAAAAAAAAAIAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAN3aG8AAAAAEwAAAAA=",
        "AAAAAAAAADZUcnVlIHdoZW4gYW55b25lIG1heSBjYWxsIGBleGl0X2JsZW5kYCBmb3IgdGhpcyBsZWFzZS4AAAAAAA1ibGVuZF9hdF9yaXNrAAAAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAAAQ==",
        "AAAAAAAAAFVUZW5hbnQgc3RheWVkIHNpbGVudCBwYXN0IHRoZSByZXNwb25zZSB3aW5kb3c6IHRoZSBjbGFpbSBpcyBwYWlkLgpDYWxsYWJsZSBieSBhbnlvbmUuAAAAAAAADWV4ZWN1dGVfY2xhaW0AAAAAAAABAAAAAAAAAAJpZAAAAAAABgAAAAA=",
        "AAAAAAAAAMpBIHBhcnR5IHByb3Bvc2VzIHRvIGxlbmQgcGFydCBvZiB0aGUgZ3VhcmFudGVlIG9uIEJsZW5kIHdoaWxlIHRoZQpsZWFzZSBydW5zLiBga2VlcGAgc3RheXMgbGlxdWlkIGluIHRoZSBjb250cmFjdCBhbmQgbXVzdCBjb3ZlciBhdApsZWFzdCBvbmUgbW9udGggb2YgcmVudC4gTm90aGluZyBtb3ZlcyB1bnRpbCB0aGUgb3RoZXIgcGFydHkgYXBwcm92ZXMuAAAAAAANcHJvcG9zZV95aWVsZAAAAAAAAAUAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAN3aG8AAAAAEwAAAAAAAAAEa2VlcAAAAAsAAAAAAAAAEHRlbmFudF9zaGFyZV9icHMAAAAEAAAAAAAAABJsYW5kbG9yZF9zaGFyZV9icHMAAAAAAAQAAAAA",
        "AAAAAAAAACxMYW5kbG9yZCBhY2NlcHRzIHRoZSB0ZW5hbnQncyBjb3VudGVyLW9mZmVyLgAAAA5hY2NlcHRfY291bnRlcgAAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAAA",
        "AAAAAAAAAERTY29yZXMgcmVjZWl2ZWQgYnkgYHdob2AgYWNyb3NzIGFsbCBsZWFzZXM6IGF2ZXJhZ2UgPSB0b3RhbCAvIGNvdW50LgAAAA5nZXRfcmVwdXRhdGlvbgAAAAAAAQAAAAAAAAADd2hvAAAAABMAAAABAAAH0AAAAApSZXB1dGF0aW9uAAA=",
        "AAAAAAAAAGhNb3ZlLWluIGRlYWRsaW5lIHBhc3NlZCB3aXRob3V0IGJvdGggY29uZmlybWF0aW9uczogdGhlIHRlbmFudCBnZXRzCmV2ZXJ5dGhpbmcgYmFjay4gQ2FsbGFibGUgYnkgYW55b25lLgAAAA5yZWZ1bmRfbm9fa2V5cwAAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAAA",
        "AAAAAAAAAINCb3RoIHBhcnRpZXMgY28tc2lnbiB0aGUgaGFzaCBvZiB0aGUgbW92ZS1pbiBpbnZlbnRvcnkuIFRoZSBzZWNvbmQKc2lnbmF0dXJlIG11c3QgbWF0Y2ggdGhlIGZpcnN0OyBpdCB0aGVuIHJlbGVhc2VzIHRoZSBmaXJzdCByZW50LgAAAAAPY29uZmlybV9tb3ZlX2luAAAAAAMAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAN3aG8AAAAAEwAAAAAAAAAKZW50cnlfaGFzaAAAAAAD7gAAACAAAAAA",
        "AAAAAAAAAEhDdXJyZW50IHZhbHVlIG9mIHRoZSBsZWFzZSdzIGd1YXJhbnRlZTogbGlxdWlkIHBhcnQgcGx1cyBCbGVuZCBwb3NpdGlvbi4AAAAPZ3VhcmFudGVlX3ZhbHVlAAAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAs=",
        "AAAAAAAAAAAAAAASZ2V0X3lpZWxkX3Byb3Bvc2FsAAAAAAABAAAAAAAAAAJpZAAAAAAABgAAAAEAAAPoAAAH0AAAAA1ZaWVsZFByb3Bvc2FsAAAA",
        "AAAAAQAAAAAAAAAAAAAAB1JlcXVlc3QAAAAAAwAAAAAAAAAHYWRkcmVzcwAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAADHJlcXVlc3RfdHlwZQAAAAQ=",
        "AAAAAQAAAAAAAAAAAAAAB1Jlc2VydmUAAAAABAAAAAAAAAAFYXNzZXQAAAAAAAATAAAAAAAAAAZjb25maWcAAAAAB9AAAAANUmVzZXJ2ZUNvbmZpZwAAAAAAAAAAAAAEZGF0YQAAB9AAAAALUmVzZXJ2ZURhdGEAAAAAAAAAAAZzY2FsYXIAAAAAAAs=",
        "AAAAAQAAAAAAAAAAAAAACVBvc2l0aW9ucwAAAAAAAAMAAAAAAAAACmNvbGxhdGVyYWwAAAAAA+wAAAAEAAAACwAAAAAAAAALbGlhYmlsaXRpZXMAAAAD7AAAAAQAAAALAAAAAAAAAAZzdXBwbHkAAAAAA+wAAAAEAAAACw==",
        "AAAAAQAAAAAAAAAAAAAAC1Jlc2VydmVEYXRhAAAAAAcAAAAAAAAABmJfcmF0ZQAAAAAACwAAAAAAAAAIYl9zdXBwbHkAAAALAAAAAAAAAA9iYWNrc3RvcF9jcmVkaXQAAAAACwAAAAAAAAAGZF9yYXRlAAAAAAALAAAAAAAAAAhkX3N1cHBseQAAAAsAAAAAAAAABmlyX21vZAAAAAAACwAAAAAAAAAJbGFzdF90aW1lAAAAAAAABg==",
        "AAAAAQAAAAAAAAAAAAAADVJlc2VydmVDb25maWcAAAAAAAANAAAAAAAAAAhjX2ZhY3RvcgAAAAQAAAAAAAAACGRlY2ltYWxzAAAABAAAAAAAAAAHZW5hYmxlZAAAAAABAAAAAAAAAAVpbmRleAAAAAAAAAQAAAAAAAAACGxfZmFjdG9yAAAABAAAAAAAAAAIbWF4X3V0aWwAAAAEAAAAAAAAAAZyX2Jhc2UAAAAAAAQAAAAAAAAABXJfb25lAAAAAAAABAAAAAAAAAAHcl90aHJlZQAAAAAEAAAAAAAAAAVyX3R3bwAAAAAAAAQAAAAAAAAACnJlYWN0aXZpdHkAAAAAAAQAAAAAAAAACnN1cHBseV9jYXAAAAAAAAsAAAAAAAAABHV0aWwAAAAE",
        "AAAAAQAAAAAAAAAAAAAABUNsYWltAAAAAAAABQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAARib25kAAAACwAAAAAAAAAIZXZpZGVuY2UAAAPuAAAAIAAAAAAAAAAIZmlsZWRfYXQAAAAGAAAAJFRlbmFudCBjb3VudGVyLW9mZmVyLCBvbmNlIGFuc3dlcmVkLgAAAAVvZmZlcgAAAAAAA+gAAAAL",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAADgAAAAAAAAANTGVhc2VOb3RGb3VuZAAAAAAAAAEAAAAAAAAADEludmFsaWRUZXJtcwAAAAIAAAAAAAAAC1dyb25nU3RhdHVzAAAAAAMAAAAAAAAACU5vdEFQYXJ0eQAAAAAAAAQAAAAAAAAADkRlYWRsaW5lUGFzc2VkAAAAAAAFAAAAAAAAAAhUb29FYXJseQAAAAYAAAAAAAAADEhhc2hNaXNtYXRjaAAAAAcAAAAAAAAADUludmFsaWRBbW91bnQAAAAAAAAIAAAAAAAAAApOb3RoaW5nRHVlAAAAAAAJAAAAAAAAAAtCbGVuZElzU2FmZQAAAAAKAAAAAAAAAAlTYW1lUGFydHkAAAAAAAALAAAAAAAAABBBbHJlYWR5Q29uZmlybWVkAAAADAAAAAAAAAAMQWxyZWFkeVJhdGVkAAAADQAAAAAAAAAMSW52YWxpZFNjb3JlAAAADg==",
        "AAAAAQAAAAAAAAAAAAAABUxlYXNlAAAAAAAAEgAAAAAAAAAKY3JlYXRlZF9hdAAAAAAABgAAAAAAAAAIZW5kZWRfYXQAAAAGAAAAAAAAAAplbnRyeV9oYXNoAAAAAAPoAAAD7gAAACAAAAAAAAAACWV4aXRfaGFzaAAAAAAAA+gAAAPuAAAAIAAAAAAAAAAIbGFuZGxvcmQAAAATAAAAAAAAABFsYW5kbG9yZF9tb3ZlZF9pbgAAAAAAAAEAAAA1R3VhcmFudGVlIHRva2VucyBoZWxkIGJ5IHRoaXMgY29udHJhY3QgZm9yIHRoZSBsZWFzZS4AAAAAAAAGbGlxdWlkAAAAAAALAAAAZE1vbnRocyBwYWlkIGJ5IHRoZSB0ZW5hbnQgb3IgdGFrZW4gZnJvbSB0aGUgZ3VhcmFudGVlLiBNb250aCAwIGlzIHRoZQpmaXJzdCByZW50LCBsb2NrZWQgYXQgZnVuZGluZy4AAAAObW9udGhzX3NldHRsZWQAAAAAAAQAAAAsTW9udGhzIHRoZSBsYW5kbG9yZCB0b29rIGZyb20gdGhlIGd1YXJhbnRlZS4AAAANbW9udGhzX3VucGFpZAAAAAAAAAQAAAAgUHJpbmNpcGFsIHN0aWxsIHBsYWNlZCBvbiBCbGVuZC4AAAAGcGxhY2VkAAAAAAALAAAAKUZpcnN0IG1vbnRoIG9mIHJlbnQsIHJlbGVhc2VkIGF0IG1vdmUtaW4uAAAAAAAAC3JlbnRfZXNjcm93AAAAAAsAAAAnQmxlbmQgYi10b2tlbnMgYXR0cmlidXRlZCB0byB0aGUgbGVhc2UuAAAAAAZzaGFyZXMAAAAAAAsAAAA3TW92ZS1pbiB0aW1lOyBtb250aCBgbWAgaXMgZHVlIGF0IGBzdGFydCArIG0gKiBwZXJpb2RgLgAAAAAFc3RhcnQAAAAAAAAGAAAAAAAAAAZzdGF0dXMAAAAAB9AAAAAGU3RhdHVzAAAAAAAAAAAABnRlbmFudAAAAAAD6AAAABMAAAAAAAAAD3RlbmFudF9tb3ZlZF9pbgAAAAABAAAAAAAAAAV0ZXJtcwAAAAAAB9AAAAAFVGVybXMAAAAAAAAAAAAADHlpZWxkX2FjdGl2ZQAAAAE=",
        "AAAAAQAAAIxGaXhlZCBieSB0aGUgbGFuZGxvcmQgYXQgY3JlYXRpb24gYW5kIGFjY2VwdGVkIGJ5IHRoZSB0ZW5hbnQgd2hlbiBmdW5kaW5nLgpEdXJhdGlvbnMgYXJlIGluIHNlY29uZHMgc28gdGhlIGRlbW8gY2FuIHJ1biB3aXRoIDEgbW9udGggPSA2MCBzLgAAAAAAAAAFVGVybXMAAAAAAAANAAAAAAAAAAdhcmJpdGVyAAAAABMAAACBRXh0cmEgdGhlIHRlbmFudCBsb2NrcyB3aGVuIHRoZSB5aWVsZCBvcHRpb24gaXMgb24sIGluIGJhc2lzIHBvaW50cwpvZiB0aGUgZGVwb3NpdC4gSXQgYWJzb3JicyBhIEJsZW5kIGxvc3MgYmVmb3JlIGFueXRoaW5nIGVsc2UuAAAAAAAACmJ1ZmZlcl9icHMAAAAAAAQAAAA3VGltZSBhZnRlciB0aGUgZW5kIG9mIHRoZSBsZWFzZSB0byBmaWxlIGEgZGFtYWdlIGNsYWltLgAAAAAMY2xhaW1fd2luZG93AAAABgAAACZHdWFyYW50ZWUsIGF0IGxlYXN0IG9uZSBtb250aCBvZiByZW50LgAAAAAAB2RlcG9zaXQAAAAACwAAAD1EZWxheSBhZnRlciBhIGR1ZSBkYXRlIGJlZm9yZSBhbiB1bnBhaWQgbW9udGggY2FuIGJlIGNsYWltZWQuAAAAAAAABWdyYWNlAAAAAAAABgAAAAAAAAASbGFuZGxvcmRfc2hhcmVfYnBzAAAAAAAEAAAAAAAAAAZtb250aHMAAAAAAAQAAAAwVGltZSBhZnRlciBjcmVhdGlvbiB0byBmdW5kIGFuZCBjb25maXJtIG1vdmUtaW4uAAAADm1vdmVfaW5fd2luZG93AAAAAAAGAAAAG0xlbmd0aCBvZiBvbmUgcmVudGFsIG1vbnRoLgAAAAAGcGVyaW9kAAAAAAAGAAAAAAAAAARyZW50AAAACwAAAC1UaW1lIHRoZSB0ZW5hbnQgaGFzIHRvIGFuc3dlciBhIGRhbWFnZSBjbGFpbS4AAAAAAAAPcmVzcG9uc2Vfd2luZG93AAAAAAYAAAAwWWllbGQgc3BsaXQ7IHRoZSBhcmJpdHJhdGlvbiBmdW5kIGdldHMgdGhlIHJlc3QuAAAAEHRlbmFudF9zaGFyZV9icHMAAAAEAAAAMExhbmRsb3JkIG9mZmVycyB0byBwbGFjZSB0aGUgZ3VhcmFudGVlIG9uIEJsZW5kLgAAAA15aWVsZF9vZmZlcmVkAAAAAAAAAQ==",
        "AAAAAQAAAHhTZXQgb25jZSBieSB0aGUgY29uc3RydWN0b3IuIFRoZSBwb29sIGNhbm5vdCBiZSBjaGFuZ2VkIGFmdGVyd2FyZHM6Cm5vYm9keSBjYW4gcmVkaXJlY3QgYSBndWFyYW50ZWUgdG8gYW5vdGhlciBwcm90b2NvbC4AAAAAAAAABkNvbmZpZwAAAAAABwAAADxSZWNlaXZlcyBpdHMgc2hhcmUgb2YgdGhlIHlpZWxkIGFuZCBmb3JmZWl0ZWQgZGlzcHV0ZSBib25kcy4AAAAQYXJiaXRyYXRpb25fZnVuZAAAABMAAAAsQm9uZCB0aGUgbGFuZGxvcmQgcG9zdHMgd2l0aCBhIGRhbWFnZSBjbGFpbS4AAAAMZGlzcHV0ZV9ib25kAAAACwAAAHUuLi4gYW5kIGhlbGQgYXQgbGVhc3QgdGhpcyBndWFyYW50ZWUuIEJlbG93IGVpdGhlciwgZmFraW5nIGEgZ29vZApyZXB1dGF0aW9uIHdpdGggYSBzZWNvbmQgd2FsbGV0IHdvdWxkIGNvc3Qgbm90aGluZy4AAAAAAAARbWluX3JhdGVkX2RlcG9zaXQAAAAAAAALAAAAbkEgcmF0aW5nIG9ubHkgY291bnRzIHRvd2FyZHMgcmVwdXRhdGlvbiBpZiB0aGUgbGVhc2UgbGFzdGVkIGF0IGxlYXN0CnRoaXMgbG9uZyAobW9udGhzIMOXIHBlcmlvZCwgc2Vjb25kcykgLi4uAAAAAAASbWluX3JhdGVkX2R1cmF0aW9uAAAAAAAGAAAAIlRoZSBzaW5nbGUgd2hpdGVsaXN0ZWQgQmxlbmQgcG9vbC4AAAAAAARwb29sAAAAEwAAACxJbmRleCBvZiBgdG9rZW5gIGluIHRoZSBwb29sJ3MgcmVzZXJ2ZSBsaXN0LgAAAA1yZXNlcnZlX2luZGV4AAAAAAAABAAAADZTdGFibGVjb2luIHVzZWQgZm9yIHJlbnQgYW5kIGd1YXJhbnRlZXMgKFNBQyBhZGRyZXNzKS4AAAAAAAV0b2tlbgAAAAAAABM=",
        "AAAAAgAAAAAAAAAAAAAABlN0YXR1cwAAAAAACAAAAAAAAAAfV2FpdGluZyBmb3IgdGhlIHRlbmFudCB0byBmdW5kLgAAAAAHQ3JlYXRlZAAAAAAAAAAANEZ1bmRlZCwgd2FpdGluZyBmb3IgYm90aCBwYXJ0aWVzIHRvIGNvbmZpcm0gbW92ZS1pbi4AAAAGRnVuZGVkAAAAAAAAAAAAAAAAAAZBY3RpdmUAAAAAAAAAAAAlTGVhc2Ugb3ZlciwgZGFtYWdlLWNsYWltIHdpbmRvdyBvcGVuLgAAAAAAAAVFbmRlZAAAAAAAAAAAAAArRGFtYWdlIGNsYWltIGZpbGVkLCB3YWl0aW5nIGZvciB0aGUgdGVuYW50LgAAAAAHQ2xhaW1lZAAAAAAAAAAAQVRlbmFudCBjb3VudGVyZWQ7IHRoZSBsYW5kbG9yZCBjYW4gYWNjZXB0IG9yIHRoZSBhcmJpdGVyIGRlY2lkZXMuAAAAAAAACERpc3B1dGVkAAAAAAAAAAAAAAAGQ2xvc2VkAAAAAAAAAAAAO01vdmUtaW4gbmV2ZXIgaGFwcGVuZWQsIGV2ZXJ5dGhpbmcgd2VudCBiYWNrIHRvIHRoZSB0ZW5hbnQuAAAAAAhSZWZ1bmRlZA==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAACQAAAAAAAAAAAAAABkNvbmZpZwAAAAAAAAAAAAAAAAAGTmV4dElkAAAAAAABAAAAAAAAAAVMZWFzZQAAAAAAAAEAAAAGAAAAAQAAAAAAAAAFQ2xhaW0AAAAAAAABAAAABgAAAAEAAABCUGVuZGluZyBwcm9wb3NhbCB0byBwbGFjZSB0aGUgZ3VhcmFudGVlIG9uIEJsZW5kIGR1cmluZyB0aGUgbGVhc2UuAAAAAAANWWllbGRQcm9wb3NhbAAAAAAAAAEAAAAGAAAAAQAAADNTY29yZXMgdGhlIHR3byBwYXJ0aWVzIGdhdmUgZWFjaCBvdGhlciBmb3IgYSBsZWFzZS4AAAAAB1JhdGluZ3MAAAAAAQAAAAYAAAABAAAANVJ1bm5pbmcgcmVwdXRhdGlvbiBvZiBhbiBhZGRyZXNzLCBhY3Jvc3MgZXZlcnkgbGVhc2UuAAAAAAAAClJlcHV0YXRpb24AAAAAAAEAAAATAAAAAQAAAENTZXQgb25jZSAocmF0ZWUsIHJhdGVyKSBoYXMgY291bnRlZCB0b3dhcmRzIHRoZSByYXRlZSdzIHJlcHV0YXRpb24uAAAAAAdSYXRlZEJ5AAAAAAIAAAATAAAAEwAAAAEAAABEVGhlIHRlbmFudCdzIHlpZWxkIGJ1ZmZlciBpcyBhbHJlYWR5IGluIHRoZSBjb250cmFjdCBmb3IgdGhpcyBsZWFzZS4AAAAMQnVmZmVyTG9ja2VkAAAAAQAAAAY=",
        "AAAAAQAAAERTY29yZXMgYW4gYWRkcmVzcyByZWNlaXZlZCBvbiBsZWFzZXMgdGhhdCBtZXQgdGhlIHJhdGluZyB0aHJlc2hvbGRzLgAAAAAAAAAKUmVwdXRhdGlvbgAAAAAABAAAAAAAAAAFY291bnQAAAAAAAAEAAAAQ0RpZmZlcmVudCBhZGRyZXNzZXMgdGhhdCByYXRlZCBpdDogZml2ZSBzdGFycyBmcm9tIG9uZSBmcmllbmQgc2hvdy4AAAAADmNvdW50ZXJwYXJ0aWVzAAAAAAAEAAAAL1RvdGFsIGR1cmF0aW9uIG9mIHRoZSByYXRlZCBsZWFzZXMsIGluIHNlY29uZHMuAAAAAA1sZWFzZV9zZWNvbmRzAAAAAAAABgAAAAAAAAAFdG90YWwAAAAAAAAE",
        "AAAAAQAAAERTY29yZXMgKDEgdG8gNSkgdGhlIHBhcnRpZXMgZ2F2ZSBlYWNoIG90aGVyIG9uY2UgdGhlIGxlYXNlIHdhcyBvdmVyLgAAAAAAAAAMTGVhc2VSYXRpbmdzAAAAAgAAACNTY29yZSB0aGUgbGFuZGxvcmQgZ2F2ZSB0aGUgdGVuYW50LgAAAAALYnlfbGFuZGxvcmQAAAAD6AAAAAQAAAAjU2NvcmUgdGhlIHRlbmFudCBnYXZlIHRoZSBsYW5kbG9yZC4AAAAACWJ5X3RlbmFudAAAAAAAA+gAAAAE",
        "AAAAAQAAANdQcm9wb3NhbCB0byBsZW5kIHRoZSBndWFyYW50ZWUgb24gQmxlbmQgb25jZSB0aGUgbGVhc2UgaXMgcnVubmluZy4gSXQKb25seSBleGVjdXRlcyB3aGVuIGJvdGggcGFydGllcyBoYXZlIGFwcHJvdmVkIGl0LiBUaGUgdGVuYW50J3MgYnVmZmVyIGlzCmxvY2tlZCB3aGVuIHRoZSB0ZW5hbnQgYXBwcm92ZXMgYW5kIHJlZnVuZGVkIGlmIHRoZSBwcm9wb3NhbCBpcyBkcm9wcGVkLgAAAAAAAAAADVlpZWxkUHJvcG9zYWwAAAAAAAAHAAAARkJ1ZmZlciB0aGUgdGVuYW50IGxvY2tzIG9uIGFwcHJvdmFsICh0ZXJtcy5idWZmZXJfYnBzIG9mIHRoZSBkZXBvc2l0KS4AAAAAAAZidWZmZXIAAAAAAAsAAABIUGFydCBvZiB0aGUgZ3VhcmFudGVlIHRoYXQgc3RheXMgbGlxdWlkIGluIHRoZSBjb250cmFjdCAo4omlIG9uZSBtb250aCkuAAAABGtlZXAAAAALAAAAAAAAAAtsYW5kbG9yZF9vawAAAAABAAAAAAAAABJsYW5kbG9yZF9zaGFyZV9icHMAAAAAAAQAAAAAAAAACHByb3Bvc2VyAAAAEwAAAAAAAAAJdGVuYW50X29rAAAAAAAAAQAAAAAAAAAQdGVuYW50X3NoYXJlX2JwcwAAAAQ=" ]),
      options
    )
  }
  public readonly fromJSON = {
    fund: this.txFromJSON<null>,
        rate: this.txFromJSON<null>,
        release: this.txFromJSON<null>,
        resolve: this.txFromJSON<null>,
        respond: this.txFromJSON<null>,
        pay_rent: this.txFromJSON<null>,
        end_lease: this.txFromJSON<null>,
        get_claim: this.txFromJSON<Option<Claim>>,
        get_lease: this.txFromJSON<Lease>,
        exit_blend: this.txFromJSON<null>,
        get_config: this.txFromJSON<Config>,
        get_ratings: this.txFromJSON<LeaseRatings>,
        lease_count: this.txFromJSON<u64>,
        cancel_yield: this.txFromJSON<null>,
        claim_damage: this.txFromJSON<null>,
        claim_unpaid: this.txFromJSON<null>,
        create_lease: this.txFromJSON<u64>,
        approve_yield: this.txFromJSON<null>,
        blend_at_risk: this.txFromJSON<boolean>,
        execute_claim: this.txFromJSON<null>,
        propose_yield: this.txFromJSON<null>,
        accept_counter: this.txFromJSON<null>,
        get_reputation: this.txFromJSON<Reputation>,
        refund_no_keys: this.txFromJSON<null>,
        confirm_move_in: this.txFromJSON<null>,
        guarantee_value: this.txFromJSON<i128>,
        get_yield_proposal: this.txFromJSON<Option<YieldProposal>>
  }
}