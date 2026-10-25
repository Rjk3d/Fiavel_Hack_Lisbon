// Host-owned durable storage. Nothing here is imported into the browser bundle.
import { readFileSync } from 'node:fs'
export function sqliteBindingStore(db) {
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
  return {
    get(id) { const row = db.prepare('SELECT record_json FROM escrow_bindings WHERE lease_id = ?').get(id); return row ? JSON.parse(row.record_json) : null },
    insert(b) { db.prepare('INSERT INTO escrow_bindings (lease_id,provider,provider_escrow_id,contract_id,network,token,expected_deposit,required_funding,locked,record_json) VALUES (?,?,?,?,?,?,?,?,?,?)').run(b.leaseId,b.provider,b.providerEscrowId,b.contractId,b.network,b.asset.contractId,b.expectedDeposit,b.requiredFunding,Number(b.locked),JSON.stringify(b)) },
    update(b) {
      const result = db.prepare('UPDATE escrow_bindings SET provider=?,provider_escrow_id=?,contract_id=?,network=?,token=?,expected_deposit=?,required_funding=?,locked=?,record_json=? WHERE lease_id=?').run(b.provider,b.providerEscrowId,b.contractId,b.network,b.asset.contractId,b.expectedDeposit,b.requiredFunding,Number(b.locked),JSON.stringify(b),b.leaseId)
      if (result.changes !== 1) throw new Error('Escrow binding missing.')
    },
  }
}
export function sqliteAttemptStore(db) {
  return {
    get(key) { const row = db.prepare('SELECT attempt_json FROM payment_attempts WHERE idempotency_key=?').get(key); return row ? JSON.parse(row.attempt_json) : null },
    save(key, binding, state, attempt, refs = []) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const row = db.prepare('SELECT provider FROM escrow_bindings WHERE lease_id=?').get(binding.leaseId)
        if (!row || row.provider !== binding.provider) throw new Error('Funding provider must be bound first.')
        const existing = db.prepare('SELECT lease_id,provider FROM payment_attempts WHERE idempotency_key=?').get(key)
        if (existing && (existing.lease_id !== binding.leaseId || existing.provider !== binding.provider)) throw new Error('Idempotency key belongs to another escrow.')
        db.prepare('INSERT INTO payment_attempts (idempotency_key,lease_id,provider,state,attempt_json) VALUES (?,?,?,?,?) ON CONFLICT(idempotency_key) DO UPDATE SET state=excluded.state,attempt_json=excluded.attempt_json,updated_at=CURRENT_TIMESTAMP').run(key,binding.leaseId,binding.provider,state,JSON.stringify(attempt))
        for (const ref of refs) {
          const old = db.prepare('SELECT idempotency_key,signed_xdr FROM escrow_transactions WHERE transaction_hash=?').get(ref.hash)
          if (old && (old.idempotency_key !== key || old.signed_xdr !== ref.xdr)) throw new Error('Transaction reference collision.')
          db.prepare('INSERT INTO escrow_transactions (transaction_hash,idempotency_key,stage,signed_xdr,status) VALUES (?,?,?,?,?) ON CONFLICT(transaction_hash) DO UPDATE SET status=excluded.status').run(ref.hash,key,ref.kind,ref.xdr,ref.status)
        }
        db.exec('COMMIT')
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
  }
}
