import { scopeKey, type Attempt, type AttemptStore, type Scope } from './domain'

export function browserAttemptStore(storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): AttemptStore {
  const key = (scope: Scope) => `fiavel.funding.v1:${scopeKey(scope)}`
  return {
    load(scope) {
      const text = storage.getItem(key(scope))
      if (!text) return null
      const attempt = JSON.parse(text) as Attempt
      if (attempt.version !== 1 || scopeKey(attempt.scope) !== scopeKey(scope) || !/^\d+$/.test(attempt.required) || !/^\d+$/.test(attempt.receive) || !/^\d+$/.test(attempt.sourceMax) || typeof attempt.acceptYield !== 'boolean' || !/^\d+$/.test(attempt.createdAt) || !['reviewed', 'swap-pending', 'swap-confirmed', 'fund-pending', 'funded', 'swap-failed', 'fund-failed'].includes(attempt.stage)) throw new Error('Saved payment data is invalid. Do not start another swap; inspect the wallet and transaction history.')
      for (const tx of [attempt.swap, attempt.fund]) if (tx && (!/^[a-f0-9]{64}$/.test(tx.hash) || typeof tx.xdr !== 'string' || tx.xdr.length > 100000 || !Number.isSafeInteger(tx.expires))) throw new Error('Saved transaction reference is invalid.')
      return attempt
    },
    save(attempt) {
      // Keep an append-only reference journal as well as the latest attempt. No keys.
      // Storage errors propagate BEFORE submission; silently losing recovery data is unsafe.
      const journalKey = `${key(attempt.scope)}:transactions`
      const refs = JSON.parse(storage.getItem(journalKey) ?? '[]') as { hash: string; kind: string; xdr: string; expires: number }[]
      for (const kind of ['swap', 'fund'] as const) {
        const tx = attempt[kind]
        if (tx && !refs.some(ref => ref.hash === tx.hash)) refs.push({ ...tx, kind })
      }
      storage.setItem(journalKey, JSON.stringify(refs))
      storage.setItem(key(attempt.scope), JSON.stringify(attempt))
    },
  }
}
