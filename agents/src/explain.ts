// explain_lease_rule: one template per rule of the contract, filled with the
// values recorded on-chain for this lease. Nothing is generated: if a rule
// is not in this table, the agent says so instead of inventing one.

import type { Lease } from "lease-vault-client";
import { usdc } from "./rules.js";

export const RULES = [
  "first_rent",
  "monthly_rent",
  "unpaid_rent",
  "end_of_lease",
  "damage_claim",
  "tenant_response",
  "arbitration",
  "dispute_bond",
  "no_keys",
  "early_seizure",
  "yield",
  "yield_loss",
  "yield_exit",
  "invest_during_lease",
  "rating",
] as const;

export type RuleId = (typeof RULES)[number];

export type Lang = "en" | "fr";

export interface Context {
  lease: Lease;
  disputeBond: bigint;
}

function duration(seconds: bigint | number): string {
  const s = Number(seconds);
  if (s % 86400 === 0) return `${s / 86400} day(s)`;
  if (s % 3600 === 0) return `${s / 3600} hour(s)`;
  if (s % 60 === 0) return `${s / 60} minute(s)`;
  return `${s} second(s)`;
}

function dureeFr(seconds: bigint | number): string {
  const s = Number(seconds);
  if (s % 86400 === 0) return `${s / 86400} jour(s)`;
  if (s % 3600 === 0) return `${s / 3600} heure(s)`;
  if (s % 60 === 0) return `${s / 60} minute(s)`;
  return `${s} seconde(s)`;
}

const pct = (bps: number) => `${bps / 100} %`;

