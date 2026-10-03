import { it } from 'vitest'
import { playAiRound } from './ai'
import { newGame, nextRound } from './engine'
import { LANES, type ComebackRules, type GameState, type PlayerId } from './types'

// Balance report, skipped by `npm test`. Run with `npm run sim` (GAMES=1000 for more samples).

declare const process: { env: Record<string, string | undefined>; stdout: { write(text: string): void } }

const GAMES = Number(process.env.GAMES ?? 500)
const CHECK_ROUND = 6

function structureHp(s: GameState, p: PlayerId) {
  const st = s.players[p].structures
  return st.ancient + LANES.reduce((n, l) => n + st.towers[l].t1 + st.towers[l].t2, 0)
}

function run(label: string, rules: ComebackRules) {
  let radiant = 0
  let finished = 0
  let rounds = 0
  let led = 0
  let leaderWon = 0
  let buybacks = 0
  for (let g = 1; g <= GAMES; g++) {
    let s = newGame({ rules }, g * 7919)
    let leader: PlayerId | undefined
    for (let r = 0; r < 60 && !s.winner; r++) {
      s = playAiRound(s)
      if (s.round === CHECK_ROUND && !s.winner) {
        const d = structureHp(s, 'radiant') - structureHp(s, 'dire')
        if (Math.abs(d) >= 2) leader = d > 0 ? 'radiant' : 'dire'
      }
      if (!s.winner) s = nextRound(s)
    }
    buybacks += s.log.filter((e) => e.text.includes(' buys back ')).length
    if (!s.winner) continue
    finished++
    rounds += s.round
    if (s.winner === 'radiant') radiant++
    if (leader) {
      led++
      if (leader === s.winner) leaderWon++
    }
  }
  const pct = (n: number, d: number) => `${((100 * n) / Math.max(1, d)).toFixed(0)}%`
  return (
    `${label.padEnd(30)} ahead at R${CHECK_ROUND} wins ${pct(leaderWon, led).padStart(4)} | ` +
    `avg ${(rounds / Math.max(1, finished)).toFixed(1)} rounds | Radiant ${pct(radiant, finished)} | ` +
    `buybacks/game ${(buybacks / GAMES).toFixed(1)} | unfinished ${GAMES - finished}`
  )
}

it.runIf(process.env.SIM)('balance report', () => {
  const off = { buyback: false, towerCards: false, fountain: false }
  const lines = [
    run('All comeback rules off', off),
    run('Buyback only', { ...off, buyback: true }),
    run('Tower cards + Gold only', { ...off, towerCards: true }),
    run('Fountain only', { ...off, fountain: true }),
    run('All comeback rules on', { buyback: true, towerCards: true, fountain: true }),
  ]
  process.stdout.write(`\n${GAMES} AI-vs-AI games per row\n${lines.join('\n')}\n`)
}, 1_800_000)
