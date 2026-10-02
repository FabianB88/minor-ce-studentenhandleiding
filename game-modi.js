/* Extra spelvormen voor de learning game: 1 tegen 100, Miljonair en Lingo.
   Gebruikt de kern uit game.js (window.LGame) en registreert zich in window.LG_MODI. */
(function () {
  const G = window.LGame, MODI = window.LG_MODI;
  const { el, icoon, ikonen, shuffle, meld } = G;
  const $ = (s, r) => (r || document).querySelector(s);
  const niveauVoor = (i) => (i < 3 ? 1 : i < 7 ? 2 : 3);     // vraag 1-3, 4-7, 8-10

  /* ───────── 1 tegen 100 ───────── */
  MODI.honderd = {
    key: 'honderd', naam: '1 tegen 100', icoon: 'users', volgorde: 3,
    omschrijving: 'Honderd tegenstanders. Elk goed antwoord schakelt er een deel uit. Eén fout en het is voorbij.',
    scoreLabel: 'tegenstanders uitgeschakeld', max: 100, limiet: 30,
    startHulp: 'De vragen worden per drie moeilijker, en moeilijkere vragen schakelen meer tegenstanders uit.',
    init(ctx) { ctx.over = 100; ctx.af = []; },
    kies(ctx) { return Promise.resolve(G.kiesStandaard(ctx, { type: 'alles' }, niveauVoor(ctx.antwoorden.length))); },
    renderExtra(ctx) {
      const grid = el('div', { class: 'lg-honderd', 'aria-hidden': 'true' }, Array.from({ length: 100 }, (_, i) => el('i', { class: ctx.af.includes(i) ? 'af' : '' })));
      const stand = el('div', { class: 'lg-honderd-stand' }, el('span', {}, 'Nog ', el('strong', {}, String(ctx.over)), ' tegenstanders over'), el('span', {}, el('strong', {}, String(100 - ctx.over)), ' uitgeschakeld'));
      return el('div', {}, grid, stand);
    },
    naAntwoord(ctx, goed) {
      const q = ctx.vraag;
      if (!goed) {
        return { einde: true, tekst: ctx.over === 100 ? 'Je bent uitgeschakeld voordat er iemand afviel. Nog een keer?' : `Je bent uitgeschakeld met ${100 - ctx.over} tegenstanders eruit. De overgebleven ${ctx.over} winnen deze ronde.` };
      }
      // aandeel tegenstanders dat deze vraag fout had, oplopend met niveau
      const basis = q.n === 1 ? 0.22 : q.n === 2 ? 0.38 : 0.55;
      let k = Math.round(ctx.over * (basis + (Math.random() * 0.14 - 0.07)));
      k = Math.max(1, Math.min(ctx.over, k));
      if (ctx.antwoorden.length >= 10) k = ctx.over;            // laatste vraag goed: alles eruit
      const nogOver = Array.from({ length: 100 }, (_, i) => i).filter(i => !ctx.af.includes(i));
      const weg = shuffle(nogOver).slice(0, k);
      ctx.af.push(...weg); ctx.over -= k;
      const dots = document.querySelectorAll('.lg-honderd i');
      weg.forEach((i, idx) => setTimeout(() => dots[i] && dots[i].classList.add('af'), 40 * idx));
      const stand = $('.lg-honderd-stand'); if (stand) stand.replaceWith(this.renderExtra(ctx).lastChild);
      return { einde: ctx.over === 0, tekst: ctx.over === 0 ? 'Alle honderd tegenstanders zijn uitgeschakeld!' : `${k} tegenstanders hadden dit fout en vallen af. Nog ${ctx.over} over.` };
    },
    klaar(ctx) { return ctx.antwoorden.length >= 10 || ctx.over === 0; },
    score(ctx) { return 100 - ctx.over; },
    uitslagTekst(ctx) { const g = ctx.antwoorden.filter(a => a.goed).length; return ctx.over === 0 ? `Alle 100 uitgeschakeld in ${g} vragen en ${G.fmtTijd(ctx.tijd)}.` : `${100 - ctx.over} van de 100 uitgeschakeld in ${G.fmtTijd(ctx.tijd)}.`; }
  };

  /* ───────── Miljonair ───────── */
  const TREDEN = 10, VEILIG = 5;
  MODI.miljonair = {
    key: 'miljonair', naam: 'Miljonair', icoon: 'gem', volgorde: 4,
    omschrijving: 'Tien treden omhoog met drie hulplijnen. Fout boven trede vijf? Dan val je terug naar vijf.',
    scoreLabel: 'treden gehaald', max: TREDEN, limiet: 90,
    startHulp: 'Geen haast: je hebt per vraag anderhalve minuut. Je totale antwoordtijd telt alleen bij gelijke stand.',
    init(ctx) { ctx.trede = 0; ctx.hulp = { half: true, boek: true, wissel: true }; },
    kies(ctx) {
      const niveau = niveauVoor(ctx.antwoorden.length);
      const pool = window.VRAGEN.filter(q => q.type === 'mc');
      return Promise.resolve(G.kiesVraag(pool, ctx, niveau));
    },
    renderExtra(ctx) {
      const ladder = el('ol', { class: 'lg-ladder', 'aria-label': 'Treden' }, Array.from({ length: TREDEN }, (_, i) => {
        const t = i + 1;
        return el('li', { class: (t <= ctx.trede ? 'gehaald ' : '') + (t === ctx.antwoorden.length + 1 ? 'nu ' : '') + (t === VEILIG ? 'veilig' : '') }, t === VEILIG ? icoon('shield') : null, String(t));
      }));
      const knop = (key, ic, label, actie) => { const b = el('button', { class: 'lg-knop-rand', type: 'button', disabled: ctx.hulp[key] ? null : '' }, icoon(ic), ' ' + label); b.addEventListener('click', () => { if (!ctx.hulp[key] || ctx.beantwoord) return; ctx.hulp[key] = false; b.disabled = true; actie(); }); return b; };
      const hulp = el('div', { class: 'lg-hulplijnen', 'aria-label': 'Hulplijnen' },
        knop('half', 'divide', '50/50', () => {
          const fout = [...document.querySelectorAll('.lg-optie:not(:disabled)')].filter(b => Number(b.dataset.oi) !== ctx.vraag.j);
          shuffle(fout).slice(0, 2).forEach(b => { b.classList.add('weg'); b.disabled = true; });
          meld('Twee foute antwoorden zijn weggestreept.');
        }),
        knop('boek', 'book-open', 'Blader in de e-learning', () => {
          const hint = el('p', { class: 'lg-hint' }, el('strong', {}, 'Uit de e-learning: '), ctx.vraag.d);
          $('.lg-vraag').before(hint);
        }),
        knop('wissel', 'repeat', 'Wissel de vraag', () => {
          G.stopTimer(ctx);
          const nieuwe = G.kiesVraag(window.VRAGEN.filter(q => q.type === 'mc' && q.n === ctx.vraag.n), ctx, ctx.vraag.n);
          G.toonVraag(ctx, nieuwe);
          meld('Nieuwe vraag op dezelfde trede.');
        }));
      return el('div', {}, ladder, hulp);
    },
    naAntwoord(ctx, goed) {
      if (goed) { ctx.trede = ctx.antwoorden.length; return ctx.trede === TREDEN ? { tekst: 'De top! Alle tien treden gehaald.' } : null; }
      const val = ctx.trede >= VEILIG ? VEILIG : 0;
      const tekst = ctx.trede >= VEILIG ? `Je valt terug naar de veilige trede ${VEILIG}.` : (ctx.trede ? `Je valt terug naar het begin; trede ${VEILIG} had je nog niet bereikt.` : 'Meteen op de eerste trede mis. Nog een poging?');
      ctx.trede = val;
      return { einde: true, tekst };
    },
    klaar(ctx) { return ctx.antwoorden.length >= TREDEN; },
    score(ctx) { return ctx.trede; },
    uitslagTekst(ctx) { return `Je eindigt op trede ${ctx.trede} van ${TREDEN}, met ${ctx.antwoorden.filter(a => a.goed).length} goede antwoorden in ${G.fmtTijd(ctx.tijd)}.`; }
  };

  /* ───────── Lingo: begrippen raden ───────── */
  const WOORDEN = 8, POGINGEN = 3, LINGO_TIJD = 60;
  MODI.lingo = {
    key: 'lingo', naam: 'Lingo', icoon: 'spell-check', volgorde: 5,
    omschrijving: 'Raad het kernbegrip bij de omschrijving. Drie pogingen per woord, elke poging geeft een letter extra.',
    scoreLabel: 'punten', max: WOORDEN * POGINGEN, limiet: 0,
    startHulp: `Acht begrippen. In één keer goed is ${POGINGEN} punten, daarna ${POGINGEN - 1} en ${POGINGEN - 2}.`,
    init(ctx) { ctx.punten = 0; ctx.woordenGespeeld = []; },
    kies(ctx) {
      const stats = window.LG.Stats.alles();
      const kandidaten = window.BEGRIPPEN.filter(b => !ctx.woordenGespeeld.includes(b.w));
      // woorden die je eerder miste komen eerder terug
      const gew = kandidaten.map(b => { const v = stats.vragen['begrip:' + b.w]; return v ? Math.max(0.3, 1 + v.f - 0.5 * v.g) : 1.4; });
      let r = Math.random() * gew.reduce((a, b) => a + b, 0), keus = kandidaten[0];
      for (let i = 0; i < kandidaten.length; i++) { r -= gew[i]; if (r <= 0) { keus = kandidaten[i]; break; } }
      return Promise.resolve(keus);
    },
    klaar(ctx) { return ctx.antwoorden.length >= WOORDEN; },
    score(ctx) { return ctx.punten; },
    uitslagTekst(ctx) { return `${ctx.antwoorden.filter(a => a.goed).length} van de ${WOORDEN} begrippen geraden, ${ctx.punten} punten in ${G.fmtTijd(ctx.tijd)}.`; }
  };

  // Lingo heeft een eigen vraagweergave: de kern roept speel() aan in plaats van kies() + toonVraag().
  MODI.lingo.speel = function (ctx) { MODI.lingo.kies(ctx).then(b => speelLingoWoord(ctx, b)); };

  function speelLingoWoord(ctx, b) {
    const woord = b.w, L = woord.length, cat = G.CAT[b.cat];
    ctx.woordenGespeeld.push(woord);
    ctx.vraag = { id: 'begrip:' + woord, cat: b.cat, n: 1 };
    ctx.beantwoord = false;
    let poging = 0, onthuld = 1;                                  // eerste letter staat altijd open
    const bekend = Array.from({ length: L }, (_, i) => i < onthuld ? woord[i] : null);
    const veld = $('#speelveld'); veld.innerHTML = '';
    const balk = el('div', { class: 'lg-balk' }, el('div', {}, el('strong', {}, 'Lingo'), ' · begrip ', el('strong', {}, String(ctx.antwoorden.length + 1)), ` van ${WOORDEN}`),
      el('span', { class: 'lg-cat ' + cat.cursus }, cat.naam),
      el('button', { class: 'lg-knop-link', type: 'button', onclick: () => { if (confirm('Ronde afbreken? Je score wordt niet opgeslagen.')) { G.stopTimer(ctx); G.toonMenu(); } } }, 'Stoppen'));
    veld.append(balk, G.stappen(ctx));
    veld.append(G.startTimer(ctx, LINGO_TIJD, () => afronden(false, 'De tijd is om.')));

    const tegel = (ch, klasse) => el('span', { class: 'lg-tegel ' + (klasse || ''), style: `--tegel: ${L > 12 ? 'clamp(22px, 6vw, 34px)' : 'clamp(28px, 8vw, 44px)'}` }, ch || '');
    const bord = el('div', { class: 'lg-lingo-bord' });
    const hintRij = () => el('div', { class: 'lg-lingo-rij', style: `--l:${L}` }, bekend.map(c => tegel(c, c ? 'hint' : '')));
    let hint = hintRij(); bord.append(hint);

    const input = el('input', { type: 'text', maxlength: String(L), autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Jouw woord', placeholder: `${L} letters` });
    const knop = el('button', { class: 'lg-knop', type: 'submit' }, 'Raad');
    const form = el('form', { class: 'lg-lingo-invoer' }, input, knop);
    const pogingen = el('p', { class: 'lg-lingo-pogingen' }, `Poging 1 van ${POGINGEN}`);
    const def = el('p', { class: 'lg-lingo-def' }, b.d, el('small', {}, `${L} letters · ${cat.naam}`));
    veld.append(el('div', { class: 'lg-lingo' }, def, bord, form, pogingen));
    ikonen(); input.focus();

    const normaliseer = (s) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z]/g, '');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (ctx.beantwoord) return;
      const gok = normaliseer(input.value);
      if (gok.length !== L) { meld(`Het woord heeft ${L} letters.`); return; }
      poging++;
      // kleuren: groen op de juiste plek, zand elders in het woord, grijs niet
      const rest = woord.split('');
      const kleur = Array(L).fill('s0');
      for (let i = 0; i < L; i++) if (gok[i] === woord[i]) { kleur[i] = 's2'; rest[i] = null; }
      for (let i = 0; i < L; i++) if (kleur[i] !== 's2') { const k = rest.indexOf(gok[i]); if (k > -1) { kleur[i] = 's1'; rest[k] = null; } }
      const rij = el('div', { class: 'lg-lingo-rij', style: `--l:${L}` }, gok.split('').map((ch, i) => { const t = tegel(ch, kleur[i] + ' flip'); t.style.setProperty('--d', (i * 0.06) + 's'); return t; }));
      hint.before(rij);
      input.value = '';
      if (gok === woord) { afronden(true); return; }
      if (poging >= POGINGEN) { afronden(false); return; }
      // extra letter onthullen: eerste nog onbekende positie die niet al groen geraden is
      for (let i = 0; i < L; i++) if (gok[i] === woord[i]) bekend[i] = woord[i];
      const open = bekend.findIndex(c => !c); if (open > -1) bekend[open] = woord[open];
      const nieuw = hintRij(); hint.replaceWith(nieuw); hint = nieuw;
      pogingen.textContent = `Poging ${poging + 1} van ${POGINGEN}`;
      input.focus();
    });

    function afronden(goed, reden) {
      if (ctx.beantwoord) return;
      ctx.beantwoord = true; G.stopTimer(ctx);
      input.disabled = true; knop.disabled = true;
      const punten = goed ? (POGINGEN - poging + 1) : 0;
      ctx.punten += punten;
      ctx.antwoorden.push({ id: 'begrip:' + woord, goed, q: { id: 'begrip:' + woord, v: `Begrip: ${woord.charAt(0) + woord.slice(1).toLowerCase()}`, u: b.d, d: `Onderwerp: ${cat.naam}.`, cat: b.cat, n: 1 } });
      window.LG.Stats.noteer(ctx.vraag, goed);
      const fb = el('div', { class: 'lg-feedback' + (goed ? '' : ' fout') },
        el('div', { class: 'lg-fb-kop' }, icoon(goed ? 'check-circle-2' : 'info'), goed ? `Goed, in ${poging} ${poging === 1 ? 'poging' : 'pogingen'}: ${punten} ${punten === 1 ? 'punt' : 'punten'}` : (reden || 'Niet geraden')),
        el('p', {}, goed ? '' : `Het woord was ${woord}. `, b.d));
      if (!goed) { const onthul = el('div', { class: 'lg-lingo-rij', style: `--l:${L}` }, woord.split('').map(ch => tegel(ch, 's2'))); hint.replaceWith(onthul); }
      const klaar = MODI.lingo.klaar(ctx);
      const verder = el('button', { class: 'lg-knop', type: 'button' }, klaar ? 'Naar de uitslag' : 'Volgende', icoon('arrow-right'));
      verder.addEventListener('click', () => klaar ? G.einde(ctx) : MODI.lingo.speel(ctx));
      veld.append(fb, el('div', { class: 'lg-acties' }, verder));
      veld.querySelectorAll('.lg-stappen').forEach(s => s.replaceWith(G.stappen(ctx)));
      ikonen(); verder.focus({ preventScroll: true });
    }
  }
})();
