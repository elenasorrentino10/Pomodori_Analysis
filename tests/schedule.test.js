const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../schedule.js');

const settings = (overrides = {}) => S.normalizeSettings({ ...S.DEFAULT_SETTINGS, ...overrides });
const noMeal = { meals: [] };
const mealAt = (time, min = 60) => ({ meals: [{ time, min }] });

test('la conversione degli orari gestisce la mezzanotte', () => {
  assert.equal(S.toMinutes('14:30'), 870);
  assert.equal(S.toHHMM(870), '14:30');
  assert.equal(S.toHHMM(1445), '00:05');
  assert.equal(S.toHHMM(-5), '23:55');
});

test('il formato del conto alla rovescia non scende sotto zero', () => {
  assert.equal(S.fmtMMSS(125), '02:05');
  assert.equal(S.fmtMMSS(-3), '00:00');
});

test('un intervallo vuoto o di durata nulla non è valido', () => {
  assert.equal(S.isValidRange('10:00', '10:25'), true);
  assert.equal(S.isValidRange('', '10:25'), false);
  assert.equal(S.isValidRange('10:00', ''), false);
  assert.equal(S.isValidRange('10:00', '10:00'), false);
  assert.equal(S.isValidRange('25:00', '26:00'), false);
});

test('un intervallo che scavalca la mezzanotte ha la durata corretta', () => {
  assert.equal(S.durationSeconds({ start: '23:50', end: '00:15' }), 25 * 60);
});

test('dalle 9 alle 18 con pasto alle 13 calcola i pomodori prima e dopo', () => {
  const plan = S.computePlan(settings());
  assert.equal(plan.windowMin, 540);
  assert.deepEqual(plan.segments.map((s) => s.count), [8, 8]);
  assert.equal(plan.count, 16);
  assert.equal(plan.shortBreaks, 14);
  assert.deepEqual(plan.mealStarts, ['13:00']);
  assert.equal(plan.finish, '17:55');
});

test('la pausa pasto inizia esattamente all\'ora scelta', () => {
  for (const time of ['11:17', '12:00', '13:00', '15:40']) {
    const meals = S.generateItems(settings(mealAt(time))).filter((i) => i.meal);
    assert.equal(meals.length, 1, time);
    assert.equal(meals[0].start, time);
    assert.equal(S.durationSeconds(meals[0]), 60 * 60);
  }
});

test('si possono inserire più pause pasto con durate diverse', () => {
  const s = settings({
    end: '22:00',
    meals: [{ time: '19:30', min: 45 }, { time: '13:00', min: 60 }],
  });
  const plan = S.computePlan(s);
  assert.deepEqual(plan.mealStarts, ['13:00', '19:30']);
  assert.equal(plan.segments.length, 3);

  const meals = S.generateItems(s).filter((i) => i.meal);
  assert.deepEqual(meals.map((m) => [m.start, m.end]), [['13:00', '14:00'], ['19:30', '20:15']]);
});

test('con più pause pasto i blocchi restano in ordine e la numerazione è continua', () => {
  const items = S.generateItems(settings({
    end: '22:00',
    meals: [{ time: '13:00', min: 60 }, { time: '19:30', min: 45 }],
  }));
  let previousEnd = S.toMinutes('09:00');
  for (const item of items) {
    assert.ok(S.toMinutes(item.start) >= previousEnd, item.start);
    previousEnd = S.toMinutes(item.end);
  }
  const numbers = items.filter((i) => i.type === 'pomodoro').map((i) => i.n);
  assert.deepEqual(numbers, numbers.map((_, i) => i + 1));
});

test('nessun pomodoro si sovrappone alla pausa pasto', () => {
  const items = S.generateItems(settings(mealAt('11:17')));
  const mealIndex = items.findIndex((i) => i.meal);
  assert.ok(S.toMinutes(items[mealIndex - 1].end) <= S.toMinutes('11:17'));
  assert.equal(items[mealIndex + 1].start, '12:17');
});

test('due pause pasto sovrapposte vengono segnalate', () => {
  const overlap = S.computePlan(settings({ meals: [{ time: '13:00', min: 60 }, { time: '13:30', min: 30 }] }));
  assert.equal(overlap.mealError, 'overlap');
  assert.equal(overlap.count, 0);
  const touching = S.computePlan(settings({ meals: [{ time: '13:00', min: 60 }, { time: '14:00', min: 30 }] }));
  assert.equal(touching.mealError, null);
});

