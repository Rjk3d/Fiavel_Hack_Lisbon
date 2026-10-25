#![cfg(test)]
extern crate std;

use super::*;
use crate::blend::RATE_SCALAR;
use soroban_sdk::{
    contract, contractimpl, contracttype,
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env, Map, Vec,
};

/// 1 USDC with 7 decimals.
const U: i128 = 10_000_000;
const RENT: i128 = 650 * U;
const DEPOSIT: i128 = 1_300 * U;
const BUFFER: i128 = 65 * U; // 5 % of the deposit
const BOND: i128 = 20 * U;
const T0: u64 = 1_000;
/// Rating thresholds of the fixture: the 3-minute, 1,300 USDC test lease counts.
const MIN_RATED_DURATION: u64 = 180;
const MIN_RATED_DEPOSIT: i128 = 100 * U;
/// Shortest and longest lease window accepted by this deployment.
const MIN_WINDOW: u64 = 30;
const MAX_WINDOW: u64 = 1_000;

/// Contract functions panic with a typed error; clients see it as this.
fn err(e: Error) -> soroban_sdk::Error {
    soroban_sdk::Error::from_contract_error(e as u32)
}

// ── Mock Blend pool ─────────────────────────────────────────────────────
// Same entry points and types as Blend v2, supply/withdraw only. The b_rate
// and the utilization are set by the test to simulate yield, loss and a
// nearly empty pool.

#[contracttype]
enum MockKey {
    Token,
    BRate,
    Util,
    Total,
    Shares(Address),
}

#[contract]
pub struct MockPool;

#[contractimpl]
impl MockPool {
    pub fn __constructor(env: Env, token: Address) {
        env.storage().instance().set(&MockKey::Token, &token);
        env.storage().instance().set(&MockKey::BRate, &RATE_SCALAR);
        env.storage().instance().set(&MockKey::Util, &5_000_000i128);
        env.storage().instance().set(&MockKey::Total, &0i128);
    }

    pub fn set_b_rate(env: Env, rate: i128) {
        env.storage().instance().set(&MockKey::BRate, &rate);
    }

    pub fn set_util(env: Env, util: i128) {
        env.storage().instance().set(&MockKey::Util, &util);
    }

    pub fn submit(
        env: Env,
        from: Address,
        spender: Address,
        to: Address,
        requests: Vec<Request>,
    ) -> Positions {
        spender.require_auth();
        if from != spender {
            from.require_auth();
        }
        let token = TokenClient::new(&env, &Self::token(&env));
        let rate = Self::rate(&env);
        let mut shares = Self::shares(&env, &from);
        let mut total: i128 = env.storage().instance().get(&MockKey::Total).unwrap();
        for r in requests.iter() {
            match r.request_type {
                0 => {
                    token.transfer(&spender, &env.current_contract_address(), &r.amount);
                    let minted = r.amount * RATE_SCALAR / rate;
                    shares += minted;
                    total += minted;
                }
                1 => {
                    let mut burn = (r.amount * RATE_SCALAR + rate - 1) / rate;
                    let mut out = r.amount;
                    if burn > shares {
                        burn = shares;
                        out = shares * rate / RATE_SCALAR;
                    }
                    shares -= burn;
                    total -= burn;
                    token.transfer(&env.current_contract_address(), &to, &out);
                }
                _ => panic!("unsupported request"),
            }
        }
        env.storage().persistent().set(&MockKey::Shares(from.clone()), &shares);
        env.storage().instance().set(&MockKey::Total, &total);
        Self::get_positions(env, from)
    }

    pub fn get_positions(env: Env, address: Address) -> Positions {
        let mut supply = Map::new(&env);
        let shares = Self::shares(&env, &address);
        if shares > 0 {
            supply.set(0u32, shares);
        }
        Positions {
            liabilities: Map::new(&env),
            collateral: Map::new(&env),
            supply,
        }
    }

    pub fn get_reserve(env: Env, asset: Address) -> Reserve {
        let rate = Self::rate(&env);
        let util: i128 = env.storage().instance().get(&MockKey::Util).unwrap();
        let total: i128 = env.storage().instance().get(&MockKey::Total).unwrap();
        let b_supply = total.max(U);
        Reserve {
            asset,
            config: ReserveConfig {
                index: 0,
                decimals: 7,
                c_factor: 9_500_000,
                l_factor: 9_500_000,
                util: 7_000_000,
                max_util: 9_500_000,
                r_base: 5_000,
                r_one: 300_000,
                r_two: 1_000_000,
                r_three: 10_000_000,
                reactivity: 20,
                supply_cap: i128::MAX,
                enabled: true,
            },
            data: ReserveData {
                d_rate: RATE_SCALAR,
                b_rate: rate,
                ir_mod: 10_000_000,
                b_supply,
                d_supply: b_supply * rate / RATE_SCALAR * util / 10_000_000,
                backstop_credit: 0,
                last_time: env.ledger().timestamp(),
            },
            scalar: U,
        }
    }
}

impl MockPool {
    fn token(env: &Env) -> Address {
        env.storage().instance().get(&MockKey::Token).unwrap()
    }
    fn rate(env: &Env) -> i128 {
        env.storage().instance().get(&MockKey::BRate).unwrap()
    }
    fn shares(env: &Env, who: &Address) -> i128 {
        env.storage()
            .persistent()
            .get(&MockKey::Shares(who.clone()))
            .unwrap_or(0)
    }
}

// ── Fixture ─────────────────────────────────────────────────────────────

struct Setup {
    env: Env,
    vault: LeaseVaultClient<'static>,
    token: TokenClient<'static>,
    sac: StellarAssetClient<'static>,
    pool: MockPoolClient<'static>,
    landlord: Address,
    tenant: Address,
    arbiter: Address,
    fund: Address,
    admin: Address,
    stranger: Address,
}

fn setup() -> Setup {
    setup_with(false)
}

/// `open_registry`: testnet mode, where mediators can register themselves.
fn setup_with(open_registry: bool) -> Setup {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(T0);

    let issuer = Address::generate(&env);
    let sac_contract = env.register_stellar_asset_contract_v2(issuer);
    let token_id = sac_contract.address();
    let pool_id = env.register(MockPool, (token_id.clone(),));
    let fund = Address::generate(&env);
    let admin = Address::generate(&env);
    let arbiter = Address::generate(&env);
    let vault_id = env.register(
        LeaseVault,
        (
            token_id.clone(),
            pool_id.clone(),
            fund.clone(),
            BOND,
            MIN_RATED_DURATION,
            MIN_RATED_DEPOSIT,
            admin.clone(),
            open_registry,
            MIN_WINDOW,
            MAX_WINDOW,
            Vec::from_array(&env, [arbiter.clone()]),
        ),
    );

    let s = Setup {
        vault: LeaseVaultClient::new(&env, &vault_id),
        token: TokenClient::new(&env, &token_id),
        sac: StellarAssetClient::new(&env, &token_id),
        pool: MockPoolClient::new(&env, &pool_id),
        landlord: Address::generate(&env),
        tenant: Address::generate(&env),
        arbiter,
        fund,
        admin,
        stranger: Address::generate(&env),
        env,
    };
    s.sac.mint(&s.tenant, &(10_000 * U));
    s.sac.mint(&s.landlord, &(1_000 * U));
    s
}

