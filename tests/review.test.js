const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../review.js');

const review = (overrides = {}) => R.normalizeReview({ ...R.emptyReview(), ...overrides });
const filled = (value) => typeof value === 'string' && value.trim().length > 0;

test('every area has a question and problems with a solution in both languages, without duplicate ids', () => {
  assert.equal(new Set(R.AREAS.map((a) => a.id)).size, R.AREAS.length);
  for (const area of R.AREAS) {
    for (const lang of ['it', 'en']) {
      assert.ok(filled(area.label[lang]) && filled(area.question[lang]), area.id + ' ' + lang);
      for (const problem of area.problems) {
        assert.ok(filled(problem.label[lang]) && filled(problem.solution[lang]), area.id + '/' + problem.id + ' ' + lang);
      }
    }
    assert.ok(area.problems.length >= 2, area.id);
    assert.equal(new Set(area.problems.map((p) => p.id)).size, area.problems.length, area.id);
  }
});

test('the requested areas are present', () => {
  const ids = R.AREAS.map((a) => a.id);
  for (const id of ['emotivo', 'fisico', 'mentale', 'ambientale']) assert.ok(ids.includes(id), id);
});

test('an area can be read in either language', () => {
  const area = R.AREAS.find((a) => a.id === 'fisico');
  assert.equal(R.areaText(area, 'it').label, 'Fisico');
  assert.equal(R.areaText(area, 'en').label, 'Physical');
  assert.equal(R.areaText(area, 'en').problems[0].label, 'Tiredness or sleepiness');
  assert.equal(R.areaText(area, 'fr').label, 'Fisico');
});

test('without ratings there is no score', () => {
  assert.equal(R.computeScore(review(), 5, 10), null);
});

test('the score weighs areas at 70% and completed pomodoros at 30%', () => {
  const result = R.computeScore(review({ ratings: { emotivo: 4, fisico: 4 } }), 5, 10);
  assert.equal(result.areas, 80);
  assert.equal(result.completion, 50);
  assert.equal(result.score, 71);
  assert.equal(result.ratedCount, 2);
});

test('without pomodoros in the plan only the area average counts', () => {
  const result = R.computeScore(review({ ratings: { emotivo: 3 } }), 0, 0);
  assert.equal(result.score, 60);
  assert.equal(result.completion, null);
});

test('score limits and bands are consistent in both languages', () => {
  const allRatings = (value) => Object.fromEntries(R.AREAS.map((a) => [a.id, value]));
  const best = R.computeScore(review({ ratings: allRatings(5) }), 10, 10);
  assert.equal(best.score, 100);
  assert.equal(best.label, 'Ottima sessione');
  assert.equal(R.computeScore(review({ ratings: allRatings(5) }), 10, 10, 'en').label, 'Great session');
  const worst = R.computeScore(review({ ratings: allRatings(1) }), 0, 10);
  assert.equal(worst.score, 14);
  assert.equal(worst.label, 'Sessione difficile');
  assert.equal(R.computeScore(review({ ratings: allRatings(1) }), 0, 10, 'en').label, 'Tough session');
});

test('problems appear only for ratings up to 3', () => {
  assert.equal(R.showsProblems(1), true);
  assert.equal(R.showsProblems(3), true);
  assert.equal(R.showsProblems(4), false);
  assert.equal(R.showsProblems(undefined), false);
});

test('solutions start from the areas with the lowest rating', () => {
  const data = review({
    ratings: { fisico: 3, emotivo: 1 },
    problems: { fisico: ['fame'], emotivo: ['ansia'] },
  });
  assert.deepEqual(R.selectedSolutions(data).map((i) => i.area), ['Emotivo', 'Fisico']);
  const english = R.selectedSolutions(data, 'en');
  assert.deepEqual(english.map((i) => i.area), ['Emotional', 'Physical']);
  assert.equal(english[1].problem, 'Hunger or thirst');
});

test('a problem in a highly rated area gives no solution', () => {
  const items = R.selectedSolutions(review({ ratings: { fisico: 5 }, problems: { fisico: ['fame'] } }));
  assert.equal(items.length, 0);
});

test('the Other entry uses the written solution or a prompt to write one', () => {
  const own = R.selectedSolutions(review({ other: ' Un trasloco ', otherSolution: ' Studio in biblioteca ' }));
  assert.deepEqual(own, [{ area: 'Altro', problem: 'Un trasloco', solution: 'Studio in biblioteca' }]);
  const none = R.selectedSolutions(review({ other: 'Un trasloco' }));
  assert.match(none[0].solution, /Scrivi/);
  const english = R.selectedSolutions(review({ other: 'Moving house' }), 'en');
  assert.equal(english[0].area, 'Other');
  assert.match(english[0].solution, /Write/);
  assert.equal(R.selectedSolutions(review({ other: '   ' })).length, 0);
});

test('invalid saved data is discarded', () => {
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
