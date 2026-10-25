import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

/** Keeps the shell alive when one screen fails to render, and says what happened. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="card flex flex-col items-center px-6 py-10 text-center">
        <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-danger-tint text-danger">
          <AlertTriangle size={22} />
        </span>
        <p className="font-semibold">This screen could not be displayed</p>
        <p className="mt-1 max-w-[46ch] text-[14px] text-ink-muted">{this.state.error.message}</p>
        <button onClick={() => this.setState({ error: null })} className="mt-4 text-[14px] font-semibold text-brand hover:underline">
          Try again
        </button>
      </div>
    )
  }
}