test('una pausa pasto fuori dalla giornata viene segnalata', () => {
  assert.equal(S.computePlan(settings(mealAt('08:00'))).mealError, 'outside');
  assert.equal(S.computePlan(settings(mealAt('18:30'))).mealError, 'outside');
  assert.equal(S.computePlan(settings(mealAt('17:30'))).mealError, 'outside');
  assert.equal(S.computePlan(settings(mealAt('08:00'))).count, 0);
  assert.equal(S.computePlan(settings(mealAt('17:00'))).mealError, null);
});

test('il programma generato non supera mai l\'ora di fine', () => {
  for (const end of ['10:00', '12:00', '13:00', '18:00', '23:59']) {
    const s = settings({ end, ...noMeal });
    const items = S.generateItems(s);
    assert.ok(S.toMinutes(items[items.length - 1].end) <= S.toMinutes(end), end);
    assert.equal(items.filter((i) => i.type === 'pomodoro').length, S.computePlan(s).count);
  }
  const withMeal = S.generateItems(settings({ end: '16:10', ...mealAt('12:00') }));
  assert.ok(S.toMinutes(withMeal[withMeal.length - 1].end) <= S.toMinutes('16:10'));
});

test('un pomodoro in più non entrerebbe nella finestra', () => {
  const plan = S.computePlan(settings({ end: '12:00', ...noMeal }));
  assert.equal(plan.count, 6);
  assert.equal(plan.finish, '11:55');
});

test('il programma alterna pomodori e pause, senza pausa finale', () => {
  const items = S.generateItems(settings({ end: '10:30', ...noMeal }));
  assert.deepEqual(items.map((i) => i.type), ['pomodoro', 'pausa', 'pomodoro', 'pausa', 'pomodoro']);
  assert.equal(items[0].start, '09:00');
  assert.equal(items[0].end, '09:25');
  assert.equal(items[1].end, '09:30');
});

test('senza pause pasto o con durata zero non viene inserita alcuna pausa pasto', () => {
  const empty = S.computePlan(settings(noMeal));
  assert.equal(empty.hasMeal, false);
  assert.deepEqual(empty.mealStarts, []);
  assert.equal(empty.count, 18);
  const zero = S.computePlan(settings(mealAt('13:00', 0)));
  assert.equal(zero.hasMeal, false);
  assert.equal(zero.count, 18);
});

test('la pausa pasto può stare all\'inizio o alla fine della giornata', () => {
  const first = S.generateItems(settings(mealAt('09:00')));
  assert.equal(first[0].meal, true);
  assert.equal(first[1].start, '10:00');
  const last = S.generateItems(settings(mealAt('17:00')));
  assert.equal(last[last.length - 1].meal, true);
  assert.equal(S.computePlan(settings(mealAt('17:00'))).finish, '18:00');
});

test('le pause di zero minuti non creano timer da 24 ore', () => {
  const s = settings({ end: '10:15', pausa: 0, ...noMeal });
  const items = S.generateItems(s);
  assert.equal(items.length, 3);
  assert.ok(items.every((i) => i.type === 'pomodoro'));
  assert.ok(items.every((i) => S.isValidRange(i.start, i.end)));
  assert.equal(S.computePlan(s).shortBreaks, 0);
});

test('una giornata che scavalca la mezzanotte viene calcolata', () => {
  const plan = S.computePlan(settings({ start: '22:00', end: '01:00', ...noMeal }));
  assert.equal(plan.windowMin, 180);
  assert.equal(plan.count, 6);
  assert.equal(plan.finish, '00:55');

  const night = settings({ start: '22:00', end: '04:00', ...mealAt('01:00', 30) });
  const nightPlan = S.computePlan(night);
  assert.equal(nightPlan.mealError, null);
  assert.deepEqual(nightPlan.mealStarts, ['01:00']);
  assert.equal(S.generateItems(night).find((i) => i.meal).end, '01:30');
});

test('inizio e fine uguali o finestra troppo breve non producono pomodori', () => {
  assert.equal(S.computePlan(settings({ end: '09:00', ...noMeal })).count, 0);
  assert.equal(S.computePlan(settings({ end: '09:10', ...noMeal })).count, 0);
  assert.equal(S.generateItems(settings({ end: '09:10', ...noMeal })).length, 0);
});

test('il numero di pomodori ha un limite massimo segnalato', () => {
  const plan = S.computePlan(settings({ start: '00:00', end: '23:59', pomo: 5, pausa: 0, ...noMeal }));
  assert.equal(plan.count, 50);
  assert.equal(plan.capped, true);
  assert.equal(S.computePlan(settings()).capped, false);
});

