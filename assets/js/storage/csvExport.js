/* 개인 기록을 CSV 로 내려받아요. 엑셀에서 한글이 깨지지 않도록 BOM 을 붙여요. */
(function (root) {
  'use strict';
  var GD = root.GD = root.GD || {};
  var MODE_NAMES = { game: '게임모드', research: '연구자모드', challenge: '실험도전모드' };
  var COLUMNS = [
    ['모드', function (r) { return MODE_NAMES[r.mode] || r.mode; }],
    ['함수 ID', function (r) { return r.functionId; }],
    ['함수 이름', function (r) { return r.functionName; }],
    ['실험 날짜', function (r) { return localTime(r.createdAt); }],
    ['닉네임', function (r) { return r.nickname || ''; }],
    ['학습률', function (r) { return r.alpha; }],
    ['시작 위치', function (r) { return r.start; }],
    ['최대 반복 횟수', function (r) { return r.maxIter; }],
    ['반복 횟수', function (r) { return r.iterations; }],
    ['최종 위치', function (r) { return r.finalX; }],
    ['최종 Loss', function (r) { return r.finalLoss; }],
    ['결과', function (r) { return r.statusLabel; }],
    ['성공 여부', function (r) { return r.success ? '성공' : '미도달'; }],
    ['점수', function (r) { return r.score == null ? '' : r.score; }]
  ];
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function localTime(iso) {
    var d = new Date(iso); if (isNaN(d)) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function cell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  function toCSV(records) {
    var lines = [COLUMNS.map(function (c) { return cell(c[0]); }).join(',')];
    records.forEach(function (r) { lines.push(COLUMNS.map(function (c) { return cell(c[1](r)); }).join(',')); });
    return lines.join('\r\n');
  }
  function downloadText(csvText, filename) {
    var blob = new Blob(['\ufeff' + csvText], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename || 'gradient_descent_records.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }
  function download(records, filename) { downloadText(toCSV(records), filename); }
  // 한 실험의 모든 n에 대해 위치, 기울기, Loss, 실제 다음 이동을 남겨요.
  // 발산으로 CLIP 처리된 마지막 이동도 실제 기록된 위치와 수식 예측을 따로 기록해요.
  var STEP_COLS = ['함수 ID', '함수 이름', '학습률 α', '시작 위치 x₀', '설정 최대 반복', 'n', '위치 xₙ', '기울기 f′(xₙ)', 'Loss f(xₙ)', '이론상 다음 위치', '기록된 다음 위치 xₙ₊₁', '실제 이동량 Δx', 'Loss 변화 ΔLoss', '종료 사유', '발산 제한 적용'];
  function stepRows(result, fn) {
    if (!result || !fn || !Array.isArray(result.xs)) return [];
    return result.xs.map(function (x, i) {
      var hasNext = i + 1 < result.xs.length, next = hasNext ? result.xs[i + 1] : null;
      return [fn.id, fn.name, result.alpha, result.start, result.maxIter, i, x, result.grads[i], result.losses[i],
        hasNext ? x - result.alpha * result.grads[i] : '',
        hasNext ? next : '', hasNext ? next - x : '', hasNext ? result.losses[i + 1] - result.losses[i] : '',
        result.stopReason, result.overflow && i === result.xs.length - 2 ? '예' : ''];
    });
  }
  function toStepCSV(result, fn) {
    var rows = [STEP_COLS];
    stepRows(result, fn).forEach(function (r) { rows.push(r); });
    return rows.map(function (r) { return r.map(cell).join(','); }).join('\r\n');
  }
  function downloadSteps(result, fn, filename) {
    downloadText(toStepCSV(result, fn), filename || 'gradient_descent_step_details.csv');
  }
  function toCompareStepCSV(items, fn) {
    var rows = [['비교 학습률', '시리즈', ...STEP_COLS]];
    (items || []).forEach(function (it, i) {
      stepRows(it.result, fn).forEach(function (row) { rows.push([it.alpha, i + 1].concat(row)); });
    });
    return rows.map(function (r) { return r.map(cell).join(','); }).join('\r\n');
  }
  GD.csv = { toCSV: toCSV, download: download, downloadText: downloadText, localTime: localTime,
    columns: COLUMNS.map(function (c) { return c[0]; }), toStepCSV: toStepCSV,
    downloadSteps: downloadSteps, toCompareStepCSV: toCompareStepCSV, stepRows: stepRows };
})(typeof window !== 'undefined' ? window : globalThis);
