use soroban_sdk::{contracterror, contracttype, Address, BytesN};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Config,
    NextId,
    Lease(u64),
    Claim(u64),
    /// Pending proposal to place the guarantee on Blend during the lease.
    YieldProposal(u64),
    /// Scores the two parties gave each other for a lease.
    Ratings(u64),
    /// Running reputation of an address, across every lease.
    Reputation(Address),
    /// Set once (ratee, rater) has counted towards the ratee's reputation.
    RatedBy(Address, Address),
    /// The tenant's yield buffer is already in the contract for this lease.
    BufferLocked(u64),
}

/// Set once by the constructor. The pool cannot be changed afterwards:
/// nobody can redirect a guarantee to another protocol.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    /// Stablecoin used for rent and guarantees (SAC address).
    pub token: Address,
    /// The single whitelisted Blend pool.
    pub pool: Address,
    /// Index of `token` in the pool's reserve list.
    pub reserve_index: u32,
    /// Receives its share of the yield and forfeited dispute bonds.
    pub arbitration_fund: Address,
    /// Bond the landlord posts with a damage claim.
    pub dispute_bond: i128,
    /// A rating only counts towards reputation if the lease lasted at least
    /// this long (months × period, seconds) ...
    pub min_rated_duration: u64,
    /// ... and held at least this guarantee. Below either, faking a good
    /// reputation with a second wallet would cost nothing.
    pub min_rated_deposit: i128,
}

/// Fixed by the landlord at creation and accepted by the tenant when funding.
/// Durations are in seconds so the demo can run with 1 month = 60 s.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Terms {
    pub rent: i128,
    /// Guarantee, at least one month of rent.
    pub deposit: i128,
    pub months: u32,
    /// Length of one rental month.
    pub period: u64,
    /// Delay after a due date before an unpaid month can be claimed.
    pub grace: u64,
    /// Time after creation to fund and confirm move-in.
    pub move_in_window: u64,
    /// Time after the end of the lease to file a damage claim.
    pub claim_window: u64,
    /// Time the tenant has to answer a damage claim.
    pub response_window: u64,
    /// Time the arbiter has to decide once the tenant countered. Past it,
    /// anyone can settle the dispute halfway between the claim and the offer.
    pub arbitration_window: u64,
    pub arbiter: Address,
    /// Landlord offers to place the guarantee on Blend.
    pub yield_offered: bool,
    /// Extra the tenant locks when the yield option is on, in basis points
    /// of the deposit. It absorbs a Blend loss before anything else.
    pub buffer_bps: u32,
    /// Yield split; the arbitration fund gets the rest.
    pub tenant_share_bps: u32,
    pub landlord_share_bps: u32,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Status {
    /// Waiting for the tenant to fund.
    Created,
    /// Funded, waiting for both parties to confirm move-in.
    Funded,
    Active,
    /// Lease over, damage-claim window open.
    Ended,
    /// Damage claim filed, waiting for the tenant.
    Claimed,
    /// Tenant countered; the landlord can accept or the arbiter decides.
    Disputed,
    Closed,
    /// Move-in never happened, everything went back to the tenant.
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Claim {
    pub amount: i128,
    pub evidence: BytesN<32>,
    pub filed_at: u64,
    pub bond: i128,
    /// Tenant counter-offer, once answered.
    pub offer: Option<i128>,
    /// When the tenant countered (0 before): opens the arbitration window.
    pub answered_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Lease {
    pub landlord: Address,
    pub tenant: Option<Address>,
    pub terms: Terms,
    pub status: Status,
    pub created_at: u64,
    /// Move-in time; month `m` is due at `start + m * period`.
    pub start: u64,
    pub ended_at: u64,
    /// Months paid by the tenant or taken from the guarantee. Month 0 is the
    /// first rent, locked at funding.
    pub months_settled: u32,
    /// Months taken from the guarantee for the landlord.
    pub months_unpaid: u32,
    /// First month of rent, released at move-in.
    pub rent_escrow: i128,
    /// Guarantee tokens held by this contract for the lease.
    pub liquid: i128,
    /// Blend b-tokens attributed to the lease.
    pub shares: i128,
    /// Principal still placed on Blend.
    pub placed: i128,
    pub yield_active: bool,
    pub entry_hash: Option<BytesN<32>>,
    pub tenant_moved_in: bool,
    pub landlord_moved_in: bool,
    pub exit_hash: Option<BytesN<32>>,
}

/// Proposal to lend the guarantee on Blend once the lease is running. It
/// only executes when both parties have approved it. The tenant's buffer is
/// locked when the tenant approves and refunded if the proposal is dropped.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct YieldProposal {
    pub proposer: Address,
    /// Part of the guarantee that stays liquid in the contract (≥ one month).
    pub keep: i128,
    pub tenant_share_bps: u32,
    pub landlord_share_bps: u32,
    /// Buffer the tenant locks on approval (terms.buffer_bps of the deposit).
    pub buffer: i128,
    pub tenant_ok: bool,
    pub landlord_ok: bool,
}

/// Scores (1 to 5) the parties gave each other once the lease was over.
#[contracttype]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct LeaseRatings {
    /// Score the tenant gave the landlord.
    pub by_tenant: Option<u32>,
    /// Score the landlord gave the tenant.
    pub by_landlord: Option<u32>,
}

/// Scores an address received on leases that met the rating thresholds.
#[contracttype]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Reputation {
    pub count: u32,
    pub total: u32,
    /// Different addresses that rated it: five stars from one friend show.
    pub counterparties: u32,
    /// Total duration of the rated leases, in seconds.
    pub lease_seconds: u64,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    LeaseNotFound = 1,
    InvalidTerms = 2,
    WrongStatus = 3,
    NotAParty = 4,
    DeadlinePassed = 5,
    TooEarly = 6,
    HashMismatch = 7,
    InvalidAmount = 8,
    NothingDue = 9,
    BlendIsSafe = 10,
    SameParty = 11,
    AlreadyConfirmed = 12,
    AlreadyRated = 13,
    InvalidScore = 14,
}
