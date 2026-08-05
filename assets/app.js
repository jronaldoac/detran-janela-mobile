(() => {
  'use strict';

  const APP_VERSION = '0.4.1';
  const STORAGE_KEY = 'detran_janela_mobile_v1';
  const rawData = window.DETRAN_MOBILE_DATA || { edital: [], config: {} };
  const qcCatalog = Array.isArray(window.QC_ROUTE_CATALOG) ? window.QC_ROUTE_CATALOG : [];
  const EXAM_DATE = rawData.config?.provaData || '2026-09-20T13:00:00-03:00';
  const SPECIFIC_BLOCKS = new Set(['LEGISLAÇÃO DE TRÂNSITO','SEGURANÇA DA INFORMAÇÃO','INFRAESTRUTURA EM TI','SISTEMAS OPERACIONAIS','GOVERNANÇA DE TI']);

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const nowIso = () => new Date().toISOString();
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const stripNumber = value => String(value || '').replace(/^\s*\d+(?:\.\d+)*\s*/, '').trim();
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

  function uid() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function slug(value) {
    return normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
  }

  function defaultState() {
    return {
      schema: 2,
      appVersion: APP_VERSION,
      createdAt: nowIso(),
      settings: {
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
      const incoming = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!incoming || typeof incoming !== 'object') return defaultState();
      const base = defaultState();
      return {
        ...base,
        ...incoming,
        schema: 2,
        settings: { ...base.settings, ...(incoming.settings || {}) },
        topicStats: incoming.topicStats || {},
        sessions: Array.isArray(incoming.sessions) ? incoming.sessions : [],
        routes: incoming.routes || {},
        mix: {
          ...base.mix,
          ...(incoming.mix || {}),
          selected: Array.isArray(incoming.mix?.selected) ? incoming.mix.selected : []
        }
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
  let toastTimer = null;

  function saveState() {
    state.appVersion = APP_VERSION;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function flattenSyllabus() {
    const result = [];
    (rawData.edital || []).forEach((block, blockIndex) => {
      (block.itens || []).forEach((item, itemIndex) => {
        const children = Array.isArray(item.subitens) && item.subitens.length ? item.subitens : [null];
        children.forEach((subitem, subIndex) => {
          const subject = stripNumber(item.nome);
          const subtopic = subitem ? stripNumber(subitem.nome) : '';
          result.push({
            id: slug(`${block.bloco}|${subject}|${subtopic || 'geral'}`),
            block: block.bloco,
            subject,
            subtopic,
            label: subtopic || subject,
            freq: Number(subitem?.freq ?? item.freq ?? 4),
            blockWeight: SPECIFIC_BLOCKS.has(block.bloco) ? 1.28 : 1,
            objective: block.discursiveOnly !== true,
            discursiveOnly: block.discursiveOnly === true,
            order: blockIndex * 1000 + itemIndex * 20 + subIndex
          });
        });
      });
    });
    return result;
  }

  function getTopicStat(topicId) {
    return state.topicStats[topicId] || {
      total: 0, correct: 0, wrong: 0, blank: 0, minutes: 0, sessions: 0,
      status: 'novo', lastStudiedAt: null, nextReviewAt: null, confidence: null
    };
  }

  function topicAccuracy(stat) {
    const answered = Number(stat.correct || 0) + Number(stat.wrong || 0);
    return answered ? Number(stat.correct || 0) / answered : null;
  }

  function isReviewDue(stat) {
    return Boolean(stat.nextReviewAt && new Date(stat.nextReviewAt).getTime() <= Date.now());
  }

  function pseudoRandom(seed) {
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index += 1) {
      hash ^= seed.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % 10000) / 10000;
  }

  function missionMode(override = null) {
    if (override) return override;
    const configured = state.settings.defaultMode || 'auto';
    if (configured !== 'auto') return configured;
    const dueCount = topics.filter(topic => topic.objective && isReviewDue(getTopicStat(topic.id))).length;
    if (dueCount >= 3) return 'review';
    const studiedCount = topics.filter(topic => getTopicStat(topic.id).total > 0).length;
    return studiedCount < 12 ? 'mixed' : 'auto';
  }

  function topicScore(topic, mode = 'auto') {
    if (!topic.objective) return -9999;
    const stat = getTopicStat(topic.id);
    const accuracy = topicAccuracy(stat);
    const due = isReviewDue(stat);
    const unseenBoost = stat.total === 0 ? 24 : 0;
    const weaknessBoost = accuracy === null ? 0 : (1 - accuracy) * 42;
    const dueBoost = due ? 36 : 0;
    const lowExposureBoost = clamp(18 - Number(stat.total || 0), 0, 18) * 0.65;
    const recent = stat.lastStudiedAt ? Math.max(0, 3 - Math.floor((Date.now() - new Date(stat.lastStudiedAt).getTime()) / 86400000)) * 5 : 0;
    const frequencyScore = topic.freq * 5 * topic.blockWeight;
    const specificBonus = SPECIFIC_BLOCKS.has(topic.block) ? 8 : 0;
    const rotation = pseudoRandom(`${topic.id}|${todayKey()}|${state.missionNonce}`) * 9;

    let score = frequencyScore + unseenBoost + weaknessBoost + dueBoost + lowExposureBoost + specificBonus + rotation - recent;
    if (mode === 'new') score += stat.total === 0 ? 80 : -Number(stat.total || 0) * 4;
    if (mode === 'review') score += due ? 90 : accuracy !== null ? (1 - accuracy) * 55 : -30;
    if (mode === 'mixed') score += stat.total === 0 ? 22 : due ? 38 : weaknessBoost * 0.45;
    return score;
  }

  function rankedTopics(mode = null, excludeIds = []) {
    const excluded = new Set(excludeIds.filter(Boolean));
    const resolvedMode = missionMode(mode);
    return topics
      .filter(topic => topic.objective && !excluded.has(topic.id))
      .map(topic => ({ topic, score: topicScore(topic, resolvedMode) }))
      .sort((first, second) => second.score - first.score);
  }

  function missionReasons(topic) {
    const stat = getTopicStat(topic.id);
    const accuracy = topicAccuracy(stat);
    const reasons = [];
    if (isReviewDue(stat)) reasons.push('revisão vencida');
    if (accuracy !== null && accuracy < 0.7) reasons.push('baixo desempenho');
    if (stat.total === 0) reasons.push('ainda não estudado');
    if (topic.freq >= 7) reasons.push('alta incidência');
    if (SPECIFIC_BLOCKS.has(topic.block)) reasons.push('conhecimento específico');
    if (!reasons.length) reasons.push('rotação estratégica');
    return reasons;
  }

  function chooseMission(excludeId = null, forcedTopic = null, modeOverride = null) {
    const topic = forcedTopic || rankedTopics(modeOverride, [excludeId])[0]?.topic || topics.find(item => item.objective);
    if (!topic) return null;
    currentMission = {
      id: uid(),
      topicId: topic.id,
      topic,
      mode: missionMode(modeOverride),
      generatedAt: nowIso(),
      reasons: missionReasons(topic)
    };
    state.currentMissionId = currentMission.id;
    saveState();
    return currentMission;
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
    entryTokens.forEach(token => { if (topicTokens.has(token)) score += token.length >= 5 ? 5 : 3; });
    const source = normalize(`${topic.subject} ${topic.subtopic} ${topic.label}`);
    if (source.includes(normalize(entry.label))) score += 18;
    (entry.aliases || []).forEach(alias => { if (source.includes(normalize(alias))) score += 10; });
    if (entry.quality === 'exact') score += 1;
    return score;
  }

  function catalogEntryForTopic(topic) {
    const matches = qcCatalog
      .map(entry => ({ entry, score: catalogScoreForTopic(entry, topic) }))
      .filter(row => row.score > 0)
      .sort((first, second) => second.score - first.score);
    if (!matches.length) return null;
    const topScore = matches[0].score;
    const tied = matches.filter(row => row.score >= topScore - 2).slice(0, 4);
    return tied[Math.abs(Number(state.missionNonce || 0)) % tied.length]?.entry || matches[0].entry;
  }

  function matchTopicForCatalog(entry) {
    return topics
      .filter(topic => topic.objective && topic.block === entry.block)
      .map(topic => ({ topic, score: catalogScoreForTopic(entry, topic) }))
      .sort((first, second) => second.score - first.score)[0]?.topic || null;
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

  function fallbackQcUrl(topic, keyword = '') {
    const routeMap = {
      'LÍNGUA PORTUGUESA': 'letras-portugues',
      'RACIOCÍNIO LÓGICO E ANALÍTICO': 'matematica-raciocinio-logico',
      'NOÇÕES DE DIREITO CONSTITUCIONAL': 'direito-direito-constitucional',
      'NOÇÕES DE DIREITO ADMINISTRATIVO': 'direito-direito-administrativo',
      'NOÇÕES DE DIREITO CIVIL': 'direito-direito-civil',
      'LEGISLAÇÃO DE TRÂNSITO': 'direito-legislacao-de-transito',
      'SEGURANÇA DA INFORMAÇÃO': 'tecnologia-da-informacao-seguranca-da-informacao',
      'SISTEMAS OPERACIONAIS': 'tecnologia-da-informacao-sistemas-operacionais',
      'GOVERNANÇA DE TI': 'tecnologia-da-informacao-governanca-de-ti',
      'TECNOLOGIA DA INFORMAÇÃO': 'tecnologia-da-informacao-nocoes-de-informatica'
    };
    const route = routeMap[topic.block];
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
    params.set('q', keyword || topic.label);
    return `${base}?${params.toString()}`;
  }

  function missionUrl(mission) {
    const custom = state.routes[mission.topicId]?.url;
    if (custom) return custom;
    const entry = catalogEntryForTopic(mission.topic);
    return entry ? buildCatalogUrl(entry) : fallbackQcUrl(mission.topic, state.routes[mission.topicId]?.keyword || mission.topic.label);
  }

  function routeQuality(entry) {
    if (!entry) return 'Busca assistida';
    return entry.quality === 'exact' ? 'Assunto catalogado' : 'Busca curta catalogada';
  }

  function modeLabel(mode) {
    return ({ auto: 'Prioridade inteligente', new: 'Conteúdo novo', review: 'Revisão', mixed: 'Rotação equilibrada' })[mode] || 'Prioridade inteligente';
  }

  function renderCountdown() {
    const days = Math.max(0, Math.ceil((new Date(EXAM_DATE).getTime() - Date.now()) / 86400000));
    $('#days-left').textContent = String(days);
  }

  function renderMission() {
    const card = $('#mission-card');
    if (!currentMission) chooseMission();
    const mission = currentMission;
    if (!mission) {
      card.innerHTML = '<div class="mission-loading">Nenhum conteúdo objetivo disponível.</div>';
      return;
    }
    const stat = getTopicStat(mission.topicId);
    const accuracy = topicAccuracy(stat);
    const entry = catalogEntryForTopic(mission.topic);
    const customRoute = Boolean(state.routes[mission.topicId]?.url);
    card.innerHTML = `
      <div class="mission-head practical">
        <div class="mission-badges">
          <span class="badge">${escapeHtml(modeLabel(mission.mode))}</span>
          <span class="badge priority">${escapeHtml(routeQuality(entry))}</span>
        </div>
        <h2>${escapeHtml(mission.topic.label)}</h2>
        <p>${escapeHtml(mission.topic.block)}${mission.topic.subtopic ? ` · ${escapeHtml(mission.topic.subject)}` : ''}</p>
      </div>
      <div class="mission-reason compact-reason">
        <div><span>Prioridade</span><strong>${mission.topic.freq >= 7 ? 'Muito alta' : mission.topic.freq >= 5 ? 'Alta' : 'Regular'}</strong></div>
        <div><span>Histórico</span><strong>${accuracy === null ? 'Sem dados' : `${Math.round(accuracy * 100)}%`}</strong></div>
        <div><span>Por que agora</span><strong>${escapeHtml(mission.reasons[0])}</strong></div>
      </div>
      <div class="route-preview"><span>Filtro que será aberto</span><strong>${escapeHtml(entry?.label || mission.topic.label)}</strong></div>
      <div class="mission-actions practical-actions">
        <button id="open-qc" class="btn primary">Abrir questões no QConcursos</button>
        <button id="edit-mission-route" class="mission-link-btn" aria-label="Personalizar filtro" title="Personalizar filtro">${customRoute ? '✓' : '⚙'}</button>
      </div>
      ${entry ? '<button id="open-qc-broad" class="mission-broad-link">Poucas questões? Abrir o mesmo assunto sem limitar a banca</button>' : ''}`;

    $('#open-qc').onclick = openMissionInQc;
    $('#edit-mission-route').onclick = () => openRouteEditor(mission.topic);
    if ($('#open-qc-broad')) $('#open-qc-broad').onclick = () => window.open(buildCatalogUrl(entry, 'broad'), '_blank', 'noopener');
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

  function detectedMinutes(startedAt) {
    const elapsed = Date.now() - new Date(startedAt || Date.now()).getTime();
    return Math.max(1, Math.round(elapsed / 60000));
  }

  function openSessionForm() {
    const pending = state.pendingSession;
    if (!pending) return;
    const minutes = detectedMinutes(pending.openedAt);
    openModal(`
      <h2 class="modal-title">Finalizar esta janela</h2>
      <p class="modal-subtitle"><strong>${escapeHtml(pending.mission.topic.label)}</strong><br>Registre somente o que souber. Nenhum campo define meta para a sessão.</p>
      <div class="detected-time"><span>Tempo detectado</span><strong>${minutes} min</strong><small>apenas para o histórico</small></div>
      <div class="form-grid result-grid">
        <label class="form-field">Resolvidas<input id="session-total" inputmode="numeric" type="number" min="0" max="1000" value="0"></label>
        <label class="form-field">Acertos<input id="session-correct" inputmode="numeric" type="number" min="0" max="1000" value="0"></label>
        <label class="form-field">Erros<input id="session-wrong" inputmode="numeric" type="number" min="0" max="1000" value="0"></label>
        <label class="form-field">Brancos<input id="session-blank" inputmode="numeric" type="number" min="0" max="1000" value="0"></label>
      </div>
      <p class="modal-subtitle confidence-title">Como ficou sua segurança no assunto?</p>
      <div class="confidence-grid" id="confidence-options">
        <button data-confidence="guess">Sem base</button>
        <button data-confidence="doubt">Com dúvida</button>
        <button data-confidence="leaning">Razoável</button>
        <button data-confidence="certain">Seguro</button>
      </div>
      <div class="modal-actions three-actions">
        <button id="discard-session" class="btn secondary">Descartar</button>
        <button id="save-exposure" class="btn secondary">Só marcar estudo</button>
        <button id="save-session" class="btn primary">Salvar resultado</button>
      </div>`);

    let confidence = 'doubt';
    const buttons = $$('#confidence-options button');
    buttons.find(button => button.dataset.confidence === confidence)?.classList.add('selected');
    buttons.forEach(button => button.onclick = () => {
      confidence = button.dataset.confidence;
      buttons.forEach(item => item.classList.toggle('selected', item === button));
    });
    $('#discard-session').onclick = discardPendingSession;
    $('#save-exposure').onclick = () => savePendingSession({ confidence, exposureOnly: true });
    $('#save-session').onclick = () => savePendingSession({ confidence, exposureOnly: false });
  }

  function discardPendingSession() {
    state.pendingSession = null;
    saveState();
    closeModal();
    renderPendingSession();
    toast('Janela descartada sem alterar seu desempenho.');
  }

  function recordTopicSession({ topic, total, correct, wrong, blank, minutes, confidence, source, startedAt, mixSessionId = null }) {
    const old = getTopicStat(topic.id);
    const answered = correct + wrong;
    const sessionAccuracy = answered ? correct / answered : null;
    let reviewDays = sessionAccuracy === null ? 3 : sessionAccuracy < 0.5 ? 1 : sessionAccuracy < 0.7 ? 2 : sessionAccuracy < 0.85 ? 4 : 7;
    if (confidence === 'certain' && wrong > 0) reviewDays = 1;
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + reviewDays);

    const newTotal = Number(old.total || 0) + total;
    const newCorrect = Number(old.correct || 0) + correct;
    const newWrong = Number(old.wrong || 0) + wrong;
    const cumulativeAccuracy = newCorrect + newWrong ? newCorrect / (newCorrect + newWrong) : null;
    const status = newTotal >= 30 && cumulativeAccuracy !== null && cumulativeAccuracy >= 0.85
      ? 'dominado' : newTotal > 0 ? 'em-revisao' : 'em-estudo';

    state.topicStats[topic.id] = {
      ...old,
      total: newTotal,
      correct: newCorrect,
      wrong: newWrong,
      blank: Number(old.blank || 0) + blank,
      minutes: Number(old.minutes || 0) + minutes,
      sessions: Number(old.sessions || 0) + 1,
      status,
      confidence,
      lastStudiedAt: nowIso(),
      nextReviewAt: nextReview.toISOString()
    };

    state.sessions.push({
      id: uid(), topicId: topic.id, topicLabel: topic.label, block: topic.block,
      total, correct, wrong, blank, minutes, confidence,
      startedAt: startedAt || nowIso(), completedAt: nowIso(), source, mixSessionId
    });
  }

  function savePendingSession({ confidence, exposureOnly }) {
    const pending = state.pendingSession;
    if (!pending) return;
    const total = exposureOnly ? 0 : Math.max(0, Number($('#session-total').value || 0));
    const correct = exposureOnly ? 0 : Math.max(0, Number($('#session-correct').value || 0));
    const wrong = exposureOnly ? 0 : Math.max(0, Number($('#session-wrong').value || 0));
    const blank = exposureOnly ? 0 : Math.max(0, Number($('#session-blank').value || 0));
    if (!exposureOnly && correct + wrong + blank > total) return toast('Acertos + erros + brancos não podem superar o total.');

    recordTopicSession({
      topic: pending.mission.topic,
      total, correct, wrong, blank,
      minutes: detectedMinutes(pending.openedAt),
      confidence,
      source: 'qconcursos-mobile',
      startedAt: pending.openedAt
    });

    const previousTopicId = pending.mission.topicId;
    state.pendingSession = null;
    state.missionNonce += 1;
    saveState();
    closeModal();
    chooseMission(previousTopicId);
    renderAll();
    toast(exposureOnly ? 'Estudo registrado. Próxima prioridade recalculada.' : 'Resultado salvo. Próxima prioridade recalculada.');
  }

  function renderPriorityQueue() {
    const container = $('#priority-queue');
    const items = rankedTopics(null, [currentMission?.topicId]).slice(0, 3);
    container.innerHTML = items.map((item, index) => {
      const stat = getTopicStat(item.topic.id);
      const accuracy = topicAccuracy(stat);
      return `<button class="priority-item" data-priority-topic="${item.topic.id}">
        <span class="priority-number">${index + 1}</span>
        <div><strong>${escapeHtml(item.topic.label)}</strong><small>${escapeHtml(item.topic.block)} · ${accuracy === null ? 'sem histórico' : `${Math.round(accuracy * 100)}% de acerto`}</small></div>
        <span class="priority-arrow">›</span>
      </button>`;
    }).join('') || '<div class="empty-card">Fila indisponível.</div>';

    $$('[data-priority-topic]', container).forEach(button => button.onclick = () => {
      const topic = topics.find(item => item.id === button.dataset.priorityTopic);
      if (!topic) return;
      chooseMission(null, topic);
      renderMission();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function todaySessions() {
    return state.sessions.filter(session => String(session.completedAt || '').slice(0, 10) === todayKey());
  }

  function renderTodaySummary() {
    const today = todaySessions();
    const allCorrect = state.sessions.reduce((sum, session) => sum + Number(session.correct || 0), 0);
    const allWrong = state.sessions.reduce((sum, session) => sum + Number(session.wrong || 0), 0);
    $('#today-sessions').textContent = String(today.length);
    $('#today-questions').textContent = String(today.reduce((sum, session) => sum + Number(session.total || 0), 0));
    $('#overall-accuracy').textContent = allCorrect + allWrong ? `${Math.round((allCorrect / (allCorrect + allWrong)) * 100)}%` : '—';
  }

  function selectedMixEntries() {
    const selected = new Set(state.mix?.selected || []);
    return qcCatalog.filter(entry => selected.has(entry.id));
  }

  function toggleMixSelection(entryId, checked) {
    const selected = new Set(state.mix?.selected || []);
    checked ? selected.add(entryId) : selected.delete(entryId);
    state.mix.selected = [...selected];
    saveState();
    renderMix();
  }

  function renderMixCatalog() {
    const container = $('#mix-catalog');
    const search = normalize($('#mix-search')?.value || '');
    const selected = new Set(state.mix?.selected || []);
    const groups = new Map();

    qcCatalog.forEach(entry => {
      const haystack = normalize(`${entry.block} ${entry.label} ${(entry.aliases || []).join(' ')}`);
      if (search && !haystack.includes(search)) return;
      if (!groups.has(entry.block)) groups.set(entry.block, []);
      groups.get(entry.block).push(entry);
    });

    container.innerHTML = [...groups.entries()].map(([block, entries]) => {
      const allSelected = entries.length > 0 && entries.every(entry => selected.has(entry.id));
      return `<details class="mix-block" ${search ? 'open' : ''}>
        <summary>
          <div><strong>${escapeHtml(block)}</strong><span>${entries.length} assuntos disponíveis</span></div>
          <label class="mix-block-check"><input type="checkbox" data-mix-block="${escapeHtml(block)}" ${allSelected ? 'checked' : ''}><span>todos</span></label>
        </summary>
        <div class="mix-topic-list">${entries.map(entry => `<label class="mix-topic ${selected.has(entry.id) ? 'selected' : ''}">
          <input type="checkbox" data-mix-id="${entry.id}" ${selected.has(entry.id) ? 'checked' : ''}>
          <div><strong>${escapeHtml(entry.label)}</strong><span>${entry.quality === 'exact' ? 'rota exata' : 'busca curta catalogada'}</span></div>
        </label>`).join('')}</div>
      </details>`;
    }).join('') || '<div class="empty-card">Nenhum assunto encontrado.</div>';

    $$('[data-mix-id]', container).forEach(input => input.onchange = () => toggleMixSelection(input.dataset.mixId, input.checked));
    $$('[data-mix-block]', container).forEach(input => input.onchange = () => {
      const entries = qcCatalog.filter(entry => entry.block === input.dataset.mixBlock);
      const selectedSet = new Set(state.mix?.selected || []);
      entries.forEach(entry => input.checked ? selectedSet.add(entry.id) : selectedSet.delete(entry.id));
      state.mix.selected = [...selectedSet];
      saveState();
      renderMix();
    });
  }

  function startMixSession() {
    const entries = selectedMixEntries();
    if (entries.length < 2) return toast('Selecione pelo menos dois assuntos.');
    const ordered = [...entries].sort((first, second) => {
      const firstTopic = matchTopicForCatalog(first);
      const secondTopic = matchTopicForCatalog(second);
      return topicScore(secondTopic || { objective: false }, 'mixed') - topicScore(firstTopic || { objective: false }, 'mixed');
    });
    state.mix.session = {
      id: uid(),
      createdAt: nowIso(),
      current: 0,
      entries: ordered.map(entry => entry.id),
      openedAt: null,
      visits: {},
      rounds: 0
    };
    saveState();
    renderMix();
  }

  function currentMixEntry() {
    const session = state.mix?.session;
    if (!session?.entries?.length) return null;
    return qcCatalog.find(entry => entry.id === session.entries[session.current]) || null;
  }

  function openCurrentMixEntry() {
    const session = state.mix?.session;
    const entry = currentMixEntry();
    if (!session || !entry) return;
    session.openedAt = nowIso();
    session.visits[entry.id] = Number(session.visits[entry.id] || 0) + 1;
    saveState();
    renderMixRunner();
    window.open(buildCatalogUrl(entry), '_blank', 'noopener');
  }

  function advanceMix() {
    const session = state.mix?.session;
    if (!session?.entries?.length) return;
    session.current += 1;
    if (session.current >= session.entries.length) {
      session.current = 0;
      session.rounds = Number(session.rounds || 0) + 1;
    }
    session.openedAt = null;
    saveState();
    renderMixRunner();
  }

  function openMixResultForm() {
    const session = state.mix?.session;
    const entry = currentMixEntry();
    if (!session || !entry) return;
    const minutes = detectedMinutes(session.openedAt || session.createdAt);
    openModal(`
      <h2 class="modal-title">Registrar este assunto</h2>
      <p class="modal-subtitle"><strong>${escapeHtml(entry.label)}</strong><br>O registro é opcional. Depois você pode avançar para o próximo assunto.</p>
      <div class="detected-time"><span>Tempo detectado</span><strong>${minutes} min</strong><small>apenas para o histórico</small></div>
      <div class="form-grid result-grid">
        <label class="form-field">Resolvidas<input id="mix-total" inputmode="numeric" type="number" min="0" max="1000" value="0"></label>
        <label class="form-field">Acertos<input id="mix-correct" inputmode="numeric" type="number" min="0" max="1000" value="0"></label>
        <label class="form-field">Erros<input id="mix-wrong" inputmode="numeric" type="number" min="0" max="1000" value="0"></label>
        <label class="form-field">Brancos<input id="mix-blank" inputmode="numeric" type="number" min="0" max="1000" value="0"></label>
      </div>
      <div class="modal-actions">
        <button class="btn secondary" data-close-modal>Cancelar</button>
        <button id="save-mix-result" class="btn primary">Salvar e avançar</button>
      </div>`);
    $('#save-mix-result').onclick = saveMixResult;
  }

  function saveMixResult() {
    const session = state.mix?.session;
    const entry = currentMixEntry();
    if (!session || !entry) return;
    const total = Math.max(0, Number($('#mix-total').value || 0));
    const correct = Math.max(0, Number($('#mix-correct').value || 0));
    const wrong = Math.max(0, Number($('#mix-wrong').value || 0));
    const blank = Math.max(0, Number($('#mix-blank').value || 0));
    if (correct + wrong + blank > total) return toast('Acertos + erros + brancos não podem superar o total.');
    const topic = matchTopicForCatalog(entry);
    if (topic) {
      recordTopicSession({
        topic, total, correct, wrong, blank,
        minutes: detectedMinutes(session.openedAt || session.createdAt),
        confidence: 'doubt',
        source: 'qconcursos-mobile-mix',
        startedAt: session.openedAt || session.createdAt,
        mixSessionId: session.id
      });
    }
    closeModal();
    advanceMix();
    renderAll();
    toast('Resultado salvo. Próximo assunto pronto.');
  }

  function finishMixSession() {
    if (!confirm('Encerrar esta rotação? Os resultados já registrados serão mantidos.')) return;
    state.mix.session = null;
    saveState();
    renderMix();
    toast('Rotação encerrada.');
  }

  function renderMixRunner() {
    const runner = $('#mix-runner');
    const builder = $('#mix-builder');
    const session = state.mix?.session;
    if (!session) {
      runner.classList.add('hidden');
      builder.classList.remove('hidden');
      return;
    }
    runner.classList.remove('hidden');
    builder.classList.add('hidden');
    const entry = currentMixEntry();
    if (!entry) {
      state.mix.session = null;
      saveState();
      renderMix();
      return;
    }
    const position = session.current + 1;
    const visits = Number(session.visits?.[entry.id] || 0);
    runner.innerHTML = `
      <div class="mix-progress"><span>Assunto ${position} de ${session.entries.length}</span><strong>${session.rounds ? `${session.rounds} volta(s)` : 'rotação livre'}</strong></div>
      <article class="mix-current-card practical-mix">
        <span class="badge">${escapeHtml(entry.block)}</span>
        <h2>${escapeHtml(entry.label)}</h2>
        <p>Estude enquanto sua janela permitir. Quando quiser, registre o resultado ou avance sem registrar.</p>
        <div class="mix-route-status"><span>${entry.quality === 'exact' ? 'Rota exata catalogada' : 'Busca curta catalogada'}</span></div>
        <div class="mix-run-actions practical-run-actions">
          <button id="open-mix-entry" class="btn primary">${visits ? 'Abrir novamente' : 'Abrir no QConcursos'}</button>
          <button id="register-mix-entry" class="btn secondary">Registrar</button>
          <button id="next-mix-entry" class="btn secondary">Próximo assunto</button>
        </div>
        <button id="open-mix-broad" class="mission-broad-link">Abrir sem restringir a banca</button>
      </article>
      <div class="mix-queue compact-queue">${session.entries.map((entryId, index) => {
        const item = qcCatalog.find(catalogItem => catalogItem.id === entryId);
        return `<button class="mix-queue-item ${index === session.current ? 'active' : ''}" data-mix-jump="${index}"><span>${index + 1}</span><div><strong>${escapeHtml(item?.label || entryId)}</strong><small>${Number(session.visits?.[entryId] || 0)} abertura(s)</small></div></button>`;
      }).join('')}</div>
      <button id="finish-mix" class="danger-link">Encerrar rotação</button>`;

    $('#open-mix-entry').onclick = openCurrentMixEntry;
    $('#register-mix-entry').onclick = openMixResultForm;
    $('#next-mix-entry').onclick = advanceMix;
    $('#open-mix-broad').onclick = () => window.open(buildCatalogUrl(entry, 'broad'), '_blank', 'noopener');
    $('#finish-mix').onclick = finishMixSession;
    $$('[data-mix-jump]', runner).forEach(button => button.onclick = () => {
      session.current = Number(button.dataset.mixJump);
      session.openedAt = null;
      saveState();
      renderMixRunner();
    });
  }

  function renderMix() {
    if (!$('#mix-catalog')) return;
    const selected = selectedMixEntries();
    $('#mix-selected-count').textContent = String(selected.length);
    $('#start-mix').disabled = selected.length < 2;
    renderMixCatalog();
    renderMixRunner();
  }

  function renderSyllabus() {
    const container = $('#syllabus-list');
    const query = normalize($('#syllabus-search')?.value || '');
    const grouped = new Map();
    topics.forEach(topic => {
      if (!topic.objective && syllabusFilter !== 'all') return;
      const stat = getTopicStat(topic.id);
      const accuracy = topicAccuracy(stat);
      const matchesSearch = !query || normalize(`${topic.block} ${topic.subject} ${topic.subtopic}`).includes(query);
      if (!matchesSearch) return;
      if (syllabusFilter === 'priority' && topic.freq < 6) return;
      if (syllabusFilter === 'weak' && !(accuracy !== null && accuracy < 0.7)) return;
      if (syllabusFilter === 'review' && !isReviewDue(stat)) return;
      if (!grouped.has(topic.block)) grouped.set(topic.block, []);
      grouped.get(topic.block).push(topic);
    });

    container.innerHTML = [...grouped.entries()].map(([block, items]) => `<details class="syllabus-block" ${query ? 'open' : ''}>
      <summary><strong>${escapeHtml(block)}</strong><span>${items.length} tópico(s)</span></summary>
      <div class="syllabus-items">${items.map(topic => {
        const stat = getTopicStat(topic.id);
        const accuracy = topicAccuracy(stat);
        return `<div class="syllabus-topic"><div><strong>${escapeHtml(topic.label)}</strong><span>${accuracy === null ? 'Sem histórico' : `${Math.round(accuracy * 100)}% · ${stat.total} questões`}</span></div><button data-study-topic="${topic.id}">Estudar</button></div>`;
      }).join('')}</div>
    </details>`).join('') || '<div class="empty-card">Nenhum tópico encontrado.</div>';

    $$('[data-study-topic]', container).forEach(button => button.onclick = () => {
      const topic = topics.find(item => item.id === button.dataset.studyTopic);
      if (!topic) return;
      chooseMission(null, topic);
      switchScreen('now');
      renderMission();
    });
  }

  function renderStats() {
    const totalQuestions = state.sessions.reduce((sum, session) => sum + Number(session.total || 0), 0);
    const correct = state.sessions.reduce((sum, session) => sum + Number(session.correct || 0), 0);
    const wrong = state.sessions.reduce((sum, session) => sum + Number(session.wrong || 0), 0);
    const due = topics.filter(topic => topic.objective && isReviewDue(getTopicStat(topic.id))).length;
    const studied = topics.filter(topic => getTopicStat(topic.id).sessions > 0).length;
    $('#stats-panel').innerHTML = `
      <div class="stat-card"><span>Sessões</span><strong>${state.sessions.length}</strong></div>
      <div class="stat-card"><span>Questões</span><strong>${totalQuestions}</strong></div>
      <div class="stat-card"><span>Precisão</span><strong>${correct + wrong ? `${Math.round((correct / (correct + wrong)) * 100)}%` : '—'}</strong></div>
      <div class="stat-card"><span>Revisões pendentes</span><strong>${due}</strong></div>
      <div class="stat-card wide"><span>Tópicos já estudados</span><strong>${studied} de ${topics.filter(topic => topic.objective).length}</strong></div>`;
    $('#default-mode').value = state.settings.defaultMode || 'auto';
    $('#comments-only').checked = Boolean(state.settings.commentsOnly);
    $('#exclude-resolved').checked = Boolean(state.settings.excludeResolved);
  }

  function openRouteEditor(topic) {
    const existing = state.routes[topic.id] || {};
    openModal(`
      <h2 class="modal-title">Personalizar filtro</h2>
      <p class="modal-subtitle"><strong>${escapeHtml(topic.label)}</strong><br>Use apenas se quiser substituir o catálogo automático por um filtro salvo na sua conta.</p>
      <div class="route-editor">
        <label class="form-field">URL do filtro salvo<input id="route-url" type="url" placeholder="https://www.qconcursos.com/..." value="${escapeHtml(existing.url || '')}"></label>
        <label class="form-field">Palavra-chave de emergência<input id="route-keyword" type="text" maxlength="80" value="${escapeHtml(existing.keyword || '')}"></label>
      </div>
      <div class="modal-actions">
        <button id="clear-route" class="btn secondary">Usar automático</button>
        <button id="save-route" class="btn primary">Salvar</button>
      </div>`);
    $('#clear-route').onclick = () => {
      delete state.routes[topic.id];
      saveState();
      closeModal();
      renderMission();
      toast('Catálogo automático restaurado.');
    };
    $('#save-route').onclick = () => {
      const url = $('#route-url').value.trim();
      const keyword = $('#route-keyword').value.trim();
      if (url && !/^https:\/\/(www\.)?qconcursos\.com\//i.test(url)) return toast('Cole uma URL válida do QConcursos.');
      if (url || keyword) state.routes[topic.id] = { url, keyword, label: topic.label, savedAt: nowIso() };
      else delete state.routes[topic.id];
      saveState();
      closeModal();
      renderMission();
      toast('Substituição salva.');
    };
  }

  function openRoutesManager() {
    const routes = Object.entries(state.routes);
    openModal(`
      <h2 class="modal-title">Substituições manuais</h2>
      <p class="modal-subtitle">${routes.length ? `${routes.length} filtro(s) personalizado(s).` : 'Nenhuma substituição. O catálogo automático está ativo.'}</p>
      <div class="route-list">${routes.map(([id, route]) => `<div class="route-row"><strong>${escapeHtml(route.label || id)}</strong><span>${escapeHtml(route.url || route.keyword || '')}</span><button class="btn secondary small" data-remove-route="${id}">Remover</button></div>`).join('') || '<div class="empty-card">Nada para gerenciar.</div>'}</div>`);
    $$('[data-remove-route]').forEach(button => button.onclick = () => {
      delete state.routes[button.dataset.removeRoute];
      saveState();
      openRoutesManager();
    });
  }

  function saveSettings() {
    state.settings.defaultMode = $('#default-mode').value;
    state.settings.commentsOnly = $('#comments-only').checked;
    state.settings.excludeResolved = $('#exclude-resolved').checked;
    state.missionNonce += 1;
    saveState();
    chooseMission(currentMission?.topicId);
    renderAll();
    toast('Preferências salvas.');
  }

  function exportData() {
    const payload = { product: 'DETRAN Janela Mobile', version: APP_VERSION, exportedAt: nowIso(), exam: rawData.config, state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `detran_janela_backup_${todayKey()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 300);
  }

  async function importData(file) {
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = parsed.state || parsed;
      if (!incoming || !Array.isArray(incoming.sessions)) throw new Error('Formato não reconhecido');
      const base = defaultState();
      state = {
        ...base,
        ...incoming,
        schema: 2,
        settings: { ...base.settings, ...(incoming.settings || {}) },
        mix: { ...base.mix, ...(incoming.mix || {}), selected: Array.isArray(incoming.mix?.selected) ? incoming.mix.selected : [] }
      };
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
    state = defaultState();
    saveState();
    chooseMission();
    renderAll();
    toast('Dados locais apagados.');
  }

  function openModal(content) {
    $('#modal-content').innerHTML = content;
    $('#modal').classList.remove('hidden');
    $$('[data-close-modal]', $('#modal')).forEach(element => element.onclick = closeModal);
  }

  function closeModal() {
    $('#modal').classList.add('hidden');
    $('#modal-content').innerHTML = '';
  }

  function toast(message) {
    const element = $('#toast');
    element.textContent = message;
    element.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.add('hidden'), 3200);
  }

  function switchScreen(target) {
    $$('.screen').forEach(screen => screen.classList.toggle('active', screen.dataset.screen === target));
    $$('.bottom-nav button').forEach(button => button.classList.toggle('active', button.dataset.target === target));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (target === 'mix') renderMix();
    if (target === 'syllabus') renderSyllabus();
    if (target === 'data') renderStats();
  }

  function renderAll() {
    renderCountdown();
    renderMission();
    renderPendingSession();
    renderPriorityQueue();
    renderTodaySummary();
    renderMix();
    renderSyllabus();
    renderStats();
  }

  function bindEvents() {
    $$('.bottom-nav button').forEach(button => button.onclick = () => switchScreen(button.dataset.target));
    $$('[data-go-screen]').forEach(button => button.onclick = () => switchScreen(button.dataset.goScreen));
    $$('[data-quick-mode]').forEach(button => button.onclick = () => {
      state.missionNonce += 1;
      saveState();
      chooseMission(currentMission?.topicId, null, button.dataset.quickMode);
      renderMission();
      renderPriorityQueue();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    $('#refresh-mission').onclick = () => {
      state.missionNonce += 1;
      saveState();
      chooseMission(currentMission?.topicId);
      renderMission();
      renderPriorityQueue();
    };
    $('#refresh-queue').onclick = () => {
      state.missionNonce += 1;
      saveState();
      renderPriorityQueue();
    };
    $('#finish-pending').onclick = openSessionForm;
    $('#mix-search').oninput = renderMix;
    $('#mix-clear').onclick = () => { state.mix.selected = []; saveState(); renderMix(); };
    $('#start-mix').onclick = startMixSession;
    $('#syllabus-search').oninput = renderSyllabus;
    $$('.filter-chip').forEach(button => button.onclick = () => {
      syllabusFilter = button.dataset.filter;
      $$('.filter-chip').forEach(item => item.classList.toggle('active', item === button));
      renderSyllabus();
    });
    $('#save-settings').onclick = saveSettings;
    $('#manage-routes').onclick = openRoutesManager;
    $('#export-data').onclick = exportData;
    $('#import-data').onchange = event => {
      const file = event.target.files?.[0];
      if (file) importData(file);
      event.target.value = '';
    };
    $('#reset-data').onclick = resetData;
    $('#modal').addEventListener('click', event => { if (event.target.matches('[data-close-modal]')) closeModal(); });

    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredInstallPrompt = event;
      $('#install-btn').classList.remove('hidden');
    });
    $('#install-btn').onclick = async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      $('#install-btn').classList.add('hidden');
    };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) renderPendingSession(); });
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./service-worker.js').catch(error => console.warn('[PWA]', error));
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
