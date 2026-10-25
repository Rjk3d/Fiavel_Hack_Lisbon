import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Bot,
  CalendarClock,
  Check,
  FileSignature,
  Handshake,
  KeyRound,
  Menu,
  Scale,
  ShieldCheck,
  Sparkles,
  Sprout,
  Star,
  Lock,
  Building2,
  Wallet,
  X,
} from 'lucide-react'
import { Logo } from '../components/ui/misc'
import { ButtonLink } from '../components/ui/Button'
import { Pill } from '../components/ui/Pill'
import { AgentMark } from '../components/ai/AgentMark'
import { PhonePreview } from '../components/landing/PhonePreview'
import { LANDLORD_PROMPTS, TENANT_PROMPTS } from '../lib/demo-agent'
import { cx } from '../lib/cx'

const LINKS = [
  { href: '#product', label: 'Product' },
  { href: '#how', label: 'How it works' },
  { href: '#tenants', label: 'For tenants' },
  { href: '#landlords', label: 'For landlords' },
]

export function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-white">
      <PublicNav />
      <Hero />
      <Problem />
      <HowItWorks />
      <TwoWayTrust />
      <Agents />
      <Trust />
      <FinalCTA />
      <Footer />
    </div>
  )
}

function PublicNav() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <header className={cx('sticky top-0 z-40 transition-colors', scrolled ? 'border-b border-line/70 bg-white/85 backdrop-blur-xl' : 'bg-white')}>
      <div className="mx-auto flex h-[68px] max-w-[1200px] items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link to="/" aria-label="Fiável home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="rounded-full px-3.5 py-2 text-[14px] font-medium text-ink-muted transition hover:bg-canvas hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex-1" />
        <Pill tone="brand" dot className="hidden sm:inline-flex">
          Testnet demo
        </Pill>
        <Link to="/welcome" className="hidden rounded-full px-3.5 py-2 text-[14px] font-medium text-ink-muted transition hover:bg-canvas hover:text-ink sm:inline-flex">
          Sign in
        </Link>
        <ButtonLink to="/app" size="sm" className="hidden sm:inline-flex">
          Explore demo
        </ButtonLink>
        <button onClick={() => setOpen(true)} className="-mr-2 grid h-10 w-10 place-items-center rounded-full hover:bg-canvas lg:hidden" aria-label="Open menu">
          <Menu size={21} />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 animate-fade bg-ink/35" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 top-0 animate-rise rounded-b-xl3 bg-white p-5 shadow-lift">
            <div className="flex items-center justify-between">
              <Logo />
              <button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-canvas" aria-label="Close menu" autoFocus>
                <X size={20} />
              </button>
            </div>
            <nav className="mt-4 flex flex-col" aria-label="Main">
              {LINKS.map((l) => (
                <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-2xl px-3 py-3.5 text-[17px] font-medium hover:bg-canvas">
                  {l.label}
                </a>
              ))}
            </nav>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
              <Pill tone="brand" dot>
                Testnet demo
              </Pill>
              <ButtonLink to="/app">Explore demo</ButtonLink>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