impl Setup {
    fn terms(&self, yield_offered: bool) -> Terms {
        Terms {
            rent: RENT,
            deposit: DEPOSIT,
            months: 3,
            period: 60,
            grace: 10,
            move_in_window: 300,
            claim_window: 120,
            response_window: 60,
            arbitration_window: 60,
            arbiter: self.arbiter.clone(),
            yield_offered,
            buffer_bps: 500,
            tenant_share_bps: 7_000,
            landlord_share_bps: 2_000,
        }
    }

    fn hash(&self, b: u8) -> BytesN<32> {
        BytesN::from_array(&self.env, &[b; 32])
    }

    fn at(&self, t: u64) {
        self.env.ledger().set_timestamp(t);
    }

    fn bal(&self, who: &Address) -> i128 {
        self.token.balance(who)
    }

    /// Created, funded and moved in at T0. Month m is due at T0 + 60 m and
    /// the lease ends at T0 + 180.
    fn active_lease(&self, with_yield: bool) -> u64 {
        let id = self.vault.create_lease(&self.landlord, &self.terms(with_yield));
        self.vault.fund(&id, &self.tenant, &with_yield);
        self.vault.confirm_move_in(&id, &self.tenant, &self.hash(1));
        self.vault.confirm_move_in(&id, &self.landlord, &self.hash(1));
        id
    }

    /// Active lease with every month paid, ended at T0 + 180.
    fn ended_lease(&self, with_yield: bool) -> u64 {
        let id = self.active_lease(with_yield);
        self.vault.pay_rent(&id);
        self.vault.pay_rent(&id);
        self.at(T0 + 180);
        self.vault.end_lease(&id, &self.tenant, &Some(self.hash(2)));
        id
    }

    /// Ended lease released after the claim window, at T0 + 301.
    fn closed_lease(&self, with_yield: bool) -> u64 {
        let id = self.ended_lease(with_yield);
        self.at(T0 + 180 + 121);
        self.vault.release(&id);
        id
    }
}

// ── Happy path ──────────────────────────────────────────────────────────

#[test]
fn full_lease_returns_the_whole_deposit() {
    let s = setup();
    let tenant_start = s.bal(&s.tenant);
    let landlord_start = s.bal(&s.landlord);

    let id = s.vault.create_lease(&s.landlord, &s.terms(false));
    s.vault.fund(&id, &s.tenant, &false);
    assert_eq!(s.bal(&s.vault.address), RENT + DEPOSIT);

    s.vault.confirm_move_in(&id, &s.tenant, &s.hash(1));
    assert_eq!(s.vault.get_lease(&id).status, Status::Funded);
    s.vault.confirm_move_in(&id, &s.landlord, &s.hash(1));
    let lease = s.vault.get_lease(&id);
    assert_eq!(lease.status, Status::Active);
    assert_eq!(s.bal(&s.landlord), landlord_start + RENT);

    s.vault.pay_rent(&id);
    s.vault.pay_rent(&id);
    assert_eq!(s.vault.try_pay_rent(&id), Err(Ok(err(Error::NothingDue))));

    s.at(T0 + 179);
    assert_eq!(
        s.vault.try_end_lease(&id, &s.tenant, &None),
        Err(Ok(err(Error::TooEarly)))
    );
    s.at(T0 + 180);
    s.vault.end_lease(&id, &s.tenant, &Some(s.hash(2)));

    s.at(T0 + 300);
    assert_eq!(s.vault.try_release(&id), Err(Ok(err(Error::TooEarly))));
    s.at(T0 + 301);
    s.vault.release(&id);

    assert_eq!(s.vault.get_lease(&id).status, Status::Closed);
    assert_eq!(s.bal(&s.tenant), tenant_start - 3 * RENT);
    assert_eq!(s.bal(&s.landlord), landlord_start + 3 * RENT);
    assert_eq!(s.bal(&s.vault.address), 0);
}

#[test]
fn fund_requires_the_tenant_signature() {
    let s = setup();
    let id = s.vault.create_lease(&s.landlord, &s.terms(false));
    s.vault.fund(&id, &s.tenant, &false);
    let auths = s.env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, s.tenant);
}

#[test]
fn invalid_terms_are_rejected() {
    let s = setup();
    let mut t = s.terms(false);
    t.deposit = RENT - 1;
    assert_eq!(
        s.vault.try_create_lease(&s.landlord, &t),
        Err(Ok(err(Error::InvalidTerms)))
    );
    let mut t = s.terms(true);
    t.tenant_share_bps = 9_000;
    t.landlord_share_bps = 2_000;
    assert_eq!(
        s.vault.try_create_lease(&s.landlord, &t),
        Err(Ok(err(Error::InvalidTerms)))
    );
}

// ── Move-in ─────────────────────────────────────────────────────────────

#[test]
fn move_in_hashes_must_match() {
    let s = setup();
    let id = s.vault.create_lease(&s.landlord, &s.terms(false));
    s.vault.fund(&id, &s.tenant, &false);
    s.vault.confirm_move_in(&id, &s.tenant, &s.hash(1));
    assert_eq!(
        s.vault.try_confirm_move_in(&id, &s.landlord, &s.hash(9)),
        Err(Ok(err(Error::HashMismatch)))
    );
    assert_eq!(
        s.vault.try_confirm_move_in(&id, &s.stranger, &s.hash(1)),
        Err(Ok(err(Error::NotAParty)))
    );
}

#[test]
fn no_keys_refunds_everything_to_the_tenant() {
    let s = setup();
    let tenant_start = s.bal(&s.tenant);
    let id = s.vault.create_lease(&s.landlord, &s.terms(true));
    s.vault.fund(&id, &s.tenant, &true);

    s.at(T0 + 300);
    assert_eq!(s.vault.try_refund_no_keys(&id), Err(Ok(err(Error::TooEarly))));
    s.at(T0 + 301);
    s.vault.refund_no_keys(&id);

    assert_eq!(s.vault.get_lease(&id).status, Status::Refunded);
    assert_eq!(s.bal(&s.tenant), tenant_start);
    assert_eq!(s.bal(&s.vault.address), 0);
}

