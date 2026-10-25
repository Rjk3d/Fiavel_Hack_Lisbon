#!/usr/bin/env bash
# Creates the demo identities, funds them with XLM (Friendbot) and Blend's
# testnet assets, then deploys LeaseVault against Blend's testnet pool.
# Writes the result to deployments/testnet.json.
#
# Usage: scripts/deploy-testnet.sh            (run from the repo root)
# Requires: stellar CLI, curl, a built wasm (stellar contract build).
set -euo pipefail

NETWORK=testnet
# Blend v2 testnet (github.com/blend-capital/blend-utils, testnet.contracts.json)
BLEND_POOL=CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF
USDC=CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU
BLEND_FAUCET=https://ewqw4hx7oa.execute-api.us-east-1.amazonaws.com/getAssets
DISPUTE_BOND=200000000 # 20 USDC, 7 decimals
# Ratings build reputation only on leases at least this long and this large.
# Testnet demo values: a 3-month demo lease (3 x 60 s) with 100 USDC. Mainnet: e.g. 90 days.
MIN_RATED_DURATION=180
MIN_RATED_DEPOSIT=1000000000 # 100 USDC
WASM=target/wasm32v1-none/release/lease_vault.wasm

identity() {
  local name=$1
  if ! stellar keys address "$name" >/dev/null 2>&1; then
    stellar keys generate "$name" --network $NETWORK --fund >/dev/null
  else
    stellar keys fund "$name" --network $NETWORK >/dev/null 2>&1 || true
  fi
  stellar keys address "$name"
}

# Blend's faucet returns a transaction, signed by the test issuer, that adds
# trustlines and sends test USDC, BLND, wETH and wBTC. We co-sign and submit.
blend_faucet() {
  local name=$1 addr
  addr=$(stellar keys address "$name")
  local xdr
  xdr=$(curl -sf "$BLEND_FAUCET?userId=$addr" -H "Origin: https://testnet.blend.capital" | tr -d '"')
  stellar tx sign "$xdr" --sign-with-key "$name" --network $NETWORK \
    | stellar tx send --network $NETWORK >/dev/null
}

usdc_balance() {
  stellar contract invoke --id $USDC --source "$1" --network $NETWORK --send=no \
    -- balance --id "$1" 2>/dev/null | tr -d '"'
}

echo "== identities"
DEPLOYER=$(identity fiavel-deployer)
LANDLORD=$(identity fiavel-landlord)
TENANT=$(identity fiavel-tenant)
ARBITER=$(identity fiavel-arbiter)
FUND=$(identity fiavel-fund)
COORDINATOR=$(identity fiavel-coordinator)

echo "== Blend test assets"
for who in fiavel-landlord fiavel-tenant fiavel-arbiter fiavel-fund; do
  if [ "$(usdc_balance $who || echo 0)" = "" ] || [ "$(usdc_balance $who || echo 0)" = "0" ]; then
    blend_faucet $who || echo "faucet failed for $who"
  fi
  echo "$who USDC: $(usdc_balance $who || echo '?')"
done

echo "== deploy LeaseVault"
[ -f "$WASM" ] || stellar contract build --package lease_vault
VAULT=$(stellar contract deploy --wasm "$WASM" --source fiavel-deployer --network $NETWORK \
  --alias lease_vault -- \
  --token $USDC --pool $BLEND_POOL --arbitration_fund "$FUND" --dispute_bond $DISPUTE_BOND \
  --min_rated_duration $MIN_RATED_DURATION --min_rated_deposit $MIN_RATED_DEPOSIT)
echo "LeaseVault: $VAULT"

mkdir -p deployments
cat > deployments/testnet.json <<EOF
{
  "network": "testnet",
  "rpcUrl": "https://soroban-testnet.stellar.org",
  "networkPassphrase": "Test SDF Network ; September 2015",
  "leaseVault": "$VAULT",
  "usdc": "$USDC",
  "usdcClassic": "USDC:GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56",
  "blendPool": "$BLEND_POOL",
  "disputeBond": "$DISPUTE_BOND",
  "minRatedDuration": "$MIN_RATED_DURATION",
  "minRatedDeposit": "$MIN_RATED_DEPOSIT",
  "accounts": {
    "deployer": "$DEPLOYER",
    "landlord": "$LANDLORD",
    "tenant": "$TENANT",
    "arbiter": "$ARBITER",
    "arbitrationFund": "$FUND",
    "coordinator": "$COORDINATOR"
  }
}
EOF
echo "== wrote deployments/testnet.json"
