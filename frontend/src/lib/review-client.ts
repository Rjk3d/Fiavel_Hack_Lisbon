export class ReviewApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.name = 'ReviewApiError'; this.status = status }
}
export async function reviewRequest(role: string, path = '', body?: object, signal?: AbortSignal) {
  let response: Response
  try {
    response = await fetch(`/api/reviews${path}`, {
      method: body ? 'POST' : 'GET', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Fiavel-Reviews': '1', 'X-Fiavel-Demo-Role': role },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch (error) {
    signal?.throwIfAborted()
    throw new ReviewApiError(error instanceof Error && error.name === 'TimeoutError' ? 'The review server timed out. Your submission may have been saved. Refresh before retrying.' : 'Cannot reach the review server. Start the app with npm run dev, then retry.', 0)
  }
  const raw = await response.text()
  let data
  try { data = JSON.parse(raw) } catch { throw new ReviewApiError('The review API returned an invalid response. Check that the backend and proxy are running.', response.status) }
  if (!response.ok) throw new ReviewApiError(typeof data?.error === 'string' ? data.error : 'The review request failed. Please retry.', response.status)
  if (!data || typeof data !== 'object') throw new ReviewApiError('The review API returned an invalid response.', response.status)
  const invalid = () => { throw new ReviewApiError('The review API returned an invalid response. Refresh before retrying a submission.', response.status) }
  if (body && path === '' && (typeof data.id !== 'string' || data.state !== 'Review submitted')) invalid()
  if (!body && (path === '' || path.startsWith('?')) && (!['demo','live'].includes(data.mode) || !Array.isArray(data.leases) || !Array.isArray(data.reviews) || !data.summary || !Number.isInteger(data.summary.count) || !Array.isArray(data.summary.distribution))) invalid()
  if (body && /\/(response|report)$/.test(path) && data.ok !== true) invalid()
  return data
}