// ── Unpaid rent ─────────────────────────────────────────────────────────

#[test]
fn unpaid_rent_is_taken_from_the_guarantee_after_grace() {
    let s = setup();
    let id = s.active_lease(false);
    let landlord_before = s.bal(&s.landlord);

    s.at(T0 + 60 + 10);
    assert_eq!(s.vault.try_claim_unpaid(&id), Err(Ok(err(Error::TooEarly))));
    s.at(T0 + 60 + 11);
    s.vault.claim_unpaid(&id);

    let lease = s.vault.get_lease(&id);
    assert_eq!(lease.months_settled, 2);
    assert_eq!(lease.months_unpaid, 1);
    assert_eq!(s.bal(&s.landlord), landlord_before + RENT);
    assert_eq!(s.vault.guarantee_value(&id), DEPOSIT - RENT);
}

#[test]
fn anyone_can_trigger_an_unpaid_month_for_the_landlord() {
    let s = setup();
    let id = s.active_lease(false);
    let landlord_before = s.bal(&s.landlord);
    s.at(T0 + 60 + 11);
    s.vault.claim_unpaid(&id);
    // No signature was needed: the money can only go to the landlord.
    assert!(s.env.auths().is_empty());
    assert_eq!(s.bal(&s.landlord), landlord_before + RENT);
}

#[test]
fn release_pays_months_left_unpaid_to_the_landlord_first() {
    let s = setup();
    let id = s.active_lease(false);
    s.vault.pay_rent(&id); // month 2 paid, month 3 never paid
    s.at(T0 + 180);
    s.vault.end_lease(&id, &s.tenant, &None);
    let tenant_before = s.bal(&s.tenant);
    let landlord_before = s.bal(&s.landlord);

    s.at(T0 + 180 + 121);
    s.vault.release(&id);
    assert_eq!(s.bal(&s.landlord), landlord_before + RENT);
    assert_eq!(s.bal(&s.tenant), tenant_before + DEPOSIT - RENT);
    let lease = s.vault.get_lease(&id);
    assert_eq!((lease.months_settled, lease.months_unpaid), (3, 1));
    assert_eq!(s.bal(&s.vault.address), 0);
}

#[test]
fn the_tenant_can_still_pay_late_after_the_end() {
    let s = setup();
    let id = s.active_lease(false);
    s.vault.pay_rent(&id);
    s.at(T0 + 180);
    s.vault.end_lease(&id, &s.landlord, &None);
    s.vault.pay_rent(&id);
    let tenant_before = s.bal(&s.tenant);
    s.at(T0 + 180 + 121);
    s.vault.release(&id);
    assert_eq!(s.bal(&s.tenant), tenant_before + DEPOSIT);
    assert_eq!(s.vault.get_lease(&id).months_unpaid, 0);
}

#[test]
fn a_damage_claim_comes_after_the_unpaid_months() {
    let s = setup();
    let id = s.active_lease(false);
    s.at(T0 + 180);
    s.vault.end_lease(&id, &s.tenant, &None);
    let landlord_before = s.bal(&s.landlord);
    // Two months unpaid: 1,300 - 2 x 650 leaves nothing to claim for damage.
    assert_eq!(
        s.vault.try_claim_damage(&id, &(100 * U), &s.hash(3)),
        Err(Ok(err(Error::InvalidAmount)))
    );
    // The failed call changed nothing; a release pays both months.
    s.at(T0 + 180 + 121);
    s.vault.release(&id);
    assert_eq!(s.bal(&s.landlord), landlord_before + 2 * RENT);
}

// ── Refusal scene: the guarantee cannot be seized during the lease ──────

#[test]
fn landlord_cannot_seize_the_guarantee_during_the_lease() {
    let s = setup();
    let id = s.active_lease(false);
    assert_eq!(
        s.vault.try_claim_damage(&id, &DEPOSIT, &s.hash(3)),
        Err(Ok(err(Error::WrongStatus)))
    );
    assert_eq!(
        s.vault.try_end_lease(&id, &s.stranger, &None),
        Err(Ok(err(Error::NotAParty)))
    );
    assert_eq!(s.vault.try_release(&id), Err(Ok(err(Error::WrongStatus))));
}

// ── Damage claims ───────────────────────────────────────────────────────

#[test]
fn damage_claim_refunds_the_undisputed_part_then_pays_on_silence() {
    let s = setup();
    let id = s.ended_lease(false);
    let tenant_before = s.bal(&s.tenant);
    let landlord_before = s.bal(&s.landlord);

    s.vault.claim_damage(&id, &(300 * U), &s.hash(3));
    assert_eq!(s.bal(&s.tenant), tenant_before + DEPOSIT - 300 * U);
    assert_eq!(s.bal(&s.landlord), landlord_before - BOND);
    assert_eq!(s.vault.get_lease(&id).status, Status::Claimed);

    s.at(T0 + 180 + 60);
    assert_eq!(s.vault.try_execute_claim(&id), Err(Ok(err(Error::TooEarly))));
    s.at(T0 + 180 + 61);
    s.vault.execute_claim(&id);

    assert_eq!(s.bal(&s.landlord), landlord_before + 300 * U);
    assert_eq!(s.vault.get_lease(&id).status, Status::Closed);
    assert_eq!(s.bal(&s.vault.address), 0);
}

#[test]
fn claim_cannot_exceed_the_guarantee_or_come_late() {
    let s = setup();
    let id = s.ended_lease(false);
    assert_eq!(
        s.vault.try_claim_damage(&id, &(DEPOSIT + 1), &s.hash(3)),
        Err(Ok(err(Error::InvalidAmount)))
    );
    s.at(T0 + 180 + 121);
    assert_eq!(
        s.vault.try_claim_damage(&id, &(100 * U), &s.hash(3)),
        Err(Ok(err(Error::DeadlinePassed)))
    );
}

#[test]
fn tenant_accepting_the_claim_settles_it() {
    let s = setup();
    let id = s.ended_lease(false);
    let landlord_before = s.bal(&s.landlord);
    s.vault.claim_damage(&id, &(200 * U), &s.hash(3));
    s.vault.respond(&id, &(200 * U));
    assert_eq!(s.vault.get_lease(&id).status, Status::Closed);
    assert_eq!(s.bal(&s.landlord), landlord_before + 200 * U);
}