function Hero() {
  return (
    <section id="product" className="relative scroll-mt-20">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-gradient-to-b from-canvas to-white" aria-hidden />
      <div className="relative mx-auto grid max-w-[1200px] items-center gap-14 px-4 pb-20 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10 lg:px-8 lg:pb-28 lg:pt-20">
        <div className="animate-rise">
          <p className="eyebrow">The future of renting</p>
          <h1 className="mt-5 text-[48px] font-semibold leading-[0.98] tracking-[-0.045em] sm:text-[68px] lg:text-[76px]">
            Your deposit.
            <br />
            <span className="text-brand">Protected by design.</span>
          </h1>
          <p className="mt-6 max-w-[34rem] text-[18px] leading-[28px] text-ink-muted">
            Rent with confidence. Fiável helps tenants and landlords manage rental agreements, understand their obligations, and protect deposits
            through transparent rules and Stellar blockchain technology.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink to="/app" size="lg" iconRight={<ArrowRight size={18} />}>
              Explore the demo
            </ButtonLink>
            <a href="#how" className="inline-flex h-[52px] items-center justify-center rounded-full border border-line px-7 text-[16px] font-semibold text-ink transition hover:border-brand/30 hover:bg-brand-tint">
              See how it works
            </a>
          </div>
          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-[14px] text-ink-muted">
            {['Deposit rules both sides can read', 'AI that explains, never decides', 'Built for Lisbon rentals'].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-tint text-brand">
                  <Check size={12} strokeWidth={3} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="animate-rise [animation-delay:120ms]">
          <PhonePreview />
        </div>
      </div>
    </section>
  )
}

function Problem() {
  return (
    <section className="bg-canvas py-20 sm:py-28">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <SectionTitle eyebrow="The problem" title="Renting runs on two fears." sub="Both are reasonable. Both come from the same place: rules nobody can see and records nobody shares." />
        <div className="mt-12 grid gap-5 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch">
          <Side
            id="tenants"
            icon={<KeyRound size={20} />}
            who="Tenants"
            fear="“Will I ever see my deposit again?”"
            body="Two months of rent, handed over on trust, often in a new city and a new language."
            gets={['Your deposit held under rules both sides signed', 'Clear dates: when it comes back and why', 'A Tenant Guardian that explains every clause']}
          />
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-3 rounded-full bg-white px-5 py-3 shadow-card lg:flex-col lg:rounded-xl3 lg:px-4 lg:py-6">
              <Handshake size={22} className="text-brand" />
              <p className="text-[13px] font-semibold text-ink lg:w-[110px] lg:text-center">Shared rules, one transparent record</p>
            </div>
          </div>
          <Side
            id="landlords"
            icon={<Building2 size={20} />}
            who="Landlords"
            fear="“Will rent arrive on time, and can I prove damage?”"
            body="Small landlords juggle transfers, chase late payments and lose disputes for lack of evidence."
            gets={['Every payment tracked and confirmed', 'Deadlines and inspections in one place', 'A Landlord Assistant that prepares well-evidenced claims']}
          />
        </div>
      </div>
    </section>
  )
}

function Side({ id, icon, who, fear, body, gets }: { id: string; icon: ReactNode; who: string; fear: string; body: string; gets: string[] }) {
  return (
    <article id={id} className="card scroll-mt-24 p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-tint text-brand">{icon}</span>
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">For {who.toLowerCase()}</p>
      </div>
      <p className="mt-6 text-[24px] font-semibold leading-[31px] tracking-[-0.02em]">{fear}</p>
      <p className="mt-3 text-[15px] leading-[24px] text-ink-muted">{body}</p>
      <ul className="mt-6 space-y-3 border-t border-line pt-6">
        {gets.map((g) => (
          <li key={g} className="flex gap-3 text-[15px]">
            <Check size={18} className="mt-0.5 shrink-0 text-brand" strokeWidth={2.5} />
            {g}
          </li>
        ))}
      </ul>
    </article>
  )
}

function HowItWorks() {
  const steps = [
    { icon: <FileSignature size={22} />, title: 'Create the lease', body: 'Tenant and landlord agree on rent, deposit, dates and the rules for its release. Both see the same terms.' },
    { icon: <ShieldCheck size={22} />, title: 'Protect the deposit', body: 'The deposit is held under those rules. Neither side can move it alone while the lease is running.' },
    { icon: <Scale size={22} />, title: 'Resolve the next step transparently', body: 'At the end: no claim, automatic release. A claim? Itemised, evidenced, answered — with humans for real disputes.' },
  ]
  return (
    <section id="how" className="scroll-mt-16 py-20 sm:py-28">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <SectionTitle eyebrow="How it works" title="Three steps. No surprises." />
        <ol className="relative mt-14 grid gap-10 md:grid-cols-3 md:gap-6">
          <div className="absolute left-[calc(16.66%)] right-[calc(16.66%)] top-7 hidden h-0.5 bg-gradient-to-r from-brand via-brand-soft to-brand-tint md:block" aria-hidden />
          {steps.map((s, i) => (
            <li key={s.title} className="relative flex gap-5 md:flex-col md:items-center md:text-center">
              <span className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand text-white shadow-brand">
                {s.icon}
                <span className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-white text-[12px] font-semibold text-brand ring-2 ring-brand-tint">
                  {i + 1}
                </span>
              </span>
              <div>
                <h3 className="text-[20px] font-semibold tracking-[-0.01em] md:mt-6">{s.title}</h3>
                <p className="mt-2 max-w-[32ch] text-[15px] leading-[24px] text-ink-muted md:mx-auto">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function TwoWayTrust() {
  return (
    <section id="features" className="scroll-mt-16 border-t border-line py-20 sm:py-28">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <SectionTitle
          eyebrow="Built into the contract"
          title="Trust that works both ways."
          sub="Two features enforced by the contract on Stellar, not promised in a PDF."
        />
        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          <article className="card p-6 sm:p-8">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-tint text-brand">
              <Star size={20} />
            </span>
            <h3 className="mt-5 text-[22px] font-semibold tracking-[-0.02em]">Ratings that cannot be faked</h3>
            <p className="mt-2 text-[15px] leading-[24px] text-ink-muted">
              When a lease ends, the tenant rates the landlord and the landlord rates the tenant, from 1 to 5, once each. Only the two wallets of a funded
              lease can do it, so a reputation needs real rentals behind it.
            </p>
            <div className="mt-6 flex items-center gap-4 rounded-2xl bg-canvas px-4 py-3">
              <span className="inline-flex gap-0.5" aria-hidden>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} size={18} className={n <= 4 ? 'fill-brand text-brand' : 'text-line'} />
                ))}
              </span>
              <span className="text-[13px] text-ink-muted">Average and count read from the contract, per address</span>
            </div>
          </article>
          <article className="card p-6 sm:p-8">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-tint text-brand">
              <Sprout size={20} />
            </span>
            <h3 className="mt-5 text-[22px] font-semibold tracking-[-0.02em]">Invest the deposit, only if both agree</h3>
            <p className="mt-2 text-[15px] leading-[24px] text-ink-muted">
              Either side proposes to lend part of the guarantee on Blend and chooses how much stays put. Nothing moves until the other side approves.
              At least one month always stays in the contract, so unpaid rent is covered instantly.
            </p>
            <div className="mt-6">
              <div className="flex h-3 overflow-hidden rounded-full" aria-hidden>
                <div className="w-[38%] bg-ink/85" />
                <div className="flex-1 bg-brand" />
              </div>
              <div className="mt-2 flex justify-between text-[12px] text-ink-muted">
                <span className="inline-flex items-center gap-1.5"><Lock size={12} /> Kept: one month or more</span>
                <span className="inline-flex items-center gap-1.5"><Sprout size={12} /> Invested with both approvals</span>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

function Agents() {
  return (
    <section className="bg-canvas py-20 sm:py-28">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <SectionTitle
          eyebrow="AI agents"
          title="Two sides. One fairer rental experience."
          sub="Each side gets its own assistant. They explain, summarise and prepare. The authorised rules — not the AI — control any movement of funds."
        />
        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          <AgentCard
            name="Tenant Guardian"
            tagline="On the tenant's side"
            body="Reads your lease with you, tracks your rent and deadlines, and helps you answer a claim with the right evidence."
            prompts={TENANT_PROMPTS.slice(0, 3)}
            can={['Explain lease clauses in plain words', 'Remind you before rent is due', 'Draft replies — you send them']}
          />
          <AgentCard
            name="Landlord Assistant"
            tagline="On the landlord's side"
            body="Keeps payments and inspections organised, summarises your leases and prepares itemised, evidenced claims."
            prompts={LANDLORD_PROMPTS.slice(0, 3)}
            can={['Flag payments to review', 'Build evidence checklists', 'Prepare claim drafts — you submit them']}
            dark
          />
        </div>
      </div>
    </section>
  )
}

function AgentCard({ name, tagline, body, prompts, can, dark }: { name: string; tagline: string; body: string; prompts: string[]; can: string[]; dark?: boolean }) {
  return (
    <article className={cx('relative overflow-hidden rounded-xl3 p-6 sm:p-8', dark ? 'bg-ink text-white' : 'card')}>
      <div className="flex items-center gap-4">
        <AgentMark size={52} />
        <div>
          <h3 className="text-[22px] font-semibold tracking-[-0.02em]">{name}</h3>
          <p className={cx('text-[13px]', dark ? 'text-white/60' : 'text-ink-muted')}>{tagline}</p>
        </div>
      </div>
      <p className={cx('mt-5 text-[16px] leading-[25px]', dark ? 'text-white/80' : 'text-ink-muted')}>{body}</p>
      <div className="mt-6 space-y-2">
        {prompts.map((p) => (
          <p key={p} className={cx('w-fit rounded-[18px] rounded-bl-md px-4 py-2 text-[14px]', dark ? 'bg-white/10 text-white' : 'bg-brand-tint text-brand')}>
            {p}
          </p>
        ))}
      </div>
      <ul className={cx('mt-6 grid gap-2 border-t pt-5 text-[14px] sm:grid-cols-3', dark ? 'border-white/10 text-white/75' : 'border-line text-ink-muted')}>
        {can.map((c) => (
          <li key={c} className="flex gap-2">
            <Sparkles size={15} className={cx('mt-0.5 shrink-0', dark ? 'text-brand-soft' : 'text-brand')} />
            {c}
          </li>
        ))}
      </ul>
    </article>
  )
}

function Trust() {
  const flow = [
    { icon: <Handshake size={20} />, title: 'Human agreement', body: 'Tenant and landlord sign the terms.' },
    { icon: <Bot size={20} />, title: 'AI assistance', body: 'Explains and prepares. Never decides.' },
    { icon: <CalendarClock size={20} />, title: 'Verified rules', body: 'Dates, amounts and windows, checked.' },
    { icon: <Wallet size={20} />, title: 'Stellar transaction', body: 'Supported actions settle on-chain.' },
  ]
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <SectionTitle eyebrow="Trust & transparency" title="People agree. Rules enforce." sub="Every step is visible to both sides, and each one does only its own job." />
        <ol className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
          {flow.map((f, i) => (
            <li key={f.title} className="relative flex items-center lg:block">
              <div className={cx('flex w-full items-center gap-4 rounded-xl2 border border-line bg-white p-5 lg:mx-2 lg:w-auto lg:flex-col lg:items-start', i === 3 && 'border-brand/30 bg-brand-tint')}>
                <span className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-2xl', i === 3 ? 'bg-brand text-white' : 'bg-brand-tint text-brand')}>{f.icon}</span>
                <div>
                  <p className="text-[16px] font-semibold">{f.title}</p>
                  <p className="mt-0.5 text-[14px] text-ink-muted">{f.body}</p>
                </div>
              </div>
              {i < flow.length - 1 && (
                <ArrowRight size={18} className="absolute -right-[13px] top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white text-brand lg:block" aria-hidden />
              )}
            </li>
          ))}
        </ol>
        <p className="mx-auto mt-8 max-w-[62ch] text-center text-[13px] leading-[20px] text-ink-muted">
          Fiável is an early prototype running with demo data. It is not audited, not legally certified and not production-ready, and no real funds
          are handled. Stellar integration targets Testnet only.
        </p>
      </div>
    </section>
  )
}

function FinalCTA() {
  return (
    <section className="px-4 pb-20 sm:px-6 lg:px-8">
      <div className="brand-surface relative mx-auto max-w-[1200px] overflow-hidden rounded-[36px] px-6 py-16 text-center text-white sm:py-20">
        <svg className="pointer-events-none absolute -bottom-10 left-0 w-full opacity-30" viewBox="0 0 1200 200" fill="none" aria-hidden>
          <path d="M0 150c200-80 300 40 480-20s260-120 420-40 220 60 300 10" stroke="#E9DEFF" strokeWidth="8" strokeLinecap="round" />
        </svg>
        <h2 className="relative text-[38px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[56px]">Make renting feel fairer.</h2>
        <p className="relative mx-auto mt-4 max-w-[46ch] text-[17px] leading-[26px] text-white/75">
          Walk through a lease as Ana the tenant or Manuel the landlord. It takes about two minutes.
        </p>
        <ButtonLink to="/app" variant="white" size="lg" className="relative mt-8" iconRight={<ArrowRight size={18} />}>
          Explore Fiável
        </ButtonLink>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-line bg-canvas">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div>
          <Logo />
          <p className="mt-4 max-w-[34ch] text-[14px] leading-[22px] text-ink-muted">AI agents for fair rentals. Smart contracts for trust. Made in Lisbon for HackMeridian.</p>
        </div>
        <div>
          <p className="text-[13px] font-semibold">Product</p>
          <ul className="mt-3 space-y-2 text-[14px] text-ink-muted">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="hover:text-ink">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[13px] font-semibold">Demo</p>
          <ul className="mt-3 space-y-2 text-[14px] text-ink-muted">
            <li>
              <Link to="/app" className="hover:text-ink">Tenant & landlord app</Link>
            </li>
            <li>
              <Link to="/app/assistant" className="hover:text-ink">AI assistant</Link>
            </li>
            <li>
              <Link to="/app/deposit" className="hover:text-ink">Protected deposit</Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-[1200px] px-4 py-6 text-[12px] leading-[18px] text-ink-muted sm:px-6 lg:px-8">
          Testnet demo. All people, properties, payments and events are fictional. No real funds are held or transferred, and no Stellar transaction has
          been submitted by this prototype.
        </p>
      </div>
    </footer>
  )
}

function SectionTitle({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mx-auto max-w-[44rem] text-center">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-4 text-[34px] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[46px]">{title}</h2>
      {sub && <p className="mt-4 text-[17px] leading-[27px] text-ink-muted">{sub}</p>}
    </div>
  )
}
