# Words From Word

A modern word game. Each round the game picks a long word (10+ letters), and
you make as many smaller words (2+ letters) from its letters as you can.

![Words From Word](https://img.shields.io/badge/game-word%20puzzle-6366f1)

## How to play

1. Press **New word** to get a fresh 10–14 letter word.
2. Type any word you can spell using only those letters (each letter can be
   used at most as many times as it appears in the source word).
3. Words must be **at least 3 letters** and in the dictionary.
4. The header shows how many words are possible for the current word, so you
   always know how many are left to find.
5. Longer words score more points.
6. Stuck? **Reveal remaining** shows the words you missed.

## Game modes

Pick a mode from the tabs at the top of the play card:

- **🎯 Practice** — no pressure. Play a word, press *New word* whenever you like.
- **⏱️ Timed** — a 2-minute countdown. Find as many words as you can before time
  runs out; your best single-round score is tracked.
- **📅 Daily** — one word per day, generated deterministically from the date so
  everyone gets the same word. Your progress is saved and resumes when you come
  back later in the day.
- **🔥 Streak** — each word has a target number of words. Hit the target and you
  advance to the next word with your streak +1. *Skip word* (or failing to
  reach a target) resets the streak. Your best streak is tracked.

## Features

- **Possible-word count** — every round tells you exactly how many valid words
  can be made from the current word.
- **This round** — live list of the words you've found, with points.
- **Full history** — every distinct word you've ever made (with how many times),
  plus a log of past rounds and your completion rate for each. Saved locally in
  your browser, so it persists between visits.
- **Modern UI** — card layout, animated letter tiles, progress bar, light/dark
  theme (auto-detects your system, toggle in the top-right).

## Running it

No build step and no dependencies — it's a static site.

```bash
# just open the file
open index.html            # macOS
xdg-open index.html        # Linux

# …or serve it (needed for the installable/offline PWA features)
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Install it (PWA)

The game is a **Progressive Web App**: it can be installed to your phone,
tablet or desktop and then launches in its own window and **works fully
offline** (the whole app — including the word list — is cached on first load).

> PWA install and offline require the app to be served over **http(s) or
> localhost** — opening the file directly with `file://` won't register the
> service worker. Use `python3 -m http.server` locally, or host it (GitHub
> Pages, Netlify, etc.).

**Desktop (Chrome / Edge):** open the site, then click **Install** in the app's
top bar, or use the install icon in the browser's address bar.

**Android (Chrome):** tap the **Install** button, or *⋮ menu → Install app /
Add to Home screen*.

**iOS / iPadOS (Safari):** tap the **Share** button → **Add to Home Screen**.

Once installed it appears as a normal app icon and opens without browser
chrome. Because everything is cached, it keeps working with no connection.

## Project structure

```
index.html             # markup / layout
css/styles.css         # all styling + light/dark theme
js/data.js             # generated word data (dictionary + source words)
js/game.js             # game logic, state, persistence, rendering
js/pwa.js              # service-worker registration + install button
sw.js                  # service worker (offline app-shell caching)
manifest.webmanifest   # PWA manifest (name, icons, colors, display)
icons/                 # app icons (192/512, maskable, apple-touch, favicons)
```

## How the word data is built

`js/data.js` is generated, not hand-written:

- **Dictionary** (~50k words, used to validate guesses): the most frequent
  English words from the [`wordfreq`](https://pypi.org/project/wordfreq/)
  corpus, intersected with a real-word list
  ([`an-array-of-english-words`](https://www.npmjs.com/package/an-array-of-english-words))
  to drop acronyms and noise while keeping words common and recognizable.
- **Source words** (~3k words that start each round): 10–14 letter dictionary
  words, each verified to have at least 40 sub-words so every round is playable.

## Data persistence

Progress is stored in `localStorage` under `wfw_state_v2` (and the theme under
`wfw_theme`). This includes your current round, played-word history, past
rounds, lifetime score, best streak, best timed score and today's daily
progress. Use the **Reset** button in the history panel to clear it.
