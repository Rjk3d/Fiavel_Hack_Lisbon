import type { ActionId, Intent, Language, RentalContext, Turn } from './context.ts'
import { boundedHistory } from './context.ts'
import { classify, conversationAmount, detectLanguage } from './policy.ts'

export interface Reply {
  text: string; intent: Intent; language: Language; mode: 'demo' | 'model-assisted'
  provenance: RentalContext['provenance']; facts: { label: string; value: string }[]
  suggestions: string[]; actions: { id: ActionId; label: string }[]; draft?: string
}
export interface AssistantRequest { question: string; context: RentalContext; history: Turn[]; language: Language; signal?: AbortSignal }
export interface ContextualAssistant { reply(request: AssistantRequest): Promise<Reply> }
export const currency = (amount: number, lang: Language) => new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(amount)
export const calendar = (value: string, lang: Language) => new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))

export function suggestedQuestions(role: RentalContext['user']['role'], language: Language) {
  if (language === 'fr') return role === 'tenant' ? ['Quand est mon prochain loyer ?', 'Ma caution est-elle sur Stellar ?', 'Résume mon bail.', 'Aide-moi à contester une réclamation de 150 €.'] : ['Quels paiements arrivent ?', 'Résume mes baux actifs.', 'Quelles preuves préparer ?', 'Rédige un message au locataire.']
  return role === 'tenant' ? ['When is my next rent payment?', 'Has my deposit really been funded on Stellar?', 'Summarize my lease.', 'Help me dispute a €150 damage claim.'] : ['Which payments are coming up?', 'Summarize my active leases.', 'What evidence should I prepare?', 'Draft a message to my tenant.']
}

