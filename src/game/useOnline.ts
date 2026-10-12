import { useCallback, useEffect, useRef, useState } from 'react'
import type { LobbyMessage, NetAction, TableMessage } from './online'
import type { Action } from './useGame'

export const SEAT_KEY = 'ancients-seat'

type ClientMsg =
  | { type: 'lobby' }
  | { type: 'create'; name: string }
  | { type: 'join'; code: string; name: string }
  | { type: 'match'; name: string }
  | { type: 'resume'; code: string; token: string }
  | { type: 'start' }
  | { type: 'towerGold'; on: boolean }
  | { type: 'action'; action: NetAction }

export function socketUrl() {
  const configured = import.meta.env.VITE_WS_URL as string | undefined
  if (configured) return configured
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
}

export function useOnline() {
  const ws = useRef<WebSocket | null>(null)
  const resume = useRef<{ code: string; token: string } | null>(null)
  const retry = useRef<number | null>(null)
  const browsing = useRef(false)
  const seated = useRef(false)
  const [table, setTable] = useState<TableMessage | null>(null)
  const [lobby, setLobby] = useState<LobbyMessage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'connecting' | 'open' | 'closed'>('idle')

  function clearRetry() {
    if (retry.current !== null) window.clearTimeout(retry.current)
    retry.current = null
  }

  const openSocket = useCallback(function open(first: ClientMsg) {
    clearRetry()
    browsing.current = first.type === 'lobby'
    const previous = ws.current
    const socket = new WebSocket(socketUrl())
    ws.current = socket
    previous?.close()
    setStatus('connecting')
    setError(null)

    socket.onopen = () => {
      if (ws.current !== socket) return
      setStatus('open')
      socket.send(JSON.stringify(first))
    }
    socket.onmessage = (ev) => {
      if (ws.current !== socket) return
      const data = JSON.parse(String(ev.data)) as TableMessage | LobbyMessage | { type: 'error'; message: string }
      if (data.type === 'error') {
        setError(data.message)
        if (!seated.current && !browsing.current && ws.current === socket) {
          browsing.current = true
          socket.send(JSON.stringify({ type: 'lobby' }))
        }
        return
      }
      if (data.type === 'lobby') {
        setLobby(data)
        return
      }
      if (data.type === 'table') {
        browsing.current = false
        seated.current = true
        setError(null)
        setTable(data)
        const saved = { code: data.code, token: data.token }
        resume.current = saved
        sessionStorage.setItem(SEAT_KEY, JSON.stringify(saved))
      }
    }
    socket.onerror = () => {
      if (ws.current === socket) setError('Could not reach the multiplayer server.')
    }
    socket.onclose = () => {
      if (ws.current !== socket) return
      setStatus('closed')
      const saved = resume.current
      const stillBrowsing = browsing.current
      if (!saved && !stillBrowsing) return
      retry.current = window.setTimeout(() => {
        if (ws.current !== socket) return
        open(saved ? { type: 'resume', code: saved.code, token: saved.token } : { type: 'lobby' })
      }, 1000)
    }
  }, [])

  function close() {
    clearRetry()
    browsing.current = false
    seated.current = false
    resume.current = null
    sessionStorage.removeItem(SEAT_KEY)
    const socket = ws.current
    ws.current = null
    socket?.close()
    setTable(null)
    setLobby(null)
    setStatus('idle')
    setError(null)
  }

  function send(data: ClientMsg) {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(data))
  }

  function sendAction(action: Action) {
    if (action.type === 'settings') {
      if (action.settings.towerGold !== undefined) send({ type: 'towerGold', on: action.settings.towerGold !== false })
      return
    }
    const net = toNet(action)
    if (net) send({ type: 'action', action: net })
  }

  useEffect(
    () => () => {
      clearRetry()
      const socket = ws.current
      ws.current = null
      socket?.close()
    },
    [],
  )

  return { table, lobby, error, status, openSocket, close, sendAction, send }
}

function toNet(action: Action): NetAction | null {
  switch (action.type) {
    case 'endDraw':
    case 'endAssign':
    case 'endRotate':
    case 'nextRound':
      return { type: 'lock' }
    case 'new':
      return { type: 'rematch' }
    case 'settings':
      return null
    default:
      return action
  }
}
