# 📚 Vocab Cards

A small full-stack flashcard app for family vocabulary practice: a parent dashboard for
managing word lists, and a kid-friendly practice mode with flip cards and a
"keep learning" / "got it" sorting flow.

See [QUICKSTART.md](QUICKSTART.md) to get running in a few minutes, and
[ARCHITECTURE.md](ARCHITECTURE.md) for how it's put together.

## Features

**Parent Dashboard**
- Create and delete vocabulary lists, each with an optional grade level and a
  practice mode: 🔄 flip cards, or ⌨️ type the answer
- Add and delete term/definition pairs
- Change the shared family password

**Student Practice**
- **Flip mode**: pick a list, flip cards by tapping them, sort each into "Keep
  Learning" 🔁 or "Got It!" ✅
- **Type mode**: an auto-focused text box for the answer — press Enter or the
  submit button to check it. Right answers auto-advance; wrong ones show the
  correct answer and go to the back of the pile to retry
- Either way: the pile reshuffles and cycles until every word is mastered, a
  live timer runs the whole session, and there's a progress counter (e.g.
  5/15 words) plus a celebration screen with your time when the list is complete
- Comes with a built-in **Multiplication** list (all 1–12 times tables, 144
  cards) in type mode, created automatically the first time the server starts

**Multiplication Games** — picking the Multiplication list opens 4 game modes
instead of going straight to practice:
- **🏆 Beat Your Score** — 60 seconds, answer as many cards as you can. Keeps
  a persistent high score, and parents can set a target score with a reward
  (Parent Dashboard → select Multiplication) — hitting it sends an in-app
  notification to the Parent Dashboard.
- **🗂️ Three Piles** — answer each card once; cards you get right in ≤3s go to
  "Easy", ≤10s go to "Almost", and anything slower or wrong goes to "Need
  Practice". Future rounds skip cards already sorted into Easy. Students can
  reset their own progress any time from the in-game "🔄 Reset Progress" button.
- **❓ Missing Number** — one factor is blanked out (`? × 5 = 25`) and you type
  the missing number; cycles like Classic until every equation is solved.
- **✖️ Classic** — the regular type-the-answer practice, plus a streak counter
  that grows and shifts from pale blue to deep red as it climbs toward 100.

## Tech stack

- **Backend**: Node.js + Express
- **Database**: SQLite (via `better-sqlite3`), stored locally in `vocab.db`
- **Frontend**: React, bundled with esbuild into a single static bundle
- **Auth**: one shared password (bcrypt-hashed) gating the Parent Dashboard only —
  students can browse lists and practice without logging in
- **Network**: listens on all interfaces, so any device on the same WiFi can connect

## Commands

```bash
npm install   # installs deps and builds the frontend (postinstall)
npm run build # rebuild the frontend bundle only
npm start     # start the server on http://localhost:3000
```

## Data & backups

Everything lives in `vocab.db` in this folder (lists, words, password hash).
To back up your data, just copy that file somewhere safe. To restore, copy it back
and restart the server.

## Default login

Password: `password123` — change it immediately from Parent Dashboard → Change Password.
Only needed for the Parent Dashboard; **Student Practice needs no password at all** —
opening the page and picking "Student Practice" goes straight to practicing.

## Notes on the original spec

A couple of things were simplified from the original feature list for reliability:

- **Sorting** is done with buttons ("Keep Learning" / "Got It!") rather than drag-and-drop,
  since buttons work reliably on phones/tablets as well as desktop.
- **Mastery is per-session**, not persisted across visits — each practice session starts
  fresh with the full list. Persisting long-term progress per student would be a
  reasonable extension (see ARCHITECTURE.md).
- There isn't a separate parent vs. student login — the whole family shares one password,
  used only to unlock the Parent Dashboard. This still matches the "single shared
  password" design from the original spec, just scoped to management instead of the
  whole app, so kids aren't blocked by a password screen to practice.

## Troubleshooting

**"Server won't start"**
Make sure Node.js is installed (`node --version`) and you ran `npm install` in this folder.

**"Can't connect from other device"**
Check the IP address, confirm both devices are on the same WiFi, and check your
computer's firewall isn't blocking incoming connections on port 3000.

**"Database locked"**
Close other tabs/instances hitting the app and restart the server.

**"Page won't load / looks broken after an update"**
Run `npm run build` to rebuild the frontend bundle, then restart `npm start`.
