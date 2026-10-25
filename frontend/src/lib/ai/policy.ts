import type { Intent, Language, Turn } from './context.ts'

export const intents: Intent[] = ['payment', 'deposit', 'blockchain', 'lease', 'dispute', 'evidence', 'draft', 'arbitration', 'operations', 'privacy', 'safety', 'unrelated']
const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export function detectLanguage(question: string, fallback: Language): Language {
  if (/\b(francais|french)\b/.test(normalize(question))) return 'fr'
  if (/\b(english|anglais)\b/.test(normalize(question))) return 'en'
  if (/\b(mon|ma|mes|loyer|caution|bail|preuves|litige|bonjour|quand|combien|puis|proprietaire|locataire|et|pourquoi|ecris|redige|arbitre)\b/.test(normalize(question))) return 'fr'
  return fallback
}

export function classify(question: string, history: Turn[] = []): Intent {
  const q = normalize(question)
  // These checks run before any provider and cannot be overridden by its output.
  if (/\b(other|another|autre)\b.*\b(tenant|locataire|private|prive|message|dispute|litige)\b|\b(secret|api key|system prompt)\b|(?:show|reveal|affiche|montre).*\b(private|prive)\b/.test(q)) return 'privacy'
  if (/ignore.*(instruction|rule|regle)|\b(sign|submit|execute|transfer|send funds|release.*(now|immediately)|libere|signe|transfere)\b/.test(q)) return 'safety'
  if (/stellar|soroban|blockchain|on.chain|funded|finance.*reseau/.test(q)) return 'blockchain'
  if (/arbitrat|arbitre|appel|appeal/.test(q)) return 'arbitration'
  if (/draft|write|respond|reply|redig|ecri|repond|message|communication/.test(q)) return 'draft'
  if (/evidence|preuve|photo|invoice|facture|document.*(analy|review)|analy.*document/.test(q)) return 'evidence'
  if (/claim|disput|damage|litige|degat|reclam/.test(q)) return 'dispute'
  if (/deposit|release|caution|garantie|depot|rembours/.test(q)) return 'deposit'
  if (/portfolio|operations|active leases|baux|outstanding|deadlines/.test(q)) return 'operations'
  if (/\b(pay|payment|payments|rent|coming|due|paid|loyer|paiement|paye|echeance)\b/.test(q)) return 'payment'
  if (/lease|summari|bail|resum|clause|condition|obligation/.test(q)) return 'lease'
  if (/^(and |what about|how much|when|why|et |combien|quand|pourquoi|tell me more|continue)/.test(q)) {
    return [...history].reverse().find(turn => turn.intent && !['unrelated', 'safety', 'privacy'].includes(turn.intent))?.intent ?? 'unrelated'
  }
  return 'unrelated'
}

export function requestedAmount(question: string): number | null {
  const match = question.match(/(?:€\s*([\d][\d.,\s\u202f\u00a0]*)|([\d][\d.,\s\u202f\u00a0]*)\s*(?:€|EUR|euros?))/i)
  if (!match) return null
  let raw = (match[1] ?? match[2]).trim().replace(/[\s\u202f\u00a0]/g, '')
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(raw)) raw = raw.replace(/[.,]/g, '')
  else if (/^\d{1,3}(?:[.,]\d{3})+[.,]\d{1,2}$/.test(raw)) {
    const last = Math.max(raw.lastIndexOf(','), raw.lastIndexOf('.'))
    raw = raw.slice(0, last).replace(/[.,]/g, '') + '.' + raw.slice(last + 1)
  } else if (/^\d+(?:[.,]\d{1,2})?$/.test(raw)) raw = raw.replace(',', '.')
  else return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 && value <= 999999.99 ? value : null
}

export function conversationAmount(question: string, history: Turn[]) {
  return requestedAmount(question) ?? [...history].reverse().filter(turn => turn.role === 'user').map(turn => requestedAmount(turn.text)).find(value => value !== null) ?? null
}
