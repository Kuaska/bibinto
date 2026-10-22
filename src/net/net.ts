import { SIZE, beginGame, createInitialState } from '../game/board';
import { applyMove } from '../game/rules';
import type { GameState, PieceColor, PieceType, Player, Square } from '../game/types';

type Body =
  | { t: 'hello'; name: string }
  | { t: 'seat'; seat: number; to: string }
  | { t: 'state'; s: Packed }
  | { t: 'move'; from: Square; to: Square }
  | { t: 'start' }
  | { t: 'err'; message: string; to: string };

type Wire = Body & { src: string };

/**
 * Транспорт: публичный ntfy.sh по HTTP.
 * Публикация — обычный POST, приём — Server-Sent Events.
 * Не нужен аккаунт, сервер и не страшны блокировки WebSocket.
 */
const NTFY = 'https://ntfy.sh';
const hostTopic = (code: string) => `c4ru-${code}-h`;
const allTopic = (code: string) => `c4ru-${code}-a`;

const COLORS = ['red', 'green', 'yellow', 'blue', 'neutral'] as const;
const COLORS_BY_FIRST = 'rgybn';

interface Packed {
  b: string;
  p: ([string, number, number, number] | 0)[];
  t: number;
  w: number[] | null;
  s: number;
  m: [number, number, number, number, number] | null;
  g: string[];
}

function pack(state: GameState): Packed {
  let b = '';
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const piece = state.board[r][c];
      b += piece ? `${piece.color[0]}${piece.type}` : '..';
    }
  }

  const p = state.players.map((player) =>
    player
      ? ([player.name, player.seat, player.connected ? 1 : 0, player.eliminated ? 1 : 0] as [
          string,
          number,
          number,
          number,
        ])
      : (0 as const),
  );

  return {
    b,
    p,
    t: state.turn,
    w: state.winner,
    s: state.started ? 1 : 0,
    m: state.lastMove
      ? [state.lastMove.from.r, state.lastMove.from.c, state.lastMove.to.r, state.lastMove.to.c, state.lastMove.seat]
      : null,
    g: state.log.slice(-12),
  };
}

function unpack(packed: Packed): GameState {
  const board: GameState['board'] = [];
  for (let r = 0; r < SIZE; r++) {
    const row: GameState['board'][number] = [];
    for (let c = 0; c < SIZE; c++) {
      const i = (r * SIZE + c) * 2;
      const code = packed.b.slice(i, i + 2);
      if (!code || code === '..') {
        row.push(null);
        continue;
      }
      const color = (COLORS[COLORS_BY_FIRST.indexOf(code[0])] ?? 'neutral') as PieceColor;
      row.push({ color, type: code[1] as PieceType });
    }
    board.push(row);
  }

  const players = packed.p.map((entry) =>
    entry
      ? ({
          name: entry[0],
          seat: entry[1],
          connected: !!entry[2],
          eliminated: !!entry[3],
        } as Player)
      : null,
  );

  return {
    board,
    players,
    turn: packed.t,
    winner: packed.w,
    started: !!packed.s,
    lastMove: packed.m
      ? { from: { r: packed.m[0], c: packed.m[1] }, to: { r: packed.m[2], c: packed.m[3] }, seat: packed.m[4] }
      : null,
    log: packed.g,
  };
}

function randomToken(len: number): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += abc[Math.floor(Math.random() * abc.length)];
  return out;
}

async function publish(topic: string, body: Wire): Promise<void> {
  try {
    await fetch(`${NTFY}/${topic}`, { method: 'POST', body: JSON.stringify(body) });
  } catch {
    /* сеть моргнула: состояние дошлём следующим сообщением или повтором hello */
  }
}

function subscribe(topic: string, onMessage: (msg: Wire) => void): EventSource {
  const source = new EventSource(`${NTFY}/${topic}/sse?since=all`);
  source.onmessage = (event) => {
    try {
      const envelope = JSON.parse(event.data) as { event?: string; message?: string };
      if (envelope.event !== 'message' || !envelope.message) return;
      const msg = JSON.parse(envelope.message) as Wire;
      if (msg && typeof msg === 'object' && 't' in msg) onMessage(msg);
    } catch {
      /* чужое или битое сообщение */
    }
  };
  return source;
}

function opened(source: EventSource): Promise<void> {
  return new Promise((resolve, reject) => {
    if (source.readyState === EventSource.OPEN) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Сервер комнат не отвечает. Проверьте интернет.'));
    }, 12000);
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Не удалось подключиться к серверу комнат.'));
    };
    const cleanup = () => {
      clearTimeout(timer);
      source.removeEventListener('open', onOpen);
      source.removeEventListener('error', onError);
    };
    source.addEventListener('open', onOpen);
    source.addEventListener('error', onError);
  });
}

/**
 * Мультиплеер: хост авторитетно считает партию,
 * гости присылают только свои ходы.
 */
export class Net {
  private hostSource: EventSource | null = null;
  private guestSource: EventSource | null = null;
  private seats = new Map<string, number>();
  private state: GameState | null = null;
  private hostTopic = '';
  private allTopic = '';
  private clientId = '';
  private helloTimer: ReturnType<typeof setInterval> | null = null;
  private joinTimer: ReturnType<typeof setTimeout> | null = null;
  isHost = false;
  code = '';

  onState: ((s: GameState) => void) | null = null;
  onSeat: ((seat: number) => void) | null = null;
  onError: ((msg: string) => void) | null = null;
  onClosed: ((msg: string) => void) | null = null;

