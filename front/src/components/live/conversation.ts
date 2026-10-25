import { useSyncExternalStore } from 'react'
import type { AgentReply, Lang } from './agent'

/**
 * Chat memory for the live assistant: one conversation per (role, lease), kept in memory
 * only. It survives moving between pages while the app is open, never reaches storage,
 * and one role never sees another role's conversation.
 */
export type Msg = { id: number; from: 'user'; text: string } | { id: number; from: 'agent'; reply: AgentReply }

/** Turns kept per conversation (one question and its answer each). */
export const MAX_TURNS = 12

const EMPTY: Msg[] = []
const chats = new Map<string, Msg[]>()
let lang: Lang = 'en'
let seq = 0
const listeners = new Set<() => void>()

const notify = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const chatKey = (role: string, leaseId: bigint | string | undefined) => `${role}:${leaseId?.toString() ?? '-'}`

export function recall(key: string): Msg[] {
  return chats.get(key) ?? EMPTY
}

export function append(key: string, question: string, answer: AgentReply) {
  const next = [...recall(key), { id: ++seq, from: 'user' as const, text: question }, { id: ++seq, from: 'agent' as const, reply: answer }]
  chats.set(key, next.slice(-MAX_TURNS * 2))
  notify()
}

export function forget(key: string) {
  chats.delete(key)
  notify()
}

export function setChatLang(l: Lang) {
  if (l === lang) return
  lang = l
  notify()
}

export function useConversation(key: string) {
  return useSyncExternalStore(subscribe, () => recall(key))
}

export function useChatLang(): Lang {
  return useSyncExternalStore(subscribe, () => lang)
}
