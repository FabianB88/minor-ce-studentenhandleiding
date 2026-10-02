/* Extra spelvormen voor de learning game: 1 tegen 100, Miljonair, Lingo en Flitskaarten.
   Gebruikt de kern uit game.js (window.LGame) en registreert zich in window.LG_MODI. */
(function () {
  const G = window.LGame, MODI = window.LG_MODI;
  const { el, icoon, ikonen, shuffle, meld, fmtGeld } = G;
  const $ = (s, r) => (r || document).querySelector(s);
  const niveauVoor = (i) => (i < 3 ? 1 : i < 7 ? 2 : 3);     // vraag 1-3, 4-7, 8-10
  const goedTekst = (ctx) => { const g = ctx.antwoorden.filter(a => a.goed).length; return g === 1 ? '1 goed antwoord' : `${g} goede antwoorden`; };

  /* ───────── 1 tegen 100 ───────── */
  MODI.honderd = {
    key: 'honderd', naam: '1 tegen 100', icoon: 'users', volgorde: 10, groep: 'show', kleur: 'koel',
    omschrijving: 'Honderd tegenstanders. Elk goed antwoord schakelt er een deel uit. Fout? Dan ben je alles kwijt, tenzij je op tijd stopt.',
    scoreLabel: 'tegenstanders uitgeschakeld', max: 100, limiet: 30, reeks: true,
    startHulp: 'Na elk goed antwoord kies je: doorgaan voor meer, of stoppen en je stand meenemen. Moeilijkere vragen schakelen meer tegenstanders uit.',
    init(ctx) { ctx.over = 100; ctx.af = []; ctx.gestopt = false; ctx.verloren = false; },
    kies(ctx) { return Promise.resolve(G.kiesStandaard(ctx, { type: 'alles' }, niveauVoor(ctx.antwoorden.length))); },
    renderExtra(ctx) {
      const grid = el('div', { class: 'lg-honderd', 'aria-hidden': 'true' }, Array.from({ length: 100 }, (_, i) => el('i', { class: ctx.af.includes(i) ? 'af' : '' })));
      const stand = el('div', { class: 'lg-honderd-stand' }, el('span', {}, 'Nog ', el('strong', {}, String(ctx.over)), ' tegenstanders over'), el('span', {}, el('strong', {}, String(100 - ctx.over)), ' uitgeschakeld'));
      return el('div', {}, grid, stand);
    },
    naAntwoord(ctx, goed) {
      const q = ctx.vraag;
      if (!goed) {
        ctx.verloren = true;
        const had = 100 - ctx.over;
        return { einde: true, tekst: had ? `Fout, en daarmee is je stand van ${had} weg. De overgebleven tegenstanders winnen deze ronde.` : 'Meteen bij de eerste vraag mis. Nog een keer?' };
      }
      const basis = q.n === 1 ? 0.22 : q.n === 2 ? 0.38 : 0.55;
      let k = Math.round(ctx.over * (basis + (Math.random() * 0.14 - 0.07)));
      k = Math.max(1, Math.min(ctx.over, k));
      if (ctx.antwoorden.length >= 10) k = ctx.over;
      const nogOver = Array.from({ length: 100 }, (_, i) => i).filter(i => !ctx.af.includes(i));
      const weg = shuffle(nogOver).slice(0, k);
      ctx.af.push(...weg); ctx.over -= k;
      const dots = document.querySelectorAll('.lg-honderd i');
      weg.forEach((i, idx) => setTimeout(() => dots[i] && dots[i].classList.add('af'), 35 * idx));
      const stand = $('.lg-honderd-stand'); if (stand) stand.replaceWith(this.renderExtra(ctx).lastChild);
      if (ctx.over === 0) return { einde: true, tekst: 'Alle honderd tegenstanders zijn uitgeschakeld!' };
      const risico = q.n === 1 ? 'De volgende wordt moeilijker.' : 'Hoe hoger je komt, hoe meer er op het spel staat.';
      return {
        tekst: `${k} tegenstanders hadden dit fout en vallen af. Nog ${ctx.over} over. ${risico}`,
        acties: [
          { label: 'Doorgaan', icoon: 'arrow-right', actie: () => G.volgende(ctx) },
          { label: `Stoppen en ${100 - ctx.over} meenemen`, icoon: 'hand', secundair: true, actie: () => { ctx.gestopt = true; G.einde(ctx); } }
        ]
      };
    },
    klaar(ctx) { return ctx.antwoorden.length >= 10 || ctx.over === 0; },
    score(ctx) { return ctx.verloren ? 0 : 100 - ctx.over; },
    uitslagKop(ctx) { return ctx.verloren ? 'Uitgeschakeld' : ctx.over === 0 ? 'Jij tegen niemand meer!' : 'Slim gestopt'; },
    uitslagTekst(ctx) { const g = ctx.antwoorden.filter(a => a.goed).length; return ctx.verloren ? `Je had ${100 - ctx.over} tegenstanders uitgeschakeld, maar één fout zet de teller op nul. Volgende keer eerder stoppen?` : ctx.over === 0 ? `Alle 100 uitgeschakeld in ${g} vragen en ${G.fmtTijd(ctx.tijd)}.` : `Je neemt ${100 - ctx.over} uitgeschakelde tegenstanders mee in ${G.fmtTijd(ctx.tijd)}.`; }
  };

  /* ───────── Miljonair ───────── */
  const TREDEN = 10, VEILIG = [5, 10];
  const BEDRAGEN = [100, 250, 500, 1000, 2500, 5000, 10000, 50000, 250000, 1000000];
  MODI.miljonair = {
    key: 'miljonair', naam: 'Miljonair', icoon: 'gem', volgorde: 11, groep: 'show', kleur: 'goud',
    omschrijving: 'Tien treden naar een miljoen, met drie hulplijnen. Kies, maak het definitief, en durf te stoppen.',
    scoreLabel: 'treden gehaald', max: TREDEN, limiet: 90, bevestig: true,
    startHulp: 'Trede 5 is veilig: val je daarboven, dan hou je € 2.500. Na elke trede mag je stoppen en je bedrag meenemen.',
    init(ctx) { ctx.trede = 0; ctx.hulp = { half: true, publiek: true, boek: true }; ctx.gestopt = false; },
    kies(ctx) {
      const niveau = niveauVoor(ctx.antwoorden.length);
      const pool = window.VRAGEN.filter(q => q.type === 'mc');
      return Promise.resolve(G.kiesVraag(pool, ctx, niveau));
    },
    renderExtra(ctx) {
      const ladder = el('ol', { class: 'lg-ladder', 'aria-label': 'Treden' }, Array.from({ length: TREDEN }, (_, i) => {
        const t = TREDEN - i;   // van boven naar beneden
        return el('li', { class: (t <= ctx.trede ? 'gehaald ' : '') + (t === ctx.antwoorden.length + 1 ? 'nu ' : '') + (VEILIG.includes(t) ? 'veilig' : '') },
          el('span', { class: 'lg-trede-nr' }, String(t)), el('span', {}, fmtGeld(BEDRAGEN[t - 1])), VEILIG.includes(t) ? icoon('shield') : null);
      }));
      const knop = (key, ic, label, actie) => { const b = el('button', { class: 'lg-hulplijn', type: 'button', disabled: !ctx.hulp[key] }, icoon(ic), el('span', {}, label)); b.addEventListener('click', () => { if (!ctx.hulp[key] || ctx.beantwoord || ctx.bezig) return; ctx.hulp[key] = false; b.disabled = true; actie(); }); return b; };
      const hulp = el('div', { class: 'lg-hulplijnen', 'aria-label': 'Hulplijnen' },
        knop('half', 'divide', '50/50', () => {
          const fout = [...document.querySelectorAll('.lg-optie:not(:disabled)')].filter(b => Number(b.dataset.oi) !== ctx.vraag.j);
          shuffle(fout).slice(0, 2).forEach(b => { b.classList.add('weg'); b.disabled = true; b.setAttribute('aria-pressed', 'false'); });
          meld('Twee foute antwoorden zijn weggestreept.');
        }),
        knop('publiek', 'bar-chart-3', 'Vraag het publiek', () => {
          // Het publiek heeft het meestal, maar niet altijd, bij het rechte eind; bij diepere vragen twijfelt het meer.
          const q = ctx.vraag, open = [...document.querySelectorAll('.lg-optie:not(.weg)')];
          const juistPct = Math.round((q.n === 1 ? 62 : q.n === 2 ? 50 : 41) + Math.random() * 16);
          let rest = 100 - juistPct; const verdeling = {};
          const anderen = shuffle(open.filter(b => Number(b.dataset.oi) !== q.j));
          anderen.forEach((b, i) => { const p = i === anderen.length - 1 ? rest : Math.round(rest * (0.3 + Math.random() * 0.5)); verdeling[b.dataset.oi] = Math.max(0, Math.min(rest, p)); rest -= verdeling[b.dataset.oi]; });
          verdeling[q.j] = juistPct;
          const chart = el('div', { class: 'lg-publiek' }, open.map(b => { const letter = b.querySelector('.lg-letter').textContent; const p = verdeling[b.dataset.oi] || 0; return el('div', { class: 'lg-publiek-kolom' }, el('i', { style: `height:${p}%` }), el('span', {}, `${letter} ${p}%`)); }));
          $('.lg-vraag').before(el('div', { class: 'lg-hint' }, el('strong', {}, 'Het publiek stemt: '), chart));
          ikonen();
        }),
        knop('boek', 'book-open', 'Blader in de e-learning', () => {
          $('.lg-vraag').before(el('p', { class: 'lg-hint' }, el('strong', {}, 'Uit de e-learning: '), ctx.vraag.d));
        }));
      const bedrag = el('div', { class: 'lg-milj-bedrag' }, el('span', {}, 'Je speelt nu voor'), el('strong', {}, fmtGeld(BEDRAGEN[Math.min(ctx.antwoorden.length, TREDEN - 1)])));
      return el('div', { class: 'lg-milj' }, el('div', {}, bedrag, hulp), ladder);
    },
    naAntwoord(ctx, goed) {
      if (goed) {
        ctx.trede = ctx.antwoorden.length;
        if (ctx.trede === TREDEN) return { tekst: 'De top! Een miljoen, alle tien treden gehaald.' };
        const veilig = VEILIG.includes(ctx.trede) ? ' Deze trede is veilig: hieronder kun je niet meer vallen.' : '';
        return {
          tekst: `Trede ${ctx.trede} gehaald: ${fmtGeld(BEDRAGEN[ctx.trede - 1])}.${veilig} De volgende trede is ${fmtGeld(BEDRAGEN[ctx.trede])}.`,
          acties: [
            { label: 'Volgende trede', icoon: 'arrow-up', actie: () => G.volgende(ctx) },
            { label: `Stoppen met ${fmtGeld(BEDRAGEN[ctx.trede - 1])}`, icoon: 'hand', secundair: true, actie: () => { ctx.gestopt = true; G.einde(ctx); } }
          ]
        };
      }
      const val = ctx.trede >= 5 ? 5 : 0;
      const tekst = ctx.trede >= 5 ? `Je valt terug naar de veilige trede 5 en houdt ${fmtGeld(BEDRAGEN[4])}.` : (ctx.trede ? `Je valt terug naar het begin; trede 5 had je nog niet bereikt.` : 'Meteen op de eerste trede mis. Nog een poging?');
      ctx.trede = val;
      return { einde: true, tekst };
    },
    klaar(ctx) { return ctx.antwoorden.length >= TREDEN; },
    score(ctx) { return ctx.trede; },
    uitslagKop(ctx) { return ctx.trede === TREDEN ? 'Miljonair!' : ctx.gestopt ? 'Gestopt met winst' : ctx.trede ? 'Teruggevallen' : 'Van voren af aan'; },
    uitslagTekst(ctx) { return `Je gaat naar huis met ${ctx.trede ? fmtGeld(BEDRAGEN[ctx.trede - 1]) : '€ 0'} op trede ${ctx.trede} van ${TREDEN}, met ${goedTekst(ctx)} in ${G.fmtTijd(ctx.tijd)}.`; }
  };

  /* ───────── Lingo: begrippen raden ───────── */
  const WOORDEN = 8, POGINGEN = 3, LINGO_TIJD = 60;
  MODI.lingo = {
    key: 'lingo', naam: 'Lingo', icoon: 'spell-check', volgorde: 12, groep: 'show', kleur: 'zand',
    omschrijving: 'Raad het kernbegrip bij de omschrijving. Drie pogingen per woord, elke poging geeft een letter extra.',
    scoreLabel: 'punten', max: WOORDEN * POGINGEN, limiet: 0, stappen: WOORDEN,
    startHulp: `Acht begrippen. In één keer goed is ${POGINGEN} punten, daarna ${POGINGEN - 1} en ${POGINGEN - 2}.`,
    init(ctx) { ctx.punten = 0; ctx.woordenGespeeld = []; },
    kies(ctx) {
      const stats = window.LG.Stats.alles();
      const kandidaten = window.BEGRIPPEN.filter(b => !ctx.woordenGespeeld.includes(b.w));
      const gew = kandidaten.map(b => { const v = stats.vragen['begrip:' + b.w]; return v ? Math.max(0.3, 1 + v.f - 0.5 * v.g) : 1.4; });
      let r = Math.random() * gew.reduce((a, b) => a + b, 0), keus = kandidaten[0];
      for (let i = 0; i < kandidaten.length; i++) { r -= gew[i]; if (r <= 0) { keus = kandidaten[i]; break; } }
      return Promise.resolve(keus);
    },
    speel(ctx) { MODI.lingo.kies(ctx).then(b => speelLingoWoord(ctx, b)); },
    klaar(ctx) { return ctx.antwoorden.length >= WOORDEN; },
    score(ctx) { return ctx.punten; },
    uitslagTekst(ctx) { return `${ctx.antwoorden.filter(a => a.goed).length} van de ${WOORDEN} begrippen geraden, ${ctx.punten} punten in ${G.fmtTijd(ctx.tijd)}.`; }
  };

  function speelLingoWoord(ctx, b) {
    const woord = b.w, L = woord.length, cat = G.CAT[b.cat];
    ctx.woordenGespeeld.push(woord);
    ctx.vraag = { id: 'begrip:' + woord, cat: b.cat, n: 1 };
    ctx.beantwoord = false;
    let poging = 0;
    const bekend = Array.from({ length: L }, (_, i) => i < 1 ? woord[i] : null);
    const veld = $('#speelveld'); veld.innerHTML = ''; veld.dataset.modus = 'lingo';
    const balk = el('div', { class: 'lg-balk' }, el('div', { class: 'lg-balk-links' }, el('strong', {}, 'Lingo'), ' · begrip ', el('strong', {}, String(ctx.antwoorden.length + 1)), ` van ${WOORDEN}`),
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
      const rest = woord.split('');
      const kleur = Array(L).fill('s0');
      for (let i = 0; i < L; i++) if (gok[i] === woord[i]) { kleur[i] = 's2'; rest[i] = null; }
      for (let i = 0; i < L; i++) if (kleur[i] !== 's2') { const k = rest.indexOf(gok[i]); if (k > -1) { kleur[i] = 's1'; rest[k] = null; } }
      const rij = el('div', { class: 'lg-lingo-rij', style: `--l:${L}` }, gok.split('').map((ch, i) => { const t = tegel(ch, kleur[i] + ' flip'); t.style.setProperty('--d', (i * 0.06) + 's'); return t; }));
      hint.before(rij);
      input.value = '';
      if (gok === woord) { afronden(true); return; }
      if (poging >= POGINGEN) { afronden(false); return; }
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

  /* ───────── Flitskaarten: actief ophalen met zelfbeoordeling ───────── */
  const KAARTEN = 12;
  MODI.flits = {
    key: 'flits', naam: 'Flitskaarten', icoon: 'layers', volgorde: 6, groep: 'oefenen', kleur: 'zand',
    omschrijving: 'Begrip zien, omschrijving in je hoofd formuleren, omdraaien, eerlijk beoordelen. Zonder tijd of score.',
    scoreLabel: 'gekend', max: KAARTEN, geenScore: true, stappen: KAARTEN,
    startHulp: 'Twaalf kaarten, de helft van begrip naar omschrijving en de helft andersom. Zeg het antwoord hardop voordat je omdraait: dat werkt het best.',
    init(ctx) {
      const stats = window.LG.Stats.alles();
      const gew = window.BEGRIPPEN.map(b => { const v = stats.vragen['begrip:' + b.w]; return v ? Math.max(0.3, 1 + 1.5 * v.f - 0.5 * v.g) : 1.5; });
      const gekozen = []; const pool = window.BEGRIPPEN.slice(); const w = gew.slice();
      while (gekozen.length < KAARTEN && pool.length) { let r = Math.random() * w.reduce((a, b) => a + b, 0); let i = 0; for (; i < pool.length; i++) { r -= w[i]; if (r <= 0) break; } i = Math.min(i, pool.length - 1); gekozen.push(pool[i]); pool.splice(i, 1); w.splice(i, 1); }
      ctx.kaarten = gekozen.map((b, i) => ({ b, richting: i % 2 === 0 ? 'begrip' : 'omschrijving' }));
      ctx.gekend = 0;
    },
    speel(ctx) { toonKaart(ctx, ctx.kaarten[ctx.antwoorden.length]); },
    klaar(ctx) { return ctx.antwoorden.length >= KAARTEN; },
    score(ctx) { return ctx.gekend; },
    uitslagKop(ctx) { return ctx.gekend === KAARTEN ? 'Alles gekend' : ctx.gekend >= 8 ? 'Goed in je hoofd' : 'Nog even oefenen'; },
    uitslagTekst(ctx) { return `${ctx.gekend} van de ${KAARTEN} kaarten gekend. De kaarten die je niet kende komen de volgende keer eerder terug.`; }
  };

  function toonKaart(ctx, k) {
    const b = k.b, cat = G.CAT[b.cat];
    ctx.beantwoord = false; ctx.vraag = { id: 'begrip:' + b.w, cat: b.cat, n: 1 };
    const veld = $('#speelveld'); veld.innerHTML = ''; veld.dataset.modus = 'flits';
    const balk = el('div', { class: 'lg-balk' }, el('div', { class: 'lg-balk-links' }, el('strong', {}, 'Flitskaarten'), ' · kaart ', el('strong', {}, String(ctx.antwoorden.length + 1)), ` van ${KAARTEN}`),
      el('span', { class: 'lg-cat ' + cat.cursus }, cat.naam),
      el('button', { class: 'lg-knop-link', type: 'button', onclick: () => { if (confirm('Stoppen met deze set?')) G.toonMenu(); } }, 'Stoppen'));
    veld.append(balk, G.stappen(ctx));
    const term = b.w.charAt(0) + b.w.slice(1).toLowerCase();
    const voorkant = k.richting === 'begrip' ? el('div', { class: 'lg-kaart-zijde' }, el('small', {}, 'Begrip'), el('strong', { class: 'lg-kaart-term' }, term), el('span', {}, 'Wat betekent dit? Formuleer het in je eigen woorden.'))
                                              : el('div', { class: 'lg-kaart-zijde' }, el('small', {}, 'Omschrijving'), el('span', { class: 'lg-kaart-def' }, b.d), el('span', {}, 'Welk begrip is dit?'));
    const achterkant = k.richting === 'begrip' ? el('div', { class: 'lg-kaart-zijde achter' }, el('small', {}, 'Omschrijving'), el('span', { class: 'lg-kaart-def' }, b.d))
                                                : el('div', { class: 'lg-kaart-zijde achter' }, el('small', {}, 'Begrip'), el('strong', { class: 'lg-kaart-term' }, term));
    const kaart = el('button', { class: 'lg-flitskaart', type: 'button', 'aria-label': 'Kaart omdraaien' }, el('div', { class: 'lg-flitskaart-binnen' }, voorkant, achterkant));
    const acties = el('div', { class: 'lg-acties lg-flits-acties' });
    const draai = el('button', { class: 'lg-knop', type: 'button' }, icoon('refresh-cw'), ' Draai om');
    const omdraaien = () => {
      if (ctx.beantwoord) return; ctx.beantwoord = true;
      kaart.classList.add('gedraaid'); draai.remove();
      const oordeel = (gekend) => {
        window.LG.Stats.noteer(ctx.vraag, gekend);
        if (gekend) ctx.gekend++;
        ctx.antwoorden.push({ id: 'begrip:' + b.w, goed: gekend, q: { id: 'begrip:' + b.w, v: `${term}`, u: b.d, d: `Onderwerp: ${cat.naam}.`, cat: b.cat, n: 1 } });
        MODI.flits.klaar(ctx) ? G.einde(ctx) : MODI.flits.speel(ctx);
      };
      const niet = el('button', { class: 'lg-knop-rand', type: 'button' }, icoon('x'), ' Wist ik niet');
      const wel = el('button', { class: 'lg-knop', type: 'button' }, icoon('check'), ' Wist ik');
      niet.addEventListener('click', () => oordeel(false)); wel.addEventListener('click', () => oordeel(true));
      acties.append(el('span', { class: 'lg-hulp', style: 'margin:0;width:100%' }, 'Wees eerlijk: alleen dan komen de juiste kaarten terug.'), niet, wel);
      ikonen(); wel.focus();
    };
    draai.addEventListener('click', omdraaien); kaart.addEventListener('click', omdraaien);
    acties.append(draai);
    veld.append(el('div', { class: 'lg-flits' }, kaart), acties);
    ikonen(); draai.focus({ preventScroll: true });
  }
})();
