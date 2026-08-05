(() => {
  'use strict';

  const STORAGE_KEY = 'detranFlowMeasurementsV1';
  const SELECTED_POINT_KEY = 'detranFlowSelectedPointV1';
  const POINTS = ['B1', 'B2', 'B3', 'T1'];

  const display = document.getElementById('stopwatch-display');
  const status = document.getElementById('stopwatch-status');
  const volumeInput = document.getElementById('volume-ml');
  const secondsInput = document.getElementById('elapsed-seconds');
  const flowLh = document.getElementById('flow-lh');
  const flowMls = document.getElementById('flow-mls');
  const saveButton = document.getElementById('save-flow');
  const saveButtonTitle = saveButton.querySelector('span');
  const saveFeedback = document.getElementById('save-feedback');
  const historyList = document.getElementById('flow-history-list');
  const selectedPointTitle = document.getElementById('selected-point-title');
  const selectedPointCount = document.getElementById('selected-point-count');

  let running = false;
  let startedAt = 0;
  let accumulatedMs = 0;
  let timerId = null;
  let selectedPoint = loadSelectedPoint();
  let measurements = loadMeasurements();
  let currentMeasurement = null;

  function emptyMeasurements() {
    return Object.fromEntries(POINTS.map(point => [point, []]));
  }

  function loadSelectedPoint() {
    const saved = localStorage.getItem(SELECTED_POINT_KEY);
    return POINTS.includes(saved) ? saved : 'B1';
  }

  function loadMeasurements() {
    const empty = emptyMeasurements();
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      POINTS.forEach(point => {
        if (!Array.isArray(parsed[point])) return;
        empty[point] = parsed[point]
          .filter(item => item && Number.isFinite(Number(item.flowLh)) && Number(item.flowLh) > 0)
          .map(item => ({
            id: String(item.id || createId()),
            flowLh: Number(item.flowLh),
            volumeMl: Number(item.volumeMl) || 0,
            seconds: Number(item.seconds) || 0,
            createdAt: item.createdAt || new Date().toISOString()
          }));
      });
    } catch (error) {
      console.warn('[VAZÃO] Não foi possível recuperar o histórico:', error);
    }
    return empty;
  }

  function persistMeasurements() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(measurements));
  }

  function createId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `flow_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function parseDecimal(value) {
    const normalized = String(value || '').trim().replace(/\s+/g, '').replace(',', '.');
    const number = Number(normalized);
    return Number.isFinite(number) ? number : NaN;
  }

  function currentElapsedMs() {
    return running ? accumulatedMs + (performance.now() - startedAt) : accumulatedMs;
  }

  function formatStopwatch(milliseconds) {
    const totalCentiseconds = Math.floor(milliseconds / 10);
    const centiseconds = totalCentiseconds % 100;
    const totalSeconds = Math.floor(totalCentiseconds / 100);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
  }

  function formatNumber(value, maximumFractionDigits = 2) {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits
    }).format(value);
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function updateDisplay() {
    display.textContent = formatStopwatch(currentElapsedMs());
  }

  function start() {
    if (running) return;
    running = true;
    startedAt = performance.now();
    status.textContent = `Cronometrando a coleta de ${selectedPoint}…`;
    timerId = window.setInterval(updateDisplay, 30);
    updateDisplay();
  }

  function pause() {
    if (!running) return;
    accumulatedMs += performance.now() - startedAt;
    running = false;
    window.clearInterval(timerId);
    timerId = null;
    updateDisplay();
    status.textContent = 'Cronômetro pausado. Toque em Inserir para usar esse tempo.';
  }

  function resetStopwatch(clearSeconds = true) {
    running = false;
    startedAt = 0;
    accumulatedMs = 0;
    window.clearInterval(timerId);
    timerId = null;
    updateDisplay();
    if (clearSeconds) secondsInput.value = '';
    status.textContent = `Pronto para medir ${selectedPoint}.`;
    calculate();
  }

  function insertElapsed() {
    if (running) pause();
    const elapsedSeconds = currentElapsedMs() / 1000;
    if (elapsedSeconds <= 0) {
      status.textContent = 'Inicie o cronômetro antes de inserir o tempo.';
      return;
    }
    secondsInput.value = elapsedSeconds.toFixed(2).replace('.', ',');
    status.textContent = 'Tempo inserido no cálculo.';
    calculate();
    secondsInput.focus({ preventScroll: true });
  }

  function calculate() {
    const volumeMl = parseDecimal(volumeInput.value);
    const seconds = parseDecimal(secondsInput.value);

    if (!(volumeMl > 0) || !(seconds > 0)) {
      currentMeasurement = null;
      flowLh.textContent = '— L/h';
      flowMls.textContent = 'Informe volume e tempo válidos.';
      saveButton.disabled = true;
      return null;
    }

    const millilitersPerSecond = volumeMl / seconds;
    const litersPerHour = millilitersPerSecond * 3.6;
    currentMeasurement = { volumeMl, seconds, millilitersPerSecond, flowLh: litersPerHour };
    flowLh.textContent = `${formatNumber(litersPerHour, 2)} L/h`;
    flowMls.textContent = `${formatNumber(millilitersPerSecond, 3)} mL/s · ${formatNumber(volumeMl / 1000, 3)} L coletados`;
    saveButton.disabled = false;
    return currentMeasurement;
  }

  function selectPoint(point) {
    if (!POINTS.includes(point)) return;
    selectedPoint = point;
    localStorage.setItem(SELECTED_POINT_KEY, selectedPoint);
    document.querySelectorAll('.point-option').forEach(button => {
      const active = button.dataset.point === selectedPoint;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    });
    updateSelectedPointUi();
    renderHistory();
    status.textContent = `Pronto para medir ${selectedPoint}.`;
  }

  function updateSelectedPointUi() {
    const count = measurements[selectedPoint].length;
    selectedPointTitle.textContent = `Salvar próxima vazão em ${selectedPoint}`;
    selectedPointCount.textContent = `${count} ${count === 1 ? 'medição' : 'medições'}`;
    saveButtonTitle.textContent = `Salvar medição em ${selectedPoint}`;
  }

  function averageFor(point) {
    const items = measurements[point];
    if (!items.length) return 0;
    return items.reduce((sum, item) => sum + item.flowLh, 0) / items.length;
  }

  function saveMeasurement() {
    const calculated = calculate();
    if (!calculated) {
      saveFeedback.textContent = 'Informe um volume e um tempo válidos antes de salvar.';
      return;
    }

    measurements[selectedPoint].push({
      id: createId(),
      flowLh: calculated.flowLh,
      volumeMl: calculated.volumeMl,
      seconds: calculated.seconds,
      createdAt: new Date().toISOString()
    });
    persistMeasurements();
    renderHistory();
    updateSelectedPointUi();

    saveFeedback.textContent = `${formatNumber(calculated.flowLh, 2)} L/h salva em ${selectedPoint}.`;
    resetStopwatch(true);
    status.textContent = `Medição salva em ${selectedPoint}. Pronto para a próxima coleta.`;
    window.setTimeout(() => {
      if (saveFeedback.textContent.includes('salva em')) saveFeedback.textContent = '';
    }, 3500);
  }

  function deleteMeasurement(point, id) {
    if (!POINTS.includes(point)) return;
    measurements[point] = measurements[point].filter(item => item.id !== id);
    persistMeasurements();
    renderHistory();
    updateSelectedPointUi();
  }

  function clearPoint(point) {
    if (!POINTS.includes(point) || !measurements[point].length) return;
    if (!window.confirm(`Apagar todas as medições de ${point}?`)) return;
    measurements[point] = [];
    persistMeasurements();
    renderHistory();
    updateSelectedPointUi();
  }

  function clearAllMeasurements() {
    const total = POINTS.reduce((sum, point) => sum + measurements[point].length, 0);
    if (!total) return;
    if (!window.confirm('Apagar todas as medições de B1, B2, B3 e T1?')) return;
    measurements = emptyMeasurements();
    persistMeasurements();
    renderHistory();
    updateSelectedPointUi();
  }

  function renderHistory() {
    historyList.innerHTML = POINTS.map(point => {
      const items = measurements[point];
      const average = averageFor(point);
      const activeClass = point === selectedPoint ? ' active' : '';
      const open = point === selectedPoint ? ' open' : '';
      const rows = items.length
        ? [...items].reverse().map((item, reverseIndex) => {
            const number = items.length - reverseIndex;
            return `<li class="flow-record-row">
              <div class="flow-record-main">
                <strong>${number}. ${formatNumber(item.flowLh, 2)} L/h</strong>
                <span>${formatNumber(item.volumeMl, 1)} mL em ${formatNumber(item.seconds, 2)} s · ${formatDateTime(item.createdAt)}</span>
              </div>
              <button type="button" class="delete-flow-record" data-action="delete" data-point="${point}" data-id="${item.id}" aria-label="Excluir medição ${number} de ${point}">×</button>
            </li>`;
          }).join('')
        : '<li class="flow-empty-row">Nenhuma medição salva.</li>';

      return `<details class="flow-point-history${activeClass}" data-history-point="${point}"${open}>
        <summary>
          <span class="flow-point-name">${point}</span>
          <span class="flow-point-summary">
            <strong>${items.length ? `${formatNumber(average, 2)} L/h` : '— L/h'}</strong>
            <small>${items.length} ${items.length === 1 ? 'medição' : 'medições'}</small>
          </span>
          <span class="flow-history-chevron">⌄</span>
        </summary>
        <div class="flow-point-content">
          <div class="flow-average-banner">
            <span>Média final de ${point}</span>
            <strong>${items.length ? `${formatNumber(average, 2)} L/h` : 'Sem dados'}</strong>
          </div>
          <ol class="flow-record-list">${rows}</ol>
          <button type="button" class="clear-point-flows" data-action="clear-point" data-point="${point}" ${items.length ? '' : 'disabled'}>Limpar medições de ${point}</button>
        </div>
      </details>`;
    }).join('');
  }

  function clearCalculator() {
    volumeInput.value = '';
    secondsInput.value = '';
    saveFeedback.textContent = '';
    calculate();
    volumeInput.focus();
  }

  document.getElementById('start-stopwatch').addEventListener('click', start);
  document.getElementById('pause-stopwatch').addEventListener('click', pause);
  document.getElementById('reset-stopwatch').addEventListener('click', () => resetStopwatch(true));
  document.getElementById('insert-stopwatch').addEventListener('click', insertElapsed);
  document.getElementById('clear-calculator').addEventListener('click', clearCalculator);
  document.getElementById('clear-all-flows').addEventListener('click', clearAllMeasurements);
  saveButton.addEventListener('click', saveMeasurement);
  volumeInput.addEventListener('input', calculate);
  secondsInput.addEventListener('input', calculate);

  document.querySelector('.point-selector').addEventListener('click', event => {
    const button = event.target.closest('.point-option');
    if (button) selectPoint(button.dataset.point);
  });

  historyList.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    if (button.dataset.action === 'delete') deleteMeasurement(button.dataset.point, button.dataset.id);
    if (button.dataset.action === 'clear-point') clearPoint(button.dataset.point);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateDisplay();
  });

  updateDisplay();
  calculate();
  selectPoint(selectedPoint);
})();
