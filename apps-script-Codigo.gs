/**************************************************************
 * FINANCEIRO - ETAPA 2
 * Novo: ajuste de saldo, previstos (a receber / a pagar), comprovantes
 * no Drive com leitura automática (OCR grátis), auditoria/edição.
 *
 * Propriedades do script (Configurações do projeto):
 *   TELEGRAM_TOKEN, MEU_CHAT_ID, CHAVE_API, SEGREDO_WEBHOOK, URL_EXEC,
 *   CARTEIRA_PADRAO (opcional), PASTA_ID (opcional: pasta do Drive p/ comprovantes)
 * Para a leitura automática: Serviços (+) > "Drive API" > Adicionar.
 **************************************************************/
const PROP_ = k => (PropertiesService.getScriptProperties().getProperty(k) || '').trim();
const TELEGRAM_TOKEN  = PROP_('TELEGRAM_TOKEN');
const MEU_CHAT_ID     = PROP_('MEU_CHAT_ID');
const CHAVE_API       = PROP_('CHAVE_API');
const SEGREDO_WEBHOOK = PROP_('SEGREDO_WEBHOOK');
const CARTEIRA_PADRAO = PROP_('CARTEIRA_PADRAO') || 'Pix';

const TZ = 'America/Fortaleza';
const CATEGORIAS = ['Mercado','Comida','Transporte','Casa','Lazer','Saúde','Contas','Eletrônicos','Roupas','Educação','Outros'];
const PADRAO = {mercado:'Mercado',supermercado:'Mercado',feira:'Mercado',uber:'Transporte',onibus:'Transporte',
  gasolina:'Transporte',combustivel:'Transporte',ifood:'Comida',lanche:'Comida',almoco:'Comida',jantar:'Comida',
  padaria:'Comida',aluguel:'Casa',luz:'Contas',agua:'Contas',internet:'Contas',netflix:'Contas',farmacia:'Saúde',
  remedio:'Saúde',cinema:'Lazer',bar:'Lazer',salario:'Receita',freela:'Receita',
  kindle:'Eletrônicos',fone:'Eletrônicos',celular:'Eletrônicos',notebook:'Eletrônicos',tv:'Eletrônicos',tablet:'Eletrônicos',
  mouse:'Eletrônicos',teclado:'Eletrônicos',monitor:'Eletrônicos',carregador:'Eletrônicos',camisa:'Roupas',tenis:'Roupas',
  calca:'Roupas',vestido:'Roupas',curso:'Educação',livro:'Educação',faculdade:'Educação',escola:'Educação'};
// colunas: 0 id | 1 data | 2 tipo | 3 valor | 4 categoria | 5 descricao | 6 carteira | 7 destino | 8 grupo
//          9 n | 10 total | 11 atualizado | 12 excluido | 13 comprovante | 14 previsto | 15 imagem
const H = ['id','data','tipo','valor','categoria','descricao','carteira','destino','grupo','n','total','atualizado','excluido','comprovante','previsto','imagem'];
const NC = H.length;
const VERSAO = 4;   // o app confere isto para avisar quando o código do Apps Script está desatualizado

/* ---------- INSTALAÇÃO ---------- */
function instalar() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TZ);
  mk_(ss, 'Lancamentos', H);
  mk_(ss, 'Carteiras', ['nome', 'saldo_inicial'], [['Pix', 0], ['Dinheiro', 0]]);
  mk_(ss, 'Aprendido', ['palavra', 'categoria']);
  mk_(ss, 'Orcamentos', ['categoria', 'limite']);
  mk_(ss, 'Recorrentes', ['descricao', 'valor', 'tipo(S/E)', 'categoria', 'carteira', 'dia', 'ultimo_mes']);
  corrigir();
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('diario').timeBased().everyDays(1).atHour(6).create();
  Logger.log('Planilha pronta.');
}
// RODE UMA VEZ depois de colar este código: cria as colunas novas, a pasta de comprovantes
// e pede as permissões do Drive/Documentos.
function atualizar() {
  lanc_();
  corrigir();
  const f = pasta_();   // (o consentimento pede Drive e Documentos, usados no comprovante)
  Logger.log('Pronto. Pasta de comprovantes: ' + f.getUrl());
}
// Força ID e data como texto (evita o Sheets transformar em número/data)
function corrigir() {
  const s = lanc_();
  s.getRange('A:B').setNumberFormat('@');
  s.getRange('N:N').setNumberFormat('@');
  sh_('Recorrentes').getRange('G:G').setNumberFormat('@');
  Logger.log('Formatos corrigidos.');
}
function ativarBot() {
  // Se existir URL_WORKER (Cloudflare), o Telegram fala com ele; senão, direto com o Apps Script
  const base = PROP_('URL_WORKER') || PROP_('URL_EXEC');
  if (!TELEGRAM_TOKEN) throw new Error('TELEGRAM_TOKEN não encontrado nas propriedades.');
  if (!/^https:\/\//.test(base)) throw new Error('Crie a propriedade URL_WORKER (ou URL_EXEC) com o link https.');
  const r = UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/setWebhook?drop_pending_updates=true&url=' +
    encodeURIComponent(base + '?s=' + SEGREDO_WEBHOOK), { muteHttpExceptions: true });
  Logger.log(r.getContentText());
}
function diagnostico() {
  Logger.log(UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/getWebhookInfo', { muteHttpExceptions: true }).getContentText());
}
function mk_(ss, n, h, seed) {
  if (ss.getSheetByName(n)) return;
  const s = ss.insertSheet(n); s.appendRow(h); s.setFrozenRows(1);
  if (seed) s.getRange(2, 1, seed.length, seed[0].length).setValues(seed);
}

/* ---------- UTILIDADES ---------- */
const sh_ = n => SpreadsheetApp.getActive().getSheetByName(n);
// Aba de lançamentos; cria as colunas novas (comprovante, previsto) se ainda não existirem
function lanc_() {
  const s = sh_('Lancamentos');
  if (s.getMaxColumns() < NC) s.insertColumnsAfter(s.getMaxColumns(), NC - s.getMaxColumns());
  if (S_(s.getRange(1, NC).getValue()) !== H[NC - 1]) {
    s.getRange(1, 1, 1, NC).setValues([H]);
    s.getRange('N:N').setNumberFormat('@');
    s.getRange('O:O').setNumberFormat('0');
    s.getRange('P:P').setNumberFormat('@');
  }
  return s;
}
const uid_ = () => 'x' + Utilities.getUuid().replace(/-/g, '').slice(0, 7);   // sempre começa com letra
const S_ = v => String(v == null ? '' : v).trim();
const hoje_ = () => Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
const d_ = v => v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v);
const dt_ = i => S_(i).split('-').reverse().join('/');
const esc_ = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const json_ = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
const prev_ = r => Number(r[14]) === 1;
const ico_ = r => r[2] === 'E' ? '🟢' : r[2] === 'T' ? '🔁' : '🔴';
function R_(v) {
  const n = Math.abs(v).toFixed(2).split('.');
  n[0] = n[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (v < 0 ? '-' : '') + 'R$ ' + n.join(',');
}
function log_(err) {
  try {
    let l = sh_('Log') || SpreadsheetApp.getActive().insertSheet('Log');
    l.appendRow([new Date(), String(err && err.stack || err)]);
  } catch (e) {}
}
function comLock_(fn) {
  const l = LockService.getScriptLock(); l.waitLock(25000);
  try { return fn(); } finally { l.releaseLock(); }
}
function somaMes_(iso, k) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + k, 1));
  const ult = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, ult));
  return t.toISOString().slice(0, 10);
}
function rows_() {
  const s = lanc_(), n = s.getLastRow();
  if (n < 2) return [];
  return s.getRange(2, 1, n - 1, NC).getValues().map(r => { r[0] = S_(r[0]); r[1] = d_(r[1]); r[8] = S_(r[8]); r[13] = S_(r[13]); r[15] = S_(r[15]); return r; });
}
function tabela_(nome, cols) {
  const s = sh_(nome), n = s.getLastRow();
  return n < 2 ? [] : s.getRange(2, 1, n - 1, cols).getValues();
}
const carteiras_ = () => tabela_('Carteiras', 2).filter(r => r[0]).map(r => ({ nome: S_(r[0]), ini: Number(r[1]) || 0 }));
const orc_ = () => tabela_('Orcamentos', 2).filter(r => r[0]).map(r => ({ categoria: S_(r[0]), limite: Number(r[1]) || 0 }));
function upsert_(aba, chave, valores) {
  comLock_(() => {
    const s = sh_(aba), n = s.getLastRow();
    const ks = n < 2 ? [] : s.getRange(2, 1, n - 1, 1).getValues().flat().map(x => S_(x).toLowerCase());
    const i = ks.indexOf(S_(chave).toLowerCase());
    if (i >= 0) s.getRange(i + 2, 1, 1, valores.length).setValues([valores]);
    else s.appendRow(valores);
  });
}
function acharCart_(x) {
  x = norm_(x); if (!x) return null;
  const nomes = carteiras_().map(c => c.nome);
  return nomes.find(n => norm_(n) === x) || (x.length >= 3 ? nomes.find(n => norm_(n).startsWith(x)) : null) || null;
}

