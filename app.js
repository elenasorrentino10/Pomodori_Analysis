(function () {
  const S = window.Schedule;
  const R = window.Review;

  const STATE_KEY = 'pomodori.state.v1';
  const BACKUP_KEY = 'pomodori.backup.v1';
  const TIMERS_KEY = 'pomodori.timers.v1';
  const POSTIT_KEY = 'pomodori.postit.v1';
  const REVIEW_KEY = 'pomodori.review.v1';
  const AUTO_ADVANCE_DELAY_MS = 1600;

  const $ = (id) => document.getElementById(id);

  function readJSON(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      setStatus('Non è stato possibile salvare i dati in questo browser.');
    }
  }

  function removeKey(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) { /* nessun dato da rimuovere */ }
  }

  function setStatus(message) {
    const el = $('status');
    if (el) el.textContent = message;
  }

  const savedState = readJSON(STATE_KEY);
  const hasSavedState = S.isValidState(savedState);
  let settings = S.normalizeSettings(hasSavedState ? savedState.settings : S.DEFAULT_SETTINGS);
  let items = hasSavedState ? savedState.items : S.generateItems(settings);

  const savedBackup = readJSON(BACKUP_KEY);
  let backup = S.isValidState(savedBackup) ? savedBackup : null;

  let timerState = {}; // indice -> { remaining, running, endTime }
  let activeIdx = null;
  let intervalId = null;
  let pendingAdvanceId = null;
  let audioCtx = null;
  const openNotes = new Set();
  let review = R.normalizeReview(readJSON(REVIEW_KEY));

  function saveState() {
    writeJSON(STATE_KEY, { settings, items });
  }

  function saveTimers() {
    writeJSON(TIMERS_KEY, { timers: timerState });
  }

  function saveBackup() {
    backup = JSON.parse(JSON.stringify({ settings, items }));
    writeJSON(BACKUP_KEY, backup);
    updateUndoBtn();
  }

  function clearBackup() {
    removeKey(BACKUP_KEY);
    backup = null;
    updateUndoBtn();
  }

  function updateUndoBtn() {
    $('undoBtn').disabled = !backup;
  }

  /* Audio e notifiche */

  function getAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playBell() {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      [0, 0.35, 0.7].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880 + i * 220;
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.35, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.32);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.35);
      });
    } catch (e) {
      console.warn('Audio non disponibile', e);
    }
  }

  function notifyFinished(idx) {
    if (!settings.notify || !document.hidden) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const next = items[idx + 1];
      new Notification(S.finishedLabel(items[idx]), {
        body: next ? 'Prossimo: ' + S.itemName(next) : 'Programma completato',
      });
    } catch (e) {
      console.warn('Notifica non disponibile', e);
    }
  }

  async function onNotifyChange(event) {
    const box = event.target;
    if (!box.checked) {
      settings.notify = false;
      saveState();
      return;
    }
    if (!('Notification' in window)) {
      box.checked = false;
      setStatus('Questo browser non supporta le notifiche.');
      return;
    }
    let permission = Notification.permission;
    try {
      if (permission === 'default') permission = await Notification.requestPermission();
    } catch (e) {
      permission = 'denied';
    }
    if (permission !== 'granted') {
      box.checked = false;
      settings.notify = false;
      saveState();
      setStatus('Notifiche non autorizzate: puoi attivarle dalle impostazioni del browser.');
      return;
    }
    settings.notify = true;
    saveState();
    setStatus('Notifiche attivate.');
  }

  /* Timer */

  function cancelPendingAdvance() {
    if (pendingAdvanceId !== null) {
      clearTimeout(pendingAdvanceId);
      pendingAdvanceId = null;
    }
  }

  function clearTicking() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function stopAllTimers() {
    cancelPendingAdvance();
    clearTicking();
    activeIdx = null;
    timerState = {};
    openNotes.clear();
    saveTimers();
  }

  function ensureRuntime(idx) {
    if (!timerState[idx] || typeof timerState[idx].remaining !== 'number') {
      timerState[idx] = { remaining: S.durationSeconds(items[idx]), running: false };
    }
  }

  function runTicks(idx) {
    clearTicking();
    intervalId = setInterval(() => tick(idx), 250);
  }

  function startTimer(idx) {
    cancelPendingAdvance();
    if (activeIdx !== null && activeIdx !== idx) pauseTimer(activeIdx);
    ensureRuntime(idx);
    const st = timerState[idx];
    if (st.remaining <= 0) st.remaining = S.durationSeconds(items[idx]);
    st.running = true;
    st.endTime = Date.now() + st.remaining * 1000;
    activeIdx = idx;
    runTicks(idx);
    saveTimers();
  }

  function pauseTimer(idx) {
    const st = timerState[idx];
    if (st && st.running) {
      st.remaining = Math.max(0, Math.round((st.endTime - Date.now()) / 1000));
      st.running = false;
    }
    clearTicking();
    if (activeIdx === idx) activeIdx = null;
    saveTimers();
  }

  function resetTimer(idx) {
    if (activeIdx === idx) pauseTimer(idx);
    timerState[idx] = { remaining: S.durationSeconds(items[idx]), running: false };
    saveTimers();
  }

  function tick(idx) {
    const st = timerState[idx];
    if (!st || !st.running) return;
    const remainingMs = st.endTime - Date.now();
    st.remaining = Math.max(0, Math.round(remainingMs / 1000));
    const el = $('cd-' + idx);
    if (el) el.textContent = S.fmtMMSS(st.remaining);
    if (remainingMs <= 0) finishTimer(idx);
  }

  function markDone(idx) {
    if (items[idx].type === 'pomodoro' && !items[idx].checked) {
      items[idx].checked = true;
      saveState();
    }
  }

  function finishTimer(idx) {
    clearTicking();
    const st = timerState[idx];
    if (st) {
      st.running = false;
      st.remaining = 0;
    }
    if (activeIdx === idx) activeIdx = null;
    saveTimers();

    playBell();
    notifyFinished(idx);
    markDone(idx);
    setStatus(S.finishedLabel(items[idx]) + '.');
    render();

    const rowEl = document.querySelector('[data-row-idx="' + idx + '"]');
    if (rowEl) {
      rowEl.classList.add('ring');
      setTimeout(() => rowEl.classList.remove('ring'), 1900);
    }

    if (settings.autoAdvance && idx + 1 < items.length) {
      pendingAdvanceId = setTimeout(() => {
        pendingAdvanceId = null;
        startTimer(idx + 1);
        render();
      }, AUTO_ADVANCE_DELAY_MS);
    }
  }

  // Riprende il timer dopo un ricaricamento della pagina.
  function restoreTimers() {
    const saved = readJSON(TIMERS_KEY);
    if (!saved || typeof saved.timers !== 'object' || saved.timers === null) return;
    Object.entries(saved.timers).forEach(([key, st]) => {
      const idx = Number(key);
      if (!items[idx] || !st || typeof st.remaining !== 'number') return;
      timerState[idx] = { remaining: st.remaining, running: false };
      if (!st.running || typeof st.endTime !== 'number') return;

      const leftMs = st.endTime - Date.now();
      if (leftMs > 0) {
        timerState[idx] = { remaining: Math.ceil(leftMs / 1000), running: true, endTime: st.endTime };
        activeIdx = idx;
        runTicks(idx);
        setStatus('Timer ripreso: ' + S.itemName(items[idx]) + '.');
      } else {
        timerState[idx].remaining = 0;
        markDone(idx);
        setStatus(S.finishedLabel(items[idx]) + ' mentre la pagina era chiusa.');
      }
    });
    saveTimers();
  }

  /* Interfaccia */

  function fillSettingsForm() {
    $('s_start').value = settings.start;
    $('s_end').value = settings.end;
    $('s_pomo').value = settings.pomo;
    $('s_pausa').value = settings.pausa;
    $('s_autoAdvance').checked = settings.autoAdvance;
    $('s_notify').checked = settings.notify;
    $('mealList').innerHTML = '';
    settings.meals.forEach(addMealRow);
    updateMealControls();
    updatePlanSummary();
  }

  function addMealRow(meal) {
    const row = document.createElement('div');
    row.className = 'meal-row';
    row.innerHTML =
      '<label>Pausa pasto alle <input type="time" class="meal-time"></label>' +
      '<label>per <input type="number" class="meal-min" min="0" max="180"> min</label>' +
      '<button type="button" class="meal-remove" title="Rimuovi pausa pasto">×</button>';
    row.querySelector('.meal-time').value = meal.time;
    row.querySelector('.meal-min').value = meal.min;
    $('mealList').appendChild(row);
    return row;
  }

  function updateMealControls() {
    const rows = [...$('mealList').querySelectorAll('.meal-row')];
    rows.forEach((row, i) => {
      row.querySelector('.meal-remove').setAttribute('aria-label', 'Rimuovi pausa pasto ' + (i + 1));
    });
    $('addMealBtn').disabled = rows.length >= S.MAX_MEALS;
  }

  function readMealRows() {
    return [...$('mealList').querySelectorAll('.meal-row')].map((row) => ({
      time: row.querySelector('.meal-time').value,
      min: row.querySelector('.meal-min').value,
    }));
  }

  function readPlanForm() {
    const raw = {
      start: $('s_start').value,
      end: $('s_end').value,
      pomo: $('s_pomo').value,
      pausa: $('s_pausa').value,
      meals: readMealRows(),
      autoAdvance: $('s_autoAdvance').checked,
      notify: settings.notify,
    };
    if (!S.isValidTime(raw.start) || !S.isValidTime(raw.end)) {
      return { error: 'Inserisci ora di inizio e ora di fine.' };
    }
    if (raw.meals.some((meal) => !S.isValidTime(meal.time))) {
      return { error: 'Inserisci l\'orario di ogni pausa pasto, oppure rimuovila.' };
    }
    const next = S.normalizeSettings(raw);
    const plan = S.computePlan(next);
    if (plan.windowMin === 0) {
      return { error: 'Ora di inizio e ora di fine devono essere diverse.' };
    }
    const tooShort = 'Il tempo disponibile è troppo breve per un pomodoro da ' + next.pomo + ' minuti.';
    if (plan.windowMin < next.pomo) return { error: tooShort };
    if (plan.mealError === 'outside') {
      return { error: 'Ogni pausa pasto deve iniziare e finire tra l\'ora di inizio e l\'ora di fine.' };
    }
    if (plan.mealError === 'overlap') {
      return { error: 'Due pause pasto si sovrappongono: cambia un orario o una durata.' };
    }
    if (plan.count === 0) return { error: tooShort };
    return { settings: next, plan };
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  function planSummaryText(plan) {
    const parts = [plural(plan.count, 'pomodoro', 'pomodori')];
    if (plan.shortBreaks > 0) parts.push(plural(plan.shortBreaks, 'pausa breve', 'pause brevi'));
    let text = parts.join(' e ');
    const starts = plan.mealStarts;
    if (starts.length === 0) {
      text += ', nessuna pausa pasto';
    } else {
      const times = starts.length > 1 ? starts.slice(0, -1).join(', ') + ' e ' + starts[starts.length - 1] : starts[0];
      text += (starts.length > 1 ? ', pause pasto alle ' : ', pausa pasto alle ') + times;
    }
    text += '. Fine alle ' + plan.finish + '.';
    if (plan.capped) text += ' È stato raggiunto il limite di 50 pomodori.';
    return text;
  }

  function updatePlanSummary() {
    const result = readPlanForm();
    const el = $('planSummary');
    el.textContent = result.error || planSummaryText(result.plan);
    el.classList.toggle('error', Boolean(result.error));
    $('regenBtn').disabled = Boolean(result.error);
  }

  function timeInput(idx, field, value, name) {
    const label = (field === 'start' ? 'Inizio ' : 'Fine ') + name;
    return '<input type="time" value="' + value + '" data-idx="' + idx + '" data-field="' + field +
      '" data-focus-key="' + field + '-' + idx + '" class="t-input" aria-label="' + label + '">';
  }

  function rowHTML(item, idx) {
    const st = timerState[idx];
    const remaining = st ? st.remaining : S.durationSeconds(item);
    const running = Boolean(st && st.running);
    const name = S.itemName(item);
    const lead = item.type === 'pomodoro'
      ? '<input type="checkbox" class="chk" data-idx="' + idx + '" data-focus-key="chk-' + idx + '"' +
        (item.checked ? ' checked' : '') + ' aria-label="' + name + ' completato"><div class="n" aria-hidden="true">' + item.n + '</div>'
      : '<div class="icon" aria-hidden="true">' + (item.meal ? '🍽' : '☕') + '</div>';

    return lead +
      '<div class="label">' + name + '</div>' +
      '<div class="times">' + timeInput(idx, 'start', item.start, name) +
      '<span aria-hidden="true">–</span>' + timeInput(idx, 'end', item.end, name) + '</div>' +
      '<div class="timer">' +
      '<button type="button" class="tbtn note-btn' + (item.note ? ' has-note' : '') + '" data-idx="' + idx +
      '" data-focus-key="notebtn-' + idx + '" title="Nota" aria-label="Nota per ' + name +
      '" aria-expanded="' + openNotes.has(idx) + '"><span aria-hidden="true">📝</span></button>' +
      '<button type="button" class="tbtn reset-btn" data-idx="' + idx + '" data-action="reset" data-focus-key="reset-' + idx +
      '" title="Azzera timer" aria-label="Azzera timer di ' + name + '">↺</button>' +
      '<span class="countdown" id="cd-' + idx + '">' + S.fmtMMSS(remaining) + '</span>' +
      '<button type="button" class="tbtn play-btn" data-idx="' + idx + '" data-action="toggle" data-focus-key="toggle-' + idx +
      '" title="' + (running ? 'Pausa' : 'Avvia') + '" aria-label="' + (running ? 'Metti in pausa ' : 'Avvia ') + name + '">' +
      (running ? '⏸' : '▶') + '</button></div>';
  }

  function render() {
    const active = document.activeElement;
    const focusKey = active && active.dataset ? active.dataset.focusKey : null;
    const caret = active && active.classList.contains('note-input') ? active.selectionStart : null;

    const list = $('list');
    list.innerHTML = '';
    let done = 0;
    let total = 0;

    items.forEach((item, idx) => {
      const st = timerState[idx];
      const row = document.createElement('div');
      let cls = 'row';
      if (item.type === 'pomodoro') {
        total++;
        if (item.checked) {
          done++;
          cls += ' done';
        }
      } else {
        cls += ' pausa' + (item.meal ? ' meal' : '');
      }
      if (st && st.running) cls += ' active';
      row.className = cls;
      row.setAttribute('data-row-idx', idx);
      row.innerHTML = rowHTML(item, idx);
      if (openNotes.has(idx)) row.appendChild(notePanel(item, idx));
      list.appendChild(row);
    });

    $('progressLabel').textContent = done + '/' + total;
    $('progressFill').style.width = total ? (done / total) * 100 + '%' : '0';
    $('progressBar').setAttribute('aria-valuemax', total);
    $('progressBar').setAttribute('aria-valuenow', done);

    if (focusKey) {
      const el = list.querySelector('[data-focus-key="' + focusKey + '"]');
      if (el) {
        el.focus();
        if (caret !== null) el.setSelectionRange(caret, caret);
      }
    }
    updateReviewOutput();
  }

  // Il testo delle note entra solo come valore del campo, mai come HTML.
  function notePanel(item, idx) {
    const panel = document.createElement('div');
    panel.className = 'note-panel';
    const input = document.createElement('textarea');
    input.className = 'note-input';
    input.rows = 2;
    input.placeholder = 'Scrivi una nota';
    input.dataset.idx = idx;
    input.dataset.focusKey = 'note-' + idx;
    input.setAttribute('aria-label', 'Nota per ' + S.itemName(item));
    input.value = typeof item.note === 'string' ? item.note : '';
    panel.appendChild(input);
    return panel;
  }

  /* Post-it */

  function initPostit() {
    const box = $('postitText');
    const saved = readJSON(POSTIT_KEY);
    box.value = typeof saved === 'string' ? saved : '';
    box.addEventListener('input', () => writeJSON(POSTIT_KEY, box.value));
  }

  /* Riflessione finale */

  function element(tag, className, textValue) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (textValue !== undefined) el.textContent = textValue;
    return el;
  }

  function buildReviewArea(area) {
    const box = element('fieldset', 'review-area');
    box.dataset.area = area.id;
    box.appendChild(element('legend', '', area.label));
    box.appendChild(element('p', 'review-question', area.question));

    const rating = element('div', 'rating');
    for (let value = 1; value <= 5; value++) {
      const label = element('label');
      const input = element('input', 'rate-input');
      input.type = 'radio';
      input.name = 'rate-' + area.id;
      input.value = value;
      input.setAttribute('aria-label', area.label + ': voto ' + value + ' su 5');
      label.appendChild(input);
      label.appendChild(element('span', '', String(value)));
      rating.appendChild(label);
    }
    box.appendChild(rating);

    const problems = element('div', 'problems');
    problems.hidden = true;
    area.problems.forEach((problem) => {
      const label = element('label');
      const input = element('input', 'problem-input');
      input.type = 'checkbox';
      input.value = problem.id;
      label.appendChild(input);
      label.appendChild(element('span', '', problem.label));
      problems.appendChild(label);
    });
    box.appendChild(problems);
    return box;
  }

  function syncReviewForm() {
    $('reviewAreas').querySelectorAll('[data-area]').forEach((box) => {
      const id = box.dataset.area;
      const rating = review.ratings[id];
      box.querySelectorAll('.rate-input').forEach((input) => {
        input.checked = Number(input.value) === rating;
      });
      box.querySelectorAll('.problem-input').forEach((input) => {
        input.checked = (review.problems[id] || []).includes(input.value);
      });
      box.querySelector('.problems').hidden = !R.showsProblems(rating);
    });
    $('r_other').value = review.other;
    $('r_otherSolution').value = review.otherSolution;
    $('r_worked').value = review.worked;
    $('r_change').value = review.change;
  }

  function updateReviewOutput() {
    const pomodori = items.filter((item) => item.type === 'pomodoro');
    const done = pomodori.filter((item) => item.checked).length;
    const result = R.computeScore(review, done, pomodori.length);

    const scoreBox = $('reviewScore');
    scoreBox.textContent = '';
    scoreBox.classList.toggle('empty', !result);
    if (!result) {
      scoreBox.textContent = 'Dai almeno un voto per vedere il punteggio finale.';
    } else {
      const value = element('div', 'score-value', String(result.score));
      value.appendChild(element('small', '', ' / 100'));
      scoreBox.appendChild(value);
      scoreBox.appendChild(element('div', 'score-label', result.label));
      scoreBox.appendChild(element('p', '', result.message));
      scoreBox.appendChild(element('p', 'score-detail',
        'Aree valutate: ' + result.ratedCount + ' su ' + R.AREAS.length + ', media ' + result.areas + '/100. ' +
        'Pomodori completati: ' + done + ' su ' + pomodori.length + '. ' +
        'Il punteggio pesa per il 70% i voti e per il 30% i pomodori: serve a confrontare le sessioni, non a giudicarti.'));
    }

    const box = $('reviewSolutions');
    box.textContent = '';
    const solutions = R.selectedSolutions(review);
    if (solutions.length === 0) return;
    box.appendChild(element('h3', '', 'Da provare la prossima volta'));
    const list = element('ul');
    solutions.forEach((entry) => {
      const row = element('li');
      const title = element('strong', '', entry.problem + ' ');
      title.appendChild(element('span', 'area', '(' + entry.area + ')'));
      row.appendChild(title);
      row.appendChild(document.createTextNode(entry.solution));
      list.appendChild(row);
    });
    box.appendChild(list);
  }

  function saveReview() {
    writeJSON(REVIEW_KEY, review);
    updateReviewOutput();
  }

  function initReview() {
    const host = $('reviewAreas');
    R.AREAS.forEach((area) => host.appendChild(buildReviewArea(area)));

    host.addEventListener('change', (event) => {
      const input = event.target;
      const box = input.closest('[data-area]');
      if (!box) return;
      const id = box.dataset.area;
      if (input.classList.contains('rate-input')) {
        review.ratings[id] = Number(input.value);
        box.querySelector('.problems').hidden = !R.showsProblems(review.ratings[id]);
      } else if (input.classList.contains('problem-input')) {
        const picked = new Set(review.problems[id] || []);
        if (input.checked) picked.add(input.value);
        else picked.delete(input.value);
        review.problems[id] = [...picked];
      }
      saveReview();
    });

    [['r_other', 'other'], ['r_otherSolution', 'otherSolution'], ['r_worked', 'worked'], ['r_change', 'change']]
      .forEach(([id, field]) => {
        $(id).addEventListener('input', (event) => {
          review[field] = event.target.value;
          saveReview();
        });
      });

    $('resetReviewBtn').addEventListener('click', () => {
      if (!window.confirm('Vuoi cancellare voti e risposte della riflessione?')) return;
      review = R.emptyReview();
      syncReviewForm();
      saveReview();
    });

    syncReviewForm();
  }

  $('list').addEventListener('change', (event) => {
    const el = event.target;
    const idx = Number(el.dataset.idx);
    if (el.classList.contains('chk')) {
      items[idx].checked = el.checked;
      saveState();
      render();
    } else if (el.classList.contains('t-input')) {
      const item = items[idx];
      const field = el.dataset.field;
      const start = field === 'start' ? el.value : item.start;
      const end = field === 'end' ? el.value : item.end;
      if (!S.isValidRange(start, end)) {
        el.value = item[field];
        setStatus('Orario non valido: inizio e fine devono essere compilati e diversi tra loro.');
        return;
      }
      cancelPendingAdvance();
      item[field] = el.value;
      if (timerState[idx]) {
        if (activeIdx === idx) pauseTimer(idx);
        delete timerState[idx];
        saveTimers();
      }
      setStatus('');
      saveState();
      render();
    }
  });

  $('list').addEventListener('input', (event) => {
    const input = event.target;
    if (!input.classList.contains('note-input')) return;
    const idx = Number(input.dataset.idx);
    items[idx].note = input.value;
    saveState();
    const button = input.closest('.row').querySelector('.note-btn');
    button.classList.toggle('has-note', input.value !== '');
  });

  $('list').addEventListener('click', (event) => {
    const noteButton = event.target.closest('.note-btn');
    if (noteButton) {
      const idx = Number(noteButton.dataset.idx);
      if (openNotes.has(idx)) {
        openNotes.delete(idx);
        render();
      } else {
        openNotes.add(idx);
        render();
        $('list').querySelector('[data-focus-key="note-' + idx + '"]').focus();
      }
      return;
    }

    const btn = event.target.closest('.tbtn');
    if (!btn) return;
    cancelPendingAdvance();
    const idx = Number(btn.dataset.idx);
    if (btn.dataset.action === 'toggle') {
      const st = timerState[idx];
      if (activeIdx === idx && st && st.running) {
        pauseTimer(idx);
      } else {
        getAudioCtx();
        startTimer(idx);
      }
    } else {
      resetTimer(idx);
    }
    render();
  });

  $('regenBtn').addEventListener('click', () => {
    const result = readPlanForm();
    if (result.error) {
      updatePlanSummary();
      return;
    }
    saveBackup();
    stopAllTimers();
    const oldItems = items;
    settings = result.settings;
    items = S.mergeProgress(oldItems, S.generateItems(settings));
    saveState();
    fillSettingsForm();
    setStatus('Programma calcolato.');
    render();
  });

  ['s_start', 's_end', 's_pomo', 's_pausa', 'mealList'].forEach((id) => {
    $(id).addEventListener('input', updatePlanSummary);
  });

  $('addMealBtn').addEventListener('click', () => {
    const meals = readMealRows().filter((meal) => S.isValidTime(meal.time));
    const current = S.normalizeSettings({
      start: $('s_start').value,
      end: $('s_end').value,
      pomo: $('s_pomo').value,
      pausa: $('s_pausa').value,
      meals,
    });
    const row = addMealRow({ time: S.suggestMealTime(current) || '', min: S.DEFAULT_MEAL_MIN });
    updateMealControls();
    updatePlanSummary();
    row.querySelector('.meal-time').focus();
  });

  $('mealList').addEventListener('click', (event) => {
    const button = event.target.closest('.meal-remove');
    if (!button) return;
    button.closest('.meal-row').remove();
    updateMealControls();
    updatePlanSummary();
    $('addMealBtn').focus();
  });

  $('resetChecksBtn').addEventListener('click', () => {
    saveBackup();
    stopAllTimers();
    items.forEach((item) => {
      if (item.type === 'pomodoro') item.checked = false;
    });
    saveState();
    setStatus('Spunte azzerate.');
    render();
  });

  $('undoBtn').addEventListener('click', () => {
    if (!backup) return;
    stopAllTimers();
    settings = S.normalizeSettings(backup.settings);
    items = backup.items;
    saveState();
    clearBackup();
    fillSettingsForm();
    setStatus('Ultima modifica annullata.');
    render();
  });

  $('restoreDefaultBtn').addEventListener('click', () => {
    saveBackup();
    stopAllTimers();
    settings = S.normalizeSettings(S.DEFAULT_SETTINGS);
    items = S.generateItems(settings);
    saveState();
    fillSettingsForm();
    setStatus('Impostazioni predefinite ripristinate.');
    render();
  });

  $('testBellBtn').addEventListener('click', () => {
    getAudioCtx();
    playBell();
  });

  $('s_autoAdvance').addEventListener('change', (event) => {
    settings.autoAdvance = event.target.checked;
    saveState();
  });

  $('s_notify').addEventListener('change', onNotifyChange);

  // I browser sbloccano l'audio solo dopo un gesto dell'utente, anche quando un timer riprende da solo.
  document.addEventListener('pointerdown', getAudioCtx, { once: true });

  $('dateLabel').textContent = new Date().toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  fillSettingsForm();
  initPostit();
  initReview();
  restoreTimers();
  updateUndoBtn();
  render();
})();