/** Lowercase without accents, so French keywords match however they are typed. */
export const normalize = (text: string) =>
  text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’`]/g, "'");

const LABEL_FR: Record<RuleId, string> = {
  first_rent: "premier loyer",
  monthly_rent: "loyer mensuel",
  unpaid_rent: "loyer impayé",
  end_of_lease: "fin du bail",
  damage_claim: "réclamation pour dégâts",
  tenant_response: "réponse du locataire",
  arbitration: "arbitrage",
  dispute_bond: "caution de litige",
  no_keys: "clés jamais remises",
  early_seizure: "saisie anticipée",
  yield: "rendement",
  yield_loss: "perte de rendement",
  yield_exit: "sortie du rendement",
  invest_during_lease: "placement en cours de bail",
  rating: "notation",
};

export const ruleLabel = (rule: RuleId, lang: Lang = "en") => (lang === "fr" ? LABEL_FR[rule] : rule.replace(/_/g, " "));

export function explainRule(rule: RuleId, context: Context, lang: Lang = "en"): string {
  if (lang === "fr") return explainRuleFr(rule, context);
  const { lease, disputeBond } = context;
  const t = lease.terms;
  const fundShare = 10_000 - t.tenant_share_bps - t.landlord_share_bps;
  const buffer = (t.deposit * BigInt(t.buffer_bps)) / 10_000n;
  switch (rule) {
    case "first_rent":
      return (
        `When you fund the lease, the first rent (${usdc(t.rent)}) is locked with the guarantee. ` +
        `It goes to the landlord only once both of you co-sign the move-in inventory.`
      );
    case "monthly_rent":
      return (
        `Rent is ${usdc(t.rent)} every ${duration(t.period)}, for ${t.months} months. ` +
        `Each payment goes straight from the tenant to the landlord; the contract only records it.`
      );
    case "unpaid_rent":
      return (
        `If a month is not paid ${duration(t.grace)} after its due date, exactly one month (${usdc(t.rent)}) ` +
        `is paid to the landlord from the guarantee. Anyone can trigger it, the coordinator does it automatically, ` +
        `and the money can only go to the landlord. One month always stays in the contract, ` +
        `so this works instantly even when part of the guarantee is lent on Blend.`
      );
    case "end_of_lease":
      return (
        `After ${t.months} months, either party ends the lease and can record the exit inventory. ` +
        `The landlord then has ${duration(t.claim_window)} to claim damage. ` +
        `Months still unpaid are paid to the landlord first (the tenant can still pay them late). ` +
        `With no claim, anyone can then release the rest of the guarantee to the tenant.`
      );
    case "damage_claim":
      return (
        `A damage claim states an amount, comes with the hash of the evidence and a ${usdc(disputeBond)} bond. ` +
        `It can never exceed the guarantee. Everything not claimed goes back to the tenant at once.`
      );
    case "tenant_response":
      return (
        `The tenant has ${duration(t.response_window)} to answer a claim: accept it, or offer a lower amount. ` +
        `Silence counts as acceptance and anyone can then execute the claim.`
      );
    case "arbitration":
      return (
        `If the tenant counters, the landlord can accept the offer, or the arbiter named in the lease decides. ` +
        `The arbiter can only split the disputed amount between the two parties: ` +
        `the contract refuses any other destination or a larger amount. ` +
        `If the arbiter does not decide within ${duration(t.arbitration_window)}, anyone can settle halfway ` +
        `between the claim and the offer, so the guarantee can never stay locked.`
      );
    case "dispute_bond":
      return (
        `The landlord posts ${usdc(disputeBond)} with a claim. It comes back unless the arbiter awards ` +
        `less than half of the claim, in which case it goes to the arbitration fund.`
      );
    case "no_keys":
      return (
        `If both parties have not confirmed the move-in within ${duration(t.move_in_window)} of the offer, ` +
        `anyone can send everything back to the tenant.`
      );
    case "early_seizure":
      return (
        `Nobody can take the guarantee during the lease. An unpaid month goes to the landlord after the grace ` +
        `period, and claim damage only after the lease ends. Any other attempt is rejected by the contract.`
      );
    case "yield":
      return t.yield_offered
        ? `The landlord offered the yield option. If the tenant accepts, the tenant also locks a ` +
            `${pct(t.buffer_bps)} buffer (${usdc(buffer)}) and the guarantee minus one month ` +
            `(${usdc(t.deposit - t.rent)}) is lent on Blend. The return is variable and not guaranteed. ` +
            `Any gain is shared ${pct(t.tenant_share_bps)} tenant, ${pct(t.landlord_share_bps)} landlord, ` +
            `${pct(fundShare)} arbitration fund.`
        : `This lease does not offer the yield option: the whole guarantee stays in the contract.`;
    case "yield_loss":
      return (
        `If Blend loses value, the loss is absorbed first by the buffer, then by the tenant's part. ` +
        `The landlord is always paid first: unpaid rent and accepted claims come before the tenant's refund.`
      );
    case "invest_during_lease":
      return (
        `During the lease, either party can propose to lend part of the guarantee on Blend. ` +
        `The proposal says how much stays in the contract (at least one month, ${usdc(t.rent)}) and how any gain is shared. ` +
        `Nothing moves until the other party approves. The tenant locks a ${pct(t.buffer_bps)} buffer (${usdc(buffer)}) on approval; ` +
        `withdrawing the proposal gives it back. Once invested, either party can stop at any time.`
      );
    case "rating":
      return (
        `Once the lease is settled (no claim left open), the tenant and the landlord each rate the other from 1 to 5, once. ` +
        `A score always shows on the lease, but it only counts towards reputation if the lease met the minimum length ` +
        `and guarantee set for this deployment. Reputation also shows how many different parties gave the scores, ` +
        `so five stars from the same friend stand out.`
      );
    case "yield_exit":
      return (
        `The tenant or the landlord can end the yield option at any time. Anyone, including the coordinator, ` +
        `can pull the guarantee out if the Blend position loses value or the pool gets close to full use.`
      );
  }
}

