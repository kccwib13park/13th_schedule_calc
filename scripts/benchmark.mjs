import { performance } from 'node:perf_hooks';

import { analyzeSchedule, getMonthPreset, createPeriodRange, toDate } from '../assets/schedule-engine.js';

const makeConfig = ({ month, workers, monSat, sun }) => {
  const preset = getMonthPreset(month);
  const range = createPeriodRange(preset.start, preset.weeks);
  return {
    startDate: toDate(range.start),
    endDate: toDate(range.end),
    workers,
    basic: range.weeks * 2,
    bonus: month === 8 ? 1 : 0,
    required: [sun, monSat, monSat, monSat, monSat, monSat, monSat]
  };
};

const cases = [
  { label: '6명 4주 가능', month: 1, workers: 6, monSat: 4, sun: 2 },
  { label: '6명 5주 불가능', month: 8, workers: 6, monSat: 6, sun: 6 },
  { label: '10명 4주 가능', month: 1, workers: 10, monSat: 4, sun: 2 },
  { label: '10명 5주 불가능', month: 8, workers: 10, monSat: 10, sun: 10 },
  { label: '20명 4주 가능', month: 1, workers: 20, monSat: 4, sun: 2 },
  { label: '20명 5주 불가능', month: 8, workers: 20, monSat: 20, sun: 20 },
  { label: '50명 4주 가능', month: 1, workers: 50, monSat: 4, sun: 2 },
  { label: '50명 5주 불가능', month: 8, workers: 50, monSat: 50, sun: 50 }
];

const results = cases.map((benchmarkCase) => {
  const config = makeConfig(benchmarkCase);
  const startedAt = performance.now();
  const result = analyzeSchedule(config);
  return {
    case: benchmarkCase.label,
    milliseconds: Number((performance.now() - startedAt).toFixed(3)),
    feasible: result.ok,
    shortage: result.shortage
  };
});

console.table(results);
