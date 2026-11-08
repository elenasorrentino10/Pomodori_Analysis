// Contenuti e punteggio della riflessione finale, senza dipendenze dalla pagina.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Review = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const PROBLEM_THRESHOLD = 3; // i problemi compaiono con un voto fino a 3
  const AREA_WEIGHT = 0.7;
  const COMPLETION_WEIGHT = 0.3;

  const AREAS = Object.freeze([
    {
      id: 'emotivo',
      label: 'Emotivo',
      question: 'Com\'è stato il tuo stato d\'animo?',
      problems: [
        { id: 'ansia', label: 'Ansia o agitazione', solution: 'Prima di iniziare fai un minuto di respiri lenti e scrivi sul post-it cosa ti preoccupa. Poi parti dal compito più piccolo.' },
        { id: 'frustrazione', label: 'Frustrazione per i risultati', solution: 'Riduci l\'obiettivo del prossimo pomodoro a un solo passo concreto e segna ciò che hai completato.' },
        { id: 'noia', label: 'Noia', solution: 'Alterna due argomenti, oppure trasforma la lettura in domande a cui rispondere.' },
        { id: 'scoraggiamento', label: 'Scoraggiamento o senso di colpa', solution: 'Confronta il lavoro di oggi con quello di ieri, non con la giornata ideale. Se questa sensazione dura nel tempo, parlane con una persona di fiducia o con un professionista.' },
      ],
    },
    {
      id: 'fisico',
      label: 'Fisico',
      question: 'Come stava il tuo corpo?',
      problems: [
        { id: 'stanchezza', label: 'Stanchezza o sonno', solution: 'Sposta i compiti difficili nelle ore in cui rendi di più e proteggi l\'orario del sonno. Una pausa all\'aria aperta può aiutare.' },
        { id: 'postura', label: 'Dolori o postura scomoda', solution: 'Regola sedia e schermo, e usa le pause per alzarti e muoverti. Se il dolore persiste, parlane con un medico.' },
        { id: 'fame', label: 'Fame o sete', solution: 'Tieni l\'acqua sulla scrivania e prevedi uno spuntino in una pausa.' },
        { id: 'occhi', label: 'Occhi affaticati', solution: 'Durante le pause guarda lontano dallo schermo e controlla luce e luminosità.' },
      ],
    },
    {
      id: 'mentale',
      label: 'Mentale',
      question: 'Quanto è stato facile restare sul compito?',
      problems: [
        { id: 'divagare', label: 'Mente che vagava', solution: 'Quando arriva un pensiero, scrivilo subito sul post-it e torna al compito: lo riprenderai in pausa.' },
        { id: 'iniziare', label: 'Difficoltà a iniziare', solution: 'Dedica il primo pomodoro a un compito facile, così parti con qualcosa di già avviato.' },
        { id: 'sovraccarico', label: 'Troppe informazioni', solution: 'Accorcia i pomodori e chiudi ognuno con un riepilogo a parole tue nella nota.' },
        { id: 'multitasking', label: 'Più cose insieme', solution: 'Scegli una sola attività per pomodoro e scrivila nella nota prima di iniziare.' },
      ],
    },
    {
      id: 'ambientale',
      label: 'Ambientale',
      question: 'Il posto in cui hai lavorato ti ha aiutato?',
      problems: [
        { id: 'rumore', label: 'Rumore', solution: 'Prova tappi, cuffie con suoni neutri o un luogo più tranquillo per i compiti difficili.' },
        { id: 'clima', label: 'Luce o temperatura', solution: 'Prima di iniziare sistema luce e temperatura, e arieggia la stanza durante le pause.' },
        { id: 'disordine', label: 'Postazione in disordine', solution: 'Riserva due minuti prima dell\'inizio per tenere sulla scrivania solo ciò che serve.' },
      ],
    },
    {
      id: 'digitale',
      label: 'Digitale',
      question: 'Telefono e schermi ti hanno lasciato lavorare?',
      problems: [
        { id: 'telefono', label: 'Telefono a portata di mano', solution: 'Durante i pomodori lascialo in un\'altra stanza o fuori dalla vista.' },
        { id: 'notifiche', label: 'Notifiche', solution: 'Attiva la modalità Non disturbare e chiudi le app che non servono.' },
        { id: 'schede', label: 'Social o siti non legati allo studio', solution: 'Tieni aperte solo le schede del compito e rimanda il resto alle pause.' },
      ],
    },
    {
      id: 'organizzazione',
      label: 'Organizzazione',
      question: 'Il piano della giornata ha funzionato?',
      problems: [
        { id: 'obiettivo', label: 'Obiettivo poco chiaro', solution: 'Scrivi nella nota di ogni pomodoro cosa vuoi avere finito al termine.' },
        { id: 'troppo', label: 'Troppe cose previste', solution: 'Scegli tre priorità e lascia il resto a un elenco separato.' },
        { id: 'pause', label: 'Pause saltate o troppo lunghe', solution: 'Attiva l\'avvio automatico e rispetta la campanella anche quando sei nel pieno del lavoro.' },
        { id: 'orari', label: 'Durate o orari poco adatti', solution: 'Prova pomodori più brevi o più lunghi e sposta le pause pasto nel programma.' },
      ],
    },
    {
      id: 'materiale',
      label: 'Materiale di studio',
      question: 'Argomenti e materiali erano adatti?',
      problems: [
        { id: 'difficile', label: 'Argomento troppo difficile', solution: 'Cerca prima una spiegazione più semplice o chiedi aiuto, poi torna al testo principale.' },
        { id: 'mancante', label: 'Materiale mancante', solution: 'Prepara il materiale della sessione la sera prima.' },
        { id: 'passivo', label: 'Studio solo passivo', solution: 'Alterna la lettura con esercizi, domande e ripassi a distanza di tempo.' },
      ],
    },
    {
      id: 'motivazione',
      label: 'Motivazione',
      question: 'Quanta voglia avevi di portare avanti il lavoro?',
      problems: [
        { id: 'senso', label: 'Poco senso in quello che facevo', solution: 'Scrivi in una frase perché questo studio conta per te e tienila in vista.' },
        { id: 'rimandare', label: 'Tendenza a rimandare', solution: 'Impegnati solo per il primo pomodoro: dopo decidi se continuare.' },
        { id: 'ricompensa', label: 'Nessuna ricompensa', solution: 'Scegli in anticipo una piccola cosa piacevole per la fine della sessione.' },
      ],
    },
    {
      id: 'persone',
      label: 'Persone e imprevisti',
      question: 'Hai potuto proteggere il tuo tempo?',
      problems: [
        { id: 'interruzioni', label: 'Interruzioni da altre persone', solution: 'Comunica in anticipo gli orari di studio e proponi di rispondere nelle pause.' },
        { id: 'impegni', label: 'Impegni imprevisti', solution: 'Lascia un margine nel programma e ricalcola gli orari quando cambia qualcosa.' },
      ],
    },
  ]);

  function emptyReview() {
    return { ratings: {}, problems: {}, other: '', otherSolution: '', worked: '', change: '' };
  }

  function text(value) {
    return typeof value === 'string' ? value : '';
  }

  // Tiene solo voti da 1 a 5 e problemi che esistono davvero.
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

  function scoreBand(score) {
    if (score >= 85) return { label: 'Ottima sessione', message: 'Annota cosa ha funzionato, così puoi ripeterlo.' };
    if (score >= 70) return { label: 'Buona sessione', message: 'Scegli un solo dettaglio da migliorare la prossima volta.' };
    if (score >= 50) return { label: 'Sessione discreta', message: 'Parti dalla soluzione che ti sembra più semplice da applicare.' };
    return { label: 'Sessione difficile', message: 'Può capitare: scegli una sola soluzione e riparti da lì.' };
  }

  // Il punteggio è in centesimi: 70% voti delle aree, 30% pomodori completati.
  function computeScore(review, done, total) {
    const ratings = Object.values(review.ratings);
    if (ratings.length === 0) return null;

    const average = ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
    const areas = Math.round((average / 5) * 100);
    const completion = total > 0 ? Math.round((done / total) * 100) : null;
    const score = completion === null
      ? areas
      : Math.round(areas * AREA_WEIGHT + completion * COMPLETION_WEIGHT);

    return { score, areas, completion, ratedCount: ratings.length, ...scoreBand(score) };
  }

  // Soluzioni per i problemi segnati, a partire dalle aree con il voto più basso.
  function selectedSolutions(review) {
    const solutions = AREAS
      .filter((area) => showsProblems(review.ratings[area.id]))
      .sort((a, b) => review.ratings[a.id] - review.ratings[b.id])
      .flatMap((area) => area.problems
        .filter((problem) => (review.problems[area.id] || []).includes(problem.id))
        .map((problem) => ({ area: area.label, problem: problem.label, solution: problem.solution })));

    if (review.other.trim()) {
      solutions.push({
        area: 'Altro',
        problem: review.other.trim(),
        solution: review.otherSolution.trim() || 'Scrivi qui sopra una cosa concreta da provare la prossima volta.',
      });
    }
    return solutions;
  }

  return { AREAS, emptyReview, normalizeReview, showsProblems, computeScore, selectedSolutions };
});
