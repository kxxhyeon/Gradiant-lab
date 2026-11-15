/* 연구자모드·실험도전모드가 함께 쓰는 실험 설정 폼.
   함수마다 달라지는 값(시작 위치 범위, 학습률 범위, 반복 횟수 범위)은 함수 목록의 설정 데이터에서 읽어요. */
(function (root) {
  'use strict';
  var GD = root.GD, U = GD.ui, esc = U.esc;

  GD.ui.createControls = function (host, opt) {
    var id = opt.prefix || 'c', fn = opt.fn, vals = {}, alphaRange = 'basic', handlers = { run: opt.onRun || function () {}, change: opt.onChange || function () {}, functionChange: opt.onFunctionChange || function () {} };

    function fnOptions() {
      var functions = opt.functions || GD.functions.list;
      // 연구자모드의 실험 화면에서는 현재 함수를 제외한 나머지 5개만 선택지로 표시해요.
      // 2차/4차 카테고리를 넘나들어도 현재 함수의 기본 설정으로 다시 열립니다.
      if (opt.otherFunctionsOnly) {
        var others = functions.filter(function (f) { return f.id !== fn.id; });
        var options = '<option value="" selected disabled>다른 함수 ' + others.length + '개 중 선택…</option>';
        [
          ['2차함수', function (f) { return Number(f.id.slice(1)) <= 3; }],
          ['4차함수', function (f) { return Number(f.id.slice(1)) > 3; }]
        ].forEach(function (group) {
          var matched = others.filter(group[1]);
          if (matched.length) options += '<optgroup label="' + group[0] + '">' + matched.map(function (f) {
            return '<option value="' + f.id + '">' + f.id + ' · ' + esc(f.name) + '</option>';
          }).join('') + '</optgroup>';
        });
        return options;
      }
      return functions.map(function (f) { return '<option value="' + f.id + '"' + (f.id === fn.id ? ' selected' : '') + '>' + f.id + ' · ' + esc(f.name) + '</option>'; }).join('');
    }
    function alphaSpec() {
      var a = opt.alpha || fn.alpha;
      return (a.rangeModes && alphaRange === 'basic') ? { min: a.min, max: a.basicMax, step: a.step } : a;
    }
    function build() {
      var a = opt.alpha || fn.alpha, it = opt.iterations || fn.iterations, st = fn.start;
      host.innerHTML =
        (opt.showFunction ? '<div class="c-field"><label for="' + id + 'Fn">함수 설정</label>' + (opt.otherFunctionsOnly ? '<span class="c-hint">현재: <strong>' + esc(fn.id) + ' · ' + esc(fn.name) + '</strong></span>' : '') + '<select class="c-select" id="' + id + 'Fn" aria-label="다른 함수 선택">' + fnOptions() + '</select><span class="c-hint" id="' + id + 'FnExpr">' + esc(fn.expr) + ' · ' + esc(fn.dexpr) + '</span></div>' : '') +
        '<div class="c-field"><label for="' + id + 'Start">시작 위치 x</label>' +
          '<div class="c-range-row"><input class="c-range" type="range" id="' + id + 'StartR" aria-label="시작 위치 슬라이더" min="' + st.min + '" max="' + st.max + '" step="0.05" value="' + st.default + '">' +
          '<input class="c-num" type="number" id="' + id + 'Start" inputmode="decimal" step="any" min="' + st.min + '" max="' + st.max + '" value="' + st.default + '" aria-describedby="' + id + 'StartHint"></div>' +
          '<div class="c-chips" role="group" aria-label="시작 위치 바로 고르기">' + st.options.map(function (o) { return '<button type="button" class="c-chip" data-start="' + o + '" aria-pressed="false">' + String(o).replace('-', '\u2212') + '</button>'; }).join('') + '</div>' +
          '<span class="c-hint" id="' + id + 'StartHint">' + st.min + ' 이상 ' + st.max + ' 이하로 입력해요.</span></div>' +
        '<div class="c-field"><label for="' + id + 'Alpha">학습률 α</label>' +
          (a.rangeModes ? '<div class="alpha-range-tabs" role="group" aria-label="학습률 조절 범위"><button type="button" id="' + id + 'AlphaBasic" class="alpha-range-tab" aria-pressed="true">정밀 조절</button><button type="button" id="' + id + 'AlphaAdvanced" class="alpha-range-tab" aria-pressed="false">확장 범위</button></div>' : '') +
          '<div class="c-range-row"><input class="c-range" type="range" id="' + id + 'AlphaR" aria-label="학습률 슬라이더" min="' + a.min + '" max="' + (a.rangeModes ? a.basicMax : a.max) + '" step="' + a.step + '" value="' + a.default + '">' +
          '<input class="c-num" type="number" id="' + id + 'Alpha" inputmode="decimal" min="' + a.min + '" max="' + (a.rangeModes ? a.basicMax : a.max) + '" step="any" value="' + a.default + '" aria-describedby="' + id + 'AlphaHint"></div>' +
          '<span class="c-hint" id="' + id + 'AlphaHint">' + a.min + ' ~ ' + (a.rangeModes ? a.basicMax : a.max) + ' 범위. 슬라이더로 조절하거나 숫자를 직접 입력할 수 있어요.</span>' +
          (a.rangeModes ? '<span class="c-hint alpha-range-note" id="' + id + 'AlphaRangeNote">작은 학습률을 정밀하게 비교하는 기본 범위예요.</span>' : '') +
          '</div>' +
        '<div class="c-field"><label for="' + id + 'Iter">최대 반복 횟수</label><div class="c-range-row"><input class="c-range" type="range" id="' + id + 'IterR" aria-label="반복 횟수 슬라이더" min="' + it.min + '" max="' + it.max + '" step="1" value="' + it.default + '">' +
          '<input class="c-num" type="number" id="' + id + 'Iter" inputmode="numeric" min="' + it.min + '" max="' + it.max + '" step="1" value="' + it.default + '" aria-describedby="' + id + 'IterHint"></div>' +
          '<span class="c-hint" id="' + id + 'IterHint">' + it.min + ' ~ ' + it.max + '회. 목표에 도착하면 일찍 끝나요.</span></div>' +
        '<button class="c-btn c-btn--primary c-btn--block" type="button" id="' + id + 'Run">' + U.icon('play', 18) + '실험 실행</button>';
      vals = { start: st.default, alpha: a.default, iter: it.default };
      wire(); syncChips();
    }
    function q(s) { return host.querySelector('#' + id + s); }
    function updateAlphaRange() {
      var a = alphaSpec(), inp = q('Alpha'), slider = q('AlphaR');
      if (!inp || !slider) return;
      inp.min = slider.min = String(a.min); inp.max = slider.max = String(a.max); slider.step = String(a.step);
      var current = parseFloat(inp.value);
      if (isFinite(current) && current > a.max) inp.value = String(a.max);
      if (isFinite(current) && current < a.min) inp.value = String(a.min);
      var v = parseFloat(inp.value); if (isFinite(v)) slider.value = String(U.clamp(v, a.min, a.max));
      var hint = q('AlphaHint');
      hint.textContent = a.min + ' ~ ' + a.max + ' 범위. 슬라이더로 조절하거나 숫자를 직접 입력할 수 있어요.';
      delete hint.dataset.base;
      var basic = q('AlphaBasic'), advanced = q('AlphaAdvanced');
      if (basic && advanced) { basic.setAttribute('aria-pressed', String(alphaRange === 'basic')); advanced.setAttribute('aria-pressed', String(alphaRange === 'advanced'));
        q('AlphaRangeNote').textContent = alphaRange === 'basic' ? '작은 학습률을 정밀하게 비교하는 기본 범위예요.' : '큰 학습률(최대 30)에서는 진동·발산이 쉽게 일어날 수 있어요. 세밀한 조절은 숫자 입력을 이용하세요.';
      }
      validate();
    }
    function setHint(field, msg) {
      var h = q(field + 'Hint'), inp = q(field), base = h.dataset.base || (h.dataset.base = h.textContent);
      if (msg) { h.textContent = msg; h.setAttribute('role', 'alert'); h.style.color = 'var(--color-error)'; inp.setAttribute('aria-invalid', 'true'); }
      else { h.textContent = base; h.removeAttribute('role'); h.style.color = ''; inp.removeAttribute('aria-invalid'); }
    }
    function syncChips() { host.querySelectorAll('[data-start]').forEach(function (b) { b.setAttribute('aria-pressed', Number(b.dataset.start) === Number(q('Start').value) ? 'true' : 'false'); }); }
    function validate() {
      var st = fn.start, a = alphaSpec(), it = opt.iterations || fn.iterations, ok = true;
      var sv = parseFloat(q('Start').value), av = parseFloat(q('Alpha').value), iv = parseFloat(q('Iter').value);
      if (!isFinite(sv) || sv < st.min || sv > st.max) { setHint('Start', st.min + ' 이상 ' + st.max + ' 이하의 숫자를 입력해 주세요.'); ok = false; } else setHint('Start', '');
      if (!isFinite(av) || av < a.min - 1e-9 || av > a.max + 1e-9) { setHint('Alpha', a.min + ' ~ ' + a.max + ' 사이의 숫자를 입력해 주세요.'); ok = false; } else setHint('Alpha', '');
      if (!isFinite(iv) || iv < it.min || iv > it.max || Math.floor(iv) !== iv) { setHint('Iter', it.min + ' ~ ' + it.max + ' 사이의 정수를 입력해 주세요.'); ok = false; } else setHint('Iter', '');
      return { valid: ok, start: sv, alpha: av, maxIter: iv };
    }
    function wire() {
      var fnSel = q('Fn'); if (fnSel) fnSel.addEventListener('change', function () { handlers.functionChange(fnSel.value); });
      q('AlphaR').addEventListener('input', function () { q('Alpha').value = U.snap(q('AlphaR').value, alphaSpec().step); validate(); syncChips(); handlers.change(); });
      q('Alpha').addEventListener('input', function () { var v = parseFloat(q('Alpha').value); var a = alphaSpec(); if (isFinite(v)) q('AlphaR').value = U.clamp(v, a.min, a.max); validate(); syncChips(); handlers.change(); });
      if (q('AlphaBasic')) {
        q('AlphaBasic').addEventListener('click', function () { alphaRange = 'basic'; updateAlphaRange(); handlers.change(); });
        q('AlphaAdvanced').addEventListener('click', function () { alphaRange = 'advanced'; updateAlphaRange(); handlers.change(); });
      }
      q('IterR').addEventListener('input', function () { q('Iter').value = q('IterR').value; validate(); handlers.change(); });
      q('Iter').addEventListener('input', function () { var v = parseFloat(q('Iter').value); if (isFinite(v)) q('IterR').value = U.clamp(v, (opt.iterations || fn.iterations).min, (opt.iterations || fn.iterations).max); validate(); handlers.change(); });
      q('StartR').addEventListener('input', function () { q('Start').value = U.snap(q('StartR').value, 0.05); validate(); syncChips(); handlers.change(); });
      q('Start').addEventListener('input', function () { var v = parseFloat(q('Start').value); if (isFinite(v)) q('StartR').value = U.clamp(v, fn.start.min, fn.start.max); validate(); syncChips(); handlers.change(); });
      host.querySelectorAll('[data-start]').forEach(function (b) { b.addEventListener('click', function () { q('Start').value = b.dataset.start; q('StartR').value = b.dataset.start; validate(); syncChips(); handlers.change(); }); });
      q('Run').addEventListener('click', function () { var v = validate(); if (!v.valid) { var bad = host.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; } handlers.run(v); });
    }
    build();
    return {
      el: host,
      values: validate,
      setFunction: function (f) { fn = f; alphaRange = 'basic'; build(); },
      setValues: function (v) { if (v.start != null) { q('Start').value = v.start; q('StartR').value = v.start; } if (v.alpha != null) { q('Alpha').value = v.alpha; q('AlphaR').value = v.alpha; } if (v.maxIter != null) { q('Iter').value = v.maxIter; q('IterR').value = v.maxIter; } syncChips(); validate(); },
      setBusy: function (b) { q('Run').disabled = !!b; },
      focusRun: function () { q('Run').focus(); },
      alphaMode: function () { return alphaRange; }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
