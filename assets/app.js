(() => {
  'use strict';

  const APP_VERSION = '0.2.0';
  const STORAGE_KEY = 'detran_janela_mobile_v1';
  const rawData = window.DETRAN_MOBILE_DATA || { edital: [], config: {} };
  const qcCatalog = Array.isArray(window.QC_ROUTE_CATALOG) ? window.QC_ROUTE_CATALOG : [];
  const EXAM_DATE = rawData.config?.provaData || '2026-09-20T13:00:00-03:00';
  const SPECIFIC_BLOCKS = new Set(['LEGISLAÇÃO DE TRÂNSITO','SEGURANÇA DA INFORMAÇÃO','INFRAESTRUTURA EM TI','SISTEMAS OPERACIONAIS','GOVERNANÇA DE TI']);
  const TI_BLOCKS = new Set(['TECNOLOGIA DA INFORMAÇÃO','SEGURANÇA DA INFORMAÇÃO','INFRAESTRUTURA EM TI','SISTEMAS OPERACIONAIS','GOVERNANÇA DE TI']);
  const timeQuestionMap = { 5: 3, 10: 5, 15: 8, 20: 10, 30: 15, 45: 20 };


  /**
   * Rotas canônicas do QConcursos.
   * Evitamos IDs numéricos de disciplina porque eles são internos e podem
   * apontar para outra matéria quando usados incorretamente.
   */
  const QC_DISCIPLINE_ROUTES = Object.freeze({
    'LÍNGUA PORTUGUESA': 'letras-portugues',
    'RACIOCÍNIO LÓGICO E ANALÍTICO': 'matematica-raciocinio-logico',
    'NOÇÕES DE DIREITO CONSTITUCIONAL': 'direito-direito-constitucional',
    'NOÇÕES DE DIREITO ADMINISTRATIVO': 'direito-direito-administrativo',
    'NOÇÕES DE DIREITO CIVIL': 'direito-direito-civil',
    'LEGISLAÇÃO DE TRÂNSITO': 'direito-legislacao-de-transito',
    'SEGURANÇA DA INFORMAÇÃO': 'tecnologia-da-informacao-seguranca-da-informacao',
    'SISTEMAS OPERACIONAIS': 'tecnologia-da-informacao-sistemas-operacionais',
    'GOVERNANÇA DE TI': 'tecnologia-da-informacao-governanca-de-ti'
  });

  const QC_SPECIALIZED_ROUTES = Object.freeze({
    networks: 'tecnologia-da-informacao-redes-de-computadores',
    security: 'tecnologia-da-informacao-seguranca-da-informacao',
    operatingSystems: 'tecnologia-da-informacao-sistemas-operacionais',
    basicComputing: 'tecnologia-da-informacao-nocoes-de-informatica'
  });

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const nowIso = () => new Date().toISOString();
  const todayKey = () => new Date().toISOString().slice(0,10);
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const stripNumber = value => String(value || '').replace(/^\s*\d+(?:\.\d+)*\s*/, '').trim();
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

  function uid() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  }

  function slug(value) {
    return normalize(value).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90);
  }

  function defaultState() {
    return {
      schema: 1,
      appVersion: APP_VERSION,
      createdAt: nowIso(),
      settings: {
        selectedMinutes: 10,
        dailyBudget: 60,
        dailyGoal: 30,
        defaultMode: 'auto',
        commentsOnly: false,
        excludeResolved: false
      },
      topicStats: {},
      sessions: [],
      routes: {},
      pendingSession: null,
      mix: { selected: [], session: null },
      currentMissionId: null,
      missionNonce: 0
    };
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!parsed || typeof parsed !== 'object') return defaultState();
      const base = defaultState();
      const migratedSettings = { ...base.settings, ...(parsed.settings || {}) };
      if (!parsed.appVersion || String(parsed.appVersion).startsWith('0.1.')) migratedSettings.commentsOnly = false;
      return {
        ...base,
        ...parsed,
        settings: migratedSettings,
        topicStats: parsed.topicStats || {},
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        routes: parsed.routes || {},
        mix: { ...base.mix, ...(parsed.mix || {}), selected: Array.isArray(parsed.mix?.selected) ? parsed.mix.selected : [] }
      };
    } catch (error) {
      console.warn('[DETRAN JANELA] Estado inválido:', error);
      return defaultState();
    }
  }

  let state = loadState();
  let topics = [];
  let currentMission = null;
  let syllabusFilter = 'all';
  let deferredInstallPrompt = null;

  function saveState() {
    state.appVersion = APP_VERSION;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function flattenSyllabus() {
    const result = [];
    (rawData.edital || []).forEach((block, blockIndex) => {
      (block.itens || []).forEach((item, itemIndex) => {
        const children = Array.isArray(item.subitens) && item.subitens.length ? item.subitens : [null];
        children.forEach((sub, subIndex) => {
          const subject = stripNumber(item.nome);
          const subtopic = sub ? stripNumber(sub.nome) : '';
          const label = subtopic || subject;
          const id = slug(`${block.bloco}|${subject}|${subtopic || 'geral'}`);
          const objective = block.discursiveOnly !== true;
          const freq = Number(sub?.freq ?? item.freq ?? 4);
          const blockWeight = SPECIFIC_BLOCKS.has(block.bloco) ? 1.28 : 1;
          result.push({
            id,
            block: block.bloco,
            subject,
            subtopic,
            label,
            freq,
            blockWeight,
            objective,
            discursiveOnly: block.discursiveOnly === true,
            order: blockIndex * 1000 + itemIndex * 20 + subIndex
          });
        });
      });
    });
    return result;
  }

  function getTopicStat(topicId) {
    const existing = state.topicStats[topicId];
    if (existing) return existing;
    return {
      total: 0,
      correct: 0,
      wrong: 0,
      blank: 0,
      minutes: 0,
      sessions: 0,
      status: 'novo',
      lastStudiedAt: null,
      nextReviewAt: null,
      confidence: null
    };
  }

  function topicAccuracy(stat) {
    const answered = Number(stat.correct || 0) + Number(stat.wrong || 0);
    return answered ? stat.correct / answered : null;
  }

  function daysUntil(date) {
    if (!date) return null;
    const diff = new Date(date).getTime() - Date.now();
    return Math.ceil(diff / 86400000);
  }

  function isReviewDue(stat) {
    return Boolean(stat.nextReviewAt && new Date(stat.nextReviewAt).getTime() <= Date.now());
  }

  function topicScore(topic, mode = 'auto') {
    if (!topic.objective) return -9999;
    const stat = getTopicStat(topic.id);
    const accuracy = topicAccuracy(stat);
    const due = isReviewDue(stat);
    const unseenBoost = stat.total === 0 ? 24 : 0;
    const weaknessBoost = accuracy === null ? 0 : (1 - accuracy) * 42;
    const dueBoost = due ? 36 : 0;
    const lowExposureBoost = clamp(18 - stat.total, 0, 18) * .65;
    const recencyPenalty = stat.lastStudiedAt ? clamp(7 - Math.abs(daysUntil(stat.lastStudiedAt)), 0, 7) * 2 : 0;
    const frequencyScore = topic.freq * 5 * topic.blockWeight;
    const specificBonus = SPECIFIC_BLOCKS.has(topic.block) ? 8 : 0;
    const rotation = pseudoRandom(`${topic.id}|${todayKey()}|${state.missionNonce}`) * 9;

    let score = frequencyScore + unseenBoost + weaknessBoost + dueBoost + lowExposureBoost + specificBonus + rotation - recencyPenalty;
    if (mode === 'new') score += stat.total === 0 ? 70 : -stat.total * 3;
    if (mode === 'review') score += due ? 80 : (accuracy !== null ? (1 - accuracy) * 40 : -25);
    if (mode === 'mixed') score += stat.total === 0 ? 20 : due ? 35 : weaknessBoost * .4;
    return score;
  }

  function pseudoRandom(seed) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10000) / 10000;
  }

  function missionMode() {
    const configured = state.settings.defaultMode || 'auto';
    if (configured !== 'auto') return configured;
    const dueCount = topics.filter(t => t.objective && isReviewDue(getTopicStat(t.id))).length;
    if (dueCount >= 3) return 'review';
    const studiedCount = topics.filter(t => getTopicStat(t.id).total > 0).length;
    return studiedCount < 12 ? 'mixed' : 'auto';
  }

  function chooseMission(excludeId = null, forcedTopic = null) {
    const minutes = Number(state.settings.selectedMinutes || 10);
    const mode = missionMode();
    let topic = forcedTopic;
    if (!topic) {
      const ranked = topics
        .filter(t => t.objective && t.id !== excludeId)
        .map(t => ({ topic: t, score: topicScore(t, mode) }))
        .sort((a,b) => b.score - a.score);
      topic = ranked[0]?.topic || topics.find(t => t.objective);
    }
    if (!topic) return null;
    const stat = getTopicStat(topic.id);
    const accuracy = topicAccuracy(stat);
    const reasons = [];
    if (isReviewDue(stat)) reasons.push('revisão vencida');
    if (stat.total === 0) reasons.push('ainda não calibrado');
    if (accuracy !== null && accuracy < .7) reasons.push('baixo desempenho');
    if (topic.freq >= 7) reasons.push('alta incidência');
    if (SPECIFIC_BLOCKS.has(topic.block)) reasons.push('conhecimento específico');
    if (!reasons.length) reasons.push('rotação estratégica');

    const mission = {
      id: uid(),
      topicId: topic.id,
      minutes,
      questions: timeQuestionMap[minutes] || Math.max(3, Math.round(minutes / 2)),
      mode,
      generatedAt: nowIso(),
      reasons,
      topic
    };
    state.currentMissionId = mission.id;
    currentMission = mission;
    saveState();
    return mission;
  }

  function resolveQcDisciplineRoute(topic) {
    const direct = QC_DISCIPLINE_ROUTES[topic.block];
    if (direct) return direct;

    const source = normalize(`${topic.block} ${topic.subject} ${topic.subtopic}`);

    if (topic.block === 'TECNOLOGIA DA INFORMAÇÃO') {
      return QC_SPECIALIZED_ROUTES.basicComputing;
    }

    if (topic.block === 'INFRAESTRUTURA EM TI') {
      if (/rede|tcp|ip\b|snmp|mib|mpls|routing|switching|802\.11|vpn|nat|dns/.test(source)) {
        return QC_SPECIALIZED_ROUTES.networks;
      }
      if (/seguranca|criptograf|firewall|ids|ips|spoof|phishing|malware|ddos|dos\b/.test(source)) {
        return QC_SPECIALIZED_ROUTES.security;
      }
      if (/sistema operacional|processo|memoria|entrada e saida/.test(source)) {
        return QC_SPECIALIZED_ROUTES.operatingSystems;
      }
    }

    return null;
  }


  function wordTokens(value) {
    const stop = new Set(['de','da','do','das','dos','e','em','para','com','no','na','nos','nas','a','o','as','os','ti','gestao','conceitos','nocoes','fundamentos','principais']);
    return normalize(value).match(/[a-z0-9]{2,}/g)?.filter(token => !stop.has(token)) || [];
  }

  function catalogScoreForTopic(entry, topic) {
    if (!entry || !topic || entry.block !== topic.block) return -999;
    const topicTokens = new Set(wordTokens(`${topic.subject} ${topic.subtopic} ${topic.label}`));
    const entryTokens = wordTokens(`${entry.label} ${(entry.aliases || []).join(' ')}`);
    let score = 0;
    entryTokens.forEach(token => {
      if (topicTokens.has(token)) score += token.length >= 5 ? 5 : 3;
    });
    const source = normalize(`${topic.subject} ${topic.subtopic} ${topic.label}`);
    if (source.includes(normalize(entry.label))) score += 18;
    (entry.aliases || []).forEach(alias => { if (source.includes(normalize(alias))) score += 10; });
    if (entry.quality === 'exact') score += 1;
    return score;
  }

  function catalogEntriesForTopic(topic) {
    return qcCatalog
      .map(entry => ({ entry, score: catalogScoreForTopic(entry, topic) }))
      .filter(row => row.score > 0)
      .sort((a,b) => b.score - a.score)
      .map(row => row.entry);
  }

  function catalogEntryForTopic(topic) {
    const matches = catalogEntriesForTopic(topic);
    if (!matches.length) return null;
    const topScore = catalogScoreForTopic(matches[0], topic);
    const tied = matches.filter(entry => catalogScoreForTopic(entry, topic) >= topScore - 2).slice(0, 4);
    return tied[Math.abs(Number(state.missionNonce || 0)) % tied.length] || matches[0];
  }

  function buildCatalogUrl(entry, mode = 'strict') {
    if (!entry?.url) return '';
    const url = new URL(entry.url);
    if (mode === 'strict') {
      url.searchParams.append('examining_board_ids[]', '2');
      url.searchParams.append('modality_ids[]', '2');
    }
    url.searchParams.set('exclude_nullified', 'true');
    url.searchParams.set('exclude_outdated', 'true');
    url.searchParams.set('per_page', '20');
    if (mode === 'strict' && state.settings.commentsOnly) url.searchParams.set('has_professor_commentaries', 'true');
    if (state.settings.excludeResolved) url.searchParams.set('exclude_resolved', 'true');
    if (entry.query) url.searchParams.set('q', entry.query);
    return url.toString();
  }

  function matchTopicForCatalog(entry) {
    const candidates = topics
      .filter(topic => topic.objective && topic.block === entry.block)
      .map(topic => ({ topic, score: catalogScoreForTopic(entry, topic) }))
      .sort((a,b) => b.score - a.score);
    return candidates[0]?.topic || topics.find(topic => topic.objective && topic.block === entry.block) || null;
  }

  function routeQualityLabel(entry) {
    if (!entry) return 'Busca assistida';
    return entry.quality === 'exact' ? 'Assunto catalogado' : 'Busca assistida curta';
  }

  function keywordCandidates(topic) {
    const source = normalize(`${topic.subject} ${topic.subtopic} ${topic.label}`);
    const catalog = [
      [/governanca corporativa.*cobit.*38500/i, ['COBIT 19 e ISO/IEC 38500']],
      [/gestao de riscos.*31000.*coso/i, ['ISO 31000 e COSO']],
      [/gestao de servicos.*itil/i, ['ITIL 4']],
      [/gestao de projetos.*pmbok.*scrum.*kanban/i, ['PMBOK 7', 'Scrum', 'Kanban']],
      [/planejamento estrategico.*peti.*pdti/i, ['PETI e PDTI']],
      [/contratacoes de ti/i, ['Contratações de TI']],
      [/gestao de processos.*bpmn/i, ['BPMN', 'melhoria contínua']],
      [/indicadores de desempenho.*kpi.*bsc/i, ['KPI e BSC']],
      [/ciberseguranca.*27001.*22301.*27002.*nist/i, ['ISO 27001', 'ISO 27002', 'ISO 22301', 'NIST']],
      [/confidencialidade.*integridade.*disponibilidade/i, ['confidencialidade integridade disponibilidade']],
      [/autenticacao.*oauth.*openid.*jwt/i, ['OAuth 2.0', 'OpenID Connect', 'JWT']],
      [/ameacas.*vulnerabilidades.*injection/i, ['SQL Injection', 'XSS', 'CSRF']],
      [/seguranca de aplicativos web.*owasp/i, ['OWASP']],
      [/ddos|spoofing|phishing|brute force|port scanning/i, ['DDoS', 'spoofing', 'phishing', 'brute force']],
      [/criptografia.*transito.*repouso/i, ['criptografia em trânsito e em repouso']],
      [/criptografia simetrica.*assimetrica/i, ['criptografia simétrica e assimétrica']],
      [/firewalls.*deteccao.*prevencao.*intrus/i, ['firewall IDS IPS']],
      [/assinatura.*certificacao digital/i, ['assinatura e certificação digital']],
      [/13\.709|lgpd/i, ['LGPD']],
      [/tcp\/ip|familia tcp/i, ['TCP/IP']],
      [/smi.*snmp.*mib/i, ['SNMP MIB']],
      [/mpls.*802\.11/i, ['MPLS', '802.11', 'WPA2']],
      [/routing.*switching/i, ['routing e switching']],
      [/firewalls.*ids.*ips.*proxies.*nat.*vpn/i, ['firewall IDS IPS', 'NAT VPN']],
      [/cloud computing.*virtualizacao/i, ['cloud computing virtualização']],
      [/balanceamento de carga.*fail-over.*replicacao/i, ['balanceamento de carga', 'failover', 'replicação de estado']],
      [/raid/i, ['RAID']],
      [/nas.*san/i, ['NAS e SAN']],
      [/conteinerizacao.*devops/i, ['Docker Kubernetes DevOps']],
      [/windows server 2025.*redhat/i, ['Windows Server 2025', 'Red Hat Enterprise Linux 9']],
      [/active directory.*ldap/i, ['Active Directory LDAP']],
      [/gestao de memoria/i, ['gestão de memória']],
      [/entrada e saida/i, ['entrada e saída']],
      [/problemas de contagem.*probabilidade/i, ['contagem e probabilidade']],
      [/logica sentencial|proposicional/i, ['lógica proposicional']],
      [/tabelas verdade/i, ['tabela verdade']],
      [/equivalencias/i, ['equivalências lógicas']],
      [/falacias/i, ['falácias']],
      [/media.*moda.*mediana.*desvio/i, ['média moda mediana desvio padrão']],
      [/compreensao.*interpretacao de textos/i, ['interpretação de textos']],
      [/tipos.*generos textuais/i, ['tipologia e gêneros textuais']],
      [/ortografia oficial/i, ['ortografia']],
      [/coesao textual/i, ['coesão textual']],
      [/pontuacao/i, ['pontuação']],
      [/concordancia/i, ['concordância verbal e nominal']],
      [/regencia/i, ['regência verbal e nominal']],
      [/crase/i, ['crase']],
      [/pronomes atonos/i, ['colocação pronominal']],
      [/reescrita/i, ['reescrita de frases']],
      [/codigo de transito brasileiro/i, ['Código de Trânsito Brasileiro']],
      [/resolucoes.*contran/i, ['Resoluções CONTRAN']]
    ];

    const matched = catalog.find(([pattern]) => pattern.test(source));
    if (matched) return matched[1];

    const raw = stripNumber(topic.subtopic || topic.subject || topic.label)
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\b(conceitos?|noções?|fundamentos?|principais|procedimentos?|aplicações?|disposições gerais|aspectos|métodos|gestão de|governança corporativa de|tecnologias?|arquitetura|administração de)\b/gi, ' ')
      .replace(/[;:,.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const chunks = raw.split(/\s+(?:e|ou)\s+/i).map(part => part.trim()).filter(Boolean);
    const concise = chunks
      .map(part => part.split(/\s+/).slice(0, 4).join(' '))
      .filter(Boolean)
      .slice(0, 2);

    return concise.length ? concise : [topic.label];
  }

  function compactQcSearchTerm(topic, preferredTerm = '') {
    if (preferredTerm && String(preferredTerm).trim()) return String(preferredTerm).trim();
    const candidates = keywordCandidates(topic);
    const index = Math.abs(Number(state.missionNonce || 0)) % candidates.length;
    return candidates[index] || topic.label;
  }

  function buildQcQuery(topic, preferredTerm = '') {
    const catalogEntry = catalogEntryForTopic(topic);
    if (catalogEntry && !preferredTerm) return buildCatalogUrl(catalogEntry);

    const route = resolveQcDisciplineRoute(topic);
    const base = route
      ? `https://www.qconcursos.com/questoes-de-concursos/disciplinas/${route}/questoes`
      : 'https://www.qconcursos.com/questoes-de-concursos/questoes';

    const params = new URLSearchParams();
    params.append('examining_board_ids[]', '2');
    params.append('modality_ids[]', '2');
    params.set('exclude_nullified', 'true');
    params.set('exclude_outdated', 'true');
    params.set('per_page', '20');
    if (state.settings.commentsOnly) params.set('has_professor_commentaries', 'true');
    if (state.settings.excludeResolved) params.set('exclude_resolved', 'true');
    params.set('q', compactQcSearchTerm(topic, preferredTerm || state.routes[topic.id]?.keyword || ''));
    return `${base}?${params.toString()}`;
  }

  function missionUrl(mission) {
    const custom = state.routes[mission.topicId]?.url;
    if (custom) return custom;
    const entry = catalogEntryForTopic(mission.topic);
    return entry ? buildCatalogUrl(entry) : buildQcQuery(mission.topic);
  }

  function renderMission() {
    const card = $('#mission-card');
    if (!currentMission) chooseMission();
    const m = currentMission;
    if (!m) {
      card.innerHTML = '<div class="mission-loading">Nenhum conteúdo objetivo disponível.</div>';
      return;
    }
    const stat = getTopicStat(m.topicId);
    const accuracy = topicAccuracy(stat);
    const modeLabel = ({auto:'Inteligente',new:'Exploração',review:'Revisão',mixed:'Misto'})[m.mode] || 'Inteligente';
    const entry = catalogEntryForTopic(m.topic);
    const routeMapped = Boolean(state.routes[m.topicId]?.url);
    const filterLabel = entry?.label || compactQcSearchTerm(m.topic, state.routes[m.topicId]?.keyword || '');
    card.innerHTML = `
      <div class="mission-head">
        <div class="mission-badges">
          <span class="badge">${escapeHtml(modeLabel)}</span>
          <span class="badge priority">${m.questions} questões · ${m.minutes} min</span>
        </div>
        <h2>${escapeHtml(m.topic.label)}</h2>
        <p>${escapeHtml(m.topic.block)}${m.topic.subtopic ? ` · ${escapeHtml(m.topic.subject)}` : ''}</p>
      </div>
      <div class="mission-reason">
        <div><span>Prioridade</span><strong>${m.topic.freq >= 7 ? 'Muito alta' : m.topic.freq >= 5 ? 'Alta' : 'Regular'}</strong></div>
        <div><span>Seu histórico</span><strong>${accuracy === null ? 'Sem dados' : `${Math.round(accuracy*100)}%`}</strong></div>
        <div><span>Motivo</span><strong>${escapeHtml(m.reasons[0])}</strong></div>
      </div>
      <div class="mission-keyword catalog-route"><span>${escapeHtml(routeQualityLabel(entry))}</span><strong>${escapeHtml(filterLabel)}</strong>${entry?.quality === 'assisted' ? '<small>Se a busca vier ampla, use o modo Misturar com um assunto mais específico.</small>' : ''}</div>
      <div class="mission-actions">
        <button id="open-qc" class="btn primary">Abrir CEBRASPE</button>
        <button id="edit-mission-route" class="mission-link-btn" title="Substituição manual opcional">${routeMapped ? '✓' : '⚙'}</button>
      </div>
      ${entry ? '<button id="open-qc-broad" class="mission-broad-link">Poucas ou zero questões? Abrir este assunto sem restringir a banca</button>' : ''}`;
    $('#open-qc').onclick = openMissionInQc;
    if ($('#open-qc-broad')) $('#open-qc-broad').onclick = () => window.open(buildCatalogUrl(entry, 'broad'), '_blank', 'noopener');
    $('#edit-mission-route').onclick = () => openRouteEditor(m.topic);
  }

  function openMissionInQc() {
    if (!currentMission) return;
    state.pendingSession = {
      id: uid(),
      mission: currentMission,
      openedAt: nowIso(),
      url: missionUrl(currentMission)
    };
    saveState();
    renderPendingSession();
    window.open(state.pendingSession.url, '_blank', 'noopener');
  }

  function renderPendingSession() {
    const card = $('#pending-session');
    if (!state.pendingSession) {
      card.classList.add('hidden');
      return;
    }
    card.classList.remove('hidden');
  }

  function openSessionForm() {
    const pending = state.pendingSession;
    if (!pending) return;
    const m = pending.mission;
    openModal(`
      <h2 class="modal-title">Registrar missão</h2>
      <p class="modal-subtitle"><strong>${escapeHtml(m.topic.label)}</strong><br>Informe apenas o resumo da sessão; o conteúdo das questões permanece no QConcursos.</p>
      <div class="form-grid">
        <label class="form-field">Resolvidas<input id="session-total" type="number" min="0" max="1000" value="${m.questions}"></label>
        <label class="form-field">Acertos<input id="session-correct" type="number" min="0" max="1000" value="0"></label>
        <label class="form-field">Erros<input id="session-wrong" type="number" min="0" max="1000" value="0"></label>
        <label class="form-field">Brancos<input id="session-blank" type="number" min="0" max="1000" value="0"></label>
        <label class="form-field">Minutos<input id="session-minutes" type="number" min="1" max="300" value="${m.minutes}"></label>
      </div>
      <p class="modal-subtitle" style="margin-top:15px;margin-bottom:8px">Como você se sentiu?</p>
      <div class="confidence-grid" id="confidence-options">
        <button data-confidence="guess">Sem base</button>
        <button data-confidence="doubt">Com dúvida</button>
        <button data-confidence="leaning">Razoavelmente seguro</button>
        <button data-confidence="certain">Dominei</button>
      </div>
      <div class="modal-actions">
        <button class="btn secondary" data-close-modal>Depois</button>
        <button id="save-session" class="btn primary">Salvar sessão</button>
      </div>`);
    let confidence = 'doubt';
    const buttons = $$('#confidence-options button');
    buttons.find(b => b.dataset.confidence === confidence)?.classList.add('selected');
    buttons.forEach(button => button.onclick = () => {
      confidence = button.dataset.confidence;
      buttons.forEach(b => b.classList.toggle('selected', b === button));
    });
    $('#save-session').onclick = () => saveSessionFromForm(confidence);
  }

  function saveSessionFromForm(confidence) {
    const pending = state.pendingSession;
    if (!pending) return;
    const total = Math.max(0, Number($('#session-total').value || 0));
    const correct = Math.max(0, Number($('#session-correct').value || 0));
    const wrong = Math.max(0, Number($('#session-wrong').value || 0));
    const blank = Math.max(0, Number($('#session-blank').value || 0));
    const minutes = Math.max(1, Number($('#session-minutes').value || pending.mission.minutes));
    if (correct + wrong + blank > total) return toast('Acertos + erros + brancos não podem superar o total.');

    const topicId = pending.mission.topicId;
    const old = getTopicStat(topicId);
    const answered = correct + wrong;
    const accuracy = answered ? correct / answered : 0;
    let reviewDays = accuracy < .5 ? 1 : accuracy < .7 ? 2 : accuracy < .85 ? 4 : old.total > 20 ? 14 : 7;
    if (confidence === 'certain' && wrong > 0) reviewDays = 1;
    const next = new Date();
    next.setDate(next.getDate() + reviewDays);

    const updatedTotal = Number(old.total || 0) + total;
    const updatedCorrect = Number(old.correct || 0) + correct;
    const updatedWrong = Number(old.wrong || 0) + wrong;
    const cumulativeAccuracy = updatedCorrect + updatedWrong ? updatedCorrect / (updatedCorrect + updatedWrong) : null;
    const status = updatedTotal >= 30 && cumulativeAccuracy !== null && cumulativeAccuracy >= .85 ? 'dominado'
      : updatedTotal >= 8 ? 'em-revisao' : 'em-estudo';

    state.topicStats[topicId] = {
      ...old,
      total: updatedTotal,
      correct: updatedCorrect,
      wrong: updatedWrong,
      blank: Number(old.blank || 0) + blank,
      minutes: Number(old.minutes || 0) + minutes,
      sessions: Number(old.sessions || 0) + 1,
      status,
      confidence,
      lastStudiedAt: nowIso(),
      nextReviewAt: next.toISOString()
    };
    state.sessions.push({
      id: uid(), topicId, topicLabel: pending.mission.topic.label, block: pending.mission.topic.block,
      total, correct, wrong, blank, minutes, confidence, startedAt: pending.openedAt, completedAt: nowIso(),
      source: 'qconcursos-mobile', missionMode: pending.mission.mode
    });
    state.pendingSession = null;
    state.missionNonce += 1;
    saveState();
    closeModal();
    chooseMission(topicId);
    renderAll();
    toast('Sessão registrada. A próxima missão já foi recalculada.');
  }

  function planMissions() {
    const budget = Number(state.settings.dailyBudget || 60);
    const chunks = budget <= 20 ? [10,10] : budget <= 30 ? [10,10,10] : budget <= 45 ? [15,15,15]
      : budget <= 60 ? [20,20,20] : budget <= 90 ? [30,30,30] : [30,30,30,30];
    const chosen = [];
    const mode = missionMode();
    const ranked = topics.filter(t => t.objective).map(t => ({topic:t,score:topicScore(t,mode)})).sort((a,b)=>b.score-a.score);
    chunks.forEach((minutes, index) => {
      let candidate = ranked.find(row => !chosen.some(c => c.topic.id === row.topic.id));
      if (!candidate) candidate = ranked[index % ranked.length];
      if (!candidate) return;
      chosen.push({ ...candidate, minutes, questions: timeQuestionMap[minutes] || Math.round(minutes/2) });
    });
    return chosen;
  }

  function renderPlan() {
    const list = $('#daily-plan');
    const plan = planMissions();
    list.innerHTML = plan.map((item,index) => `
      <article class="plan-item">
        <div class="plan-order">${index+1}</div>
        <div><h3>${escapeHtml(item.topic.label)}</h3><p>${escapeHtml(item.topic.block)} · ${item.minutes} min · ${item.questions} questões</p></div>
        <button data-plan-topic="${item.topic.id}" data-plan-minutes="${item.minutes}">Abrir</button>
      </article>`).join('') || '<div class="mission-loading">Plano indisponível.</div>';
    $$('[data-plan-topic]', list).forEach(button => button.onclick = () => {
      state.settings.selectedMinutes = Number(button.dataset.planMinutes);
      const topic = topics.find(t => t.id === button.dataset.planTopic);
      chooseMission(null, topic);
      saveState();
      switchScreen('now');
      renderMission();
    });
  }

  function renderSyllabus() {
    const query = normalize($('#syllabus-search')?.value || '');
    const grouped = new Map();
    topics.forEach(topic => {
      const stat = getTopicStat(topic.id);
      const acc = topicAccuracy(stat);
      const matchesQuery = !query || normalize(`${topic.block} ${topic.subject} ${topic.subtopic}`).includes(query);
      const matchesFilter = syllabusFilter === 'all'
        || (syllabusFilter === 'priority' && topic.freq >= 7 && topic.objective)
        || (syllabusFilter === 'weak' && acc !== null && acc < .7)
        || (syllabusFilter === 'review' && isReviewDue(stat));
      if (!matchesQuery || !matchesFilter) return;
      if (!grouped.has(topic.block)) grouped.set(topic.block, []);
      grouped.get(topic.block).push(topic);
    });
    const container = $('#syllabus-list');
    container.innerHTML = [...grouped.entries()].map(([block, items]) => `
      <details class="syllabus-block" ${query ? 'open' : ''}>
        <summary><strong>${escapeHtml(block)}</strong><span>${items.length} ponto(s)${items[0]?.discursiveOnly ? ' · discursiva' : ''}</span></summary>
        <div class="syllabus-items">${items.map(topic => {
          const stat = getTopicStat(topic.id);
          const acc = topicAccuracy(stat);
          return `<div class="syllabus-topic"><div><strong>${escapeHtml(topic.label)}</strong><span>${escapeHtml(topic.subtopic ? topic.subject : topic.block)} · ${acc === null ? 'sem histórico' : `${Math.round(acc*100)}%`} ${isReviewDue(stat) ? '· revisar agora' : ''}</span><span class="priority-dots">${[1,2,3,4,5,6,7].map(n=>`<i class="${n<=topic.freq?'on':''}"></i>`).join('')}</span></div>${topic.objective ? `<button data-topic-mission="${topic.id}">Estudar</button>` : '<button disabled>Discursiva</button>'}</div>`;
        }).join('')}</div>
      </details>`).join('') || '<div class="mission-loading">Nenhum conteúdo encontrado.</div>';
    $$('[data-topic-mission]', container).forEach(button => button.onclick = () => {
      const topic = topics.find(t => t.id === button.dataset.topicMission);
      chooseMission(null, topic);
      switchScreen('now');
      renderMission();
    });
  }

  function sessionTotals() {
    return state.sessions.reduce((acc,s) => {
      acc.total += Number(s.total||0); acc.correct += Number(s.correct||0); acc.wrong += Number(s.wrong||0);
      acc.blank += Number(s.blank||0); acc.minutes += Number(s.minutes||0);
      return acc;
    }, {total:0,correct:0,wrong:0,blank:0,minutes:0});
  }

  function renderStats() {
    const totals = sessionTotals();
    const answered = totals.correct + totals.wrong;
    const mastered = Object.values(state.topicStats).filter(s => s.status === 'dominado').length;
    const due = Object.values(state.topicStats).filter(isReviewDue).length;
    $('#stats-panel').innerHTML = `
      <div class="stat-card"><span>Questões registradas</span><strong>${totals.total}</strong></div>
      <div class="stat-card"><span>Precisão global</span><strong>${answered ? `${Math.round(totals.correct/answered*100)}%` : '—'}</strong></div>
      <div class="stat-card"><span>Minutos estudados</span><strong>${totals.minutes}</strong></div>
      <div class="stat-card"><span>Revisões vencidas</span><strong>${due}</strong></div>
      <div class="stat-card"><span>Tópicos dominados</span><strong>${mastered}</strong></div>
      <div class="stat-card"><span>Sessões móveis</span><strong>${state.sessions.length}</strong></div>`;
    $('#default-mode').value = state.settings.defaultMode;
    $('#comments-only').checked = Boolean(state.settings.commentsOnly);
    $('#exclude-resolved').checked = Boolean(state.settings.excludeResolved);
    $('#daily-goal').value = String(state.settings.dailyGoal);
  }

  function renderTodaySummary() {
    const today = todayKey();
    const sessions = state.sessions.filter(s => String(s.completedAt||'').slice(0,10) === today);
    const minutes = sessions.reduce((sum,s)=>sum+Number(s.minutes||0),0);
    const questions = sessions.reduce((sum,s)=>sum+Number(s.total||0),0);
    const totals = sessionTotals();
    const answered = totals.correct + totals.wrong;
    $('#today-minutes').textContent = `${minutes} min`;
    $('#today-questions').textContent = String(questions);
    $('#overall-accuracy').textContent = answered ? `${Math.round(totals.correct/answered*100)}%` : '—';
  }

  function renderCountdown() {
    const days = Math.max(0, Math.ceil((new Date(EXAM_DATE).getTime() - Date.now()) / 86400000));
    $('#days-left').textContent = String(days);
  }


  function selectedMixEntries() {
    const selected = new Set(state.mix?.selected || []);
    return qcCatalog.filter(entry => selected.has(entry.id));
  }

  function toggleMixSelection(id, checked) {
    const selected = new Set(state.mix?.selected || []);
    checked ? selected.add(id) : selected.delete(id);
    state.mix = { ...(state.mix || {}), selected: [...selected] };
    saveState();
    renderMix();
  }

  function renderMixCatalog() {
    const container = $('#mix-catalog');
    if (!container) return;
    const search = normalize($('#mix-search')?.value || '');
    const selected = new Set(state.mix?.selected || []);
    const filtered = qcCatalog.filter(entry => !search || normalize(`${entry.block} ${entry.label} ${(entry.aliases || []).join(' ')}`).includes(search));
    const groups = new Map();
    filtered.forEach(entry => {
      if (!groups.has(entry.block)) groups.set(entry.block, []);
      groups.get(entry.block).push(entry);
    });
    container.innerHTML = [...groups.entries()].map(([block, entries]) => {
      const allSelected = entries.length && entries.every(entry => selected.has(entry.id));
      return `<details class="mix-block" ${search ? 'open' : ''}>
        <summary><div><strong>${escapeHtml(block)}</strong><span>${entries.length} filtros catalogados</span></div><label class="mix-block-check"><input type="checkbox" data-mix-block="${escapeHtml(block)}" ${allSelected ? 'checked' : ''}><span>todos</span></label></summary>
        <div class="mix-topic-list">${entries.map(entry => `<label class="mix-topic ${selected.has(entry.id) ? 'selected' : ''}"><input type="checkbox" data-mix-id="${entry.id}" ${selected.has(entry.id) ? 'checked' : ''}><div><strong>${escapeHtml(entry.label)}</strong><span>${entry.quality === 'exact' ? 'rota exata' : 'busca curta catalogada'}</span></div></label>`).join('')}</div>
      </details>`;
    }).join('') || '<div class="mission-loading">Nenhum assunto encontrado.</div>';

    $$('[data-mix-id]', container).forEach(input => input.onchange = () => toggleMixSelection(input.dataset.mixId, input.checked));
    $$('[data-mix-block]', container).forEach(input => input.onchange = () => {
      const blockEntries = qcCatalog.filter(entry => entry.block === input.dataset.mixBlock && (!search || normalize(`${entry.block} ${entry.label} ${(entry.aliases || []).join(' ')}`).includes(search)));
      const set = new Set(state.mix?.selected || []);
      blockEntries.forEach(entry => input.checked ? set.add(entry.id) : set.delete(entry.id));
      state.mix.selected = [...set]; saveState(); renderMix();
    });
  }

  function allocateMixQuestions(entries, total, strategy) {
    if (!entries.length) return [];
    const weights = entries.map(entry => strategy === 'priority' && SPECIFIC_BLOCKS.has(entry.block) ? 1.6 : 1);
    const sum = weights.reduce((a,b)=>a+b,0);
    let allocated = 0;
    const segments = entries.map((entry, index) => {
      const raw = index === entries.length - 1 ? total - allocated : Math.max(1, Math.floor(total * weights[index] / sum));
      allocated += raw;
      return { id: uid(), entryId: entry.id, expected: raw, status: 'pending', openedAt: null, result: null };
    });
    while (allocated > total) {
      const candidate = segments.find(segment => segment.expected > 1);
      if (!candidate) break;
      candidate.expected -= 1; allocated -= 1;
    }
    while (allocated < total) {
      segments[allocated % segments.length].expected += 1; allocated += 1;
    }
    return segments;
  }

  function startMixSession() {
    const entries = selectedMixEntries();
    if (entries.length < 2) return toast('Selecione pelo menos dois assuntos para misturar.');
    const total = Number($('#mix-question-count').value || 20);
    if (entries.length > total) return toast('A quantidade total deve ser igual ou maior que o número de assuntos selecionados.');
    const strategy = $('#mix-strategy').value || 'balanced';
    state.mix.session = {
      id: uid(), createdAt: nowIso(), total, strategy, current: 0,
      segments: allocateMixQuestions(entries, total, strategy)
    };
    saveState(); renderMix();
  }

  function currentMixSegment() {
    const session = state.mix?.session;
    return session?.segments?.[session.current] || null;
  }

  function openCurrentMixSegment() {
    const segment = currentMixSegment();
    const entry = qcCatalog.find(item => item.id === segment?.entryId);
    if (!segment || !entry) return;
    segment.openedAt = segment.openedAt || nowIso();
    segment.status = 'opened';
    saveState(); renderMix();
    window.open(buildCatalogUrl(entry), '_blank', 'noopener');
  }

  function openMixResultForm() {
    const session = state.mix?.session;
    const segment = currentMixSegment();
    const entry = qcCatalog.find(item => item.id === segment?.entryId);
    if (!session || !segment || !entry) return;
    openModal(`
      <h2 class="modal-title">Registrar bloco misturado</h2>
      <p class="modal-subtitle"><strong>${escapeHtml(entry.label)}</strong><br>Bloco ${session.current + 1} de ${session.segments.length}.</p>
      <div class="form-grid">
        <label class="form-field">Resolvidas<input id="mix-total" type="number" min="0" max="500" value="${segment.expected}"></label>
        <label class="form-field">Acertos<input id="mix-correct" type="number" min="0" max="500" value="0"></label>
        <label class="form-field">Erros<input id="mix-wrong" type="number" min="0" max="500" value="0"></label>
        <label class="form-field">Brancos<input id="mix-blank" type="number" min="0" max="500" value="0"></label>
        <label class="form-field">Minutos<input id="mix-minutes" type="number" min="1" max="300" value="${Math.max(5, Math.round(segment.expected * 1.5))}"></label>
      </div>
      <div class="modal-actions"><button class="btn secondary" data-close-modal>Depois</button><button id="save-mix-result" class="btn primary">Salvar e avançar</button></div>`);
    $('#save-mix-result').onclick = saveMixResult;
  }

  function saveMixResult() {
    const session = state.mix?.session;
    const segment = currentMixSegment();
    const entry = qcCatalog.find(item => item.id === segment?.entryId);
    if (!session || !segment || !entry) return;
    const total = Math.max(0, Number($('#mix-total').value || 0));
    const correct = Math.max(0, Number($('#mix-correct').value || 0));
    const wrong = Math.max(0, Number($('#mix-wrong').value || 0));
    const blank = Math.max(0, Number($('#mix-blank').value || 0));
    const minutes = Math.max(1, Number($('#mix-minutes').value || 1));
    if (correct + wrong + blank > total) return toast('Acertos + erros + brancos não podem superar o total.');
    segment.result = { total, correct, wrong, blank, minutes };
    segment.status = 'done';

    const topic = matchTopicForCatalog(entry);
    if (topic) {
      const old = getTopicStat(topic.id);
      const answered = correct + wrong;
      const accuracy = answered ? correct / answered : 0;
      const next = new Date(); next.setDate(next.getDate() + (accuracy < .5 ? 1 : accuracy < .7 ? 2 : accuracy < .85 ? 4 : 7));
      state.topicStats[topic.id] = {
        ...old,
        total: Number(old.total || 0) + total,
        correct: Number(old.correct || 0) + correct,
        wrong: Number(old.wrong || 0) + wrong,
        blank: Number(old.blank || 0) + blank,
        minutes: Number(old.minutes || 0) + minutes,
        sessions: Number(old.sessions || 0) + 1,
        status: 'em-revisao', lastStudiedAt: nowIso(), nextReviewAt: next.toISOString()
      };
    }
    state.sessions.push({ id: uid(), topicId: topic?.id || entry.id, topicLabel: entry.label, block: entry.block, total, correct, wrong, blank, minutes, completedAt: nowIso(), source: 'qconcursos-mobile-mix', mixSessionId: session.id });
    session.current += 1;
    saveState(); closeModal(); renderAll();
  }

  function finishMixSession() {
    state.mix.session = null;
    saveState(); renderMix(); toast('Sessão misturada concluída e registrada.');
  }

  function cancelMixSession() {
    if (!confirm('Cancelar a sessão misturada atual? Os blocos já registrados serão mantidos.')) return;
    state.mix.session = null; saveState(); renderMix();
  }

  function renderMixRunner() {
    const runner = $('#mix-runner');
    const builder = $('#mix-builder');
    if (!runner || !builder) return;
    const session = state.mix?.session;
    if (!session) {
      runner.classList.add('hidden'); builder.classList.remove('hidden'); return;
    }
    runner.classList.remove('hidden'); builder.classList.add('hidden');
    if (session.current >= session.segments.length) {
      const totals = session.segments.reduce((acc, segment) => {
        const r = segment.result || {}; acc.total += Number(r.total||0); acc.correct += Number(r.correct||0); acc.wrong += Number(r.wrong||0); return acc;
      }, {total:0,correct:0,wrong:0});
      runner.innerHTML = `<div class="mix-finish"><span class="eyebrow">SESSÃO CONCLUÍDA</span><h2>${totals.total} questões registradas</h2><p>${totals.correct} acertos · ${totals.wrong} erros</p><button id="finish-mix-session" class="btn primary full">Finalizar sessão</button></div>`;
      $('#finish-mix-session').onclick = finishMixSession;
      return;
    }
    const segment = currentMixSegment();
    const entry = qcCatalog.find(item => item.id === segment.entryId);
    runner.innerHTML = `
      <div class="mix-progress"><span>Filtro ${session.current + 1} de ${session.segments.length}</span><strong>${session.segments.filter(s=>s.status==='done').length}/${session.segments.length}</strong></div>
      <article class="mix-current-card">
        <span class="badge">${escapeHtml(entry.block)}</span>
        <h2>${escapeHtml(entry.label)}</h2>
        <p>Resolva aproximadamente <strong>${segment.expected} questões</strong>. Depois volte para registrar e abrir o próximo filtro.</p>
        <div class="mix-route-status"><span>${entry.quality === 'exact' ? 'Rota exata catalogada' : 'Busca curta catalogada'}</span></div>
        <div class="mix-run-actions">
          <button id="open-mix-segment" class="btn primary">${segment.status === 'opened' ? 'Abrir novamente' : 'Abrir CEBRASPE'}</button>
          <button id="register-mix-segment" class="btn secondary" ${segment.status !== 'opened' ? 'disabled' : ''}>Registrar bloco</button>
        </div>
        <button id="open-mix-broad" class="mission-broad-link">Abrir este assunto sem restringir a banca</button>
      </article>
      <div class="mix-queue">${session.segments.map((item,index) => { const e=qcCatalog.find(x=>x.id===item.entryId); return `<div class="mix-queue-item ${index===session.current?'active':''} ${item.status}"><span>${index+1}</span><div><strong>${escapeHtml(e?.label||item.entryId)}</strong><small>${item.expected} questões</small></div></div>`; }).join('')}</div>
      <button id="cancel-mix" class="danger-link">Cancelar sessão atual</button>`;
    $('#open-mix-segment').onclick = openCurrentMixSegment;
    $('#open-mix-broad').onclick = () => window.open(buildCatalogUrl(entry, 'broad'), '_blank', 'noopener');
    $('#register-mix-segment').onclick = openMixResultForm;
    $('#cancel-mix').onclick = cancelMixSession;
  }

  function renderMix() {
    if (!$('#mix-catalog')) return;
    const entries = selectedMixEntries();
    $('#mix-selected-count').textContent = String(entries.length);
    $('#start-mix').disabled = entries.length < 2;
    renderMixCatalog();
    renderMixRunner();
  }

  function openRouteEditor(topic) {
    const existingRoute = state.routes[topic.id] || {};
    const existingUrl = existingRoute.url || '';
    const automaticKeyword = compactQcSearchTerm(topic);
    const existingKeyword = existingRoute.keyword || automaticKeyword;
    openModal(`
      <h2 class="modal-title">Substituição manual</h2>
      <p class="modal-subtitle"><strong>${escapeHtml(topic.label)}</strong><br>O catálogo automático já será usado. Preencha somente quando desejar substituir a rota por um filtro específico da sua conta.</p>
      <div class="route-editor">
        <label class="form-field">Palavra-chave<input id="route-keyword" type="text" maxlength="80" placeholder="Ex.: COBIT 19 e ISO/IEC 38500" value="${escapeHtml(existingKeyword)}"></label>
        <small class="route-help">A palavra-chave é apenas um fallback. Prefira deixar vazio e usar o catálogo automático.</small>
        <label class="form-field" style="margin-top:12px">URL de filtro salvo (opcional)<input id="route-url" type="url" placeholder="https://www.qconcursos.com/..." value="${escapeHtml(existingUrl)}"></label>
        <button id="test-fallback" class="btn secondary full" style="margin-top:10px">Testar esta palavra-chave</button>
      </div>
      <div class="modal-actions">
        <button id="clear-route" class="btn secondary">Restaurar automático</button>
        <button id="save-route" class="btn primary">Salvar</button>
      </div>`);

    $('#test-fallback').onclick = () => {
      const keyword = $('#route-keyword').value.trim();
      window.open(buildQcQuery(topic, keyword), '_blank', 'noopener');
    };
    $('#clear-route').onclick = () => {
      delete state.routes[topic.id];
      saveState(); closeModal(); renderMission(); toast('Palavra-chave automática restaurada.');
    };
    $('#save-route').onclick = () => {
      const url = $('#route-url').value.trim();
      const keyword = $('#route-keyword').value.trim();
      if (url && !/^https:\/\/(www\.)?qconcursos\.com\//i.test(url)) return toast('Cole uma URL válida do QConcursos.');
      const customKeyword = keyword && keyword !== automaticKeyword ? keyword : '';
      if (url || customKeyword) {
        state.routes[topic.id] = { url, keyword: customKeyword, label: topic.label, savedAt: nowIso() };
      } else {
        delete state.routes[topic.id];
      }
      saveState(); closeModal(); renderMission(); toast('Busca salva neste celular.');
    };
  }

  function openRoutesManager() {
    const routes = Object.entries(state.routes);
    openModal(`
      <h2 class="modal-title">Filtros salvos</h2>
      <p class="modal-subtitle">${routes.length ? `${routes.length} rota(s) personalizada(s).` : 'Nenhum filtro personalizado ainda. Use a engrenagem na missão para cadastrar.'}</p>
      <div class="route-list">${routes.map(([id,route]) => `<div class="route-row"><strong>${escapeHtml(route.label || id)}</strong><span>${escapeHtml(route.keyword || route.url || 'Filtro automático')}</span><button class="btn secondary small" data-remove-route="${id}">Remover</button></div>`).join('') || '<div class="mission-loading">As buscas automáticas continuarão funcionando.</div>'}</div>`);
    $$('[data-remove-route]').forEach(button => button.onclick = () => {
      delete state.routes[button.dataset.removeRoute]; saveState(); openRoutesManager();
    });
  }

  function openModal(content) {
    $('#modal-content').innerHTML = content;
    $('#modal').classList.remove('hidden');
    $$('[data-close-modal]', $('#modal')).forEach(el => el.onclick = closeModal);
  }

  function closeModal() {
    $('#modal').classList.add('hidden');
    $('#modal-content').innerHTML = '';
  }

  let toastTimer = null;
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
  }

  function switchScreen(target) {
    $$('.screen').forEach(screen => screen.classList.toggle('active', screen.dataset.screen === target));
    $$('.bottom-nav button').forEach(button => button.classList.toggle('active', button.dataset.target === target));
    window.scrollTo({top:0,behavior:'smooth'});
    if (target === 'plan') renderPlan();
    if (target === 'mix') renderMix();
    if (target === 'syllabus') renderSyllabus();
    if (target === 'data') renderStats();
  }

  function saveSettings() {
    state.settings.defaultMode = $('#default-mode').value;
    state.settings.commentsOnly = $('#comments-only').checked;
    state.settings.excludeResolved = $('#exclude-resolved').checked;
    state.settings.dailyGoal = Number($('#daily-goal').value);
    state.missionNonce += 1;
    saveState();
    chooseMission(currentMission?.topicId);
    renderAll();
    toast('Preferências salvas.');
  }

  function exportData() {
    const payload = {
      product: 'DETRAN Janela Mobile', version: APP_VERSION, exportedAt: nowIso(),
      exam: rawData.config, state
    };
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `detran_janela_backup_${todayKey()}.json`; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),300);
  }

  async function importData(file) {
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = parsed.state || parsed;
      if (!incoming || !Array.isArray(incoming.sessions)) throw new Error('Formato não reconhecido');
      const base = defaultState();
      state = { ...base, ...incoming, settings:{...base.settings,...(incoming.settings||{})} };
      saveState();
      chooseMission();
      renderAll();
      toast('Backup importado com sucesso.');
    } catch (error) {
      toast(`Falha na importação: ${error.message}`);
    }
  }

  function resetData() {
    if (!confirm('Apagar sessões, desempenho e filtros salvos deste celular?')) return;
    state = defaultState(); saveState(); chooseMission(); renderAll(); toast('Dados locais apagados.');
  }

  function bindEvents() {
    $$('.bottom-nav button').forEach(button => button.onclick = () => switchScreen(button.dataset.target));
    $$('#time-options button').forEach(button => button.onclick = () => {
      $$('#time-options button').forEach(b => b.classList.toggle('selected', b === button));
      state.settings.selectedMinutes = Number(button.dataset.minutes);
      state.missionNonce += 1; saveState(); chooseMission(currentMission?.topicId); renderMission();
    });
    $('#refresh-mission').onclick = () => { state.missionNonce += 1; saveState(); chooseMission(currentMission?.topicId); renderMission(); };
    $('#finish-pending').onclick = openSessionForm;
    $('#daily-budget').value = String(state.settings.dailyBudget || 60);
    $('#daily-budget').onchange = event => { state.settings.dailyBudget = Number(event.target.value); saveState(); renderPlan(); };
    $('#rebuild-plan').onclick = () => { state.missionNonce += 1; saveState(); renderPlan(); };
    $('#syllabus-search').oninput = renderSyllabus;
    $$('.filter-chip').forEach(button => button.onclick = () => {
      syllabusFilter = button.dataset.filter;
      $$('.filter-chip').forEach(b => b.classList.toggle('active', b === button));
      renderSyllabus();
    });
    $('#save-settings').onclick = saveSettings;
    $('#manage-routes').onclick = openRoutesManager;
    $('#mix-search').oninput = renderMix;
    $('#mix-clear').onclick = () => { state.mix.selected = []; saveState(); renderMix(); };
    $('#start-mix').onclick = startMixSession;
    $('#mix-question-count').onchange = saveState;
    $('#mix-strategy').onchange = saveState;
    $('#export-data').onclick = exportData;
    $('#import-data').onchange = event => { const file=event.target.files?.[0]; if(file) importData(file); event.target.value=''; };
    $('#reset-data').onclick = resetData;
    $('#modal').addEventListener('click', event => { if (event.target.matches('[data-close-modal]')) closeModal(); });

    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault(); deferredInstallPrompt = event; $('#install-btn').classList.remove('hidden');
    });
    $('#install-btn').onclick = async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $('#install-btn').classList.add('hidden');
    };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) renderPendingSession(); });
  }

  function renderAll() {
    renderCountdown(); renderMission(); renderPendingSession(); renderTodaySummary(); renderPlan(); renderMix(); renderSyllabus(); renderStats();
    $$('#time-options button').forEach(button => button.classList.toggle('selected', Number(button.dataset.minutes) === Number(state.settings.selectedMinutes)));
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./service-worker.js').catch(error => console.warn('[PWA]',error));
    }
  }

  function init() {
    topics = flattenSyllabus();
    bindEvents();
    chooseMission();
    renderAll();
    registerServiceWorker();
  }

  init();
})();
