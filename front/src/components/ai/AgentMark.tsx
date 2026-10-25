import { cx } from '../../lib/cx'

/** The assistant's identity mark: a soft lavender orb with a spark. Calm, not a robot. */
export function AgentMark({ size = 40, pulse }: { size?: number; pulse?: boolean }) {
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} aria-hidden>
      {pulse && <span className="absolute inset-0 animate-ping rounded-full bg-brand-soft/30 [animation-duration:2.4s]" />}
      <span
        className={cx('relative grid h-full w-full place-items-center rounded-full')}
        style={{
          background: 'radial-gradient(circle at 30% 25%, #fff 0%, #E6DBFF 28%, #B597F0 62%, #6338B8 100%)',
          boxShadow: 'inset 0 -4px 10px rgba(79,43,152,.35), 0 6px 16px -6px rgba(99,56,184,.5)',
        }}
      >
        <svg viewBox="0 0 24 24" width={size * 0.42} height={size * 0.42} fill="#fff">
          <path d="M12 2.5c.5 4.6 2.4 6.9 7 7.5-4.6.6-6.5 2.9-7 7.5-.5-4.6-2.4-6.9-7-7.5 4.6-.6 6.5-2.9 7-7.5Z" />
        </svg>
      </span>
    </span>
  )
}