test('l\'orario proposto per una nuova pausa è libero e allineato ai 5 minuti', () => {
  assert.equal(S.suggestMealTime(settings(noMeal)), '13:00');

  const s = settings({ end: '22:00' });
  const proposed = S.suggestMealTime(s);
  assert.equal(S.toMinutes(proposed) % 5, 0);
  const next = settings({ end: '22:00', meals: [...s.meals, { time: proposed, min: 60 }] });
  assert.equal(S.computePlan(next).mealError, null);
  assert.equal(S.computePlan(next).mealStarts.length, 2);
});

test('senza spazio libero non viene proposto alcun orario', () => {
  assert.equal(S.suggestMealTime(settings({ end: '09:30', ...noMeal })), null);
  assert.equal(S.suggestMealTime(settings({ end: '09:00', ...noMeal })), null);
  assert.equal(S.suggestMealTime(settings({ meals: [{ time: '13:00', min: 60 }, { time: '13:30', min: 30 }] })), null);
});

test('le impostazioni vengono riportate nei limiti', () => {
  const s = S.normalizeSettings({ start: 'x', end: '', pomo: 0, pausa: '', meals: [{ time: 'abc', min: 10 }, { time: '12:00', min: 999 }, { time: '14:00', min: '' }] });
  assert.equal(s.start, S.DEFAULT_SETTINGS.start);
  assert.equal(s.end, S.DEFAULT_SETTINGS.end);
  assert.equal(s.pomo, 1);
  assert.equal(s.pausa, S.DEFAULT_SETTINGS.pausa);
  assert.deepEqual(s.meals, [{ time: '12:00', min: 180 }, { time: '14:00', min: S.DEFAULT_MEAL_MIN }]);
  assert.equal(S.normalizeSettings({ pomo: 999 }).pomo, 120);
  assert.deepEqual(S.normalizeSettings({}).meals, [{ time: '13:00', min: 60 }]);
  const many = Array.from({ length: 9 }, (_, i) => ({ time: '1' + i + ':00', min: 10 }));
  assert.equal(S.normalizeSettings({ meals: many }).meals.length, S.MAX_MEALS);
});

test('le spunte si conservano quando si ricalcola il programma', () => {
  const old = S.generateItems(settings({ end: '10:00', ...noMeal }));
  old[0].checked = true;
  const merged = S.mergeProgress(old, S.generateItems(settings({ end: '11:00', ...noMeal })));
  const pomodori = merged.filter((i) => i.type === 'pomodoro');
  assert.ok(pomodori.length > 2);
  assert.equal(pomodori[0].checked, true);
  assert.ok(pomodori.slice(1).every((i) => i.checked === false));
});

test('le note restano sul blocco dello stesso tipo quando si ricalcola', () => {
  const old = S.generateItems(settings({ end: '18:00' }));
  const firstPomodoro = old.find((i) => i.type === 'pomodoro');
  const firstBreak = old.find((i) => i.type === 'pausa' && !i.meal);
  const meal = old.find((i) => i.meal);
  firstPomodoro.note = 'Capitolo 1';
  firstBreak.note = 'Caffè';
  meal.note = 'Pranzo con Anna';

  const merged = S.mergeProgress(old, S.generateItems(settings({ end: '20:00', ...mealAt('14:00') })));
  assert.equal(merged.find((i) => i.type === 'pomodoro').note, 'Capitolo 1');
  assert.equal(merged.find((i) => i.type === 'pausa' && !i.meal).note, 'Caffè');
  assert.equal(merged.find((i) => i.meal).note, 'Pranzo con Anna');
  assert.equal(merged.filter((i) => i.note).length, 3);
});

test('il messaggio di fine concorda con il tipo di blocco', () => {
  assert.equal(S.finishedLabel({ type: 'pomodoro', n: 3 }), 'Pomodoro 3 terminato');
  assert.equal(S.finishedLabel({ type: 'pausa', meal: false }), 'Pausa terminata');
  assert.equal(S.finishedLabel({ type: 'pausa', meal: true }), 'Pausa pasto terminata');
});

test('uno stato salvato danneggiato viene rifiutato', () => {
  const good = { settings: settings(), items: S.generateItems(settings({ end: '09:30', ...noMeal })) };
  assert.equal(S.isValidState(good), true);
  assert.equal(S.isValidState(null), false);
  assert.equal(S.isValidState({ settings: {}, items: [] }), false);
  assert.equal(S.isValidState({ settings: {}, items: [{ type: 'pomodoro', start: '', end: '10:00' }] }), false);
});