/** Same templates in French, filled with the same on-chain values. */
function explainRuleFr(rule: RuleId, { lease, disputeBond }: Context): string {
  const t = lease.terms;
  const fundShare = 10_000 - t.tenant_share_bps - t.landlord_share_bps;
  const buffer = (t.deposit * BigInt(t.buffer_bps)) / 10_000n;
  switch (rule) {
    case "first_rent":
      return (
        `Au dépôt, le premier loyer (${usdc(t.rent)}) est bloqué avec la garantie. ` +
        `Il ne part au propriétaire qu'une fois l'état des lieux d'entrée co-signé par les deux parties.`
      );
    case "monthly_rent":
      return (
        `Le loyer est de ${usdc(t.rent)} par période de ${dureeFr(t.period)}, pendant ${t.months} mois. ` +
        `Chaque paiement va directement du locataire au propriétaire ; le contrat ne fait que l'enregistrer.`
      );
    case "unpaid_rent":
      return (
        `Si un mois n'est pas payé ${dureeFr(t.grace)} après son échéance, exactement un mois (${usdc(t.rent)}) ` +
        `est versé au propriétaire depuis la garantie. N'importe qui peut le déclencher, le coordinateur le fait automatiquement, ` +
        `et l'argent ne peut aller qu'au propriétaire. Un mois reste toujours dans le contrat, ` +
        `donc cela fonctionne immédiatement même quand une partie de la garantie est prêtée sur Blend.`
      );
    case "end_of_lease":
      return (
        `Après ${t.months} mois, l'une ou l'autre partie met fin au bail et peut enregistrer l'état des lieux de sortie. ` +
        `Le propriétaire a ensuite ${dureeFr(t.claim_window)} pour réclamer des dégâts. ` +
        `Les mois encore impayés sont d'abord versés au propriétaire (le locataire peut encore les payer en retard). ` +
        `Sans réclamation, n'importe qui peut alors rendre le reste de la garantie au locataire.`
      );
    case "damage_claim":
      return (
        `Une réclamation pour dégâts indique un montant, avec l'empreinte (hash) des preuves et une caution de ${usdc(disputeBond)}. ` +
        `Elle ne peut jamais dépasser la garantie. Tout ce qui n'est pas réclamé revient aussitôt au locataire.`
      );
    case "tenant_response":
      return (
        `Le locataire a ${dureeFr(t.response_window)} pour répondre à une réclamation : l'accepter, ou proposer un montant plus bas. ` +
        `Le silence vaut acceptation et n'importe qui peut alors exécuter la réclamation.`
      );
    case "arbitration":
      return (
        `Si le locataire fait une contre-proposition, le propriétaire peut l'accepter, sinon l'arbitre nommé dans le bail décide. ` +
        `L'arbitre peut seulement répartir le montant contesté entre les deux parties : ` +
        `le contrat refuse toute autre destination ou un montant plus élevé. ` +
        `Si l'arbitre ne décide pas dans un délai de ${dureeFr(t.arbitration_window)}, n'importe qui peut régler à mi-chemin ` +
        `entre la réclamation et l'offre, donc la garantie ne peut jamais rester bloquée.`
      );
    case "dispute_bond":
      return (
        `Le propriétaire dépose ${usdc(disputeBond)} avec une réclamation. Cette somme lui revient, sauf si l'arbitre accorde ` +
        `moins de la moitié de la réclamation : elle va alors au fonds d'arbitrage.`
      );
    case "no_keys":
      return (
        `Si les deux parties n'ont pas confirmé l'entrée dans les lieux dans un délai de ${dureeFr(t.move_in_window)} après l'offre, ` +
        `n'importe qui peut tout renvoyer au locataire.`
      );
    case "early_seizure":
      return (
        `Personne ne peut prendre la garantie pendant le bail. Un mois impayé va au propriétaire après le délai de grâce, ` +
        `et les dégâts ne peuvent être réclamés qu'à la fin du bail. Toute autre tentative est rejetée par le contrat.`
      );
    case "yield":
      return t.yield_offered
        ? `Le propriétaire a proposé l'option rendement. Si le locataire l'accepte, il bloque aussi une ` +
            `réserve de ${pct(t.buffer_bps)} (${usdc(buffer)}) et la garantie moins un mois ` +
            `(${usdc(t.deposit - t.rent)}) est prêtée sur Blend. Le rendement est variable et non garanti. ` +
            `Tout gain est partagé : ${pct(t.tenant_share_bps)} locataire, ${pct(t.landlord_share_bps)} propriétaire, ` +
            `${pct(fundShare)} fonds d'arbitrage.`
        : `Ce bail ne propose pas l'option rendement : toute la garantie reste dans le contrat.`;
    case "yield_loss":
      return (
        `Si Blend perd de la valeur, la perte est absorbée d'abord par la réserve, puis par la part du locataire. ` +
        `Le propriétaire est toujours payé en premier : loyers impayés et réclamations acceptées passent avant le remboursement du locataire.`
      );
    case "invest_during_lease":
      return (
        `Pendant le bail, chaque partie peut proposer de prêter une partie de la garantie sur Blend. ` +
        `La proposition indique combien reste dans le contrat (au moins un mois, ${usdc(t.rent)}) et comment le gain est partagé. ` +
        `Rien ne bouge tant que l'autre partie n'a pas approuvé. Le locataire bloque une réserve de ${pct(t.buffer_bps)} (${usdc(buffer)}) à l'approbation ; ` +
        `retirer la proposition la lui rend. Une fois placé, chaque partie peut arrêter à tout moment.`
      );
    case "rating":
      return (
        `Une fois le bail soldé (aucune réclamation en cours), le locataire et le propriétaire se notent mutuellement de 1 à 5, une seule fois. ` +
        `La note s'affiche toujours sur le bail, mais ne compte pour la réputation que si le bail a atteint la durée minimale ` +
        `et la garantie fixées pour ce déploiement. La réputation montre aussi combien de parties différentes ont noté, ` +
        `donc cinq étoiles données par le même ami se remarquent.`
      );
    case "yield_exit":
      return (
        `Le locataire ou le propriétaire peut mettre fin à l'option rendement à tout moment. N'importe qui, y compris le coordinateur, ` +
        `peut retirer la garantie si la position Blend perd de la valeur ou si le pool est presque entièrement utilisé.`
      );
  }
}

