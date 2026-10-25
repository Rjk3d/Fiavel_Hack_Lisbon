use soroban_sdk::{contracterror, contracttype, Address, BytesN};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Config,
    NextId,
    Lease(u64),
    Claim(u64),
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
    /// Months the landlord took from the guarantee.
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
}
