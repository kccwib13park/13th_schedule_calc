import {
  FIXED_HOLIDAYS_2026,
  MONTH_PRESETS_2026,
  addDays,
  analyzeSchedule,
  calculateHolidaySummary,
  detectMonthSwipe,
  formatDateUTC,
  getAdjacentMonth,
  getStaffingSelection,
  toDate,
  toMonday
} from './schedule-engine.js';

const DEFAULT_MONTH = 8;
const DEFAULT_WORKERS = 6;
const weekdayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

const elements = {
  form: document.getElementById('schedule-form'),
  monthSection: document.querySelector('.month-section'),
  monthSelect: document.getElementById('month_select'),
  previousMonth: document.getElementById('prev_month'),
  nextMonth: document.getElementById('next_month'),
  reset: document.getElementById('refresh_btn'),
  startDate: document.getElementById('start_date'),
  startDateDisplay: document.getElementById('start_date_display'),
  endDate: document.getElementById('end_date'),
  endDateDisplay: document.getElementById('end_date_display'),
  weeks: document.getElementById('weeks'),
  workers: document.getElementById('workers'),
  workersDecrement: document.getElementById('workers_decrement'),
  workersIncrement: document.getElementById('workers_increment'),
  monSat: document.getElementById('mon_sat'),
  sun: document.getElementById('sun'),
  basic: document.getElementById('basic'),
  bonus: document.getElementById('bonus'),
  holidayMonthly: document.getElementById('holiday_monthly'),
  adjustmentNotice: document.getElementById('adjustment_notice'),
  calculateButton: document.getElementById('calculate_button'),
  result: document.getElementById('result')
};

let isCalculating = false;
let hasCalculated = false;
let swipeStart = null;

const formatDateWithWeekday = (date) => (
  `${formatDateUTC(date)} (${weekdayNames[date.getUTCDay()]})`
);

const updateMonthButtons = () => {
  const month = Number(elements.monthSelect.value);
  elements.previousMonth.disabled = month === 1;
  elements.nextMonth.disabled = month === 12;
};

const invalidateResult = () => {
  if (!hasCalculated || isCalculating) return;
  elements.result.className = 'result stale';
  elements.result.textContent = '조건이 변경되었습니다. 다시 계산해 결과를 갱신하세요.';
};

const autoFillHolidayInputs = () => {
  if (!elements.startDate.value || !elements.endDate.value) return;
  const start = toDate(elements.startDate.value);
  const end = toDate(elements.endDate.value);
  if (start > end) return;

  const { weekendCount, holidayCount, monthly } = calculateHolidaySummary(
    start,
    end,
    FIXED_HOLIDAYS_2026
  );
  elements.basic.value = weekendCount;
  elements.bonus.value = holidayCount;

  const monthlyText = Object.keys(monthly)
    .sort()
    .map((month) => `${month}: ${monthly[month]}일`)
    .join(' / ') || '0일';
  elements.holidayMonthly.textContent = `월별 공휴일(주말 제외): ${monthlyText}`;
};

const syncRangeByStartAndWeeks = (showAlert = false) => {
  if (!elements.startDate.value) return;
  let start = toDate(elements.startDate.value);

  if (start.getUTCDay() !== 1) {
    start = toMonday(start);
    if (showAlert) alert('시작일은 월요일만 가능합니다. 선택한 날짜의 해당 주 월요일로 자동 수정합니다.');
    elements.startDate.value = formatDateUTC(start);
  }

  let weeks = Number(elements.weeks.value);
  if (![4, 5].includes(weeks)) {
    if (showAlert) alert('주차는 4 또는 5만 입력 가능합니다. 기본값 4로 설정합니다.');
    weeks = 4;
    elements.weeks.value = '4';
  }

  elements.startDateDisplay.value = formatDateWithWeekday(start);
  const end = addDays(start, weeks * 7 - 1);
  elements.endDate.value = formatDateUTC(end);
  elements.endDateDisplay.value = formatDateWithWeekday(end);
  autoFillHolidayInputs();
};

const applyMonthPreset = ({ invalidate = true } = {}) => {
  const preset = MONTH_PRESETS_2026[Number(elements.monthSelect.value)];
  if (!preset) return;
  elements.startDate.value = preset.start;
  elements.weeks.value = String(preset.weeks);
  syncRangeByStartAndWeeks(false);
  updateMonthButtons();
  if (invalidate) invalidateResult();
};

const changeMonth = (direction) => {
  const current = Number(elements.monthSelect.value);
  const next = getAdjacentMonth(current, direction);
  if (next === null || next === current) return;
  elements.monthSelect.value = String(next);
  applyMonthPreset();
};

const setOptions = (select, options) => {
  select.replaceChildren(...options.map((count) => {
    const option = document.createElement('option');
    option.value = String(count);
    option.textContent = String(count);
    return option;
  }));
};

const refreshRequiredOptions = ({ initialize = false, announce = false } = {}) => {
  const workers = Number(elements.workers.value);
  if (!Number.isInteger(workers) || workers < 1) return;

  const previous = {
    monSat: Number(elements.monSat.value),
    sun: Number(elements.sun.value)
  };
  const selection = getStaffingSelection(workers, previous, { initialize });
  setOptions(elements.monSat, selection.options);
  setOptions(elements.sun, selection.options);
  elements.monSat.value = String(selection.monSat);
  elements.sun.value = String(selection.sun);

  const changes = [];
  if (!initialize && Number.isInteger(previous.monSat) && previous.monSat !== selection.monSat) {
    changes.push(`월~토 ${previous.monSat}명 → ${selection.monSat}명`);
  }
  if (!initialize && Number.isInteger(previous.sun) && previous.sun !== selection.sun) {
    changes.push(`일요일 ${previous.sun}명 → ${selection.sun}명`);
  }
  elements.adjustmentNotice.textContent = announce && changes.length
    ? `총인원 ${workers}명에서 선택할 수 있는 범위에 맞춰 ${changes.join(', ')}으로 자동 조정했습니다.`
    : '';
};

