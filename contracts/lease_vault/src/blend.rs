//! Minimal client for a Blend v2 lending pool.
//!
//! Only the three entry points LeaseVault needs. The types mirror
//! blend-contracts-v2 (`pool/src/pool/actions.rs`, `user.rs`, `reserve.rs`,
//! `storage.rs`) field for field, because contract types are encoded by field
//! name: a missing or renamed field fails to decode.

use soroban_sdk::{contractclient, contracttype, Address, Env, Map, Vec};

/// `RequestType::Supply`: lend without using the position as collateral.
pub const REQUEST_SUPPLY: u32 = 0;
/// `RequestType::Withdraw`: burn supply b-tokens. Asking for more than the
/// position holds withdraws the whole position.
pub const REQUEST_WITHDRAW: u32 = 1;

/// b_rate and d_rate are expressed with 12 decimals.
pub const RATE_SCALAR: i128 = 1_000_000_000_000;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Request {
    pub request_type: u32,
    pub address: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Positions {
    pub liabilities: Map<u32, i128>,
    pub collateral: Map<u32, i128>,
    pub supply: Map<u32, i128>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReserveConfig {
    pub index: u32,
    pub decimals: u32,
    pub c_factor: u32,
    pub l_factor: u32,
    pub util: u32,
    pub max_util: u32,
    pub r_base: u32,
    pub r_one: u32,
    pub r_two: u32,
    pub r_three: u32,
    pub reactivity: u32,
    pub supply_cap: i128,
    pub enabled: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReserveData {
    pub d_rate: i128,
    pub b_rate: i128,
    pub ir_mod: i128,
    pub b_supply: i128,
    pub d_supply: i128,
    pub backstop_credit: i128,
    pub last_time: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Reserve {
    pub asset: Address,
    pub config: ReserveConfig,
    pub data: ReserveData,
    pub scalar: i128,
}

#[allow(dead_code)] // only the generated client is used
#[contractclient(name = "BlendPoolClient")]
pub trait BlendPool {
    fn submit(
        env: Env,
        from: Address,
        spender: Address,
        to: Address,
        requests: Vec<Request>,
    ) -> Positions;
    fn get_positions(env: Env, address: Address) -> Positions;
    fn get_reserve(env: Env, asset: Address) -> Reserve;
}

/// Underlying value of `shares` b-tokens, rounded down.
pub fn shares_to_assets(shares: i128, b_rate: i128) -> i128 {
    shares * b_rate / RATE_SCALAR
}

/// Pool utilization of the reserve, with 7 decimals (10_000_000 = 100 %).
pub fn utilization(data: &ReserveData) -> i128 {
    let supplied = data.b_supply * data.b_rate;
    if supplied == 0 {
        return 0;
    }
    data.d_supply * data.d_rate * 10_000_000 / supplied
}
