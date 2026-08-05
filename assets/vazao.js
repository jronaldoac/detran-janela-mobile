(() => {
  'use strict';

  const display = document.getElementById('stopwatch-display');
  const status = document.getElementById('stopwatch-status');
  const volumeInput = document.getElementById('volume-ml');
  const secondsInput = document.getElementById('elapsed-seconds');
  const flowLh = document.getElementById('flow-lh');
  const flowMls = document.getElementById('flow-mls');

  let running = false;
  let startedAt = 0;
  let accumulatedMs = 0;
  let timerId = null;

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

  function updateDisplay() {
    display.textContent = formatStopwatch(currentElapsedMs());
  }

  function start() {
    if (running) return;
    running = true;
    startedAt = performance.now();
    status.textContent = 'Cronometrando a coleta…';
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

  function reset() {
    running = false;
    startedAt = 0;
    accumulatedMs = 0;
    window.clearInterval(timerId);
    timerId = null;
    updateDisplay();
    secondsInput.value = '';
    status.textContent = 'Pronto para iniciar.';
    calculate();
  }

  function insertElapsed() {
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

  function formatNumber(value, maximumFractionDigits = 2) {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits
    }).format(value);
  }

  function calculate() {
    const volumeMl = parseDecimal(volumeInput.value);
    const seconds = parseDecimal(secondsInput.value);

    if (!(volumeMl > 0) || !(seconds > 0)) {
      flowLh.textContent = '— L/h';
      flowMls.textContent = 'Informe volume e tempo válidos.';
      return;
    }

    const millilitersPerSecond = volumeMl / seconds;
    const litersPerHour = millilitersPerSecond * 3.6;
    flowLh.textContent = `${formatNumber(litersPerHour, 2)} L/h`;
    flowMls.textContent = `${formatNumber(millilitersPerSecond, 3)} mL/s · ${formatNumber(volumeMl / 1000, 3)} L coletados`;
  }

  function clearCalculator() {
    volumeInput.value = '';
    secondsInput.value = '';
    calculate();
    volumeInput.focus();
  }

  document.getElementById('start-stopwatch').addEventListener('click', start);
  document.getElementById('pause-stopwatch').addEventListener('click', pause);
  document.getElementById('reset-stopwatch').addEventListener('click', reset);
  document.getElementById('insert-stopwatch').addEventListener('click', insertElapsed);
  document.getElementById('clear-calculator').addEventListener('click', clearCalculator);
  volumeInput.addEventListener('input', calculate);
  secondsInput.addEventListener('input', calculate);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateDisplay();
  });

  updateDisplay();
  calculate();
})();
