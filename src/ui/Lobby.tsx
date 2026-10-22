import { useState } from 'react';

interface Props {
  busy: string;
  notice: string;
  initialRoom: string;
  onCreate: (name: string) => void;
  onJoin: (name: string, code: string) => void;
  onLocal: (names: string[]) => void;
}

type Tab = 'create' | 'join' | 'local';

export function Lobby({ busy, notice, initialRoom, onCreate, onJoin, onLocal }: Props) {
  const [tab, setTab] = useState<Tab>(initialRoom ? 'join' : 'create');
  const [name, setName] = useState('');
  const [room, setRoom] = useState(initialRoom);
  const [names, setNames] = useState(['Игрок 1', 'Игрок 2', 'Игрок 3', 'Игрок 4']);

  const ready = !!name.trim() && !busy;

  return (
    <div className="lobby">
      <div className="hero">
        <h1>
          Шахматы <em>на четверых</em>
        </h1>
        <p>
          Две команды по два игрока на доске-кресте 14×14. Откройте ссылку на телефоне или компьютере — и
          играйте с друзьями.
        </p>
      </div>

      <div className="card lobby-card">
        <div className="tabs">
          <button className={tab === 'create' ? 'tab active' : 'tab'} onClick={() => setTab('create')}>
            Создать комнату
          </button>
          <button className={tab === 'join' ? 'tab active' : 'tab'} onClick={() => setTab('join')}>
            Войти по коду
          </button>
          <button className={tab === 'local' ? 'tab active' : 'tab'} onClick={() => setTab('local')}>
            На одном устройстве
          </button>
        </div>

        {tab !== 'local' && (
          <label className="field">
            <span>Ваше имя</span>
            <input
              value={name}
              maxLength={16}
              placeholder="Например, Аня"
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}

        {tab === 'create' && (
          <div className="tab-body">
            <p className="hint">
              Вы станете хостом. Отправьте друзьям код комнаты или ссылку — они войдут с телефона или компьютера.
            </p>
            <button className="btn primary wide" disabled={!ready} onClick={() => onCreate(name)}>
              {busy || 'Создать комнату'}
            </button>
          </div>
        )}

        {tab === 'join' && (
          <div className="tab-body">
            <label className="field">
              <span>Код комнаты</span>
              <input
                value={room}
                maxLength={6}
                placeholder="ABCDE"
                autoComplete="off"
                onChange={(e) => setRoom(e.target.value.toUpperCase())}
              />
            </label>
            <button
              className="btn primary wide"
              disabled={!ready || room.trim().length < 4}
              onClick={() => onJoin(name, room)}
            >
              {busy || 'Войти в комнату'}
            </button>
          </div>
        )}

        {tab === 'local' && (
          <div className="tab-body">
            <p className="hint">Четверо за одним устройством: доска сама поворачивается к тому, чей ход.</p>
            <div className="names-grid">
              {names.map((value, i) => (
                <label className="field" key={i}>
                  <span>Игрок {i + 1}</span>
                  <input
                    value={value}
                    maxLength={16}
                    autoComplete="off"
                    onChange={(e) => setNames(names.map((v, k) => (k === i ? e.target.value : v)))}
                  />
                </label>
              ))}
            </div>
            <button className="btn primary wide" disabled={!!busy} onClick={() => onLocal(names)}>
              Начать партию
            </button>
          </div>
        )}
      </div>

      {notice && <div className="notice">{notice}</div>}

      <div className="rules">
        <div>
          <b>2 на 2.</b> Красные и жёлтые против зелёных и синих: союзники сидят друг напротив друга.
        </div>
        <div>
          <b>Ходы по часовой стрелке.</b> Фигуры союзника бить нельзя — только соперников.
        </div>
        <div>
          <b>Взяли короля</b> — соперник выбывает, его фигуры остаются на доске как препятствия. Команда
          проигрывает, потеряв оба короля.
        </div>
        <div>
          <b>Пешки</b> идут к противоположному краю доски и превращаются в ферзя.
        </div>
      </div>
    </div>
  );
}
