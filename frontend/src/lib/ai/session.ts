import type { Reply } from './reply.ts'
import { parseReply } from './protocol.ts'

export interface Message { id: string; from: 'user' | 'agent'; text: string; reply?: Reply }
export interface ConversationSession { messages: Message[]; input: string }
const sessions = new Map<string, ConversationSession>()
// Memory only: navigation is retained, reload clears private chats. No localStorage.
export function readSession(key: string): ConversationSession | undefined {
  const session = sessions.get(key)
  return session && { messages: session.messages.map(message => ({ ...message })), input: session.input }
}
export function writeSession(key: string, session: ConversationSession) {
  if (!sessions.has(key) && sessions.size >= 10) sessions.delete(sessions.keys().next().value!)
  sessions.set(key, { messages: session.messages.slice(-40), input: session.input.slice(0, 2000) })
}
export function clearSession(key: string) { sessions.delete(key) }
export function safeReply(value: unknown) { return parseReply(value) }
