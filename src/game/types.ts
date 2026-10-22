export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Army = 'red' | 'green' | 'yellow' | 'blue';
export type PieceColor = Army | 'neutral';

export interface Piece {
  type: PieceType;
  color: PieceColor;
}

export interface Player {
  name: string;
  seat: number;
  connected: boolean;
  eliminated: boolean;
}

export interface Square {
  r: number;
  c: number;
}

export interface GameState {
  board: (Piece | null)[][];
  players: (Player | null)[];
  turn: number;
  winner: number[] | null;
  lastMove: { from: Square; to: Square; seat: number } | null;
  log: string[];
  started: boolean;
}

/** Порядок мест по часовой стрелке, начиная с нижней армии. */
export const SEAT_ARMY: Army[] = ['red', 'green', 'yellow', 'blue'];

export const ARMY_RU: Record<PieceColor, string> = {
  red: 'красные',
  green: 'зелёные',
  yellow: 'жёлтые',
  blue: 'синие',
  neutral: 'нейтральные',
};

export const ARMY_HEX: Record<PieceColor, string> = {
  red: '#e05a4f',
  green: '#3fa86a',
  yellow: '#e8b422',
  blue: '#4c8bf5',
  neutral: '#9aa0a6',
};
