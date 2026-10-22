import { absToLocal, isPlayable, SIZE } from './board';
import type { GameState, Piece, PieceColor, PieceType, Square } from './types';
import { ARMY_RU, SEAT_ARMY } from './types';

const SLIDES: Record<'r' | 'b' | 'q', number[][]> = {
  r: [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ],
  b: [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ],
  q: [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ],
};

const KNIGHT = [
  [1, 2],
  [2, 1],
  [-1, 2],
  [-2, 1],
  [1, -2],
  [2, -1],
  [-1, -2],
  [-2, -1],
];

const KING = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** Направление пешки и диагонали взятия для каждого места. */
const PAWN: { f: number[]; caps: number[][] }[] = [
  { f: [-1, 0], caps: [[-1, -1], [-1, 1]] }, // низ
  { f: [0, 1], caps: [[-1, 1], [1, 1]] }, // лево
  { f: [1, 0], caps: [[1, -1], [1, 1]] }, // верх
  { f: [0, -1], caps: [[-1, -1], [1, -1]] }, // право
];

const RU_PIECE: Record<PieceType, string> = {
  k: 'король',
  q: 'ферзь',
  r: 'ладья',
  b: 'слон',
  n: 'конь',
  p: 'пешка',
};

export const teamOf = (seat: number): number => seat % 2;
export const teamSeats = (team: number): number[] => (team === 0 ? [0, 2] : [1, 3]);

export function isAlive(state: GameState, seat: number): boolean {
  const p = state.players[seat];
  return !!p && !p.eliminated;
}

function seatOfColor(color: PieceColor): number {
  return (SEAT_ARMY as PieceColor[]).indexOf(color);
}

export function canCapture(seat: number, target: Piece): boolean {
  if (target.color === 'neutral') return true;
  return teamOf(seatOfColor(target.color)) !== teamOf(seat);
}

/** Все допустимые ходы фигуры на клетке from для места seat. */
export function movesFrom(state: GameState, seat: number, from: Square): Square[] {
  const piece = state.board[from.r]?.[from.c];
  if (!piece || piece.color !== SEAT_ARMY[seat]) return [];

  const out: Square[] = [];

  if (piece.type === 'p') {
    const { f, caps } = PAWN[seat];
    const one = { r: from.r + f[0], c: from.c + f[1] };
    if (isPlayable(one.r, one.c) && !state.board[one.r][one.c]) {
      out.push(one);
      const local = absToLocal(seat, from.r, from.c);
      if (local.r === 12) {
        const two = { r: from.r + 2 * f[0], c: from.c + 2 * f[1] };
        if (isPlayable(two.r, two.c) && !state.board[two.r][two.c]) out.push(two);
      }
    }
    for (const [dr, dc] of caps) {
      const r = from.r + dr;
      const c = from.c + dc;
      if (!isPlayable(r, c)) continue;
      const target = state.board[r][c];
      if (target && canCapture(seat, target)) out.push({ r, c });
    }
    return out;
  }

  if (piece.type === 'n' || piece.type === 'k') {
    const steps = piece.type === 'n' ? KNIGHT : KING;
    for (const [dr, dc] of steps) {
      const r = from.r + dr;
      const c = from.c + dc;
      if (!isPlayable(r, c)) continue;
      const target = state.board[r][c];
      if (!target) out.push({ r, c });
      else if (canCapture(seat, target)) out.push({ r, c });
    }
    return out;
  }

  for (const [dr, dc] of SLIDES[piece.type]) {
    let r = from.r + dr;
    let c = from.c + dc;
    while (isPlayable(r, c)) {
      const target = state.board[r][c];
      if (!target) {
        out.push({ r, c });
      } else {
        if (canCapture(seat, target)) out.push({ r, c });
        break;
      }
      r += dr;
      c += dc;
    }
  }
  return out;
}

function sq(square: Square): string {
  return `${'abcdefghijklmn'[square.c]}${SIZE - square.r}`;
}

/** Применяет ход. Возвращает null, если ход невозможен. */
export function applyMove(state: GameState, seat: number, from: Square, to: Square): GameState | null {
  if (!state.started || state.winner) return null;
  if (state.turn !== seat) return null;
  if (!movesFrom(state, seat, from).some((m) => m.r === to.r && m.c === to.c)) return null;

  const board = state.board.map((row) => row.slice());
  const players = state.players.map((p) => (p ? { ...p } : null));
  const piece = board[from.r][from.c]!;
  const captured = board[to.r][to.c];
  const lines: string[] = [];
  const mover = players[seat]?.name ?? 'Игрок';

  board[to.r][to.c] = piece;
  board[from.r][from.c] = null;

  lines.push(
    captured
      ? `${mover}: ${sq(from)}–${sq(to)}, взята ${RU_PIECE[captured.type]} (${ARMY_RU[captured.color]})`
      : `${mover}: ${sq(from)}–${sq(to)}`,
  );

  if (piece.type === 'p') {
    const local = absToLocal(seat, to.r, to.c);
    if (local.r === 0) {
      board[to.r][to.c] = { ...piece, type: 'q' };
      lines.push(`${mover}: пешка становится ферзём`);
    }
  }

  if (captured && captured.type === 'k' && captured.color !== 'neutral') {
    const loser = seatOfColor(captured.color);
    const loserPlayer = loser >= 0 ? players[loser] : null;
    if (loser >= 0 && loserPlayer) {
      players[loser] = { ...loserPlayer, eliminated: true };
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const p = board[r][c];
          if (p && p.color === captured.color) board[r][c] = { ...p, color: 'neutral' };
        }
      }
      lines.push(`Король ${ARMY_RU[captured.color]} повержен — ${loserPlayer.name} выбывает`);
    }
  }

  const next: GameState = {
    board,
    players,
    turn: state.turn,
    winner: null,
    lastMove: { from, to, seat },
    log: [...state.log, ...lines].slice(-60),
    started: true,
  };

  for (const team of [0, 1]) {
    const alive = teamSeats(team).some((k) => isAlive(next, k));
    if (!alive) {
      const winners = teamSeats(1 - team).filter((k) => isAlive(next, k));
      if (winners.length) {
        next.winner = winners;
        next.log = [...next.log, `Победа команды: ${winners.map((k) => ARMY_RU[SEAT_ARMY[k]]).join(' и ')}`].slice(-60);
      }
      break;
    }
  }

  if (next.winner) {
    next.turn = seat;
  } else {
    let t = (seat + 1) % 4;
    for (let i = 0; i < 4 && !isAlive(next, t); i++) t = (t + 1) % 4;
    next.turn = t;
  }

  return next;
}
