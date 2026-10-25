//! LeaseVault: a programmable fiador.
//!
//! Holds the first rent and the guarantee of each lease. Objective cases
//! (unpaid rent, silence after a deadline) are settled by code; only a
//! disputed damage amount goes to a bounded arbiter. The guarantee can
//! optionally be lent on one whitelisted Blend pool when both parties agree;
//! the landlord is always paid before the tenant gets the remainder.

#![no_std]

mod blend;
mod types;

#[cfg(test)]
mod test;

use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractevent, contractimpl, panic_with_error, token::TokenClient, vec, Address,
    BytesN, Env, IntoVal, Symbol,
};

pub use blend::{BlendPoolClient, Positions, Request, Reserve, ReserveConfig, ReserveData};
pub use types::{
    Claim, Config, DataKey, Error, Lease, LeaseRatings, Reputation, Status, Terms, YieldProposal,
};

const BPS: i128 = 10_000;
/// Anyone can pull a lease out of Blend above this utilization (7 decimals):
/// past it, withdrawals may soon be blocked.
const MAX_SAFE_UTILIZATION: i128 = 9_500_000;
/// Loss on the Blend position, in basis points, above which anyone can
/// pull the lease out.
const LOSS_TOLERANCE_BPS: i128 = 10;

// Storage rent. Kept at the network minimum (7 days) because testnet rent
// is currently very expensive: extending a lease to 120 days cost ~50k XLM.
// Each call on a lease keeps it alive; a mainnet build would extend longer.
const DAY_IN_LEDGERS: u32 = 17_280;
const TTL_THRESHOLD: u32 = DAY_IN_LEDGERS;
const TTL_EXTEND_TO: u32 = 7 * DAY_IN_LEDGERS;

#[contractevent]
pub struct LeaseCreated {
    #[topic]
    pub id: u64,
    #[topic]
    pub landlord: Address,
    pub rent: i128,
    pub deposit: i128,
}

#[contractevent]
pub struct LeaseFunded {
    #[topic]
    pub id: u64,
    #[topic]
    pub tenant: Address,
    pub total: i128,
    pub yield_active: bool,
}

#[contractevent]
pub struct MovedIn {
    #[topic]
    pub id: u64,
    pub entry_hash: BytesN<32>,
}

#[contractevent]
pub struct RentPaid {
    #[topic]
    pub id: u64,
    pub month: u32,
    pub amount: i128,
}

#[contractevent]
pub struct UnpaidClaimed {
    #[topic]
    pub id: u64,
    pub month: u32,
    pub amount: i128,
}

#[contractevent]
pub struct LeaseEnded {
    #[topic]
    pub id: u64,
}

#[contractevent]
pub struct DamageClaimed {
    #[topic]
    pub id: u64,
    pub amount: i128,
    pub refunded_now: i128,
}

#[contractevent]
pub struct ClaimAnswered {
    #[topic]
    pub id: u64,
    pub offer: i128,
}

#[contractevent]
pub struct LeaseSettled {
    #[topic]
    pub id: u64,
    pub to_landlord: i128,
    pub to_tenant: i128,
}

#[contractevent]
pub struct LeaseRefunded {
    #[topic]
    pub id: u64,
    pub amount: i128,
}

#[contractevent]
pub struct BlendDeposited {
    #[topic]
    pub id: u64,
    pub amount: i128,
}

#[contractevent]
pub struct BlendExited {
    #[topic]
    pub id: u64,
    pub realized: i128,
    pub gain: i128,
}

#[contractevent]
pub struct YieldProposed {
    #[topic]
    pub id: u64,
    #[topic]
    pub proposer: Address,
    pub keep: i128,
}

#[contractevent]
pub struct YieldApproved {
    #[topic]
    pub id: u64,
    #[topic]
    pub approver: Address,
}

#[contractevent]
pub struct YieldCancelled {
    #[topic]
    pub id: u64,
    pub refunded: i128,
}

#[contractevent]
pub struct Rated {
    #[topic]
    pub id: u64,
    #[topic]
    pub rater: Address,
    pub ratee: Address,
    pub score: u32,
}

#[contract]
pub struct LeaseVault;