/* ---------- ESTADO TEMPORÁRIO (cache) ---------- */
const cache_ = () => CacheService.getScriptCache();
function modo_() { const v = cache_().get('modo'); return v ? JSON.parse(v) : null; }
function setModo_(o) { if (o) cache_().put('modo', JSON.stringify(o), 900); else cache_().remove('modo'); }
const compGet_ = () => cache_().get('comp') || '';
function compSet_(u) { if (u) cache_().put('comp', u, 900); else cache_().remove('comp'); }
const rascGet_ = id => { const v = cache_().get('d' + id); return v ? JSON.parse(v) : null; };
const rascSet_ = (id, d) => cache_().put('d' + id, JSON.stringify(d), 21600);
const rascDel_ = id => cache_().remove('d' + id);

/* ---------- NÚCLEO (idempotente, com trava) ---------- */
function gravar_(list) {
  return comLock_(() => {
    const s = lanc_(), n = s.getLastRow();
    const ids = new Set(n < 2 ? [] : s.getRange(2, 1, n - 1, 1).getValues().flat().map(S_));
    const now = Date.now();
    const novos = list.filter(e => !ids.has(S_(e.id))).map(e => [e.id, e.data, e.tipo, e.valor, e.categoria || 'Outros',
      e.descricao || '', e.carteira, e.destino || '', e.grupo || '', e.n || '', e.total || '', now, 0, e.comprovante || '', e.previsto ? 1 : 0, e.imagem || '']);
    if (novos.length) {
      const falta = n + novos.length - s.getMaxRows();
      if (falta > 0) s.insertRowsAfter(s.getMaxRows(), falta + 200);
      const r = s.getRange(n + 1, 1, novos.length, NC);
      r.setNumberFormat('@');                       // garante texto em tudo...
      r.setValues(novos);
      s.getRange(n + 1, 4, novos.length, 1).setNumberFormat('0.00');   // ...menos o valor
      s.getRange(n + 1, 10, novos.length, 4).setNumberFormat('0');      // n, total, atualizado, excluido
      s.getRange(n + 1, 15, novos.length, 1).setNumberFormat('0');     // previsto
      s.getRange(n + 1, 16, novos.length, 1).setNumberFormat('@');     // imagem (URL)
    }
    return novos.length;
  });
}
// Altera linhas que casam com pred; grava só as colunas necessárias (rápido e seguro)
function mudar_(pred, fn) {
  return comLock_(() => {
    const s = lanc_(), n = s.getLastRow();
    if (n < 2) return 0;
    const r = s.getRange(2, 1, n - 1, NC), v = r.getValues();
    let c = 0; const now = Date.now();
    v.forEach(x => {
      x[0] = S_(x[0]); x[1] = d_(x[1]); x[8] = S_(x[8]); x[13] = S_(x[13]); x[15] = S_(x[15]);
      if (pred(x)) { fn(x); x[11] = now; c++; }
    });
    if (c) r.setValues(v);
    return c;
  });
}
const casa_ = tok => x => x[0] === S_(tok) || (x[8] !== '' && x[8] === S_(tok));
const so_ = id => x => x[0] === S_(id);

function criar_(o) {
  const data = o.data || hoje_(), cart = o.carteira || CARTEIRA_PADRAO, valor = Math.round(Number(o.valor) * 100) / 100;
  if (!(valor > 0) || !o.id) throw new Error('valor/id inválido');
  const base = { tipo: o.tipo, categoria: o.categoria, descricao: o.descricao, carteira: cart, destino: o.destino,
    comprovante: o.comprovante, previsto: o.previsto ? 1 : 0, imagem: S_(o.imagem).slice(0, 500) };
  const n = Number(o.n) || 1, lista = [];
  const pa = Math.floor(Number(o.pAtual) || 0);
  if (o.tipo === 'S' && n > 1 && pa >= 1 && pa <= n) {
    // "3 de 10": valor = de CADA parcela; a atual (pa) cai hoje, as seguintes viram previstos no dia do vencimento
    const dia = Math.min(Math.max(Math.floor(Number(o.dia)) || Number(hoje_().slice(8)), 1), 31), h = hoje_();
    const ref = h.slice(0, 8) + String(dia).padStart(2, '0');          // vencimento deste mês
    const prim = o.previsto ? (S_(o.data) > h ? S_(o.data) : proxDia_(dia)) : ref;
    for (let k = pa; k <= n; k++) {
      const atual = k === pa && !o.previsto;
      lista.push(Object.assign({}, base, { id: o.id + '-' + k, data: atual ? (o.data || h) : somaMes_(prim, k - pa),
        valor: valor, grupo: o.id, n: k, total: n, previsto: atual ? 0 : 1 }));
    }
  } else if (o.tipo === 'S' && n > 1) {
    const p = Math.round(valor / n * 100) / 100;
    for (let i = 0; i < n; i++)
      lista.push(Object.assign({}, base, { id: o.id + '-' + i, data: somaMes_(data, i),
        valor: i === n - 1 ? Math.round((valor - p * (n - 1)) * 100) / 100 : p, grupo: o.id, n: i + 1, total: n }));
  } else lista.push(Object.assign({}, base, { id: o.id, data: data, valor: valor }));
  return gravar_(lista);
}
function adiantar_(desc, qtd) {
  return comLock_(() => {
    const s = lanc_(), N = s.getLastRow();
    if (N < 2) return { c: 0 };
    const r = s.getRange(2, 1, N - 1, NC), v = r.getValues(), h = hoje_(), q = S_(desc).toLowerCase();
    v.forEach(x => { x[0] = S_(x[0]); x[1] = d_(x[1]); x[8] = S_(x[8]); x[13] = S_(x[13]); x[15] = S_(x[15]); });
    const cand = v.filter(x => x[12] != 1 && x[8] && x[2] === 'S' && x[1] > h && S_(x[5]).toLowerCase().includes(q));
    if (!cand.length) return { c: 0 };
    const g = cand[0][8];
    const pick = cand.filter(x => x[8] === g).sort((a, b) => b[1].localeCompare(a[1])).slice(0, Number(qtd) || 1);
    let soma = 0; const now = Date.now();
    pick.forEach(x => { x[1] = h; x[11] = now; soma += Number(x[3]); });
    r.setValues(v);
    return { c: pick.length, soma: soma, nome: pick[0][5] };
  });
}

