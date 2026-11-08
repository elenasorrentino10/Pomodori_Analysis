const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../review.js');

const review = (overrides = {}) => R.normalizeReview({ ...R.emptyReview(), ...overrides });

test('ogni area ha domanda e problemi con una soluzione, senza identificativi doppi', () => {
  assert.equal(new Set(R.AREAS.map((a) => a.id)).size, R.AREAS.length);
  for (const area of R.AREAS) {
    assert.ok(area.question.length > 0, area.id);
    assert.ok(area.problems.length >= 2, area.id);
    assert.equal(new Set(area.problems.map((p) => p.id)).size, area.problems.length, area.id);
    assert.ok(area.problems.every((p) => p.label && p.solution), area.id);
  }
});

test('le aree richieste sono presenti', () => {
  const ids = R.AREAS.map((a) => a.id);
  for (const id of ['emotivo', 'fisico', 'mentale', 'ambientale']) assert.ok(ids.includes(id), id);
});

test('senza voti non esiste un punteggio', () => {
  assert.equal(R.computeScore(review(), 5, 10), null);
});

test('il punteggio pesa 70% le aree e 30% i pomodori completati', () => {
  const result = R.computeScore(review({ ratings: { emotivo: 4, fisico: 4 } }), 5, 10);
  assert.equal(result.areas, 80);
  assert.equal(result.completion, 50);
  assert.equal(result.score, 71);
  assert.equal(result.ratedCount, 2);
});

test('senza pomodori nel programma conta solo la media delle aree', () => {
  const result = R.computeScore(review({ ratings: { emotivo: 3 } }), 0, 0);
  assert.equal(result.score, 60);
  assert.equal(result.completion, null);
});

test('i limiti del punteggio e le fasce sono coerenti', () => {
  const allRatings = (value) => Object.fromEntries(R.AREAS.map((a) => [a.id, value]));
  const best = R.computeScore(review({ ratings: allRatings(5) }), 10, 10);
  assert.equal(best.score, 100);
  assert.equal(best.label, 'Ottima sessione');
  const worst = R.computeScore(review({ ratings: allRatings(1) }), 0, 10);
  assert.equal(worst.score, 14);
  assert.equal(worst.label, 'Sessione difficile');
});

test('i problemi compaiono solo con voti fino a 3', () => {
  assert.equal(R.showsProblems(1), true);
  assert.equal(R.showsProblems(3), true);
  assert.equal(R.showsProblems(4), false);
  assert.equal(R.showsProblems(undefined), false);
});

test('le soluzioni partono dalle aree con il voto più basso', () => {
  const items = R.selectedSolutions(review({
    ratings: { fisico: 3, emotivo: 1 },
    problems: { fisico: ['fame'], emotivo: ['ansia'] },
  }));
  assert.deepEqual(items.map((i) => i.area), ['Emotivo', 'Fisico']);
  assert.ok(items[0].solution.length > 0);
});

test('un problema di un\'area con voto alto non genera soluzioni', () => {
  const items = R.selectedSolutions(review({ ratings: { fisico: 5 }, problems: { fisico: ['fame'] } }));
  assert.equal(items.length, 0);
});

test('la voce Altro usa la soluzione scritta oppure un invito a scriverla', () => {
  const own = R.selectedSolutions(review({ other: ' Un trasloco ', otherSolution: ' Studio in biblioteca ' }));
  assert.deepEqual(own, [{ area: 'Altro', problem: 'Un trasloco', solution: 'Studio in biblioteca' }]);
  const none = R.selectedSolutions(review({ other: 'Un trasloco' }));
  assert.match(none[0].solution, /Scrivi/);
  assert.equal(R.selectedSolutions(review({ other: '   ' })).length, 0);
});

test('i dati salvati non validi vengono scartati', () => {
  const clean = R.normalizeReview({
    ratings: { emotivo: 9, fisico: 2.5, mentale: '4', inesistente: 3 },
    problems: { emotivo: ['ansia', 'ansia', 'finto'], inesistente: ['x'], fisico: 'fame' },
    other: 42,
    worked: 'ok',
  });
  assert.deepEqual(clean.ratings, { mentale: 4 });
  assert.deepEqual(clean.problems, { emotivo: ['ansia'] });
  assert.equal(clean.other, '');
  assert.equal(clean.worked, 'ok');
  assert.deepEqual(R.normalizeReview(null), R.emptyReview());
});
