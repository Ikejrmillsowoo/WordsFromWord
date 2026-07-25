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

No build step and no server required — it's a static site.

```bash
# just open the file
open index.html            # macOS
xdg-open index.html        # Linux

# …or serve it (nicer, avoids any file:// quirks)
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Project structure

```
index.html        # markup / layout
css/styles.css    # all styling + light/dark theme
js/data.js        # generated word data (dictionary + source words)
js/game.js        # game logic, state, persistence, rendering
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
