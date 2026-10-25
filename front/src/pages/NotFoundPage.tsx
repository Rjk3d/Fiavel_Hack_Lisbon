import { Inbox } from 'lucide-react'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/misc'

export function NotFoundPage() {
  return (
    <div className="card">
      <EmptyState icon={<Inbox size={22} />} title="Page not found" body="This page doesn't exist." action={<ButtonLink to="/app">Go to overview</ButtonLink>} />
    </div>
  )
}
