/* Opslag van scores en voortgang voor de learning game.
   - Voortgang (welke vragen goed/fout, niveaus per categorie) staat altijd lokaal in de browser.
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

  /* ── Naam ── */
  const Naam = {
    get() { return (lees(LS_NAAM, '') || '').toString(); },
    set(n) { schrijf(LS_NAAM, n); }
  };

  /* ── Leerstatistiek per vraag (voor adaptieve selectie) ── */
  const Stats = {
    alles() { return lees(LS_STATS, { vragen: {}, cat: {} }); },
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
      schrijf(LS_STATS, s);
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
    reset() { schrijf(LS_STATS, { vragen: {}, cat: {} }); }
  };

  /* ── Scores: lokale implementatie ── */
  const Lokaal = {
    type: 'lokaal',
    async voeg(entry) {
      const alle = lees(LS_SCORES, []);
      alle.push(entry);
      schrijf(LS_SCORES, alle.slice(-500));
    },
    async top(modus, n) {
      return sorteer(lees(LS_SCORES, []).filter(s => s.modus === modus)).slice(0, n);
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
        await col.add({
          naam: entry.naam, modus: entry.modus, score: entry.score, tijd: entry.tijd,
          max: entry.max, datum: firebase.firestore.FieldValue.serverTimestamp()
        });
      },
      async top(modus, n) {
        // Alleen een gelijkheidsfilter: dan is geen samengestelde index nodig. Sorteren doen we zelf.
        const snap = await col.where('modus', '==', modus).limit(1000).get();
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

  window.LG = { Naam, Stats, Scores: backend };
})();