#[test]
fn landlord_can_accept_a_counter_offer() {
    let s = setup();
    let id = s.ended_lease(false);
    let tenant_before = s.bal(&s.tenant);
    let landlord_before = s.bal(&s.landlord);
    s.vault.claim_damage(&id, &(400 * U), &s.hash(3));
    s.vault.respond(&id, &(250 * U));
    assert_eq!(s.vault.get_lease(&id).status, Status::Disputed);
    s.vault.accept_counter(&id);
    assert_eq!(s.bal(&s.landlord), landlord_before + 250 * U);
    assert_eq!(s.bal(&s.tenant), tenant_before + DEPOSIT - 250 * U);
}

#[test]
fn arbiter_splits_only_the_disputed_amount_and_bond_is_forfeited() {
    let s = setup();
    let id = s.ended_lease(false);
    let tenant_before = s.bal(&s.tenant);
    let landlord_before = s.bal(&s.landlord);

    s.vault.claim_damage(&id, &(400 * U), &s.hash(3));
    s.vault.respond(&id, &(100 * U));
    assert_eq!(
        s.vault.try_resolve(&id, &(401 * U)),
        Err(Ok(err(Error::InvalidAmount)))
    );
    s.vault.resolve(&id, &(150 * U));

    assert_eq!(s.bal(&s.landlord), landlord_before - BOND + 150 * U);
    assert_eq!(s.bal(&s.tenant), tenant_before + DEPOSIT - 150 * U);
    assert_eq!(s.bal(&s.fund), BOND);
    assert_eq!(s.bal(&s.vault.address), 0);
}

#[test]
fn bond_returns_when_the_landlord_wins_at_least_half() {
    let s = setup();
    let id = s.ended_lease(false);
    let landlord_before = s.bal(&s.landlord);
    s.vault.claim_damage(&id, &(400 * U), &s.hash(3));
    s.vault.respond(&id, &0);
    s.vault.resolve(&id, &(200 * U));
    assert_eq!(s.bal(&s.landlord), landlord_before + 200 * U);
    assert_eq!(s.bal(&s.fund), 0);
}

#[test]
fn a_silent_arbiter_cannot_lock_the_guarantee() {
    let s = setup();
    let id = s.ended_lease(false);
    let tenant_before = s.bal(&s.tenant);
    let landlord_before = s.bal(&s.landlord);
    s.vault.claim_damage(&id, &(400 * U), &s.hash(3));
    s.vault.respond(&id, &(100 * U)); // answered at T0 + 180
    s.at(T0 + 180 + 60);
    assert_eq!(s.vault.try_expire_dispute(&id), Err(Ok(err(Error::TooEarly))));
    s.at(T0 + 180 + 61);
    s.vault.expire_dispute(&id);

    // Settled at the tenant's offer, and the bond back to the landlord.
    assert_eq!(s.bal(&s.landlord), landlord_before + 100 * U);
    assert_eq!(s.bal(&s.tenant), tenant_before + DEPOSIT - 100 * U);
    assert_eq!(s.bal(&s.fund), 0);
    assert_eq!(s.vault.get_lease(&id).status, Status::Closed);
    assert_eq!(s.vault.try_resolve(&id, &0), Err(Ok(err(Error::WrongStatus))));
}

// ── Blend yield ─────────────────────────────────────────────────────────

#[test]
fn yield_option_needs_both_parties() {
    let s = setup();
    // Landlord offers, tenant declines: nothing goes to Blend.
    let id = s.vault.create_lease(&s.landlord, &s.terms(true));
    s.vault.fund(&id, &s.tenant, &false);
    let lease = s.vault.get_lease(&id);
    assert!(!lease.yield_active);
    assert_eq!(s.bal(&s.pool.address), 0);

    // Tenant would accept, landlord did not offer.
    let id = s.vault.create_lease(&s.landlord, &s.terms(false));
    s.vault.fund(&id, &s.tenant, &true);
    assert!(!s.vault.get_lease(&id).yield_active);
}

#[test]
fn guarantee_minus_one_month_goes_to_blend() {
    let s = setup();
    let tenant_start = s.bal(&s.tenant);
    let id = s.active_lease(true);
    let lease = s.vault.get_lease(&id);
    assert!(lease.yield_active);
    assert_eq!(lease.placed, DEPOSIT - RENT);
    assert_eq!(lease.liquid, RENT + BUFFER);
    assert_eq!(s.bal(&s.pool.address), DEPOSIT - RENT);
    assert_eq!(s.bal(&s.tenant), tenant_start - RENT - DEPOSIT - BUFFER);
    assert_eq!(s.vault.guarantee_value(&id), DEPOSIT + BUFFER);
}

#[test]
fn yield_is_shared_70_20_10_on_release() {
    let s = setup();
    let id = s.ended_lease(true);
    let tenant_before = s.bal(&s.tenant);
    let landlord_before = s.bal(&s.landlord);

    // +10 % on the 650 USDC placed: 65 USDC of yield.
    s.sac.mint(&s.pool.address, &(65 * U));
    s.pool.set_b_rate(&(RATE_SCALAR * 11 / 10));
    assert_eq!(s.vault.guarantee_value(&id), DEPOSIT + BUFFER + 65 * U);

    s.at(T0 + 180 + 121);
    s.vault.release(&id);

    let gain = 65 * U;
    assert_eq!(s.bal(&s.landlord), landlord_before + gain * 20 / 100);
    assert_eq!(s.bal(&s.fund), gain * 10 / 100);
    assert_eq!(
        s.bal(&s.tenant),
        tenant_before + DEPOSIT + BUFFER + gain * 70 / 100
    );
    assert_eq!(s.bal(&s.vault.address), 0);
}

#[test]
fn unpaid_months_pull_from_blend_only_what_is_missing() {
    let s = setup();
    let id = s.active_lease(true);
    let landlord_before = s.bal(&s.landlord);

    s.at(T0 + 60 + 11);
    s.vault.claim_unpaid(&id); // from the liquid month
    let lease = s.vault.get_lease(&id);
    assert_eq!(lease.placed, DEPOSIT - RENT);
    assert_eq!(lease.liquid, BUFFER);

    s.at(T0 + 120 + 11);
    s.vault.claim_unpaid(&id); // buffer + part of the Blend position
    let lease = s.vault.get_lease(&id);
    assert_eq!(s.bal(&s.landlord), landlord_before + 2 * RENT);
    assert_eq!(lease.liquid, 0);
    assert_eq!(lease.placed, BUFFER);
    assert_eq!(s.vault.guarantee_value(&id), BUFFER);
}

