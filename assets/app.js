(() => {
  'use strict';

  const APP_VERSION = '0.1.0';
  const STORAGE_KEY = 'detran_janela_mobile_v1';
  const rawData = window.DETRAN_MOBILE_DATA || { edital: [], config: {} };
  const EXAM_DATE = rawData.config?.provaData || '2026-09-20T13:00:00-03:00';
  const SPECIFIC_BLOCKS = new Set(['LEGISLAÇÃO DE TRÂNSITO','SEGURANÇA DA INFORMAÇÃO','INFRAESTRUTURA EM TI','SISTEMAS OPERACIONAIS','GOVERNANÇA DE TI']);
  const TI_BLOCKS = new Set(['TECNOLOGIA DA INFORMAÇÃO','SEGURANÇA DA INFORMAÇÃO','INFRAESTRUTURA EM TI','SISTEMAS OPERACIONAIS','GOVERNANÇA DE TI']);
  const timeQuestionMap = { 5: 3, 10: 5, 15: 8, 20: 10, 30: 15, 45: 20 };

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
        commentsOnly: true,
        excludeResolved: false
      },
      topicStats: {},
      sessions: [],
      routes: {},
      pendingSession: null,
      currentMissionId: null,
      missionNonce: 0
    };
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!parsed || typeof parsed !== 'object') return defaultState();
      const base = defaultState();
      return {
        ...base,
        ...parsed,
        settings: { ...base.settings, ...(parsed.settings || {}) },
        topicStats: parsed.topicStats || {},
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        routes: parsed.routes || {}
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

  function buildQcQuery(topic) {
    const params = new URLSearchParams();
    params.append('examining_board_ids[]', '2');
    params.append('modality_ids[]', '2');
    params.set('exclude_nullified', 'true');
    params.set('exclude_outdated', 'true');
    params.set('per_page', '20');
    if (state.settings.commentsOnly) params.set('has_commentaries', 'true');
    if (TI_BLOCKS.has(topic.block)) params.append('discipline_ids[]', '2');

    const raw = `${topic.subtopic || topic.subject}`
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\b(conceitos?|noções?|fundamentos?|principais|procedimentos?|aplicações?|disposições gerais)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const tokens = raw.split(/[;,:]/).map(s => s.trim()).filter(Boolean);
    params.set('q', (tokens[0] || topic.label).slice(0, 90));
    return `https://www.qconcursos.com/questoes-de-concursos/questoes?${params.toString()}`;
  }

  function missionUrl(mission) {
    return state.routes[mission.topicId]?.url || buildQcQuery(mission.topic);
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
    const routeMapped = Boolean(state.routes[m.topicId]?.url);
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
      <div class="mission-actions">
        <button id="open-qc" class="btn primary">Abrir no QConcursos</button>
        <button id="edit-mission-route" class="mission-link-btn" title="Configurar filtro">${routeMapped ? '✓' : '⚙'}</button>
      </div>`;
    $('#open-qc').onclick = openMissionInQc;
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

  function openRouteEditor(topic) {
    const existing = state.routes[topic.id]?.url || '';
    const fallback = buildQcQuery(topic);
    openModal(`
      <h2 class="modal-title">Filtro do QConcursos</h2>
      <p class="modal-subtitle"><strong>${escapeHtml(topic.label)}</strong><br>O link automático já inclui CEBRASPE, Certo/Errado e exclusão de questões anuladas/desatualizadas. Para maior precisão, salve um filtro no QC e cole a URL abaixo.</p>
      <div class="route-editor">
        <label class="form-field">URL do filtro salvo<input id="route-url" type="url" placeholder="https://www.qconcursos.com/..." value="${escapeHtml(existing)}"></label>
        <button id="test-fallback" class="btn secondary full" style="margin-top:10px">Testar busca automática</button>
      </div>
      <div class="modal-actions">
        <button id="clear-route" class="btn secondary">Usar automático</button>
        <button id="save-route" class="btn primary">Salvar filtro</button>
      </div>`);
    $('#test-fallback').onclick = () => window.open(fallback,'_blank','noopener');
    $('#clear-route').onclick = () => {
      delete state.routes[topic.id]; saveState(); closeModal(); renderMission(); toast('Busca automática restaurada.');
    };
    $('#save-route').onclick = () => {
      const url = $('#route-url').value.trim();
      if (url && !/^https:\/\/(www\.)?qconcursos\.com\//i.test(url)) return toast('Cole uma URL válida do QConcursos.');
      if (url) state.routes[topic.id] = { url, label: topic.label, savedAt: nowIso() };
      else delete state.routes[topic.id];
      saveState(); closeModal(); renderMission(); toast('Filtro salvo neste celular.');
    };
  }

  function openRoutesManager() {
    const routes = Object.entries(state.routes);
    openModal(`
      <h2 class="modal-title">Filtros salvos</h2>
      <p class="modal-subtitle">${routes.length ? `${routes.length} rota(s) personalizada(s).` : 'Nenhum filtro personalizado ainda. Use a engrenagem na missão para cadastrar.'}</p>
      <div class="route-list">${routes.map(([id,route]) => `<div class="route-row"><strong>${escapeHtml(route.label || id)}</strong><span>${escapeHtml(route.url)}</span><button class="btn secondary small" data-remove-route="${id}">Remover</button></div>`).join('') || '<div class="mission-loading">As buscas automáticas continuarão funcionando.</div>'}</div>`);
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
    renderCountdown(); renderMission(); renderPendingSession(); renderTodaySummary(); renderPlan(); renderSyllabus(); renderStats();
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
