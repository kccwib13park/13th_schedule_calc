import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIXED_HOLIDAYS_2026,
  MONTH_PRESETS_2026,
  addDays,
  analyzeSchedule,
  buildResultSummaryModel,
  calculateHolidaySummary,
  createPeriodRange,
  formatDateUTC,
  detectMonthSwipe,
  getAdjacentMonth,
  getMonthPreset,
  getStaffingOptions,
  getStaffingSelection,
  toDate,
  toMonday,
  validateScheduleInput,
  VALIDATION_CODES
} from '../assets/schedule-engine.js';
import { analyzeScheduleLegacy } from './legacy-schedule-engine.mjs';

const config = ({
  start = '2026-01-05',
  end = '2026-02-01',
  workers = 6,
  basic = 8,
  bonus = 0,
  monSat = 4,
  sun = 2
} = {}) => ({
  startDate: toDate(start),
  endDate: toDate(end),
  workers,
  basic,
  bonus,
  required: [sun, monSat, monSat, monSat, monSat, monSat, monSat]
});

test('all 2026 presets start on Monday and end on the final Sunday', () => {
  assert.deepEqual(Object.keys(MONTH_PRESETS_2026).map(Number), Array.from({ length: 12 }, (_, i) => i + 1));
  for (const [month, preset] of Object.entries(MONTH_PRESETS_2026)) {
    const range = createPeriodRange(preset.start, preset.weeks);
    assert.equal(range.startDate.getUTCDay(), 1, `${month}월 시작일`);
    assert.equal(range.endDate.getUTCDay(), 0, `${month}월 종료일`);
    assert.equal(range.end, formatDateUTC(addDays(range.startDate, preset.weeks * 7 - 1)));
  }
});

test('4-week, 5-week, month-end and year-end ranges do not drift', () => {
  assert.deepEqual(createPeriodRange('2026-01-05', 4), {
    startDate: toDate('2026-01-05'), endDate: toDate('2026-02-01'),
    start: '2026-01-05', end: '2026-02-01', weeks: 4
  });
  assert.equal(createPeriodRange('2026-08-03', 5).end, '2026-09-06');
  assert.equal(createPeriodRange('2026-12-07', 4).end, '2027-01-03');
  assert.equal(formatDateUTC(toDate('2026-12-31')), '2026-12-31');
});

test('Sunday and other dates move to the Monday of their week', () => {
  assert.equal(formatDateUTC(toMonday(toDate('2026-08-09'))), '2026-08-03');
  assert.equal(formatDateUTC(toMonday(toDate('2026-08-06'))), '2026-08-03');
  assert.equal(formatDateUTC(toMonday(toDate('2026-08-03'))), '2026-08-03');
});

test('month preset lookup preserves all configured values', () => {
  assert.deepEqual(getMonthPreset(3), { start: '2026-03-02', weeks: 5 });
  assert.deepEqual(getMonthPreset('12'), { start: '2026-12-07', weeks: 4 });
  assert.equal(getMonthPreset(13), null);
});

test('month navigation stops at January and December boundaries', () => {
  assert.equal(getAdjacentMonth(1, -1), 1);
  assert.equal(getAdjacentMonth(1, 1), 2);
  assert.equal(getAdjacentMonth(12, 1), 12);
  assert.equal(getAdjacentMonth(12, -1), 11);
  assert.equal(getAdjacentMonth(13, 1), null);
});

test('month swipe requires a deliberate horizontal gesture', () => {
  assert.equal(detectMonthSwipe({ deltaX: -60, deltaY: 8 }), 1);
  assert.equal(detectMonthSwipe({ deltaX: 60, deltaY: 8 }), -1);
  assert.equal(detectMonthSwipe({ deltaX: -30, deltaY: 2 }), 0);
  assert.equal(detectMonthSwipe({ deltaX: -60, deltaY: 80 }), 0);
  assert.equal(detectMonthSwipe({ deltaX: 50, deltaY: 40 }), 0);
});

test('weekends and weekday holidays are counted without overlap', () => {
  assert.deepEqual(calculateHolidaySummary(toDate('2026-01-05'), toDate('2026-02-01')), {
    weekendCount: 8, holidayCount: 0, monthly: {}
  });
  assert.deepEqual(calculateHolidaySummary(toDate('2026-08-03'), toDate('2026-09-06')), {
    weekendCount: 10, holidayCount: 1, monthly: { '2026-08': 1 }
  });
  const holidays = new Set([...FIXED_HOLIDAYS_2026, '2026-08-08']);
  assert.equal(calculateHolidaySummary(toDate('2026-08-03'), toDate('2026-08-09'), holidays).holidayCount, 0);
});

test('holiday counting works across month boundaries and without holidays', () => {
  const summary = calculateHolidaySummary(toDate('2026-09-07'), toDate('2026-10-04'));
  assert.equal(summary.weekendCount, 8);
  assert.equal(summary.holidayCount, 2);
  assert.deepEqual(summary.monthly, { '2026-09': 2 });
});

test('staffing options preserve current selections and clamp only invalid values', () => {
  assert.deepEqual(getStaffingOptions(1), [1]);
  assert.deepEqual(getStaffingOptions(2), [1]);
  assert.deepEqual(getStaffingOptions(3), [1, 2]);
  assert.deepEqual(getStaffingOptions(6), [1, 2, 3, 4, 5]);
  assert.deepEqual(getStaffingSelection(6, {}, { initialize: true }), {
    options: [1, 2, 3, 4, 5], monSat: 4, sun: 2
  });
  assert.deepEqual(getStaffingSelection(6, { monSat: 3, sun: 1 }), {
    options: [1, 2, 3, 4, 5], monSat: 3, sun: 1
  });
  assert.deepEqual(getStaffingSelection(3, { monSat: 4, sun: 3 }), {
    options: [1, 2], monSat: 2, sun: 2
  });
});

