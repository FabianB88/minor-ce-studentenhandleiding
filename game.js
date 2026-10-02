/* Learning game: kern (menu, vraagweergave, feedback, uitslag, scorebord, speler).
   Spelvormen registreren zich in window.LG_MODI (zie game-modi.js). */
(function () {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) n.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    kids.flat().forEach(c => { if (c === null || c === undefined || c === false) return; n.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return n;
  };
  const icoon = (naam) => { const i = document.createElement('i'); i.setAttribute('data-lucide', naam); return i; };
  const ikonen = () => { if (window.lucide) lucide.createIcons(); };
  const shuffle = (a, rnd) => { a = a.slice(); rnd = rnd || Math.random; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const wacht = (ms) => new Promise(r => setTimeout(r, ms));
  const LETTERS = 'ABCDEFGH';
  const CAT = Object.fromEntries(window.CATEGORIEEN.map(c => [c.key, c]));
  const AANTAL = 10;
  const NIVEAUS = ['kernbegrip', 'mechanisme', 'toepassing', 'verbanden', 'oordeel'];
  const bewegingArm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function meld(tekst) {
    const m = $('#melding'); m.textContent = tekst; m.classList.add('zichtbaar');
    clearTimeout(meld.t); meld.t = setTimeout(() => m.classList.remove('zichtbaar'), 2200);
  }
  function fmtTijd(ms) {
    const s = Math.round(ms / 1000); const m = Math.floor(s / 60);
    return m ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
  }
  function fmtGeld(n) { return '€ ' + n.toLocaleString('nl-NL'); }

  /* Seeded random (mulberry32) voor de dagelijkse uitdaging */
  function seedRnd(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /* ───────── Confetti (alleen bij een perfecte ronde) ───────── */
  function confetti() {
    if (bewegingArm()) return;
    const c = el('canvas', { class: 'lg-confetti', 'aria-hidden': 'true' }); document.body.append(c);
    const ctx = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight;
    const kleuren = ['#5C7A5A', '#B5916A', '#D0E3CF', '#7A8FA6', '#9C7650', '#EDF3EC'];
    const p = Array.from({ length: 110 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.4, w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, vy: 2 + Math.random() * 3, vx: -1.5 + Math.random() * 3, r: Math.random() * Math.PI, vr: -0.1 + Math.random() * 0.2, k: kleuren[Math.floor(Math.random() * kleuren.length)] }));
    const t0 = performance.now();
    (function teken(t) {
      ctx.clearRect(0, 0, c.width, c.height);
      p.forEach(q => { q.x += q.vx; q.y += q.vy; q.r += q.vr; ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.r); ctx.fillStyle = q.k; ctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h); ctx.restore(); });
      if (t - t0 < 2600) requestAnimationFrame(teken); else c.remove();
    })(t0);
  }

  /* ───────── Vraagselectie (adaptief) ───────── */
  function gewicht(q, stats) {
    const v = stats.vragen[q.id];
    if (!v) return 1.6;                                   // nooit gezien: graag
    let w = 1 + 1.5 * v.f - 0.45 * v.g;                   // fout gehad: vaker; goed gehad: minder
    const uur = (Date.now() - v.laatst) / 36e5;
    if (uur < 0.25) w *= 0.15; else if (uur < 6) w *= 0.5; // net gezien: even niet
    return Math.max(0.2, w);
  }
  /* Niveau kiezen: vooral het hoogste vrijgespeelde niveau, met wat herhaling van lagere niveaus */
  function kiesNiveau(cat) {
    const open = LG.Stats.niveau(cat);
    const r = Math.random();
    if (open === 1) return 1;
    if (r < 0.6) return open;
    if (r < 0.85) return open - 1;
    return Math.max(1, open - 2);
  }
  function kiesVraag(pool, ctx, niveau) {
    const stats = LG.Stats.alles();
    let kandidaten = pool.filter(q => !ctx.gebruikt.has(q.id));
    if (!kandidaten.length) kandidaten = pool.slice();
    if (niveau) {
      const opNiveau = kandidaten.filter(q => q.n === niveau);
      if (opNiveau.length) kandidaten = opNiveau;
      else { const dichtbij = kandidaten.filter(q => Math.abs(q.n - niveau) === 1); if (dichtbij.length) kandidaten = dichtbij; }
    }
    const gewichten = kandidaten.map(q => gewicht(q, stats));
    let r = Math.random() * gewichten.reduce((a, b) => a + b, 0);
    for (let i = 0; i < kandidaten.length; i++) { r -= gewichten[i]; if (r <= 0) return kandidaten[i]; }
    return kandidaten[kandidaten.length - 1];
  }
  function poolVoorFilter(filter) {
    if (!filter || filter.type === 'alles') return VRAGEN;
    if (filter.type === 'cursus') return VRAGEN.filter(q => CAT[q.cat].cursus === filter.waarde);
    return VRAGEN.filter(q => q.cat === filter.waarde);
  }
  /* Standaardkeuze: willekeurige categorie binnen het filter, niveau op basis van beheersing */
  function kiesStandaard(ctx, filter, niveauOverride, pool) {
    pool = pool || poolVoorFilter(filter);
    const cats = [...new Set(pool.map(q => q.cat))];
    let cat = cats[Math.floor(Math.random() * cats.length)];
    if (cats.length > 1 && ctx.vorigeCat === cat) cat = cats[(cats.indexOf(cat) + 1) % cats.length];
    const niveau = niveauOverride || kiesNiveau(cat);
    return kiesVraag(pool.filter(q => q.cat === cat), ctx, niveau);
  }

  /* ───────── Spelvormen uit de kern ───────── */
  const MODI = window.LG_MODI = window.LG_MODI || {};
  MODI.sprint = {
    key: 'sprint', naam: 'Sprint', icoon: 'zap', volgorde: 1, groep: 'oefenen', kleur: 'groen',
    omschrijving: 'Tien gemengde vragen op tijd. Kies alles, één e-learning of één onderwerp.',
    scoreLabel: 'goed van 10', max: AANTAL, heeftFilter: true, limiet: 30, reeks: true,
    kies(ctx) { return Promise.resolve(kiesStandaard(ctx, ctx.filter)); },
    klaar(ctx) { return ctx.antwoorden.length >= AANTAL; },
    score(ctx) { return ctx.antwoorden.filter(a => a.goed).length; }
  };
  MODI.schijf = {
    key: 'schijf', naam: 'De schijf', icoon: 'disc-3', volgorde: 2, groep: 'oefenen', kleur: 'zand',
    omschrijving: 'Draai het onderwerp. Hoe meer je beheerst, hoe dieper de vragen worden.',
    scoreLabel: 'goed van 10', max: AANTAL, limiet: 30, reeks: true,
    kies(ctx) { return draaiSchijf(ctx).then(cat => kiesVraag(VRAGEN.filter(q => q.cat === cat), ctx, kiesNiveau(cat))); },
    klaar(ctx) { return ctx.antwoorden.length >= AANTAL; },
    score(ctx) { return ctx.antwoorden.filter(a => a.goed).length; }
  };
  MODI.herhaling = {
    key: 'herhaling', naam: 'Herhaling', icoon: 'refresh-ccw', volgorde: 3, groep: 'oefenen', kleur: 'koel',
    omschrijving: 'Eerst de vragen die je fout had, dan wat je nog niet zag. Zo sluit je gaten.',
    scoreLabel: 'goed van 10', max: AANTAL, limiet: 45, reeks: true,
    startHulp: 'Werkt het best een dag ná een ronde: herhalen met tussenpozen blijft beter hangen dan direct nog eens.',
    init(ctx) {
      const zwak = new Set(LG.Stats.zwak());
      ctx.rij = shuffle(VRAGEN.filter(q => zwak.has(q.id)));
      const nieuw = shuffle(VRAGEN.filter(q => !LG.Stats.gezien(q.id)));
      ctx.rij = ctx.rij.concat(nieuw).slice(0, AANTAL);
      ctx.herhaalInfo = { fout: Math.min(zwak.size, AANTAL), nieuw: Math.max(0, Math.min(nieuw.length, AANTAL - zwak.size)) };
    },
    kies(ctx) { const q = ctx.rij.shift(); return Promise.resolve(q || kiesStandaard(ctx, { type: 'alles' })); },
    klaar(ctx) { return ctx.antwoorden.length >= AANTAL; },
    score(ctx) { return ctx.antwoorden.filter(a => a.goed).length; }
  };
  MODI.tentamen = {
    key: 'tentamen', naam: 'Tentamen', icoon: 'graduation-cap', volgorde: 4, groep: 'oefenen', kleur: 'donker',
    omschrijving: 'Twintig vragen zonder tussentijdse feedback, net als straks. Uitleg krijg je pas aan het eind.',
    scoreLabel: 'goed van 20', max: 20, limiet: 60, geenFeedback: true,
    startHulp: 'Twintig vragen uit beide e-learnings, een minuut per vraag. Aan het eind zie je je cijfer en alle uitleg.',
    kies(ctx) { return Promise.resolve(kiesStandaard(ctx, { type: 'alles' }, Math.min(5, 1 + Math.floor(ctx.antwoorden.length / 4)))); },
    klaar(ctx) { return ctx.antwoorden.length >= 20; },
    score(ctx) { return ctx.antwoorden.filter(a => a.goed).length; },
    uitslagTekst(ctx) { const g = ctx.antwoorden.filter(a => a.goed).length; const cijfer = Math.max(1, Math.round((1 + 9 * g / 20) * 10) / 10); return `Cijfer ${String(cijfer).replace('.', ',')}: ${g} van de 20 goed in ${fmtTijd(ctx.tijd)}.`; }
  };
  MODI.dag = {
    key: 'dag', naam: 'Dagelijkse 5', icoon: 'calendar-check', volgorde: 5, groep: 'oefenen', kleur: 'groen',
    omschrijving: 'Elke dag dezelfde vijf vragen voor iedereen. Eén poging telt, dus denk goed na.',
    scoreLabel: 'goed van 5', max: 5, limiet: 40, perDag: true,
    startHulp: 'Je eerste poging van de dag komt op het dagscorebord. Daarna kun je blijven oefenen, zonder score.',
    init(ctx) {
      const dag = LG.vandaag(); const rnd = seedRnd('lg-' + dag);
      const cats = shuffle(window.CATEGORIEEN.map(c => c.key), rnd).slice(0, 5);
      const niveaus = shuffle([1, 2, 3, 4, 5], rnd);
      ctx.rij = cats.map((cat, i) => { const pool = VRAGEN.filter(q => q.cat === cat && q.n === niveaus[i]); return pool[Math.floor(rnd() * pool.length)] || VRAGEN.find(q => q.cat === cat); });
      ctx.dag = dag; ctx.teltNiet = LG.Stats.dagGespeeld(dag);
      if (ctx.teltNiet) meld('Je hebt vandaag al meegedaan; deze ronde telt niet voor het scorebord.');
    },
    kies(ctx) { return Promise.resolve(ctx.rij.shift()); },
    klaar(ctx) { return ctx.antwoorden.length >= 5; },
    score(ctx) { return ctx.antwoorden.filter(a => a.goed).length; }
  };

  /* De schijf: SVG met 10 segmenten, kans iets groter voor onderwerpen die je minder beheerst */
  function draaiSchijf(ctx) {
    return new Promise(resolve => {
      const cats = window.CATEGORIEEN;
      const n = cats.length, hoek = 360 / n;
      const kleuren = ['#5C7A5A', '#7A9578', '#B5916A', '#D0E3CF', '#9C7650', '#EDF3EC', '#4A6349', '#F6F0E8', '#7A8FA6', '#E4DDD6'];
      const donker = (k) => ['#D0E3CF', '#EDF3EC', '#F6F0E8', '#E4DDD6'].includes(k);
      let paden = '';
      cats.forEach((c, i) => {
        const a0 = (i * hoek - 90) * Math.PI / 180, a1 = ((i + 1) * hoek - 90) * Math.PI / 180;
        const x0 = 150 + 145 * Math.cos(a0), y0 = 150 + 145 * Math.sin(a0), x1 = 150 + 145 * Math.cos(a1), y1 = 150 + 145 * Math.sin(a1);
        const am = (a0 + a1) / 2, tx = 150 + 95 * Math.cos(am), ty = 150 + 95 * Math.sin(am);
        const rot = (i * hoek + hoek / 2);
        paden += `<path d="M150 150 L${x0} ${y0} A145 145 0 0 1 ${x1} ${y1} Z" fill="${kleuren[i]}" stroke="#fff" stroke-width="2"/>`;
        paden += `<text x="${tx}" y="${ty}" transform="rotate(${rot} ${tx} ${ty})" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="600" fill="${donker(kleuren[i]) ? '#1C1713' : '#fff'}">${c.kort}</text>`;
      });
      const svg = `<svg viewBox="0 0 300 300" aria-hidden="true">${paden}<circle cx="150" cy="150" r="22" fill="#fff" stroke="#E4DDD6" stroke-width="2"/></svg>`;
      const uitslag = el('div', { class: 'lg-schijf-uitslag' });
      const schijf = el('div', { class: 'lg-schijf', html: svg });
      schijf.prepend(el('div', { class: 'lg-pijl' }));
      const knop = el('button', { class: 'lg-knop', type: 'button' }, icoon('rotate-cw'), ' Draai');
      const wrap = el('div', { class: 'lg-schijf-wrap' }, schijf, uitslag, knop);
      const veld = $('#speelveld'); veld.innerHTML = '';
      veld.append(spelbalk(ctx, null), stappen(ctx), wrap); ikonen();

      const gew = cats.map(c => { const b = LG.Stats.beheersing(c.key); return 1 + Math.max(0, 1 - (b.gezien ? b.goed / b.gezien : 0)) + (b.gezien < 4 ? 0.6 : 0); });
      let r = Math.random() * gew.reduce((a, b) => a + b, 0), idx = 0;
      for (let i = 0; i < n; i++) { r -= gew[i]; if (r <= 0) { idx = i; break; } }
      if (ctx.vorigeCat === cats[idx].key && n > 1) idx = (idx + 1 + Math.floor(Math.random() * (n - 1))) % n;

      const svgEl = schijf.querySelector('svg');
      const start = () => {
        knop.disabled = true;
        const doel = 360 * 4 + (360 - (idx * hoek + hoek / 2)) + (Math.random() * (hoek * 0.6) - hoek * 0.3);
        svgEl.style.transform = `rotate(${doel}deg)`;
        let af = false;
        const klaar = () => { if (af) return; af = true; uitslag.textContent = cats[idx].naam; uitslag.classList.add('pop'); setTimeout(() => resolve(cats[idx].key), 700); };
        if (bewegingArm()) klaar(); else { svgEl.addEventListener('transitionend', klaar, { once: true }); setTimeout(klaar, 3400); }
      };
      knop.addEventListener('click', start);
      knop.focus();
    });
  }

  /* ───────── Spelbalk, stappen en timer ───────── */
  function reeksNu(ctx) { let n = 0; for (let i = ctx.antwoorden.length - 1; i >= 0 && ctx.antwoorden[i].goed; i--) n++; return n; }
  function spelbalk(ctx, q) {
    const modus = MODI[ctx.modus];
    const balk = el('div', { class: 'lg-balk' });
    const nr = Math.min(ctx.antwoorden.length + 1, modus.max || AANTAL);
    const links = el('div', { class: 'lg-balk-links' }, el('strong', {}, modus.naam), ' · vraag ', el('strong', {}, String(nr)), modus.max && !modus.perDag ? ` van ${modus.max}` : (modus.perDag ? ' van 5' : ''));
    if (modus.reeks && reeksNu(ctx) >= 2) links.append(el('span', { class: 'lg-reeksbadge' }, icoon('flame'), `${reeksNu(ctx)} op rij`));
    balk.append(links);
    if (q) {
      const c = CAT[q.cat];
      const niv = el('span', { class: 'lg-niveau', title: `niveau ${q.n} van 5: ${NIVEAUS[q.n - 1]}` }, [1, 2, 3, 4, 5].map(l => el('i', { class: l <= q.n ? 'aan' : '' })));
      balk.append(el('span', { class: 'lg-cat ' + c.cursus }, c.naam, niv));
    }
    balk.append(el('button', { class: 'lg-knop-link', type: 'button', onclick: () => { if (confirm('Ronde afbreken? Je score wordt niet opgeslagen.')) { stopTimer(ctx); toonMenu(); } } }, 'Stoppen'));
    return balk;
  }
  function stappen(ctx) {
    const max = MODI[ctx.modus].max || AANTAL;
    const aantal = MODI[ctx.modus].stappen || Math.min(max, 20);
    return el('div', { class: 'lg-stappen', 'aria-hidden': 'true' }, Array.from({ length: aantal }, (_, i) => {
      const a = ctx.antwoorden[i];
      return el('i', { class: a ? (a.goed ? 'goed' : 'fout') : (i === ctx.antwoorden.length ? 'nu' : '') });
    }));
  }
  function startTimer(ctx, seconden, opTijdOp) {
    stopTimer(ctx);
    const balk = el('div', { class: 'lg-tijd', role: 'timer', 'aria-label': 'Resterende tijd' }, el('i', { style: 'width:100%' }));
    ctx.timer = { start: performance.now(), limiet: seconden * 1000, balk };
    const tick = () => {
      if (!ctx.timer) return;
      const verstreken = performance.now() - ctx.timer.start;
      const rest = Math.max(0, 1 - verstreken / ctx.timer.limiet);
      balk.firstChild.style.width = (rest * 100) + '%';
      balk.classList.toggle('krap', rest < 0.25);
      if (verstreken >= ctx.timer.limiet) { ctx.tijd += ctx.timer.limiet; ctx.timer = null; opTijdOp(); return; }
      ctx.timer.raf = requestAnimationFrame(tick);
    };
    ctx.timer.raf = requestAnimationFrame(tick);
    return balk;
  }
  function stopTimer(ctx) {
    if (ctx.timer) { cancelAnimationFrame(ctx.timer.raf); ctx.tijd += performance.now() - ctx.timer.start; ctx.timer = null; }
  }

  /* ───────── Vraag tonen ───────── */
  function toonVraag(ctx, q) {
    ctx.vraag = q; ctx.gebruikt.add(q.id); ctx.vorigeCat = q.cat;
    const modus = MODI[ctx.modus];
    const veld = $('#speelveld'); veld.innerHTML = ''; veld.dataset.modus = ctx.modus;
    const limiet = modus.limiet ? (q.type === 'mc' || q.type === 'multi' ? modus.limiet : modus.limiet * 2) : 0;
    veld.append(spelbalk(ctx, q));
    if (modus.renderExtra) veld.append(modus.renderExtra(ctx));
    veld.append(stappen(ctx));
    if (limiet) veld.append(startTimer(ctx, limiet, () => beantwoord(ctx, { goed: false, tijdOp: true })));

    const sub = q.type === 'multi' ? 'Meerdere antwoorden zijn juist.' : q.type === 'match' ? 'Kies bij elk begrip de juiste omschrijving.' : q.type === 'order' ? 'Zet de items in de juiste volgorde met de pijltjes.' : '';
    veld.append(el('p', { class: 'lg-vraag' }, q.v, sub ? el('small', {}, sub) : null));

    const acties = el('div', { class: 'lg-acties' });
    let controle;
    if (q.type === 'mc') controle = renderMc(ctx, q, veld, acties);
    else if (q.type === 'multi') controle = renderMulti(ctx, q, veld, acties);
    else if (q.type === 'match') controle = renderMatch(ctx, q, veld, acties);
    else controle = renderOrder(ctx, q, veld, acties);
    ctx.controle = controle;
    veld.append(acties);
    ikonen();
    const eerste = veld.querySelector('.lg-optie, select, .lg-order-knoppen button'); if (eerste) eerste.focus({ preventScroll: true });
  }

  /* Meerkeuze (één juist). Met modus.bevestig: eerst kiezen, dan "Definitief" en een spannend moment. */
  function renderMc(ctx, q, veld, acties) {
    const modus = MODI[ctx.modus];
    const volgorde = shuffle(q.o.map((_, i) => i));
    const lijst = el('div', { class: 'lg-opties', role: 'group' });
    let gekozen = null;
    const knoppen = volgorde.map((oi, k) => {
      const b = el('button', { class: 'lg-optie', type: 'button', 'data-oi': oi, 'aria-pressed': modus.bevestig ? 'false' : null },
        el('span', { class: 'lg-letter' }, LETTERS[k]), el('span', {}, q.o[oi]));
      b.addEventListener('click', () => {
        if (ctx.beantwoord || ctx.bezig) return;
        if (modus.bevestig) { gekozen = oi; knoppen.forEach(x => x.setAttribute('aria-pressed', String(Number(x.dataset.oi) === oi))); definitief.disabled = false; definitief.focus(); return; }
        afronden(oi);
      });
      return b;
    });
    const afronden = async (oi) => {
      const goed = oi === q.j;
      if (modus.bevestig) {
        ctx.bezig = true; stopTimer(ctx);
        knoppen.forEach(x => x.disabled = true);
        const b = knoppen.find(x => Number(x.dataset.oi) === oi); b.classList.add('spanning');
        definitief.disabled = true;
        await wacht(bewegingArm() ? 200 : 1500);
        b.classList.remove('spanning'); ctx.bezig = false;
      }
      if (!modus.geenFeedback) markeerMc(knoppen, q, oi); else knoppen.forEach(x => x.disabled = true);
      beantwoord(ctx, { goed, gekozen: oi });
    };
    lijst.append(...knoppen); veld.append(lijst);
    const definitief = el('button', { class: 'lg-knop', type: 'button', disabled: true }, icoon('lock'), ' Definitief');
    if (modus.bevestig) { definitief.addEventListener('click', () => { if (gekozen !== null) afronden(gekozen); }); acties.append(definitief); }
    return { toonJuist() { markeerMc(knoppen, q, null); definitief.remove(); } };
  }
  function markeerMc(knoppen, q, gekozen) {
    knoppen.forEach(b => {
      const oi = Number(b.dataset.oi); b.disabled = true;
      if (oi === q.j) b.classList.add('juist', 'pop'); else if (oi === gekozen) b.classList.add('fout', 'schud');
    });
  }

  /* Meerdere juist: selecteren, dan controleren */
  function renderMulti(ctx, q, veld, acties) {
    const volgorde = shuffle(q.o.map((_, i) => i));
    const gekozen = new Set();
    const lijst = el('div', { class: 'lg-opties', role: 'group' });
    const knoppen = volgorde.map((oi, k) => {
      const b = el('button', { class: 'lg-optie', type: 'button', 'aria-pressed': 'false', 'data-oi': oi }, el('span', { class: 'lg-letter' }, LETTERS[k]), el('span', {}, q.o[oi]));
      b.addEventListener('click', () => { if (ctx.beantwoord) return; gekozen.has(oi) ? gekozen.delete(oi) : gekozen.add(oi); b.setAttribute('aria-pressed', gekozen.has(oi)); check.disabled = gekozen.size === 0; });
      return b;
    });
    lijst.append(...knoppen); veld.append(lijst);
    const toon = () => knoppen.forEach(b => { const oi = Number(b.dataset.oi); b.disabled = true; if (q.j.includes(oi)) b.classList.add('juist'); else if (gekozen.has(oi)) b.classList.add('fout'); });
    const check = el('button', { class: 'lg-knop', type: 'button', disabled: true }, 'Controleer');
    check.addEventListener('click', () => { if (ctx.beantwoord) return; const goed = gekozen.size === q.j.length && q.j.every(i => gekozen.has(i)); if (!MODI[ctx.modus].geenFeedback) toon(); else knoppen.forEach(b => b.disabled = true); check.remove(); beantwoord(ctx, { goed }); });
    acties.append(check);
    return { toonJuist() { toon(); check.remove(); } };
  }

  /* Koppelen: per begrip een keuzelijst */
  function renderMatch(ctx, q, veld, acties) {
    const rechts = shuffle(q.paren.map(p => p[1]));
    const wrap = el('div', { class: 'lg-match' });
    const rijen = q.paren.map((p) => {
      const sel = el('select', { 'aria-label': `Omschrijving bij ${p[0]}` }, el('option', { value: '' }, 'Kies een omschrijving…'), ...rechts.map(r => el('option', { value: r }, r)));
      sel.addEventListener('change', () => { check.disabled = rijen.some(r => !r.sel.value); });
      const rij = el('div', { class: 'lg-match-rij' }, el('div', { class: 'lg-match-links' }, p[0]), sel);
      return { rij, sel, juist: p[1] };
    });
    wrap.append(...rijen.map(r => r.rij)); veld.append(wrap);
    const toon = () => rijen.forEach(r => { r.sel.disabled = true; const ok = r.sel.value === r.juist; r.rij.classList.add(ok ? 'juist' : 'fout'); if (!ok) r.rij.append(el('div', { class: 'lg-match-antwoord' }, 'Juist: ' + r.juist)); });
    const check = el('button', { class: 'lg-knop', type: 'button', disabled: true }, 'Controleer');
    check.addEventListener('click', () => { if (ctx.beantwoord) return; const goed = rijen.every(r => r.sel.value === r.juist); if (!MODI[ctx.modus].geenFeedback) toon(); else rijen.forEach(r => r.sel.disabled = true); check.remove(); beantwoord(ctx, { goed }); });
    acties.append(check);
    return { toonJuist() { toon(); check.remove(); } };
  }

  /* Volgorde: lijst met pijltjes */
  function renderOrder(ctx, q, veld, acties) {
    let huidig = shuffle(q.items);
    if (huidig.join() === q.items.join()) huidig = huidig.slice(1).concat(huidig[0]);
    const wrap = el('div', { class: 'lg-order' });
    const teken = () => {
      wrap.innerHTML = '';
      huidig.forEach((item, i) => {
        const omhoog = el('button', { class: 'lg-knop-icoon', type: 'button', 'aria-label': 'Omhoog', disabled: i === 0 }, icoon('chevron-up'));
        const omlaag = el('button', { class: 'lg-knop-icoon', type: 'button', 'aria-label': 'Omlaag', disabled: i === huidig.length - 1 }, icoon('chevron-down'));
        omhoog.addEventListener('click', () => { [huidig[i - 1], huidig[i]] = [huidig[i], huidig[i - 1]]; teken(); });
        omlaag.addEventListener('click', () => { [huidig[i + 1], huidig[i]] = [huidig[i], huidig[i + 1]]; teken(); });
        wrap.append(el('div', { class: 'lg-order-item' }, el('span', { class: 'lg-letter' }, String(i + 1)), el('span', {}, item), el('span', { class: 'lg-order-knoppen' }, omhoog, omlaag)));
      });
      ikonen();
    };
    teken(); veld.append(wrap);
    const toon = () => { wrap.querySelectorAll('.lg-order-item').forEach((n, i) => { n.querySelectorAll('button').forEach(b => b.disabled = true); const ok = huidig[i] === q.items[i]; n.classList.add(ok ? 'juist' : 'fout'); if (!ok) n.querySelector('.lg-letter').dataset.hoort = '→' + (q.items.indexOf(huidig[i]) + 1); }); };
    const check = el('button', { class: 'lg-knop', type: 'button' }, 'Controleer');
    check.addEventListener('click', () => { if (ctx.beantwoord) return; const goed = huidig.every((x, i) => x === q.items[i]); if (!MODI[ctx.modus].geenFeedback) toon(); else wrap.querySelectorAll('button').forEach(b => b.disabled = true); check.remove(); beantwoord(ctx, { goed }); });
    acties.append(check);
    return { toonJuist() { toon(); check.remove(); } };
  }

  /* ───────── Antwoord verwerken en feedback ───────── */
  function beantwoord(ctx, res) {
    if (ctx.beantwoord) return;
    ctx.beantwoord = true;
    stopTimer(ctx);
    const q = ctx.vraag;
    const modus = MODI[ctx.modus];
    if (res.tijdOp && ctx.controle && !modus.geenFeedback) ctx.controle.toonJuist();
    ctx.antwoorden.push({ id: q.id, goed: res.goed, tijdOp: !!res.tijdOp });
    LG.Stats.noteer(q, res.goed);
    const extra = modus.naAntwoord ? modus.naAntwoord(ctx, res.goed) : null;   // {einde, tekst, acties}
    const veld = $('#speelveld');
    veld.querySelectorAll('.lg-stappen').forEach(s => s.replaceWith(stappen(ctx)));
    veld.querySelectorAll('.lg-balk').forEach(s => s.replaceWith(spelbalk(ctx, q)));
    const klaar = (extra && extra.einde) || modus.klaar(ctx);

    if (modus.geenFeedback) {                       // tentamen: stil door naar de volgende
      const acties = veld.querySelector('.lg-acties') || veld.appendChild(el('div', { class: 'lg-acties' }));
      acties.innerHTML = '';
      acties.append(el('span', { class: 'lg-hulp', style: 'margin:0' }, res.tijdOp ? 'De tijd was om. ' : 'Antwoord genoteerd. ', 'Uitleg volgt aan het eind.'));
      setTimeout(() => klaar ? einde(ctx) : volgende(ctx), 700);
      return;
    }

    const fb = el('div', { class: 'lg-feedback' + (res.goed ? '' : ' fout') });
    const reeks = reeksNu(ctx);
    const kop = el('div', { class: 'lg-fb-kop' }, icoon(res.goed ? 'check-circle-2' : 'info'), res.tijdOp ? 'De tijd is om' : (res.goed ? (reeks >= 3 ? `Goed, ${reeks} op rij!` : 'Goed') : 'Niet helemaal'));
    fb.append(kop);
    const uitleg = el('div', { class: 'lg-verdieping', style: 'display:grid;gap:.4rem' }, el('p', {}, q.u), el('p', {}, el('strong', {}, 'Verdieping: '), q.d));
    if (res.goed) {
      const knop = el('button', { class: 'lg-knop-link', type: 'button' }, icoon('book-open'), ' Waarom klopt dit?');
      knop.addEventListener('click', () => { knop.replaceWith(uitleg); });
      fb.append(knop);
    } else {
      fb.append(uitleg);
    }
    if (extra && extra.tekst) fb.append(el('p', { class: 'lg-fb-extra' }, extra.tekst));
    veld.append(fb);

    const acties = veld.querySelector('.lg-acties') || veld.appendChild(el('div', { class: 'lg-acties' }));
    acties.innerHTML = '';
    if (extra && extra.acties) {
      extra.acties.forEach(a => { const b = el('button', { class: a.secundair ? 'lg-knop-rand' : 'lg-knop', type: 'button' }, a.icoon ? icoon(a.icoon) : null, ' ' + a.label); b.addEventListener('click', a.actie); acties.append(b); });
    } else {
      const verder = el('button', { class: 'lg-knop', type: 'button' }, klaar ? 'Naar de uitslag' : 'Volgende', icoon('arrow-right'));
      verder.addEventListener('click', () => klaar ? einde(ctx) : volgende(ctx));
      acties.append(verder);
    }
    ikonen();
    const eerste = acties.querySelector('button'); if (eerste) eerste.focus({ preventScroll: true });
    fb.scrollIntoView({ behavior: bewegingArm() ? 'auto' : 'smooth', block: 'nearest' });
  }

  function volgende(ctx) {
    ctx.beantwoord = false; ctx.bezig = false;
    const modus = MODI[ctx.modus];
    if (modus.speel) { modus.speel(ctx); return; }        // spelvorm met eigen weergave (Lingo, Flitskaarten)
    modus.kies(ctx).then(q => { if (q) toonVraag(ctx, q); else einde(ctx); });
  }

  /* ───────── Start en einde ───────── */
  function start(modusKey, filter) {
    const naam = LG.Naam.get().trim();
    if (!naam) { meld('Vul eerst je naam in (rechts).'); $('#naamInput') && $('#naamInput').focus(); return; }
    const ctx = { modus: modusKey, filter: filter || { type: 'alles' }, antwoorden: [], tijd: 0, gebruikt: new Set(), gestart: Date.now(), beantwoord: false };
    const modus = MODI[modusKey];
    if (modus.init) modus.init(ctx);
    volgende(ctx);
  }

  async function einde(ctx) {
    stopTimer(ctx);
    const modus = MODI[ctx.modus];
    const score = modus.score(ctx);
    const max = modus.max || AANTAL;
    const naam = LG.Naam.get().trim();
    const entry = { naam, modus: ctx.modus, score, tijd: Math.round(ctx.tijd / 1000), max, datum: Date.now(), lokaalId: Math.random().toString(36).slice(2) };
    if (ctx.dag) entry.dag = ctx.dag;
    LG.Stats.ronde();
    let opgeslagen = false;
    if (!modus.geenScore && !ctx.teltNiet) {
      try { await LG.Scores.voeg(entry); opgeslagen = true; } catch (e) { console.warn(e); meld('Score kon niet worden opgeslagen.'); }
      if (ctx.dag) LG.Stats.markeerDag(ctx.dag);
    }
    laatsteEntry = opgeslagen ? entry : null;
    toonUitslag(ctx, entry);
    if (!modus.geenScore) scoreTab = ctx.modus;
    renderScorebord(); renderVoortgang(); renderSpeler();
  }

  function toonUitslag(ctx, entry) {
    const modus = MODI[ctx.modus];
    const goed = ctx.antwoorden.filter(a => a.goed).length;
    const veld = $('#speelveld'); veld.innerHTML = '';
    const perfect = entry.score >= entry.max && ctx.antwoorden.length > 0;
    const sterk = goed >= ctx.antwoorden.length * 0.7;
    if (perfect) confetti();
    const kop = el('div', { class: 'lg-uitslag-kop' },
      el('div', { class: 'lg-uitslag-icoon' + (perfect ? ' top' : '') }, icoon(perfect ? 'trophy' : sterk ? 'thumbs-up' : 'book-open')),
      el('div', {}, el('h2', {}, modus.uitslagKop ? modus.uitslagKop(ctx) : (perfect ? 'Alles goed!' : sterk ? 'Sterk gespeeld' : 'Goed geoefend')),
        el('p', { class: 'lg-sub' }, modus.uitslagTekst ? modus.uitslagTekst(ctx) : `${goed} van de ${ctx.antwoorden.length} vragen goed in ${fmtTijd(ctx.tijd)}.`)));
    const cijfers = el('div', { class: 'lg-cijfers' },
      el('div', { class: 'lg-cijfer' }, el('strong', {}, String(entry.score)), el('span', {}, modus.scoreLabel)),
      el('div', { class: 'lg-cijfer' }, el('strong', {}, fmtTijd(ctx.tijd)), el('span', {}, 'antwoordtijd')),
      el('div', { class: 'lg-cijfer' }, el('strong', {}, `${goed}/${ctx.antwoorden.length}`), el('span', {}, 'goed')));

    const recap = el('ul', { class: 'lg-recap' });
    ctx.antwoorden.forEach(a => {
      const q = a.q || VRAGEN.find(x => x.id === a.id); if (!q) return;
      const li = el('li', { class: a.goed ? '' : 'fout' });
      const juist = q.type === 'mc' ? el('p', {}, el('strong', {}, 'Juiste antwoord: '), q.o[q.j]) : q.type === 'multi' ? el('p', {}, el('strong', {}, 'Juist: '), q.j.map(i => q.o[i]).join(' · ')) : q.type === 'order' ? el('p', {}, el('strong', {}, 'Volgorde: '), q.items.join(' → ')) : q.type === 'match' ? el('p', {}, el('strong', {}, 'Paren: '), q.paren.map(p => `${p[0]} = ${p[1]}`).join(' · ')) : null;
      const uitleg = el('div', { class: 'lg-recap-uitleg', hidden: true }, (!a.goed && juist) ? juist : null, el('p', {}, el('strong', {}, 'Uitleg: '), q.u), el('p', {}, el('strong', {}, 'Verdieping: '), q.d));
      const knop = el('button', { type: 'button', 'aria-expanded': 'false' }, el('span', { class: 'lg-stip' }), el('span', {}, q.v), el('span', { class: 'lg-recap-cat' }, (CAT[q.cat] || {}).kort || ''));
      knop.addEventListener('click', () => { const open = uitleg.hidden; uitleg.hidden = !open; knop.setAttribute('aria-expanded', open); });
      li.append(knop, uitleg); recap.append(li);
    });

    const opnieuw = el('button', { class: 'lg-knop', type: 'button' }, icoon('rotate-ccw'), ' Nog een ronde');
    opnieuw.addEventListener('click', () => start(ctx.modus, ctx.filter));
    const menu = el('button', { class: 'lg-knop-rand', type: 'button' }, 'Andere spelvorm');
    menu.addEventListener('click', toonMenu);
    const fouten = ctx.antwoorden.filter(a => !a.goed).length;
    const extraKnop = fouten ? el('button', { class: 'lg-knop-rand', type: 'button' }, icoon('refresh-ccw'), ' Herhaal je fouten') : null;
    if (extraKnop) extraKnop.addEventListener('click', () => start('herhaling'));
    veld.append(el('div', { class: 'lg-uitslag' }, kop, cijfers,
      el('p', { class: 'lg-hulp', style: 'margin:0' }, modus.geenFeedback ? 'Hieronder staat per vraag het juiste antwoord met de uitleg. Lees vooral de vragen die je fout had.' : fouten ? `Klik op een vraag om de uitleg terug te lezen. De ${fouten === 1 ? 'vraag die je fout had komt' : fouten + ' vragen die je fout had komen'} in volgende rondes vaker terug.` : 'Klik op een vraag om de verdieping terug te lezen.'),
      recap, el('div', { class: 'lg-acties' }, opnieuw, extraKnop, menu)));
    if (modus.geenFeedback) recap.querySelectorAll('li.fout button').forEach(b => b.click());
    ikonen();
  }

  /* ───────── Menu ───────── */
  let gekozenModus = 'sprint';
  let filter = { type: 'alles' };
  function toonMenu() {
    const veld = $('#speelveld'); veld.innerHTML = ''; veld.dataset.modus = '';
    const uitlegKnop = el('button', { class: 'lg-knop-rand', type: 'button' }, icoon('circle-help'), ' Uitleg');
    uitlegKnop.addEventListener('click', () => $('#uitlegDialog').showModal());
    veld.append(el('div', { class: 'lg-menu-kop' }, el('div', {}, el('h2', {}, 'Kies hoe je wilt oefenen'), el('p', {}, 'Dezelfde stof, negen manieren. Elke ronde is anders.')), uitlegKnop));

    const modi = Object.values(MODI).sort((a, b) => a.volgorde - b.volgorde);
    [['oefenen', 'Oefenen'], ['show', 'Spelshows']].forEach(([groep, titel]) => {
      veld.append(el('h3', { class: 'lg-groep' }, titel));
      const grid = el('div', { class: 'lg-modi', role: 'group', 'aria-label': titel });
      modi.filter(m => (m.groep || 'show') === groep).forEach(m => {
        const b = el('button', { class: 'lg-modus kleur-' + (m.kleur || 'groen'), type: 'button', 'aria-pressed': String(m.key === gekozenModus) },
          el('span', { class: 'lg-modus-icoon' }, icoon(m.icoon)), el('strong', {}, m.naam), el('span', {}, m.omschrijving));
        b.addEventListener('click', () => { gekozenModus = m.key; toonMenu(); });
        grid.append(b);
      });
      veld.append(grid);
    });

    const modus = MODI[gekozenModus];
    if (modus.heeftFilter) {
      const chips = el('div', { class: 'lg-chips' });
      const chip = (label, f, klasse) => { const c = el('button', { class: 'lg-chip ' + (klasse || ''), type: 'button', 'aria-pressed': String(filter.type === f.type && filter.waarde === f.waarde) }, label); c.addEventListener('click', () => { filter = f; toonMenu(); }); return c; };
      chips.append(chip('Alles door elkaar', { type: 'alles' }));
      chips.append(chip('Duurzaamheid & systeemdenken', { type: 'cursus', waarde: 'dw' }, 'dw'));
      chips.append(chip('Business Ethics', { type: 'cursus', waarde: 'be' }, 'be'));
      const chips2 = el('div', { class: 'lg-chips' });
      window.CATEGORIEEN.forEach(c => chips2.append(chip(c.naam, { type: 'cat', waarde: c.key }, c.cursus)));
      veld.append(el('div', { class: 'lg-reeks' }, el('label', {}, 'Welke reeks?'), chips, el('label', {}, 'Of één onderwerp'), chips2));
    }
    const startKnop = el('button', { class: 'lg-knop lg-knop-groot', type: 'button' }, icoon('play'), ` Start ${modus.naam}`);
    startKnop.addEventListener('click', () => start(gekozenModus, modus.heeftFilter ? filter : { type: 'alles' }));
    let hulp = modus.startHulp || 'Tien vragen. De klok loopt alleen terwijl je antwoordt.';
    if (modus.key === 'herhaling') { const z = LG.Stats.zwak().length; hulp = z ? `Je hebt ${z} ${z === 1 ? 'vraag' : 'vragen'} waar je moeite mee had. ` + hulp : 'Nog geen fouten om te herhalen: je krijgt vragen die je nog niet zag. ' + hulp; }
    if (modus.key === 'dag' && LG.Stats.dagGespeeld(LG.vandaag())) hulp = 'Je hebt vandaag al meegedaan. Je kunt wel opnieuw oefenen, maar die score telt niet.';
    veld.append(el('div', { class: 'lg-start' }, startKnop, el('span', { class: 'lg-hulp', style: 'margin:0' }, hulp)));
    ikonen();
  }

  /* ───────── Spelerkaart: naam, level, XP en dagstreak ───────── */
  function renderSpeler() {
    const kaart = $('#spelerkaart'); kaart.innerHTML = '';
    const naam = LG.Naam.get();
    if (!naam) {
      const input = el('input', { id: 'naamInput', type: 'text', maxlength: '24', autocomplete: 'nickname', placeholder: 'Bijv. Sam of team Groen', required: true });
      const form = el('form', {}, el('label', { for: 'naamInput' }, 'Hoe heet je op het scorebord?'), input, el('button', { class: 'lg-knop', type: 'submit' }, 'Opslaan'));
      form.addEventListener('submit', e => { e.preventDefault(); const n = input.value.trim().slice(0, 24); if (!n) return; LG.Naam.set(n); renderSpeler(); renderScorebord(); meld(`Welkom, ${n}!`); });
      kaart.append(form);
    } else {
      const lvl = LG.Stats.level(), streak = LG.Stats.streak();
      const wissel = el('button', { class: 'lg-knop-link', type: 'button' }, 'Wijzig');
      wissel.addEventListener('click', () => { LG.Naam.set(''); renderSpeler(); $('#naamInput').focus(); });
      const pct = lvl.tot ? Math.round(100 * (lvl.xp - lvl.van) / (lvl.tot - lvl.van)) : 100;
      kaart.append(
        el('div', { class: 'lg-wie' }, el('div', {}, el('strong', {}, naam), el('small', {}, `Level ${lvl.nr} · ${lvl.titel}`)), wissel),
        el('div', { class: 'lg-xp', title: `${lvl.xp} XP` }, el('i', { style: `width:${pct}%` })),
        el('div', { class: 'lg-speler-meta' },
          el('span', {}, icoon('sparkles'), `${lvl.xp} XP`, lvl.tot ? ` · nog ${lvl.tot - lvl.xp} tot ${lvl.volgende}` : ' · hoogste level'),
          el('span', { class: streak ? 'lg-streak aan' : 'lg-streak' }, icoon('flame'), streak ? `${streak} ${streak === 1 ? 'dag' : 'dagen'} op rij` : 'nog geen reeks')));
    }
    ikonen();
  }

  /* ───────── Scorebord ───────── */
  let scoreTab = 'sprint', laatsteEntry = null;
  async function renderScorebord() {
    const keuze = $('#scoreKeuze');
    const modiMetScore = Object.values(MODI).filter(m => !m.geenScore).sort((a, b) => a.volgorde - b.volgorde);
    if (!keuze.options.length || keuze.options.length !== modiMetScore.length) {
      keuze.innerHTML = '';
      modiMetScore.forEach(m => keuze.append(el('option', { value: m.key }, m.naam)));
      keuze.addEventListener('change', () => { scoreTab = keuze.value; renderScorebord(); });
    }
    keuze.value = scoreTab;
    const modus = MODI[scoreTab];
    const run = renderScorebord.run = (renderScorebord.run || 0) + 1;
    let lijst = [];
    try { lijst = await LG.Scores.top(scoreTab, 10, modus.perDag ? LG.vandaag() : null); } catch (e) { console.warn(e); }
    if (run !== renderScorebord.run) return;
    const bord = $('#scorebord'); bord.innerHTML = '';
    if (modus.perDag) bord.append(el('p', { class: 'lg-hulp' }, `Vandaag, ${new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}. Morgen vijf nieuwe vragen.`));
    if (!lijst.length) {
      bord.append(el('div', { class: 'lg-leeg' }, icoon('sparkles'), `Nog geen scores voor ${modus.naam}. Speel de eerste ronde!`));
    } else {
      const naam = LG.Naam.get();
      const ul = el('ul', { class: 'lg-score-lijst' });
      lijst.forEach((s, i) => {
        const jij = s.naam === naam && (laatsteEntry ? (s.lokaalId ? s.lokaalId === laatsteEntry.lokaalId : (s.score === laatsteEntry.score && s.tijd === laatsteEntry.tijd)) : false);
        ul.append(el('li', { class: 'lg-score' + (jij ? ' jij' : '') },
          el('span', { class: 'lg-plek' + (i === 0 ? ' p1' : i === 1 ? ' p2' : i === 2 ? ' p3' : '') }, String(i + 1)),
          el('div', { class: 'lg-wie2' }, el('span', { class: 'lg-naam' }, s.naam), el('span', { class: 'lg-meta' }, `${fmtTijd(s.tijd * 1000)} · ${new Date(s.datum || Date.now()).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}`)),
          el('span', { class: 'lg-punten' }, String(s.score), el('small', {}, s.max ? `/${s.max}` : ''))));
      });
      bord.append(ul);
    }
    bord.append(el('p', { class: 'lg-score-noot' }, icoon(LG.Scores.type === 'firestore' ? 'globe' : 'laptop'),
      LG.Scores.type === 'firestore' ? 'Gedeeld scorebord: iedereen die speelt staat erop. Hoogste score wint; bij gelijke stand de snelste antwoordtijd.' : 'Dit scorebord staat in deze browser. Hoogste score wint; bij gelijke stand de snelste antwoordtijd.'));
    ikonen();
  }

  /* ───────── Voortgang per onderwerp ───────── */
  function renderVoortgang() {
    const wrap = $('#voortgang'); wrap.innerHTML = '';
    const lijst = el('div', { class: 'lg-vg' });
    window.CATEGORIEEN.forEach(c => {
      const niv = LG.Stats.niveau(c.key), b = LG.Stats.beheersing(c.key);
      const pct = b.gezien ? Math.round(100 * b.goed / b.gezien) : 0;
      const titel = !b.gezien ? 'nog niet geoefend' : `${b.goed} van ${b.gezien} goed` + (b.gezien >= 6 ? ` (${pct}%)` : '') + ` · niveau ${niv} van 5 vrijgespeeld (${NIVEAUS[niv - 1]})`;
      lijst.append(el('div', { class: 'lg-vg-rij', title: titel },
        el('span', {}, c.naam), el('span', { class: 'lg-vg-pct' }, b.gezien ? `${b.goed}/${b.gezien}` : '–'), el('span', { class: 'lg-niveau', 'aria-label': `niveau ${niv} van 5` }, [1, 2, 3, 4, 5].map(l => el('i', { class: l <= niv ? 'aan' : '' })))));
    });
    wrap.append(lijst);
  }

  /* ───────── Init ───────── */
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('dialog [data-sluit]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
    renderSpeler(); renderScorebord(); renderVoortgang(); toonMenu();
    if (LG.Scores.luister) LG.Scores.luister(() => renderScorebord());
  });

  window.LGame = { NIVEAUS, start, toonMenu, toonVraag, einde, volgende, spelbalk, stappen, startTimer, stopTimer, kiesVraag, kiesStandaard, kiesNiveau, poolVoorFilter, el, icoon, ikonen, shuffle, meld, fmtTijd, fmtGeld, wacht, beantwoord, confetti, renderSpeler, CAT, AANTAL };
})();