#[test]
fn a_blend_loss_hits_the_buffer_and_the_tenant_not_the_landlord() {
    let s = setup();
    let id = s.active_lease(true);
    let landlord_before = s.bal(&s.landlord);

    // The position loses 8 %: 52 USDC, less than the 65 USDC buffer.
    s.pool.set_b_rate(&(RATE_SCALAR * 92 / 100));
    assert!(s.vault.blend_at_risk(&id));

    // Coordinator (any address) pulls the guarantee out.
    s.vault.exit_blend(&id, &s.stranger);
    let lease = s.vault.get_lease(&id);
    assert_eq!(lease.shares, 0);
    assert!(!lease.yield_active);
    assert_eq!(lease.liquid, RENT + BUFFER + (DEPOSIT - RENT) * 92 / 100);

    // Two unpaid months are still paid in full.
    s.at(T0 + 60 + 11);
    s.vault.claim_unpaid(&id);
    s.at(T0 + 120 + 11);
    s.vault.claim_unpaid(&id);
    assert_eq!(s.bal(&s.landlord), landlord_before + 2 * RENT);

    // The tenant keeps what is left: buffer minus the loss.
    assert_eq!(s.vault.guarantee_value(&id), BUFFER - 52 * U);
}

#[test]
fn only_the_parties_can_exit_a_healthy_position() {
    let s = setup();
    let id = s.active_lease(true);
    assert!(!s.vault.blend_at_risk(&id));
    assert_eq!(
        s.vault.try_exit_blend(&id, &s.stranger),
        Err(Ok(err(Error::BlendIsSafe)))
    );
    // The tenant can opt out at any time.
    s.vault.exit_blend(&id, &s.tenant);
    let lease = s.vault.get_lease(&id);
    assert_eq!(lease.shares, 0);
    assert_eq!(lease.liquid, DEPOSIT + BUFFER);
}

#[test]
fn rounding_dust_does_not_count_as_a_loss() {
    let s = setup();
    let id = s.active_lease(true);
    // A b_rate that is not a round number: the position is worth a few
    // stroops less than its principal, as on the real pool.
    s.pool.set_b_rate(&(RATE_SCALAR * 1_000_000 / 1_000_001));
    assert!(!s.vault.blend_at_risk(&id));
    s.pool.set_b_rate(&(RATE_SCALAR * 998 / 1_000));
    assert!(s.vault.blend_at_risk(&id));
}

#[test]
fn anyone_can_exit_when_the_pool_is_nearly_full() {
    let s = setup();
    let id = s.active_lease(true);
    s.pool.set_util(&9_600_000);
    assert!(s.vault.blend_at_risk(&id));
    s.vault.exit_blend(&id, &s.stranger);
    assert_eq!(s.vault.get_lease(&id).shares, 0);
}

#[test]
fn damage_claim_brings_the_guarantee_back_from_blend() {
    let s = setup();
    let id = s.ended_lease(true);
    let tenant_before = s.bal(&s.tenant);
    s.vault.claim_damage(&id, &(100 * U), &s.hash(3));
    assert_eq!(s.vault.get_lease(&id).shares, 0);
    assert_eq!(
        s.bal(&s.tenant),
        tenant_before + DEPOSIT + BUFFER - 100 * U
    );
}

#[test]
fn two_leases_keep_separate_blend_accounting() {
    let s = setup();
    let a = s.active_lease(true);
    let b = s.active_lease(true);
    s.vault.exit_blend(&a, &s.tenant);
    assert_eq!(s.vault.get_lease(&b).shares, DEPOSIT - RENT);
    assert_eq!(s.bal(&s.pool.address), DEPOSIT - RENT);
    assert_eq!(s.vault.guarantee_value(&b), DEPOSIT + BUFFER);
}

// ── Invest the guarantee during the lease ───────────────────────────────

#[test]
fn mid_lease_yield_needs_both_approvals_and_keeps_the_reserve() {
    let s = setup();
    let id = s.active_lease(false);
    let keep = RENT + 100 * U;

    s.vault
        .propose_yield(&id, &s.landlord, &keep, &7_000, &2_000);
    // Proposed is not placed: nothing left the contract yet.
    let lease = s.vault.get_lease(&id);
    assert!(!lease.yield_active);
    assert_eq!(lease.shares, 0);
    assert_eq!(s.bal(&s.vault.address), DEPOSIT);
    assert_eq!(
        s.vault.try_approve_yield(&id, &s.landlord),
        Err(Ok(err(Error::AlreadyConfirmed)))
    );

    let tenant_before = s.bal(&s.tenant);
    s.vault.approve_yield(&id, &s.tenant);
    let lease = s.vault.get_lease(&id);
    assert!(lease.yield_active);
    assert_eq!(lease.placed, DEPOSIT - keep);
    assert_eq!(lease.liquid, keep + BUFFER);
    assert_eq!(s.bal(&s.tenant), tenant_before - BUFFER);
    assert_eq!(s.vault.guarantee_value(&id), DEPOSIT + BUFFER);
    assert_eq!(s.vault.get_yield_proposal(&id), None);
}

#[test]
fn mid_lease_yield_is_shared_on_release() {
    let s = setup();
    let id = s.active_lease(false);
    s.vault.propose_yield(&id, &s.tenant, &RENT, &7_000, &2_000);
    s.vault.approve_yield(&id, &s.landlord);
    let placed = DEPOSIT - RENT;

    s.vault.pay_rent(&id);
    s.vault.pay_rent(&id);
    s.at(T0 + 180);
    s.vault.end_lease(&id, &s.tenant, &None);

    // +10 % on the placed part.
    let gain = placed / 10;
    s.sac.mint(&s.pool.address, &gain);
    s.pool.set_b_rate(&(RATE_SCALAR * 11 / 10));
    let tenant_before = s.bal(&s.tenant);
    let landlord_before = s.bal(&s.landlord);
    s.at(T0 + 180 + 121);
    s.vault.release(&id);

    assert_eq!(s.bal(&s.landlord), landlord_before + gain * 20 / 100);
    assert_eq!(s.bal(&s.fund), gain * 10 / 100);
    assert_eq!(
        s.bal(&s.tenant),
        tenant_before + DEPOSIT + BUFFER + gain * 70 / 100
    );
    assert_eq!(s.bal(&s.vault.address), 0);
}

