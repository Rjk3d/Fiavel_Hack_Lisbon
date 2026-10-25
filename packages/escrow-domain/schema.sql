PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS escrow_bindings (
  lease_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK(provider IN ('leasevault','trustless_work')),
  provider_escrow_id TEXT NOT NULL,
  contract_id TEXT NOT NULL,
  network TEXT NOT NULL,
  token TEXT NOT NULL,
  expected_deposit TEXT NOT NULL,
  required_funding TEXT,
  locked INTEGER NOT NULL CHECK(locked IN (0,1)),
  record_json TEXT NOT NULL,
  UNIQUE(provider, network, contract_id, provider_escrow_id)
);
CREATE TRIGGER IF NOT EXISTS escrow_identity_immutable
BEFORE UPDATE ON escrow_bindings
WHEN OLD.lease_id != NEW.lease_id OR OLD.provider != NEW.provider
  OR OLD.provider_escrow_id != NEW.provider_escrow_id OR OLD.contract_id != NEW.contract_id
  OR OLD.network != NEW.network OR OLD.token != NEW.token
  OR json_extract(OLD.record_json, '$.asset.issuer') IS NOT json_extract(NEW.record_json, '$.asset.issuer')
  OR json_extract(OLD.record_json, '$.asset.code') IS NOT json_extract(NEW.record_json, '$.asset.code')
  OR json_extract(OLD.record_json, '$.asset.decimals') IS NOT json_extract(NEW.record_json, '$.asset.decimals')
  OR OLD.expected_deposit != NEW.expected_deposit
  OR (OLD.locked = 1 AND (NEW.locked != 1 OR (OLD.required_funding IS NOT NULL AND OLD.required_funding IS NOT NEW.required_funding)))
BEGIN SELECT RAISE(ABORT, 'immutable escrow provider or funding lock'); END;
CREATE TRIGGER IF NOT EXISTS escrow_binding_no_delete
BEFORE DELETE ON escrow_bindings
BEGIN SELECT RAISE(ABORT, 'escrow bindings cannot be deleted to migrate funds'); END;
CREATE TABLE IF NOT EXISTS payment_attempts (
  idempotency_key TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL REFERENCES escrow_bindings(lease_id),
  provider TEXT NOT NULL,
  state TEXT NOT NULL,
  attempt_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS escrow_transactions (
  transaction_hash TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL REFERENCES payment_attempts(idempotency_key),
  stage TEXT NOT NULL,
  signed_xdr TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','confirmed','failed'))
);
