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

const PALE_BLUE = [173, 216, 230];
const DEEP_RED = [139, 0, 0];

function streakStyle(streak) {
  const t = Math.min(streak, 100) / 100;
  const [r, g, b] = PALE_BLUE.map((start, i) => Math.round(start + (DEEP_RED[i] - start) * t));
  return {
    color: `rgb(${r}, ${g}, ${b})`,
    fontSize: `${1.1 + t * 1.4}rem`,
    fontWeight: Math.round(500 + t * 400),
    transition: 'color 0.3s, font-size 0.3s, font-weight 0.3s',
  };
}

function parseMultiplicationTerm(term) {
  const match = /^(\d+)\s*×\s*(\d+)$/.exec(term);
  return match ? [Number(match[1]), Number(match[2])] : null;
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

function NotificationsPanel() {
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api('/api/notifications')
      .then((data) => setNotifications(data.filter((n) => !n.read)))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dismiss = async (id) => {
    try {
      await api(`/api/notifications/${id}/read`, { method: 'POST' });
      setNotifications((ns) => ns.filter((n) => n.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  const dismissAll = async () => {
    try {
      await api('/api/notifications/read-all', { method: 'POST' });
      setNotifications([]);
    } catch (err) {
      setError(err.message);
    }
  };

  if (error) return <p className="error banner">{error}</p>;
  if (notifications.length === 0) return null;

  return (
    <div className="panel notifications">
      <div className="row gap notifications-header">
        <strong>🔔 Notifications</strong>
        <button className="btn" onClick={dismissAll}>
          Dismiss All
        </button>
      </div>
      <ul className="list-items">
        {notifications.map((n) => (
          <li key={n.id} className="list-item">
            <div>{n.message}</div>
            <button className="icon-btn" title="Dismiss" onClick={() => dismiss(n.id)}>
              ✖️
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RewardConfig({ list }) {
  const [rewardTarget, setRewardTarget] = useState('');
  const [rewardText, setRewardText] = useState('');
  const [scores, setScores] = useState([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSaved(false);
    setError('');
    api(`/api/lists/${list.id}/reward`)
      .then((data) => {
        setRewardTarget(data.rewardTarget != null ? String(data.rewardTarget) : '');
        setRewardText(data.rewardText || '');
        setScores(data.scores);
      })
      .catch((err) => setError(err.message));
  }, [list.id]);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setSaved(false);
    try {
      await api(`/api/lists/${list.id}/reward`, {
        method: 'PUT',
        body: JSON.stringify({
          rewardTarget: rewardTarget.trim() ? Number(rewardTarget) : null,
          rewardText,
        }),
      });
      setSaved(true);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="panel">
      <h2>🏆 Beat Your Score Reward</h2>
      {scores.length > 0 ? (
        <p className="subtle">
          High scores: {scores.map((s) => `${s.studentName}: ${s.highScore}`).join(' · ')}
        </p>
      ) : (
        <p className="subtle">Assign this list to a student to start tracking high scores.</p>
      )}
      <form className="row gap" onSubmit={save}>
        <input
          type="number"
          min="1"
          placeholder="Target score (e.g. 20)"
          value={rewardTarget}
          onChange={(e) => setRewardTarget(e.target.value)}
        />
        <input
          placeholder="Reward (e.g. 30 minutes extra screen time)"
          value={rewardText}
          onChange={(e) => setRewardText(e.target.value)}
        />
        <button className="btn primary" type="submit">
          Save
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {saved && <p className="success">Saved!</p>}
    </div>
  );
}

function ParentDashboard({ students, onPreview, onExit }) {
  const [lists, setLists] = useState([]);
  const [selectedList, setSelectedList] = useState(null);
  const [words, setWords] = useState([]);
  const [newListName, setNewListName] = useState('');
  const [newListGrade, setNewListGrade] = useState('');
  const [newListMode, setNewListMode] = useState('flip');
  const [newListStudentIds, setNewListStudentIds] = useState([]);
  const [term, setTerm] = useState('');
  const [definition, setDefinition] = useState('');
  const [copyTarget, setCopyTarget] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [error, setError] = useState('');

  const studentName = (id) => (students.find((s) => s.id === id) || {}).name || 'Unknown';

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
          studentIds: newListStudentIds,
        }),
      });
      setNewListName('');
      setNewListGrade('');
      setNewListMode('flip');
      setNewListStudentIds([]);
      const updated = await loadLists();
      setSelectedList(updated.find((l) => l.id === list.id) || list);
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleNewListStudent = (studentId) => {
    setNewListStudentIds((ids) =>
      ids.includes(studentId) ? ids.filter((id) => id !== studentId) : [...ids, studentId]
    );
  };

  const toggleAssignment = async (studentId) => {
    if (!selectedList) return;
    const current = selectedList.assignedStudentIds || [];
    const next = current.includes(studentId)
      ? current.filter((id) => id !== studentId)
      : [...current, studentId];
    setError('');
    try {
      await api(`/api/lists/${selectedList.id}/assignments`, {
        method: 'PUT',
        body: JSON.stringify({ studentIds: next }),
      });
      setSelectedList((l) => ({ ...l, assignedStudentIds: next }));
      setLists((ls) => ls.map((l) => (l.id === selectedList.id ? { ...l, assignedStudentIds: next } : l)));
    } catch (err) {
      setError(err.message);
    }
  };

  const copyList = async () => {
    if (!selectedList || !copyTarget) return;
    setError('');
    try {
      await api(`/api/lists/${selectedList.id}/copy`, {
        method: 'POST',
        body: JSON.stringify({ studentId: Number(copyTarget) }),
      });
      setCopyTarget('');
      await loadLists();
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

      <NotificationsPanel />

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
            <div className="row gap">
              <span className="subtle">Visible to:</span>
              {students.map((s) => (
                <label key={s.id} className="row gap" style={{ alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={newListStudentIds.includes(s.id)}
                    onChange={() => toggleNewListStudent(s.id)}
                  />
                  {s.name}
                </label>
              ))}
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
                  {(list.assignedStudentIds || []).length > 0 ? (
                    list.assignedStudentIds.map((sid) => (
                      <span key={sid} className="badge">
                        → {studentName(sid)}
                      </span>
                    ))
                  ) : (
                    <span className="badge subtle">Unassigned</span>
                  )}{' '}
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

              <div className="row gap">
                <span className="subtle">Visible to:</span>
                {students.map((s) => (
                  <label key={s.id} className="row gap" style={{ alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={(selectedList.assignedStudentIds || []).includes(s.id)}
                      onChange={() => toggleAssignment(s.id)}
                    />
                    {s.name}
                  </label>
                ))}
              </div>

              <div className="row gap">
                <select value={copyTarget} onChange={(e) => setCopyTarget(e.target.value)}>
                  <option value="">Copy this list to…</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button className="btn" onClick={copyList} disabled={!copyTarget}>
                  📋 Copy
                </button>
              </div>

              <div className="row gap">
                {(selectedList.assignedStudentIds || []).length > 0 ? (
                  selectedList.assignedStudentIds.map((sid) => (
                    <button key={sid} className="btn" onClick={() => onPreview(selectedList, sid)}>
                      ▶️ Play as {studentName(sid)}
                    </button>
                  ))
                ) : (
                  <p className="subtle">Assign this list to a student to preview it as them.</p>
                )}
              </div>

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

      {selectedList && selectedList.name === 'Multiplication' && <RewardConfig list={selectedList} />}

      {showChangePassword && <ChangePassword onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}

// ---------------- Student practice ----------------

function StudentProfilePick({ students, onPick, onExit }) {
  return (
    <div className="screen center">
      <header className="topbar full">
        <button className="btn" onClick={onExit}>
          Exit
        </button>
      </header>
      <h1>👋 Who's playing?</h1>
      <div className="mode-grid">
        {students.map((s) => (
          <button key={s.id} className="mode-card" onClick={() => onPick(s)}>
            <span className="mode-emoji">🧒</span>
            <span>{s.name}</span>
          </button>
        ))}
        {students.length === 0 && <p className="subtle">No students set up yet.</p>}
      </div>
    </div>
  );
}

function StudentListSelect({ studentId, studentName, onPick, onSwitch, onExit }) {
  const [lists, setLists] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/api/lists?studentId=${studentId}`)
      .then((data) => setLists(data.filter((l) => l.wordCount > 0)))
      .catch((err) => setError(err.message));
  }, [studentId]);

  return (
    <div className="screen">
      <header className="topbar">
        <h1>👦 {studentName}'s Lists</h1>
        <div className="row gap">
          <button className="btn" onClick={onSwitch}>
            Switch
          </button>
          <button className="btn" onClick={onExit}>
            Exit
          </button>
        </div>
      </header>
      {error && <p className="error banner">{error}</p>}
      <div className="mode-grid">
        {lists.map((list) => (
          <button key={list.id} className="mode-card" onClick={() => onPick(list)}>
            <span className="mode-emoji">{list.name === 'Multiplication' ? '✖️' : list.practiceMode === 'type' ? '⌨️' : '📖'}</span>
            <span>{list.name}</span>
            <span className="subtle">{list.wordCount} {list.name === 'Multiplication' ? 'cards' : 'words'}</span>
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

function StudentPractice({ list, onExit, showStreak = false, itemLabel = 'words' }) {
  const [allWords, setAllWords] = useState([]);
  const [pile, setPile] = useState([]);
  const [mastered, setMastered] = useState([]);
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [round, setRound] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [streak, setStreak] = useState(0);

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
    setStreak((s) => (gotIt ? s + 1 : 0));
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
    setStreak(0);
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
            All {allWords.length} {itemLabel} learned in {formatTime(elapsed)}. Great job!
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
            {mastered.length}/{allWords.length} {itemLabel}
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

      {showStreak && <div style={streakStyle(streak)}>🔥 Streak: {streak}</div>}
    </div>
  );
}

// ---------------- Multiplication games ----------------

const MULTIPLICATION_MODES = [
  { id: 'beat-score', emoji: '🏆', label: 'Beat Your Score', desc: '60 seconds — how many can you get?' },
  { id: 'three-piles', emoji: '🗂️', label: 'Three Piles', desc: 'Sort cards by how fast you know them' },
  { id: 'missing-number', emoji: '❓', label: 'Missing Number', desc: 'Fill in the blank' },
  { id: 'practice', emoji: '✖️', label: 'Classic', desc: 'Work through every card' },
];

function MultiplicationModes({ isPreview, previewStudentName, onPick, onExit }) {
  return (
    <div className="screen">
      <header className="topbar">
        <h1>✖️ Multiplication</h1>
        <button className="btn" onClick={onExit}>
          Exit
        </button>
      </header>
      {isPreview && (
        <p className="subtle">🔍 Previewing as {previewStudentName} — scores and progress here aren't saved</p>
      )}
      <div className="mode-grid">
        {MULTIPLICATION_MODES.map((m) => (
          <button key={m.id} className="mode-card" onClick={() => onPick(m.id)}>
            <span className="mode-emoji">{m.emoji}</span>
            <span>{m.label}</span>
            <span className="subtle">{m.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function BeatYourScore({ list, studentId, isPreview, previewStudentName, onExit }) {
  const [allCards, setAllCards] = useState([]);
  const [highScore, setHighScore] = useState(null);
  const [phase, setPhase] = useState('ready'); // ready | playing | done
  const [current, setCurrent] = useState(null);
  const [value, setValue] = useState('');
  const [feedback, setFeedback] = useState(null); // 'correct' | 'incorrect' | null
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    Promise.all([
      api(`/api/lists/${list.id}/words`),
      api(`/api/lists/${list.id}/stats?studentId=${studentId}`),
    ])
      .then(([wordsData, stats]) => {
        setAllCards(wordsData.words);
        setHighScore(stats.highScore);
      })
      .catch((err) => setError(err.message));
  }, [list.id, studentId]);

  const pickNext = useCallback(
    (excludeId) => {
      if (allCards.length === 0) return null;
      let pick;
      do {
        pick = allCards[Math.floor(Math.random() * allCards.length)];
      } while (allCards.length > 1 && pick.id === excludeId);
      return pick;
    },
    [allCards]
  );

  const start = () => {
    setScore(0);
    setTimeLeft(60);
    setFeedback(null);
    setValue('');
    setResult(null);
    setCurrent(pickNext(null));
    setPhase('playing');
  };

  useEffect(() => {
    if (phase !== 'playing') return undefined;
    if (timeLeft <= 0) {
      setPhase('done');
      return undefined;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, timeLeft]);

  useEffect(() => {
    if (phase === 'playing' && inputRef.current) inputRef.current.focus();
  }, [phase, current]);

  useEffect(() => {
    if (phase !== 'done') return;
    if (isPreview) {
      // Preview runs are never saved — a parent playing through shouldn't be
      // able to overwrite (or even see themselves credited with) a student's
      // high score.
      setResult({
        highScore: Math.max(score, highScore),
        isNewHigh: score > highScore,
        rewardEarned: false,
        rewardText: null,
      });
      return;
    }
    api(`/api/lists/${list.id}/beat-score`, {
      method: 'POST',
      body: JSON.stringify({ score, studentId }),
    })
      .then((data) => {
        setHighScore(data.highScore);
        setResult(data);
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const submit = (e) => {
    e.preventDefault();
    if (!current || feedback) return;
    const isRight = value.trim().toLowerCase() === current.definition.trim().toLowerCase();
    setFeedback(isRight ? 'correct' : 'incorrect');
    if (isRight) setScore((s) => s + 1);
    const prev = current;
    setValue('');
    setTimeout(() => {
      setFeedback(null);
      setCurrent(pickNext(prev.id));
    }, 250);
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

  if (allCards.length === 0 || highScore === null) {
    return (
      <div className="screen center">
        <p className="subtle">Loading…</p>
      </div>
    );
  }

  if (phase === 'ready') {
    return (
      <div className="screen center">
        <div className="card">
          {isPreview && (
            <p className="subtle">🔍 Previewing as {previewStudentName} — nothing here is saved</p>
          )}
          <h1>🏆 Beat Your Score</h1>
          <p className="subtle">Answer as many cards as you can in 60 seconds.</p>
          <p className="progress">High Score: {highScore}</p>
          <button className="btn primary" onClick={start}>
            Start
          </button>
          <button className="btn" onClick={onExit}>
            Back
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="screen center">
        <div className="celebration">
          {isPreview && (
            <p className="subtle">🔍 Previewing as {previewStudentName} — this score was not saved</p>
          )}
          <h1>⏱ Time's up!</h1>
          <p>You answered {score} correctly.</p>
          {result ? (
            <>
              <p className="progress">
                High Score: {result.highScore}
                {result.isNewHigh ? ' — New high score! 🎉' : ''}
              </p>
              {result.rewardEarned && (
                <p className="success">🎉 Reward earned: {result.rewardText || 'Great job!'}</p>
              )}
            </>
          ) : (
            <p className="subtle">Saving score…</p>
          )}
          <div className="row gap">
            <button className="btn primary" onClick={start}>
              Play Again
            </button>
            <button className="btn" onClick={onExit}>
              Back to Games
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen center">
      <header className="topbar full">
        <button className="btn" onClick={onExit}>
          ← Games
        </button>
        <div className="row gap">
          <div className="timer">⏱ {timeLeft}s</div>
          <div className="progress">Score: {score}</div>
        </div>
      </header>
      <form className={`quiz-card ${feedback || ''}`} onSubmit={submit}>
        <div className="quiz-term">{current.term}</div>
        <input
          ref={inputRef}
          className="quiz-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!!feedback}
          autoComplete="off"
          autoFocus
        />
        <button type="submit" className="btn primary" disabled={!!feedback}>
          Enter ⏎
        </button>
      </form>
    </div>
  );
}

function ThreePiles({ list, studentId, isPreview, previewStudentName, onExit }) {
  const [deck, setDeck] = useState(null); // null = loading
  const [index, setIndex] = useState(0);
  const [piles, setPiles] = useState({ easy: 0, almost: 0, needs_practice: 0 });
  const [flight, setFlight] = useState(null);
  const [value, setValue] = useState('');
  const [round, setRound] = useState(0);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const cardStartRef = useRef(Date.now());

  const load = useCallback(() => {
    api(`/api/lists/${list.id}/words?studentId=${studentId}`)
      .then((data) => {
        const remaining = data.words.filter((w) => w.threePiles !== 'easy');
        setDeck(shuffle(remaining));
        setIndex(0);
        setPiles({ easy: 0, almost: 0, needs_practice: 0 });
        setRound((r) => r + 1);
      })
      .catch((err) => setError(err.message));
  }, [list.id, studentId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    cardStartRef.current = Date.now();
    setValue('');
    if (inputRef.current) inputRef.current.focus();
  }, [index, round]);

  const current = deck && deck[index];

  const classify = (isRight, elapsedSeconds) => {
    if (!isRight) return 'needs_practice';
    if (elapsedSeconds <= 3) return 'easy';
    if (elapsedSeconds <= 10) return 'almost';
    return 'needs_practice';
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!current || flight) return;
    const elapsedSeconds = (Date.now() - cardStartRef.current) / 1000;
    const isRight = value.trim().toLowerCase() === current.definition.trim().toLowerCase();
    const status = classify(isRight, elapsedSeconds);

    setFlight(status);
    setPiles((p) => ({ ...p, [status]: p[status] + 1 }));

    if (!isPreview) {
      try {
        await api(`/api/words/${current.id}/three-piles`, {
          method: 'POST',
          body: JSON.stringify({ status, studentId }),
        });
      } catch (err) {
        setError(err.message);
      }
    }

    setTimeout(() => {
      setFlight(null);
      setIndex((i) => i + 1);
    }, 500);
  };

  const resetProgress = async () => {
    if (!confirm('Reset all Three Piles progress for this list?')) return;
    setError('');
    try {
      await api(`/api/lists/${list.id}/three-piles/reset`, {
        method: 'POST',
        body: JSON.stringify({ studentId }),
      });
      load();
    } catch (err) {
      setError(err.message);
    }
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

  if (deck === null) {
    return (
      <div className="screen center">
        <p className="subtle">Loading…</p>
      </div>
    );
  }

  const done = index >= deck.length;

  return (
    <div className="screen center">
      <header className="topbar full">
        <button className="btn" onClick={onExit}>
          ← Games
        </button>
        {!isPreview && (
          <button className="btn" onClick={resetProgress}>
            🔄 Reset Progress
          </button>
        )}
      </header>
      {isPreview && (
        <p className="subtle">🔍 Previewing as {previewStudentName} — sorting here isn't saved</p>
      )}

      {done ? (
        <div className="celebration">
          <h1>
            {piles.easy + piles.almost + piles.needs_practice === 0
              ? '🎉 Everything is already Easy!'
              : '🗂️ Sorted!'}
          </h1>
          <p>
            Easy: {piles.easy} · Almost: {piles.almost} · Need Practice: {piles.needs_practice}
          </p>
          <div className="row gap">
            <button className="btn primary" onClick={load}>
              Sort Again
            </button>
            <button className="btn" onClick={onExit}>
              Back to Games
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="progress">
            {index + 1}/{deck.length}
          </p>
          <form className={`quiz-card flight-${flight || 'none'}`} onSubmit={submit}>
            <div className="quiz-term">{current.term}</div>
            <input
              ref={inputRef}
              className="quiz-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={!!flight}
              autoComplete="off"
              autoFocus
            />
            <button type="submit" className="btn primary" disabled={!!flight}>
              Enter ⏎
            </button>
          </form>
          <div className="pile-row">
            <div className={`pile-box ${flight === 'easy' ? 'flash' : ''}`}>
              <div className="pile-silhouette">🫥</div>
              <div>Easy</div>
              <div className="subtle">{piles.easy}</div>
            </div>
            <div className={`pile-box ${flight === 'almost' ? 'flash' : ''}`}>
              <div className="pile-silhouette">🫥</div>
              <div>Almost</div>
              <div className="subtle">{piles.almost}</div>
            </div>
            <div className={`pile-box ${flight === 'needs_practice' ? 'flash' : ''}`}>
              <div className="pile-silhouette">🫥</div>
              <div>Need Practice</div>
              <div className="subtle">{piles.needs_practice}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MissingNumber({ list, onExit }) {
  const [puzzles, setPuzzles] = useState([]);
  const [pile, setPile] = useState([]);
  const [mastered, setMastered] = useState([]);
  const [done, setDone] = useState(false);
  const [round, setRound] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/api/lists/${list.id}/words`)
      .then((data) => {
        const built = data.words
          .map((w) => {
            const parsed = parseMultiplicationTerm(w.term);
            if (!parsed) return null;
            const [a, b] = parsed;
            const blankFirst = Math.random() < 0.5;
            const term = blankFirst ? `? × ${b} = ${w.definition}` : `${a} × ? = ${w.definition}`;
            const answer = blankFirst ? String(a) : String(b);
            return { id: w.id, term, definition: answer };
          })
          .filter(Boolean);
        const shuffled = shuffle(built);
        setPuzzles(shuffled);
        setPile(shuffled);
      })
      .catch((err) => setError(err.message));
  }, [list.id]);

  const advance = (gotIt) => {
    const [current, ...rest] = pile;
    setRound((r) => r + 1);
    if (gotIt) {
      const nextMastered = [...mastered, current];
      setMastered(nextMastered);
      if (rest.length === 0) {
        if (nextMastered.length >= puzzles.length) {
          setDone(true);
          setPile([]);
        } else {
          setPile(shuffle(puzzles.filter((p) => !nextMastered.some((m) => m.id === p.id))));
        }
      } else {
        setPile(rest);
      }
    } else if (rest.length === 0) {
      setPile(shuffle([...rest, current]));
    } else {
      setPile([...rest, current]);
    }
  };

  const restart = () => {
    setMastered([]);
    setPile(shuffle(puzzles));
    setDone(false);
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

  if (puzzles.length === 0) {
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
          <h1>❓ All solved!</h1>
          <p>You filled in all {puzzles.length} missing numbers.</p>
          <div className="row gap">
            <button className="btn primary" onClick={restart}>
              Play Again
            </button>
            <button className="btn" onClick={onExit}>
              Back to Games
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
          ← Games
        </button>
        <div className="progress">
          {mastered.length}/{puzzles.length}
        </div>
      </header>
      <TypeAnswerCard key={`${current.id}-${round}`} word={current} onResult={advance} />
    </div>
  );
}

// ---------------- App shell ----------------

function App() {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [screen, setScreen] = useState('mode');
  const [activeList, setActiveList] = useState(null);
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState(() => {
    try {
      const stored = localStorage.getItem('vocab.studentId');
      return stored ? Number(stored) : null;
    } catch {
      return null;
    }
  });
  // Non-null while a parent is previewing a game from the dashboard: holds
  // the student whose high score/progress to show, but nothing played here
  // is ever saved (see BeatYourScore/ThreePiles) — this is how a parent's
  // own runs stop overwriting a student's high score.
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    Promise.all([api('/api/session'), api('/api/students')])
      .then(([session, studentList]) => {
        setAuthenticated(session.authenticated);
        setStudents(studentList);
      })
      .catch(() => setAuthenticated(false))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="screen center" />;

  const studentName = (id) => (students.find((s) => s.id === id) || {}).name || '';

  const chooseStudent = (student) => {
    setStudentId(student.id);
    try {
      localStorage.setItem('vocab.studentId', String(student.id));
    } catch {
      /* ignore - localStorage may be unavailable */
    }
    setScreen('student');
  };

  const startPreview = (list, previewedStudentId) => {
    setActiveList(list);
    setPreview({ studentId: previewedStudentId });
    setScreen(list.name === 'Multiplication' ? 'multiplication-modes' : 'practice');
  };

  const exitToParent = () => {
    setPreview(null);
    setScreen('parent');
  };

  if (screen === 'mode') {
    return (
      <ModeSelect
        onPick={(target) => {
          if (target === 'parent') return setScreen(authenticated ? 'parent' : 'parent-login');
          setScreen(studentId ? 'student' : 'student-pick');
        }}
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
    return (
      <ParentDashboard
        students={students}
        onPreview={startPreview}
        onExit={() => setScreen('mode')}
      />
    );
  }

  if (screen === 'student-pick') {
    return (
      <StudentProfilePick students={students} onPick={chooseStudent} onExit={() => setScreen('mode')} />
    );
  }

  if (screen === 'student') {
    return (
      <StudentListSelect
        studentId={studentId}
        studentName={studentName(studentId)}
        onPick={(list) => {
          setActiveList(list);
          setScreen(list.name === 'Multiplication' ? 'multiplication-modes' : 'practice');
        }}
        onSwitch={() => setScreen('student-pick')}
        onExit={() => setScreen('mode')}
      />
    );
  }

  const isPreview = !!preview;
  const effectiveStudentId = isPreview ? preview.studentId : studentId;
  const previewStudentName = isPreview ? studentName(preview.studentId) : '';
  const backToStudentLists = isPreview ? exitToParent : () => setScreen('student');

  if (screen === 'multiplication-modes') {
    return (
      <MultiplicationModes
        isPreview={isPreview}
        previewStudentName={previewStudentName}
        onPick={(mode) => setScreen(mode)}
        onExit={backToStudentLists}
      />
    );
  }

  const backToMultiplicationModes = () => setScreen('multiplication-modes');

  if (screen === 'beat-score') {
    return (
      <BeatYourScore
        list={activeList}
        studentId={effectiveStudentId}
        isPreview={isPreview}
        previewStudentName={previewStudentName}
        onExit={backToMultiplicationModes}
      />
    );
  }

  if (screen === 'three-piles') {
    return (
      <ThreePiles
        list={activeList}
        studentId={effectiveStudentId}
        isPreview={isPreview}
        previewStudentName={previewStudentName}
        onExit={backToMultiplicationModes}
      />
    );
  }

  if (screen === 'missing-number') {
    return <MissingNumber list={activeList} onExit={backToMultiplicationModes} />;
  }

  if (screen === 'practice') {
    const isMultiplication = activeList && activeList.name === 'Multiplication';
    return (
      <StudentPractice
        list={activeList}
        onExit={() => (isMultiplication ? setScreen('multiplication-modes') : backToStudentLists())}
        showStreak={isMultiplication}
        itemLabel={isMultiplication ? 'cards' : 'words'}
      />
    );
  }

  return null;
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