#[test]
fn mid_lease_yield_rejects_bad_proposals() {
    let s = setup();
    let id = s.active_lease(false);
    // The reserve must cover at least one month, and something must be placed.
    assert_eq!(
        s.vault
            .try_propose_yield(&id, &s.landlord, &(RENT - 1), &7_000, &2_000),
        Err(Ok(err(Error::InvalidAmount)))
    );
    assert_eq!(
        s.vault
            .try_propose_yield(&id, &s.landlord, &DEPOSIT, &7_000, &2_000),
        Err(Ok(err(Error::InvalidAmount)))
    );
    assert_eq!(
        s.vault
            .try_propose_yield(&id, &s.landlord, &RENT, &8_000, &3_000),
        Err(Ok(err(Error::InvalidTerms)))
    );
    assert_eq!(
        s.vault
            .try_propose_yield(&id, &s.stranger, &RENT, &7_000, &2_000),
        Err(Ok(err(Error::NotAParty)))
    );
    // A lease that already lends its guarantee cannot get a second proposal.
    let placed = s.active_lease(true);
    assert_eq!(
        s.vault
            .try_propose_yield(&placed, &s.tenant, &RENT, &7_000, &2_000),
        Err(Ok(err(Error::AlreadyConfirmed)))
    );
}

#[test]
fn cancelling_a_proposal_refunds_the_tenant_buffer() {
    let s = setup();
    let id = s.active_lease(false);
    let tenant_before = s.bal(&s.tenant);
    s.vault.propose_yield(&id, &s.tenant, &RENT, &7_000, &2_000);
    assert_eq!(s.bal(&s.tenant), tenant_before - BUFFER);

    s.vault.cancel_yield(&id, &s.landlord);
    assert_eq!(s.bal(&s.tenant), tenant_before);
    assert_eq!(s.vault.get_yield_proposal(&id), None);
    assert_eq!(
        s.vault.try_cancel_yield(&id, &s.tenant),
        Err(Ok(err(Error::NothingDue)))
    );
}

#[test]
fn ending_the_lease_drops_a_pending_proposal() {
    let s = setup();
    let id = s.active_lease(false);
    let tenant_before = s.bal(&s.tenant);
    s.vault.propose_yield(&id, &s.tenant, &RENT, &7_000, &2_000);
    s.vault.pay_rent(&id);
    s.vault.pay_rent(&id);
    s.at(T0 + 180);
    s.vault.end_lease(&id, &s.landlord, &None);
    assert_eq!(s.vault.get_yield_proposal(&id), None);
    assert_eq!(s.bal(&s.tenant), tenant_before - 2 * RENT);

    s.at(T0 + 301);
    s.vault.release(&id);
    assert_eq!(s.bal(&s.vault.address), 0);
}

// ── Ratings ─────────────────────────────────────────────────────────────

#[test]
fn parties_rate_each_other_once_after_the_lease() {
    let s = setup();
    let id = s.closed_lease(false);

    s.vault.rate(&id, &s.tenant, &5);
    s.vault.rate(&id, &s.landlord, &4);
    assert_eq!(
        s.vault.get_ratings(&id),
        LeaseRatings {
            by_tenant: Some(5),
            by_landlord: Some(4)
        }
    );
    assert_eq!(
        s.vault.get_reputation(&s.landlord),
        Reputation {
            count: 1,
            total: 5,
            counterparties: 1,
            lease_seconds: 180
        }
    );
    assert_eq!(
        s.vault.get_reputation(&s.tenant),
        Reputation {
            count: 1,
            total: 4,
            counterparties: 1,
            lease_seconds: 180
        }
    );
    assert_eq!(
        s.vault.try_rate(&id, &s.tenant, &1),
        Err(Ok(err(Error::AlreadyRated)))
    );

    // A second lease with the same tenant adds to the score and the time,
    // not to the number of different counterparties.
    s.at(T0);
    let id2 = s.closed_lease(false);
    s.vault.rate(&id2, &s.tenant, &3);
    assert_eq!(
        s.vault.get_reputation(&s.landlord),
        Reputation {
            count: 2,
            total: 8,
            counterparties: 1,
            lease_seconds: 360
        }
    );
}

#[test]
fn ratings_are_limited_to_real_parties_after_the_lease() {
    let s = setup();
    let active = s.active_lease(false);
    assert_eq!(
        s.vault.try_rate(&active, &s.tenant, &5),
        Err(Ok(err(Error::WrongStatus)))
    );

    // Not while a claim can still be filed or is open.
    let ended = s.ended_lease(false);
    assert_eq!(
        s.vault.try_rate(&ended, &s.tenant, &5),
        Err(Ok(err(Error::WrongStatus)))
    );
    s.vault.claim_damage(&ended, &(100 * U), &s.hash(3));
    s.vault.respond(&ended, &0);
    assert_eq!(
        s.vault.try_rate(&ended, &s.landlord, &1),
        Err(Ok(err(Error::WrongStatus)))
    );

    s.at(T0);
    let id = s.closed_lease(false);
    assert_eq!(
        s.vault.try_rate(&id, &s.stranger, &5),
        Err(Ok(err(Error::NotAParty)))
    );
    assert_eq!(
        s.vault.try_rate(&id, &s.arbiter, &5),
        Err(Ok(err(Error::NotAParty)))
    );
    assert_eq!(
        s.vault.try_rate(&id, &s.tenant, &0),
        Err(Ok(err(Error::InvalidScore)))
    );
    assert_eq!(
        s.vault.try_rate(&id, &s.tenant, &6),
        Err(Ok(err(Error::InvalidScore)))
    );
    assert_eq!(s.vault.get_reputation(&s.stranger), Reputation::default());
}

#[test]
fn short_or_small_leases_are_rated_but_build_no_reputation() {
    let s = setup();
    // One month of 60 s: below the 180 s threshold.
    let mut short = s.terms(false);
    short.months = 1;
    // 3 months but a guarantee under 100 USDC.
    let mut small = s.terms(false);
    small.rent = 10 * U;
    small.deposit = 50 * U;
    for terms in [short, small] {
        s.at(T0);
        let id = s.vault.create_lease(&s.landlord, &terms);
        s.vault.fund(&id, &s.tenant, &false);
        s.vault.confirm_move_in(&id, &s.tenant, &s.hash(1));
        s.vault.confirm_move_in(&id, &s.landlord, &s.hash(1));
        for _ in 1..terms.months {
            s.vault.pay_rent(&id);
        }
        s.at(T0 + terms.months as u64 * 60);
        s.vault.end_lease(&id, &s.tenant, &None);
        s.at(T0 + terms.months as u64 * 60 + 121);
        s.vault.release(&id);
        s.vault.rate(&id, &s.tenant, &5);
        // Recorded on the lease, not counted.
        assert_eq!(s.vault.get_ratings(&id).by_tenant, Some(5));
        assert_eq!(s.vault.get_reputation(&s.landlord), Reputation::default());
    }
}

