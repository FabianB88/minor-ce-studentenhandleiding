/* Opslag van scores en voortgang voor de learning game.
   - Voortgang (welke vragen goed/fout, niveaus per categorie, XP, dagstreak) staat lokaal in de browser.
   - Highscores staan lokaal, of gedeeld in Firestore zodra window.LG_FIREBASE is ingevuld
     (zie game-config.js). Zonder config werkt alles lokaal.
*/
(function () {
  const LS_SCORES = 'lg_scores_v1';
  const LS_NAAM = 'lg_naam';
  const LS_STATS = 'lg_stats_v1';

  function lees(k, fallback) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function schrijf(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  const vandaag = () => new Date().toISOString().slice(0, 10);

  /* ── Naam ── */
  const Naam = {
    get() { return (lees(LS_NAAM, '') || '').toString(); },
    set(n) { schrijf(LS_NAAM, n); }
  };

  /* ── Levels: XP-drempels en titels uit de stof ── */
  const LEVELS = [
    { xp: 0, titel: 'Starter' }, { xp: 120, titel: 'Verkenner' }, { xp: 320, titel: 'Kringloopdenker' },
    { xp: 640, titel: 'Systeemdenker' }, { xp: 1100, titel: 'Strateeg' }, { xp: 1700, titel: 'Transitiemaker' },
    { xp: 2500, titel: 'Regeneratief' }
  ];

  /* ── Leerstatistiek per vraag (voor adaptieve selectie), XP en streak ── */
  const Stats = {
    alles() { const s = lees(LS_STATS, {}); s.vragen = s.vragen || {}; s.cat = s.cat || {}; s.xp = s.xp || 0; s.dagen = s.dagen || []; return s; },
    noteer(q, goed) {
      const s = this.alles();
      const v = s.vragen[q.id] || { g: 0, f: 0, laatst: 0 };
      if (goed) v.g++; else v.f++;
      v.laatst = Date.now();
      s.vragen[q.id] = v;
      const c = s.cat[q.cat] || { 1: { g: 0, f: 0 }, 2: { g: 0, f: 0 }, 3: { g: 0, f: 0 } };
      c[q.n] = c[q.n] || { g: 0, f: 0 };
      if (goed) c[q.n].g++; else c[q.n].f++;
      s.cat[q.cat] = c;
      s.xp += goed ? 8 * (q.n || 1) : 2;              // ook een fout levert iets op: je hebt de uitleg gelezen
      schrijf(LS_STATS, s);
    },
    /* Een afgeronde ronde telt voor de dagstreak */
    ronde() {
      const s = this.alles(); const d = vandaag();
      if (!s.dagen.includes(d)) { s.dagen.push(d); s.dagen = s.dagen.slice(-400); }
      s.xp += 15;
      schrijf(LS_STATS, s);
    },
    streak() {
      const dagen = new Set(this.alles().dagen);
      let n = 0; const d = new Date();
      if (!dagen.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1);   // vandaag nog niet gespeeld: gisteren telt nog
      while (dagen.has(d.toISOString().slice(0, 10))) { n++; d.setDate(d.getDate() - 1); }
      return n;
    },
    xp() { return this.alles().xp; },
    level() {
      const xp = this.xp(); let i = 0;
      while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].xp) i++;
      const volgende = LEVELS[i + 1];
      return { nr: i + 1, titel: LEVELS[i].titel, xp, van: LEVELS[i].xp, tot: volgende ? volgende.xp : null, volgende: volgende ? volgende.titel : null };
    },
    /* Niveau dat in een categorie is vrijgespeeld: 1, 2 of 3.
       Een niveau gaat open na 3 goede antwoorden op het huidige niveau met minstens 60% goed. */
    niveau(cat) {
      const c = this.alles().cat[cat];
      if (!c) return 1;
      let n = 1;
      for (let lvl = 1; lvl < 3; lvl++) {
        const x = c[lvl] || { g: 0, f: 0 };
        const tot = x.g + x.f;
        if (x.g >= 3 && tot > 0 && x.g / tot >= 0.6) n = lvl + 1; else break;
      }
      return n;
    },
    beheersing(cat) {
      const c = this.alles().cat[cat];
      if (!c) return { gezien: 0, goed: 0 };
      let g = 0, f = 0;
      [1, 2, 3].forEach(l => { const x = c[l] || { g: 0, f: 0 }; g += x.g; f += x.f; });
      return { gezien: g + f, goed: g };
    },
    /* Vragen waar je moeite mee had: vaker fout dan goed, of de laatste keer fout */
    zwak() {
      const v = this.alles().vragen;
      return Object.keys(v).filter(id => v[id].f > 0 && v[id].f >= v[id].g);
    },
    gezien(id) { return !!this.alles().vragen[id]; },
    dagGespeeld(dag) { return !!lees('lg_dag_' + dag, false); },
    markeerDag(dag) { schrijf('lg_dag_' + dag, true); },
    reset() { schrijf(LS_STATS, {}); }
  };

  /* ── Scores: lokale implementatie ── */
  const Lokaal = {
    type: 'lokaal',
    async voeg(entry) {
      const alle = lees(LS_SCORES, []);
      alle.push(entry);
      schrijf(LS_SCORES, alle.slice(-500));
    },
    async top(modus, n, dag) {
      return sorteer(lees(LS_SCORES, []).filter(s => s.modus === modus && (!dag || s.dag === dag))).slice(0, n);
    },
    luister() { return () => {}; }
  };

  function sorteer(lijst) {
    return lijst.slice().sort((a, b) => (b.score - a.score) || (a.tijd - b.tijd) || (a.datum - b.datum));
  }

  /* ── Scores: Firestore (compat SDK, via CDN in game.html) ── */
  function maakFirestore(cfg) {
    const app = firebase.initializeApp(cfg);
    const db = firebase.firestore(app);
    const col = db.collection(cfg.collectie || 'learninggame_scores');
    return {
      type: 'firestore',
      async voeg(entry) {
        const doc = { naam: entry.naam, modus: entry.modus, score: entry.score, tijd: entry.tijd, max: entry.max, datum: firebase.firestore.FieldValue.serverTimestamp() };
        if (entry.dag) doc.dag = entry.dag;
        await col.add(doc);
      },
      async top(modus, n, dag) {
        // Alleen gelijkheidsfilters: dan is geen samengestelde index nodig. Sorteren doen we zelf.
        let q = col.where('modus', '==', modus);
        if (dag) q = q.where('dag', '==', dag);
        const snap = await q.limit(1000).get();
        const lijst = snap.docs.map(d => { const x = d.data(); return { ...x, datum: x.datum && x.datum.toMillis ? x.datum.toMillis() : 0 }; });
        return sorteer(lijst).slice(0, n);
      },
      luister(cb) {
        return col.orderBy('datum', 'desc').limit(1).onSnapshot(() => cb(), () => {});
      }
    };
  }

  let backend = Lokaal;
  if (window.LG_FIREBASE && window.LG_FIREBASE.projectId && typeof firebase !== 'undefined') {
    try { backend = maakFirestore(window.LG_FIREBASE); } catch (e) { console.warn('Firestore niet beschikbaar, lokaal verder', e); }
  }

  window.LG = { Naam, Stats, Scores: backend, LEVELS, vandaag };
})();
