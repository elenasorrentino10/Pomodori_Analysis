const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../i18n.js');

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('every text exists in both languages and is not empty', () => {
  const it = Object.keys(I.STRINGS.it).sort();
  const en = Object.keys(I.STRINGS.en).sort();
  assert.deepEqual(en, it);
  for (const lang of I.LANGS) {
    for (const [key, value] of Object.entries(I.STRINGS[lang])) {
      assert.ok(typeof value === 'string' && value.trim().length > 0, lang + ' ' + key);
    }
  }
});

test('translations use the same placeholders in both languages', () => {
  for (const key of Object.keys(I.STRINGS.it)) {
    assert.deepEqual(placeholders(I.STRINGS.en[key]), placeholders(I.STRINGS.it[key]), key);
  }
});

test('the language comes from the address, then the saved choice, then the browser', () => {
  assert.equal(I.detect('en', 'it', 'it-IT'), 'en');
  assert.equal(I.detect(null, 'it', 'en-US'), 'it');
  assert.equal(I.detect(null, null, 'it-IT'), 'it');
  assert.equal(I.detect(null, null, 'en-US'), 'en');
  assert.equal(I.detect('fr', 'de', 'fr-FR'), 'en');
  assert.equal(I.detect(undefined, undefined, undefined), 'en');
});

test('placeholders are replaced and unknown keys fall back safely', () => {
  assert.equal(I.translate('en', 'plan.tooShort', { min: 25 }), 'There is not enough time for a 25-minute pomodoro.');
  assert.equal(I.translate('it', 'plan.tooShort', { min: 25 }), 'Il tempo disponibile è troppo breve per un pomodoro da 25 minuti.');
  assert.equal(I.translate('fr', 'now.start'), 'Avvia');
  assert.equal(I.translate('en', 'missing.key'), 'missing.key');
});

test('plurals follow the count', () => {
  assert.equal(I.plural('en', 'plan.pomodoros', 1), '1 pomodoro');
  assert.equal(I.plural('en', 'plan.pomodoros', 16), '16 pomodoros');
  assert.equal(I.plural('it', 'plan.breaks', 1), '1 pausa breve');
  assert.equal(I.plural('it', 'plan.breaks', 14), '14 pause brevi');
});

test('block names and end messages match the language', () => {
  assert.equal(I.itemName({ type: 'pomodoro', n: 3 }, 'it'), 'Pomodoro 3');
  assert.equal(I.itemName({ type: 'pausa', meal: true }, 'en'), 'Meal break');
  assert.equal(I.finishedLabel({ type: 'pomodoro', n: 3 }, 'it'), 'Pomodoro 3 terminato');
  assert.equal(I.finishedLabel({ type: 'pausa', meal: false }, 'it'), 'Pausa terminata');
  assert.equal(I.finishedLabel({ type: 'pausa', meal: true }, 'it'), 'Pausa pasto terminata');
  assert.equal(I.finishedLabel({ type: 'pausa', meal: false }, 'en'), 'Break finished');
});

test('lists are joined with the right word', () => {
  assert.equal(I.joinList('it', ['13:00']), '13:00');
  assert.equal(I.joinList('it', ['13:00', '19:30']), '13:00 e 19:30');
  assert.equal(I.joinList('en', ['09:00', '13:00', '19:30']), '09:00, 13:00 and 19:30');
});