  async host(name: string): Promise<string> {
    const code = randomToken(6);
    this.code = code;
    this.isHost = true;
    this.clientId = `h${randomToken(10)}`;
    this.hostTopic = hostTopic(code);
    this.allTopic = allTopic(code);
    this.seats.set(this.clientId, 0);

    this.state = createInitialState([
      { name: name.trim().slice(0, 16) || 'Хост', seat: 0, connected: true, eliminated: false },
    ]);

    const source = subscribe(this.hostTopic, (msg) => this.handleHost(msg));
    this.hostSource = source;
    try {
      await opened(source);
    } catch (err) {
      source.close();
      this.hostSource = null;
      throw err;
    }

    this.onState?.(this.state);
    await publish(this.allTopic, { t: 'state', s: pack(this.state), src: this.clientId });
    return code;
  }

  join(code: string, name: string): void {
    const room = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    void (async () => {
      try {
        this.code = room;
        this.isHost = false;
        this.clientId = `g${randomToken(10)}`;
        this.hostTopic = hostTopic(room);
        this.allTopic = allTopic(room);

        const source = subscribe(this.allTopic, (msg) => this.handleGuest(msg));
        this.guestSource = source;
        await opened(source);

        const hello = () => {
          void publish(this.hostTopic, { t: 'hello', name: name.trim().slice(0, 16) || 'Игрок', src: this.clientId });
        };

        hello();
        let tries = 0;
        this.helloTimer = setInterval(() => {
          tries += 1;
          if (tries > 4) {
            this.stopHello();
            return;
          }
          hello();
        }, 2500);

        this.joinTimer = setTimeout(() => {
          if (this.state) return;
          this.stopHello();
          this.onError?.('Комната не найдена или хост не в сети.');
        }, 15000);
      } catch (err) {
        this.onError?.((err as Error).message);
      }
    })();
  }

  private stopHello(): void {
    if (this.helloTimer) {
      clearInterval(this.helloTimer);
      this.helloTimer = null;
    }
    if (this.joinTimer) {
      clearTimeout(this.joinTimer);
      this.joinTimer = null;
    }
  }

  private handleHost(msg: Wire): void {
    if (msg.src === this.clientId || !this.state) return;

    if (msg.t === 'hello') {
      const existing = this.seats.get(msg.src);
      if (existing != null) {
        void this.sendTo({ t: 'seat', seat: existing, to: msg.src });
        void this.sendTo({ t: 'state', s: pack(this.state) });
        return;
      }
      if (this.state.started) {
        void this.sendTo({ t: 'err', message: 'Игра уже началась', to: msg.src });
        return;
      }

      const taken = new Set(this.seats.values());
      let seat = -1;
      for (let i = 0; i < 4; i++) {
        if (!taken.has(i)) {
          seat = i;
          break;
        }
      }
      if (seat < 0) {
        void this.sendTo({ t: 'err', message: 'В комнате уже четыре игрока', to: msg.src });
        return;
      }

      this.seats.set(msg.src, seat);
      const players = this.state.players.slice();
      players[seat] = {
        name: msg.name.slice(0, 16) || 'Игрок',
        seat,
        connected: true,
        eliminated: false,
      };
      this.state = { ...this.state, players };
      void this.sendTo({ t: 'seat', seat, to: msg.src });
      this.push();
      return;
    }

    if (msg.t === 'move') {
      const seat = this.seats.get(msg.src);
      if (seat == null) return;
      this.hostMove(seat, msg.from, msg.to);
      return;
    }

    if (msg.t === 'start' && this.seats.get(msg.src) === 0) {
      this.start();
    }
  }

  private handleGuest(msg: Wire): void {
    if (msg.src === this.clientId) return;

    if (msg.t === 'seat' && msg.to === this.clientId) {
      this.onSeat?.(msg.seat);
      return;
    }

    if (msg.t === 'state') {
      this.stopHello();
      this.state = unpack(msg.s);
      this.onState?.(this.state);
      return;
    }

    if (msg.t === 'err' && msg.to === this.clientId) {
      this.stopHello();
      this.onError?.(msg.message);
    }
  }

  private async sendTo(body: Body): Promise<void> {
    await publish(this.allTopic, { ...body, src: this.clientId } as Wire);
  }

  private push(): void {
    if (!this.state) return;
    this.onState?.(this.state);
    void this.sendTo({ t: 'state', s: pack(this.state) });
  }

  hostMove(seat: number, from: Square, to: Square): void {
    if (!this.state || !this.state.started || this.state.winner) return;
    if (this.state.turn !== seat) return;
    const next = applyMove(this.state, seat, from, to);
    if (!next) return;
    this.state = next;
    this.push();
  }

  sendMove(from: Square, to: Square): void {
    void publish(this.hostTopic, { t: 'move', from, to, src: this.clientId } as Wire);
  }

  start(): void {
    if (!this.isHost || !this.state || this.state.started) return;
    const next = beginGame(this.state);
    if (!next) {
      this.onError?.('Нужен хотя бы один игрок в каждой команде');
      return;
    }
    this.state = next;
    this.push();
  }

  rematch(): void {
    if (!this.isHost || !this.state) return;
    const players = this.state.players
      .filter((p): p is Player => !!p)
      .map((p) => ({ ...p, eliminated: false, connected: true }));
    const fresh = beginGame(createInitialState(players));
    if (!fresh) return;
    this.state = fresh;
    this.push();
  }

  destroy(): void {
    this.stopHello();
    this.hostSource?.close();
    this.guestSource?.close();
    this.hostSource = null;
    this.guestSource = null;
    this.seats.clear();
    this.state = null;
  }
}
