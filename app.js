(function () {
  const S = window.Schedule;
  const R = window.Review;
  const L = window.I18n;

  const STATE_KEY = 'pomodori.state.v1';
  const BACKUP_KEY = 'pomodori.backup.v1';
  const TIMERS_KEY = 'pomodori.timers.v1';
  const POSTIT_KEY = 'pomodori.postit.v1';
  const REVIEW_KEY = 'pomodori.review.v1';
  const HOWTO_KEY = 'pomodori.howtoClosed.v1';
  const LANG_KEY = 'pomodori.lang.v1';
  const AUTO_ADVANCE_DELAY_MS = 1600;
  const REVIEW_PROMPT_DELAY_MS = 2000;

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
      setStatus(t('status.saveFailed'));
    }
  }

  function removeKey(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) { /* nothing to remove */ }
  }

  /* Language */

  let lang = L.detect(
    new URLSearchParams(window.location.search).get('lang'),
    readJSON(LANG_KEY),
    navigator.language,
  );

  const t = (key, params) => L.translate(lang, key, params);
  const nameOf = (item) => L.itemName(item, lang);

  // Static text in the page: data-i18n (text), data-i18n-html (trusted markup), data-i18n-attr ("attr:key|attr:key").
  function applyStaticText() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = t(el.dataset.i18nHtml);
    });
    document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      el.dataset.i18nAttr.split('|').forEach((pair) => {
        const [attr, key] = pair.split(':');
        el.setAttribute(attr, t(key));
      });
    });
    $('dateLabel').textContent = new Date().toLocaleDateString(t('locale'), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  function setLanguage(next) {
    lang = next;
    writeJSON(LANG_KEY, lang);
    applyStaticText();
    setPlanEditorOpen(!$('planEditor').hidden);
    updateMealControls();
    updatePlanSummary();
    updatePlanCompact();
    rebuildReviewAreas();
    setStatus('');
    render();
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

  let timerState = {}; // index -> { remaining, running, endTime }
  let activeIdx = null;
  let intervalId = null;
  let pendingAdvanceId = null;
  let audioCtx = null;
  const openRows = new Set();
  let review = R.normalizeReview(readJSON(REVIEW_KEY));
  let reviewStep = 0;

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

  /* Sound and notifications */

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
      console.warn('Audio not available', e);
    }
  }

  function notifyFinished(idx) {
    if (!settings.notify || !document.hidden) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const next = items[idx + 1];
      new Notification(L.finishedLabel(items[idx], lang), {
        body: next ? t('notify.next', { name: nameOf(next) }) : t('notify.done'),
      });
    } catch (e) {
      console.warn('Notification not available', e);
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
      setStatus(t('notify.unsupported'));
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
      setStatus(t('notify.denied'));
      return;
    }
    settings.notify = true;
    saveState();
    setStatus(t('notify.enabled'));
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
    openRows.clear();
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
    $('nowTime').textContent = S.fmtMMSS(st.remaining);
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
    setStatus(t('status.finished', { label: L.finishedLabel(items[idx], lang) }));
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

    if (idx + 1 >= items.length) {
      setTimeout(() => {
        if (!$('reviewDialog').open) openReview();
      }, REVIEW_PROMPT_DELAY_MS);
    }
  }

  // The block to highlight: the running one, a paused one, or the first one still to do.
  function currentIdx() {
    if (activeIdx !== null) return activeIdx;
    const paused = items.findIndex((item, idx) => {
      const st = timerState[idx];
      return st && st.remaining > 0 && st.remaining < S.durationSeconds(item);
    });
    if (paused >= 0) return paused;

    let last = -1;
    items.forEach((item, idx) => {
      const finished = timerState[idx] && timerState[idx].remaining === 0;
      if (finished || (item.type === 'pomodoro' && item.checked)) last = idx;
    });
    return last + 1 < items.length ? last + 1 : null;
  }

  // Resumes the timer after the page is reloaded.
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
        setStatus(t('status.resumed', { name: nameOf(items[idx]) }));
      } else {
        timerState[idx].remaining = 0;
        markDone(idx);
        setStatus(t('status.finishedClosed', { label: L.finishedLabel(items[idx], lang) }));
      }
    });
    saveTimers();
  }

  /* Plan */

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
    updatePlanCompact();
  }

  function setPlanEditorOpen(open) {
    $('planEditor').hidden = !open;
    $('planEditBtn').textContent = t(open ? 'planner.close' : 'planner.edit');
    $('planEditBtn').setAttribute('aria-expanded', String(open));
  }

  function updatePlanCompact() {
    const plan = S.computePlan(settings);
    let text = settings.start + '–' + settings.end + ' · ' + L.plural(lang, 'plan.pomodoros', plan.count);
    if (plan.mealStarts.length === 1) text += t('plan.compactMeal', { time: plan.mealStarts[0] });
    if (plan.mealStarts.length > 1) text += t('plan.compactMeals', { n: plan.mealStarts.length });
    $('planCompactText').textContent = text;
  }

  function addMealRow(meal) {
    const row = document.createElement('div');
    row.className = 'meal-row';
    row.innerHTML =
      '<label><span data-i18n="meal.at"></span> <input type="time" class="meal-time"></label>' +
      '<label><span data-i18n="meal.for"></span> <input type="number" class="meal-min" min="0" max="180"> ' +
      '<span data-i18n="meal.minutes"></span></label>' +
      '<button type="button" class="meal-remove" data-i18n-attr="title:meal.remove">×</button>';
    row.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    row.querySelector('.meal-remove').title = t('meal.remove');
    row.querySelector('.meal-time').value = meal.time;
    row.querySelector('.meal-min').value = meal.min;
    $('mealList').appendChild(row);
    return row;
  }

  function updateMealControls() {
    const rows = [...$('mealList').querySelectorAll('.meal-row')];
    rows.forEach((row, i) => {
      row.querySelector('.meal-remove').setAttribute('aria-label', t('meal.removeN', { n: i + 1 }));
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
      return { error: t('plan.needTimes') };
    }
    if (raw.meals.some((meal) => !S.isValidTime(meal.time))) {
      return { error: t('plan.needMealTime') };
    }
    const next = S.normalizeSettings(raw);
    const plan = S.computePlan(next);
    if (plan.windowMin === 0) return { error: t('plan.sameTimes') };
    const tooShort = t('plan.tooShort', { min: next.pomo });
    if (plan.windowMin < next.pomo) return { error: tooShort };
    if (plan.mealError === 'outside') return { error: t('plan.mealOutside') };
    if (plan.mealError === 'overlap') return { error: t('plan.mealOverlap') };
    if (plan.count === 0) return { error: tooShort };
    return { settings: next, plan };
  }

  function planSummaryText(plan) {
    const parts = [L.plural(lang, 'plan.pomodoros', plan.count)];
    if (plan.shortBreaks > 0) parts.push(L.plural(lang, 'plan.breaks', plan.shortBreaks));
    let text = parts.join(t('plan.and'));
    const starts = plan.mealStarts;
    if (starts.length === 0) {
      text += t('plan.noMeal');
    } else {
      text += t(starts.length > 1 ? 'plan.meals.other' : 'plan.meals.one', { times: L.joinList(lang, starts) });
    }
    text += t('plan.ends', { time: plan.finish });
    if (plan.capped) text += t('plan.capped');
    return text;
  }

  function updatePlanSummary() {
    const result = readPlanForm();
    const el = $('planSummary');
    el.textContent = result.error || planSummaryText(result.plan);
    el.classList.toggle('error', Boolean(result.error));
    $('regenBtn').disabled = Boolean(result.error);
  }

  /* Block list */

  function timeInput(idx, field, value, name) {
    const label = t(field === 'start' ? 'row.startOf' : 'row.endOf', { name });
    return '<input type="time" value="' + value + '" data-idx="' + idx + '" data-field="' + field +
      '" data-focus-key="' + field + '-' + idx + '" class="t-input" aria-label="' + label + '">';
  }

  function rowHTML(item, idx) {
    const st = timerState[idx];
    const remaining = st ? st.remaining : S.durationSeconds(item);
    const running = Boolean(st && st.running);
    const started = Boolean(st && st.remaining > 0 && st.remaining < S.durationSeconds(item));
    const name = nameOf(item);
    const lead = item.type === 'pomodoro'
      ? '<input type="checkbox" class="chk" data-idx="' + idx + '" data-focus-key="chk-' + idx + '"' +
        (item.checked ? ' checked' : '') + ' aria-label="' + t('row.completed', { name }) + '">'
      : '<div class="icon" aria-hidden="true">' + (item.meal ? '🍽' : '☕') + '</div>';

    return lead +
      '<button type="button" class="row-toggle" data-action="expand" data-idx="' + idx + '" data-focus-key="expand-' + idx +
      '" aria-expanded="' + openRows.has(idx) + '" aria-label="' +
      t('row.details', { name, start: item.start, end: item.end }) + '">' +
      '<span class="label">' + name + '</span>' +
      '<span class="note-dot" title="' + t('row.hasNote') + '" aria-hidden="true"' + (item.note ? '' : ' hidden') + '>📝</span>' +
      '<span class="row-time">' + item.start + '–' + item.end + '</span>' +
      (running || started ? '<span class="countdown" id="cd-' + idx + '">' + S.fmtMMSS(remaining) + '</span>' : '') +
      '<span class="chevron" aria-hidden="true">▾</span></button>';
  }

  // Note text is only ever set as the field value, never as HTML.
  function rowPanel(item, idx) {
    const st = timerState[idx];
    const running = Boolean(st && st.running);
    const name = nameOf(item);
    const panel = document.createElement('div');
    panel.className = 'row-panel';
    panel.innerHTML =
      '<div class="row-panel-top">' +
      '<div class="times">' + timeInput(idx, 'start', item.start, name) +
      '<span aria-hidden="true">–</span>' + timeInput(idx, 'end', item.end, name) + '</div>' +
      '<div class="row-buttons">' +
      '<button type="button" data-action="toggle" data-idx="' + idx + '" data-focus-key="toggle-' + idx + '">' +
      t(running ? 'row.pause' : 'row.startThis') + '</button>' +
      '<button type="button" data-action="reset" data-idx="' + idx + '" data-focus-key="reset-' + idx + '">' +
      t('row.reset') + '</button>' +
      '</div></div>';
    const input = document.createElement('textarea');
    input.className = 'note-input';
    input.rows = 2;
    input.placeholder = t('row.notePlaceholder');
    input.dataset.idx = idx;
    input.dataset.focusKey = 'note-' + idx;
    input.setAttribute('aria-label', t('row.noteFor', { name }));
    input.value = typeof item.note === 'string' ? item.note : '';
    panel.appendChild(input);
    return panel;
  }

  function renderNow() {
    const idx = currentIdx();
    const card = $('nowCard');
    const finished = idx === null;
    $('nowTime').hidden = finished;
    if (finished) {
      card.classList.remove('running');
      $('nowKicker').textContent = t('now.doneKicker');
      $('nowName').textContent = t('now.doneTitle');
      $('nowNext').textContent = t('now.doneText');
      $('nowBtn').textContent = t('now.reflect');
      return;
    }

    const item = items[idx];
    const st = timerState[idx];
    const duration = S.durationSeconds(item);
    const running = Boolean(st && st.running);
    const started = Boolean(st && st.remaining > 0 && st.remaining < duration);
    const next = items[idx + 1];

    card.classList.toggle('running', running);
    $('nowKicker').textContent = t(running ? 'now.running' : (started ? 'now.paused' : 'now.next'));
    $('nowName').textContent = nameOf(item);
    $('nowNext').textContent = next ? t('now.then', { name: nameOf(next), time: next.start }) : t('now.last');
    $('nowTime').textContent = S.fmtMMSS(st && st.remaining > 0 ? st.remaining : duration);
    $('nowBtn').textContent = t(running ? 'now.pause' : (started ? 'now.resume' : 'now.start'));
  }

  function render() {
    const active = document.activeElement;
    const focusKey = active && active.dataset ? active.dataset.focusKey : null;
    const caret = active && active.classList.contains('note-input') ? active.selectionStart : null;

    const list = $('list');
    list.innerHTML = '';
    let done = 0;
    let total = 0;
    const current = currentIdx();

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
      else if (idx === current) cls += ' current';
      if (openRows.has(idx)) cls += ' expanded';
      row.className = cls;
      row.setAttribute('data-row-idx', idx);
      row.innerHTML = rowHTML(item, idx);
      if (openRows.has(idx)) row.appendChild(rowPanel(item, idx));
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
    renderNow();
    updateReviewOutput();
  }

  /* Sticky note */

  function initPostit() {
    const box = $('postitText');
    const saved = readJSON(POSTIT_KEY);
    box.value = typeof saved === 'string' ? saved : '';
    box.addEventListener('input', () => writeJSON(POSTIT_KEY, box.value));
  }

  /* End-of-session reflection */

  function element(tag, className, textValue) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (textValue !== undefined) el.textContent = textValue;
    return el;
  }

  function buildReviewArea(area) {
    const local = R.areaText(area, lang);
    const box = element('fieldset', 'review-area');
    box.dataset.area = area.id;
    box.appendChild(element('legend', '', local.label));
    box.appendChild(element('p', 'review-question', local.question));

    const rating = element('div', 'rating');
    for (let value = 1; value <= 5; value++) {
      const label = element('label');
      const input = element('input', 'rate-input');
      input.type = 'radio';
      input.name = 'rate-' + area.id;
      input.value = value;
      input.setAttribute('aria-label', t('review.rating', { area: local.label, value }));
      label.appendChild(input);
      label.appendChild(element('span', '', String(value)));
      rating.appendChild(label);
    }
    box.appendChild(rating);

    const problems = element('div', 'problems');
    problems.hidden = true;
    local.problems.forEach((problem) => {
      const label = element('label');
      const input = element('input', 'problem-input');
      input.type = 'checkbox';
      input.value = problem.id;
      label.appendChild(input);
      label.appendChild(element('span', '', problem.label));
      problems.appendChild(label);
    });
    const otherLabel = element('label');
    const otherInput = element('input', 'problem-input');
    otherInput.type = 'checkbox';
    otherInput.value = R.OTHER_ID;
    otherLabel.appendChild(otherInput);
    otherLabel.appendChild(element('span', '', t('review.otherProblem')));
    problems.appendChild(otherLabel);
    const otherText = element('input', 'area-other');
    otherText.type = 'text';
    otherText.maxLength = 200;
    otherText.placeholder = t('review.otherDescribe');
    otherText.setAttribute('aria-label', t('review.otherDescribe') + ' (' + local.label + ')');
    otherText.hidden = true;
    problems.appendChild(otherText);
    box.appendChild(problems);
    return box;
  }

  function rebuildReviewAreas() {
    const host = $('reviewAreas');
    host.innerHTML = '';
    R.AREAS.forEach((area) => host.appendChild(buildReviewArea(area)));
    syncReviewForm();
    showReviewStep(reviewStep);
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
      const otherText = box.querySelector('.area-other');
      otherText.value = review.otherByArea[id] || '';
      otherText.hidden = !(review.problems[id] || []).includes(R.OTHER_ID);
      box.querySelector('.problems').hidden = !R.showsProblems(rating);
    });
    $('r_other').value = review.other;
    $('r_otherSolution').value = review.otherSolution;
    $('r_worked').value = review.worked;
    $('r_change').value = review.change;
  }

  function reviewSteps() {
    return [...$('reviewAreas').children, $('reviewOther'), $('reviewClosing'), $('reviewResult')];
  }

  function updateReviewNav() {
    const steps = reviewSteps();
    const areas = R.AREAS.length;
    const unrated = reviewStep < areas && !review.ratings[R.AREAS[reviewStep].id];
    let next = unrated ? 'review.skip' : 'review.next';
    if (reviewStep === steps.length - 2) next = 'review.seeResult';
    if (reviewStep === steps.length - 1) next = 'review.done';
    $('reviewNext').textContent = t(next);
    $('reviewBack').disabled = reviewStep === 0;
    // With a rating of 3 or lower, a reason is required to move on: otherwise there would be no suggestion.
    const missing = reviewStep < areas ? R.missingReason(review, R.AREAS[reviewStep].id) : null;
    $('reviewNext').disabled = Boolean(missing);
    $('reviewHint').textContent = missing === 'reason' ? t('review.pickReason')
      : (missing === 'other' ? t('review.describeOther') : '');
  }

  function showReviewStep(index) {
    const steps = reviewSteps();
    const areas = R.AREAS.length;
    reviewStep = Math.max(0, Math.min(index, steps.length - 1));
    steps.forEach((step, i) => {
      step.hidden = i !== reviewStep;
    });

    let label = t('review.result');
    if (reviewStep < areas) label = t('review.stepArea', { n: reviewStep + 1, total: areas });
    else if (reviewStep === areas) label = t('review.other');
    else if (reviewStep === areas + 1) label = t('review.closing');
    $('reviewStepLabel').textContent = label;
    $('reviewProgress').style.width = (reviewStep / (steps.length - 1)) * 100 + '%';
    $('reviewIntro').hidden = reviewStep !== 0;
    updateReviewNav();
  }

  function openReview() {
    closeMobileSide();
    updateReviewOutput();
    showReviewStep(0);
    $('reviewDialog').showModal();
  }

  function closeMobileSide() {
    $('side').classList.remove('open');
    $('mobilePostitBtn').setAttribute('aria-expanded', 'false');
  }

  function updateReviewOutput() {
    const pomodoros = items.filter((item) => item.type === 'pomodoro');
    const done = pomodoros.filter((item) => item.checked).length;
    const result = R.computeScore(review, done, pomodoros.length, lang);

    const scoreBox = $('reviewScore');
    scoreBox.textContent = '';
    scoreBox.classList.toggle('empty', !result);
    if (!result) {
      scoreBox.textContent = t('review.scoreEmpty');
    } else {
      const value = element('div', 'score-value', String(result.score));
      value.appendChild(element('small', '', ' / 100'));
      scoreBox.appendChild(value);
      scoreBox.appendChild(element('div', 'score-label', result.label));
      scoreBox.appendChild(element('p', '', result.message));
      scoreBox.appendChild(element('p', 'score-detail', t('review.scoreDetail', {
        rated: result.ratedCount,
        total: R.AREAS.length,
        areas: result.areas,
        done,
        pomodoros: pomodoros.length,
      })));
    }

    const box = $('reviewSolutions');
    box.textContent = '';
    const solutions = R.selectedSolutions(review, lang);
    if (solutions.length === 0) return;
    box.appendChild(element('h3', '', t('review.tryNext')));
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
        if (input.value === R.OTHER_ID) {
          const field = box.querySelector('.area-other');
          field.hidden = !input.checked;
          if (input.checked) field.focus();
        }
      }
      saveReview();
      updateReviewNav();
    });

    host.addEventListener('input', (event) => {
      const field = event.target;
      if (!field.classList.contains('area-other')) return;
      review.otherByArea[field.closest('[data-area]').dataset.area] = field.value;
      saveReview();
      updateReviewNav();
    });

    $('reviewNext').addEventListener('click', () => {
      if (reviewStep === reviewSteps().length - 1) $('reviewDialog').close();
      else showReviewStep(reviewStep + 1);
    });
    $('reviewBack').addEventListener('click', () => showReviewStep(reviewStep - 1));
    $('reviewClose').addEventListener('click', () => $('reviewDialog').close());
    $('reviewDialog').addEventListener('click', (event) => {
      if (event.target === $('reviewDialog')) $('reviewDialog').close();
    });
    $('openReviewBtn').addEventListener('click', openReview);
    $('mobileReviewBtn').addEventListener('click', openReview);

    [['r_other', 'other'], ['r_otherSolution', 'otherSolution'], ['r_worked', 'worked'], ['r_change', 'change']]
      .forEach(([id, field]) => {
        $(id).addEventListener('input', (event) => {
          review[field] = event.target.value;
          saveReview();
        });
      });

    $('resetReviewBtn').addEventListener('click', () => {
      if (!window.confirm(t('review.confirmReset'))) return;
      review = R.emptyReview();
      syncReviewForm();
      saveReview();
    });

    syncReviewForm();
    showReviewStep(0);
  }

  /* Events */

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
        setStatus(t('status.invalidTime'));
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
    input.closest('.row').querySelector('.note-dot').hidden = input.value === '';
  });

  $('list').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const idx = Number(btn.dataset.idx);

    if (btn.dataset.action === 'expand') {
      if (openRows.has(idx)) openRows.delete(idx);
      else openRows.add(idx);
      render();
      return;
    }

    cancelPendingAdvance();
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
    setPlanEditorOpen(false);
    setStatus(t('status.planBuilt'));
    render();
  });

  $('nowBtn').addEventListener('click', () => {
    const idx = currentIdx();
    if (idx === null) {
      openReview();
      return;
    }
    const st = timerState[idx];
    if (st && st.running) {
      pauseTimer(idx);
    } else {
      getAudioCtx();
      startTimer(idx);
    }
    render();
  });

  $('planEditBtn').addEventListener('click', () => {
    setPlanEditorOpen($('planEditor').hidden);
  });

  $('howtoClose').addEventListener('click', () => {
    $('howto').hidden = true;
    writeJSON(HOWTO_KEY, true);
  });

  $('langBtn').addEventListener('click', () => {
    setLanguage(lang === 'it' ? 'en' : 'it');
  });

  $('mobilePostitBtn').addEventListener('click', () => {
    const open = $('side').classList.toggle('open');
    $('mobilePostitBtn').setAttribute('aria-expanded', String(open));
    if (open) $('postitText').focus();
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
    setStatus(t('status.checksCleared'));
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
    setStatus(t('status.undone'));
    render();
  });

  $('restoreDefaultBtn').addEventListener('click', () => {
    saveBackup();
    stopAllTimers();
    settings = S.normalizeSettings(S.DEFAULT_SETTINGS);
    items = S.generateItems(settings);
    saveState();
    fillSettingsForm();
    setStatus(t('status.defaults'));
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

  // Browsers unlock audio only after a user gesture, even when a timer resumes on its own.
  document.addEventListener('pointerdown', getAudioCtx, { once: true });

  applyStaticText();
  $('howto').hidden = readJSON(HOWTO_KEY) === true;
  setPlanEditorOpen(!hasSavedState);
  fillSettingsForm();
  initPostit();
  initReview();
  restoreTimers();
  updateUndoBtn();
  render();
})();