const updateWorkers = (delta) => {
  const current = Number(elements.workers.value);
  elements.workers.value = String(Math.max(1, (Number.isInteger(current) ? current : 1) + delta));
  elements.workers.dispatchEvent(new Event('input', { bubbles: true }));
};

const resetInitialState = () => {
  elements.monthSelect.value = String(DEFAULT_MONTH);
  elements.workers.value = String(DEFAULT_WORKERS);
  elements.adjustmentNotice.textContent = '';
  refreshRequiredOptions({ initialize: true });
  applyMonthPreset({ invalidate: false });
  hasCalculated = false;
  elements.result.style.display = 'none';
  elements.result.className = 'result';
  elements.result.textContent = '';
};

const buildConfig = () => ({
  startDate: toDate(elements.startDate.value),
  endDate: toDate(elements.endDate.value),
  workers: Number(elements.workers.value),
  basic: Number(elements.basic.value),
  bonus: Number(elements.bonus.value),
  required: [
    Number(elements.sun.value),
    ...Array(6).fill(Number(elements.monSat.value))
  ]
});

const focusResult = () => {
  const rect = elements.result.getBoundingClientRect();
  const outsideViewport = rect.top < 0 || rect.bottom > window.innerHeight;
  elements.result.focus({ preventScroll: true });
  if (outsideViewport) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    elements.result.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
  }
};

const renderScheduleResult = (scheduleResult) => {
  elements.result.style.display = 'block';
  if (scheduleResult.inputError) {
    elements.result.className = 'result error';
    elements.result.innerHTML = `❌ <b>입력 조건이 규칙과 충돌합니다.</b><br>${scheduleResult.inputError}`;
    return;
  }

  const statHtml = `<div class="stats">
    <div class="stat">기간 일수<br><b>${scheduleResult.totalDays}일</b></div>
    <div class="stat">필요 근무 총합<br><b>${scheduleResult.totalReq}회</b></div>
    <div class="stat">최대 충족 가능<br><b>${scheduleResult.maxCovered}회</b></div>
  </div>`;
  const selectedMonth = Number(elements.monthSelect.value);

  if (scheduleResult.ok) {
    elements.result.className = 'result success';
    elements.result.innerHTML = `✅ <b>26년 ${selectedMonth}월에는 규칙대로 스케줄 작성이 가능합니다</b>${statHtml}`;
  } else {
    elements.result.className = 'result error';
    elements.result.innerHTML = `❌ <b>26년 ${selectedMonth}월에는 규칙대로 스케줄 작성이 불가능합니다.</b><br>필수 인원을 3명→2명으로 낮춰야 하는 최소 일수: <b>${scheduleResult.shortage}일</b>${statHtml}`;
  }
};

elements.previousMonth.addEventListener('click', () => changeMonth(-1));
elements.nextMonth.addEventListener('click', () => changeMonth(1));
elements.monthSelect.addEventListener('change', () => applyMonthPreset());
elements.reset.addEventListener('click', resetInitialState);
elements.workersDecrement.addEventListener('click', () => updateWorkers(-1));
elements.workersIncrement.addEventListener('click', () => updateWorkers(1));
elements.workers.addEventListener('input', () => {
  refreshRequiredOptions({ announce: true });
  invalidateResult();
});
elements.workers.addEventListener('change', invalidateResult);
elements.monSat.addEventListener('change', invalidateResult);
elements.sun.addEventListener('change', invalidateResult);

elements.monthSection.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.target.closest('button, input, select, label, a')) return;
  swipeStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
});

elements.monthSection.addEventListener('pointerup', (event) => {
  if (!swipeStart || swipeStart.id !== event.pointerId) return;
  const direction = detectMonthSwipe({
    deltaX: event.clientX - swipeStart.x,
    deltaY: event.clientY - swipeStart.y
  });
  swipeStart = null;
  if (direction) changeMonth(direction);
});

elements.monthSection.addEventListener('pointercancel', () => {
  swipeStart = null;
});

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isCalculating) return;

  isCalculating = true;
  elements.form.setAttribute('aria-busy', 'true');
  elements.calculateButton.disabled = true;
  elements.calculateButton.textContent = '계산 중…';
  elements.result.style.display = 'block';
  elements.result.className = 'result loading';
  elements.result.textContent = '입력 조건을 계산하고 있습니다.';

  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));

  try {
    syncRangeByStartAndWeeks(true);
    const scheduleResult = analyzeSchedule(buildConfig());
    renderScheduleResult(scheduleResult);
    hasCalculated = true;
    if (scheduleResult.inputError && !Number.isInteger(Number(elements.workers.value))) {
      elements.workers.focus();
    } else {
      focusResult();
    }
  } catch (error) {
    console.error(error);
    elements.result.className = 'result error';
    elements.result.textContent = '예상하지 못한 계산 오류가 발생했습니다. 입력값을 확인한 뒤 다시 시도해 주세요.';
    focusResult();
  } finally {
    isCalculating = false;
    elements.form.removeAttribute('aria-busy');
    elements.calculateButton.disabled = false;
    elements.calculateButton.textContent = '스케줄 가능 여부 계산';
  }
});

refreshRequiredOptions({ initialize: true });
applyMonthPreset({ invalidate: false });
