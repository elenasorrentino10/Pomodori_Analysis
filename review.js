// Content and scoring of the end-of-session reflection, independent of the page.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Review = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const PROBLEM_THRESHOLD = 3; // problems appear for ratings up to 3
  const AREA_WEIGHT = 0.7;
  const COMPLETION_WEIGHT = 0.3;

  const AREAS = Object.freeze([
    {
      id: 'emotivo',
      label: { it: 'Emotivo', en: 'Emotional' },
      question: { it: 'Com\'è stato il tuo stato d\'animo?', en: 'How was your mood?' },
      problems: [
        {
          id: 'ansia',
          label: { it: 'Ansia o agitazione', en: 'Anxiety or restlessness' },
          solution: {
            it: 'Prima di iniziare fai un minuto di respiri lenti e scrivi sul post-it cosa ti preoccupa. Poi parti dal compito più piccolo.',
            en: 'Before you start, take a minute of slow breathing and write on the sticky note what is worrying you. Then begin with the smallest task.',
          },
        },
        {
          id: 'frustrazione',
          label: { it: 'Frustrazione per i risultati', en: 'Frustration with results' },
          solution: {
            it: 'Riduci l\'obiettivo del prossimo pomodoro a un solo passo concreto e segna ciò che hai completato.',
            en: 'Shrink the goal of the next pomodoro to one concrete step and mark what you have completed.',
          },
        },
        {
          id: 'noia',
          label: { it: 'Noia', en: 'Boredom' },
          solution: {
            it: 'Alterna due argomenti, oppure trasforma la lettura in domande a cui rispondere.',
            en: 'Alternate two topics, or turn your reading into questions to answer.',
          },
        },
        {
          id: 'scoraggiamento',
          label: { it: 'Scoraggiamento o senso di colpa', en: 'Discouragement or guilt' },
          solution: {
            it: 'Confronta il lavoro di oggi con quello di ieri, non con la giornata ideale. Se questa sensazione dura nel tempo, parlane con una persona di fiducia o con un professionista.',
            en: 'Compare today\'s work with yesterday\'s, not with an ideal day. If this feeling lasts, talk to someone you trust or to a professional.',
          },
        },
      ],
    },
    {
      id: 'fisico',
      label: { it: 'Fisico', en: 'Physical' },
      question: { it: 'Come stava il tuo corpo?', en: 'How did your body feel?' },
      problems: [
        {
          id: 'stanchezza',
          label: { it: 'Stanchezza o sonno', en: 'Tiredness or sleepiness' },
          solution: {
            it: 'Sposta i compiti difficili nelle ore in cui rendi di più e proteggi l\'orario del sonno. Una pausa all\'aria aperta può aiutare.',
            en: 'Move difficult tasks to the hours when you work best and protect your sleep schedule. A break outdoors can help.',
          },
        },
        {
          id: 'postura',
          label: { it: 'Dolori o postura scomoda', en: 'Pain or uncomfortable posture' },
          solution: {
            it: 'Regola sedia e schermo, e usa le pause per alzarti e muoverti. Se il dolore persiste, parlane con un medico.',
            en: 'Adjust your chair and screen, and use breaks to stand up and move. If the pain persists, talk to a doctor.',
          },
        },
        {
          id: 'fame',
          label: { it: 'Fame o sete', en: 'Hunger or thirst' },
          solution: {
            it: 'Tieni l\'acqua sulla scrivania e prevedi uno spuntino in una pausa.',
            en: 'Keep water on your desk and plan a snack during a break.',
          },
        },
        {
          id: 'occhi',
          label: { it: 'Occhi affaticati', en: 'Tired eyes' },
          solution: {
            it: 'Durante le pause guarda lontano dallo schermo e controlla luce e luminosità.',
            en: 'During breaks, look into the distance away from the screen and check lighting and brightness.',
          },
        },
      ],
    },
    {
      id: 'mentale',
      label: { it: 'Mentale', en: 'Mental' },
      question: { it: 'Quanto è stato facile restare sul compito?', en: 'How easy was it to stay on task?' },
      problems: [
        {
          id: 'divagare',
          label: { it: 'Mente che vagava', en: 'Wandering mind' },
          solution: {
            it: 'Quando arriva un pensiero, scrivilo subito sul post-it e torna al compito: lo riprenderai in pausa.',
            en: 'When a thought comes up, write it on the sticky note right away and go back to your task: you will pick it up during the break.',
          },
        },
        {
          id: 'iniziare',
          label: { it: 'Difficoltà a iniziare', en: 'Hard to get started' },
          solution: {
            it: 'Dedica il primo pomodoro a un compito facile, così parti con qualcosa di già avviato.',
            en: 'Use the first pomodoro for an easy task, so you start with something already under way.',
          },
        },
        {
          id: 'sovraccarico',
          label: { it: 'Troppe informazioni', en: 'Too much information' },
          solution: {
            it: 'Accorcia i pomodori e chiudi ognuno con un riepilogo a parole tue nella nota.',
            en: 'Shorten your pomodoros and end each one with a summary in your own words in the note.',
          },
        },
        {
          id: 'multitasking',
          label: { it: 'Più cose insieme', en: 'Doing several things at once' },
          solution: {
            it: 'Scegli una sola attività per pomodoro e scrivila nella nota prima di iniziare.',
            en: 'Choose a single activity for each pomodoro and write it in the note before you start.',
          },
        },
      ],
    },
    {
      id: 'ambientale',
      label: { it: 'Ambientale', en: 'Environment' },
      question: { it: 'Il posto in cui hai lavorato ti ha aiutato?', en: 'Did the place where you worked help you?' },
      problems: [
        {
          id: 'rumore',
          label: { it: 'Rumore', en: 'Noise' },
          solution: {
            it: 'Prova tappi, cuffie con suoni neutri o un luogo più tranquillo per i compiti difficili.',
            en: 'Try earplugs, headphones with neutral sounds or a quieter place for difficult tasks.',
          },
        },
        {
          id: 'clima',
          label: { it: 'Luce o temperatura', en: 'Light or temperature' },
          solution: {
            it: 'Prima di iniziare sistema luce e temperatura, e arieggia la stanza durante le pause.',
            en: 'Set up light and temperature before you start, and air the room during breaks.',
          },
        },
        {
          id: 'disordine',
          label: { it: 'Postazione in disordine', en: 'Messy desk' },
          solution: {
            it: 'Riserva due minuti prima dell\'inizio per tenere sulla scrivania solo ciò che serve.',
            en: 'Spend two minutes before you start keeping only what you need on your desk.',
          },
        },
      ],
    },
    {
      id: 'digitale',
      label: { it: 'Digitale', en: 'Digital' },
      question: { it: 'Telefono e schermi ti hanno lasciato lavorare?', en: 'Did your phone and screens let you work?' },
      problems: [
        {
          id: 'telefono',
          label: { it: 'Telefono a portata di mano', en: 'Phone within reach' },
          solution: {
            it: 'Durante i pomodori lascialo in un\'altra stanza o fuori dalla vista.',
            en: 'During pomodoros, leave it in another room or out of sight.',
          },
        },
        {
          id: 'notifiche',
          label: { it: 'Notifiche', en: 'Notifications' },
          solution: {
            it: 'Attiva la modalità Non disturbare e chiudi le app che non servono.',
            en: 'Turn on Do Not Disturb and close the apps you do not need.',
          },
        },
        {
          id: 'schede',
          label: { it: 'Social o siti non legati allo studio', en: 'Social media or unrelated websites' },
          solution: {
            it: 'Tieni aperte solo le schede del compito e rimanda il resto alle pause.',
            en: 'Keep only the tabs for your task open and save the rest for breaks.',
          },
        },
      ],
    },
    {
      id: 'organizzazione',
      label: { it: 'Organizzazione', en: 'Organization' },
      question: { it: 'Il piano della giornata ha funzionato?', en: 'Did the day plan work?' },
      problems: [
        {
          id: 'obiettivo',
          label: { it: 'Obiettivo poco chiaro', en: 'Unclear goal' },
          solution: {
            it: 'Scrivi nella nota di ogni pomodoro cosa vuoi avere finito al termine.',
            en: 'In each pomodoro\'s note, write what you want to have finished by the end.',
          },
        },
        {
          id: 'troppo',
          label: { it: 'Troppe cose previste', en: 'Too much planned' },
          solution: {
            it: 'Scegli tre priorità e lascia il resto a un elenco separato.',
            en: 'Pick three priorities and keep everything else on a separate list.',
          },
        },
        {
          id: 'pause',
          label: { it: 'Pause saltate o troppo lunghe', en: 'Skipped or overlong breaks' },
          solution: {
            it: 'Attiva l\'avvio automatico e rispetta la campanella anche quando sei nel pieno del lavoro.',
            en: 'Turn on automatic start and follow the bell even when you are in the middle of your work.',
          },
        },
        {
          id: 'orari',
          label: { it: 'Durate o orari poco adatti', en: 'Unsuitable lengths or times' },
          solution: {
            it: 'Prova pomodori più brevi o più lunghi e sposta le pause pasto nel programma.',
            en: 'Try shorter or longer pomodoros and move the meal breaks in the plan.',
          },
        },
      ],
    },
    {
      id: 'materiale',
      label: { it: 'Materiale di studio', en: 'Study material' },
      question: { it: 'Argomenti e materiali erano adatti?', en: 'Were the topics and materials suitable?' },
      problems: [
        {
          id: 'difficile',
          label: { it: 'Argomento troppo difficile', en: 'Topic too difficult' },
          solution: {
            it: 'Cerca prima una spiegazione più semplice o chiedi aiuto, poi torna al testo principale.',
            en: 'First look for a simpler explanation or ask for help, then go back to the main text.',
          },
        },
        {
          id: 'mancante',
          label: { it: 'Materiale mancante', en: 'Missing material' },
          solution: {
            it: 'Prepara il materiale della sessione la sera prima.',
            en: 'Prepare the material for the session the evening before.',
          },
        },
        {
          id: 'passivo',
          label: { it: 'Studio solo passivo', en: 'Passive study only' },
          solution: {
            it: 'Alterna la lettura con esercizi, domande e ripassi a distanza di tempo.',
            en: 'Alternate reading with exercises, questions and spaced reviews.',
          },
        },
      ],
    },
    {
      id: 'motivazione',
      label: { it: 'Motivazione', en: 'Motivation' },
      question: { it: 'Quanta voglia avevi di portare avanti il lavoro?', en: 'How much did you want to keep going?' },
      problems: [
        {
          id: 'senso',
          label: { it: 'Poco senso in quello che facevo', en: 'Little sense in what I was doing' },
          solution: {
            it: 'Scrivi in una frase perché questo studio conta per te e tienila in vista.',
            en: 'Write in one sentence why this study matters to you and keep it in sight.',
          },
        },
        {
          id: 'rimandare',
          label: { it: 'Tendenza a rimandare', en: 'Tendency to procrastinate' },
          solution: {
            it: 'Impegnati solo per il primo pomodoro: dopo decidi se continuare.',
            en: 'Commit only to the first pomodoro, then decide whether to continue.',
          },
        },
        {
          id: 'ricompensa',
          label: { it: 'Nessuna ricompensa', en: 'No reward' },
          solution: {
            it: 'Scegli in anticipo una piccola cosa piacevole per la fine della sessione.',
            en: 'Choose a small treat in advance for the end of the session.',
          },
        },
      ],
    },
    {
      id: 'persone',
      label: { it: 'Persone e imprevisti', en: 'People and unexpected events' },
      question: { it: 'Hai potuto proteggere il tuo tempo?', en: 'Could you protect your time?' },
      problems: [
        {
          id: 'interruzioni',
          label: { it: 'Interruzioni da altre persone', en: 'Interruptions from other people' },
          solution: {
            it: 'Comunica in anticipo gli orari di studio e proponi di rispondere nelle pause.',
            en: 'Tell people your study hours in advance and offer to reply during breaks.',
          },
        },
        {
          id: 'impegni',
          label: { it: 'Impegni imprevisti', en: 'Unexpected commitments' },
          solution: {
            it: 'Lascia un margine nel programma e ricalcola gli orari quando cambia qualcosa.',
            en: 'Leave some slack in the plan and rebuild the times when something changes.',
          },
        },
      ],
    },
  ]);

  const OTHER = Object.freeze({
    label: { it: 'Altro', en: 'Other' },
    prompt: {
      it: 'Scrivi qui sopra una cosa concreta da provare la prossima volta.',
      en: 'Write above one concrete thing to try next time.',
    },
  });

  const BANDS = Object.freeze([
    { min: 85, label: { it: 'Ottima sessione', en: 'Great session' }, message: { it: 'Annota cosa ha funzionato, così puoi ripeterlo.', en: 'Write down what worked so you can repeat it.' } },
    { min: 70, label: { it: 'Buona sessione', en: 'Good session' }, message: { it: 'Scegli un solo dettaglio da migliorare la prossima volta.', en: 'Pick a single detail to improve next time.' } },
    { min: 50, label: { it: 'Sessione discreta', en: 'Fair session' }, message: { it: 'Parti dalla soluzione che ti sembra più semplice da applicare.', en: 'Start with the solution that seems easiest to apply.' } },
    { min: 0, label: { it: 'Sessione difficile', en: 'Tough session' }, message: { it: 'Può capitare: scegli una sola soluzione e riparti da lì.', en: 'It happens: pick one solution and start again from there.' } },
  ]);

  function localize(value, lang) {
    return value[lang] || value.it;
  }

  // An area with every text in the requested language.
  function areaText(area, lang) {
    return {
      id: area.id,
      label: localize(area.label, lang),
      question: localize(area.question, lang),
      problems: area.problems.map((problem) => ({
        id: problem.id,
        label: localize(problem.label, lang),
        solution: localize(problem.solution, lang),
      })),
    };
  }

  function emptyReview() {
    return { ratings: {}, problems: {}, other: '', otherSolution: '', worked: '', change: '' };
  }

  function text(value) {
    return typeof value === 'string' ? value : '';
  }

  // Keeps only ratings from 1 to 5 and problems that actually exist.
  function normalizeReview(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const ratings = source.ratings && typeof source.ratings === 'object' ? source.ratings : {};
    const problems = source.problems && typeof source.problems === 'object' ? source.problems : {};
    const review = emptyReview();

    AREAS.forEach((area) => {
      const rating = Number(ratings[area.id]);
      if (Number.isInteger(rating) && rating >= 1 && rating <= 5) review.ratings[area.id] = rating;
      if (Array.isArray(problems[area.id])) {
        const known = area.problems.map((problem) => problem.id);
        const picked = problems[area.id].filter((id) => known.includes(id));
        if (picked.length > 0) review.problems[area.id] = [...new Set(picked)];
      }
    });

    review.other = text(source.other);
    review.otherSolution = text(source.otherSolution);
    review.worked = text(source.worked);
    review.change = text(source.change);
    return review;
  }

  function showsProblems(rating) {
    return Number.isInteger(rating) && rating <= PROBLEM_THRESHOLD;
  }

  // The score is out of 100: 70% area ratings, 30% completed pomodoros.
  function computeScore(review, done, total, lang = 'it') {
    const ratings = Object.values(review.ratings);
    if (ratings.length === 0) return null;

    const average = ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
    const areas = Math.round((average / 5) * 100);
    const completion = total > 0 ? Math.round((done / total) * 100) : null;
    const score = completion === null
      ? areas
      : Math.round(areas * AREA_WEIGHT + completion * COMPLETION_WEIGHT);
    const band = BANDS.find((entry) => score >= entry.min);

    return {
      score,
      areas,
      completion,
      ratedCount: ratings.length,
      label: localize(band.label, lang),
      message: localize(band.message, lang),
    };
  }

  // Solutions for the selected problems, starting from the areas with the lowest rating.
  function selectedSolutions(review, lang = 'it') {
    const solutions = AREAS
      .filter((area) => showsProblems(review.ratings[area.id]))
      .sort((a, b) => review.ratings[a.id] - review.ratings[b.id])
      .flatMap((area) => {
        const local = areaText(area, lang);
        return local.problems
          .filter((problem) => (review.problems[area.id] || []).includes(problem.id))
          .map((problem) => ({ area: local.label, problem: problem.label, solution: problem.solution }));
      });

    if (review.other.trim()) {
      solutions.push({
        area: localize(OTHER.label, lang),
        problem: review.other.trim(),
        solution: review.otherSolution.trim() || localize(OTHER.prompt, lang),
      });
    }
    return solutions;
  }

  return { AREAS, areaText, emptyReview, normalizeReview, showsProblems, computeScore, selectedSolutions };
});
