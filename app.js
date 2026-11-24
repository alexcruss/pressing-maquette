'use strict';
(() => {
/* ============ Outils ============ */
const KEY = 'pressing-maquette-v1';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const F = n => new Intl.NumberFormat('fr-FR').format(Math.round(n)).replace(/ /g, ' ') + ' F';
const iso = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
const todayISO = () => iso(Date.now());
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dateFR = s => parseISO(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const dateShort = s => parseISO(s).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const timeFR = ts => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const uid = () => Math.random().toString(36).slice(2, 9);
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const normPhone = p => { let d = String(p).replace(/\D/g, ''); if (d.length === 8) d = '228' + d; return d; };
const showPhone = p => (p.startsWith('228') && p.length === 11) ? '+228 ' + p.slice(3).replace(/(\d\d)(?=\d)/g, '$1 ') : '+' + p;
const initials = s => (String(s).trim().match(/\p{L}/u) || ['?'])[0].toUpperCase();
const UNKNOWN = '22890000000';

const STATUS = ['déposé', 'en cours', 'prêt', 'retiré'];
const NEXT = {
  'déposé': ['en cours', 'Passer en cours'],
  'en cours': ['prêt', 'Marquer prêt et prévenir le client'],
  'prêt': ['retiré', 'Remettre au client']
};
const METHODS = ['Espèces', 'Flooz', 'T-Money'];
const sCls = s => ({ 'déposé': '', 'en cours': 's-encours', 'prêt': 's-pret', 'retiré': 's-retire' }[s]);

/* ============ Données ============ */
let S; // chargé en bas du fichier, une fois toutes les fonctions définies
const ui = { tab: 'today', filter: 'actifs', q: '', thread: null, sim: null, typing: null, dlg: null };

function load() {
  try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch (e) { /* stockage indisponible */ }
  return seed();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignoré */ } }

function seed() {
  const shop = { name: 'Pressing Étoile', address: 'Rue du Commerce, quartier Tokoin, Lomé', hours: 'du lundi au samedi, de 7h30 à 19h30', auto: true };
  const tariffs = [['Chemise', 500], ['Pantalon', 600], ['Costume 2 pièces', 2500], ['Robe', 1000], ['Boubou', 1500], ['Drap', 1200], ['Couette', 2500]]
    .map(([name, price], i) => ({ id: 't' + i, name, price }));
  const price = n => tariffs.find(t => t.name === n).price;
  const items = list => list.map(([name, qty]) => ({ name, qty, price: price(name) }));
  const h = 3600e3, now = Date.now();
  const defs = [
    ['P-001', '22890112233', 'Kossi Mensah', items([['Chemise', 4], ['Pantalon', 2]]), addDays(0), 'prêt', 1000, 5],
    ['P-002', '22891445566', 'Ama Lawson', items([['Costume 2 pièces', 1], ['Robe', 2]]), addDays(1), 'en cours', 2000, 3],
    ['P-003', '22899887766', 'Yao Agbodjan', items([['Drap', 3], ['Couette', 1]]), addDays(-1), 'en cours', 2000, 30],
    ['P-004', '22892001122', 'Esso Tchalla', items([['Boubou', 2]]), addDays(0), 'déposé', 500, 1]
  ];
  const state = { shop, staff: ['Afi', 'Koffi'], me: 'Afi', tariffs, tickets: [], payments: [], msgs: [], convs: {}, seq: 5 };
  S = state; // les générateurs de texte lisent S
  defs.forEach(([id, phone, name, its, due, status, dep, age]) => {
    const t = { id, phone, name, items: its, due, status, created: now - age * h, by: 'Afi' };
    state.tickets.push(t);
    state.payments.push({ ticket: id, ts: now - age * h, amount: dep, method: 'Espèces', kind: 'acompte' });
    state.convs[phone] = { name, needsHuman: false, unread: 0 };
    state.msgs.push({ id: uid(), phone, from: 'template', by: '', text: txtDeposit(t), ts: now - age * h });
    if (status === 'prêt') state.msgs.push({ id: uid(), phone, from: 'template', by: '', text: txtReady(t), ts: now - 0.4 * h });
  });
  return state;
}

/* ============ Règles métier ============ */
const ticketTotal = t => t.items.reduce((a, i) => a + i.qty * i.price, 0);
const paidOf = t => S.payments.filter(p => p.ticket === t.id).reduce((a, p) => a + p.amount, 0);
const restOf = t => Math.max(0, ticketTotal(t) - paidOf(t));
const itemsText = t => t.items.map(i => i.qty + ' ' + i.name.toLowerCase()).join(', ');
const findTicket = id => S.tickets.find(t => t.id === id);
const cname = phone => (S.convs[phone] && S.convs[phone].name) || showPhone(phone);
const conv = phone => S.convs[phone] || (S.convs[phone] = { name: '', needsHuman: false, unread: 0 });
const msgsOf = phone => S.msgs.filter(m => m.phone === phone);

const txtDeposit = t => `Bonjour ${t.name}, votre dépôt ${t.id} est enregistré chez ${S.shop.name} : ${itemsText(t)}. Total ${F(ticketTotal(t))}, acompte reçu ${F(paidOf(t))}. Retrait prévu ${dateFR(t.due)}.`;
const txtReady = t => `Bonjour ${t.name}, votre linge (ticket ${t.id}) est prêt. ${restOf(t) > 0 ? 'Reste à payer : ' + F(restOf(t)) + '.' : 'Tout est déjà réglé.'} Nous sommes ouverts ${S.shop.hours}.`;
const txtDone = t => `Merci ${t.name}, le retrait du ticket ${t.id} est confirmé. À bientôt chez ${S.shop.name}.`;

function addMsg(phone, from, text, by) {
  S.msgs.push({ id: uid(), phone, from, by: by || '', text, ts: Date.now() });
  if (from === 'client') conv(phone).unread = (conv(phone).unread || 0) + 1;
  save();
}

function createTicket({ name, phone, items, deposit, due, method }) {
  const id = 'P-' + String(S.seq++).padStart(3, '0');
  const t = { id, phone, name, items, due, status: 'déposé', created: Date.now(), by: S.me };
  S.tickets.push(t);
  if (deposit > 0) S.payments.push({ ticket: id, ts: Date.now(), amount: deposit, method, kind: 'acompte' });
  const c = conv(phone); if (!c.name) c.name = name;
  addMsg(phone, 'template', txtDeposit(t));
  save();
  return t;
}

function advance(id, method) {
  const t = findTicket(id), n = NEXT[t.status];
  if (!n) return;
  t.status = n[0];
  if (t.status === 'prêt') addMsg(t.phone, 'template', txtReady(t));
  if (t.status === 'retiré') {
    const r = restOf(t);
    if (r > 0) S.payments.push({ ticket: id, ts: Date.now(), amount: r, method: method || 'Espèces', kind: 'solde' });
    addMsg(t.phone, 'template', txtDone(t));
  }
  save();
}

/* ---- Réponses automatiques (règles simples dans la maquette ; l'IA viendra à l'étape 6) ---- */
function statusLine(t) {
  if (t.status === 'prêt') return `${t.id} : prêt. ${restOf(t) > 0 ? 'Reste à payer : ' + F(restOf(t)) + '.' : 'Déjà réglé.'}`;
  if (t.status === 'en cours') return `${t.id} : en cours de traitement. Retrait prévu ${dateFR(t.due)}.`;
  return `${t.id} : bien reçu, le traitement n'a pas encore commencé. Retrait prévu ${dateFR(t.due)}.`;
}
function answer(phone, text) {
  const t = norm(text);
  const shop = S.shop;
  const num = t.match(/\bp-?0*(\d{1,4})\b/);
  if (/(pret|ticket|linge|habit|vetement|ou en est|termine|recuper)/.test(t) || num) {
    let mine = S.tickets.filter(x => x.phone === phone && x.status !== 'retiré');
    if (num) {
      const asked = S.tickets.find(x => Number(x.id.slice(2)) === Number(num[1]));
      if (asked && asked.phone === phone) mine = [asked];
      else if (asked) return { text: `Je ne trouve pas ce ticket avec votre numéro. Un employé de ${shop.name} va vérifier avec vous.`, handoff: true };
    }
    if (!mine.length) return { text: `Je ne trouve aucun dépôt en cours avec ce numéro. Pouvez-vous m'indiquer votre numéro de ticket (par exemple P-004) ?` };
    mine.sort((a, b) => b.created - a.created);
    return { text: (mine.length > 1 ? `Vous avez ${mine.length} dépôts en cours :\n` : '') + mine.slice(0, 3).map(statusLine).join('\n') };
  }
  if (/(tarif|prix|combien|cout)/.test(t))
    return { text: 'Nos tarifs :\n' + S.tariffs.map(x => `• ${x.name} : ${F(x.price)}`).join('\n') };
  if (/(ou etes|adresse|situe|localis|ou se trouve|trouver)/.test(t))
    return { text: `Nous sommes à : ${shop.address}.` };
  if (/(heure|horaire|ouvert|ouvre|ferme)/.test(t))
    return { text: `Nous sommes ouverts ${shop.hours}.` };
  if (/^(bonjour|bonsoir|salut|coucou|hello)/.test(t))
    return { text: `Bonjour, bienvenue chez ${shop.name}. Vous pouvez me demander nos tarifs, nos horaires, notre adresse, ou où en est votre linge.` };
  return { text: `Merci pour votre message. Je ne peux pas répondre à cette question : un employé de ${shop.name} vous répond dès que possible.`, handoff: true };
}
function respond(phone, text) {
  if (!S.shop.auto) { conv(phone).needsHuman = true; save(); render(); return; }
  const out = answer(phone, text);
  ui.typing = phone; render();
  setTimeout(() => {
    ui.typing = null;
    addMsg(phone, 'auto', out.text);
    if (out.handoff) conv(phone).needsHuman = true;
    save(); render();
  }, 900);
}

/* ============ Vues : gérant ============ */
const ICON = {
  today: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2L10 21h4l.6-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/>',
  sim: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>'
};
const ic = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

function unreadTotal() { return Object.values(S.convs).reduce((a, c) => a + (c.unread || 0), 0); }

function renderTabs() {
  const tabs = [['today', 'Aujourd’hui', 'today'], ['tickets', 'Dépôts', 'list'], ['messages', 'Messages', 'chat'], ['settings', 'Réglages', 'gear'], ['sim', 'Client', 'sim']];
  const u = unreadTotal();
  $('#tabs').innerHTML = tabs.map(([k, label, icon]) =>
    `<button class="tab" data-act="tab" data-v="${k}" data-tab="${k}" ${ui.tab === k ? 'aria-current="page"' : ''}>${ic(icon)}<span>${label}</span>${k === 'messages' && u ? `<span class="badge">${u}</span>` : ''}</button>`).join('');
}

function ticketCard(t) {
  const T = todayISO(), r = restOf(t);
  const late = t.status !== 'retiré' && t.due < T;
  const dueLbl = t.due === T ? 'Aujourd’hui' : late ? `En retard · ${dateShort(t.due)}` : dateShort(t.due);
  return `<button class="tk" data-act="open" data-id="${t.id}">
    <div class="tk-h"><b>${t.id}</b><span class="chip ${sCls(t.status)}">${t.status}</span></div>
    <div class="tk-n">${esc(t.name)}</div>
    <div class="tk-i">${esc(itemsText(t))}</div>
    <div class="tk-f"><span class="${late ? 'late' : ''}">${dueLbl}</span><span>${r > 0 ? 'Reste ' + F(r) : 'Réglé'}</span></div>
  </button>`;
}
const section = (title, arr) => arr.length ? `<section class="sec"><h2>${title}</h2><div class="list">${arr.map(ticketCard).join('')}</div></section>` : '';

function vToday() {
  const T = todayISO();
  const act = S.tickets.filter(t => t.status !== 'retiré');
  const late = act.filter(t => t.due < T), dueToday = act.filter(t => t.due === T), ready = act.filter(t => t.status === 'prêt');
  const pays = S.payments.filter(p => iso(p.ts) === T);
  const sum = pays.reduce((a, p) => a + p.amount, 0);
  const by = m => pays.filter(p => p.method === m).reduce((a, p) => a + p.amount, 0);
  const detail = METHODS.filter(m => by(m)).map(m => `${m} ${F(by(m))}`).join(' · ') || 'Aucun encaissement';
  const body = section('En retard', late) + section('À rendre aujourd’hui', dueToday.filter(t => t.due === T)) + section('Prêts à retirer', ready.filter(t => t.due !== T));
  return `<div class="stats">
    <div class="stat"><b>${dueToday.length}</b><span>À rendre aujourd’hui</span></div>
    <div class="stat ${late.length ? 'warn' : ''}"><b>${late.length}</b><span>En retard</span></div>
    <div class="stat"><b>${ready.length}</b><span>Prêts à retirer</span></div>
    <div class="stat"><b>${act.length}</b><span>Dépôts en cours</span></div>
    <div class="stat wide"><b>${F(sum)}</b><span>Recette du jour · ${detail}</span></div>
  </div>${body || '<p class="empty">Rien à rendre pour le moment.</p>'}<button class="fab" data-act="new">+ Nouveau dépôt</button>`;
}

function vTickets() {
  const q = norm(ui.q.trim());
  let arr = S.tickets.slice().sort((a, b) => b.created - a.created);
  if (ui.filter === 'actifs') arr = arr.filter(t => t.status !== 'retiré');
  if (ui.filter === 'retires') arr = arr.filter(t => t.status === 'retiré');
  if (q) arr = arr.filter(t => norm(t.id + ' ' + t.name + ' ' + t.phone).includes(q.replace(/\s/g, '')) || norm(t.name).includes(q));
  const seg = [['actifs', 'En cours'], ['tous', 'Tous'], ['retires', 'Retirés']].map(([k, l]) => `<button data-act="filter" data-v="${k}" aria-pressed="${ui.filter === k}">${l}</button>`).join('');
  return `<input class="search" id="q" type="search" placeholder="Rechercher : nom, téléphone, n° de ticket" value="${esc(ui.q)}" autocomplete="off">
    <div class="seg">${seg}</div>
    <div class="list">${arr.map(ticketCard).join('') || '<p class="empty">Aucun dépôt.</p>'}</div>
    <button class="fab" data-act="new">+ Nouveau dépôt</button>`;
}

function bubble(m, perspective) {
  const mine = perspective === 'client' ? m.from === 'client' : m.from !== 'client';
  let tag = '';
  if (perspective === 'manager') {
    if (m.from === 'auto') tag = '<span class="tag">Réponse automatique</span>';
    if (m.from === 'template') tag = '<span class="tag">Message automatique</span>';
    if (m.from === 'staff') tag = `<span class="tag">${esc(m.by)}</span>`;
  } else if (m.from === 'staff') tag = `<span class="tag">${esc(m.by)}</span>`;
  return `<div class="msg ${mine ? 'me' : ''}">${tag}${esc(m.text)}<small>${timeFR(m.ts)}</small></div>`;
}

function vMessages() {
  const sw = `<label class="toggle"><span>Réponses automatiques<small>${S.shop.auto ? 'Activées : le robot répond, vous reprenez la main quand vous voulez.' : 'Désactivées : tous les messages vous attendent.'}</small></span><span class="sw"><input type="checkbox" data-set="auto" ${S.shop.auto ? 'checked' : ''} aria-label="Réponses automatiques"><i></i></span></label>`;
  if (ui.thread) {
    const p = ui.thread, c = conv(p);
    return `<div class="thread-h"><button class="back" data-act="back" aria-label="Retour">←</button><div><b>${esc(cname(p))}</b><div class="note">${showPhone(p)}</div></div></div>
      ${c.needsHuman ? '<p class="note"><span class="flag">À traiter</span> Le robot n’a pas su répondre.</p>' : ''}
      <div class="chat" id="mchat" style="max-height:52dvh;min-height:240px">${msgsOf(p).map(m => bubble(m, 'manager')).join('')}</div>
      <form class="composer" id="staffForm"><input id="staffInput" placeholder="Répondre en tant que ${esc(S.me)}" autocomplete="off"><button class="btn" type="submit">Envoyer</button></form>`;
  }
  const list = Object.keys(S.convs).map(p => ({ p, last: msgsOf(p).slice(-1)[0] })).filter(x => x.last).sort((a, b) => b.last.ts - a.last.ts);
  return sw + `<div class="list">${list.map(({ p, last }) => {
    const c = S.convs[p];
    return `<button class="conv" data-act="thread" data-phone="${p}"><span class="avatar">${esc(initials(cname(p)))}</span>
      <span class="conv-b"><div><b>${esc(cname(p))}</b><time>${timeFR(last.ts)}</time></div><p>${esc(last.text.replace(/\n/g, ' '))}</p>${c.needsHuman ? '<span class="flag">À traiter</span>' : ''}</span>
      ${c.unread ? `<span class="unread">${c.unread}</span>` : ''}</button>`;
  }).join('') || '<p class="empty">Aucune conversation.</p>'}</div>`;
}

function vSettings() {
  return `<div class="card"><h3>Votre pressing</h3>
      <div class="field"><label for="s-name">Nom</label><input id="s-name" data-set="name" value="${esc(S.shop.name)}"></div>
      <div class="field"><label for="s-addr">Adresse</label><input id="s-addr" data-set="address" value="${esc(S.shop.address)}"></div>
      <div class="field"><label for="s-hours">Horaires</label><input id="s-hours" data-set="hours" value="${esc(S.shop.hours)}"></div>
      <div class="field"><label for="s-me">Connecté en tant que</label><select id="s-me" data-set="me">${S.staff.map(n => `<option ${n === S.me ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
    </div>
    <div class="card"><h3>Tarifs</h3>
      <p class="note">Prix d’exemple, à remplacer par ceux du pressing. Le robot les envoie aux clients qui demandent « combien ».</p>
      ${S.tariffs.map(t => `<div class="trow"><input data-tid="${t.id}" data-f="name" value="${esc(t.name)}" aria-label="Article"><input data-tid="${t.id}" data-f="price" type="number" min="0" step="50" inputmode="numeric" value="${t.price}" aria-label="Prix en francs"><button class="x" data-act="deltar" data-id="${t.id}" aria-label="Supprimer">✕</button></div>`).join('')}
      <button class="btn ghost" data-act="addtr">Ajouter un article</button>
    </div>
    <div class="card"><h3>Démonstration</h3>
      <p class="note">Les données restent sur cet appareil. Rien n’est envoyé sur WhatsApp : la colonne « Client » simule le téléphone du client.</p>
      <button class="btn danger" data-act="reset">Remettre les données d’exemple</button></div>`;
}

/* ============ Vue : WhatsApp du client (simulé) ============ */
function renderSim() {
  if (!ui.sim || (!S.convs[ui.sim] && ui.sim !== UNKNOWN)) ui.sim = Object.keys(S.convs)[0] || UNKNOWN;
  const phones = Object.keys(S.convs).filter(p => p !== UNKNOWN);
  const opts = phones.map(p => `<option value="${p}" ${p === ui.sim ? 'selected' : ''}>${esc(cname(p))} (${showPhone(p)})</option>`).join('')
    + `<option value="${UNKNOWN}" ${ui.sim === UNKNOWN ? 'selected' : ''}>Nouveau client (numéro inconnu)</option>`;
  const chips = ['Bonjour', 'Mon linge est prêt ?', 'Quels sont vos tarifs ?', 'Vous ouvrez à quelle heure ?', 'Où êtes-vous ?', 'Je veux un devis pour 3 chemises'];
  const msgs = msgsOf(ui.sim);
  $('#sim').innerHTML = `<div class="sim-top"><div class="who"><span class="avatar">${esc(initials(S.shop.name))}</span><div><b>${esc(S.shop.name)}</b><small>${S.shop.auto ? 'compte professionnel · répond automatiquement' : 'compte professionnel'}</small></div></div>
      <div><label for="simWho">Je suis le client</label><select id="simWho">${opts}</select></div></div>
    <div class="chat" id="schat"><span class="sim-banner">Simulation du WhatsApp du client</span>${msgs.map(m => bubble(m, 'client')).join('')}${ui.typing === ui.sim ? '<div class="typing">écrit…</div>' : ''}</div>
    <div class="sim-bar"><div class="chips">${chips.map(c => `<button data-act="chip" data-text="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <form class="composer" id="simForm"><input id="simInput" placeholder="Écrire un message" autocomplete="off"><button class="btn" type="submit">Envoyer</button></form></div>`;
}

/* ============ Fenêtres ============ */
function dlgNew() {
  return `<form class="dlg" id="newForm" novalidate>
    <div class="dlg-h"><h2>Nouveau dépôt</h2><button type="button" class="back" data-act="close" aria-label="Fermer">✕</button></div>
    <div class="dlg-b">
      <div class="row2"><div class="field"><label for="n-name">Nom du client</label><input id="n-name" name="name" autocomplete="off"></div>
        <div class="field"><label for="n-phone">Téléphone (8 chiffres)</label><input id="n-phone" name="phone" inputmode="tel" placeholder="90 11 22 33" autocomplete="off"></div></div>
      <div class="card" style="padding:4px 14px">${S.tariffs.map(t => `<div class="step"><div>${esc(t.name)}<br><small>${F(t.price)}</small></div>
        <div class="qty"><button type="button" data-act="step" data-id="${t.id}" data-d="-1" aria-label="Moins">−</button><output id="q-${t.id}" data-price="${t.price}" data-name="${esc(t.name)}">0</output><button type="button" data-act="step" data-id="${t.id}" data-d="1" aria-label="Plus">+</button></div></div>`).join('')}</div>
      <div class="total"><span>Total</span><span id="n-total">0 F</span></div>
      <div class="row2"><div class="field"><label for="n-dep">Acompte reçu (F)</label><input id="n-dep" name="deposit" type="number" min="0" step="50" inputmode="numeric" value="0"></div>
        <div class="field"><label for="n-met">Payé par</label><select id="n-met" name="method">${METHODS.map(m => `<option>${m}</option>`).join('')}</select></div></div>
      <div class="field"><label for="n-due">Retrait prévu le</label><input id="n-due" name="due" type="date" value="${addDays(2)}" min="${todayISO()}"></div>
      <div class="err" id="n-err" role="alert"></div>
    </div>
    <div class="dlg-f"><button class="btn block" type="submit">Enregistrer et prévenir le client</button><p class="note" style="text-align:center">Le client reçoit le récapitulatif sur WhatsApp.</p></div>
  </form>`;
}

function dlgTicket(t) {
  const r = restOf(t), n = NEXT[t.status], idx = STATUS.indexOf(t.status);
  const pays = S.payments.filter(p => p.ticket === t.id);
  return `<div class="dlg"><div class="dlg-h"><h2>${t.id} · ${esc(t.name)}</h2><button class="back" data-act="close" aria-label="Fermer">✕</button></div>
    <div class="dlg-b">
      <div class="prog" aria-hidden="true">${STATUS.map((s, i) => `<i class="${i <= idx ? 'on' : ''}"></i>`).join('')}</div>
      <div><span class="chip ${sCls(t.status)}">${t.status}</span> <span class="note">${showPhone(t.phone)}</span></div>
      <div class="card" style="gap:2px">${t.items.map(i => `<div class="kv"><span>${i.qty} × ${esc(i.name)}</span><span>${F(i.qty * i.price)}</span></div>`).join('')}
        <div class="kv" style="border-top:1px solid var(--line);margin-top:6px;padding-top:8px"><b>Total</b><b>${F(ticketTotal(t))}</b></div>
        ${pays.map(p => `<div class="kv"><span>${p.kind === 'acompte' ? 'Acompte' : 'Solde'} · ${p.method}</span><span>− ${F(p.amount)}</span></div>`).join('')}
        <div class="kv"><b>Reste à payer</b><b>${F(r)}</b></div></div>
      <div class="kv"><span>Retrait prévu</span><span>${dateFR(t.due)}</span></div>
      ${n && n[0] === 'retiré' && r > 0 ? `<div class="field"><label for="d-met">Solde encaissé par</label><select id="d-met">${METHODS.map(m => `<option>${m}</option>`).join('')}</select></div>` : ''}
    </div>
    <div class="dlg-f">${n ? `<button class="btn block" data-act="advance" data-id="${t.id}">${n[1]}${n[0] === 'retiré' && r > 0 ? ' (encaisser ' + F(r) + ')' : ''}</button>` : '<p class="note" style="text-align:center">Dépôt terminé.</p>'}
      <button class="btn ghost block" data-act="chat" data-phone="${t.phone}">Ouvrir la conversation</button></div></div>`;
}

function openDlg(kind, id) {
  ui.dlg = { kind, id };
  const d = $('#dlg');
  d.innerHTML = kind === 'new' ? dlgNew() : dlgTicket(findTicket(id));
  if (!d.open) d.showModal();
  if (kind === 'new') setTimeout(() => $('#n-name') && $('#n-name').focus(), 30);
}
function closeDlg() { ui.dlg = null; const d = $('#dlg'); if (d.open) d.close(); }
function refreshDlg() {
  if (ui.dlg && ui.dlg.kind === 'ticket') { const t = findTicket(ui.dlg.id); if (t) $('#dlg').innerHTML = dlgTicket(t); }
}

function recalcTotal() {
  let tot = 0;
  document.querySelectorAll('#newForm output').forEach(o => { tot += Number(o.textContent) * Number(o.dataset.price); });
  $('#n-total').textContent = F(tot);
  return tot;
}

/* ============ Rendu ============ */
function render() {
  const desktop = matchMedia('(min-width:980px)').matches;
  if (desktop && ui.tab === 'sim') ui.tab = 'today';
  $('#shell').dataset.tab = ui.tab;
  const a = document.activeElement, keep = a && a.id && ['staffInput', 'simInput', 'q'].includes(a.id) ? { id: a.id, v: a.value, s: a.selectionStart } : null;
  $('#top').innerHTML = `<h1>${esc(S.shop.name)}</h1><small>Maquette · messages simulés</small>`;
  renderTabs();
  const v = { today: vToday, tickets: vTickets, messages: vMessages, settings: vSettings }[ui.tab];
  if (v) $('#view').innerHTML = v();
  renderSim();
  refreshDlg();
  if (keep) { const el = document.getElementById(keep.id); if (el) { el.value = keep.v; el.focus(); try { el.setSelectionRange(keep.s, keep.s); } catch (e) { /* ignoré */ } } }
  ['mchat', 'schat'].forEach(id => { const c = document.getElementById(id); if (c) c.scrollTop = c.scrollHeight; });
}

/* ============ Événements ============ */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'tab') { ui.tab = el.dataset.v; if (ui.tab !== 'messages') ui.thread = null; render(); window.scrollTo(0, 0); }
  else if (act === 'filter') { ui.filter = el.dataset.v; render(); }
  else if (act === 'new') openDlg('new');
  else if (act === 'open') openDlg('ticket', el.dataset.id);
  else if (act === 'close') closeDlg();
  else if (act === 'step') {
    const o = $('#q-' + el.dataset.id); o.textContent = Math.max(0, Number(o.textContent) + Number(el.dataset.d)); recalcTotal();
  }
  else if (act === 'advance') {
    const m = $('#d-met'); advance(el.dataset.id, m ? m.value : undefined); render();
  }
  else if (act === 'chat' || act === 'thread') {
    const p = el.dataset.phone; closeDlg(); ui.tab = 'messages'; ui.thread = p; conv(p).unread = 0; save(); render();
  }
  else if (act === 'back') { ui.thread = null; render(); }
  else if (act === 'chip') { clientSend(el.dataset.text); }
  else if (act === 'addtr') { S.tariffs.push({ id: 't' + uid(), name: 'Nouvel article', price: 500 }); save(); render(); }
  else if (act === 'deltar') { S.tariffs = S.tariffs.filter(t => t.id !== el.dataset.id); save(); render(); }
  else if (act === 'reset') {
    if (confirm('Remettre les données d’exemple ? Vos dépôts et messages de test seront effacés.')) { S = seed(); save(); ui.thread = null; ui.sim = null; render(); }
  }
});

document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'staffForm') {
    const inp = $('#staffInput'), text = inp.value.trim(); if (!text) return;
    addMsg(ui.thread, 'staff', text, S.me); conv(ui.thread).needsHuman = false; save(); render();
  } else if (e.target.id === 'simForm') {
    const inp = $('#simInput'), text = inp.value.trim(); if (!text) return;
    clientSend(text);
  } else if (e.target.id === 'newForm') {
    const f = e.target, err = $('#n-err');
    const name = f.name.value.trim(), phone = normPhone(f.phone.value);
    const items = [...f.querySelectorAll('output')].filter(o => Number(o.textContent) > 0).map(o => ({ name: o.dataset.name, qty: Number(o.textContent), price: Number(o.dataset.price) }));
    const total = items.reduce((a, i) => a + i.qty * i.price, 0), deposit = Math.max(0, Number(f.deposit.value) || 0);
    if (!name) { err.textContent = 'Indiquez le nom du client.'; return; }
    if (phone.length !== 11) { err.textContent = 'Le numéro doit avoir 8 chiffres.'; return; }
    if (!items.length) { err.textContent = 'Ajoutez au moins un article.'; return; }
    if (deposit > total) { err.textContent = 'L’acompte dépasse le total.'; return; }
    const t = createTicket({ name, phone, items, deposit, due: f.due.value || addDays(2), method: f.method.value });
    closeDlg(); ui.tab = 'tickets'; ui.filter = 'actifs'; ui.q = ''; render();
  }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'q') { ui.q = t.value; render(); }
  if (t.id === 'n-phone') {
    const p = normPhone(t.value), nm = $('#n-name');
    if (p.length === 11 && S.convs[p] && S.convs[p].name && nm && !nm.value.trim()) nm.value = S.convs[p].name;
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'simWho') { ui.sim = t.value; ui.typing = null; render(); return; }
  if (t.dataset.set) {
    const k = t.dataset.set;
    if (k === 'auto') S.shop.auto = t.checked;
    else if (k === 'me') S.me = t.value;
    else S.shop[k] = t.value.trim() || S.shop[k];
    save(); render();
  } else if (t.dataset.tid) {
    const tr = S.tariffs.find(x => x.id === t.dataset.tid); if (!tr) return;
    if (t.dataset.f === 'name') tr.name = t.value.trim() || tr.name; else tr.price = Math.max(0, Number(t.value) || 0);
    save(); render();
  }
});

$('#dlg').addEventListener('close', () => { ui.dlg = null; });
$('#dlg').addEventListener('click', e => { if (e.target.id === 'dlg') closeDlg(); });
matchMedia('(min-width:980px)').addEventListener('change', render);

function clientSend(text) {
  const phone = ui.sim; if (!phone) return;
  if (phone === UNKNOWN) conv(phone);
  addMsg(phone, 'client', text);
  render();
  respond(phone, text);
}

S = load();
render();
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => { });
})();