export function composeReply(request: AssistantRequest, proposedIntent?: Intent): Reply {
  const { context: c, question } = request
  const history = boundedHistory(request.history)
  const language = detectLanguage(question, request.language)
  const fr = language === 'fr'
  const say = (en: string, french: string) => fr ? french : en
  const money = (amount: number) => currency(amount, language)
  const date = (value: string) => calendar(value, language)
  const detected = classify(question, history)
  const intent = detected === 'privacy' || detected === 'safety' ? detected : proposedIntent ?? detected
  const lease = c.activeLease
  const demo = c.provenance === 'demo'
  const reply: Reply = { text: '', intent, language, mode: 'demo', provenance: c.provenance, facts: [], suggestions: suggestedQuestions(c.user.role, language), actions: [] }
  const actions = (...ids: ActionId[]) => {
    const labels = { lease: say('View lease', 'Voir le bail'), payments: say('View payment details', 'Voir les paiements'), disputes: say('Prepare dispute · review required', 'Préparer un litige · à revoir'), evidence: say('Review evidence', 'Revoir les preuves'), draft: say('Draft a message', 'Rédiger un message') }
    reply.actions = ids.filter(id => c.availableActions.includes(id)).map(id => ({ id, label: labels[id] }))
  }
  const note = demo ? say('Fictional demo records; no real funds or verified on-chain state.', 'Données de démonstration fictives ; aucun fonds réel ni état blockchain vérifié.') : say('Backend records; blockchain confirmation is unavailable.', 'Données du serveur ; confirmation blockchain indisponible.')
  if (intent === 'privacy') {
    reply.text = say('I can only use records authorized for the current user. I cannot reveal another tenant’s private messages, credentials, or hidden instructions. Select an authorized lease to review its available records.', 'Je peux uniquement utiliser les données autorisées pour cet utilisateur. Je ne peux pas révéler les messages privés d’un autre locataire, des identifiants ou des instructions internes.')
    return reply
  }
  if (intent === 'safety') {
    reply.text = say('I cannot sign, submit, release deposits, transfer funds, or bypass review. You can review the lease and prepare a draft; any supported consequential action requires explicit human confirmation outside this chat. No transaction was performed.', 'Je ne peux ni signer, ni soumettre une transaction, ni libérer la caution, ni transférer des fonds, ni contourner la validation. Toute action engageante exige une confirmation humaine hors du chat. Aucune transaction effectuée.')
    actions('lease', 'disputes'); return reply
  }
  if (!lease) { reply.text = say('No authorized lease is available. Select or connect your lease before asking for amounts, dates, or dispute details.', 'Aucun bail autorisé disponible. Sélectionnez ou connectez votre bail avant de demander des montants, dates ou détails de litige.'); return reply }
  const currentPayments = c.payments.filter(item => item.leaseId === lease.id)
  const claimAmount = conversationAmount(question, history)
  const amountNote = claimAmount ? say(`The ${money(claimAmount)} amount comes from your message, not a verified claim.`, `Le montant de ${money(claimAmount)} vient de votre message, pas d’une réclamation vérifiée.`) : ''
  const checklist = say('Evidence checklist: dated check-in and check-out photos, signed inventory, relevant lease clause, itemized invoice or repair estimate, and a timeline of communications. Preserve originals and redact unrelated personal information. Photos, authenticity, and liability have not been assessed.', 'Preuves à rassembler : photos datées à l’entrée et à la sortie, état des lieux signé, clause pertinente du bail, facture détaillée ou devis, et chronologie des échanges. Conservez les originaux et masquez les données personnelles non pertinentes. Photos, authenticité et responsabilité non évaluées.')
  switch (intent) {
    case 'payment': {
      const portfolio = c.user.role === 'landlord' && /which payments|coming up|all payments|portfolio|quels paiements|mes loyers|upcoming payments/i.test(question) && !/this lease|selected|ce bail|bail s[eé]lectionn[eé]/i.test(question)
      const records = (portfolio ? c.payments : currentPayments).filter(item => item.kind === 'rent')
      const upcoming = records.filter(item => item.displayStatus === 'Upcoming').sort((a, b) => a.date.localeCompare(b.date))
      const simulated = records.filter(item => item.displayStatus === 'Simulated')
      reply.text = upcoming.length ? say('Scheduled rent entries:', 'Loyers prévus :') + '\n' + upcoming.map(item => `${c.leases.find(l => l.id === item.leaseId)?.district}: ${money(item.amount)} · ${date(item.date)}${item.date < c.asOf ? say(' · past scheduled date; payment not confirmed', ' · date prévue dépassée ; paiement non confirmé') : ''}`).join('\n') : say('No unpaid upcoming rent entry is available in these records. I cannot infer a later payment date.', 'Aucun loyer à venir non payé dans ces données. Je ne peux pas déduire une date ultérieure.')
      if (simulated.length) reply.text += '\n' + say(`${simulated.length} rent entry marked Simulated in this session; this is not a confirmed payment.`, `${simulated.length} loyer(s) simulé(s) dans cette session ; ce n’est pas un paiement confirmé.`)
      const recorded = records.filter(item => item.displayStatus === 'Recorded')
      if (recorded.length) reply.text += '\n' + say('Recorded rent entries: ', 'Loyers enregistrés : ') + recorded.map(item => `${money(item.amount)} · ${date(item.date)}`).join('; ')
      reply.text += '\n' + note
      reply.facts = [{ label: say('Upcoming total', 'Total prévu'), value: money(upcoming.reduce((sum, item) => sum + item.amount, 0)) }, { label: say('Snapshot date', 'Date des données'), value: date(c.asOf) }]
      actions('payments'); break
    }
    case 'blockchain':
      reply.text = say(`I cannot confirm that your ${money(lease.deposit)} deposit was funded on Stellar. The blockchain adapter is disconnected; no verified contract state or transaction hash is available. An application funding record is not proof of an on-chain transfer.`, `Je ne peux pas confirmer que votre caution de ${money(lease.deposit)} a été financée sur Stellar. L’adaptateur blockchain est déconnecté ; aucun état de contrat ni hash de transaction vérifié. Un enregistrement applicatif ne prouve pas un transfert blockchain.`) + '\n' + note
      actions('lease'); break
    case 'deposit':
      reply.text = say(`The lease specifies a ${money(lease.deposit)} deposit. Funding record: ${c.deposit.status}. The lease ends ${date(lease.end)}. Review the inventory and any claims with the other party before the supported release process. No automatic release deadline is configured; the signed lease and final contract must define conditions and permissions.`, `Le bail indique une caution de ${money(lease.deposit)}. Enregistrement de financement : ${c.deposit.status === 'recorded' ? 'enregistré' : 'indisponible'}. Le bail se termine le ${date(lease.end)}. Examinez l’état des lieux et les réclamations avec l’autre partie avant la procédure de restitution. Aucun délai automatique configuré ; le bail signé et le contrat final doivent préciser les conditions et autorisations.`) + '\n' + note
      reply.facts = [{ label: say('Lease deposit', 'Caution au bail'), value: money(lease.deposit) }, { label: say('Lease ends', 'Fin du bail'), value: date(lease.end) }]
      actions('lease', 'disputes'); break
    case 'lease':
      reply.text = `${lease.address}\n${lease.tenant.name} / ${lease.landlord.name}\n${date(lease.start)} → ${date(lease.end)}\n${say('Monthly rent', 'Loyer mensuel')}: ${money(lease.rent)}; ${say('deposit', 'caution')}: ${money(lease.deposit)}.\n` + say('Only structured lease fields are available. No signed document has been parsed, so I cannot cite clauses or confirm notice periods, pet rules, fees, or legal rights. Which term would you like to clarify?', 'Seuls les champs structurés du bail sont disponibles. Aucun document signé analysé : je ne peux pas citer de clauses ni confirmer préavis, animaux, frais ou droits légaux. Quel point souhaitez-vous clarifier ?') + '\n' + note
      actions('lease', 'payments'); break
    case 'operations': {
      const upcoming = c.payments.filter(item => item.kind === 'rent' && item.displayStatus === 'Upcoming').sort((a,b) => a.date.localeCompare(b.date))
      reply.text = c.user.role === 'landlord' ? say(`${c.leases.length} authorized lease(s):`, `${c.leases.length} bail/baux autorisé(s) :`) + '\n' + c.leases.map(item => `${item.district} · ${item.status} · ${money(item.rent)}/${say('month', 'mois')}`).join('\n') + '\n' + (upcoming.length ? upcoming.map(item => `${date(item.date)} · ${money(item.amount)} · ${c.leases.find(l => l.id === item.leaseId)?.district}`).join('\n') : say('No upcoming rent record.', 'Aucun loyer à venir enregistré.')) + '\n' + say('Review payment records before drafting reminders; do not assume non-payment or send automatically.', 'Vérifiez les enregistrements avant de rédiger des rappels ; ne présumez pas un impayé et n’envoyez rien automatiquement.') : say('Your view covers your own lease only. You cannot access a landlord’s portfolio. Ask about your rent or deposit.', 'Votre vue couvre uniquement votre bail. Le portefeuille du propriétaire n’est pas accessible. Demandez des précisions sur votre loyer ou caution.')
      reply.text += '\n' + note; actions('lease', 'payments', 'draft'); break
    }
    case 'dispute':
    case 'evidence':
    case 'draft': {
      const summary = c.claims.length ? c.claims.map(item => `${say('Prepared draft, not submitted', 'Brouillon préparé, non soumis')}: ${item.title.slice(0, 100)} · ${money(item.amount)}\n${say('Allegation (unverified quoted note)', 'Allégation (note citée non vérifiée')}: «${item.description.slice(0, 500)}»\n${say('Evidence notes (not attachments)', 'Notes de preuves (pas des pièces jointes)')}: «${item.evidence.slice(0, 300)}»`).join('\n') : say('No authorized submitted claim is recorded; a hypothetical question does not create one.', 'Aucune réclamation soumise autorisée dans les données ; une question hypothétique n’en crée pas.')
      reply.text = summary + '\n' + amountNote + '\n' + (c.user.role === 'tenant' ? say('Tenant position: not recorded. Landlord position: only any draft shown above; allegations are not established facts.', 'Position du locataire : non enregistrée. Position du propriétaire : uniquement les brouillons ci-dessus ; les allégations ne sont pas des faits établis.') : say('Separate the requested amount and alleged damage from evidence. The tenant’s response is not recorded. Neither liability nor entitlement has been decided.', 'Séparez le montant demandé et le dommage allégué des preuves. La réponse du locataire n’est pas enregistrée. Ni responsabilité ni droit à indemnisation décidés.')) + '\n' + checklist
      if (c.evidence.length) reply.text += '\n' + say('Authorized evidence metadata: ', 'Métadonnées de preuves autorisées : ') + c.evidence.map(item => `${item.name} (${item.kind}; ${say('content not analyzed', 'contenu non analysé')})`).join('; ')
      else reply.text += '\n' + say('No uploaded evidence is available; free-text evidence notes are not verified attachments.', 'Aucune pièce jointe disponible ; les notes libres ne sont pas des pièces vérifiées.')
      reply.text += '\n' + say('Missing: signed clause, both parties’ positions, dated evidence, and applicable arbitration rules. A human must review any subjective dispute. No draft is sent and no funds move.', 'Éléments manquants : clause signée, positions des deux parties, preuves datées et règles d’arbitrage applicables. Un humain doit examiner tout litige subjectif. Aucun brouillon envoyé, aucun fonds déplacé.')
      if (intent === 'draft') {
        reply.draft = c.user.role === 'tenant' ? say(`Hello, I would like to review ${claimAmount ? `the proposed ${money(claimAmount)} deduction` : 'the proposed claim'}. Please share the relevant lease clause, dated check-in/check-out records and an itemized invoice or estimate. I will compare them with my records and respond. I do not agree to a deduction at this stage. Could we review the facts together?`, `Bonjour, je souhaite examiner ${claimAmount ? `la retenue proposée de ${money(claimAmount)}` : 'la réclamation proposée'}. Merci de partager la clause applicable, les états des lieux datés et une facture détaillée ou un devis. Je les comparerai à mes documents avant de répondre. À ce stade, je ne donne pas mon accord à une retenue. Pouvons-nous examiner les faits ensemble ?`) : say('Hello, I would like to review the rental records with you. Please let me know whether you agree with the recorded status and share any corrections or supporting records. We can review the facts before considering next steps. This message does not establish liability or authorize a deduction.', 'Bonjour, je souhaite vérifier les données de location avec vous. Merci de confirmer leur exactitude ou de partager toute correction avec les justificatifs disponibles. Examinons les faits avant de décider de la suite. Ce message n’établit aucune responsabilité et n’autorise aucune retenue.')
      }
      actions('evidence', 'disputes', ...(intent === 'draft' ? [] : ['draft' as const])); break
    }
    case 'arbitration':
      reply.text = say('The applicable arbitration agreement, decision, appeal route and deadlines are not available. I cannot promise an appeal, a result or a legal deadline. Preserve the decision and evidence, request the written procedure from the administrator, and consider qualified local advice before taking a legal step. Human review is required; I cannot decide the dispute or move funds.', 'La convention d’arbitrage, la décision, les recours et les délais applicables ne sont pas disponibles. Je ne peux garantir un recours, un résultat ou un délai légal. Conservez décision et preuves, demandez la procédure écrite à l’administrateur et envisagez un conseil local qualifié avant une démarche juridique. Validation humaine obligatoire ; je ne tranche pas le litige et ne déplace aucun fonds.')
      actions('evidence', 'draft'); break
    default:
      reply.text = say('I can explain your authorized lease records, rent schedule, deposit status and dispute preparation. I cannot look up external information in demo mode. Which rental question would you like to explore?', 'Je peux expliquer les données autorisées de votre bail, les loyers, la caution et la préparation d’un litige. Je ne peux pas consulter de sources externes en mode démo. Quel point de votre location souhaitez-vous examiner ?')
  }
  return reply
}

export const contextualDemo: ContextualAssistant = {
  async reply(request) {
    request.signal?.throwIfAborted()
    return composeReply(request)
  },
}