/* ---------- CÁLCULOS ---------- */
// Previstos NÃO entram no saldo: ficam em "a receber" / "comprometido" até você confirmar.
function saldos_() {
  const h = hoje_(), s = {}; let pS = 0, pE = 0;
  carteiras_().forEach(c => s[c.nome] = c.ini);
  const add = (k, v) => s[k] = (s[k] || 0) + v;
  rows_().forEach(r => {
    if (r[12] == 1) return;
    const t = r[2], v = Number(r[3]);
    if (prev_(r)) { if (t === 'S') pS += v; else if (t === 'E') pE += v; return; }
    if (r[1] > h) { if (t === 'S') pS += v; else if (t === 'E') pE += v; return; }
    if (t === 'E') add(r[6], v); else if (t === 'S') add(r[6], -v);
    else if (t === 'T') { add(r[6], -v); add(r[7], v); }
  });
  return { s: s, total: Object.values(s).reduce((a, b) => a + b, 0), pS: pS, pE: pE };
}
function mes_() {
  const pre = hoje_().slice(0, 7), cat = {}; let e = 0, sd = 0, aj = 0;
  rows_().forEach(r => {
    if (r[12] == 1 || prev_(r) || r[1].slice(0, 7) !== pre) return;
    const v = Number(r[3]);
    if (r[4] === 'Ajuste') { aj += r[2] === 'E' ? v : -v; return; }   // ajustes não contam como receita/gasto
    if (r[2] === 'E') e += v;
    else if (r[2] === 'S') { sd += v; cat[r[4]] = (cat[r[4]] || 0) + v; }
  });
  return { e: e, s: sd, cat: cat, aj: aj };
}
const norm_ = t => S_(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function categoriaPara_(desc) {
  const ws = norm_(desc).split(' ').filter(Boolean);
  const ap = {}; tabela_('Aprendido', 2).forEach(r => ap[norm_(r[0])] = r[1]);
  for (const w of ws) if (ap[w]) return ap[w];
  for (const w of ws) if (PADRAO[w]) return PADRAO[w];
  return null;
}

/* ---------- INTERPRETADOR DE TEXTO ---------- */
function numero_(t) {
  let s = S_(t).replace(/^\+/, '');
  s = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(',', '.');
  const v = parseFloat(s); return isNaN(v) ? null : v;
}
const isNum_ = s => /^-?(R\$\s*)?[\d.,]*\d$/i.test(S_(s));
function num2_(s) {   // aceita negativo e "R$"
  s = S_(s).replace(/^(-?)R\$\s*/i, '$1');
  const neg = s[0] === '-', v = numero_(s.replace(/^-/, ''));
  return v === null ? null : (neg ? -v : v);
}
function parse_(txt) {
  const tk = S_(txt).replace(/\s+/g, ' ').split(' ');
  const nomes = carteiras_().map(c => c.nome);
  const acha = x => (x.length >= 3 || nomes.some(n => n.toLowerCase() === x.toLowerCase()))
    ? nomes.find(n => n.toLowerCase().startsWith(x.toLowerCase())) : null;
  if (tk[0].toLowerCase() === 't') {
    const v = numero_(tk[1] || ''), a = acha(tk[2] || ''), b = acha(tk[3] || '');
    return v && a && b && a !== b ? { tipo: 'T', valor: v, carteira: a, destino: b } : null;
  }
  const p = { tipo: 'S', valor: null, n: 1, carteira: CARTEIRA_PADRAO, descricao: '' }, desc = [];
  let pc = null;
  const tx = ' ' + tk.join(' ') + ' ';
  let m1 = tx.match(/ (\d{1,2}) ?de ?(\d{1,2}) /i) || tx.match(/ (\d{1,2})\/(\d{1,2}) /);
  if (m1 && Number(m1[2]) >= 2 && Number(m1[2]) <= 60 && Number(m1[1]) >= 1 && Number(m1[1]) <= Number(m1[2])) pc = m1;
  if (pc) { p.pAtual = Number(pc[1]); p.n = Number(pc[2]); }
  let tk2 = tk;
  if (pc) {
    const t2 = tx.replace(pc[0], ' ').trim();
    tk2 = t2 ? t2.split(' ') : [];
  }
  const md = (' ' + tk2.join(' ') + ' ').match(/ dia (\d{1,2}) /i);
  if (md) { p.dia = Number(md[1]); tk2 = (' ' + tk2.join(' ') + ' ').replace(md[0], ' ').trim().split(' '); }
  tk2.forEach(w => {
    if (p.valor === null && /^\+?[\d.,]*\d[\d.,]*$/.test(w)) { p.valor = numero_(w); if (w[0] === '+') p.tipo = 'E'; }
    else if (!pc && /^\d{1,2}x$/i.test(w)) p.n = parseInt(w);
    else if (acha(w)) p.carteira = acha(w);
    else desc.push(w);
  });
  p.descricao = desc.join(' ');
  if (!pc) delete p.pAtual;
  return p.valor > 0 ? p : null;
}
// "hoje", "ontem", "28/10", "28/10/26", "28/10/2026" -> yyyy-MM-dd (ou null)
function dataTxt_(s) {
  s = norm_(s); const h = hoje_();
  const [y0, m0, d0] = h.split('-').map(Number);
  if (s === 'hoje') return h;
  if (s === 'ontem') return new Date(Date.UTC(y0, m0 - 1, d0 - 1)).toISOString().slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]); let y = m[3] ? Number(m[3]) : y0;
  if (y < 100) y += 2000;
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return t.toISOString().slice(0, 10);
}
// próximo "dia N" (neste mês se ainda não passou, senão no mês seguinte)
function proxDia_(d) {
  d = Math.min(Math.max(d, 1), 31);
  const h = hoje_(), hd = Number(h.slice(8));
  return somaMes_(h.slice(0, 8) + String(d).padStart(2, '0'), d >= hd ? 0 : 1);
}
// "+500 dia 10 salario" | "300 luz 15/11" | "+200 freela" (sem data = hoje)
function parsePrev_(rest) {
  let t = ' ' + S_(rest).replace(/\s+/g, ' ') + ' ', data = null, m;
  if ((m = t.match(/ dia (\d{1,2}) /i))) {
    const parc = /( \d{1,2}\/\d{1,2} | \d{1,2} ?de ?\d{1,2} )/i.test(t);
    if (parc) { const q = parse_(t.trim()); if (!q || q.tipo === 'T') return null; q.previsto = 1; return q; }
    data = proxDia_(Number(m[1])); t = t.replace(m[0], ' ');
  } else if ((m = t.match(/ (\d{1,2}\/\d{1,2}(?:\/\d{2,4})?) /))) { data = dataTxt_(m[1]); t = t.replace(m[0], ' '); }
  const p = parse_(t.trim());
  if (!p || p.tipo === 'T') return null;
  p.data = data || hoje_(); p.previsto = 1;
  return p;
}