#[test]
fn the_tenant_buffer_is_never_locked_twice() {
    let s = setup();
    // Yield accepted at funding: the buffer is locked then.
    let id = s.active_lease(true);
    s.vault.exit_blend(&id, &s.tenant);
    let tenant_before = s.bal(&s.tenant);

    // A new proposal later does not ask for it again.
    s.vault.propose_yield(&id, &s.tenant, &RENT, &7_000, &2_000);
    assert_eq!(s.vault.get_yield_proposal(&id).unwrap().buffer, 0);
    s.vault.approve_yield(&id, &s.landlord);
    assert_eq!(s.bal(&s.tenant), tenant_before);
    let lease = s.vault.get_lease(&id);
    assert_eq!(lease.liquid + lease.placed, DEPOSIT + BUFFER);
    assert_eq!(s.vault.guarantee_value(&id), DEPOSIT + BUFFER);
}

// ── Disputes: incentives ────────────────────────────────────────────────

#[test]
fn an_inflated_claim_earns_nothing_when_the_arbiter_is_silent() {
    let s = setup();
    let id = s.ended_lease(false);
    let tenant_before = s.bal(&s.tenant);
    let landlord_before = s.bal(&s.landlord);
    // The landlord claims the whole guarantee, the tenant offers nothing.
    s.vault.claim_damage(&id, &DEPOSIT, &s.hash(3));
    s.vault.respond(&id, &0);
    s.at(T0 + 180 + 61);
    s.vault.expire_dispute(&id);
    // A halfway split would have given 650 USDC; the guarantee comes back.
    assert_eq!(s.bal(&s.landlord), landlord_before);
    assert_eq!(s.bal(&s.tenant), tenant_before + DEPOSIT);
    assert_eq!(s.bal(&s.vault.address), 0);
}

#[test]
fn the_buffer_and_the_yield_are_never_claimable() {
    let s = setup();
    let id = s.ended_lease(true);
    // Blend earned 10 % on the 650 USDC placed; the buffer is in the contract too.
    s.sac.mint(&s.pool.address, &(65 * U));
    s.pool.set_b_rate(&(RATE_SCALAR * 11 / 10));
    assert_eq!(s.vault.max_claim(&id), DEPOSIT);
    assert_eq!(
        s.vault.try_claim_damage(&id, &(DEPOSIT + 1), &s.hash(3)),
        Err(Ok(err(Error::InvalidAmount)))
    );
    let tenant_before = s.bal(&s.tenant);
    s.vault.claim_damage(&id, &DEPOSIT, &s.hash(3));
    // The tenant got the buffer and its 70 % of the gain back at once.
    let gain = (DEPOSIT - RENT) / 10;
    assert_eq!(s.bal(&s.tenant), tenant_before + BUFFER + gain * 7_000 / 10_000);
}

#[test]
fn months_taken_from_the_guarantee_lower_the_claim_cap() {
    let s = setup();
    let id = s.active_lease(false);
    // Month 1 unpaid and taken from the guarantee, month 2 paid.
    s.at(T0 + 60 + 11);
    s.vault.claim_unpaid(&id);
    s.vault.pay_rent(&id);
    s.at(T0 + 180);
    s.vault.end_lease(&id, &s.tenant, &None);
    assert_eq!(s.vault.max_claim(&id), DEPOSIT - RENT);
    assert_eq!(
        s.vault.try_claim_damage(&id, &(DEPOSIT - RENT + 1), &s.hash(3)),
        Err(Ok(err(Error::InvalidAmount)))
    );
}

// ── Mediator registry ───────────────────────────────────────────────────

#[test]
fn a_lease_can_only_name_an_approved_mediator() {
    let s = setup();
    let mut t = s.terms(false);
    t.arbiter = s.stranger.clone(); // the landlord's friend
    assert_eq!(
        s.vault.try_create_lease(&s.landlord, &t),
        Err(Ok(err(Error::ArbiterNotApproved)))
    );
    assert!(s.vault.is_arbiter(&s.arbiter));
    assert!(!s.vault.is_arbiter(&s.stranger));
}

#[test]
fn only_the_admin_curates_a_closed_registry() {
    let s = setup();
    assert_eq!(
        s.vault.try_register_arbiter(&s.stranger),
        Err(Ok(err(Error::RegistryClosed)))
    );
    s.vault.approve_arbiter(&s.stranger);
    let auths = s.env.auths();
    assert_eq!(auths[0].0, s.admin);
    assert_eq!(s.vault.get_arbiters().len(), 2);
    // Approving twice does not duplicate the entry.
    s.vault.approve_arbiter(&s.stranger);
    assert_eq!(s.vault.get_arbiters().len(), 2);
}

#[test]
fn an_open_registry_lets_mediators_join_by_signing() {
    let s = setup_with(true);
    s.vault.register_arbiter(&s.stranger);
    let auths = s.env.auths();
    assert_eq!(auths[0].0, s.stranger);
    assert!(s.vault.is_arbiter(&s.stranger));
}

#[test]
fn a_revoked_mediator_blocks_funding_of_a_pending_offer() {
    let s = setup();
    let id = s.vault.create_lease(&s.landlord, &s.terms(false));
    s.vault.revoke_arbiter(&s.arbiter);
    assert!(!s.vault.is_arbiter(&s.arbiter));
    assert_eq!(
        s.vault.try_fund(&id, &s.tenant, &false),
        Err(Ok(err(Error::ArbiterNotApproved)))
    );
}

// ── Bounded terms, arbiter records, damage cap, storage bump ──────

#[test]
fn lease_windows_must_leave_the_tenant_time_and_cannot_lock_forever() {
    let s = setup();
    let bad = |f: &dyn Fn(&mut Terms)| {
        let mut t = s.terms(false);
        f(&mut t);
        s.vault.try_create_lease(&s.landlord, &t)
    };
    // No time to answer a claim: the trap that would let a landlord take everything.
    assert_eq!(bad(&|t| t.response_window = 0), Err(Ok(err(Error::InvalidTerms))));
    assert_eq!(bad(&|t| t.response_window = MIN_WINDOW - 1), Err(Ok(err(Error::InvalidTerms))));
    assert_eq!(bad(&|t| t.arbitration_window = 1), Err(Ok(err(Error::InvalidTerms))));
    assert_eq!(bad(&|t| t.move_in_window = 1), Err(Ok(err(Error::InvalidTerms))));
    assert_eq!(bad(&|t| t.period = 1), Err(Ok(err(Error::InvalidTerms))));
    // A claim window that would freeze the guarantee.
    assert_eq!(bad(&|t| t.claim_window = MAX_WINDOW + 1), Err(Ok(err(Error::InvalidTerms))));
    assert_eq!(bad(&|t| t.grace = MAX_WINDOW + 1), Err(Ok(err(Error::InvalidTerms))));
    // The bounds themselves are accepted.
    assert!(bad(&|t| {
        t.response_window = MIN_WINDOW;
        t.claim_window = MAX_WINDOW;
    })
    .is_ok());
}

