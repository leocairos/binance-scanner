---
name: verify
description: How to build, run, and browser-drive this Next.js app (Binance Scanner) for runtime verification.
---

# Verifying this app

This is a Next.js 16 (Turbopack) app. Routes: `/` (menu), `/futures` (active scanner, Binance Futures USDT-M), `/spot` (frozen archive, do not modify unless explicitly asked).

## Build / typecheck
```bash
npx next build   # fast sanity check: compiles + prerenders all routes
```

## Running a dev server for manual/agent verification
**Never run on port 3000 without checking first** — the user often has their own
`npm run dev` open in an IDE terminal on port 3000. Killing it or deleting
`.next/dev` while it's live will break their session (they'll see random 500s
until they restart it manually). Use a different port for your own testing:
```bash
npm run dev -- -p 3010   # run in background (run_in_background: true)
```
Do **not** `rm -rf .next/dev` if anything else might be using it — Next's dev
cache is shared across ports/processes in this container.

To find stray/orphaned `next-server` processes left over from prior test
runs (they hold the Next.js single-dev-server lock and cause `EADDRINUSE`/
"Another next dev server is already running" even on a fresh port):
```bash
ps aux | grep -E "next dev|next-server" | grep -v grep
```
Only kill PIDs you started yourself (check `ppid`/start time) — leave the
user's own terminal-owned dev server alone.

## Browser-driving with Playwright (no root in this container)
`npx playwright install chromium` downloads the browser binary fine, but
`chromium-headless-shell` fails to launch with missing shared libs
(`libnspr4.so`, `libnss3.so`, `libatk-1.0.so.0`, `libatk-bridge-2.0.so.0`,
`libdbus-1.so.3`, `libXcomposite.so.1`, `libXdamage.so.1`, `libXfixes.so.3`,
`libXrandr.so.2`, `libgbm.so.1`, `libxkbcommon.so.0`, `libasound.so.2`,
`libatspi.so.0`, `libdrm.so.2`, `libwayland-server.so.0`, `libXi.so.6`) —
and there's no root/sudo, so `apt-get install`/`apt-get update` both fail
with permission errors on the dpkg lock and `/var/lib/apt/lists`.

**Working fix — download and extract the `.deb`s manually (no root needed):**
```bash
SCRATCH=/tmp/claude-*/*/scratchpad   # use your actual scratchpad path
mkdir -p "$SCRATCH/debs/pkgs" "$SCRATCH/extracted"
cd "$SCRATCH/debs"
curl -s https://deb.debian.org/debian/dists/bookworm/main/binary-amd64/Packages.gz -o Packages.gz
gunzip -f Packages.gz

# resolve package -> pool path, then download, for each missing lib package:
for pkg in libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libdbus-1-3 \
           libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
           libxkbcommon0 libasound2 libasound2-data libatspi2.0-0 \
           libdrm2 libwayland-server0 libxi6; do
  line=$(grep -n "^Package: ${pkg}\$" Packages | head -1 | cut -d: -f1)
  [ -z "$line" ] && { echo "SKIP $pkg (bundled elsewhere, e.g. libnssutil3 ships inside libnss3)"; continue; }
  path=$(sed -n "${line},$((line+25))p" Packages | grep "^Filename:" | head -1 | awk '{print $2}')
  curl -s "https://deb.debian.org/debian/$path" -o "pkgs/$(basename "$path")"
done

for f in pkgs/*.deb; do dpkg-deb -x "$f" "$SCRATCH/extracted/"; done
```
Then launch Chromium with the extracted libs on `LD_LIBRARY_PATH`:
```bash
export LD_LIBRARY_PATH="$SCRATCH/extracted/usr/lib/x86_64-linux-gnu:$SCRATCH/extracted/lib/x86_64-linux-gnu"
```
Verify nothing's missing before running Playwright:
```bash
ldd /home/node/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell | grep "not found"
# should print nothing
```

The `playwright` npm package itself (if installed via `npx playwright ...`
rather than as a project devDependency) lives under npm's `_npx` cache, not
a normal `node_modules` — find it and point `NODE_PATH` at it:
```bash
find /home/node/.npm/_npx -maxdepth 2 -iname playwright
# e.g. /home/node/.npm/_npx/<hash>/node_modules
NODE_PATH="/home/node/.npm/_npx/<hash>/node_modules" node your_script.js
```

## What to drive
- `/futures`: click "INICIAR SCANNER", wait for `tbody tr` rows to populate
  (real network calls to `fapi.binance.com` + `api.coingecko.com`, can take
  several seconds), then interact:
  - Hover the Symbol cell → CoinGecko coin-detail tooltip (description) should
    appear, fully on top of neighboring sticky columns (Price) — check
    `getComputedStyle` z-index isn't clipped/behind if debugging overlap.
  - Click the Rank cell → opens `coinmarketcap.com/currencies/{id}/` in a new
    tab (don't actually navigate in tests — just read the `href`).
  - "Setor" column populates progressively in the background (one CoinGecko
    `/coins/{id}` call every ~1.2s per unique coin, to stay under the free
    rate limit) — cells show `...` until loaded, `N/A` on error/429.

## Gotchas
- **CoinGecko free-tier rate limit (~30 req/min)** is easy to blow through
  during testing — the app calls `/coins/{id}` once per unique coin
  (lazily on Symbol hover, and progressively in the background after every
  scan for the new "Setor" column). Repeated manual `curl` tests plus a
  Playwright run against the same IP can trigger `429`s; the app degrades
  gracefully (shows `N/A`/"Descrição não disponível." on failure) but you
  may see 429s and CORS-looking console errors (CoinGecko's 429 responses
  sometimes omit CORS headers, which the browser then reports as a CORS
  policy block instead of a clean 429 — this is expected under load, not a
  bug in the app).
- CoinGecko's own `categories` data is occasionally odd/mislabeled upstream
  (e.g. Bitcoin is tagged `Smart Contract Platform` on CoinGecko itself,
  confirmed via direct `curl` to their API) — don't mistake that for a bug
  in this app's category-picking logic. The app does filter out obvious
  noise tags (`index`, `holdings`, `portfolio`, `coinbase`, `ftx`,
  `multicoin`, `alameda`) before picking the top categories.