/* ---------- LEITURA DE COMPROVANTE (OCR) ---------- */
function lerComprovante_(txt) {
  if (!txt) return null;
  const t = String(txt).replace(/\r/g, ''), low = norm_(t);
  let v = null, m;
  const re = /R[\$S]\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g, vals = [];
  while ((m = re.exec(t))) vals.push(numero_(m[1]));
  if (vals.length) v = vals[0];
  else if ((m = t.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/))) v = numero_(m[1]);
  if (!(v > 0)) return null;
  // entrada ou saída: vale o termo que aparece primeiro
  const iE = low.search(/voce recebeu|pix recebido|transferencia recebida|recebeu um pix|recebido de|dinheiro recebido|deposito recebido/);
  const iS = low.search(/voce enviou|voce pagou|pix enviado|transferencia enviada|enviou um pix|pagamento|compra|pago|enviado/);
  let tipo = 'S', incerto = false;
  if (iE >= 0 && (iS < 0 || iE < iS)) tipo = 'E'; else if (iS < 0) incerto = true;
  // nome de quem recebeu (saída) ou enviou (entrada)
  const lines = t.split('\n').map(S_).filter(Boolean);
  const lab = tipo === 'E' ? /^(de|origem|remetente|pagador|quem pagou)\b\s*:?\s*(.*)$/ : /^(para|destino|favorecido|recebedor|beneficiario|estabelecimento|loja)\b\s*:?\s*(.*)$/;
  const ign = /^(nome|cpf|cnpj|instituicao|banco|agencia|conta|chave|tipo|ag)\b/;
  let nome = '';
  for (let i = 0; i < lines.length && !nome; i++) {
    const mm = norm_(lines[i]).match(lab);
    if (!mm) continue;
    const cands = [lines[i].slice(lines[i].length - mm[2].length)].concat(lines.slice(i + 1, i + 5));
    for (const c of cands) {
      const s = S_(c).replace(/^nome\s*:?\s*/i, '');
      if (/[a-zA-Z]{3}/.test(s) && !ign.test(norm_(s)) && !/\d{3}/.test(s)) { nome = s; break; }
    }
  }
  // data
  const h = hoje_(); let data = h;
  if ((m = t.match(/(\d{2})\/(\d{2})\/(\d{4})/))) data = m[3] + '-' + m[2] + '-' + m[1];
  else if ((m = low.match(/(\d{1,2})\s*(?:de\s*)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?\s*(?:de\s*)?(\d{4})/))) {
    const mes = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'].indexOf(m[2]) + 1;
    data = m[3] + '-' + String(mes).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  }
  if (isNaN(Date.parse(data)) || data > h) data = h;
  return { valor: v, tipo: tipo, incerto: incerto, desc: nome.toLowerCase().slice(0, 30), data: data, carteira: CARTEIRA_PADRAO };
}
function ocr_(fileId) {
  try {
    if (typeof Drive === 'undefined') return null;     // serviço "Drive API" não ativado
    const blob = DriveApp.getFileById(fileId).getBlob();
    const meta = { mimeType: 'application/vnd.google-apps.document' };
    let doc;
    if (Drive.Files.insert) { meta.title = 'ocr_tmp'; doc = Drive.Files.insert(meta, blob, { ocr: true, ocrLanguage: 'pt' }); }   // Drive API v2
    else { meta.name = 'ocr_tmp'; doc = Drive.Files.create(meta, blob, { ocrLanguage: 'pt' }); }                                   // Drive API v3
    const txt = DocumentApp.openById(doc.id).getBody().getText();
    DriveApp.getFileById(doc.id).setTrashed(true);
    return txt;
  } catch (e) { log_(e); return null; }
}
function pasta_() {
  const id = PROP_('PASTA_ID');
  if (id) return DriveApp.getFolderById(id);
  const it = DriveApp.getFoldersByName('Comprovantes Financeiro');
  const f = it.hasNext() ? it.next() : DriveApp.createFolder('Comprovantes Financeiro');
  PropertiesService.getScriptProperties().setProperty('PASTA_ID', f.getId());
  return f;
}
function baixarTg_(fid) {
  const r = JSON.parse(tg_('getFile', { file_id: fid }).getContentText());
  if (!r.ok) throw new Error('Telegram getFile falhou');
  const p = r.result.file_path, ext = (p.match(/\.(\w+)$/) || [0, 'jpg'])[1];
  const b = UrlFetchApp.fetch('https://api.telegram.org/file/bot' + TELEGRAM_TOKEN + '/' + p).getBlob();
  b.setName(Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd_HHmmss') + '_' + fid.slice(-5) + '.' + ext);
  return b.setContentTypeFromExtension();
}
function salvarDrive_(blob) { const f = pasta_().createFile(blob); return { id: f.getId(), url: f.getUrl() }; }

/* ---------- TELEGRAM ---------- */
function tg_(m, p) {
  const r = UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/' + m,
    { method: 'post', contentType: 'application/json', payload: JSON.stringify(p), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) log_('Telegram ' + m + ' falhou: ' + r.getContentText());
  return r;
}
const msg_ = (chat, texto, markup) => tg_('sendMessage', { chat_id: chat, text: texto, parse_mode: 'HTML', reply_markup: markup || undefined });
const teclado_ = () => ({ keyboard: [
  [{ text: '💰 Quanto' }, { text: '📅 Parcelas' }],
  [{ text: '📊 Mês' }, { text: '↩️ Desfazer' }],
  [{ text: '⚖️ Ajustar' }, { text: '🔮 Previstos' }, { text: '📋 Últimos' }]], resize_keyboard: true, is_persistent: true });
const menu_ = () => ({ inline_keyboard: [[{ text: '💰 Quanto tenho', callback_data: 'k|q' }, { text: '📅 Parcelas', callback_data: 'k|p' }], [{ text: '📊 Mês', callback_data: 'k|m' }, { text: '↩️ Desfazer', callback_data: 'k|d' }]] });
function botoes_(tok, cats) {
  const k = [];
  if (cats) { const b = CATEGORIAS.map((c, i) => ({ text: c, callback_data: 'c|' + tok + '|' + i })); for (let i = 0; i < b.length; i += 4) k.push(b.slice(i, i + 4)); }
  k.push([{ text: '↩️ Desfazer', callback_data: 'u|' + tok }, { text: '🏷 Categoria', callback_data: 'm|' + tok }]);
  return { inline_keyboard: k };
}
function novo_(id) {
  return comLock_(() => {
    const c = CacheService.getScriptCache(), k = 'u' + id;
    if (c.get(k)) return false;
    c.put(k, '1', 21600);
    return true;
  });
}
function telegram_(u) {
  if (!novo_(u.update_id)) return;
  const cb = u.callback_query, m = u.message || u.edited_message;
  const chat = String(cb ? cb.message.chat.id : (m ? m.chat.id : ''));
  if (!chat) return;
  if (!MEU_CHAT_ID) { msg_(chat, 'Seu ID é: <code>' + chat + '</code>\nCole em MEU_CHAT_ID nas propriedades.'); return; }
  if (chat !== MEU_CHAT_ID) { msg_(chat, '⛔ ID não confere. O seu é <code>' + chat + '</code>.'); return; }
  try {
    if (cb) return clique_(cb, chat);
    if (m && (m.photo || m.document)) return foto_(chat, m);
    if (m && m.text) return texto_(chat, m.text);
  } catch (err) { log_(err); msg_(chat, '⚠️ Erro: ' + esc_(err.message)); }
}
function clique_(cb, chat) {
  tg_('answerCallbackQuery', { callback_query_id: cb.id });
  const [a, tok, i] = S_(cb.data).split('|');
  const edita = (t, mk) => tg_('editMessageText', { chat_id: chat, message_id: cb.message.message_id, text: t, parse_mode: 'HTML', reply_markup: mk });
  if (a === 'k') {
    if (tok === 'q') return saldo_(chat);
    if (tok === 'p') return parcelas_(chat);
    if (tok === 'm') return resumoMes_(chat);
    if (tok === 'd') return desfazerUltimo_(chat);
    if (tok === 'l') { const v = viewUltimos_(); return edita(v[0], v[1]); }
    return;
  }
  if (a === 'u') {
    const c = mudar_(casa_(tok), x => x[12] = 1);
    edita(c ? '↩️ Desfeito.' : '⚠️ Não encontrei esse lançamento (já desfeito?).');
  } else if (a === 'm') {
    tg_('editMessageReplyMarkup', { chat_id: chat, message_id: cb.message.message_id, reply_markup: botoes_(tok, true) });
  } else if (a === 'c') {
    const cat = CATEGORIAS[Number(i)]; let desc = '';
    const c = mudar_(casa_(tok), x => { x[4] = cat; desc = x[5]; });
    if (!c) return edita('⚠️ Não encontrei esse lançamento.');
    const w = norm_(desc).split(' ')[0];
    if (w.length >= 2) upsert_('Aprendido', w, [w, cat]);
    edita('🏷 Categoria: <b>' + cat + '</b> ✔ (aprendido)', botoes_(tok, false));
  } else if (a === 'a') {               // escolheu a carteira para ajustar
    const c = carteiras_()[Number(tok)];
    if (!c) return;
    setModo_({ m: 'ajuste', c: c.nome });
    edita('⚖️ Quanto tem <b>de verdade</b> em <b>' + esc_(c.nome) + '</b> agora?\nO bot calcula ' + R_(saldos_().s[c.nome] || 0) + '. Manda só o valor (ex: <code>424,56</code>).');
  } else if (a === 'r') {               // recebi / paguei (confirma previsto)
    const kb = ((cb.message.reply_markup && cb.message.reply_markup.inline_keyboard) || []).filter(row => !row.some(b => b.callback_data === cb.data));
    tg_('editMessageReplyMarkup', { chat_id: chat, message_id: cb.message.message_id, reply_markup: { inline_keyboard: kb } });
    confirmarPrev_(chat, tok);
  } else if (a === 'v') {               // volta um previsto confirmado para "previsto"
    const c = mudar_(so_(tok), x => { x[14] = 1; });
    edita(c ? '🔮 Voltou para previsto.' : '⚠️ Não encontrei esse lançamento.');
  } else if (a === 'i') {               // abre um lançamento (auditoria)
    const v = viewItem_(tok);
    edita(v[0], v[1]);
  } else if (a === 'e') {               // editar campo
    const txt = { v: 'o novo <b>valor</b> (ex: 49,90)', d: 'a nova <b>descrição</b>', t: 'a nova <b>data</b> (ex: 28/10, ontem)' }[i];
    if (!txt) return;
    setModo_({ m: i, id: tok });
    msg_(chat, '✏️ Manda ' + txt + ':');
  } else if (a === 'o') {               // comprovante lido
    const d = rascGet_(tok);
    if (!d) return edita('⌛ Esse comprovante já foi lançado ou expirou. Mande de novo ou lance por texto.');
    if (i === 'x') { rascDel_(tok); return edita('❌ Cancelado (o arquivo continua salvo no Drive).'); }
    if (i === 's') { d.tipo = d.tipo === 'E' ? 'S' : 'E'; d.incerto = false; rascSet_(tok, d); return edita(rascTxt_(d), rascMk_(tok)); }
    if (i === 'e') { compSet_(d.url); rascDel_(tok); return edita('✏️ Ok! Manda o lançamento do jeito certo (ex: <code>50 mãe pix</code>) que eu anexo o comprovante.'); }
    if (i === 'l') {
      const r = rows_().filter(x => x[12] != 1 && !prev_(x)).sort((p, q) => Number(q[11]) - Number(p[11]))[0];
      if (!r) return edita('Nenhum lançamento para anexar.');
      mudar_(so_(r[0]), x => x[13] = d.url); rascDel_(tok); compSet_(null);
      return edita('📎 Anexado ao último lançamento: <b>' + esc_(r[5] || r[4]) + '</b> ' + R_(Number(r[3])));
    }
    if (i === 'y') {
      rascDel_(tok);
      edita('✅ Lançando…');
      return registrar_(chat, { tipo: d.tipo, valor: d.valor, carteira: d.carteira, descricao: d.desc, n: 1, data: d.data }, d.url, tok);
    }
  }
}
function desfazerUltimo_(chat) {
  const r = rows_().filter(x => x[12] != 1 && !prev_(x)).sort((a, b) => b[11] - a[11])[0];
  if (!r) return msg_(chat, 'Nada para desfazer.');
  const tok = r[8] || r[0]; mudar_(casa_(tok), x => x[12] = 1);
  return msg_(chat, '↩️ Desfeito: ' + esc_(r[5] || r[4]) + ' ' + R_(Number(r[3])));
}
function texto_(chat, txt) {
  const md = modo_(); setModo_(null);       // modo "aguardando valor" vale só para a próxima mensagem
  const low = txt.toLowerCase().replace(/[^a-zçãéêíóú0-9+ ,.]/g, '').trim();
  if (low === 'start' || low === 'ajuda' || low === 'menu') {
    msg_(chat, '<b>Digite uma palavra:</b> quanto · parcelas · mes · desfazer · ultimos · previstos\n\n<b>Anotar:</b>\n<code>25 mercado</code> saída\n<code>25 uber din</code> saída na carteira\n<code>+1500 salario</code> entrada\n<code>300 geladeira 10x</code> parcelado\n<code>t 100 pix din</code> transferência\n<code>adiantar geladeira 2</code>\n<code>orc lazer 300</code> orçamento do mês\n\n<b>Acertar o saldo:</b>\n<code>ajuste 424,56</code> (saldo real do Pix)\n<code>ajuste din 80</code> (outra carteira)\n\n<b>Previstos:</b>\n<code>previsto +500 dia 10 salario</code>\n<code>previsto 300 luz 15/11</code>\n<code>recebi salario</code> ou <code>paguei luz 310</code>\n\n<b>Comprovante:</b> mande a foto/print/PDF (ou foto com legenda <code>50 mae</code>). Eu salvo no Drive e leio o valor.\n\nSem carteira = <b>' + esc_(CARTEIRA_PADRAO) + '</b>.', teclado_());
    return msg_(chat, '👇 Atalhos', menu_());
  }
  if (low === 'q' || low.startsWith('quanto') || low === 'saldo') return saldo_(chat);
  if (low === 'mês' || low === 'mes') return resumoMes_(chat);
  if (low === 'parcelas' || low === 'parcela') return parcelas_(chat);
  if (low === 'desfazer') return desfazerUltimo_(chat);
  if (/^(últimos?|ultimos?|auditoria|editar)$/.test(low)) return ultimos_(chat);
  if (/^(previstos?|a receber|a pagar)$/.test(low)) return listarPrev_(chat, false);
  const aj = txt.trim().match(/^ajust(?:e|ar)(?:\s+(.+))?$/i);
  if (aj) return ajuste_(chat, aj[1]);
  const pv = txt.trim().match(/^prev(?:isto)?\s+(.+)$/i);
  if (pv) return previsto_(chat, pv[1]);
  const rc = txt.trim().match(/^(?:recebi|paguei)\s+(.+)$/i);
  if (rc) return recebi_(chat, rc[1]);
  const ad = low.match(/^adiantar (.+?)(?: (\d+))?$/);
  if (ad) {
    const r = adiantar_(ad[1], ad[2] || 1);
    return msg_(chat, r.c ? '⏩ Adiantei <b>' + r.c + '</b> parcela(s) de ' + esc_(r.nome) + ': ' + R_(r.soma) + ' saem hoje.' : 'Não achei parcelas pendentes de "' + esc_(ad[1]) + '".');
  }
  const ob = low.match(/^orc (.+) ([\d.,]+)$/);
  if (ob) {
    const c = CATEGORIAS.find(x => norm_(x).startsWith(norm_(ob[1]))) || ob[1];
    upsert_('Orcamentos', c, [c, numero_(ob[2])]);
    return msg_(chat, '🎯 Orçamento de <b>' + esc_(c) + '</b>: ' + R_(numero_(ob[2])));
  }
  if (md && aplicarModo_(chat, md, txt)) return;
  lancar_(chat, txt);
}
// Resposta a uma pergunta do bot ("manda o valor...")
function aplicarModo_(chat, md, txt) {
  const s = S_(txt);
  if (md.m === 'ajuste') {
    if (!isNum_(s)) return false;
    ajustar_(chat, md.c, num2_(s)); return true;
  }
  if (md.m === 'v') {
    const v = isNum_(s) ? num2_(s) : null;
    if (!(v > 0)) return false;
    const c = mudar_(so_(md.id), x => x[3] = Math.round(v * 100) / 100);
    msg_(chat, c ? '✅ Valor corrigido para <b>' + R_(v) + '</b>. Total: ' + R_(saldos_().total) : '⚠️ Não encontrei o lançamento.', menu_());
    return true;
  }
  if (md.m === 'd') {
    const c = mudar_(so_(md.id), x => x[5] = s);
    msg_(chat, c ? '✅ Descrição: <b>' + esc_(s) + '</b>' : '⚠️ Não encontrei o lançamento.'); return true;
  }
  if (md.m === 't') {
    const iso = dataTxt_(s);
    if (!iso) return false;
    const c = mudar_(so_(md.id), x => x[1] = iso);
    msg_(chat, c ? '✅ Data: <b>' + dt_(iso) + '</b>' : '⚠️ Não encontrei o lançamento.'); return true;
  }
  return false;
}
function registrar_(chat, p, comp, id) {
  let cat = p.categoria || categoriaPara_(p.descricao); const desconhecida = !cat;
  if (!cat) cat = p.tipo === 'E' ? 'Receita' : 'Outros';
  id = id || uid_();
  criar_({ id: id, tipo: p.tipo, valor: p.valor, carteira: p.carteira, categoria: cat, descricao: p.descricao, n: p.n, data: p.data, comprovante: comp, pAtual: p.pAtual, dia: p.dia, previsto: p.previsto });
  const sd = saldos_();
  let t = (p.tipo === 'E' ? '🟢 Entrada ' : '🔴 Saída ') + '<b>' + R_(p.valor) + '</b>' + (p.pAtual ? ' · parcela ' + p.pAtual + '/' + p.n + (p.pAtual < p.n ? ' · faltam ' + (p.n - p.pAtual) + ' (avisos no dia ' + (p.dia || hoje_().slice(8)) + ')' : ' · última!') : p.n > 1 ? ' em ' + p.n + 'x de ' + R_(p.valor / p.n) : '') +
    '\n' + esc_(p.descricao || '—') + ' · ' + cat + ' · ' + p.carteira + (p.data && p.data !== hoje_() ? ' · ' + dt_(p.data) : '') +
    '\n💰 ' + p.carteira + ': ' + R_(sd.s[p.carteira] || 0) + ' | Total: ' + R_(sd.total) + (comp ? '\n📎 Comprovante salvo' : '');
  const lim = orc_().find(o => o.categoria === cat);
  if (p.tipo === 'S' && lim && lim.limite > 0) {
    const g = mes_().cat[cat] || 0, pc = Math.round(g / lim.limite * 100);
    if (pc >= 80) t += '\n⚠️ ' + cat + ': ' + pc + '% do orçamento (' + R_(g) + ' de ' + R_(lim.limite) + ')';
  }
  msg_(chat, t, botoes_(id, desconhecida && p.tipo === 'S'));
}
function lancar_(chat, txt, comp) {
  const p = parse_(txt);
  comp = comp || compGet_();
  if (!p) { if (comp) compSet_(comp); return msg_(chat, 'Não entendi 🤔 Exemplo: <code>25 mercado</code>' + (comp ? '\n📎 Guardei o comprovante: é só mandar o lançamento certo.' : '')); }
  if (p.tipo === 'T') {
    const id = uid_();
    criar_({ id: id, tipo: 'T', valor: p.valor, carteira: p.carteira, destino: p.destino, categoria: 'Transferência', descricao: 'Transf.' });
    return msg_(chat, '🔁 ' + R_(p.valor) + ': ' + p.carteira + ' ➜ ' + p.destino, { inline_keyboard: [[{ text: '↩️ Desfazer', callback_data: 'u|' + id }]] });
  }
  compSet_(null);
  registrar_(chat, p, comp);
}

/* ---------- AJUSTE DE SALDO ---------- */
function ajuste_(chat, rest) {
  let v = null, cart = null;
  S_(rest).split(/\s+/).forEach(w => {
    if (v === null && isNum_(w)) v = num2_(w);
    else if (!cart) cart = acharCart_(w);
  });
  if (v === null) return pedirCarteira_(chat);
  return ajustar_(chat, cart || CARTEIRA_PADRAO, v);
}
function pedirCarteira_(chat) {
  const cs = carteiras_(), sd = saldos_();
  if (cs.length === 1) {
    setModo_({ m: 'ajuste', c: cs[0].nome });
    return msg_(chat, '⚖️ Quanto tem <b>de verdade</b> em <b>' + esc_(cs[0].nome) + '</b>? O bot calcula ' + R_(sd.s[cs[0].nome] || 0) + '. Manda só o valor.');
  }
  msg_(chat, '⚖️ <b>Acertar o saldo.</b> Qual carteira?', { inline_keyboard: [cs.map((c, i) => ({ text: c.nome + ' (' + R_(sd.s[c.nome] || 0) + ')', callback_data: 'a|' + i })).slice(0, 4)] });
}
// Lança a diferença entre o que o bot calcula e o saldo real que você informou
function ajustar_(chat, cart, real) {
  const atual = saldos_().s[cart] || 0, dif = Math.round((real - atual) * 100) / 100;
  if (dif === 0) return msg_(chat, '✅ O saldo de <b>' + esc_(cart) + '</b> já está certo: ' + R_(atual));
  const id = uid_();
  criar_({ id: id, tipo: dif > 0 ? 'E' : 'S', valor: Math.abs(dif), carteira: cart, categoria: 'Ajuste', descricao: 'Ajuste de saldo' });
  msg_(chat, '⚖️ Ajuste em <b>' + esc_(cart) + '</b>: ' + (dif > 0 ? '+' : '−') + R_(Math.abs(dif)) + '\nAntes: ' + R_(atual) + ' ➜ Agora: <b>' + R_(real) + '</b>\nTotal: ' + R_(saldos_().total),
    { inline_keyboard: [[{ text: '↩️ Desfazer', callback_data: 'u|' + id }]] });
}

/* ---------- PREVISTOS (a receber / a pagar) ---------- */
function previsto_(chat, rest) {
  const p = parsePrev_(rest);
  if (!p) return msg_(chat, 'Não entendi 🤔 Exemplos:\n<code>previsto +500 dia 10 salario</code>\n<code>previsto 300 luz 15/11</code>');
  const id = uid_();
  criar_({ id: id, tipo: p.tipo, valor: p.valor, carteira: p.carteira, data: p.data, previsto: 1, n: p.n, pAtual: p.pAtual, dia: p.dia,
    categoria: categoriaPara_(p.descricao) || (p.tipo === 'E' ? 'Receita' : 'Outros'), descricao: p.descricao });
  const sd = saldos_();
  msg_(chat, '🔮 Previsto: ' + (p.tipo === 'E' ? '🟢 ' : '🔴 ') + '<b>' + R_(p.valor) + '</b> · ' + esc_(p.descricao || '—') + ' · ' + p.carteira +
    '\n📅 ' + dt_(p.data) + ' · não mexe no saldo até você confirmar\n' + (p.tipo === 'E' ? '➕ A receber no total: ' + R_(sd.pE) : '➖ Comprometido no total: ' + R_(sd.pS)),
    { inline_keyboard: [[{ text: p.tipo === 'E' ? '✅ Recebi' : '✅ Paguei', callback_data: 'r|' + id }, { text: '↩️ Desfazer', callback_data: 'u|' + id }]] });
}
function confirmarPrev_(chat, id, valor) {
  let info = null;
  mudar_(x => x[0] === S_(id) && prev_(x), x => {
    x[14] = 0; x[1] = hoje_(); if (valor > 0) x[3] = Math.round(valor * 100) / 100;
    info = { d: x[5] || x[4], v: Number(x[3]), t: x[2], c: x[6] };
  });
  if (!info) return msg_(chat, '⚠️ Esse previsto já foi confirmado ou apagado.');
  const sd = saldos_();
  msg_(chat, '✅ ' + (info.t === 'E' ? 'Recebido' : 'Pago') + ': <b>' + R_(info.v) + '</b> · ' + esc_(info.d) + '\n💰 ' + info.c + ': ' + R_(sd.s[info.c] || 0) + ' | Total: ' + R_(sd.total),
    { inline_keyboard: [[{ text: '↩️ Voltar p/ previsto', callback_data: 'v|' + id }]] });
}
// "recebi salario" / "paguei luz 310" (valor opcional se veio diferente do previsto)
function recebi_(chat, rest) {
  let v = null; const q = [];
  S_(rest).split(/\s+/).forEach(w => { if (/^[\d.,]*\d$/.test(w)) v = numero_(w); else q.push(w); });
  const alvo = norm_(q.join(' '));
  const c = rows_().filter(r => r[12] != 1 && prev_(r) && (!alvo || norm_(r[5]).includes(alvo))).sort((a, b) => a[1].localeCompare(b[1]))[0];
  if (!c) return msg_(chat, 'Não achei previsto "' + esc_(rest) + '". Veja a lista em <b>Previstos</b>.');
  confirmarPrev_(chat, c[0], v);
}
function viewPrev_(soVenc) {
  const h = hoje_();
  const todos = rows_().filter(r => r[12] != 1 && prev_(r) && (!soVenc || r[1] <= h)).sort((a, b) => a[1].localeCompare(b[1]));
  if (!todos.length) return null;
  let e = 0, s = 0; todos.forEach(r => { if (r[2] === 'E') e += Number(r[3]); else s += Number(r[3]); });
  let t = soVenc ? '⏰ <b>Previstos que já chegaram na data</b> — já aconteceu?\n\n' : '🔮 <b>Previstos</b>\n\n';
  const k = [];
  todos.slice(0, 10).forEach(r => {
    t += ico_(r) + ' ' + dt_(r[1]).slice(0, 5) + ' · ' + esc_(r[5] || r[4]) + ' · <b>' + R_(Number(r[3])) + '</b>' + (r[1] < h ? ' ⚠️ passou' : '') + '\n';
    k.push([{ text: (r[2] === 'E' ? '✅ Recebi ' : '✅ Paguei ') + String(r[5] || r[4]).slice(0, 16) + ' ' + R_(Number(r[3])), callback_data: 'r|' + r[0] }]);
  });
  t += '\n➕ A receber: ' + R_(e) + (s ? '  ·  ➖ A pagar: ' + R_(s) : '');
  return [t, { inline_keyboard: k }];
}
function listarPrev_(chat, soVenc) {
  const v = viewPrev_(soVenc);
  if (!v) { if (!soVenc) msg_(chat, 'Nenhum valor previsto. Crie com <code>previsto +500 dia 10 salario</code>'); return; }
  msg_(chat, v[0], v[1]);
}

/* ---------- AUDITORIA / EDIÇÃO ---------- */
function viewUltimos_() {
  const h = hoje_();
  const L = rows_().filter(r => r[12] != 1 && !prev_(r) && r[1] <= h).sort((a, b) => Number(b[11]) - Number(a[11])).slice(0, 8);
  if (!L.length) return ['Nada lançado ainda.', menu_()];
  let t = '📋 <b>Últimos lançamentos</b>\nToque no número para editar ou apagar:\n\n';
  const btn = [];
  L.forEach((r, i) => {
    t += (i + 1) + '. ' + ico_(r) + ' <b>' + R_(Number(r[3])) + '</b> · ' + esc_(r[5] || r[4]) + ' · ' + dt_(r[1]).slice(0, 5) + (r[13] ? ' 📎' : '') + '\n';
    btn.push({ text: String(i + 1), callback_data: 'i|' + r[0] });
  });
  const k = []; for (let i = 0; i < btn.length; i += 4) k.push(btn.slice(i, i + 4));
  return [t, { inline_keyboard: k }];
}
function ultimos_(chat) { const v = viewUltimos_(); msg_(chat, v[0], v[1]); }
function viewItem_(id) {
  const r = rows_().find(x => x[0] === S_(id) && x[12] != 1);
  if (!r) return ['⚠️ Não encontrei esse lançamento.', menu_()];
  const t = ico_(r) + ' <b>' + R_(Number(r[3])) + '</b>\n' + esc_(r[5] || '—') + ' · ' + esc_(r[4]) + ' · ' + esc_(r[6]) + (r[2] === 'T' ? ' ➜ ' + esc_(r[7]) : '') +
    '\n📅 ' + dt_(r[1]) + (r[9] ? '\nParcela ' + r[9] + '/' + r[10] : '') + '\n🆔 <code>' + r[0] + '</code>';
  const k = [[{ text: '💲 Valor', callback_data: 'e|' + r[0] + '|v' }, { text: '📝 Descrição', callback_data: 'e|' + r[0] + '|d' }],
    [{ text: '🏷 Categoria', callback_data: 'm|' + r[0] }, { text: '📅 Data', callback_data: 'e|' + r[0] + '|t' }]];
  if (r[13]) k.push([{ text: '📎 Ver comprovante', url: r[13] }]);
  k.push([{ text: '🗑 Apagar', callback_data: 'u|' + r[0] }, { text: '⬅ Voltar', callback_data: 'k|l' }]);
  return [t, { inline_keyboard: k }];
}

/* ---------- COMPROVANTE (foto / print / PDF) ---------- */
function rascTxt_(d) {
  return '📎 <b>Li no comprovante:</b>\n' + (d.tipo === 'E' ? '🟢 Entrada ' : '🔴 Saída ') + '<b>' + R_(d.valor) + '</b>\n' +
    esc_(d.desc || '—') + ' · ' + d.carteira + ' · ' + dt_(d.data) + (d.incerto ? '\n⚠️ Não deu para saber se é entrada ou saída: confira.' : '') + '\n\nLançar assim?';
}
const rascMk_ = id => ({ inline_keyboard: [[{ text: '✅ Lançar', callback_data: 'o|' + id + '|y' }, { text: '✏️ Corrigir', callback_data: 'o|' + id + '|e' }],
  [{ text: '🔄 Entrada/Saída', callback_data: 'o|' + id + '|s' }, { text: '❌ Cancelar', callback_data: 'o|' + id + '|x' }]] });
function foto_(chat, m) {
  let fid = null;
  if (m.photo && m.photo.length) fid = m.photo[m.photo.length - 1].file_id;
  else if (m.document && /^(image\/|application\/pdf)/.test(m.document.mime_type || '')) fid = m.document.file_id;
  if (!fid) return msg_(chat, 'Mande uma foto, print ou PDF do comprovante.');
  const arq = salvarDrive_(baixarTg_(fid));
  const cap = S_(m.caption);
  if (cap) return lancar_(chat, cap, arq.url);              // foto com legenda "50 mae pix": lança direto
  const txt = ocr_(arq.id), d = lerComprovante_(txt);
  const id = uid_();
  if (!d) {
    rascSet_(id, { url: arq.url }); compSet_(arq.url);
    return msg_(chat, '📎 Comprovante salvo no Drive, mas não consegui ler o valor' + (txt === null ? ' (leitura automática desligada: ative o serviço Drive API)' : '') +
      '.\nManda o lançamento (ex: <code>50 mãe pix</code>) e eu anexo, ou:', { inline_keyboard: [[{ text: '📎 Anexar ao último lançamento', callback_data: 'o|' + id + '|l' }]] });
  }
  // já lançou por texto antes? então só anexa, sem duplicar
  const dup = rows_().filter(x => x[12] != 1 && !prev_(x) && !x[13] && Math.abs(Number(x[3]) - d.valor) < 0.005 && (d.incerto || x[2] === d.tipo))
    .sort((a, b) => Number(b[11]) - Number(a[11])).slice(0, 30)[0];
  if (dup) {
    mudar_(so_(dup[0]), x => x[13] = arq.url);
    return msg_(chat, '📎 Anexei o comprovante ao lançamento <b>' + esc_(dup[5] || dup[4]) + '</b> ' + R_(Number(dup[3])) + ' (' + dt_(dup[1]) + ').');
  }
  d.url = arq.url; rascSet_(id, d);
  msg_(chat, rascTxt_(d), rascMk_(id));
}

/* ---------- RESUMOS ---------- */
function saldo_(chat) {
  const x = saldos_(), liq = x.total - x.pS;
  let t = '💰 <b>Bruto (agora): ' + R_(x.total) + '</b>\n';
  Object.keys(x.s).forEach(k => t += '   • ' + esc_(k) + ': ' + R_(x.s[k]) + '\n');
  t += '\n➖ Já comprometido (parcelas/contas futuras): ' + R_(x.pS) +
       '\n✅ <b>Líquido: ' + R_(liq) + '</b>' +
       '\n➕ A receber: ' + R_(x.pE) +
       '\n📈 Projeção final: ' + R_(liq + x.pE);
  msg_(chat, t, menu_());
}
function resumoMes_(chat) {
  const m = mes_(), o = {}; orc_().forEach(x => o[x.categoria] = x.limite);
  let t = '📊 <b>' + hoje_().slice(0, 7) + '</b>\n🟢 Entradas: ' + R_(m.e) + '\n🔴 Saídas: ' + R_(m.s) + '\n= Sobra: <b>' + R_(m.e - m.s) + '</b>\n';
  if (m.aj) t += '⚖️ Ajustes de saldo: ' + (m.aj > 0 ? '+' : '') + R_(m.aj) + ' (fora da conta acima)\n';
  t += '\n';
  Object.keys(m.cat).sort((a, b) => m.cat[b] - m.cat[a]).forEach(c =>
    t += '• ' + c + ': ' + R_(m.cat[c]) + (o[c] ? ' (' + Math.round(m.cat[c] / o[c] * 100) + '%)' : '') + '\n');
  msg_(chat, t);
}
function parcelas_(chat) {
  const h = hoje_(), g = {};
  rows_().forEach(r => {
    if (r[12] == 1 || !r[8] || r[2] !== 'S') return;
    const x = g[r[8]] = g[r[8]] || { d: r[5] || r[4], n: Number(r[10]) || 0, tot: 0, pag: 0, fal: 0, vf: 0, prox: '', fim: '', val: Number(r[3]), min: 999 };
    x.tot += Number(r[3]); x.min = Math.min(x.min, Number(r[9]) || 1);
    if (!prev_(r) && r[1] <= h) x.pag++;
    else { x.fal++; x.vf += Number(r[3]); if (!x.prox || r[1] < x.prox) x.prox = r[1]; }
    if (r[1] > x.fim) x.fim = r[1];
  });
  const ks = Object.keys(g).filter(k => g[k].fal > 0);
  if (!ks.length) return msg_(chat, 'Nenhuma parcela pendente 🎉', menu_());
  let falta = 0, t = '📅 <b>Parcelamentos</b>\n';
  ks.forEach(k => {
    const x = g[k]; falta += x.vf; x.pag += x.min - 1;
    t += '\n<b>' + esc_(x.d) + '</b> · ' + x.n + 'x de ' + R_(x.val) + ' (total ' + R_(x.tot) + ')\n' +
         '   pagas ' + x.pag + '/' + x.n + ' · faltam ' + x.fal + ' = ' + R_(x.vf) + '\n' +
         '   próxima ' + dt_(x.prox) + ' · termina ' + dt_(x.fim) + '\n';
  });
  msg_(chat, t + '\n💳 <b>Falta pagar no total: ' + R_(falta) + '</b>', menu_());
}

/* ---------- ROTINA DIÁRIA (6h) ---------- */
function diario() {
  try { recorrentes_(); } catch (e) { log_(e); }
  try { if (MEU_CHAT_ID) listarPrev_(MEU_CHAT_ID, true); } catch (e) { log_(e); }   // lembra dos previstos que já venceram
}
function recorrentes_() {
  const h = hoje_(), mes = h.slice(0, 7), dia = Number(h.slice(8)), s = sh_('Recorrentes'), n = s.getLastRow();
  if (n < 2) return;
  const v = s.getRange(2, 1, n - 1, 7).getValues(), ok = [];
  v.forEach((x, i) => {
    if (!x[0] || S_(x[6]) === mes || dia < Number(x[5])) return;
    criar_({ id: 'rec-' + S_(x[0]).replace(/\s+/g, '_') + '-' + mes, tipo: S_(x[2]).toUpperCase() === 'E' ? 'E' : 'S', valor: x[1],
      categoria: x[3] || 'Contas', descricao: x[0], carteira: x[4] || CARTEIRA_PADRAO });
    s.getRange(i + 2, 7).setValue(mes); ok.push(x[0]);
  });
  if (ok.length && MEU_CHAT_ID) msg_(MEU_CHAT_ID, '🔁 Lançamentos recorrentes de hoje: ' + ok.map(esc_).join(', '));
}

/* ---------- METAS (objetivos de compra) ---------- */
const HM = ['id','nome','valor','prazo','carteira','imagem','categoria','feita','n','atualizado','excluido'];
function metaSheet_() {
  let s = sh_('Metas');
  if (!s) { s = SpreadsheetApp.getActive().insertSheet('Metas'); s.appendRow(HM); s.setFrozenRows(1); s.getRange('A:A').setNumberFormat('@'); s.getRange('D:D').setNumberFormat('@'); }
  return s;
}
function metas_() {
  const s = metaSheet_(), n = s.getLastRow();
  if (n < 2) return [];
  return s.getRange(2, 1, n - 1, HM.length).getValues().filter(r => S_(r[0]) && Number(r[10]) !== 1)
    .map(r => ({ id: S_(r[0]), nome: S_(r[1]), valor: Number(r[2]) || 0, prazo: d_(r[3]) === '' ? '' : d_(r[3]), carteira: S_(r[4]), img: S_(r[5]), cat: S_(r[6]), feita: Number(r[7]) === 1, n: Number(r[8]) || 0 }));
}
// cria ou atualiza (só os campos enviados) uma meta; del=1 apaga
function metaUpsert_(o) {
  comLock_(() => {
    const s = metaSheet_(), n = s.getLastRow(), id = S_(o.id);
    if (!id) throw new Error('meta sem id');
    const ids = n < 2 ? [] : s.getRange(2, 1, n - 1, 1).getValues().flat().map(S_), i = ids.indexOf(id);
    const old = i >= 0 ? s.getRange(i + 2, 1, 1, HM.length).getValues()[0] : [id, '', 0, '', '', '', '', 0, 0, 0, 0];
    const pick = (k, j) => o[k] != null ? o[k] : old[j];
    const row = [id, S_(pick('nome', 1)).slice(0, 80), Number(pick('valor', 2)) || 0, S_(pick('prazo', 3)), S_(pick('carteira', 4)), S_(pick('imagem', 5)).slice(0, 500),
      S_(pick('categoria', 6)), pick('feita', 7) ? 1 : 0, Number(pick('n', 8)) || 0, Date.now(), o.del ? 1 : 0];
    if (i >= 0) s.getRange(i + 2, 1, 1, HM.length).setValues([row]); else s.appendRow(row);
  });
}

/* ---------- API PARA A HTML ---------- */
// Previstos que vencem hoje, amanhã ou já passaram sem confirmar (usado pelos avisos do app)
function agenda_() {
  const h = hoje_(), am = new Date(Date.parse(h + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
  const L = rows_().filter(r => r[12] != 1 && prev_(r) && r[1] <= am).sort((a, b) => a[1].localeCompare(b[1]))
    .map(r => ({ id: r[0], data: r[1], tipo: r[2], valor: Number(r[3]), descricao: r[5] || r[4], n: r[9] || '', total: r[10] || '',
      quando: r[1] < h ? 'atrasado' : r[1] === h ? 'hoje' : 'amanha' }));
  return { ok: 1, hoje: h, itens: L };
}

function sync_(desde) {
  const agora = Date.now();
  return { ver: VERSAO, agora: agora, linhas: rows_().filter(r => Number(r[11]) > desde), carteiras: carteiras_(), orcamentos: orc_(), metas: metas_() };
}
function api_(b) {
  if (b.acao === 'sync') return sync_(Number(b.desde || 0));
  if (b.acao === 'resumo') { const x = saldos_(); return { ok: 1, saldos: x.s, total: x.total, pS: x.pS, pE: x.pE, liquido: x.total - x.pS }; }
  if (b.acao === 'agenda') return agenda_();
  if (b.acao === 'texto') return texto_api_(b.texto, b.id);          // "Addit": mesma sintaxe do bot
  if (b.acao === 'comp') return comp_api_(b);                          // foto/print em base64 -> Drive + leitura
  if (b.acao === 'ops') {
    const res = (b.ops || []).map(o => {
      try {
        if (o.op === 'add') criar_(o);
        else if (o.op === 'del') mudar_(casa_(o.id), x => x[12] = 1);
        else if (o.op === 'cat') mudar_(casa_(o.id), x => x[4] = o.categoria);
        else if (o.op === 'edit') mudar_(x => x[0] === S_(o.id), x => { x[1] = o.data || x[1]; x[3] = o.valor || x[3]; x[4] = o.categoria || x[4]; x[5] = o.descricao != null ? o.descricao : x[5]; x[6] = o.carteira || x[6]; if (o.previsto != null) x[14] = o.previsto ? 1 : 0; if (o.imagem != null) x[15] = S_(o.imagem).slice(0, 500); });
        else if (o.op === 'anexar') mudar_(so_(o.id), x => x[13] = S_(o.url));
        else if (o.op === 'receber')mudar_(x => x[0] === S_(o.id) && prev_(x), x => { x[14] = 0; x[1] = o.data || hoje_(); if (o.valor) x[3] = o.valor; });
        else if (o.op === 'adiantar') adiantar_(o.descricao, o.qtd);
        else if (o.op === 'carteira') upsert_('Carteiras', o.nome, [o.nome, Number(o.ini) || 0]);
        else if (o.op === 'meta') metaUpsert_(o);
        else if (o.op === 'metadel') metaUpsert_({ id: o.id, del: 1 });
        else if (o.op === 'orc') upsert_('Orcamentos', o.categoria, [o.categoria, Number(o.limite) || 0]);
        return { id: o.id || o.nome, ok: 1 };
      } catch (e) { log_(e); return { id: o.id || o.nome, erro: String(e.message) }; }
    });
    return Object.assign({ res: res }, sync_(Number(b.desde || 0)));
  }
  return { erro: 'ação desconhecida' };
}

// Lança a partir de texto (ex.: "25 mercado", "+50 mae pix", "300 tv 10x", "t 100 pix din") e devolve o resumo
function texto_api_(texto, idIn) {
  const T = S_(texto), id = S_(idIn) || uid_();
  const rc = T.match(/^(?:recebi|paguei)\s+(.+)$/i);
  if (rc) {
    let v = null; const q = [];
    rc[1].split(/\s+/).forEach(w => { if (/^[\d.,]*\d$/.test(w)) v = numero_(w); else q.push(w); });
    const al = norm_(q.join(' '));
    const c = rows_().filter(r => r[12] != 1 && prev_(r) && (!al || norm_(r[5]).includes(al))).sort((a, b) => a[1].localeCompare(b[1]))[0];
    if (!c) return { erro: 'Não achei previsto "' + rc[1] + '"' };
    mudar_(x => x[0] === c[0] && prev_(x), x => { x[14] = 0; x[1] = hoje_(); if (v > 0) x[3] = Math.round(v * 100) / 100; });
    const xs = saldos_();
    return { ok: 1, id: c[0], tipo: c[2], valor: v || Number(c[3]), categoria: c[4], descricao: c[5], carteira: c[6], n: 1, saldos: xs.s, total: xs.total,
      resumo: (c[2] === 'E' ? 'Recebido ' : 'Pago ') + R_(v || Number(c[3])) + ' · ' + (c[5] || c[4]) };
  }
  const pv = T.match(/^prev(?:isto)?\s+(.+)$/i);
  const p = pv ? parsePrev_(pv[1]) : parse_(T);
  if (!p) return { erro: 'Não entendi. Exemplo: 25 mercado' };
  if (p.tipo === 'T') criar_({ id: id, tipo: 'T', valor: p.valor, carteira: p.carteira, destino: p.destino, categoria: 'Transferência', descricao: 'Transf.' });
  else {
    const cat = categoriaPara_(p.descricao) || (p.tipo === 'E' ? 'Receita' : 'Outros');
    criar_({ id: id, tipo: p.tipo, valor: p.valor, carteira: p.carteira, categoria: cat, descricao: p.descricao, n: p.n, data: pv ? p.data : undefined, previsto: pv ? 1 : (p.previsto ? 1 : 0), pAtual: p.pAtual, dia: p.dia });
    p.categoria = cat;
  }
  const x = saldos_();
  return { ok: 1, id: id, tipo: p.tipo, valor: p.valor, categoria: p.categoria || 'Transferência', descricao: p.descricao || '', carteira: p.carteira,
    n: p.n || 1, saldos: x.s, total: x.total, resumo: (pv ? 'Previsto ' : '') + (p.pAtual ? 'Parcela ' + p.pAtual + '/' + p.n + ' ' : '') + (p.tipo === 'E' ? 'Entrada ' : p.tipo === 'T' ? 'Transf. ' : 'Saída ') + R_(p.valor) + ' · ' + (p.descricao || p.categoria || '') + ' · ' + p.carteira };
}
// Recebe {b64, mime}, guarda no Drive e tenta ler o comprovante
function comp_api_(b) {
  const mime = S_(b.mime) || 'image/jpeg', ext = mime.indexOf('pdf') >= 0 ? 'pdf' : mime.indexOf('png') >= 0 ? 'png' : 'jpg';
  const blob = Utilities.newBlob(Utilities.base64Decode(S_(b.b64)), mime, Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd_HHmmss') + '.' + ext);
  const arq = salvarDrive_(blob);
  const d = lerComprovante_(ocr_(arq.id));
  return { ok: 1, url: arq.url, leitura: d };
}

/* ---------- PORTAS DE ENTRADA ---------- */
function doPost(e) {
  try {
    const b = JSON.parse(e.postData.contents);
    if (b.update_id !== undefined) {
      if (e.parameter.s !== SEGREDO_WEBHOOK) { log_('SEGREDO NAO CONFERE'); return json_({ erro: 'negado' }); }
      telegram_(b); return json_({ ok: 1 });
    }
    if (b.chave !== CHAVE_API) return json_({ erro: 'chave inválida' });
    return json_(api_(b));
  } catch (err) { log_(err); return json_({ erro: String(err.message) }); }
}
function doGet() { return ContentService.createTextOutput('Financeiro online ✔ (código v' + VERSAO + ')'); }

/* ---------- TESTES ---------- */
function testar() {
  lancar_(MEU_CHAT_ID, '1 teste');
  Logger.log('lançamentos: ' + rows_().length);
}
// Testa a leitura de comprovante sem precisar de foto
function testarComprovante() {
  Logger.log(JSON.stringify(lerComprovante_('Comprovante de transferência\nPix enviado\nValor R$ 119,50\n01/11/2026 15:27\nDestino\nNome\nJOAO DA SILVA\nCPF ***.123.456-**')));
  Logger.log(JSON.stringify(lerComprovante_('Você recebeu um Pix\nR$ 50,00\nDe\nMARIA SOUZA\n01 NOV 2026')));
}