#[test]
fn arbiter_decisions_are_on_record() {
    let s = setup();
    let id = s.ended_lease(false);
    s.vault.claim_damage(&id, &(200 * U), &s.hash(9));
    s.vault.respond(&id, &(50 * U));
    s.vault.resolve(&id, &(150 * U));
    assert_eq!(
        s.vault.get_arbiter_record(&s.arbiter),
        ArbiterRecord { cases: 1, claimed: 200 * U, to_landlord: 150 * U }
    );
    assert_eq!(s.vault.get_arbiter_record(&s.stranger), ArbiterRecord::default());
}

#[test]
fn a_damage_claim_cannot_reach_the_tenant_buffer() {
    let s = setup();
    let id = s.ended_lease(true);
    assert_eq!(s.vault.max_claim(&id), DEPOSIT);
    assert_eq!(
        s.vault.try_claim_damage(&id, &(DEPOSIT + 1), &s.hash(9)),
        Err(Ok(err(Error::InvalidAmount)))
    );
    let tenant_before = s.bal(&s.tenant);
    s.vault.claim_damage(&id, &DEPOSIT, &s.hash(9));
    // Even with the whole guarantee claimed, the buffer goes back at once.
    assert_eq!(s.bal(&s.tenant), tenant_before + BUFFER);
}

#[test]
fn months_taken_from_the_guarantee_lower_the_damage_cap() {
    let s = setup();
    let id = s.active_lease(false);
    s.vault.pay_rent(&id);
    // Month 3 is never paid: it is taken from the guarantee.
    s.at(T0 + 180);
    s.vault.end_lease(&id, &s.landlord, &None);
    s.at(T0 + 191);
    s.vault.claim_unpaid(&id);
    assert_eq!(s.vault.max_claim(&id), DEPOSIT - RENT);
    assert_eq!(
        s.vault.try_claim_damage(&id, &(DEPOSIT - RENT + 1), &s.hash(9)),
        Err(Ok(err(Error::InvalidAmount)))
    );
    s.vault.claim_damage(&id, &(DEPOSIT - RENT), &s.hash(9));
}

#[test]
fn anyone_can_keep_a_lease_alive() {
    let s = setup();
    let id = s.active_lease(true);
    s.vault.bump(&id);
    assert_eq!(s.vault.get_lease(&id).status, Status::Active);
    assert_eq!(s.vault.try_bump(&99), Err(Ok(err(Error::LeaseNotFound))));
}

// ── Messages ────────────────────────────────────────────────────────────

fn msg(env: &Env, bytes: &[u8]) -> soroban_sdk::Bytes {
    soroban_sdk::Bytes::from_slice(env, bytes)
}

#[test]
fn parties_message_each_other_in_a_hash_chained_thread() {
    let s = setup();
    let id = s.active_lease(false);
    let before = (s.bal(&s.tenant), s.bal(&s.landlord), s.vault.get_lease(&id));
    assert_eq!(s.vault.get_thread(&id).count, 0);

    let first = s.vault.send_message(&id, &s.tenant, &msg(&s.env, b"hello"));
    let auths = s.env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, s.tenant);
    let second = s.vault.send_message(&id, &s.landlord, &msg(&s.env, b"hi"));

    let zero = BytesN::from_array(&s.env, &[0; 32]);
    let h1 = thread_hash(&s.env, &zero, &s.tenant, 0, &msg(&s.env, b"hello"));
    let h2 = thread_hash(&s.env, &h1, &s.landlord, 1, &msg(&s.env, b"hi"));
    assert_eq!(first, Thread { count: 1, hash: h1 });
    assert_eq!(second, Thread { count: 2, hash: h2.clone() });
    assert_eq!(s.vault.get_thread(&id), second);
    // A message moves no money and changes nothing on the lease.
    assert_eq!((s.bal(&s.tenant), s.bal(&s.landlord), s.vault.get_lease(&id)), before);
    // The same text from the other party gives another hash.
    assert_ne!(
        thread_hash(&s.env, &zero, &s.landlord, 0, &msg(&s.env, b"hello")),
        thread_hash(&s.env, &zero, &s.tenant, 0, &msg(&s.env, b"hello"))
    );
    s.vault.bump(&id);
    assert_eq!(s.vault.get_thread(&id).hash, h2);
}

#[test]
fn only_the_two_parties_can_message_once_the_tenant_is_known() {
    let s = setup();
    let open = s.vault.create_lease(&s.landlord, &s.terms(false));
    assert_eq!(
        s.vault.try_send_message(&open, &s.landlord, &msg(&s.env, b"x")),
        Err(Ok(err(Error::WrongStatus)))
    );
    let id = s.active_lease(false);
    for who in [&s.stranger, &s.arbiter] {
        assert_eq!(
            s.vault.try_send_message(&id, who, &msg(&s.env, b"x")),
            Err(Ok(err(Error::NotAParty)))
        );
    }
    assert_eq!(
        s.vault.try_send_message(&id, &s.tenant, &msg(&s.env, b"")),
        Err(Ok(err(Error::InvalidMessage)))
    );
    assert_eq!(
        s.vault.try_send_message(&id, &s.tenant, &msg(&s.env, &[7; 1_025])),
        Err(Ok(err(Error::InvalidMessage)))
    );
    assert_eq!(s.vault.send_message(&id, &s.tenant, &msg(&s.env, &[7; 1_024])).count, 1);
    // Still possible after the lease, e.g. to settle a damage claim.
    let closed = s.closed_lease(false);
    assert_eq!(s.vault.send_message(&closed, &s.landlord, &msg(&s.env, b"thanks")).count, 1);
}

/// Same vector as front/src/chat/thread.test.ts: the app and the contract
/// must chain messages identically.
#[test]
fn thread_hash_matches_the_app() {
    let env = Env::default();
    let from = Address::from_str(&env, "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF");
    let zero = BytesN::from_array(&env, &[0; 32]);
    let h = thread_hash(&env, &zero, &from, 0, &msg(&env, &[1, 2, 3]));
    let hex: std::string::String = h.to_array().iter().map(|b| std::format!("{b:02x}")).collect();
    assert_eq!(hex, "e4cefdd803d0695ce1673234549e0dd18b54b9c86318bc2f1fc08d7d724942ff");
}
