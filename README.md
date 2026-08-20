# test2

A WhatsApp bot (via [Baileys](https://github.com/WhiskeySockets/Baileys)) with:

- `.roblox <username>` — Roblox user info (avatar, join date, friends, followers, badges, status, bio)
- `.s` — reply to an image/video/sticker to make a sticker
- `.tovid` — reply to a sticker to convert it to `.mp4`
- `.vv` — reply to a view-once photo/video to reveal and resend it

## Setup (Termux / mobile terminal)

```bash
pkg update && pkg upgrade -y
pkg install nodejs-lts git ffmpeg -y

git clone https://github.com/00-ms/test2.git
cd test2
npm install

cp .env.example .env
```

# edit .env if you want a custom prefix, sticker pack name, or pairing-code login

`sharp` and `node-webpmux` are native modules — if `npm install` fails on `sharp`,
run `pkg install libvips` first, then retry.

## Running

```bash
npm start
```

- **QR login (default):** a QR code prints in the terminal. Scan it from
  WhatsApp → Linked Devices → Link a Device.
- **Pairing code login (better on a phone with a small terminal):** set
  `PAIRING_NUMBER=<your number with country code, no +>` in `.env`, then run
  `npm start`. A short pairing code prints — enter it in WhatsApp → Linked
  Devices → Link with phone number.

Session credentials are saved to `session/` so you don't have to re-link every
restart. Don't commit that folder — it's already in `.gitignore`.

## Keeping it running on mobile

Termux kills background processes when the app isn't in focus unless you:

```bash
termux-wake-lock
```

For a persistent daemon, consider `tmux` or `screen`:

```bash
pkg install tmux
tmux new -s test
npm start
# detach with Ctrl+B then D; reattach later with: tmux attach -t test
```

## Notes / limitations

- Roblox "Star" status and live Premium/game presence aren't available from
  public endpoints. Set `ROBLOSECURITY` in `.env` (a throwaway account's
  cookie) to enable live presence lookups; otherwise status shows "Unknown."
- `.s` limits animated stickers to 6 seconds and pads/crops to a square, per
  WhatsApp's sticker requirements.
- `ffmpeg` must be installed and on `PATH` — required for both `.s` and
  `.tovid`.

## Deploying to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/00-ms/test2.git
git push -u origin main
```

`.env` and `session/` are gitignored so your login/session and secrets never
get pushed.
