import type { Server } from 'node:http'
import { WebSocketServer, type RawData, type WebSocket } from 'ws'
import {
  applyAction,
  claimSeat,
  createRoom,
  isNetAction,
  setTowerGold,
  startMatch,
  viewFor,
  type Room,
  type TableMessage,
} from '../src/game/online.ts'
import type { PlayerId } from '../src/game/types.ts'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const rooms = new Map<string, Room>()
const sockets = new Map<string, Partial<Record<PlayerId, WebSocket>>>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

interface ClientMsg {
  type?: string
  name?: string
  code?: string
  token?: string
  on?: boolean
  action?: unknown
}

function makeCode(): string {
  let code = ''
  for (let i = 0; i < 4; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return rooms.has(code) ? makeCode() : code
}

function cleanName(name: unknown) {
  return String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24)
}

function cleanCode(code: unknown) {
  return String(code ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4)
}

function connected(code: string): Record<PlayerId, boolean> {
  const seats = sockets.get(code)
  return { radiant: !!seats?.radiant, dire: !!seats?.dire }
}

function send(socket: WebSocket, room: Room, seat: PlayerId) {
  const message: TableMessage = {
    type: 'table',
    code: room.code,
    seat,
    token: room.tokens[seat] ?? '',
    names: room.names,
    host: seat === 'radiant',
    started: room.started,
    towerGold: room.towerGold,
    connected: connected(room.code),
    ready: room.ready,
    rematch: room.rematch,
    state: room.state ? viewFor(room.state, seat) : null,
  }
  if (socket.readyState === 1) socket.send(JSON.stringify(message))
}

function broadcast(room: Room) {
  const seats = sockets.get(room.code)
  for (const seat of ['radiant', 'dire'] as const) {
    const socket = seats?.[seat]
    if (socket) send(socket, room, seat)
  }
  armTimer(room)
}

function armTimer(room: Room) {
  const existing = timers.get(room.code)
  if (existing) clearTimeout(existing)
  timers.delete(room.code)
  const state = room.state
  if (!state || state.phase !== 'response' || state.winner) return
  const seat = state.priority
  const stamp = `${state.round}:${state.passes}:${state.log.length}:${state.priority}`
  const timer = setTimeout(() => {
    const current = room.state
    if (!current || current.phase !== 'response' || current.winner) return
    if (`${current.round}:${current.passes}:${current.log.length}:${current.priority}` !== stamp) return
    applyAction(room, seat, { type: 'pass' })
    broadcast(room)
  }, 5000)
  timers.set(room.code, timer)
}

function fail(socket: WebSocket, message: string) {
  if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'error', message }))
}

function takeSeat(socket: WebSocket, room: Room, seat: PlayerId) {
  const seats = sockets.get(room.code) ?? {}
  const previous = seats[seat]
  if (previous && previous !== socket) previous.close()
  seats[seat] = socket
  sockets.set(room.code, seats)
  socket.roomCode = room.code
  socket.seat = seat
}

function onMessage(socket: WebSocket, raw: RawData) {
  let msg: ClientMsg
  try {
    msg = JSON.parse(String(raw)) as ClientMsg
  } catch {
    return fail(socket, 'That message was not valid.')
  }

  if (msg.type === 'create') {
    const room = createRoom(makeCode())
    rooms.set(room.code, room)
    const token = claimSeat(room, 'radiant', cleanName(msg.name) || 'Radiant')
    socket.token = token
    takeSeat(socket, room, 'radiant')
    broadcast(room)
    return
  }

  if (msg.type === 'join') {
    const room = rooms.get(cleanCode(msg.code))
    if (!room) return fail(socket, 'No room with that code.')
    if (room.tokens.dire && sockets.get(room.code)?.dire) return fail(socket, 'That room already has two players.')
    const token = claimSeat(room, 'dire', cleanName(msg.name) || 'Dire')
    socket.token = token
    takeSeat(socket, room, 'dire')
    broadcast(room)
    return
  }

  if (msg.type === 'resume') {
    const room = rooms.get(cleanCode(msg.code))
    if (!room) return fail(socket, 'That room has closed.')
    const seat = (['radiant', 'dire'] as const).find((p) => room.tokens[p] && room.tokens[p] === msg.token)
    if (!seat) return fail(socket, 'This browser is not seated in that room.')
    socket.token = msg.token
    takeSeat(socket, room, seat)
    broadcast(room)
    return
  }

  const code = socket.roomCode
  const seat = socket.seat
  const room = code ? rooms.get(code) : undefined
  if (!room || !seat || room.tokens[seat] !== socket.token) return fail(socket, 'Join a room first.')

  if (msg.type === 'towerGold') {
    if (seat !== 'radiant') return fail(socket, 'Only the host can change tower gold.')
    setTowerGold(room, !!msg.on)
    broadcast(room)
    return
  }

  if (msg.type === 'start') {
    if (seat !== 'radiant') return fail(socket, 'The host starts the match.')
    const error = startMatch(room)
    if (error) return fail(socket, error)
    broadcast(room)
    return
  }

  if (msg.type === 'action') {
    if (!isNetAction(msg.action)) return fail(socket, 'Unknown action.')
    const error = applyAction(room, seat, msg.action)
    if (error) fail(socket, error)
    broadcast(room)
    return
  }

  fail(socket, 'Unknown message.')
}

export function attachMultiplayer(httpServer: Server) {
  const wss = new WebSocketServer({ noServer: true })
  httpServer.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    if (pathname !== '/ws') return
    wss.handleUpgrade(req, socket, head, (client) => {
      wss.emit('connection', client, req)
    })
  })
  wss.on('connection', (socket) => {
    socket.on('message', (data) => onMessage(socket, data))
    socket.on('close', () => {
      const code = socket.roomCode
      const seat = socket.seat
      if (!code || !seat) return
      const seats = sockets.get(code)
      if (seats?.[seat] !== socket) return
      delete seats[seat]
      const room = rooms.get(code)
      if (room) broadcast(room)
    })
  })
  return wss
}

declare module 'ws' {
  interface WebSocket {
    roomCode?: string
    seat?: PlayerId
    token?: string
  }
}
