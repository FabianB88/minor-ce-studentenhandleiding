/* Learning game: kern (menu, vraagweergave, feedback, uitslag, scorebord).
   Spelvormen registreren zich in window.LG_MODI (zie game-modi.js). */
(function () {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    }
    kids.flat().forEach(c => { if (c === null || c === undefined || c === false) return; n.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return n;
  };
  const icoon = (naam) => { const i = document.createElement('i'); i.setAttribute('data-lucide', naam); return i; };
  const ikonen = () => { if (window.lucide) lucide.createIcons(); };
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const LETTERS = 'ABCDEFGH';
  const CAT = Object.fromEntries(window.CATEGORIEEN.map(c => [c.key, c]));
  const AANTAL = 10;

  function meld(tekst) {
    const m = $('#melding'); m.textContent = tekst; m.classList.add('zichtbaar');
    clearTimeout(meld.t); meld.t = setTimeout(() => m.classList.remove('zichtbaar'), 2200);
  }
  function fmtTijd(ms) {
    const s = Math.round(ms / 1000); const m = Math.floor(s / 60);
    return m ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
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
  function kiesNiveau(cat) {
    const open = LG.Stats.niveau(cat);
    const r = Math.random();
    if (open === 1) return 1;
    if (open === 2) return r < 0.7 ? 2 : 1;
    return r < 0.6 ? 3 : (r < 0.85 ? 2 : 1);
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
  /* Standaardkeuze voor Sprint: willekeurige categorie binnen het filter, niveau op basis van beheersing */
  function kiesStandaard(ctx, filter, niveauOverride) {
    const pool = poolVoorFilter(filter);
    const cats = [...new Set(pool.map(q => q.cat))];
    // categorie afwisselen: niet twee keer achter elkaar dezelfde als het kan
    let cat = cats[Math.floor(Math.random() * cats.length)];
    if (cats.length > 1 && ctx.vorigeCat === cat) cat = cats[(cats.indexOf(cat) + 1) % cats.length];
    const niveau = niveauOverride || kiesNiveau(cat);
    return kiesVraag(pool.filter(q => q.cat === cat), ctx, niveau);
  }

  /* ───────── Spelvormen ───────── */
  const MODI = window.LG_MODI = window.LG_MODI || {};
  MODI.sprint = {
    key: 'sprint', naam: 'Sprint', icoon: 'zap', volgorde: 1,
    omschrijving: 'Tien gemengde vragen op tijd. Kies alles, één e-learning of één onderwerp.',
    scoreLabel: 'goed van 10', max: AANTAL, heeftFilter: true, limiet: 30,
    kies(ctx) { return Promise.resolve(kiesStandaard(ctx, ctx.filter)); },
    klaar(ctx) { return ctx.antwoorden.length >= AANTAL; },
    score(ctx) { return ctx.antwoorden.filter(a => a.goed).length; }
  };
  MODI.schijf = {
    key: 'schijf', naam: 'De schijf', icoon: 'disc-3', volgorde: 2,
    omschrijving: 'Draai het onderwerp. Hoe meer je beheerst, hoe dieper de vragen worden.',
    scoreLabel: 'goed van 10', max: AANTAL, limiet: 30,
    kies(ctx) { return draaiSchijf(ctx).then(cat => kiesVraag(VRAGEN.filter(q => q.cat === cat), ctx, kiesNiveau(cat))); },
    klaar(ctx) { return ctx.antwoorden.length >= AANTAL; },
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
      veld.append(spelbalk(ctx, null), wrap); ikonen();

      // gewogen keuze: minder beheersing = iets meer kans
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
        const klaar = () => { if (af) return; af = true; uitslag.textContent = cats[idx].naam; setTimeout(() => resolve(cats[idx].key), 700); };
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) klaar();
        else { svgEl.addEventListener('transitionend', klaar, { once: true }); setTimeout(klaar, 3400); }   // vangnet als de overgang niet afvuurt
      };
      knop.addEventListener('click', start);
      knop.focus();
    });
  }

  /* ───────── Spelbalk en timer ───────── */
  function spelbalk(ctx, q) {
    const modus = MODI[ctx.modus];
    const balk = el('div', { class: 'lg-balk' });
    const links = el('div', {}, el('strong', {}, modus.naam), ' · vraag ', el('strong', {}, String(Math.min(ctx.antwoorden.length + 1, modus.max || AANTAL))), modus.max ? ` van ${modus.max}` : '');
    balk.append(links);
    if (q) {
      const c = CAT[q.cat];
      const niv = el('span', { class: 'lg-niveau', title: `niveau ${q.n} van 3` }, [1, 2, 3].map(l => el('i', { class: l <= q.n ? 'aan' : '' })));
      balk.append(el('span', { class: 'lg-cat ' + c.cursus }, c.naam, niv));
    }
    balk.append(el('button', { class: 'lg-knop-link', type: 'button', onclick: () => { if (confirm('Ronde afbreken? Je score wordt niet opgeslagen.')) { stopTimer(ctx); toonMenu(); } } }, 'Stoppen'));
    return balk;
  }
  function stappen(ctx) {
    const max = MODI[ctx.modus].max || AANTAL;
    return el('div', { class: 'lg-stappen', 'aria-hidden': 'true' }, Array.from({ length: max }, (_, i) => {
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
    const veld = $('#speelveld'); veld.innerHTML = '';
    const limiet = modus.limiet ? (q.type === 'mc' || q.type === 'multi' ? modus.limiet : modus.limiet * 2) : 0;
    veld.append(spelbalk(ctx, q));
    if (modus.renderExtra) veld.append(modus.renderExtra(ctx));
    veld.append(stappen(ctx));
    if (limiet) veld.append(startTimer(ctx, limiet, () => beantwoord(ctx, { goed: false, tijdOp: true })));
    if (ctx.hint) { veld.append(el('p', { class: 'lg-hint' }, ctx.hint)); }

    const sub = q.type === 'multi' ? 'Meerdere antwoorden zijn juist.' : q.type === 'match' ? 'Kies bij elk begrip de juiste omschrijving.' : q.type === 'order' ? 'Zet de items in de juiste volgorde met de pijltjes.' : '';
    veld.append(el('p', { class: 'lg-vraag' }, q.v, sub ? el('small', {}, sub) : null));

    const acties = el('div', { class: 'lg-acties' });
    let controle;                                   // functie die het antwoord ophaalt en toont
    if (q.type === 'mc') controle = renderMc(ctx, q, veld, acties);
    else if (q.type === 'multi') controle = renderMulti(ctx, q, veld, acties);
    else if (q.type === 'match') controle = renderMatch(ctx, q, veld, acties);
    else controle = renderOrder(ctx, q, veld, acties);
    ctx.controle = controle;
    veld.append(acties);
    ikonen();
    const eerste = veld.querySelector('.lg-optie, select, .lg-order-knoppen button'); if (eerste) eerste.focus({ preventScroll: true });
  }

  /* Meerkeuze (één juist): klik = antwoord */
  function renderMc(ctx, q, veld, acties) {
    const volgorde = shuffle(q.o.map((_, i) => i));
    if (ctx.weg) volgorde.sort((a, b) => (ctx.weg.includes(a) ? 1 : 0) - (ctx.weg.includes(b) ? 1 : 0));
    const lijst = el('div', { class: 'lg-opties', role: 'group' });
    const knoppen = volgorde.map((oi, k) => {
      const b = el('button', { class: 'lg-optie' + (ctx.weg && ctx.weg.includes(oi) ? ' weg' : ''), type: 'button', 'data-oi': oi, disabled: ctx.weg && ctx.weg.includes(oi) ? '' : null },
        el('span', { class: 'lg-letter' }, LETTERS[k]), el('span', {}, q.o[oi]));
      b.addEventListener('click', () => { if (ctx.beantwoord) return; const goed = oi === q.j; markeerMc(knoppen, q, oi); beantwoord(ctx, { goed, gekozen: oi }); });
      return b;
    });
    lijst.append(...knoppen); veld.append(lijst);
    return { toonJuist() { markeerMc(knoppen, q, null); } };
  }
  function markeerMc(knoppen, q, gekozen) {
    knoppen.forEach(b => {
      const oi = Number(b.dataset.oi); b.disabled = true;
      if (oi === q.j) b.classList.add('juist'); else if (oi === gekozen) b.classList.add('fout');
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
    const check = el('button', { class: 'lg-knop', type: 'button', disabled: '' }, 'Controleer');
    check.addEventListener('click', () => { if (ctx.beantwoord) return; const goed = gekozen.size === q.j.length && q.j.every(i => gekozen.has(i)); toon(); check.remove(); beantwoord(ctx, { goed }); });
    acties.append(check);
    return { toonJuist() { toon(); check.remove(); } };
  }

  /* Koppelen: per begrip een keuzelijst */
  function renderMatch(ctx, q, veld, acties) {
    const rechts = shuffle(q.paren.map(p => p[1]));
    const wrap = el('div', { class: 'lg-match' });
    const rijen = q.paren.map((p, i) => {
      const sel = el('select', { 'aria-label': `Omschrijving bij ${p[0]}` }, el('option', { value: '' }, 'Kies een omschrijving…'), ...rechts.map(r => el('option', { value: r }, r)));
      sel.addEventListener('change', () => { check.disabled = rijen.some(r => !r.sel.value); });
      const rij = el('div', { class: 'lg-match-rij' }, el('div', { class: 'lg-match-links' }, p[0]), sel);
      return { rij, sel, juist: p[1] };
    });
    wrap.append(...rijen.map(r => r.rij)); veld.append(wrap);
    const toon = () => rijen.forEach(r => { r.sel.disabled = true; const ok = r.sel.value === r.juist; r.rij.classList.add(ok ? 'juist' : 'fout'); if (!ok) r.rij.append(el('div', { class: 'lg-match-antwoord' }, 'Juist: ' + r.juist)); });
    const check = el('button', { class: 'lg-knop', type: 'button', disabled: '' }, 'Controleer');
    check.addEventListener('click', () => { if (ctx.beantwoord) return; const goed = rijen.every(r => r.sel.value === r.juist); toon(); check.remove(); beantwoord(ctx, { goed }); });
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
        const omhoog = el('button', { class: 'lg-knop-icoon', type: 'button', 'aria-label': 'Omhoog', disabled: i === 0 ? '' : null }, icoon('chevron-up'));
        const omlaag = el('button', { class: 'lg-knop-icoon', type: 'button', 'aria-label': 'Omlaag', disabled: i === huidig.length - 1 ? '' : null }, icoon('chevron-down'));
        omhoog.addEventListener('click', () => { [huidig[i - 1], huidig[i]] = [huidig[i], huidig[i - 1]]; teken(); });
        omlaag.addEventListener('click', () => { [huidig[i + 1], huidig[i]] = [huidig[i], huidig[i + 1]]; teken(); });
        wrap.append(el('div', { class: 'lg-order-item' }, el('span', { class: 'lg-letter' }, String(i + 1)), el('span', {}, item), el('span', { class: 'lg-order-knoppen' }, omhoog, omlaag)));
      });
      ikonen();
    };
    teken(); veld.append(wrap);
    const toon = () => { wrap.querySelectorAll('.lg-order-item').forEach((n, i) => { n.querySelectorAll('button').forEach(b => b.disabled = true); const ok = huidig[i] === q.items[i]; n.classList.add(ok ? 'juist' : 'fout'); if (!ok) n.querySelector('.lg-letter').dataset.hoort = '→' + (q.items.indexOf(huidig[i]) + 1); }); };
    const check = el('button', { class: 'lg-knop', type: 'button' }, 'Controleer');
    check.addEventListener('click', () => { if (ctx.beantwoord) return; const goed = huidig.every((x, i) => x === q.items[i]); toon(); check.remove(); beantwoord(ctx, { goed }); });
    acties.append(check);
    return { toonJuist() { toon(); check.remove(); } };
  }

  /* ───────── Antwoord verwerken en feedback ───────── */
  function beantwoord(ctx, res) {
    if (ctx.beantwoord) return;
    ctx.beantwoord = true;
    stopTimer(ctx);
    const q = ctx.vraag;
    if (res.tijdOp && ctx.controle) ctx.controle.toonJuist();
    ctx.antwoorden.push({ id: q.id, goed: res.goed, tijdOp: !!res.tijdOp });
    LG.Stats.noteer(q, res.goed);
    const modus = MODI[ctx.modus];
    const extra = modus.naAntwoord ? modus.naAntwoord(ctx, res.goed) : null;   // kan {einde:true, tekst} teruggeven

    const veld = $('#speelveld');
    const fb = el('div', { class: 'lg-feedback' + (res.goed ? '' : ' fout') });
    const kop = el('div', { class: 'lg-fb-kop' }, icoon(res.goed ? 'check-circle-2' : 'info'), res.tijdOp ? 'De tijd is om' : (res.goed ? 'Goed' : 'Niet helemaal'));
    fb.append(kop);
    const uitleg = el('div', { class: 'lg-verdieping', style: 'display:grid;gap:.4rem' }, el('p', {}, q.u), el('p', {}, el('strong', {}, 'Verdieping: '), q.d));
    if (res.goed) {
      const knop = el('button', { class: 'lg-knop-link', type: 'button' }, icoon('book-open'), ' Waarom klopt dit?');
      knop.addEventListener('click', () => { knop.replaceWith(uitleg); });
      fb.append(knop);
    } else {
      fb.append(uitleg);
    }
    if (extra && extra.tekst) fb.append(el('p', { style: 'font-weight:600' }, extra.tekst));
    veld.append(fb);
    veld.querySelectorAll('.lg-stappen').forEach(s => s.replaceWith(stappen(ctx)));

    const klaar = (extra && extra.einde) || modus.klaar(ctx);
    const verder = el('button', { class: 'lg-knop', type: 'button' }, klaar ? 'Naar de uitslag' : 'Volgende', icoon('arrow-right'));
    verder.addEventListener('click', () => klaar ? einde(ctx) : volgende(ctx));
    const acties = veld.querySelector('.lg-acties') || veld.appendChild(el('div', { class: 'lg-acties' }));
    acties.append(verder);
    ikonen();
    verder.focus({ preventScroll: true });
    fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function volgende(ctx) {
    ctx.beantwoord = false; ctx.hint = null; ctx.weg = null;
    const modus = MODI[ctx.modus];
    if (modus.speel) { modus.speel(ctx); return; }        // spelvorm met eigen weergave (Lingo)
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
    try { await LG.Scores.voeg(entry); } catch (e) { console.warn(e); meld('Score kon niet worden opgeslagen.'); }
    laatsteEntry = entry;
    toonUitslag(ctx, entry);
    scoreTab = ctx.modus; renderScorebord(); renderVoortgang();
  }

  function toonUitslag(ctx, entry) {
    const modus = MODI[ctx.modus];
    const goed = ctx.antwoorden.filter(a => a.goed).length;
    const veld = $('#speelveld'); veld.innerHTML = '';
    const perfect = entry.score >= entry.max;
    const kop = el('div', { class: 'lg-uitslag-kop' },
      el('div', { class: 'lg-uitslag-icoon' }, icoon(perfect ? 'trophy' : goed >= ctx.antwoorden.length * 0.7 ? 'thumbs-up' : 'book-open')),
      el('div', {}, el('h2', {}, perfect ? 'Alles goed!' : goed >= ctx.antwoorden.length * 0.7 ? 'Sterk gespeeld' : 'Goed geoefend'),
        el('p', { class: 'lg-sub' }, modus.uitslagTekst ? modus.uitslagTekst(ctx) : `${goed} van de ${ctx.antwoorden.length} vragen goed in ${fmtTijd(ctx.tijd)}.`)));
    const cijfers = el('div', { class: 'lg-cijfers' },
      el('div', { class: 'lg-cijfer' }, el('strong', {}, String(entry.score)), el('span', {}, modus.scoreLabel)),
      el('div', { class: 'lg-cijfer' }, el('strong', {}, fmtTijd(ctx.tijd)), el('span', {}, 'antwoordtijd')),
      el('div', { class: 'lg-cijfer' }, el('strong', {}, `${goed}/${ctx.antwoorden.length}`), el('span', {}, 'goed')));

    const recap = el('ul', { class: 'lg-recap' });
    ctx.antwoorden.forEach(a => {
      const q = a.q || VRAGEN.find(x => x.id === a.id); if (!q) return;
      const li = el('li', { class: a.goed ? '' : 'fout' });
      const uitleg = el('div', { class: 'lg-recap-uitleg', hidden: '' }, el('p', {}, el('strong', {}, 'Uitleg: '), q.u), el('p', {}, el('strong', {}, 'Verdieping: '), q.d));
      const knop = el('button', { type: 'button', 'aria-expanded': 'false' }, el('span', { class: 'lg-stip' }), el('span', {}, q.v), el('span', { class: 'lg-recap-cat' }, CAT[q.cat].kort));
      knop.addEventListener('click', () => { const open = uitleg.hidden; uitleg.hidden = !open; knop.setAttribute('aria-expanded', open); });
      li.append(knop, uitleg); recap.append(li);
    });

    const opnieuw = el('button', { class: 'lg-knop', type: 'button' }, icoon('rotate-ccw'), ' Nog een ronde');
    opnieuw.addEventListener('click', () => start(ctx.modus, ctx.filter));
    const menu = el('button', { class: 'lg-knop-rand', type: 'button' }, 'Andere spelvorm');
    menu.addEventListener('click', toonMenu);
    const fouten = ctx.antwoorden.filter(a => !a.goed).length;
    veld.append(el('div', { class: 'lg-uitslag' }, kop, cijfers,
      el('p', { class: 'lg-hulp', style: 'margin:0' }, fouten ? `Klik op een vraag om de uitleg terug te lezen. De ${fouten === 1 ? 'vraag die je fout had komt' : fouten + ' vragen die je fout had komen'} in volgende rondes vaker terug.` : 'Klik op een vraag om de verdieping terug te lezen.'),
      recap, el('div', { class: 'lg-acties' }, opnieuw, menu)));
    ikonen();
  }

  /* ───────── Menu ───────── */
  let gekozenModus = 'sprint';
  let filter = { type: 'alles' };
  function toonMenu() {
    const veld = $('#speelveld'); veld.innerHTML = '';
    const uitlegKnop = el('button', { class: 'lg-knop-rand', type: 'button' }, icoon('circle-help'), ' Uitleg');
    uitlegKnop.addEventListener('click', () => $('#uitlegDialog').showModal());
    veld.append(el('div', { class: 'lg-menu-kop' }, el('div', {}, el('h2', {}, 'Kies een spelvorm'), el('p', {}, 'Dezelfde stof, vijf manieren om te oefenen. Elke ronde is anders.')), uitlegKnop));

    const modi = Object.values(MODI).sort((a, b) => a.volgorde - b.volgorde);
    const grid = el('div', { class: 'lg-modi', role: 'group', 'aria-label': 'Spelvorm' });
    modi.forEach(m => {
      const b = el('button', { class: 'lg-modus', type: 'button', 'aria-pressed': String(m.key === gekozenModus) },
        el('span', { class: 'lg-modus-icoon' }, icoon(m.icoon)), el('strong', {}, m.naam), el('span', {}, m.omschrijving));
      b.addEventListener('click', () => { gekozenModus = m.key; toonMenu(); });
      grid.append(b);
    });
    veld.append(grid);

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
    const startKnop = el('button', { class: 'lg-knop', type: 'button' }, icoon('play'), ` Start ${modus.naam}`);
    startKnop.addEventListener('click', () => start(gekozenModus, modus.heeftFilter ? filter : { type: 'alles' }));
    veld.append(el('div', { class: 'lg-start' }, startKnop, el('span', { class: 'lg-hulp', style: 'margin:0' }, modus.startHulp || 'Tien vragen. De klok loopt alleen terwijl je antwoordt.')));
    ikonen();
  }

  /* ───────── Spelerkaart ───────── */
  function renderSpeler() {
    const kaart = $('#spelerkaart'); kaart.innerHTML = '';
    const naam = LG.Naam.get();
    if (!naam) {
      const input = el('input', { id: 'naamInput', type: 'text', maxlength: '24', autocomplete: 'nickname', placeholder: 'Bijv. Sam of team Groen', required: '' });
      const form = el('form', {}, el('label', { for: 'naamInput' }, 'Hoe heet je op het scorebord?'), input, el('button', { class: 'lg-knop', type: 'submit' }, 'Opslaan'));
      form.addEventListener('submit', e => { e.preventDefault(); const n = input.value.trim().slice(0, 24); if (!n) return; LG.Naam.set(n); renderSpeler(); renderScorebord(); meld(`Welkom, ${n}!`); });
      kaart.append(form);
    } else {
      const wissel = el('button', { class: 'lg-knop-link', type: 'button' }, 'Wijzig');
      wissel.addEventListener('click', () => { LG.Naam.set(''); renderSpeler(); $('#naamInput').focus(); });
      kaart.append(el('div', { class: 'lg-wie' }, el('div', {}, el('strong', {}, naam), el('small', {}, 'Je naam staat bij je scores')), wissel));
    }
    ikonen();
  }

  /* ───────── Scorebord ───────── */
  let scoreTab = 'sprint', laatsteEntry = null;
  async function renderScorebord() {
    const tabs = $('#scoreTabs'); tabs.innerHTML = '';
    Object.values(MODI).sort((a, b) => a.volgorde - b.volgorde).forEach(m => {
      const b = el('button', { type: 'button', role: 'tab', 'aria-selected': String(m.key === scoreTab) }, m.naam);
      b.addEventListener('click', () => { scoreTab = m.key; renderScorebord(); });
      tabs.append(b);
    });
    const modus = MODI[scoreTab];
    const run = renderScorebord.run = (renderScorebord.run || 0) + 1;
    let lijst = [];
    try { lijst = await LG.Scores.top(scoreTab, 10); } catch (e) { console.warn(e); }
    if (run !== renderScorebord.run) return;             // een nieuwere render is al bezig
    const bord = $('#scorebord'); bord.innerHTML = '';
    if (!lijst.length) {
      bord.append(el('div', { class: 'lg-leeg' }, icoon('sparkles'), `Nog geen scores voor ${modus.naam}. Speel de eerste ronde!`));
    } else {
      const naam = LG.Naam.get();
      const ul = el('ul', { class: 'lg-score-lijst' });
      lijst.forEach((s, i) => {
        const jij = s.naam === naam && (laatsteEntry ? (s.lokaalId ? s.lokaalId === laatsteEntry.lokaalId : (s.score === laatsteEntry.score && s.tijd === laatsteEntry.tijd)) : false);
        ul.append(el('li', { class: 'lg-score' + (jij ? ' jij' : '') },
          el('span', { class: 'lg-plek' + (i === 0 ? ' p1' : '') }, String(i + 1)),
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
      lijst.append(el('div', { class: 'lg-vg-rij', title: b.gezien ? `${b.goed} van ${b.gezien} goed` : 'nog niet geoefend' },
        el('span', {}, c.naam), el('span', { class: 'lg-niveau', 'aria-label': `niveau ${niv} van 3` }, [1, 2, 3].map(l => el('i', { class: l <= niv ? 'aan' : '' })))));
    });
    wrap.append(lijst);
  }

  /* ───────── Init ───────── */
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('dialog [data-sluit]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
    renderSpeler(); renderScorebord(); renderVoortgang(); toonMenu();
    if (LG.Scores.luister) LG.Scores.luister(() => renderScorebord());
  });

  window.LGame = { start, toonMenu, toonVraag, einde, volgende, spelbalk, stappen, startTimer, stopTimer, kiesVraag, kiesStandaard, kiesNiveau, poolVoorFilter, el, icoon, ikonen, shuffle, meld, fmtTijd, beantwoord, CAT, AANTAL };
})();