#[contractimpl]
impl LeaseVault {
    pub fn __constructor(
        env: Env,
        token: Address,
        pool: Address,
        arbitration_fund: Address,
        dispute_bond: i128,
    ) {
        if dispute_bond < 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let reserve = BlendPoolClient::new(&env, &pool).get_reserve(&token);
        let config = Config {
            token,
            pool,
            reserve_index: reserve.config.index,
            arbitration_fund,
            dispute_bond,
        };
        env.storage().instance().set(&DataKey::Config, &config);
        env.storage().instance().set(&DataKey::NextId, &0u64);
    }

    // ── Lease lifecycle ─────────────────────────────────────────────────

    /// Landlord publishes the terms. Returns the lease id to share with the tenant.
    pub fn create_lease(env: Env, landlord: Address, terms: Terms) -> u64 {
        landlord.require_auth();
        let shares = terms.tenant_share_bps as i128 + terms.landlord_share_bps as i128;
        if terms.rent <= 0
            || terms.deposit < terms.rent
            || terms.months == 0
            || terms.period == 0
            || terms.buffer_bps > 5_000
            || shares > BPS
            || terms.arbiter == landlord
        {
            panic_with_error!(&env, Error::InvalidTerms);
        }

        let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(0);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));
        bump_instance(&env);

        let lease = Lease {
            landlord: landlord.clone(),
            tenant: None,
            terms: terms.clone(),
            status: Status::Created,
            created_at: now(&env),
            start: 0,
            ended_at: 0,
            months_settled: 0,
            months_unpaid: 0,
            rent_escrow: 0,
            liquid: 0,
            shares: 0,
            placed: 0,
            yield_active: false,
            entry_hash: None,
            tenant_moved_in: false,
            landlord_moved_in: false,
            exit_hash: None,
        };
        save(&env, id, &lease);
        LeaseCreated {
            id,
            landlord,
            rent: terms.rent,
            deposit: terms.deposit,
        }
        .publish(&env);
        id
    }

    /// Tenant accepts the terms and locks the first rent plus the guarantee.
    /// With the yield option, the tenant also locks the buffer and everything
    /// but one month of rent goes to Blend.
    pub fn fund(env: Env, id: u64, tenant: Address, accept_yield: bool) {
        tenant.require_auth();
        let cfg = config(&env);
        let mut lease = load(&env, id);
        require_status(&env, &lease, Status::Created);
        if now(&env) > lease.created_at + lease.terms.move_in_window {
            panic_with_error!(&env, Error::DeadlinePassed);
        }
        if tenant == lease.landlord || tenant == lease.terms.arbiter {
            panic_with_error!(&env, Error::SameParty);
        }

        let terms = lease.terms.clone();
        let yield_active = terms.yield_offered && accept_yield;
        let buffer = if yield_active {
            terms.deposit * terms.buffer_bps as i128 / BPS
        } else {
            0
        };
        let total = terms.rent + terms.deposit + buffer;
        TokenClient::new(&env, &cfg.token).transfer(&tenant, &env.current_contract_address(), &total);

        lease.tenant = Some(tenant.clone());
        lease.rent_escrow = terms.rent;
        lease.liquid = terms.deposit + buffer;
        lease.status = Status::Funded;

        if yield_active {
            // One month of rent and the buffer never leave the contract.
            let to_place = terms.deposit - terms.rent;
            if to_place > 0 {
                lease.shares = blend_supply(&env, &cfg, to_place);
                lease.placed = to_place;
                lease.liquid -= to_place;
                lease.yield_active = true;
                BlendDeposited { id, amount: to_place }.publish(&env);
            }
        }

        save(&env, id, &lease);
        LeaseFunded {
            id,
            tenant,
            total,
            yield_active: lease.yield_active,
        }
        .publish(&env);
    }

    /// Both parties co-sign the hash of the move-in inventory. The second
    /// signature must match the first; it then releases the first rent.
    pub fn confirm_move_in(env: Env, id: u64, who: Address, entry_hash: BytesN<32>) {
        who.require_auth();
        let cfg = config(&env);
        let mut lease = load(&env, id);
        require_status(&env, &lease, Status::Funded);
        if now(&env) > lease.created_at + lease.terms.move_in_window {
            panic_with_error!(&env, Error::DeadlinePassed);
        }
        if let Some(existing) = &lease.entry_hash {
            if *existing != entry_hash {
                panic_with_error!(&env, Error::HashMismatch);
            }
        }

        if Some(&who) == lease.tenant.as_ref() {
            if lease.tenant_moved_in {
                panic_with_error!(&env, Error::AlreadyConfirmed);
            }
            lease.tenant_moved_in = true;
        } else if who == lease.landlord {
            if lease.landlord_moved_in {
                panic_with_error!(&env, Error::AlreadyConfirmed);
            }
            lease.landlord_moved_in = true;
        } else {
            panic_with_error!(&env, Error::NotAParty);
        }
        lease.entry_hash = Some(entry_hash.clone());

        if lease.tenant_moved_in && lease.landlord_moved_in {
            pay(&env, &cfg, &lease.landlord, lease.rent_escrow);
            lease.rent_escrow = 0;
            lease.start = now(&env);
            lease.months_settled = 1;
            lease.status = Status::Active;
            MovedIn { id, entry_hash }.publish(&env);
        }
        save(&env, id, &lease);
    }

    /// Move-in deadline passed without both confirmations: the tenant gets
    /// everything back. Callable by anyone.
    pub fn refund_no_keys(env: Env, id: u64) {
        let cfg = config(&env);
        let mut lease = load(&env, id);
        require_status(&env, &lease, Status::Funded);
        if now(&env) <= lease.created_at + lease.terms.move_in_window {
            panic_with_error!(&env, Error::TooEarly);
        }
        exit_blend_all(&env, &cfg, id, &mut lease);
        let amount = lease.rent_escrow + lease.liquid;
        pay(&env, &cfg, &tenant_of(&lease), amount);
        lease.rent_escrow = 0;
        lease.liquid = 0;
        lease.status = Status::Refunded;
        save(&env, id, &lease);
        LeaseRefunded { id, amount }.publish(&env);
    }

    /// Tenant pays the next month directly to the landlord.
    pub fn pay_rent(env: Env, id: u64) {
        let cfg = config(&env);
        let mut lease = load(&env, id);
        require_status(&env, &lease, Status::Active);
        let tenant = tenant_of(&lease);
        tenant.require_auth();
        if lease.months_settled >= lease.terms.months {
            panic_with_error!(&env, Error::NothingDue);
        }
        let month = lease.months_settled;
        TokenClient::new(&env, &cfg.token).transfer(&tenant, &lease.landlord, &lease.terms.rent);
        lease.months_settled += 1;
        save(&env, id, &lease);
        RentPaid {
            id,
            month,
            amount: lease.terms.rent,
        }
        .publish(&env);
    }

    /// Landlord takes an unpaid month from the guarantee once the grace
    /// period has passed: liquid month first, then Blend.
    pub fn claim_unpaid(env: Env, id: u64) {
        let cfg = config(&env);
        let mut lease = load(&env, id);
        if lease.status != Status::Active && lease.status != Status::Ended {
            panic_with_error!(&env, Error::WrongStatus);
        }
        lease.landlord.require_auth();
        let month = lease.months_settled;
        if month >= lease.terms.months {
            panic_with_error!(&env, Error::NothingDue);
        }
        let due = lease.start + month as u64 * lease.terms.period;
        if now(&env) <= due + lease.terms.grace {
            panic_with_error!(&env, Error::TooEarly);
        }
        let rent = lease.terms.rent;
        let paid = take(&env, &cfg, id, &mut lease, rent);
        if paid == 0 {
            panic_with_error!(&env, Error::NothingDue);
        }
        pay(&env, &cfg, &lease.landlord, paid);
        lease.months_settled += 1;
        lease.months_unpaid += 1;
        save(&env, id, &lease);
        UnpaidClaimed {
            id,
            month,
            amount: paid,
        }
        .publish(&env);
    }

    /// Either party ends the lease after its term and may record the exit
    /// inventory hash. Opens the damage-claim window.
    pub fn end_lease(env: Env, id: u64, who: Address, exit_hash: Option<BytesN<32>>) {
        who.require_auth();
        let mut lease = load(&env, id);
        require_status(&env, &lease, Status::Active);
        require_party(&env, &lease, &who);
        if now(&env) < lease.start + lease.terms.months as u64 * lease.terms.period {
            panic_with_error!(&env, Error::TooEarly);
        }
        drop_proposal(&env, &config(&env), id, &lease);
        lease.ended_at = now(&env);
        lease.exit_hash = exit_hash;
        lease.status = Status::Ended;
        save(&env, id, &lease);
        LeaseEnded { id }.publish(&env);
    }

    /// Landlord claims `amount` for damage, with the hash of the evidence,
    /// and posts the dispute bond. The undisputed part of the guarantee goes
    /// back to the tenant immediately.
    pub fn claim_damage(env: Env, id: u64, amount: i128, evidence: BytesN<32>) {
        let cfg = config(&env);
        let mut lease = load(&env, id);
        require_status(&env, &lease, Status::Ended);
        lease.landlord.require_auth();
        if now(&env) > lease.ended_at + lease.terms.claim_window {
            panic_with_error!(&env, Error::DeadlinePassed);
        }
        exit_blend_all(&env, &cfg, id, &mut lease);
        if amount <= 0 || amount > lease.liquid {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        if cfg.dispute_bond > 0 {
            TokenClient::new(&env, &cfg.token).transfer(
                &lease.landlord,
                &env.current_contract_address(),
                &cfg.dispute_bond,
            );
        }
        let refunded_now = lease.liquid - amount;
        pay(&env, &cfg, &tenant_of(&lease), refunded_now);
        lease.liquid = amount;
        save_claim(&env, id, &Claim {
            amount,
            evidence,
            filed_at: now(&env),
            bond: cfg.dispute_bond,
            offer: None,
        });
        lease.status = Status::Claimed;
        save(&env, id, &lease);
        DamageClaimed {
            id,
            amount,
            refunded_now,
        }
        .publish(&env);
    }

    /// Tenant answers a damage claim. Offering the full amount accepts it;
    /// anything less is a counter-offer that the landlord can accept or the
    /// arbiter settles.
    pub fn respond(env: Env, id: u64, offer: i128) {
        let cfg = config(&env);
        let mut lease = load(&env, id);
        require_status(&env, &lease, Status::Claimed);
        tenant_of(&lease).require_auth();
        let mut claim = load_claim(&env, id);
        if now(&env) > claim.filed_at + lease.terms.response_window {
            panic_with_error!(&env, Error::DeadlinePassed);
        }
        if offer < 0 || offer > claim.amount {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        ClaimAnswered { id, offer }.publish(&env);
        if offer == claim.amount {
            settle(&env, &cfg, id, &mut lease, claim.amount, false);
        } else {
            claim.offer = Some(offer);
            save_claim(&env, id, &claim);
            lease.status = Status::Disputed;
        }
        save(&env, id, &lease);
    }

    /// Landlord accepts the tenant's counter-offer.
    pub fn accept_counter(env: Env, id: u64) {
        let cfg = config(&env);
        let mut lease = load(&env, id);
        require_status(&env, &lease, Status::Disputed);
        lease.landlord.require_auth();
        let offer = load_claim(&env, id).offer.unwrap_or(0);
        settle(&env, &cfg, id, &mut lease, offer, false);
        save(&env, id, &lease);
    }

    /// Tenant stayed silent past the response window: the claim is paid.
    /// Callable by anyone.
    pub fn execute_claim(env: Env, id: u64) {
        let cfg = config(&env);
        let mut lease = load(&env, id);
        require_status(&env, &lease, Status::Claimed);
        let claim = load_claim(&env, id);
        if now(&env) <= claim.filed_at + lease.terms.response_window {
            panic_with_error!(&env, Error::TooEarly);
        }
        settle(&env, &cfg, id, &mut lease, claim.amount, false);
        save(&env, id, &lease);
    }

    /// Arbiter splits the disputed amount between the two parties only. If
    /// the landlord gets less than half of the claim, the bond is forfeited
    /// to the arbitration fund.
    pub fn resolve(env: Env, id: u64, to_landlord: i128) {
        let cfg = config(&env);
        let mut lease = load(&env, id);
        require_status(&env, &lease, Status::Disputed);
        lease.terms.arbiter.require_auth();
        let claim = load_claim(&env, id);
        if to_landlord < 0 || to_landlord > claim.amount {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let forfeit = to_landlord * 2 < claim.amount;
        settle(&env, &cfg, id, &mut lease, to_landlord, forfeit);
        save(&env, id, &lease);
    }

    /// No damage claim within the window: the whole guarantee, and the
    /// tenant's share of the yield, goes back to the tenant. Callable by anyone.
    pub fn release(env: Env, id: u64) {
        let cfg = config(&env);
        let mut lease = load(&env, id);
        require_status(&env, &lease, Status::Ended);
        if now(&env) <= lease.ended_at + lease.terms.claim_window {
            panic_with_error!(&env, Error::TooEarly);
        }
        exit_blend_all(&env, &cfg, id, &mut lease);
        let to_tenant = lease.liquid;
        pay(&env, &cfg, &tenant_of(&lease), to_tenant);
        lease.liquid = 0;
        lease.status = Status::Closed;
        save(&env, id, &lease);
        LeaseSettled {
            id,
            to_landlord: 0,
            to_tenant,
        }
        .publish(&env);
    }

    /// Pulls a lease's guarantee out of Blend. The tenant or the landlord can
    /// do it at any time (the option is reversible). Anyone else, such as the
    /// coordinator agent, only when the position lost value or the pool is
    /// close to full utilization.
    pub fn exit_blend(env: Env, id: u64, caller: Address) {
        caller.require_auth();
        let cfg = config(&env);
        let mut lease = load(&env, id);
        if lease.shares <= 0 {
            panic_with_error!(&env, Error::NothingDue);
        }
        let is_party = caller == lease.landlord || Some(&caller) == lease.tenant.as_ref();
        if !is_party && !blend_unsafe(&env, &cfg, &lease) {
            panic_with_error!(&env, Error::BlendIsSafe);
        }
        exit_blend_all(&env, &cfg, id, &mut lease);
        save(&env, id, &lease);
    }

    // ── Invest the guarantee during the lease ───────────────────────────

    /// A party proposes to lend part of the guarantee on Blend while the
    /// lease runs. `keep` stays liquid in the contract and must cover at
    /// least one month of rent. Nothing moves until the other party approves.
    pub fn propose_yield(
        env: Env,
        id: u64,
        who: Address,
        keep: i128,
        tenant_share_bps: u32,
        landlord_share_bps: u32,
    ) {
        who.require_auth();
        let cfg = config(&env);
        let lease = load(&env, id);
        require_status(&env, &lease, Status::Active);
        require_party(&env, &lease, &who);
        if lease.yield_active || lease.shares > 0 || proposal(&env, id).is_some() {
            panic_with_error!(&env, Error::AlreadyConfirmed);
        }
        if tenant_share_bps as i128 + landlord_share_bps as i128 > BPS {
            panic_with_error!(&env, Error::InvalidTerms);
        }
        if keep < lease.terms.rent || keep >= lease.liquid {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let mut p = YieldProposal {
            proposer: who.clone(),
            keep,
            tenant_share_bps,
            landlord_share_bps,
            buffer: lease.terms.deposit * lease.terms.buffer_bps as i128 / BPS,
            tenant_ok: false,
            landlord_ok: false,
        };
        approve_as(&env, &cfg, &lease, &mut p, &who);
        save_proposal(&env, id, &p);
        YieldProposed {
            id,
            proposer: who,
            keep,
        }
        .publish(&env);
    }

    /// The other party approves the pending proposal. The second approval
    /// places `liquid - keep` on Blend; the tenant's buffer joins the liquid part.
    pub fn approve_yield(env: Env, id: u64, who: Address) {
        who.require_auth();
        let cfg = config(&env);
        let mut lease = load(&env, id);
        require_status(&env, &lease, Status::Active);
        require_party(&env, &lease, &who);
        let mut p =
            proposal(&env, id).unwrap_or_else(|| panic_with_error!(&env, Error::NothingDue));
        approve_as(&env, &cfg, &lease, &mut p, &who);
        YieldApproved { id, approver: who }.publish(&env);

        if !(p.tenant_ok && p.landlord_ok) {
            save_proposal(&env, id, &p);
            return;
        }
        // The liquid part may have shrunk since the proposal (unpaid month).
        let to_place = lease.liquid - p.keep;
        if to_place <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        lease.terms.yield_offered = true;
        lease.terms.tenant_share_bps = p.tenant_share_bps;
        lease.terms.landlord_share_bps = p.landlord_share_bps;
        lease.shares = blend_supply(&env, &cfg, to_place);
        lease.placed = to_place;
        lease.liquid = lease.liquid - to_place + p.buffer;
        lease.yield_active = true;
        env.storage()
            .persistent()
            .remove(&DataKey::YieldProposal(id));
        save(&env, id, &lease);
        BlendDeposited {
            id,
            amount: to_place,
        }
        .publish(&env);
    }

    /// Either party withdraws a pending proposal; a locked buffer goes back
    /// to the tenant. Once placed, `exit_blend` brings the funds back.
    pub fn cancel_yield(env: Env, id: u64, who: Address) {
        who.require_auth();
        let cfg = config(&env);
        let lease = load(&env, id);
        require_party(&env, &lease, &who);
        if proposal(&env, id).is_none() {
            panic_with_error!(&env, Error::NothingDue);
        }
        drop_proposal(&env, &cfg, id, &lease);
    }

    // ── Ratings ─────────────────────────────────────────────────────────

    /// Once the lease is over, each party rates the other from 1 to 5, once.
    /// Only the two parties of a real lease can rate, so scores cannot be
    /// bought without signing and funding a lease.
    pub fn rate(env: Env, id: u64, who: Address, score: u32) {
        who.require_auth();
        if !(1..=5).contains(&score) {
            panic_with_error!(&env, Error::InvalidScore);
        }
        let lease = load(&env, id);
        match lease.status {
            Status::Ended | Status::Claimed | Status::Disputed | Status::Closed => {}
            _ => panic_with_error!(&env, Error::WrongStatus),
        }
        require_party(&env, &lease, &who);
        let mut ratings = Self::get_ratings(env.clone(), id);
        let ratee = if who == lease.landlord {
            if ratings.by_landlord.is_some() {
                panic_with_error!(&env, Error::AlreadyRated);
            }
            ratings.by_landlord = Some(score);
            tenant_of(&lease)
        } else {
            if ratings.by_tenant.is_some() {
                panic_with_error!(&env, Error::AlreadyRated);
            }
            ratings.by_tenant = Some(score);
            lease.landlord.clone()
        };
        let mut rep = Self::get_reputation(env.clone(), ratee.clone());
        rep.count += 1;
        rep.total += score;
        keep_persistent(&env, &DataKey::Ratings(id), &ratings);
        keep_persistent(&env, &DataKey::Reputation(ratee.clone()), &rep);
        Rated {
            id,
            rater: who,
            ratee,
            score,
        }
        .publish(&env);
    }

    // ── Views ───────────────────────────────────────────────────────────

    pub fn get_yield_proposal(env: Env, id: u64) -> Option<YieldProposal> {
        proposal(&env, id)
    }

    pub fn get_ratings(env: Env, id: u64) -> LeaseRatings {
        env.storage()
            .persistent()
            .get(&DataKey::Ratings(id))
            .unwrap_or_default()
    }

    /// Scores received by `who` across all leases: average = total / count.
    pub fn get_reputation(env: Env, who: Address) -> Reputation {
        env.storage()
            .persistent()
            .get(&DataKey::Reputation(who))
            .unwrap_or_default()
    }

    pub fn get_lease(env: Env, id: u64) -> Lease {
        load(&env, id)
    }

    /// The damage claim of a lease, if one was filed.
    pub fn get_claim(env: Env, id: u64) -> Option<Claim> {
        env.storage().persistent().get(&DataKey::Claim(id))
    }

    pub fn lease_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::NextId).unwrap_or(0)
    }

    pub fn get_config(env: Env) -> Config {
        config(&env)
    }

    /// Current value of the lease's guarantee: liquid part plus Blend position.
    pub fn guarantee_value(env: Env, id: u64) -> i128 {
        let cfg = config(&env);
        let lease = load(&env, id);
        lease.liquid + blend_value(&env, &cfg, &lease)
    }

    /// True when anyone may call `exit_blend` for this lease.
    pub fn blend_at_risk(env: Env, id: u64) -> bool {
        let cfg = config(&env);
        let lease = load(&env, id);
        lease.shares > 0 && blend_unsafe(&env, &cfg, &lease)
    }
}

// ── Storage helpers ─────────────────────────────────────────────────────

fn now(env: &Env) -> u64 {
    env.ledger().timestamp()
}

fn bump_instance(env: &Env) {
    env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn config(env: &Env) -> Config {
    bump_instance(env);
    env.storage().instance().get(&DataKey::Config).unwrap()
}

fn load(env: &Env, id: u64) -> Lease {
    env.storage()
        .persistent()
        .get(&DataKey::Lease(id))
        .unwrap_or_else(|| panic_with_error!(env, Error::LeaseNotFound))
}

fn save(env: &Env, id: u64, lease: &Lease) {
    let key = DataKey::Lease(id);
    env.storage().persistent().set(&key, lease);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn load_claim(env: &Env, id: u64) -> Claim {
    env.storage()
        .persistent()
        .get(&DataKey::Claim(id))
        .unwrap_or_else(|| panic_with_error!(env, Error::NothingDue))
}

fn save_claim(env: &Env, id: u64, claim: &Claim) {
    let key = DataKey::Claim(id);
    env.storage().persistent().set(&key, claim);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn keep_persistent<V: IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &DataKey, value: &V) {
    env.storage().persistent().set(key, value);
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn proposal(env: &Env, id: u64) -> Option<YieldProposal> {
    env.storage().persistent().get(&DataKey::YieldProposal(id))
}

fn save_proposal(env: &Env, id: u64, p: &YieldProposal) {
    keep_persistent(env, &DataKey::YieldProposal(id), p);
}

/// Records `who`'s approval. The tenant locks the buffer at this point.
fn approve_as(env: &Env, cfg: &Config, lease: &Lease, p: &mut YieldProposal, who: &Address) {
    if *who == lease.landlord {
        if p.landlord_ok {
            panic_with_error!(env, Error::AlreadyConfirmed);
        }
        p.landlord_ok = true;
    } else {
        if p.tenant_ok {
            panic_with_error!(env, Error::AlreadyConfirmed);
        }
        if p.buffer > 0 {
            TokenClient::new(env, &cfg.token).transfer(
                who,
                &env.current_contract_address(),
                &p.buffer,
            );
        }
        p.tenant_ok = true;
    }
}

/// Removes a pending proposal and gives a locked buffer back to the tenant.
fn drop_proposal(env: &Env, cfg: &Config, id: u64, lease: &Lease) {
    if let Some(p) = proposal(env, id) {
        let refunded = if p.tenant_ok { p.buffer } else { 0 };
        pay(env, cfg, &tenant_of(lease), refunded);
        env.storage()
            .persistent()
            .remove(&DataKey::YieldProposal(id));
        YieldCancelled { id, refunded }.publish(env);
    }
}

fn require_status(env: &Env, lease: &Lease, status: Status) {
    if lease.status != status {
        panic_with_error!(env, Error::WrongStatus);
    }
}

fn require_party(env: &Env, lease: &Lease, who: &Address) {
    if *who != lease.landlord && Some(who) != lease.tenant.as_ref() {
        panic_with_error!(env, Error::NotAParty);
    }
}

fn tenant_of(lease: &Lease) -> Address {
    lease.tenant.clone().unwrap()
}

fn pay(env: &Env, cfg: &Config, to: &Address, amount: i128) {
    if amount > 0 {
        TokenClient::new(env, &cfg.token).transfer(&env.current_contract_address(), to, &amount);
    }
}

/// Pays `to_landlord` out of the disputed amount and the rest to the tenant,
/// then returns or forfeits the bond.
fn settle(env: &Env, cfg: &Config, id: u64, lease: &mut Lease, to_landlord: i128, forfeit: bool) {
    let claim = load_claim(env, id);
    let to_tenant = claim.amount - to_landlord;
    pay(env, cfg, &lease.landlord, to_landlord);
    pay(env, cfg, &tenant_of(lease), to_tenant);
    if forfeit {
        pay(env, cfg, &cfg.arbitration_fund, claim.bond);
    } else {
        pay(env, cfg, &lease.landlord, claim.bond);
    }
    lease.liquid = 0;
    lease.status = Status::Closed;
    LeaseSettled {
        id,
        to_landlord,
        to_tenant,
    }
    .publish(env);
}

// ── Blend ───────────────────────────────────────────────────────────────

fn blend_shares(env: &Env, cfg: &Config) -> i128 {
    BlendPoolClient::new(env, &cfg.pool)
        .get_positions(&env.current_contract_address())
        .supply
        .get(cfg.reserve_index)
        .unwrap_or(0)
}

fn blend_value(env: &Env, cfg: &Config, lease: &Lease) -> i128 {
    if lease.shares <= 0 {
        return 0;
    }
    let reserve = BlendPoolClient::new(env, &cfg.pool).get_reserve(&cfg.token);
    blend::shares_to_assets(lease.shares, reserve.data.b_rate)
}

fn blend_unsafe(env: &Env, cfg: &Config, lease: &Lease) -> bool {
    let reserve = BlendPoolClient::new(env, &cfg.pool).get_reserve(&cfg.token);
    let value = blend::shares_to_assets(lease.shares, reserve.data.b_rate);
    // Blend rounds b-tokens down, so a fresh position is worth a few stroops
    // less than its principal: only a loss above the tolerance counts.
    let lost = value * BPS < lease.placed * (BPS - LOSS_TOLERANCE_BPS);
    lost || blend::utilization(&reserve.data) >= MAX_SAFE_UTILIZATION
}

/// Lends `amount` on the pool and returns the b-tokens minted.
fn blend_supply(env: &Env, cfg: &Config, amount: i128) -> i128 {
    let me = env.current_contract_address();
    let before = blend_shares(env, cfg);
    // The pool pulls the tokens with `transfer(me, pool, amount)`, a call
    // below our own: authorize exactly that one.
    env.authorize_as_current_contract(vec![
        env,
        InvokerContractAuthEntry::Contract(SubContractInvocation {
            context: ContractContext {
                contract: cfg.token.clone(),
                fn_name: Symbol::new(env, "transfer"),
                args: (me.clone(), cfg.pool.clone(), amount).into_val(env),
            },
            sub_invocations: vec![env],
        }),
    ]);
    let positions = BlendPoolClient::new(env, &cfg.pool).submit(
        &me,
        &me,
        &me,
        &vec![
            env,
            Request {
                request_type: blend::REQUEST_SUPPLY,
                address: cfg.token.clone(),
                amount,
            },
        ],
    );
    positions.supply.get(cfg.reserve_index).unwrap_or(0) - before
}

/// Withdraws `amount` of underlying. Returns (tokens received, b-tokens burnt).
fn blend_withdraw(env: &Env, cfg: &Config, amount: i128) -> (i128, i128) {
    let me = env.current_contract_address();
    let token = TokenClient::new(env, &cfg.token);
    let balance_before = token.balance(&me);
    let shares_before = blend_shares(env, cfg);
    let positions = BlendPoolClient::new(env, &cfg.pool).submit(
        &me,
        &me,
        &me,
        &vec![
            env,
            Request {
                request_type: blend::REQUEST_WITHDRAW,
                address: cfg.token.clone(),
                amount,
            },
        ],
    );
    let shares_after = positions.supply.get(cfg.reserve_index).unwrap_or(0);
    (token.balance(&me) - balance_before, shares_before - shares_after)
}

/// Brings the whole lease position back from Blend and shares a positive
/// yield: the landlord's and the fund's cuts are paid out, the tenant's
/// stays in the guarantee. A loss simply leaves less in the guarantee.
fn exit_blend_all(env: &Env, cfg: &Config, id: u64, lease: &mut Lease) {
    lease.yield_active = false;
    if lease.shares <= 0 {
        return;
    }
    let reserve = BlendPoolClient::new(env, &cfg.pool).get_reserve(&cfg.token);
    let amount = blend::shares_to_assets(lease.shares, reserve.data.b_rate);
    let realized = if amount > 0 {
        blend_withdraw(env, cfg, amount).0
    } else {
        0
    };
    let gain = realized - lease.placed;
    lease.liquid += realized;
    lease.shares = 0;
    lease.placed = 0;

    if gain > 0 {
        let tenant_cut = gain * lease.terms.tenant_share_bps as i128 / BPS;
        let landlord_cut = gain * lease.terms.landlord_share_bps as i128 / BPS;
        let fund_cut = gain - tenant_cut - landlord_cut;
        pay(env, cfg, &lease.landlord, landlord_cut);
        pay(env, cfg, &cfg.arbitration_fund, fund_cut);
        lease.liquid -= landlord_cut + fund_cut;
    }
    BlendExited { id, realized, gain }.publish(env);
}

/// Takes up to `amount` from the guarantee, pulling from Blend only what the
/// liquid part cannot cover. Returns what was actually available.
fn take(env: &Env, cfg: &Config, id: u64, lease: &mut Lease, amount: i128) -> i128 {
    if lease.liquid < amount && lease.shares > 0 {
        let need = amount - lease.liquid;
        if need >= blend_value(env, cfg, lease) {
            exit_blend_all(env, cfg, id, lease);
        } else {
            let (realized, burnt) = blend_withdraw(env, cfg, need);
            lease.shares -= burnt;
            lease.liquid += realized;
            lease.placed -= realized.min(lease.placed);
        }
    }
    let paid = amount.min(lease.liquid);
    lease.liquid -= paid;
    paid
}
