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
    stranger: Address,
}

fn setup() -> Setup {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(T0);

    let issuer = Address::generate(&env);
    let sac_contract = env.register_stellar_asset_contract_v2(issuer);
    let token_id = sac_contract.address();
    let pool_id = env.register(MockPool, (token_id.clone(),));
    let fund = Address::generate(&env);
    let vault_id = env.register(
        LeaseVault,
        (token_id.clone(), pool_id.clone(), fund.clone(), BOND),
    );

    let s = Setup {
        vault: LeaseVaultClient::new(&env, &vault_id),
        token: TokenClient::new(&env, &token_id),
        sac: StellarAssetClient::new(&env, &token_id),
        pool: MockPoolClient::new(&env, &pool_id),
        landlord: Address::generate(&env),
        tenant: Address::generate(&env),
        arbiter: Address::generate(&env),
        fund,
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
