import {
  FIXED_HOLIDAYS_2026,
  MONTH_PRESETS_2026,
  addDays,
  analyzeSchedule,
  calculateHolidaySummary,
  formatDateUTC,
  getStaffingSelection,
  toDate,
  toMonday
} from './schedule-engine.js';

const formatDateWithWeekday = (date) => {
  const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  return `${formatDateUTC(date)} (${days[date.getUTCDay()]})`;
};

const applyMonthPreset = () => {
  const month = Number(document.getElementById('month_select').value);
  const preset = MONTH_PRESETS_2026[month];
  if (!preset) return;
  document.getElementById('start_date').value = preset.start;
  document.getElementById('start_date_display').value = formatDateWithWeekday(toDate(preset.start));
  document.getElementById('weeks').value = String(preset.weeks);
  syncRangeByStartAndWeeks(false);
  const resultBox = document.getElementById('result');
  if (resultBox) {
    resultBox.style.display = 'none';
    resultBox.innerHTML = '';
  }
};

const syncRangeByStartAndWeeks = (showAlert = false) => {
  const startInput = document.getElementById('start_date');
  const startDisplay = document.getElementById('start_date_display');
  const endInput = document.getElementById('end_date');
  const endDisplay = document.getElementById('end_date_display');
  const weeksInput = document.getElementById('weeks');
  if (!startInput.value) return;

  let start = toDate(startInput.value);
  if (start.getUTCDay() !== 1) {
    const fixedMonday = toMonday(start);
    if (showAlert) alert('시작일은 월요일만 가능합니다. 선택한 날짜의 해당 주 월요일로 자동 수정합니다.');
    start = fixedMonday;
    startInput.value = formatDateUTC(start);
  }

  let weeks = Number(weeksInput.value);
  if (![4, 5].includes(weeks)) {
    if (showAlert) alert('주차는 4 또는 5만 입력 가능합니다. 기본값 4로 설정합니다.');
    weeks = 4;
    weeksInput.value = '4';
  }

  startDisplay.value = formatDateWithWeekday(start);
  const end = addDays(start, weeks * 7 - 1);
  endInput.value = formatDateUTC(end);
  endDisplay.value = formatDateWithWeekday(end);
  autoFillHolidayInputs();
};

const autoFillHolidayInputs = () => {
  const startValue = document.getElementById('start_date').value;
  const endValue = document.getElementById('end_date').value;
  if (!startValue || !endValue) return;

  const start = toDate(startValue);
  const end = toDate(endValue);
  if (start > end) return;

  const { weekendCount, holidayCount, monthly } = calculateHolidaySummary(
    start,
    end,
    FIXED_HOLIDAYS_2026
  );
  document.getElementById('basic').value = weekendCount;
  document.getElementById('bonus').value = holidayCount;

  const monthlyText = Object.keys(monthly)
    .sort()
    .map((month) => `${month}: ${monthly[month]}일`)
    .join(' / ') || '월별 공휴일(주말 제외): 0일';
  document.getElementById('holiday_monthly').textContent = `월별 공휴일(주말 제외): ${monthlyText}`;
};

const refreshRequiredOptions = () => {
  const workers = Number(document.getElementById('workers').value) || 0;
  const selection = getStaffingSelection(workers, {}, { initialize: true });

  for (const id of ['mon_sat', 'sun']) {
    const select = document.getElementById(id);
    select.innerHTML = '';
    for (const count of selection.options) {
      const option = document.createElement('option');
      option.value = String(count);
      option.textContent = String(count);
      select.appendChild(option);
    }
  }

  document.getElementById('mon_sat').value = String(selection.monSat);
  document.getElementById('sun').value = String(selection.sun);
};

const form = document.getElementById('schedule-form');
const monthSelect = document.getElementById('month_select');
const refreshBtn = document.getElementById('refresh_btn');
const result = document.getElementById('result');
const workersInput = document.getElementById('workers');

monthSelect.addEventListener('change', applyMonthPreset);
refreshBtn.addEventListener('click', () => window.location.reload());
workersInput.addEventListener('change', refreshRequiredOptions);

refreshRequiredOptions();
applyMonthPreset();

form.addEventListener('submit', (event) => {
  event.preventDefault();
  syncRangeByStartAndWeeks(true);

  const config = {
    startDate: toDate(document.getElementById('start_date').value),
    endDate: toDate(document.getElementById('end_date').value),
    workers: Number(document.getElementById('workers').value),
    basic: Number(document.getElementById('basic').value),
    bonus: Number(document.getElementById('bonus').value),
    required: [
      Number(document.getElementById('sun').value),
      ...Array(6).fill(Number(document.getElementById('mon_sat').value))
    ]
  };

  const scheduleResult = analyzeSchedule(config);
  result.style.display = 'block';

  if (scheduleResult.inputError) {
    result.className = 'result error';
    result.innerHTML = `❌ <b>입력 조건이 규칙과 충돌합니다.</b><br>${scheduleResult.inputError}`;
    return;
  }

  const statHtml = `<div class="stats">
    <div class="stat">기간 일수<br><b>${scheduleResult.totalDays}일</b></div>
    <div class="stat">필요 근무 총합<br><b>${scheduleResult.totalReq}회</b></div>
    <div class="stat">최대 충족 가능<br><b>${scheduleResult.maxCovered}회</b></div>
  </div>`;

  const selectedMonth = Number(document.getElementById('month_select').value);
  if (scheduleResult.ok) {
    result.className = 'result success';
    result.innerHTML = `✅ <b>26년 ${selectedMonth}월에는 규칙대로 스케줄 작성이 가능합니다</b>${statHtml}`;
  } else {
    result.className = 'result error';
    result.innerHTML = `❌ <b>26년 ${selectedMonth}월에는 규칙대로 스케줄 작성이 불가능합니다.</b><br>필수 인원을 3명→2명으로 낮춰야 하는 최소 일수: <b>${scheduleResult.shortage}일</b>${statHtml}`;
  }
});
