// Interface text in Italian and English. Works in the browser and in the tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.I18n = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const LANGS = ['it', 'en'];
  const DEFAULT_LANG = 'it';

  const STRINGS = {
    it: {
      'lang.switch': 'EN',
      'lang.switchLabel': 'Switch to English',
      'locale': 'it-IT',

      'howto.label': 'Come funziona',
      'howto.step1': 'Scegli <strong>orari</strong> e pause pasto.',
      'howto.step2': 'Premi <strong>Avvia</strong>: pomodori e pause si susseguono da soli.',
      'howto.step3': 'Alla fine <strong>rifletti</strong> sulla sessione e ricevi suggerimenti.',
      'howto.close': 'Chiudi la spiegazione',
      'common.close': 'Chiudi',

      'side.label': 'Post-it e riflessione',
      'postit.label': 'Post-it',
      'postit.placeholder': 'Scrivi qui quello che ti viene in mente, poi torna al compito.',
      'review.open': 'Com\'è andata la sessione?',
      'review.openShort': 'Com\'è andata?',
      'tools.label': 'Strumenti',

      'planner.label': 'Programma della giornata',
      'planner.edit': 'Modifica',
      'planner.close': 'Chiudi',
      'planner.start': 'Ora di inizio',
      'planner.end': 'Ora di fine',
      'planner.addMeal': '+ Aggiungi pausa pasto',
      'planner.calculate': 'Calcola programma',
      'settings.title': 'Altre impostazioni',
      'settings.pomo': 'Durata pomodoro (min)',
      'settings.break': 'Pausa breve (min)',
      'settings.autoAdvance': 'Avvia automaticamente il blocco successivo',
      'settings.notify': 'Notifiche quando la pagina non è in primo piano',
      'settings.resetChecks': 'Azzera spunte',
      'settings.undo': '↩ Annulla',
      'settings.restore': 'Ripristina impostazioni predefinite',
      'settings.testBell': 'Prova campanella',

      'meal.at': 'Pausa pasto alle',
      'meal.for': 'per',
      'meal.minutes': 'min',
      'meal.remove': 'Rimuovi pausa pasto',
      'meal.removeN': 'Rimuovi pausa pasto {n}',

      'plan.needTimes': 'Inserisci ora di inizio e ora di fine.',
      'plan.needMealTime': 'Inserisci l\'orario di ogni pausa pasto, oppure rimuovila.',
      'plan.sameTimes': 'Ora di inizio e ora di fine devono essere diverse.',
      'plan.tooShort': 'Il tempo disponibile è troppo breve per un pomodoro da {min} minuti.',
      'plan.mealOutside': 'Ogni pausa pasto deve iniziare e finire tra l\'ora di inizio e l\'ora di fine.',
      'plan.mealOverlap': 'Due pause pasto si sovrappongono: cambia un orario o una durata.',
      'plan.pomodoros.one': '{n} pomodoro',
      'plan.pomodoros.other': '{n} pomodori',
      'plan.breaks.one': '{n} pausa breve',
      'plan.breaks.other': '{n} pause brevi',
      'plan.and': ' e ',
      'plan.noMeal': ', nessuna pausa pasto',
      'plan.meals.one': ', pausa pasto alle {times}',
      'plan.meals.other': ', pause pasto alle {times}',
      'plan.ends': '. Fine alle {time}.',
      'plan.capped': ' È stato raggiunto il limite di 50 pomodori.',
      'plan.compactMeal': ' · pausa pasto alle {time}',
      'plan.compactMeals': ' · {n} pause pasto',

      'now.label': 'Blocco corrente',
      'now.running': 'Ora',
      'now.paused': 'In pausa',
      'now.next': 'Prossimo',
      'now.then': 'Poi: {name} alle {time}',
      'now.last': 'Ultimo blocco della giornata',
      'now.start': 'Avvia',
      'now.pause': 'Pausa',
      'now.resume': 'Riprendi',
      'now.doneKicker': 'Programma completato',
      'now.doneTitle': 'Com\'è andata?',
      'now.doneText': 'Bastano pochi minuti per capire cosa migliorare.',
      'now.reflect': 'Rifletti',
      'now.keepOpen': 'Tieni la pagina aperta perché la campanella possa suonare.',

      'progress.label': 'Pomodori completati',
      'item.pomodoro': 'Pomodoro {n}',
      'item.break': 'Pausa',
      'item.meal': 'Pausa pasto',
      'item.finishedPomodoro': '{name} terminato',
      'item.finishedBreak': '{name} terminata',
      'row.completed': '{name} completato',
      'row.details': '{name}, dalle {start} alle {end}, dettagli',
      'row.hasNote': 'Con nota',
      'row.startOf': 'Inizio {name}',
      'row.endOf': 'Fine {name}',
      'row.startThis': 'Avvia questo',
      'row.pause': 'Pausa',
      'row.reset': 'Azzera timer',
      'row.notePlaceholder': 'Scrivi una nota',
      'row.noteFor': 'Nota per {name}',

      'status.saveFailed': 'Non è stato possibile salvare i dati in questo browser.',
      'status.invalidTime': 'Orario non valido: inizio e fine devono essere compilati e diversi tra loro.',
      'status.planBuilt': 'Programma calcolato.',
      'status.checksCleared': 'Spunte azzerate.',
      'status.undone': 'Ultima modifica annullata.',
      'status.defaults': 'Impostazioni predefinite ripristinate.',
      'status.resumed': 'Timer ripreso: {name}.',
      'status.finished': '{label}.',
      'status.finishedClosed': '{label} mentre la pagina era chiusa.',
      'notify.next': 'Prossimo: {name}',
      'notify.done': 'Programma completato',
      'notify.unsupported': 'Questo browser non supporta le notifiche.',
      'notify.denied': 'Notifiche non autorizzate: puoi attivarle dalle impostazioni del browser.',
      'notify.enabled': 'Notifiche attivate.',

      'review.title': 'Com\'è andata la sessione?',
      'review.close': 'Chiudi la riflessione',
      'review.intro': 'Dai un voto da 1 (molto male) a 5 (molto bene). Con un voto fino a 3 puoi indicare cosa non ha funzionato e ricevere un suggerimento. Puoi saltare le aree che non ti interessano.',
      'review.stepArea': 'Area {n} di {total}',
      'review.other': 'Altro',
      'review.otherQuestion': 'C\'è altro che ha influito sulla sessione?',
      'review.otherSolution': 'Che cosa potresti provare?',
      'review.closing': 'Per chiudere',
      'review.worked': 'Che cosa ha funzionato?',
      'review.change': 'Che cosa cambierai la prossima volta?',
      'review.result': 'Risultato',
      'review.rating': '{area}: voto {value} su 5',
      'review.back': 'Indietro',
      'review.next': 'Avanti',
      'review.skip': 'Salta',
      'review.seeResult': 'Vedi il risultato',
      'review.done': 'Fine',
      'review.reset': 'Azzera riflessione',
      'review.confirmReset': 'Vuoi cancellare voti e risposte della riflessione?',
      'review.scoreEmpty': 'Dai almeno un voto per vedere il punteggio finale.',
      'review.scoreDetail': 'Aree valutate: {rated} su {total}, media {areas}/100. Pomodori completati: {done} su {pomodoros}. Il punteggio pesa per il 70% i voti e per il 30% i pomodori: serve a confrontare le sessioni, non a giudicarti.',
      'review.tryNext': 'Da provare la prossima volta',
    },

    en: {
      'lang.switch': 'IT',
      'lang.switchLabel': 'Passa all\'italiano',
      'locale': 'en-GB',

      'howto.label': 'How it works',
      'howto.step1': 'Choose your <strong>hours</strong> and meal breaks.',
      'howto.step2': 'Press <strong>Start</strong>: pomodoros and breaks follow one another automatically.',
      'howto.step3': 'At the end, <strong>reflect</strong> on the session and get suggestions.',
      'howto.close': 'Close the explanation',
      'common.close': 'Close',

      'side.label': 'Sticky note and reflection',
      'postit.label': 'Sticky note',
      'postit.placeholder': 'Write down whatever comes to mind, then get back to your task.',
      'review.open': 'How did the session go?',
      'review.openShort': 'How did it go?',
      'tools.label': 'Tools',

      'planner.label': 'Day plan',
      'planner.edit': 'Edit',
      'planner.close': 'Close',
      'planner.start': 'Start time',
      'planner.end': 'End time',
      'planner.addMeal': '+ Add meal break',
      'planner.calculate': 'Build plan',
      'settings.title': 'More settings',
      'settings.pomo': 'Pomodoro length (min)',
      'settings.break': 'Short break (min)',
      'settings.autoAdvance': 'Start the next block automatically',
      'settings.notify': 'Notifications when the page is in the background',
      'settings.resetChecks': 'Clear checkmarks',
      'settings.undo': '↩ Undo',
      'settings.restore': 'Restore default settings',
      'settings.testBell': 'Test bell',

      'meal.at': 'Meal break at',
      'meal.for': 'for',
      'meal.minutes': 'min',
      'meal.remove': 'Remove meal break',
      'meal.removeN': 'Remove meal break {n}',

      'plan.needTimes': 'Enter a start time and an end time.',
      'plan.needMealTime': 'Enter a time for every meal break, or remove it.',
      'plan.sameTimes': 'Start time and end time must be different.',
      'plan.tooShort': 'There is not enough time for a {min}-minute pomodoro.',
      'plan.mealOutside': 'Every meal break must start and end between the start time and the end time.',
      'plan.mealOverlap': 'Two meal breaks overlap: change a time or a length.',
      'plan.pomodoros.one': '{n} pomodoro',
      'plan.pomodoros.other': '{n} pomodoros',
      'plan.breaks.one': '{n} short break',
      'plan.breaks.other': '{n} short breaks',
      'plan.and': ' and ',
      'plan.noMeal': ', no meal break',
      'plan.meals.one': ', meal break at {times}',
      'plan.meals.other': ', meal breaks at {times}',
      'plan.ends': '. Ends at {time}.',
      'plan.capped': ' The limit of 50 pomodoros has been reached.',
      'plan.compactMeal': ' · meal break at {time}',
      'plan.compactMeals': ' · {n} meal breaks',

      'now.label': 'Current block',
      'now.running': 'Now',
      'now.paused': 'Paused',
      'now.next': 'Next',
      'now.then': 'Then: {name} at {time}',
      'now.last': 'Last block of the day',
      'now.start': 'Start',
      'now.pause': 'Pause',
      'now.resume': 'Resume',
      'now.doneKicker': 'Plan completed',
      'now.doneTitle': 'How did it go?',
      'now.doneText': 'A few minutes are enough to see what to improve.',
      'now.reflect': 'Reflect',
      'now.keepOpen': 'Keep the page open so the bell can ring.',

      'progress.label': 'Completed pomodoros',
      'item.pomodoro': 'Pomodoro {n}',
      'item.break': 'Break',
      'item.meal': 'Meal break',
      'item.finishedPomodoro': '{name} finished',
      'item.finishedBreak': '{name} finished',
      'row.completed': '{name} completed',
      'row.details': '{name}, from {start} to {end}, details',
      'row.hasNote': 'Has a note',
      'row.startOf': 'Start of {name}',
      'row.endOf': 'End of {name}',
      'row.startThis': 'Start this',
      'row.pause': 'Pause',
      'row.reset': 'Reset timer',
      'row.notePlaceholder': 'Write a note',
      'row.noteFor': 'Note for {name}',

      'status.saveFailed': 'Your data could not be saved in this browser.',
      'status.invalidTime': 'Invalid time: start and end must be filled in and different.',
      'status.planBuilt': 'Plan built.',
      'status.checksCleared': 'Checkmarks cleared.',
      'status.undone': 'Last change undone.',
      'status.defaults': 'Default settings restored.',
      'status.resumed': 'Timer resumed: {name}.',
      'status.finished': '{label}.',
      'status.finishedClosed': '{label} while the page was closed.',
      'notify.next': 'Next: {name}',
      'notify.done': 'Plan completed',
      'notify.unsupported': 'This browser does not support notifications.',
      'notify.denied': 'Notifications are blocked: you can allow them in your browser settings.',
      'notify.enabled': 'Notifications enabled.',

      'review.title': 'How did the session go?',
      'review.close': 'Close the reflection',
      'review.intro': 'Rate each area from 1 (very bad) to 5 (very good). With a rating of 3 or lower you can say what did not work and get a suggestion. You can skip the areas you are not interested in.',
      'review.stepArea': 'Area {n} of {total}',
      'review.other': 'Other',
      'review.otherQuestion': 'Did anything else affect the session?',
      'review.otherSolution': 'What could you try?',
      'review.closing': 'Wrapping up',
      'review.worked': 'What worked?',
      'review.change': 'What will you change next time?',
      'review.result': 'Result',
      'review.rating': '{area}: rating {value} out of 5',
      'review.back': 'Back',
      'review.next': 'Next',
      'review.skip': 'Skip',
      'review.seeResult': 'See the result',
      'review.done': 'Done',
      'review.reset': 'Reset reflection',
      'review.confirmReset': 'Delete the ratings and answers of this reflection?',
      'review.scoreEmpty': 'Rate at least one area to see your final score.',
      'review.scoreDetail': 'Areas rated: {rated} of {total}, average {areas}/100. Completed pomodoros: {done} of {pomodoros}. The score weighs ratings at 70% and pomodoros at 30%: it is meant to compare sessions, not to judge you.',
      'review.tryNext': 'To try next time',
    },
  };

  function isLang(value) {
    return LANGS.includes(value);
  }

  // Priority: language in the address, saved choice, browser language. Default: English.
  function detect(urlLang, savedLang, browserLang) {
    if (isLang(urlLang)) return urlLang;
    if (isLang(savedLang)) return savedLang;
    return /^it\b/i.test(browserLang || '') ? 'it' : 'en';
  }

  function translate(lang, key, params) {
    const table = STRINGS[isLang(lang) ? lang : DEFAULT_LANG];
    const template = key in table ? table[key] : STRINGS[DEFAULT_LANG][key];
    if (template === undefined) return key;
    return template.replace(/\{(\w+)\}/g, (match, name) => (params && name in params ? String(params[name]) : match));
  }

  function plural(lang, key, n) {
    return translate(lang, key + (n === 1 ? '.one' : '.other'), { n });
  }

  function itemName(item, lang) {
    if (item.type === 'pomodoro') return translate(lang, 'item.pomodoro', { n: item.n });
    return translate(lang, item.meal ? 'item.meal' : 'item.break');
  }

  function finishedLabel(item, lang) {
    const key = item.type === 'pomodoro' ? 'item.finishedPomodoro' : 'item.finishedBreak';
    return translate(lang, key, { name: itemName(item, lang) });
  }

  // "13:00", "13:00 e 19:30", "9:00, 13:00 e 19:30"
  function joinList(lang, values) {
    if (values.length <= 1) return values.join('');
    return values.slice(0, -1).join(', ') + translate(lang, 'plan.and') + values[values.length - 1];
  }

  return { LANGS, DEFAULT_LANG, STRINGS, detect, translate, plural, itemName, finishedLabel, joinList };
});