test('baseline outputs remain fixed for representative 4-week and 5-week months', () => {
  assert.deepEqual(analyzeSchedule(config()), {
    ok: true, totalDays: 28, totalReq: 104, maxCovered: 104,
    shortage: 0, weeksCount: 4, inputError: ''
  });
  assert.deepEqual(analyzeSchedule(config({
    start: '2026-08-03', end: '2026-09-06', basic: 10, bonus: 1
  })), {
    ok: true, totalDays: 35, totalReq: 130, maxCovered: 130,
    shortage: 0, weeksCount: 5, inputError: ''
  });
});

test('workers 1, 2, 3 and 6 preserve baseline feasibility results', () => {
  assert.deepEqual(analyzeSchedule(config({ workers: 1, monSat: 1, sun: 1 })), {
    ok: false, totalDays: 28, totalReq: 28, maxCovered: 20,
    shortage: 8, weeksCount: 4, inputError: ''
  });
  assert.equal(analyzeSchedule(config({ workers: 2, monSat: 1, sun: 1 })).ok, true);
  assert.equal(analyzeSchedule(config({ workers: 3, monSat: 2, sun: 2 })).ok, true);
  assert.equal(analyzeSchedule(config({ workers: 6 })).ok, true);
});

test('minimum staffing above workers and weekly basic-off conflicts are input errors', () => {
  assert.equal(
    analyzeSchedule(config({ workers: 3, monSat: 4 })).inputError,
    '최소 근무자는 총인원을 초과할 수 없습니다. 총인원 또는 최소 근무자를 조정해 주세요.'
  );
  assert.equal(
    analyzeSchedule(config({ basic: 3 })).inputError,
    '기본휴일 3일은 4주 동안 주당 1~2회 규칙을 충족하지 않습니다. 4~8일이어야 합니다.'
  );
});

test('shortage is accumulated worker-days, not a count of dates', () => {
  const result = analyzeSchedule(config({ workers: 2, monSat: 2, sun: 2 }));
  assert.deepEqual(result, {
    ok: false, totalDays: 28, totalReq: 56, maxCovered: 40,
    shortage: 16, weeksCount: 4, inputError: ''
  });
  assert.equal(result.totalReq - result.maxCovered, result.shortage);

  const model = buildResultSummaryModel(config({ workers: 2, monSat: 2, sun: 2 }), result, 1);
  assert.equal(model.status, 'infeasible');
  assert.equal(model.description, '필수 근무 인원 조건을 충족하지 못하는 총 부족량: 16인·일');
  assert.deepEqual(model.metrics.at(-1), ['총 부족량', '16인·일']);
  assert.doesNotMatch(JSON.stringify(model), /3명→2명|최소 일수/);
});

test('result summary is derived from the selected staffing inputs', () => {
  const scheduleConfig = config({ workers: 6, monSat: 3, sun: 1 });
  const result = analyzeSchedule(scheduleConfig);
  const model = buildResultSummaryModel(scheduleConfig, result, 1);
  assert.equal(model.title, '2026년 1월은 현재 조건으로 스케줄 작성이 가능합니다.');
  assert.ok(model.metrics.some(([label, value]) => label === '월~토 최소 근무자' && value === '3명'));
  assert.ok(model.metrics.some(([label, value]) => label === '일요일 최소 근무자' && value === '1명'));
  assert.ok(model.metrics.some(([label, value]) => label === '필요 근무량' && value.endsWith('인·일')));
});

test('period errors expose a stable code and field', () => {
  const invalid = config({ start: '2026-02-02', end: '2026-01-05' });
  assert.deepEqual(validateScheduleInput(invalid), {
    code: VALIDATION_CODES.PERIOD_INVALID,
    field: 'period',
    message: '계산 기간이 올바르지 않습니다. 월을 다시 선택해 주세요.'
  });
});

test('optimized weekly DP matches the legacy daily DP across small valid inputs', () => {
  const periods = [
    { start: '2026-01-05', end: '2026-02-01', weeks: 4 },
    { start: '2026-08-03', end: '2026-09-06', weeks: 5 }
  ];
  let comparisons = 0;

  for (const period of periods) {
    for (let workers = 1; workers <= 3; workers += 1) {
      for (const basic of [period.weeks, period.weeks * 2]) {
        for (const bonus of [0, 1]) {
          for (let monSat = 0; monSat <= workers; monSat += 1) {
            for (let sun = 0; sun <= workers; sun += 1) {
              const input = config({ ...period, workers, basic, bonus, monSat, sun });
              const optimized = analyzeSchedule(input);
              const legacy = analyzeScheduleLegacy(input);
              assert.deepEqual(
                {
                  ok: optimized.ok,
                  inputErrorCode: optimized.inputErrorCode,
                  totalDays: optimized.totalDays,
                  totalReq: optimized.totalReq,
                  maxCovered: optimized.maxCovered,
                  shortage: optimized.shortage,
                  weeksCount: optimized.weeksCount
                },
                legacy,
                JSON.stringify({ period, workers, basic, bonus, monSat, sun })
              );
              comparisons += 1;
            }
          }
        }
      }
    }
  }

  assert.equal(comparisons, 232);
});

test('non-integer, negative and oversized inputs are rejected', () => {
  assert.match(analyzeSchedule(config({ workers: 1.5 })).inputError, /1명 이상의 정수/);
  assert.match(analyzeSchedule(config({ bonus: -1 })).inputError, /0일 이상/);
  assert.match(analyzeSchedule(config({ basic: 28, bonus: 1 })).inputError, /주당 1~2회/);
});
