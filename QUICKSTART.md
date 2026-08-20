# Quickstart

## 1. Install Node.js

Download the LTS version from https://nodejs.org/ if you don't already have it.
Check it's installed:

```bash
node --version
```

## 2. Install & run

From this folder:

```bash
npm install
npm start
```

`npm install` also builds the frontend automatically (via the `postinstall` script).
You should see:

```
Vocab app running:
  Local:   http://localhost:3000
  Network: http://<your-computer-ip>:3000
```

## 3. Open it

- On this computer: http://localhost:3000
- On your kid's device (same WiFi): http://YOUR-COMPUTER-IP:3000

To find your computer's IP address:

- **Windows**: open Command Prompt, run `ipconfig`, look for "IPv4 Address"
- **Mac**: System Settings → Wi-Fi → Details, or run `ipconfig getifaddr en0` in Terminal
- **Linux**: run `hostname -I`

## 4. Set your password

Page load takes you to a mode screen — no password needed yet. Click
**Parent Dashboard** and log in with the default password: `password123`.
Go to **Change Password** and set your own right away. Students never see
this screen — **Student Practice** works with no login at all.

## 5. Try the built-in Multiplication list

The first time the server starts, it automatically creates a **Multiplication**
list with all the 1–12 times tables (144 cards) in "type the answer" mode —
nothing to set up. From the mode screen, pick **Student Practice → Multiplication**
to try it: the answer box is focused automatically, press Enter (or the button)
to check each one, and a timer runs in the header the whole time.

## 6. Add your own list

1. Parent Dashboard → type a list name (e.g. "Biology Ch 3"), optionally pick a
   grade level and a practice mode (🔄 flip cards, or ⌨️ type the answer) → Add List
2. Click the list → add term/definition pairs
3. Have your kid pick **Student Practice** from the mode screen and choose the list

That's it.
