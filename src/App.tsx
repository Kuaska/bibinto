import { useCallback, useMemo, useRef, useState } from 'react';
import { Board } from './ui/Board';
import { Lobby } from './ui/Lobby';
import { Net } from './net/net';
import { applyMove } from './game/rules';
import { beginGame, createInitialState } from './game/board';
import { ARMY_HEX, ARMY_RU, SEAT_ARMY } from './game/types';
import type { GameState, Player, Square } from './game/types';

type Mode = 'lobby' | 'host' | 'guest' | 'local';

const TEAM_LABEL = ['Красные + Жёлтые', 'Зелёные + Синие'];

export default function App() {
  const demo = useMemo(() => new URLSearchParams(window.location.search).has('demo'), []);
  const [mode, setMode] = useState<Mode>(demo ? 'local' : 'lobby');
  const [state, setState] = useState<GameState | null>(() =>
    demo
      ? beginGame(
          createInitialState([
            { name: 'Аня', seat: 0, connected: true, eliminated: false },
            { name: 'Борис', seat: 1, connected: true, eliminated: false },
            { name: 'Вера', seat: 2, connected: true, eliminated: false },
            { name: 'Гриша', seat: 3, connected: true, eliminated: false },
          ]),
        )
      : null,
  );
  const [mySeat, setMySeat] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const netRef = useRef<Net | null>(null);

  const initialRoom = useMemo(
    () => new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '',
    [],
  );

  const wire = (net: Net) => {
    net.onState = (s) => setState(s);
    net.onSeat = (s) => setMySeat(s);
    net.onError = (m) => setNotice(m);
    net.onClosed = (m) => setNotice(m);
  };

  const createRoom = async (name: string) => {
    setBusy('Создаём комнату…');
    setNotice('');
    const net = new Net();
    wire(net);
    netRef.current = net;
    try {
      const room = await net.host(name);
      setMySeat(0);
      setCode(room);
      setMode('host');
      setBusy('');
    } catch (err) {
      setBusy('');
      setMode('lobby');
      setNotice((err as Error).message);
    }
  };

  const joinRoom = (name: string, room: string) => {
    setBusy('Подключаемся…');
    setNotice('');
    const net = new Net();
    wire(net);
    net.onState = (s) => {
      setState(s);
      setBusy('');
    };
    net.onError = (m) => {
      setBusy('');
      setMode('lobby');
      setNotice(m);
    };
    netRef.current = net;
    setMySeat(null);
    setCode(room.trim().toUpperCase());
    setMode('guest');
    net.join(room, name);
  };

  const startLocal = (names: string[]) => {
    const players: Player[] = names.map((name, seat) => ({
      name: name.trim() || `Игрок ${seat + 1}`,
      seat,
      connected: true,
      eliminated: false,
    }));
    const fresh = beginGame(createInitialState(players));
    if (!fresh) return;
    netRef.current?.destroy();
    netRef.current = null;
    setState(fresh);
    setMySeat(0);
    setCode('');
    setMode('local');
  };

  const handleMove = useCallback(
    (from: Square, to: Square) => {
      if (!state || !state.started || state.winner) return;
      if (mode === 'local') {
        const next = applyMove(state, state.turn, from, to);
        if (next) setState(next);
        return;
      }
      if (mode === 'host') {
        netRef.current?.hostMove(state.turn, from, to);
        return;
      }
      netRef.current?.sendMove(from, to);
    },
    [state, mode],
  );

  const share = async () => {
    if (!code) return;
    const url = `${location.origin}${location.pathname}?room=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice(`Ссылка: ${url}`);
    }
  };

  const leave = () => {
    netRef.current?.destroy();
    netRef.current = null;
    setState(null);
    setMode('lobby');
    setNotice('');
    setBusy('');
    setCopied(false);
    setMySeat(0);
  };

  if (mode === 'lobby' || !state || (mode === 'guest' && mySeat === null)) {
    return (
      <div className="lobby-page">
        <Lobby
          busy={busy}
          notice={notice}
          initialRoom={initialRoom}
          onCreate={createRoom}
          onJoin={joinRoom}
          onLocal={startLocal}
        />
      </div>
    );
  }

  const viewSeat = mode === 'local' ? state.turn : (mySeat ?? 0);
  const interactive =
    (mode === 'local' || mySeat !== null) && !!state.started && !state.winner && (mode === 'local' || state.turn === mySeat);
  const filled = state.players.filter(Boolean).length;
  const current = state.players[state.turn];

  const teamAlive = (team: number) =>
    (team === 0 ? [0, 2] : [1, 3]).filter((k) => {
      const p = state.players[k];
      return !!p && !p.eliminated;
    }).length;

  const winnerText = state.winner
    ? state.winner.map((s) => ARMY_RU[SEAT_ARMY[s]]).join(' и ')
    : '';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Шахматы <span>4×4</span>
        </div>
        {code && (
          <button className="room-chip" onClick={share} title="Скопировать ссылку на комнату">
            Комната <b>{code}</b>
          </button>
        )}
        {mode === 'local' && <span className="room-chip">На одном устройстве</span>}
        <div className="spacer" />
        {mode !== 'local' && code && (
          <button className="btn ghost" onClick={share}>
            {copied ? 'Скопировано' : 'Пригласить'}
          </button>
        )}
        <button className="btn ghost" onClick={leave}>
          Выйти
        </button>
      </header>

      <main className="layout">
        <section className="board-area">
          <div className={`turnbar${state.winner ? ' win' : ''}`}>
            {state.winner ? (
              <span>
                Победа: <b>{winnerText}</b>
              </span>
            ) : !state.started ? (
              <span>Ждём начала игры · игроков {filled}/4</span>
            ) : (
              <>
                <span className="dot" style={{ background: ARMY_HEX[SEAT_ARMY[state.turn]] }} />
                <span>
                  <b>{current?.name ?? 'Игрок'}</b> · {ARMY_RU[SEAT_ARMY[state.turn]]}
                </span>
                <span className="turn-hint">{interactive ? 'ваш ход' : 'ходит'}</span>
              </>
            )}
          </div>

          <Board state={state} seat={viewSeat} interactive={interactive} onMove={handleMove} />

          {notice && <div className="notice">{notice}</div>}
          {mode !== 'local' && code && (
            <div className="share-line">
              Ссылка для друзей:{' '}
              <button className="link" onClick={share}>
                {location.host}
                {location.pathname}?room={code}
              </button>
            </div>
          )}
        </section>

        <aside className="side">
          <div className="card">
            <h3>Команды</h3>
            {[0, 1].map((team) => (
              <div className="team" key={team}>
                <span className="team-dots">
                  <i style={{ background: ARMY_HEX[SEAT_ARMY[team]] }} />
                  <i style={{ background: ARMY_HEX[SEAT_ARMY[team + 2]] }} />
                </span>
                <span className="team-name">{TEAM_LABEL[team]}</span>
                <span className="team-count">{teamAlive(team)}/2</span>
              </div>
            ))}
          </div>

          <div className="card">
            <h3>
              Игроки <span className="muted">{filled}/4</span>
            </h3>
            {[0, 1, 2, 3].map((i) => {
              const player = state.players[i];
              const active = state.started && !state.winner && state.turn === i;
              const cls = ['player'];
              if (active) cls.push('active');
              if (player?.eliminated) cls.push('dead');
              return (
                <div className={cls.join(' ')} key={i}>
                  <span className="dot" style={{ background: ARMY_HEX[SEAT_ARMY[i]] }} />
                  <span className="pname">{player ? player.name : 'свободное место'}</span>
                  {player && mode !== 'local' && i === mySeat && <span className="tag">вы</span>}
                  {player?.eliminated && <span className="tag">выбыл</span>}
                  {player && !player.connected && <span className="tag">офлайн</span>}
                  {active && <span className="tag turn">ход</span>}
                </div>
              );
            })}
          </div>

          <div className="card actions">
            {mode === 'host' && !state.started && (
              <>
                <p className="hint">
                  В комнате {filled} из 4. Можно начать и вдвоём — армии пустых мест уберутся.
                </p>
                <button className="btn primary wide" onClick={() => netRef.current?.start()}>
                  Начать игру
                </button>
              </>
            )}
            {mode === 'host' && state.winner && (
              <button className="btn primary wide" onClick={() => netRef.current?.rematch()}>
                Сыграть снова
              </button>
            )}
            {mode === 'host' && state.started && !state.winner && (
              <p className="hint">
                Партия идёт. Вы хост: если закрыть вкладку, комната закроется.
              </p>
            )}
            {mode === 'guest' && (
              <p className="hint">
                {state.started
                  ? state.winner
                    ? 'Партия окончена. Ждём хоста.'
                    : 'Ходит тот, чьё имя подсвечено.'
                  : 'Ждём, пока хост начнёт игру.'}
              </p>
            )}
            {mode === 'local' && (
              <p className="hint">Передавайте устройство по кругу — доска поворачивается сама.</p>
            )}
          </div>

          <div className="card log">
            <h3>Ходы</h3>
            <ul>
              {state.log
                .slice(-9)
                .reverse()
                .map((line, i) => (
                  <li key={`${state.log.length}-${i}`}>{line}</li>
                ))}
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}
