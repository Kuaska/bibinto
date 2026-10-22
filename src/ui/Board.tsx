import { useEffect, useMemo, useState } from 'react';
import { homeSeat, isPlayable, SIZE } from '../game/board';
import { movesFrom } from '../game/rules';
import { ARMY_HEX, SEAT_ARMY } from '../game/types';
import type { GameState, Square } from '../game/types';

const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

interface Props {
  state: GameState;
  seat: number;
  interactive: boolean;
  onMove: (from: Square, to: Square) => void;
}

export function Board({ state, seat, interactive, onMove }: Props) {
  const [sel, setSel] = useState<Square | null>(null);

  useEffect(() => {
    setSel(null);
  }, [state.turn, state.lastMove]);

  const targets = useMemo(() => (sel ? movesFrom(state, seat, sel) : []), [sel, state, seat]);
  const targetKeys = useMemo(() => new Set(targets.map((t) => `${t.r}-${t.c}`)), [targets]);

  function click(r: number, c: number) {
    if (!interactive) return;
    const piece = state.board[r][c];

    if (sel) {
      if (targetKeys.has(`${r}-${c}`)) {
        onMove(sel, { r, c });
        setSel(null);
        return;
      }
      if (sel.r === r && sel.c === c) {
        setSel(null);
        return;
      }
    }

    if (piece && piece.color === SEAT_ARMY[seat]) setSel({ r, c });
    else setSel(null);
  }

  const cells = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const key = `${r}-${c}`;
      if (!isPlayable(r, c)) {
        cells.push(<div className="cell hole" key={key} />);
        continue;
      }

      const piece = state.board[r][c];
      const zone = homeSeat(r, c);
      const isSel = !!sel && sel.r === r && sel.c === c;
      const isTarget = targetKeys.has(key);
      const last = state.lastMove;
      const isLast = !!last && ((last.from.r === r && last.from.c === c) || (last.to.r === r && last.to.c === c));

      const classes = ['cell', (r + c) % 2 === 0 ? 'light' : 'dark'];
      if (isSel) classes.push('sel');
      if (isTarget) classes.push('target');
      if (isTarget && piece) classes.push('capture');
      if (isLast) classes.push('lm');

      const tint = zone >= 0 ? ARMY_HEX[SEAT_ARMY[zone]] : null;

      cells.push(
        <div
          key={key}
          className={classes.join(' ')}
          onClick={() => click(r, c)}
          style={tint ? { backgroundImage: `linear-gradient(${tint}1f, ${tint}1f)` } : undefined}
        >
          {piece && (
            <span
              className="piece"
              style={{ color: ARMY_HEX[piece.color], transform: `rotate(${seat * 90}deg)` }}
            >
              {GLYPH[piece.type]}
            </span>
          )}
        </div>,
      );
    }
  }

  return (
    <div className="board-shell">
      <div className="rotor" style={{ transform: `rotate(${-90 * seat}deg)` }}>
        <div className="board">{cells}</div>
      </div>
    </div>
  );
}
