import type { GameState, Piece, Player, PieceType } from './types';
import { SEAT_ARMY } from './types';

export const SIZE = 14;

/** Доска-крест: 14×14 без четырёх угловых квадратов 3×3. */
export function isPlayable(r: number, c: number): boolean {
  if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return false;
  if ((r <= 2 || r >= 11) && (c <= 2 || c >= 11)) return false;
  return true;
}

/** Домашняя зона какого места (для подсветки), или -1 для центра. */
export function homeSeat(r: number, c: number): number {
  if (!isPlayable(r, c)) return -1;
  if (r >= 11) return 0;
  if (c <= 2) return 1;
  if (r <= 2) return 2;
  if (c >= 11) return 3;
  return -1;
}

/** Локальные координаты армии (своя сторона снизу) → координаты доски. */
export function localToAbs(seat: number, r: number, c: number): { r: number; c: number } {
  let rr = r;
  let cc = c;
  for (let i = 0; i < seat; i++) {
    const nr = cc;
    const nc = SIZE - 1 - rr;
    rr = nr;
    cc = nc;
  }
  return { r: rr, c: cc };
}

/** Координаты доски → локальные координаты армии. */
export function absToLocal(seat: number, r: number, c: number): { r: number; c: number } {
  let rr = r;
  let cc = c;
  for (let i = 0; i < seat; i++) {
    const nr = SIZE - 1 - cc;
    const nc = rr;
    rr = nr;
    cc = nc;
  }
  return { r: rr, c: cc };
}

const BACK_RANK: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

export function createEmptyState(players: (Player | null)[]): GameState {
  return {
    board: Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null)),
    players,
    turn: 0,
    winner: null,
    lastMove: null,
    log: [],
    started: false,
  };
}

/** Все четыре армии на исходных позициях; места без игрока тоже заполнены. */
export function createInitialState(players: Player[]): GameState {
  const seats: (Player | null)[] = [null, null, null, null];
  for (const p of players) seats[p.seat] = p;
  const state = createEmptyState(seats);

  for (let seat = 0; seat < 4; seat++) {
    const army = SEAT_ARMY[seat];
    for (let i = 0; i < 8; i++) {
      const back = localToAbs(seat, 13, 3 + i);
      state.board[back.r][back.c] = { type: BACK_RANK[i], color: army } satisfies Piece;
      const pawn = localToAbs(seat, 12, 3 + i);
      state.board[pawn.r][pawn.c] = { type: 'p', color: army } satisfies Piece;
    }
  }
  return state;
}

/**
 * Начинает игру: убирает армии пустых мест, ставит первый ход.
 * Возвращает null, если в одной из команд нет ни одного игрока.
 */
export function beginGame(state: GameState): GameState | null {
  const players = state.players.map((p) => (p ? { ...p } : null));
  const board = state.board.map((row) => row.slice());

  for (let seat = 0; seat < 4; seat++) {
    if (players[seat]) continue;
    const army = SEAT_ARMY[seat];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const p = board[r][c];
        if (p && p.color === army) board[r][c] = null;
      }
    }
  }

  const teamAlive = (team: number) =>
    (team === 0 ? [0, 2] : [1, 3]).some((k) => {
      const p = players[k];
      return !!p && !p.eliminated;
    });

  if (!teamAlive(0) || !teamAlive(1)) return null;

  let turn = 0;
  while (turn < 4 && (!players[turn] || players[turn]!.eliminated)) turn++;

  return {
    ...state,
    players,
    board,
    turn,
    started: true,
    winner: null,
    lastMove: null,
    log: ['Игра началась'],
  };
}
