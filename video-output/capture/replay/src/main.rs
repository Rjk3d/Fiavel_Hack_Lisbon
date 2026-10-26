//! Replays LeaseVault v5 lease #0 as recorded in the repository README
//! ("On-chain evidence (testnet)", 25 October), on the real contract code in the
//! Soroban host, with the repository's mock Blend pool (contracts/lease_vault/src/test.rs).
//! Every state the film shows is exported as XDR, the format Soroban RPC returns.
//!
//! Terms are the app's "New lease" defaults (front/src/components/live/NewLeaseDialog.tsx),
//! which match the recorded amounts: 310 USDC funded = 100 first rent + 200 guarantee + 10 buffer,
//! 100 USDC supplied to Blend, damage claim capped at 100, Blend gain 588 stroops.
//! Timestamps are chosen inside the demo-mode windows; the recorded ones are not in the README.

use lease_vault::{LeaseVault, LeaseVaultClient, Positions, Request, Reserve, ReserveConfig, ReserveData, Terms};
use soroban_sdk::{
    contract, contractimpl, contracttype,
    testutils::{Address as _, Events as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    xdr::{Limits, ScVal, WriteXdr},
    Address, BytesN, Env, IntoVal, Map, String as SString, TryFromVal, Val, Vec,
};
use std::fmt::Write as _;

const RATE_SCALAR: i128 = 1_000_000_000_000;
const U: i128 = 10_000_000;

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


fn b64<T: IntoVal<Env, Val>>(env: &Env, v: T) -> std::string::String {
    let val: Val = v.into_val(env);
    ScVal::try_from_val(env, &val).unwrap().to_xdr_base64(Limits::none()).unwrap()
}

struct Rec {
    out: std::string::String,
    seen: usize,
    events: std::vec::Vec<std::string::String>,
}

fn collect(env: &Env, vault_id: &Address, rec: &mut Rec) {
    // The host keeps the events of the last invocation only.
    for e in env.events().all().filter_by_contract(vault_id).events() {
        rec.events.push(e.to_xdr_base64(Limits::none()).unwrap());
    }
}

fn snapshot(env: &Env, vault: &LeaseVaultClient, token: &TokenClient, vault_id: &Address, rec: &mut Rec, label: &str, tx: &str, people: &[(&str, &Address)]) {
    collect(env, vault_id, rec);
    let _ = rec.seen;
    let id = 0u64;
    let mut s = std::string::String::new();
    let _ = write!(s, "{{\"label\":\"{label}\",\"time\":{},\"tx\":\"{tx}\",", env.ledger().timestamp());
    let _ = write!(s, "\"lease_count\":\"{}\",", b64(env, vault.lease_count()));
    let _ = write!(s, "\"get_lease\":\"{}\",", b64(env, vault.get_lease(&id)));
    let _ = write!(s, "\"get_claim\":\"{}\",", b64(env, vault.get_claim(&id)));
    let _ = write!(s, "\"guarantee_value\":\"{}\",", b64(env, vault.guarantee_value(&id)));
    let _ = write!(s, "\"blend_at_risk\":\"{}\",", b64(env, vault.blend_at_risk(&id)));
    let _ = write!(s, "\"max_claim\":\"{}\",", b64(env, vault.max_claim(&id)));
    let _ = write!(s, "\"get_yield_proposal\":\"{}\",", b64(env, vault.get_yield_proposal(&id)));
    let _ = write!(s, "\"get_ratings\":\"{}\",", b64(env, vault.get_ratings(&id)));
    let _ = write!(s, "\"get_thread\":\"{}\",", b64(env, vault.get_thread(&id)));
    let _ = write!(s, "\"get_arbiters\":\"{}\",", b64(env, vault.get_arbiters()));
    let _ = write!(s, "\"get_config\":\"{}\",", b64(env, vault.get_config()));
    s.push_str("\"get_reputation\":{");
    for (i, (name, who)) in people.iter().enumerate() {
        let _ = write!(s, "{}\"{name}\":\"{}\"", if i > 0 { "," } else { "" }, b64(env, vault.get_reputation(who)));
    }
    s.push_str("},\"balance\":{");
    for (i, (name, who)) in people.iter().enumerate() {
        let _ = write!(s, "{}\"{name}\":\"{}\"", if i > 0 { "," } else { "" }, token.balance(who));
    }
    s.push_str("},\"get_arbiter_record\":\"");
    s.push_str(&b64(env, vault.get_arbiter_record(people[2].1)));
    s.push_str("\",\"events\":[");
    s.push_str(&rec.events.iter().map(|e| format!("\"{e}\"")).collect::<std::vec::Vec<_>>().join(","));
    s.push_str("]}");
    if !rec.out.is_empty() {
        rec.out.push_str(",\n");
    }
    rec.out.push_str(&s);
}

fn main() {
    let tenant_g = std::env::var("TENANT").expect("TENANT");
    let landlord_g = std::env::var("LANDLORD").expect("LANDLORD");
    let arbiter_g = std::env::var("ARBITER").expect("ARBITER");
    let t0: u64 = std::env::var("T0").expect("T0").parse().unwrap();

    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().budget().reset_unlimited();
    env.ledger().set_timestamp(t0);
    let at = |dt: u64| env.ledger().set_timestamp(t0 + dt);

    let issuer = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(issuer).address();
    let pool_id = env.register(MockPool, (token_id.clone(),));
    let pool = MockPoolClient::new(&env, &pool_id);
    let fund = Address::generate(&env);
    let admin = Address::generate(&env);
    // Account addresses need a USDC trustline the test host cannot create, so the parties are
    // host-generated addresses; the capture maps them to the app's local test wallets.
    let tenant = Address::generate(&env);
    let landlord = Address::generate(&env);
    let arbiter = Address::generate(&env);
    let alias = format!(
        "{{\"{}\":\"{tenant_g}\",\"{}\":\"{landlord_g}\",\"{}\":\"{arbiter_g}\"}}",
        tenant.to_string(), landlord.to_string(), arbiter.to_string()
    );
    // deployments/testnet.json: disputeBond 20 USDC, minRatedDuration 180 s, minRatedDeposit 100 USDC,
    // openRegistry true, minWindow 30 s, maxWindow 90 days, the deploy's mediator approved.
    let vault_id = env.register(
        LeaseVault,
        (token_id.clone(), pool_id.clone(), fund.clone(), 20 * U, 180u64, 100 * U, admin, true, 30u64, 7_776_000u64, Vec::from_array(&env, [arbiter.clone()])),
    );
    let vault = LeaseVaultClient::new(&env, &vault_id);
    let sac = StellarAssetClient::new(&env, &token_id);
    // Assumption: the tenant starts with 1,000 test USDC; the landlord with none, so the
    // landlord's balance only shows what the lease paid out.
    let token = TokenClient::new(&env, &token_id);
    sac.mint(&tenant, &(1_000 * U));
    let people = [("tenant", &tenant), ("landlord", &landlord), ("arbiter", &arbiter)];
    let mut rec = Rec { out: std::string::String::new(), seen: 0, events: std::vec::Vec::new() };
    let hash = |b: u8| BytesN::from_array(&env, &[b; 32]);

    let terms = Terms {
        rent: 100 * U,
        deposit: 200 * U,
        months: 3,
        period: 60,
        grace: 10,
        move_in_window: 900,
        claim_window: 60,
        response_window: 60,
        arbitration_window: 120,
        arbiter: arbiter.clone(),
        yield_offered: true,
        buffer_bps: 500,
        tenant_share_bps: 7_000,
        landlord_share_bps: 2_000,
    };

    at(0);
    vault.create_lease(&landlord, &terms);
    snapshot(&env, &vault, &token, &vault_id, &mut rec, "created", "8291b5f28d62bbfd83c695625e26c451230f30d86be632a77742bf3cf368ea77", &people);
    at(45);
    vault.fund(&0, &tenant, &true);
    snapshot(&env, &vault, &token, &vault_id, &mut rec, "funded", "51955ee077d063a17f2db9f933daaff2174ba95df287871f58a1079bf8bb6740", &people);
    at(110);
    vault.confirm_move_in(&0, &tenant, &hash(7));
    collect(&env, &vault_id, &mut rec);
    at(120);
    vault.confirm_move_in(&0, &landlord, &hash(7));
    snapshot(&env, &vault, &token, &vault_id, &mut rec, "moved_in", "97ac3e664a017a7bffdee3c4d818c90b49ab2ed470d34a93b4d5fa5e51c4a9d0", &people);
    at(170);
    vault.pay_rent(&0);
    snapshot(&env, &vault, &token, &vault_id, &mut rec, "rent_paid", "0d82efe431158b9235e7326fef4fbe05bc0a6bae33d41c2c8e73f8f1fddfca34", &people);
    at(251);
    vault.claim_unpaid(&0);
    snapshot(&env, &vault, &token, &vault_id, &mut rec, "unpaid_claimed", "f4ad87dc47996acdb771ee42172bb0585bb7d3b82eac36804adc826a71c88b35", &people);
    at(300);
    vault.end_lease(&0, &tenant, &Some(hash(9)));
    snapshot(&env, &vault, &token, &vault_id, &mut rec, "ended", "71a2376ac1c1b1f4b2f92b413cd7406ac2603865c822af7822dcbc2b090b3a03", &people);
    // README: Blend withdrawn at the claim with a gain of 588 stroops on the 100 USDC supplied.
    pool.set_b_rate(&(RATE_SCALAR + 588_000));
    sac.mint(&pool_id, &588); // the pool pays the gain out of interest it holds
    at(320);
    vault.claim_damage(&0, &(100 * U), &hash(11));
    snapshot(&env, &vault, &token, &vault_id, &mut rec, "claimed", "73aab042b7e18d7330547797a0dbe7f4085fd71b080bd29e7b8f2eb4d4964553", &people);
    at(340);
    vault.respond(&0, &(50 * U));
    snapshot(&env, &vault, &token, &vault_id, &mut rec, "disputed", "101f7174c017f8f12e4fb549e6f3536753a4f4043f974dec1df2819561f01ca8", &people);
    at(461);
    vault.expire_dispute(&0);
    snapshot(&env, &vault, &token, &vault_id, &mut rec, "settled", "f70951d3a713a4a14b28c5bd5b8d728ee271c13413f3d2b223a639bc922fa499", &people);

    let _ = (SString::from_str(&env, ""), Map::<u32, i128>::new(&env));
    println!("{{\"t0\":{t0},\"vault\":\"{}\",\"alias\":{alias},\"steps\":[\n{}\n]}}", vault_id.to_string(), rec.out);
}
