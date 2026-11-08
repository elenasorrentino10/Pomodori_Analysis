// Logica degli orari, senza dipendenze dalla pagina: funziona nel browser e nei test.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Schedule = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const MINUTES_IN_DAY = 1440;
  const MAX_POMODORI = 50;
  const MAX_MEALS = 6;
  const DEFAULT_MEAL_MIN = 60;

  const DEFAULT_SETTINGS = Object.freeze({
    start: '09:00',
    end: '18:00',
    pomo: 25,
    pausa: 5,
    meals: Object.freeze([Object.freeze({ time: '13:00', min: DEFAULT_MEAL_MIN })]),
    autoAdvance: true,
    notify: false,
  });

  function isValidTime(value) {
    return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  }

  function toMinutes(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  function toHHMM(mins) {
    const wrapped = ((mins % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
    const h = Math.floor(wrapped / 60);
    const m = wrapped % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  function fmtMMSS(totalSeconds) {
    const seconds = Math.max(0, Math.round(totalSeconds));
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  // Un intervallo è valido se ha due orari e non dura zero minuti.
  function isValidRange(start, end) {
    return isValidTime(start) && isValidTime(end) && start !== end;
  }

  // Se la fine è prima dell'inizio, l'intervallo scavalca la mezzanotte.
  function durationSeconds(item) {
    let mins = toMinutes(item.end) - toMinutes(item.start);
    if (mins <= 0) mins += MINUTES_IN_DAY;
    return mins * 60;
  }

  function clampInt(value, min, max, fallback) {
    if (value === '' || value === null || value === undefined) return fallback;
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  function normalizeMeals(meals) {
    const source = Array.isArray(meals) ? meals : DEFAULT_SETTINGS.meals;
    return source
      .filter((meal) => meal && isValidTime(meal.time))
      .slice(0, MAX_MEALS)
      .map((meal) => ({ time: meal.time, min: clampInt(meal.min, 0, 180, DEFAULT_MEAL_MIN) }));
  }

  function normalizeSettings(raw) {
    const source = raw || {};
    const d = DEFAULT_SETTINGS;
    return {
      start: isValidTime(source.start) ? source.start : d.start,
      end: isValidTime(source.end) ? source.end : d.end,
      pomo: clampInt(source.pomo, 1, 120, d.pomo),
      pausa: clampInt(source.pausa, 0, 60, d.pausa),
      meals: normalizeMeals(source.meals),
      autoAdvance: source.autoAdvance === undefined ? d.autoAdvance : Boolean(source.autoAdvance),
      notify: Boolean(source.notify),
    };
  }

  // Quanti pomodori, con le pause brevi tra l'uno e l'altro, entrano in un certo numero di minuti.
  function maxPomodori(minutes, settings) {
    if (minutes < settings.pomo) return 0;
    return Math.floor((minutes + settings.pausa) / (settings.pomo + settings.pausa));
  }

  function blockMinutes(count, settings) {
    return count > 0 ? count * settings.pomo + (count - 1) * settings.pausa : 0;
  }

  // Minuti trascorsi dall'inizio della giornata: gestisce anche il passaggio della mezzanotte.
  function offsetFromStart(hhmm, settings) {
    return (toMinutes(hhmm) - toMinutes(settings.start) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  }

  function windowMinutes(settings) {
    return offsetFromStart(settings.end, settings);
  }

  function sortedMeals(settings) {
    return settings.meals
      .filter((meal) => meal.min > 0)
      .map((meal) => ({ offset: offsetFromStart(meal.time, settings), min: meal.min }))
      .sort((a, b) => a.offset - b.offset);
  }

  function mealProblem(meals, windowMin) {
    if (meals.some((meal) => meal.offset + meal.min > windowMin)) return 'outside';
    for (let i = 1; i < meals.length; i++) {
      if (meals[i].offset < meals[i - 1].offset + meals[i - 1].min) return 'overlap';
    }
    return null;
  }

  // Calcola quanti pomodori entrano in ogni tratto libero, senza superare l'ora di fine.
  function computePlan(settings) {
    const startMin = toMinutes(settings.start);
    const windowMin = windowMinutes(settings);
    const meals = sortedMeals(settings);
    const mealError = mealProblem(meals, windowMin);

    const segments = [];
    if (windowMin > 0 && !mealError) {
      let cursor = 0;
      meals.forEach((meal) => {
        segments.push({ start: cursor, count: maxPomodori(meal.offset - cursor, settings), meal });
        cursor = meal.offset + meal.min;
      });
      segments.push({ start: cursor, count: maxPomodori(windowMin - cursor, settings), meal: null });
    }

    const possible = segments.reduce((sum, segment) => sum + segment.count, 0);
    let available = MAX_POMODORI;
    segments.forEach((segment) => {
      segment.count = Math.min(segment.count, available);
      available -= segment.count;
    });

    const count = segments.reduce((sum, segment) => sum + segment.count, 0);
    const shortBreaks = settings.pausa > 0
      ? segments.reduce((sum, segment) => sum + Math.max(0, segment.count - 1), 0)
      : 0;
    const usedMeals = count > 0 ? meals : [];

    let lastOffset = 0;
    if (count > 0) {
      segments.forEach((segment) => {
        if (segment.count > 0) lastOffset = segment.start + blockMinutes(segment.count, settings);
        if (segment.meal) lastOffset = segment.meal.offset + segment.meal.min;
      });
    }

    return {
      windowMin,
      count,
      segments: count > 0 ? segments : [],
      shortBreaks,
      hasMeal: usedMeals.length > 0,
      mealError,
      mealStarts: usedMeals.map((meal) => toHHMM(startMin + meal.offset)),
      finish: toHHMM(startMin + lastOffset),
      capped: possible > MAX_POMODORI,
    };
  }

  // Aggiunge una serie di pomodori con le pause brevi. Le pause di zero minuti non vengono create.
  function appendBlock(items, cursor, firstN, count, settings) {
    let time = cursor;
    for (let i = 0; i < count; i++) {
      const end = time + settings.pomo;
      items.push({ type: 'pomodoro', n: firstN + i, start: toHHMM(time), end: toHHMM(end), checked: false });
      time = end;
      if (i < count - 1 && settings.pausa > 0) {
        items.push({ type: 'pausa', meal: false, start: toHHMM(time), end: toHHMM(time + settings.pausa) });
        time += settings.pausa;
      }
    }
  }

  function generateItems(settings) {
    const plan = computePlan(settings);
    const items = [];
    const startMin = toMinutes(settings.start);
    let nextN = 1;
    plan.segments.forEach((segment) => {
      appendBlock(items, startMin + segment.start, nextN, segment.count, settings);
      nextN += segment.count;
      if (segment.meal) {
        const mealStart = startMin + segment.meal.offset;
        items.push({ type: 'pausa', meal: true, start: toHHMM(mealStart), end: toHHMM(mealStart + segment.meal.min) });
      }
    });
    return items;
  }

  // Propone un orario al centro del tratto libero più lungo, o null se non c'è spazio.
  function suggestMealTime(settings) {
    const windowMin = windowMinutes(settings);
    const meals = sortedMeals(settings);
    if (windowMin === 0 || mealProblem(meals, windowMin)) return null;

    let best = { from: 0, length: 0 };
    let cursor = 0;
    [...meals, { offset: windowMin, min: 0 }].forEach((meal) => {
      const length = meal.offset - cursor;
      if (length > best.length) best = { from: cursor, length };
      cursor = meal.offset + meal.min;
    });

    if (best.length < DEFAULT_MEAL_MIN + 10) return null;
    const offset = best.from + Math.floor((best.length - DEFAULT_MEAL_MIN) / 2);
    const clock = toMinutes(settings.start) + offset;
    return toHHMM(Math.ceil(clock / 5) * 5);
  }

  function kindOf(item) {
    if (item.type === 'pomodoro') return 'pomodoro';
    return item.meal ? 'meal' : 'pausa';
  }

  // Riporta spunte e note sui blocchi dello stesso tipo e nella stessa posizione.
  function mergeProgress(oldItems, newItems) {
    const byKind = { pomodoro: [], pausa: [], meal: [] };
    oldItems.forEach((item) => byKind[kindOf(item)].push(item));
    const positions = { pomodoro: 0, pausa: 0, meal: 0 };

    return newItems.map((item) => {
      const kind = kindOf(item);
      const previous = byKind[kind][positions[kind]];
      positions[kind]++;
      if (!previous) return item;
      const merged = { ...item };
      if (item.type === 'pomodoro') merged.checked = Boolean(previous.checked);
      if (typeof previous.note === 'string' && previous.note) merged.note = previous.note;
      return merged;
    });
  }

  function isValidState(state) {
    return Boolean(
      state &&
      state.settings &&
      Array.isArray(state.items) &&
      state.items.length > 0 &&
      state.items.every((i) => i && (i.type === 'pomodoro' || i.type === 'pausa') && isValidRange(i.start, i.end))
    );
  }

  function itemName(item) {
    if (item.type === 'pomodoro') return 'Pomodoro ' + item.n;
    return item.meal ? 'Pausa pasto' : 'Pausa';
  }

  function finishedLabel(item) {
    return itemName(item) + (item.type === 'pomodoro' ? ' terminato' : ' terminata');
  }

  return {
    DEFAULT_SETTINGS,
    DEFAULT_MEAL_MIN,
    MAX_MEALS,
    isValidTime,
    toMinutes,
    toHHMM,
    fmtMMSS,
    isValidRange,
    durationSeconds,
    normalizeSettings,
    computePlan,
    generateItems,
    suggestMealTime,
    mergeProgress,
    isValidState,
    itemName,
    finishedLabel,
  };
});
