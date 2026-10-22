import { describe, expect, it } from 'vitest';
import { absToLocal, beginGame, createEmptyState, createInitialState, localToAbs } from './board';
import { applyMove, movesFrom } from './rules';
import type { GameState, Player, Square } from './types';

const players: Player[] = [0, 1, 2, 3].map((seat) => ({
  name: `P${seat + 1}`,
  seat,
  connected: true,
  eliminated: false,
}));

const fresh = (): GameState => beginGame(createInitialState(players))!;
const keys = (moves: Square[]) => moves.map((m) => `${m.r},${m.c}`);

function empty(): GameState {
  const state = createEmptyState(players.map((p) => ({ ...p })));
  state.started = true;
  state.turn = 0;
  return state;
}

describe('расстановка', () => {
  it('ставит 64 фигуры, по 16 на армию', () => {
    const state = createInitialState(players);
    expect(state.board.flat().filter(Boolean)).toHaveLength(64);
  });

  it('короли на своих местах у всех армий', () => {
    const state = createInitialState(players);
    for (const seat of [0, 1, 2, 3]) {
      const pos = localToAbs(seat, 13, 7);
      expect(state.board[pos.r][pos.c]?.type).toBe('k');
    }
  });

  it('поворот координат обратим', () => {
    for (const seat of [0, 1, 2, 3]) {
      const abs = localToAbs(seat, 5, 9);
      const back = absToLocal(seat, abs.r, abs.c);
      expect(back).toEqual({ r: 5, c: 9 });
    }
  });
});

describe('пешки', () => {
  it('красная идёт вверх и может пойти на две с исходной линии', () => {
    const state = fresh();
    const from = localToAbs(0, 12, 4);
    const moves = keys(movesFrom(state, 0, from));
    expect(moves).toContain(`${from.r - 1},${from.c}`);
    expect(moves).toContain(`${from.r - 2},${from.c}`);
  });

  it('зелёная идёт вправо', () => {
    const state = fresh();
    const from = localToAbs(1, 12, 4);
    const moves = keys(movesFrom(state, 1, from));
    expect(moves).toContain(`${from.r},${from.c + 1}`);
    expect(moves).toContain(`${from.r},${from.c + 2}`);
  });

  it('превращается в ферзя на противоположном краю', () => {
    const state = empty();
    state.board[1][5] = { type: 'p', color: 'red' };
    const next = applyMove(state, 0, { r: 1, c: 5 }, { r: 0, c: 5 })!;
    expect(next.board[0][5]).toEqual({ type: 'q', color: 'red' });
  });
});

describe('фигуры', () => {
  it('конь не прыгает за пределы креста и не бьёт своих', () => {
    const state = fresh();
    // Из b1 доступны только b3 и d3: остальные прыжки уходят в угол-вырез,
    // а поле c3 занято своей пешкой.
    expect(keys(movesFrom(state, 0, { r: 13, c: 4 })).sort()).toEqual(['11,3', '11,5']);
  });

  it('нельзя бить фигуру союзника и проходить сквозь неё', () => {
    const state = empty();
    state.board[10][5] = { type: 'r', color: 'red' };
    state.board[8][5] = { type: 'p', color: 'yellow' };
    const moves = keys(movesFrom(state, 0, { r: 10, c: 5 }));
    expect(moves).toContain('9,5');
    expect(moves).not.toContain('8,5');
    expect(moves).not.toContain('7,5');
  });

  it('своя фигура блокирует ход', () => {
    const state = empty();
    state.board[10][5] = { type: 'r', color: 'red' };
    state.board[9][5] = { type: 'p', color: 'red' };
    expect(keys(movesFrom(state, 0, { r: 10, c: 5 }))).not.toContain('8,5');
  });
});

describe('выбывание и победа', () => {
  it('взятие короля выбивает игрока, его фигуры становятся нейтральными', () => {
    const state = empty();
    state.board[10][5] = { type: 'r', color: 'red' };
    state.board[8][5] = { type: 'k', color: 'blue' };
    state.board[9][6] = { type: 'p', color: 'blue' };

    const next = applyMove(state, 0, { r: 10, c: 5 }, { r: 8, c: 5 })!;
    expect(next.players[3]!.eliminated).toBe(true);
    expect(next.board[9][6]!.color).toBe('neutral');
    expect(next.turn).toBe(1);
  });

  it('команда побеждает, потеряв ноль королей против двух', () => {
    const state = empty();
    state.players[1] = { ...state.players[1]!, eliminated: true };
    state.board[10][5] = { type: 'r', color: 'red' };
    state.board[8][5] = { type: 'k', color: 'blue' };

    const next = applyMove(state, 0, { r: 10, c: 5 }, { r: 8, c: 5 })!;
    expect(next.winner).toEqual([0, 2]);
    expect(applyMove(next, 0, { r: 8, c: 5 }, { r: 7, c: 5 })).toBeNull();
  });

  it('выбывший игрок пропускается в очереди хода', () => {
    const state = empty();
    state.players[2] = { ...state.players[2]!, eliminated: true };
    state.board[10][5] = { type: 'p', color: 'red' };
    const next = applyMove(state, 0, { r: 10, c: 5 }, { r: 9, c: 5 })!;
    expect(next.turn).toBe(1);
  });

  it('нельзя ходить не в свою очередь', () => {
    const state = empty();
    state.board[10][5] = { type: 'p', color: 'red' };
    expect(applyMove(state, 1, { r: 10, c: 5 }, { r: 9, c: 5 })).toBeNull();
  });
});
