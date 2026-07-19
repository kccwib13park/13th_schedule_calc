import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIXED_HOLIDAYS_2026,
  MONTH_PRESETS_2026,
  addDays,
  analyzeSchedule,
  calculateHolidaySummary,
  createPeriodRange,
  formatDateUTC,
  getMonthPreset,
  getStaffingOptions,
  getStaffingSelection,
  toDate,
  toMonday
} from '../assets/schedule-engine.js';

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
    '요일별 필수 인원은 총 인원 수를 초과할 수 없습니다.'
  );
  assert.equal(
    analyzeSchedule(config({ basic: 3 })).inputError,
    '기본휴일 3일은 기간 내 4주 규칙(주당 1~2회)과 맞지 않습니다. (4~8일 필요)'
  );
});

test('shortage is accumulated worker-days, not a count of dates', () => {
  const result = analyzeSchedule(config({ workers: 2, monSat: 2, sun: 2 }));
  assert.deepEqual(result, {
    ok: false, totalDays: 28, totalReq: 56, maxCovered: 40,
    shortage: 16, weeksCount: 4, inputError: ''
  });
  assert.equal(result.totalReq - result.maxCovered, result.shortage);
});

test('non-integer, negative and oversized inputs are rejected', () => {
  assert.match(analyzeSchedule(config({ workers: 1.5 })).inputError, /1 이상 정수/);
  assert.match(analyzeSchedule(config({ bonus: -1 })).inputError, /0 이상/);
  assert.match(analyzeSchedule(config({ basic: 28, bonus: 1 })).inputError, /주당 1~2회/);
});
