/* ============================================================
   Words From Word — game logic
   ------------------------------------------------------------
   - Picks a 10+ letter source word each round.
   - Validates guesses against a 75k common-word dictionary,
     requiring the guess to be buildable from the source letters.
   - Reports how many words are possible for the current word.
   - Tracks words found this round + full cross-round history,
     persisted in localStorage.
   ============================================================ */
(function () {
  "use strict";

  const DICTIONARY = window.WFW_DICTIONARY || [];
  const SOURCES = window.WFW_SOURCES || [];
  const DICT_SET = new Set(DICTIONARY);
  const STORAGE_KEY = "wfw_state_v1";

  /* ---------- Letter-count helpers ---------- */
  // Build a letter -> count map for a word.
  function letterCounts(word) {
    const m = Object.create(null);
    for (const ch of word) m[ch] = (m[ch] || 0) + 1;
    return m;
  }
  // Can `word` be built from the letters available in `sourceCounts`?
  function canBuild(word, sourceCounts) {
    const need = Object.create(null);
    for (const ch of word) {
      need[ch] = (need[ch] || 0) + 1;
      if (!sourceCounts[ch] || need[ch] > sourceCounts[ch]) return false;
    }
    return true;
  }

  // All dictionary words (>=2 letters, not the source itself) buildable from source.
  function possibleWordsFor(source) {
    const counts = letterCounts(source);
    const letters = new Set(source);
    const out = [];
    for (let i = 0; i < DICTIONARY.length; i++) {
      const w = DICTIONARY[i];
      if (w.length < 2 || w.length > source.length || w === source) continue;
      // quick reject: any letter not present in source
      let ok = true;
      for (const ch of w) { if (!letters.has(ch)) { ok = false; break; } }
      if (ok && canBuild(w, counts)) out.push(w);
    }
    return out;
  }

  // Simple length-based scoring (longer words are worth more).
  function scoreFor(word) {
    const n = word.length;
    if (n <= 2) return 1;
    if (n === 3) return 2;
    return (n - 2) * 2; // 4->4, 5->6, 6->8, ...
  }

  /* ---------- Persistent state ---------- */
  const defaultState = () => ({
    current: null,          // { word, found: [], possibleCount, possible: [] }
    playedWords: {},        // distinct word -> times made across all rounds
    rounds: [],             // finished/played rounds history
    score: 0,               // lifetime score
  });

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return Object.assign(defaultState(), parsed);
    } catch (e) {
      return defaultState();
    }
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  let state = loadState();

  /* ---------- DOM refs ---------- */
  const $ = (id) => document.getElementById(id);
  const el = {
    sourceTiles: $("sourceTiles"),
    newWordBtn: $("newWordBtn"),
    foundCount: $("foundCount"),
    possibleCount: $("possibleCount"),
    scoreValue: $("scoreValue"),
    progressBar: $("progressBar"),
    guessForm: $("guessForm"),
    guessInput: $("guessInput"),
    guessBtn: $("guessBtn"),
    feedback: $("feedback"),
    foundWords: $("foundWords"),
    roundBadge: $("roundBadge"),
    revealBtn: $("revealBtn"),
    revealWrap: $("revealWrap"),
    revealWords: $("revealWords"),
    themeToggle: $("themeToggle"),
    // stats
    statRounds: $("statRounds"),
    statDistinct: $("statDistinct"),
    statTotal: $("statTotal"),
    statBest: $("statBest"),
    historyWords: $("historyWords"),
    wordsEmpty: $("wordsEmpty"),
    wordSearch: $("wordSearch"),
    roundsList: $("roundsList"),
    roundsEmpty: $("roundsEmpty"),
    clearHistoryBtn: $("clearHistoryBtn"),
  };

  /* ---------- Rendering ---------- */
  function renderSource() {
    const cur = state.current;
    el.sourceTiles.innerHTML = "";
    if (!cur) {
      el.sourceTiles.classList.add("empty");
      return;
    }
    el.sourceTiles.classList.remove("empty");
    [...cur.word].forEach((ch, i) => {
      const t = document.createElement("div");
      t.className = "tile";
      t.textContent = ch;
      t.style.animationDelay = (i * 0.035) + "s";
      el.sourceTiles.appendChild(t);
    });
  }

  function renderProgress() {
    const cur = state.current;
    const found = cur ? cur.found.length : 0;
    const possible = cur ? cur.possibleCount : 0;
    el.foundCount.textContent = found;
    el.possibleCount.textContent = possible;
    el.scoreValue.textContent = state.score;
    const pct = possible > 0 ? Math.min(100, (found / possible) * 100) : 0;
    el.progressBar.style.width = pct + "%";
  }

  function chip(word, meta) {
    const c = document.createElement("span");
    c.className = "chip";
    const label = document.createElement("span");
    label.textContent = word;
    c.appendChild(label);
    if (meta) {
      const m = document.createElement("span");
      m.className = meta.cls;
      m.textContent = meta.text;
      c.appendChild(m);
    }
    return c;
  }

  function renderFound() {
    const cur = state.current;
    el.foundWords.innerHTML = "";
    const list = cur ? cur.found : [];
    el.roundBadge.textContent = list.length;
    // newest first
    [...list].reverse().forEach((w) => {
      el.foundWords.appendChild(chip(w, { cls: "pts", text: "+" + scoreFor(w) }));
    });
    // Reveal is available whenever a round is active (shows all possibles if none found yet).
    el.revealBtn.disabled = !cur;
  }

  function renderReveal() {
    const cur = state.current;
    el.revealWrap.classList.add("hidden");
    el.revealBtn.textContent = "Reveal remaining";
    if (!cur) return;
  }

  function renderStats() {
    const distinct = Object.keys(state.playedWords);
    const totalMade = distinct.reduce((s, w) => s + state.playedWords[w], 0);
    let longest = "";
    for (const w of distinct) if (w.length > longest.length) longest = w;

    el.statRounds.textContent = state.rounds.length;
    el.statDistinct.textContent = distinct.length;
    el.statTotal.textContent = totalMade;
    el.statBest.textContent = longest ? longest : "—";

    renderHistoryWords();
    renderRounds();
  }

  function renderHistoryWords() {
    const q = (el.wordSearch.value || "").trim().toLowerCase();
    const entries = Object.keys(state.playedWords)
      .filter((w) => !q || w.includes(q))
      .sort((a, b) => state.playedWords[b] - state.playedWords[a] || a.localeCompare(b));

    el.historyWords.innerHTML = "";
    if (Object.keys(state.playedWords).length === 0) {
      el.wordsEmpty.classList.remove("hidden");
    } else {
      el.wordsEmpty.classList.add("hidden");
    }
    entries.forEach((w) => {
      const times = state.playedWords[w];
      el.historyWords.appendChild(
        chip(w, times > 1 ? { cls: "cnt", text: "×" + times } : null)
      );
    });
  }

  function renderRounds() {
    el.roundsList.innerHTML = "";
    if (state.rounds.length === 0) {
      el.roundsEmpty.classList.remove("hidden");
      return;
    }
    el.roundsEmpty.classList.add("hidden");
    [...state.rounds].reverse().forEach((r) => {
      const li = document.createElement("li");
      li.className = "round-item";
      const pct = r.possibleCount > 0 ? Math.round((r.foundCount / r.possibleCount) * 100) : 0;
      const date = new Date(r.date);
      li.innerHTML =
        '<div class="round-word">' + r.word + "</div>" +
        '<div class="round-meta">' +
          "<span>" + r.foundCount + " / " + r.possibleCount + " words</span>" +
          "<span>" + pct + "%</span>" +
          "<span>" + date.toLocaleDateString() + "</span>" +
        "</div>" +
        '<div class="round-bar"><div style="width:' + pct + '%"></div></div>';
      el.roundsList.appendChild(li);
    });
  }

  function renderAll() {
    renderSource();
    renderProgress();
    renderFound();
    renderReveal();
    renderStats();
    const active = !!state.current;
    el.guessInput.disabled = !active;
    el.guessBtn.disabled = !active;
  }

  /* ---------- Feedback ---------- */
  let feedbackTimer = null;
  function flash(msg, kind, shake) {
    el.feedback.textContent = msg;
    el.feedback.className = "feedback " + (kind || "");
    if (shake) {
      el.feedback.classList.add("shake");
      setTimeout(() => el.feedback.classList.remove("shake"), 400);
    }
    if (feedbackTimer) clearTimeout(feedbackTimer);
    if (kind === "ok") {
      feedbackTimer = setTimeout(() => {
        el.feedback.textContent = "";
        el.feedback.className = "feedback";
      }, 2200);
    }
  }

  /* ---------- Actions ---------- */
  function finalizeCurrentRound() {
    const cur = state.current;
    if (cur && cur.found.length > 0) {
      state.rounds.push({
        word: cur.word,
        foundCount: cur.found.length,
        possibleCount: cur.possibleCount,
        date: Date.now(),
      });
    }
  }

  function newWord() {
    if (!SOURCES.length) { flash("No source words loaded.", "bad", true); return; }
    finalizeCurrentRound();

    // Avoid immediately repeating the same word.
    let word = state.current && state.current.word;
    let pick = word;
    for (let i = 0; i < 8 && pick === word; i++) {
      pick = SOURCES[Math.floor(Math.random() * SOURCES.length)];
    }
    const possible = possibleWordsFor(pick);
    state.current = {
      word: pick,
      found: [],
      possible: possible,          // stored so "reveal" is instant
      possibleCount: possible.length,
    };
    saveState();
    renderAll();
    flash(possible.length + " words are hiding in this one. Go!", "ok");
    el.guessInput.value = "";
    el.guessInput.focus();
  }

  function submitGuess(raw) {
    const cur = state.current;
    if (!cur) { flash("Press “New word” to start.", "warn", true); return; }

    const word = (raw || "").trim().toLowerCase().replace(/[^a-z]/g, "");
    if (!word) return;

    if (word.length < 2) { flash("Words must be at least 2 letters.", "warn", true); return; }
    if (word === cur.word) { flash("That’s the original word — make a smaller one!", "warn", true); return; }
    if (cur.found.includes(word)) { flash("Already found “" + word + "”.", "warn", true); return; }

    const counts = letterCounts(cur.word);
    if (!canBuild(word, counts)) {
      flash("“" + word + "” can’t be made from these letters.", "bad", true);
      return;
    }
    if (!DICT_SET.has(word)) {
      flash("“" + word + "” isn’t in the dictionary.", "bad", true);
      return;
    }

    // Valid!
    cur.found.push(word);
    const pts = scoreFor(word);
    state.score += pts;
    state.playedWords[word] = (state.playedWords[word] || 0) + 1;
    saveState();

    renderProgress();
    renderFound();
    renderStats();

    if (cur.found.length === cur.possibleCount) {
      flash("🎉 You found every word — incredible!", "ok");
    } else {
      flash("Nice! “" + word + "” +" + pts + " points.", "ok");
    }
    el.guessInput.value = "";
    el.guessInput.focus();
  }

  function toggleReveal() {
    const cur = state.current;
    if (!cur) return;
    const showing = !el.revealWrap.classList.contains("hidden");
    if (showing) {
      el.revealWrap.classList.add("hidden");
      el.revealBtn.textContent = "Reveal remaining";
      return;
    }
    const foundSet = new Set(cur.found);
    const missed = cur.possible
      .filter((w) => !foundSet.has(w))
      .sort((a, b) => b.length - a.length || a.localeCompare(b));
    el.revealWords.innerHTML = "";
    if (missed.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-note";
      p.textContent = "You found them all — nothing left!";
      el.revealWords.appendChild(p);
    } else {
      missed.forEach((w) => el.revealWords.appendChild(chip(w, { cls: "pts", text: "" + w.length })));
    }
    el.revealWrap.classList.remove("hidden");
    el.revealBtn.textContent = "Hide remaining";
  }

  function clearHistory() {
    const ok = window.confirm(
      "Reset all history? This clears your played words, past rounds and score. The current word stays."
    );
    if (!ok) return;
    const keepCurrent = state.current;
    state = defaultState();
    state.current = keepCurrent;
    saveState();
    renderAll();
    flash("History cleared.", "ok");
  }

  /* ---------- Theme ---------- */
  function initTheme() {
    const saved = localStorage.getItem("wfw_theme");
    if (saved) document.documentElement.setAttribute("data-theme", saved);
    updateThemeIcon();
  }
  function updateThemeIcon() {
    const attr = document.documentElement.getAttribute("data-theme");
    const isDark = attr
      ? attr === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    el.themeToggle.querySelector(".theme-icon").textContent = isDark ? "☀️" : "🌙";
  }
  function toggleTheme() {
    const attr = document.documentElement.getAttribute("data-theme");
    const isDark = attr
      ? attr === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("wfw_theme", next);
    updateThemeIcon();
  }

  /* ---------- Wire up ---------- */
  el.newWordBtn.addEventListener("click", newWord);
  el.guessForm.addEventListener("submit", (e) => { e.preventDefault(); submitGuess(el.guessInput.value); });
  el.revealBtn.addEventListener("click", toggleReveal);
  el.clearHistoryBtn.addEventListener("click", clearHistory);
  el.themeToggle.addEventListener("click", toggleTheme);
  el.wordSearch.addEventListener("input", renderHistoryWords);

  // Tabs
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      const which = tab.getAttribute("data-tab");
      $("tabWords").classList.toggle("hidden", which !== "words");
      $("tabRounds").classList.toggle("hidden", which !== "rounds");
    });
  });

  initTheme();
  renderAll();
  // Recompute possible list if we restored a round saved before `possible` existed.
  if (state.current && (!state.current.possible || state.current.possible.length === 0) && state.current.possibleCount > 0) {
    state.current.possible = possibleWordsFor(state.current.word);
    saveState();
  }
  if (!state.current) {
    flash("Press “New word” to begin.", "warn");
  }
})();