// French keywords, matched on accent-free text before the English table.
const TABLE_FR: [RegExp, RuleId][] = [
  [/saisi|prendre (toute|tout|la totalite)|garder (toute )?(la|ma) (caution|garantie)|confisqu/, "early_seizure"],
  [/impaye|retard|manque|oubli/, "unpaid_rent"],
  [/premier loyer|entree dans les lieux|remise des cles|etat des lieux d'entree/, "first_rent"],
  [/pas (eu|recu) (les )?cles|jamais emmenage|rembours/, "no_keys"],
  [/caution (de|du) litige|consign/, "dispute_bond"],
  [/degat|dommage|degradation|reclam/, "damage_claim"],
  [/repond|reponse|contre.?(offre|proposition)/, "tenant_response"],
  [/arbitr|juge|media|litige|conflit/, "arbitration"],
  [/\bnot(e|er|es|ation)\b|avis|reputation|etoile/, "rating"],
  [/propos|approuv|invest|placer|placement/, "invest_during_lease"],
  [/perd|perte|pirat|risque/, "yield_loss"],
  [/arret|stopper|sortir|desactiv/, "yield_exit"],
  [/rendement|interet|blend|inflation|gagn|rapporte/, "yield"],
  [/fin (du|de) bail|quitter|demenag|recuper|rend|restitu|caution|garantie|depot/, "end_of_lease"],
  [/loyer|pay|paie|mensualit/, "monthly_rent"],
];

/** Picks the rule that answers a free-form keyword, deterministically. */
export function ruleFor(topic: string, lang: Lang = "en"): RuleId | undefined {
  if (lang === "fr") {
    const fr = TABLE_FR.find(([re]) => re.test(normalize(topic)))?.[1];
    if (fr) return fr;
  }
  const k = topic.toLowerCase();
  const table: [RegExp, RuleId][] = [
    [/seiz|take (all|the whole)|grab|now/, "early_seizure"],
    [/unpaid|late|overdue|miss/, "unpaid_rent"],
    [/first|move.?in|keys? hand/, "first_rent"],
    [/no keys|never moved|refund/, "no_keys"],
    [/damage|claim/, "damage_claim"],
    [/answer|respond|counter|reply/, "tenant_response"],
    [/arbit|judge|mediat|dispute/, "arbitration"],
    [/bond/, "dispute_bond"],
    [/rate|rating|review|reputation|star|score/, "rating"],
    [/propose|approve|invest|reserve|keep/, "invest_during_lease"],
    [/lose|loss|hack|risk/, "yield_loss"],
    [/stop|exit|withdraw|opt.?out/, "yield_exit"],
    [/yield|interest|blend|inflation|earn/, "yield"],
    [/end|leave|move.?out|return|deposit back/, "end_of_lease"],
    [/rent|pay/, "monthly_rent"],
  ];
  return table.find(([re]) => re.test(k))?.[1];
}
