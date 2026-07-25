/* ============================================================
   Words From Word — game logic
   ------------------------------------------------------------
   - Picks a 10+ letter source word each round.
   - Validates guesses against a ~50k common-word dictionary,
     requiring the guess to be buildable from the source letters.
   - Reports how many words are possible for the current word.
   - Four game modes: Practice, Timed, Daily, Streak.
   - Tracks words found this round + full cross-round history,
     persisted in localStorage.
   ============================================================ */
(function () {
  "use strict";

  const DICTIONARY = window.WFW_DICTIONARY || [];
  const SOURCES = window.WFW_SOURCES || [];
  const DICT_SET = new Set(DICTIONARY);
  const STORAGE_KEY = "wfw_state_v2";

  const MIN_LEN = 3;          // words must be at least 3 letters
  const TIMED_SECONDS = 120;  // length of a timed round
  const MODES = ["practice", "timed", "daily", "streak"];

  /* ---------- Letter-count helpers ---------- */
  function letterCounts(word) {
    const m = Object.create(null);
    for (const ch of word) m[ch] = (m[ch] || 0) + 1;
    return m;
  }
  function canBuild(word, sourceCounts) {
    const need = Object.create(null);
    for (const ch of word) {
      need[ch] = (need[ch] || 0) + 1;
      if (!sourceCounts[ch] || need[ch] > sourceCounts[ch]) return false;
    }
    return true;
  }
  // All dictionary words (>= MIN_LEN, not the source itself) buildable from source.
  function possibleWordsFor(source) {
    const counts = letterCounts(source);
    const letters = new Set(source);
    const out = [];
    for (let i = 0; i < DICTIONARY.length; i++) {
      const w = DICTIONARY[i];
      if (w.length < MIN_LEN || w.length > source.length || w === source) continue;
      let ok = true;
      for (const ch of w) { if (!letters.has(ch)) { ok = false; break; } }
      if (ok && canBuild(w, counts)) out.push(w);
    }
    return out;
  }
  function scoreFor(word) {
    const n = word.length;
    if (n <= 3) return 2;
    return (n - 2) * 2; // 4->4, 5->6, 6->8, ...
  }
  function streakTarget(possibleCount) {
    return Math.max(3, Math.min(12, Math.round(possibleCount * 0.2)));
  }

  /* ---------- Source selection ---------- */
  function pickRandomSource(exclude) {
    let pick = exclude;
    for (let i = 0; i < 8 && pick === exclude; i++) {
      pick = SOURCES[Math.floor(Math.random() * SOURCES.length)];
    }
    return pick;
  }
  function dayKey() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function pickDailySource(key) {
    return SOURCES[hashStr("wfw-" + key) % SOURCES.length];
  }

  /* ---------- Persistent state ---------- */
  const defaultState = () => ({
    current: null,          // active round (see startRound)
    playedWords: {},        // distinct word -> times made across all rounds
    rounds: [],             // finished/played rounds history
    score: 0,               // lifetime score
    mode: "practice",
    streak: 0,              // current streak run
    bestStreak: 0,
    timedBest: 0,           // best single timed-round score
    dailyProgress: null,    // { date, word, found:[], possibleCount }
  });

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) { return defaultState(); }
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  let state = loadState();

  /* ---------- DOM refs ---------- */
  const $ = (id) => document.getElementById(id);
  const el = {
    modeTabs: $("modeTabs"),
    sourceLabel: $("sourceLabel"),
    modeInfo: $("modeInfo"),
    sourceTiles: $("sourceTiles"),
    newWordBtn: $("newWordBtn"),
    newWordLabel: $("newWordLabel"),
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

  /* ---------- Timer ---------- */
  let timerId = null;
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
  function startTimer() {
    stopTimer();
    tick();
    timerId = setInterval(tick, 250);
  }
  function tick() {
    const cur = state.current;
    if (!cur || cur.mode !== "timed" || cur.ended) { stopTimer(); return; }
    const remain = Math.max(0, cur.endsAt - Date.now());
    renderTimerText(remain);
    if (remain <= 0) endTimedRound();
  }
  function fmtTime(ms) {
    const s = Math.ceil(ms / 1000);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function renderTimerText(remain) {
    const t = document.getElementById("timerDisplay");
    if (t) {
      t.textContent = fmtTime(remain);
      t.classList.toggle("low", remain <= 15000);
    }
  }
  function endTimedRound() {
    stopTimer();
    const cur = state.current;
    if (!cur) return;
    cur.ended = true;
    const roundScore = cur.found.reduce((s, w) => s + scoreFor(w), 0);
    if (roundScore > state.timedBest) state.timedBest = roundScore;
    finalizeRoundHistory(cur);
    saveState();
    renderAll();
    flash("⏱️ Time! You found " + cur.found.length + " words for " + roundScore + " points.", "ok");
  }

  /* ---------- Round lifecycle ---------- */
  function finalizeRoundHistory(cur) {
    if (!cur || cur.finalized) return;
    if (cur.found.length > 0) {
      state.rounds.push({
        word: cur.word,
        foundCount: cur.found.length,
        possibleCount: cur.possibleCount,
        date: Date.now(),
        mode: cur.mode,
      });
    }
    cur.finalized = true;
  }

  function newRoundObject(word, mode) {
    const possible = possibleWordsFor(word);
    return {
      word: word,
      found: [],
      possible: possible,
      possibleCount: possible.length,
      mode: mode,
      endsAt: null,
      ended: false,
      target: null,
      dailyDate: null,
      finalized: false,
    };
  }

  function startRound(mode) {
    finalizeRoundHistory(state.current);
    stopTimer();
    const prev = state.current && state.current.word;
    const word = pickRandomSource(prev);
    const cur = newRoundObject(word, mode);
    if (mode === "timed") { cur.endsAt = Date.now() + TIMED_SECONDS * 1000; }
    if (mode === "streak") { cur.target = streakTarget(cur.possibleCount); }
    state.current = cur;
    saveState();
    renderAll();
    if (mode === "timed") { startTimer(); flash(cur.possibleCount + " words hiding — race the clock!", "ok"); }
    else if (mode === "streak") { flash("Find " + cur.target + " words to extend your streak!", "ok"); }
    else { flash(cur.possibleCount + " words are hiding in this one. Go!", "ok"); }
    focusInput();
  }

  function loadDaily() {
    finalizeRoundHistory(state.current);
    stopTimer();
    const key = dayKey();
    const word = pickDailySource(key);
    const cur = newRoundObject(word, "daily");
    cur.dailyDate = key;
    if (state.dailyProgress && state.dailyProgress.date === key) {
      // resume today's progress
      cur.found = state.dailyProgress.found.slice();
    } else {
      state.dailyProgress = { date: key, word: word, found: [], possibleCount: cur.possibleCount };
    }
    state.current = cur;
    saveState();
    renderAll();
    const left = cur.possibleCount - cur.found.length;
    flash("📅 Today's word — " + left + " words left to find.", "ok");
    focusInput();
  }

  /* ---------- Mode switching ---------- */
  function setMode(mode) {
    if (!MODES.includes(mode)) return;
    state.mode = mode;
    updateModeTabs();
    if (mode === "daily") { loadDaily(); return; }
    if (mode === "streak") { state.streak = 0; startRound("streak"); return; }
    startRound(mode);
  }
  function updateModeTabs() {
    el.modeTabs.querySelectorAll(".mode-tab").forEach((t) => {
      t.classList.toggle("is-active", t.getAttribute("data-mode") === state.mode);
    });
  }

  /* ---------- Rendering ---------- */
  function focusInput() { el.guessInput.value = ""; if (!el.guessInput.disabled) el.guessInput.focus(); }

  function renderSource() {
    const cur = state.current;
    el.sourceTiles.innerHTML = "";
    if (!cur) { el.sourceTiles.classList.add("empty"); return; }
    el.sourceTiles.classList.remove("empty");
    [...cur.word].forEach((ch, i) => {
      const t = document.createElement("div");
      t.className = "tile";
      t.textContent = ch;
      t.style.animationDelay = (i * 0.035) + "s";
      el.sourceTiles.appendChild(t);
    });
  }

  function renderModeInfo() {
    const cur = state.current;
    const m = state.mode;
    el.sourceLabel.textContent = m === "practice" ? "Your word" : "Your word";
    if (m === "practice") { el.modeInfo.classList.add("hidden"); el.modeInfo.innerHTML = ""; return; }
    el.modeInfo.classList.remove("hidden");
    if (m === "timed") {
      const remain = cur && !cur.ended ? Math.max(0, cur.endsAt - Date.now()) : 0;
      el.modeInfo.innerHTML =
        '<div class="timer" id="timerDisplay">' + (cur ? fmtTime(cur.ended ? 0 : remain) : fmtTime(TIMED_SECONDS * 1000)) + "</div>" +
        '<div class="mode-sub">Best score: <b>' + state.timedBest + "</b></div>";
    } else if (m === "streak") {
      const target = cur ? cur.target : 0;
      const prog = cur ? cur.found.length : 0;
      el.modeInfo.innerHTML =
        '<div class="streak-line"><span class="fire">🔥</span> <b>' + state.streak + "</b> streak" +
        '<span class="mode-sub" style="display:inline; margin-left:6px;">· best ' + state.bestStreak + "</span></div>" +
        '<div class="mode-sub">Reach <b>' + target + "</b> words to advance (<span id=\"streakProg\">" + Math.min(prog, target) + "</span>/" + target + ")</div>";
    } else if (m === "daily") {
      const d = new Date();
      const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      el.modeInfo.innerHTML =
        '<div class="daily-line">📅 <b>' + label + "</b></div>" +
        '<div class="mode-sub">One word a day — same for everyone</div>';
    }
  }

  function renderNewWordBtn() {
    const m = state.mode;
    const labels = { practice: "New word", timed: "New round", daily: "Daily word", streak: "Skip word" };
    el.newWordLabel.textContent = labels[m];
    el.newWordBtn.disabled = m === "daily";
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
      const mm = document.createElement("span");
      mm.className = meta.cls;
      mm.textContent = meta.text;
      c.appendChild(mm);
    }
    return c;
  }

  function renderFound() {
    const cur = state.current;
    el.foundWords.innerHTML = "";
    const list = cur ? cur.found : [];
    el.roundBadge.textContent = list.length;
    [...list].reverse().forEach((w) => {
      el.foundWords.appendChild(chip(w, { cls: "pts", text: "+" + scoreFor(w) }));
    });
    el.revealBtn.disabled = !cur;
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
    el.wordsEmpty.classList.toggle("hidden", Object.keys(state.playedWords).length !== 0);
    entries.forEach((w) => {
      const times = state.playedWords[w];
      el.historyWords.appendChild(chip(w, times > 1 ? { cls: "cnt", text: "×" + times } : null));
    });
  }

  const MODE_LABEL = { practice: "🎯", timed: "⏱️", daily: "📅", streak: "🔥" };
  function renderRounds() {
    el.roundsList.innerHTML = "";
    if (state.rounds.length === 0) { el.roundsEmpty.classList.remove("hidden"); return; }
    el.roundsEmpty.classList.add("hidden");
    [...state.rounds].reverse().forEach((r) => {
      const li = document.createElement("li");
      li.className = "round-item";
      const pct = r.possibleCount > 0 ? Math.round((r.foundCount / r.possibleCount) * 100) : 0;
      const date = new Date(r.date);
      const badge = MODE_LABEL[r.mode] || "🎯";
      li.innerHTML =
        '<div class="round-word">' + badge + " " + r.word + "</div>" +
        '<div class="round-meta">' +
          "<span>" + r.foundCount + " / " + r.possibleCount + " words</span>" +
          "<span>" + pct + "%</span>" +
          "<span>" + date.toLocaleDateString() + "</span>" +
        "</div>" +
        '<div class="round-bar"><div style="width:' + pct + '%"></div></div>';
      el.roundsList.appendChild(li);
    });
  }

  function inputActive() {
    const cur = state.current;
    if (!cur) return false;
    if (cur.ended) return false;   // round finished (time up, or streak word cleared)
    return true;
  }

  function renderAll() {
    updateModeTabs();
    renderSource();
    renderModeInfo();
    renderNewWordBtn();
    renderProgress();
    renderFound();
    el.revealWrap.classList.add("hidden");
    el.revealBtn.textContent = "Reveal remaining";
    renderStats();
    const active = inputActive();
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
      feedbackTimer = setTimeout(() => { el.feedback.textContent = ""; el.feedback.className = "feedback"; }, 2400);
    }
  }

  /* ---------- Guess handling ---------- */
  function advanceStreak() {
    state.streak += 1;
    if (state.streak > state.bestStreak) state.bestStreak = state.streak;
    state.current.ended = true;   // lock the word during the hand-off (prevents double counting)
    finalizeRoundHistory(state.current);
    saveState();
    renderAll();
    flash("🔥 Streak " + state.streak + "! Next word…", "ok");
    setTimeout(() => { if (state.mode === "streak") startRound("streak"); }, 950);
  }

  function submitGuess(raw) {
    const cur = state.current;
    if (!cur) { flash("Press “New word” to start.", "warn", true); return; }
    if (!inputActive()) { flash("This round is over — start a new one.", "warn", true); return; }

    const word = (raw || "").trim().toLowerCase().replace(/[^a-z]/g, "");
    if (!word) return;
    if (word.length < MIN_LEN) { flash("Words must be at least " + MIN_LEN + " letters.", "warn", true); return; }
    if (word === cur.word) { flash("That’s the original word — make a smaller one!", "warn", true); return; }
    if (cur.found.includes(word)) { flash("Already found “" + word + "”.", "warn", true); return; }

    const counts = letterCounts(cur.word);
    if (!canBuild(word, counts)) { flash("“" + word + "” can’t be made from these letters.", "bad", true); return; }
    if (!DICT_SET.has(word)) { flash("“" + word + "” isn’t in the dictionary.", "bad", true); return; }

    // Valid!
    cur.found.push(word);
    const pts = scoreFor(word);
    state.score += pts;
    state.playedWords[word] = (state.playedWords[word] || 0) + 1;
    if (cur.mode === "daily" && state.dailyProgress && state.dailyProgress.date === cur.dailyDate) {
      state.dailyProgress.found.push(word);
    }
    saveState();

    renderProgress();
    renderFound();
    renderModeInfo();
    renderStats();
    // keep timer element live after re-render
    if (cur.mode === "timed" && !cur.ended) renderTimerText(Math.max(0, cur.endsAt - Date.now()));

    el.guessInput.value = "";
    if (!el.guessInput.disabled) el.guessInput.focus();

    // Streak: reached target?
    if (cur.mode === "streak" && cur.found.length >= cur.target) { advanceStreak(); return; }
    if (cur.found.length === cur.possibleCount) { flash("🎉 You found every word — incredible!", "ok"); return; }
    flash("Nice! “" + word + "” +" + pts + " points.", "ok");
  }

  /* ---------- Reveal ---------- */
  function toggleReveal() {
    const cur = state.current;
    if (!cur) return;
    const showing = !el.revealWrap.classList.contains("hidden");
    if (showing) { el.revealWrap.classList.add("hidden"); el.revealBtn.textContent = "Reveal remaining"; return; }
    const foundSet = new Set(cur.found);
    const missed = cur.possible.filter((w) => !foundSet.has(w)).sort((a, b) => b.length - a.length || a.localeCompare(b));
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

  /* ---------- New-word button ---------- */
  function onNewWord() {
    const m = state.mode;
    if (m === "daily") return;             // disabled
    if (m === "streak") { state.streak = 0; }  // skipping resets the streak
    startRound(m);
  }

  /* ---------- Reset ---------- */
  function clearHistory() {
    if (!window.confirm("Reset all history? This clears played words, past rounds, score, streak and daily progress.")) return;
    stopTimer();
    state = defaultState();
    saveState();
    setMode("practice");
    flash("History cleared.", "ok");
  }

  /* ---------- Theme ---------- */
  function initTheme() {
    const saved = localStorage.getItem("wfw_theme");
    if (saved) document.documentElement.setAttribute("data-theme", saved);
    updateThemeIcon();
  }
  function isDarkNow() {
    const attr = document.documentElement.getAttribute("data-theme");
    return attr ? attr === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function updateThemeIcon() { el.themeToggle.querySelector(".theme-icon").textContent = isDarkNow() ? "☀️" : "🌙"; }
  function toggleTheme() {
    const next = isDarkNow() ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("wfw_theme", next);
    updateThemeIcon();
  }

  /* ---------- Wire up ---------- */
  el.newWordBtn.addEventListener("click", onNewWord);
  el.guessForm.addEventListener("submit", (e) => { e.preventDefault(); submitGuess(el.guessInput.value); });
  el.revealBtn.addEventListener("click", toggleReveal);
  el.clearHistoryBtn.addEventListener("click", clearHistory);
  el.themeToggle.addEventListener("click", toggleTheme);
  el.wordSearch.addEventListener("input", renderHistoryWords);
  el.modeTabs.querySelectorAll(".mode-tab").forEach((tab) => {
    tab.addEventListener("click", () => setMode(tab.getAttribute("data-mode")));
  });
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      const which = tab.getAttribute("data-tab");
      $("tabWords").classList.toggle("hidden", which !== "words");
      $("tabRounds").classList.toggle("hidden", which !== "rounds");
    });
  });

  /* ---------- Boot ---------- */
  initTheme();
  if (!MODES.includes(state.mode)) state.mode = "practice";

  if (state.mode === "daily") {
    loadDaily();
  } else if (state.mode === "timed" && state.current && state.current.mode === "timed") {
    // resume or expire a timed round using the absolute end time
    if (Date.now() >= (state.current.endsAt || 0)) { state.current.ended = true; renderAll(); }
    else { renderAll(); startTimer(); }
  } else if (state.current) {
    // restore possible list if missing (older saves)
    if ((!state.current.possible || state.current.possible.length === 0) && state.current.possibleCount > 0) {
      state.current.possible = possibleWordsFor(state.current.word);
    }
    renderAll();
  } else {
    renderAll();
    flash("Press “New word” to begin.", "warn");
  }
})();
