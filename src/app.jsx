import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';

const api = async (url, options = {}) => {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
};

const GRADE_LEVELS = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---------------- Login ----------------

function Login({ onLoggedIn, onBack }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
      onLoggedIn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen center">
      <form className="card login-card" onSubmit={submit}>
        <h1>👨‍🏫 Parent Dashboard</h1>
        <p className="subtle">Enter the parent password to continue</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Checking…' : 'Enter'}
        </button>
        {onBack && (
          <button type="button" className="btn" onClick={onBack}>
            ← Back
          </button>
        )}
      </form>
    </div>
  );
}

// ---------------- Mode select ----------------

function ModeSelect({ onPick }) {
  return (
    <div className="screen center">
      <div className="mode-grid">
        <button className="mode-card" onClick={() => onPick('parent')}>
          <span className="mode-emoji">👨‍🏫</span>
          <span>Parent Dashboard</span>
        </button>
        <button className="mode-card" onClick={() => onPick('student')}>
          <span className="mode-emoji">👦</span>
          <span>Student Practice</span>
        </button>
      </div>
    </div>
  );
}

// ---------------- Parent dashboard ----------------

function ChangePassword({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirm) {
      setError('New passwords do not match');
      return;
    }
    try {
      await api('/api/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="card" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Change Password</h2>
        {success ? (
          <>
            <p className="success">Password updated!</p>
            <button type="button" className="btn primary" onClick={onClose}>
              Done
            </button>
          </>
        ) : (
          <>
            <input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {error && <p className="error">{error}</p>}
            <div className="row gap">
              <button type="submit" className="btn primary">
                Update Password
              </button>
              <button type="button" className="btn" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function ParentDashboard({ onExit }) {
  const [lists, setLists] = useState([]);
  const [selectedList, setSelectedList] = useState(null);
  const [words, setWords] = useState([]);
  const [newListName, setNewListName] = useState('');
  const [newListGrade, setNewListGrade] = useState('');
  const [newListMode, setNewListMode] = useState('flip');
  const [term, setTerm] = useState('');
  const [definition, setDefinition] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [error, setError] = useState('');

  const loadLists = useCallback(async () => {
    const data = await api('/api/lists');
    setLists(data);
    return data;
  }, []);

  useEffect(() => {
    loadLists().catch((err) => setError(err.message));
  }, [loadLists]);

  const loadWords = useCallback(async (listId) => {
    const data = await api(`/api/lists/${listId}/words`);
    setWords(data.words);
  }, []);

  useEffect(() => {
    if (selectedList) loadWords(selectedList.id).catch((err) => setError(err.message));
  }, [selectedList, loadWords]);

  const createList = async (e) => {
    e.preventDefault();
    setError('');
    if (!newListName.trim()) return;
    try {
      const list = await api('/api/lists', {
        method: 'POST',
        body: JSON.stringify({
          name: newListName.trim(),
          gradeLevel: newListGrade,
          practiceMode: newListMode,
        }),
      });
      setNewListName('');
      setNewListGrade('');
      setNewListMode('flip');
      const updated = await loadLists();
      setSelectedList(updated.find((l) => l.id === list.id) || list);
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteList = async (list) => {
    if (!confirm(`Delete "${list.name}" and all its words?`)) return;
    setError('');
    try {
      await api(`/api/lists/${list.id}`, { method: 'DELETE' });
      if (selectedList && selectedList.id === list.id) {
        setSelectedList(null);
        setWords([]);
      }
      await loadLists();
    } catch (err) {
      setError(err.message);
    }
  };

  const addWord = async (e) => {
    e.preventDefault();
    setError('');
    if (!term.trim() || !definition.trim() || !selectedList) return;
    try {
      await api('/api/words', {
        method: 'POST',
        body: JSON.stringify({ listId: selectedList.id, term, definition }),
      });
      setTerm('');
      setDefinition('');
      await loadWords(selectedList.id);
      await loadLists();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteWord = async (word) => {
    setError('');
    try {
      await api(`/api/words/${word.id}`, { method: 'DELETE' });
      await loadWords(selectedList.id);
      await loadLists();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="screen">
      <header className="topbar">
        <h1>👨‍🏫 Parent Dashboard</h1>
        <div className="row gap">
          <button className="btn" onClick={() => setShowChangePassword(true)}>
            Change Password
          </button>
          <button className="btn" onClick={onExit}>
            Exit
          </button>
        </div>
      </header>

      {error && <p className="error banner">{error}</p>}

      <div className="two-panel">
        <div className="panel">
          <h2>Lists</h2>
          <form className="stack gap" onSubmit={createList}>
            <input
              placeholder="New list name (e.g. Biology Ch 3)"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
            />
            <div className="row gap">
              <select value={newListGrade} onChange={(e) => setNewListGrade(e.target.value)}>
                <option value="">Grade level (optional)</option>
                {GRADE_LEVELS.map((g) => (
                  <option key={g} value={g}>
                    Grade {g}
                  </option>
                ))}
              </select>
              <select value={newListMode} onChange={(e) => setNewListMode(e.target.value)}>
                <option value="flip">🔄 Flip cards</option>
                <option value="type">⌨️ Type the answer</option>
              </select>
            </div>
            <button className="btn primary" type="submit">
              Add List
            </button>
          </form>
          <ul className="list-items">
            {lists.map((list) => (
              <li
                key={list.id}
                className={`list-item ${selectedList && selectedList.id === list.id ? 'active' : ''}`}
              >
                <button className="list-item-name" onClick={() => setSelectedList(list)}>
                  {list.name}
                  {list.gradeLevel && <span className="badge">Grade {list.gradeLevel}</span>}
                  {list.practiceMode === 'type' && <span className="badge">⌨️ Type</span>}{' '}
                  <span className="subtle">({list.wordCount})</span>
                </button>
                <button className="icon-btn" title="Delete list" onClick={() => deleteList(list)}>
                  🗑️
                </button>
              </li>
            ))}
            {lists.length === 0 && <li className="subtle">No lists yet. Create one above.</li>}
          </ul>
        </div>

        <div className="panel">
          {selectedList ? (
            <>
              <h2>
                {selectedList.name}
                {selectedList.gradeLevel && <span className="badge">Grade {selectedList.gradeLevel}</span>}
                {selectedList.practiceMode === 'type' && <span className="badge">⌨️ Type</span>}
              </h2>
              <form className="stack gap" onSubmit={addWord}>
                <input
                  placeholder="Term"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                />
                <textarea
                  placeholder="Definition"
                  rows={3}
                  value={definition}
                  onChange={(e) => setDefinition(e.target.value)}
                />
                <button className="btn primary" type="submit">
                  Add Word
                </button>
              </form>
              <ul className="list-items">
                {words.map((w) => (
                  <li key={w.id} className="list-item">
                    <div>
                      <strong>{w.term}</strong> — {w.definition}
                    </div>
                    <button className="icon-btn" title="Delete word" onClick={() => deleteWord(w)}>
                      🗑️
                    </button>
                  </li>
                ))}
                {words.length === 0 && <li className="subtle">No words yet. Add one above.</li>}
              </ul>
            </>
          ) : (
            <p className="subtle">Select a list on the left to manage its words.</p>
          )}
        </div>
      </div>

      {showChangePassword && <ChangePassword onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}

// ---------------- Student practice ----------------

function StudentListSelect({ onPick, onExit }) {
  const [lists, setLists] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/lists')
      .then((data) => setLists(data.filter((l) => l.wordCount > 0)))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="screen">
      <header className="topbar">
        <h1>👦 Pick a List</h1>
        <button className="btn" onClick={onExit}>
          Exit
        </button>
      </header>
      {error && <p className="error banner">{error}</p>}
      <div className="mode-grid">
        {lists.map((list) => (
          <button key={list.id} className="mode-card" onClick={() => onPick(list)}>
            <span className="mode-emoji">{list.practiceMode === 'type' ? '⌨️' : '📖'}</span>
            <span>{list.name}</span>
            <span className="subtle">{list.wordCount} words</span>
          </button>
        ))}
        {lists.length === 0 && !error && (
          <p className="subtle">No lists with words yet. Ask a parent to add some!</p>
        )}
      </div>
    </div>
  );
}

function Flashcard({ word, flipped, onFlip }) {
  return (
    <div className={`flashcard ${flipped ? 'flipped' : ''}`} onClick={onFlip}>
      <div className="flashcard-inner">
        <div className="flashcard-face front">{word.term}</div>
        <div className="flashcard-face back">{word.definition}</div>
      </div>
    </div>
  );
}

function TypeAnswerCard({ word, onResult }) {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState('idle'); // 'idle' | 'correct' | 'incorrect'
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current && inputRef.current.focus();
  }, []);

  useEffect(() => {
    if (status !== 'correct') return;
    const timer = setTimeout(() => onResult(true), 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const submit = (e) => {
    e.preventDefault();
    if (status === 'incorrect') {
      onResult(false);
      return;
    }
    if (status === 'correct') return;
    const isRight = value.trim().toLowerCase() === word.definition.trim().toLowerCase();
    setStatus(isRight ? 'correct' : 'incorrect');
  };

  return (
    <form className={`quiz-card ${status}`} onSubmit={submit}>
      <div className="quiz-term">{word.term}</div>
      <input
        ref={inputRef}
        className="quiz-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={status === 'correct'}
        autoComplete="off"
        autoFocus
      />
      {status === 'incorrect' && (
        <p className="quiz-feedback incorrect">
          Answer: {word.definition} — press Enter for the next one
        </p>
      )}
      {status === 'correct' && <p className="quiz-feedback correct">✅ Correct!</p>}
      <button type="submit" className="btn primary">
        {status === 'incorrect' ? 'Next' : 'Enter ⏎'}
      </button>
    </form>
  );
}

function StudentPractice({ list, onExit }) {
  const [allWords, setAllWords] = useState([]);
  const [pile, setPile] = useState([]);
  const [mastered, setMastered] = useState([]);
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [round, setRound] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    api(`/api/lists/${list.id}/words`)
      .then((data) => {
        const shuffled = shuffle(data.words);
        setAllWords(shuffled);
        setPile(shuffled);
      })
      .catch((err) => setError(err.message));
  }, [list.id]);

  useEffect(() => {
    if (done) return;
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [done]);

  const advance = (gotIt) => {
    const [current, ...rest] = pile;
    setFlipped(false);
    setRound((r) => r + 1);
    if (gotIt) {
      const nextMastered = [...mastered, current];
      setMastered(nextMastered);
      if (rest.length === 0) {
        if (nextMastered.length >= allWords.length) {
          setDone(true);
          setPile([]);
        } else {
          setPile(shuffle(allWords.filter((w) => !nextMastered.some((m) => m.id === w.id))));
        }
      } else {
        setPile(rest);
      }
    } else {
      if (rest.length === 0) {
        setPile(shuffle([...rest, current]));
      } else {
        setPile([...rest, current]);
      }
    }
  };

  const restart = () => {
    const shuffled = shuffle(allWords);
    setMastered([]);
    setPile(shuffled);
    setDone(false);
    setFlipped(false);
    setElapsed(0);
    setRound((r) => r + 1);
  };

  if (error) {
    return (
      <div className="screen center">
        <p className="error">{error}</p>
        <button className="btn" onClick={onExit}>
          Back
        </button>
      </div>
    );
  }

  if (allWords.length === 0) {
    return (
      <div className="screen center">
        <p className="subtle">Loading…</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="screen center">
        <div className="celebration">
          <h1>🎉 You mastered {list.name}! 🎉</h1>
          <p>
            All {allWords.length} words learned in {formatTime(elapsed)}. Great job!
          </p>
          <div className="row gap">
            <button className="btn primary" onClick={restart}>
              Practice Again
            </button>
            <button className="btn" onClick={onExit}>
              Choose Another List
            </button>
          </div>
        </div>
      </div>
    );
  }

  const current = pile[0];

  return (
    <div className="screen center">
      <header className="topbar full">
        <button className="btn" onClick={onExit}>
          ← Lists
        </button>
        <div className="row gap">
          <div className="timer">⏱ {formatTime(elapsed)}</div>
          <div className="progress">
            {mastered.length}/{allWords.length} words
          </div>
        </div>
      </header>

      {list.practiceMode === 'type' ? (
        <TypeAnswerCard key={`${current.id}-${round}`} word={current} onResult={advance} />
      ) : (
        <>
          <Flashcard word={current} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />
          <p className="subtle">Tap the card to flip it</p>
          <div className="row gap">
            <button className="btn learning" onClick={() => advance(false)}>
              🔁 Keep Learning
            </button>
            <button className="btn gotit" onClick={() => advance(true)}>
              ✅ Got It!
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------- App shell ----------------

function App() {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [screen, setScreen] = useState('mode');
  const [activeList, setActiveList] = useState(null);

  useEffect(() => {
    api('/api/session')
      .then((data) => setAuthenticated(data.authenticated))
      .catch(() => setAuthenticated(false))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="screen center" />;

  if (screen === 'mode') {
    return (
      <ModeSelect
        onPick={(target) => setScreen(target === 'parent' && !authenticated ? 'parent-login' : target)}
      />
    );
  }

  if (screen === 'parent-login') {
    return (
      <Login
        onLoggedIn={() => {
          setAuthenticated(true);
          setScreen('parent');
        }}
        onBack={() => setScreen('mode')}
      />
    );
  }

  if (screen === 'parent') {
    return <ParentDashboard onExit={() => setScreen('mode')} />;
  }

  if (screen === 'student') {
    return (
      <StudentListSelect
        onPick={(list) => {
          setActiveList(list);
          setScreen('practice');
        }}
        onExit={() => setScreen('mode')}
      />
    );
  }

  if (screen === 'practice') {
    return <StudentPractice list={activeList} onExit={() => setScreen('student')} />;
  }

  return null;
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
