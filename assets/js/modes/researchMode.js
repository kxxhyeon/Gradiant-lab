/* 연구자모드: 실험을 실행하고 결과를 분석해요.
   - 실험 중에는 공이 곡선 위를 따라 움직이고, 끝나면 방문한 모든 좌표를 순서대로 이은 점선 경로가 남아요.
   - 분석 도구(Loss 변화, 학습률 비교, 관찰 가이드)는 버튼을 눌렀을 때만 열려요.
   - Loss 점을 누르면 해당 반복의 수치 계산을 간단히 확인할 수 있어요. */
(function (root) {
  'use strict';
  var GD = root.GD, U = GD.ui, esc = U.esc;
  var family, fn, ctl, graph, loss, cmpGraph, cmpLoss, host, st, listeners, previews = [];

  function on(t, ev, f, o) { t.addEventListener(ev, f, o); listeners.push([t, ev, f, o]); }
  function $(s) { return host.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(host.querySelectorAll(s)); }
  function nick() { return GD.storage.prefs().nickname || '익명'; }
  function newState() { return { result: null, analysis: null, tab: null, showSteps: false, lossScale: 'linear', selected: -1, cmp: { alphas: [], items: [], conds: null, scale: 'linear' } }; }
  function resetCompareAlphas() { st.cmp.alphas = fn.compareAlphas.filter(function (a) { return a >= fn.alpha.min - 1e-9 && a <= fn.alpha.max + 1e-9; }); st.cmp.items = []; st.cmp.conds = null; }
  function fStar() { return Math.min.apply(null, fn.minima.map(function (m) { return m.f; })); }
  // 연구자모드는 고학습률 발산 실험까지 허용하고, 다른 모드에는 영향을 주지 않아요.
  function researchAlpha() { return { min: fn.alpha.min, max: Number(fn.id.slice(1)) <= 3 ? fn.alpha.max : 30, basicMax: fn.alpha.max, rangeModes: Number(fn.id.slice(1)) > 3, step: fn.id === 'F03' ? 0.005 : fn.alpha.step, default: fn.alpha.default }; }
  // 기본 포물선은 최대 10회, 나머지 2차는 20회, 4차는 최대 30회만 관찰해요.
  function researchIterations() {
    var max = fn.id === 'F01' ? 10 : (Number(fn.id.slice(1)) <= 3 ? 20 : 30);
    return { min: 1, max: max, default: Math.min(fn.iterations.default, fn.id === 'F01' ? 5 : (Number(fn.id.slice(1)) <= 3 ? 12 : 18)) };
  }

  function layout() {
    return '<div class="lab"><aside class="lab-side" aria-label="실험 설정"><h2>실험 설정</h2><div id="rCtl"></div></aside>' +
      '<div class="lab-main"><nav class="r-breadcrumbs" aria-label="현재 함수 선택 경로"><a href="#/research">차수 선택</a><span aria-hidden="true">›</span><a href="#/research/' + family + '">' + (family === 'quadratic' ? '2차함수' : '4차함수') + '</a><span aria-hidden="true">›</span><span aria-current="page">' + esc(fn.name) + '</span></nav><header class="page-head"><h1>연구자모드</h1><p><strong>' + esc(fn.name) + '</strong> · 이동 경로, Loss 변화, 학습률을 분석해요.</p></header>' +
      '<section class="graph-card" aria-label="이동 경로 그래프"><div class="graph-bar"><span class="graph-status" id="rStatus" data-phase="idle" role="status" aria-live="polite">준비 완료</span>' +
      '<div class="graph-toolbar"><div class="c-row"><label class="c-check"><input type="checkbox" id="rSteps"> 단계 번호 표시</label><button class="c-btn c-btn--sm" id="rAct" type="button" hidden></button>' +
      '<label class="playback-control" for="rSpeed">재생 속도 <select class="c-select playback-select" id="rSpeed" aria-label="공 애니메이션 재생 속도"><option value="0.5">0.5배속</option><option value="1" selected>1배속</option><option value="2">2배속</option><option value="4">4배속</option></select></label></div>' +
      '<div class="graph-zoom" role="group" aria-label="함수 그래프 확대 축소"><button class="graph-zoom-btn" id="rZoomIn" type="button" aria-label="그래프 확대" title="확대">' + U.icon('zoom-in', 18) + '</button><button class="graph-zoom-btn" id="rZoomOut" type="button" aria-label="그래프 축소" title="축소">' + U.icon('zoom-out', 18) + '</button><button class="graph-zoom-btn" id="rZoomReset" type="button" aria-label="그래프 원래 화면으로" title="원래 화면">' + U.icon('reset-view', 18) + '</button></div></div></div>' +
      '<div class="graph-stage"><canvas id="rCv" role="img" aria-label="함수 그래프" aria-describedby="rGraphHelp"></canvas></div>' +
      '<div class="graph-empty graph-empty--below" id="rEmpty" role="status">시작 위치를 바꾸면 공이 이동해요. <strong>실험 실행</strong>을 눌러 경로를 관찰하세요.</div>' +
      '<p class="graph-interaction-hint" id="rGraphHelp"><span class="graph-help-desktop">그래프 확대·축소: 버튼 또는 마우스 휠 · 드래그로 이동 · 스마트폰에서 두 손가락 확대 · 원래 화면 버튼으로 초기화</span><span class="graph-help-mobile">확대/축소 버튼 · 한 손가락으로 이동 · 두 손가락으로 확대</span></p>' +
      '<div class="legend" aria-hidden="true"><span><i></i>함수 곡선</span><span><i class="dotted"></i>이동 경로</span><span><i class="dot"></i>방문한 위치</span><span><i class="star"></i>극솟값</span>' + ((fn.stationaryInflections || []).length ? '<span><i class="flat"></i>수평변곡점(기울기 0)</span>' : '') + '</div></section>' +
      '<div class="research-step-export"><button class="c-btn c-btn--sm" type="button" id="rStepCsv" disabled>' + U.icon('download', 18) + '단계별 데이터 CSV</button><span class="c-hint">실험 후 x, 기울기, Loss, 이동량을 엑셀용 파일로 저장해요.</span></div>' +
      '<p class="sr-live" id="rPath"></p><section id="rSummary" class="c-stack" aria-live="polite"></section>' +
      '<section class="c-panel" aria-labelledby="rToolsH"><h2 class="c-subtitle" id="rToolsH" style="margin-bottom:var(--space-sm)">분석 도구</h2>' +
      '<div class="c-tablist" role="tablist" aria-label="분석 도구">' +
      '<button class="c-tab" role="tab" id="tabLoss" aria-controls="panLoss" aria-selected="false" data-tab="loss" disabled>Loss 변화</button>' +
      '<button class="c-tab" role="tab" id="tabCompare" aria-controls="panCompare" aria-selected="false" data-tab="compare">학습률 비교</button>' +
      '<button class="c-tab" role="tab" id="tabGuide" aria-controls="panGuide" aria-selected="false" data-tab="guide">관찰 가이드</button></div>' +
      '<p class="c-note" id="rToolsHint">실험이 끝나면 Loss 변화를 볼 수 있어요. 학습률 비교와 관찰 가이드는 바로 열 수 있어요.</p>' +
      '<div role="tabpanel" id="panLoss" aria-labelledby="tabLoss" hidden></div><div role="tabpanel" id="panCompare" aria-labelledby="tabCompare" hidden></div><div role="tabpanel" id="panGuide" aria-labelledby="tabGuide" hidden></div></section>' +
      '<section class="c-panel" aria-labelledby="rRecH"><h2 class="c-subtitle" id="rRecH">내 연구자모드 기록</h2><p class="c-note" id="rRecNote" style="margin:var(--space-2xs) 0 var(--space-sm)"></p><div id="rRec"></div></section></div></div>';
  }

  /* ---------- 상태 표시 / 요약 ---------- */
  function setPhase(p) {
    var s = $('#rStatus'), a = $('#rAct'); if (!s) return; s.dataset.phase = p;
    s.textContent = p === 'idle' ? '준비 완료' : p === 'play' ? '공이 굴러가는 중…' : '이동 완료';
    a.hidden = (p === 'idle' || !st.result || st.result.iterations === 0);
    a.innerHTML = p === 'play' ? U.icon('skip', 16) + '건너뛰기' : U.icon('replay', 16) + '다시 보기';
    a.setAttribute('aria-label', p === 'play' ? '애니메이션 건너뛰기' : '애니메이션 다시 보기');
    if (p === 'play') $('#rEmpty').hidden = true;
  }
  function stat(k, v) { return '<div class="c-stat"><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>'; }
  function renderSummary() {
    var r = st.result, a = st.analysis, box = $('#rSummary');
    if (!r) { box.innerHTML = ''; return; }
    var tgt = r.target ? 'x = ' + U.fmtNum(r.target.x) + (fn.multiModal ? (r.target.kind === 'global' ? ' (전역)' : ' (국소)') : '') : '없음';
    box.innerHTML = U.callout(a.tone, a.label, a.detail) +
      '<dl class="c-stats">' + stat('최종 위치', U.fmtNum(r.finalX)) + stat('최종 Loss', U.fmtNum(r.finalLoss)) + stat('반복 횟수', r.iterations + '회') + stat('종료 사유', GD.engine.stopLabel(r.stopReason)) + stat('목표 최솟값', tgt) + '</dl>';
  }

  /* ---------- 실험 실행 ---------- */
  function runExperiment(v) {
    var result = GD.engine.run(fn, { start: v.start, alpha: v.alpha, maxIter: v.maxIter }), a = GD.analyzer.analyze(result, fn);
    st.result = result; st.analysis = a; st.selected = -1;
    $('#rStepCsv').disabled = false;
    st.lossScale = GD.viz.suggestLossScale([{ values: result.losses.map(function (l) { return l - fStar(); }) }]) === 'log' ? 'log' : 'linear';
    GD.records.add({ mode: 'research', functionId: fn.id, functionName: fn.name, nickname: nick(), alpha: result.alpha, start: result.start, maxIter: result.maxIter, iterations: result.iterations, finalX: result.finalX, finalLoss: result.finalLoss, statusLabel: a.label, statusType: a.type, oscillated: a.oscillated, success: result.success });
    $('#rSummary').innerHTML = ''; $('#tabLoss').disabled = true;
    $('#rPath').textContent = '이동 기록(x 좌표): ' + result.xs.map(function (x) { return Number(x.toPrecision(4)); }).join(' → ');
    $('#rCv').setAttribute('aria-label', fn.name + ' 그래프. 공이 x = ' + result.start + '에서 출발해 ' + result.iterations + '번 이동했고 최종 위치는 x = ' + Number(result.finalX.toPrecision(5)) + '입니다.');
    graph.play(result, function () { onFinished(); });
    setPhase('play');
  }
  function onFinished() {
    renderSummary(); $('#tabLoss').disabled = false; renderRecords();
    $('#rToolsHint').textContent = 'Loss 변화, 학습률 비교, 관찰 가이드 중 하나를 눌러 분석해 보세요.';
    if (st.tab === 'loss') renderLoss();
  }

  /* ---------- 단계 선택(이동 경로 ↔ Loss 그래프) ---------- */
  // Loss 점을 누르면 해당 단계의 x 갱신식과 함수값 대입식을 보여 줘요.
  function valueFormula(x) {
    var t = '(' + U.fmtNum(x) + ')';
    switch (fn.id) {
      case 'F01': return t + '²';
      case 'F02': return '0.25 × ' + t + '²';
      case 'F03': return '4 × ' + t + '²';
      case 'F04': return t + '⁴ / 4 − ' + t + '³ / 3 − ' + t + '² + 8/3';
      case 'F05': return '3 × ' + t + '⁴ − 4 × ' + t + '³ + 1';
      case 'F06': return t + '⁴ + 0.5 × ' + t + '²';
      default: return 'f(' + U.fmtNum(x) + ')';
    }
  }
  function stepCalcHTML(r, k) {
    if (!r || k < 0 || k >= r.xs.length) return '';
    var x = r.xs[k], v = r.losses[k];
    var val = '<div class="loss-calc-line">Loss' + k + ' = f(x' + k + ') = ' + esc(valueFormula(x)) + ' ≈ <strong>' + U.fmtNum(v) + '</strong></div>';
    if (k === 0) return '<strong>0번째 · 시작 위치 x₀ = ' + U.fmtNum(x) + '</strong>' + val;
    var prev = r.xs[k - 1], grad = r.grads[k - 1];
    var move = '<div class="loss-calc-line">x' + k + ' = x' + (k - 1) + ' − α × f′(x' + (k - 1) + ') = ' + U.fmtNum(prev) + ' − ' + U.fmtNum(r.alpha) + ' × (' + U.fmtNum(grad) + ') ≈ <strong>' + U.fmtNum(x) + '</strong></div>';
    return '<strong>' + k + '번째 이동 · ' + esc(fn.dexpr) + '</strong>' + move + val;
  }
  function readoutHTML() {
    var r = st.result; if (!r) return '';
    return st.selected < 0
      ? '그래프의 점을 누르면 그 단계의 수치 계산식이 나와요. (최종 Loss: ' + U.fmtNum(r.finalLoss) + ')'
      : stepCalcHTML(r, st.selected);
  }
  function selectStep(k, from) {
    st.selected = k;
    if (from !== 'graph' && graph) graph.select(k);
    if (from !== 'loss' && loss && st.tab === 'loss') loss.select(k);
    var ro = $('#lossRead'); if (ro) ro.innerHTML = readoutHTML();
    var picker = $('#lossStepSelect'); if (picker) picker.value = String(k);
  }

  /* ---------- 분석 도구 ---------- */
  function selectTab(name) {
    st.tab = st.tab === name ? null : name;
    $$('.c-tab').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === st.tab ? 'true' : 'false'); });
    [['loss', '#panLoss'], ['compare', '#panCompare'], ['guide', '#panGuide']].forEach(function (p) { $(p[1]).hidden = p[0] !== st.tab; });
    if (st.tab === 'loss') renderLoss(); if (st.tab === 'compare') renderCompare(); if (st.tab === 'guide') renderGuide();
  }
  function scaleChips(cur, id) {
    return '<div class="c-chips" role="group" aria-label="그래프 눈금"><button type="button" class="c-chip" data-scale="linear" data-for="' + id + '" aria-pressed="' + (cur === 'linear') + '">선형</button>' +
      '<button type="button" class="c-chip" data-scale="log" data-for="' + id + '" aria-pressed="' + (cur === 'log') + '">로그 (목표와의 차이)</button></div>';
  }
  function renderLoss() {
    var r = st.result, p = $('#panLoss'); if (!r) { p.innerHTML = ''; return; }
    p.innerHTML = '<div class="c-stack"><div class="toolbar"><h3 class="c-subtitle">반복 횟수에 따른 Loss</h3>' + scaleChips(st.lossScale, 'loss') + '</div><div class="loss-chart" id="lossBox"></div><div class="loss-step-row"><label for="lossStepSelect">계산을 볼 단계</label><select class="c-select" id="lossStepSelect" aria-label="계산을 볼 이동 단계">' + r.xs.map(function (x, i) { return '<option value="' + i + '"' + (i === st.selected ? ' selected' : '') + '>' + i + '단계 · x = ' + U.fmtNum(x) + '</option>'; }).join('') + '</select></div><div class="loss-calc" id="lossRead" aria-live="polite">' + readoutHTML() + '</div>' +
      '<p class="c-note">Loss는 f(x) 값이에요. 로그 눈금은 목표 최솟값(f*)과의 차이를 보여 줘서 수렴 속도를 비교하기 쉬워요.</p></div>';
    if (loss) loss.destroy();
    loss = GD.viz.createLossChart($('#lossBox'), { onSelect: function (k) { selectStep(k, 'loss'); } });
    on($('#lossStepSelect'), 'change', function () { selectStep(Number(this.value), 'loss'); });
    loss.render([{ label: 'Loss', color: GD.viz.seriesColors()[0], values: r.losses }], { scale: st.lossScale, baseline: fStar(), selected: st.selected, label: fn.name + '의 반복 횟수별 Loss 변화 그래프' });
  }
  /* ---------- 숫자까지 따라가 보는 단계별 관찰 가이드 ---------- */
  function guideNumber(n) {
    if (!isFinite(n)) return '∞';
    if (Math.abs(n) < 1e-12) return '0';
    return String(Number(n.toFixed(6)));
  }
  function guideResultLabel(r) {
    if (Math.abs(r) < 1e-10) return '한 번에 최솟값 도달';
    if (Math.abs(r - 1) < 1e-10) return '움직이지 않음';
    if (Math.abs(r + 1) < 1e-10) return '같은 폭으로 왕복';
    if (Math.abs(r) > 1) return '발산 (매번 더 멀어짐)';
    if (r < 0) return '좌우로 번갈아 이동하며 수렴';
    return '한쪽에서 점차 수렴';
  }
  function quadraticGuideTable() {
    var a = fn.id === 'F01' ? 1 : fn.id === 'F02' ? 0.25 : 4;
    var x0 = fn.id === 'F01' ? 4 : fn.start.default;
    var alphas = fn.id === 'F01' ? [0.1, 0.9, 1, 1.5] :
      fn.id === 'F02' ? [0.2, 1, 1.5, 2] : [0.05, 0.125, 0.2, 0.3];
    var ratio = alphas.map(function (alpha) { return 1 - 2 * a * alpha; });
    var rows = Array.from({ length: 5 }, function (_, k) {
      return '<tr><th scope="row">' + k + '</th>' + ratio.map(function (r) {
        return '<td>' + guideNumber(Math.abs(x0) * Math.pow(Math.abs(r), k)) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    var notes = alphas.map(function (alpha, i) {
      return '<li><strong>α = ' + guideNumber(alpha) + ' (r = ' + guideNumber(ratio[i]) + ')</strong> · ' + guideResultLabel(ratio[i]) +
        '. 4회 후 오차는 <strong>' + guideNumber(Math.abs(x0) * Math.pow(Math.abs(ratio[i]), 4)) + '</strong>예요.</li>';
    }).join('');
    var exact = fn.id === 'F01'
      ? '<p class="guide-focus"><strong>서로 다른 이동, 같은 오차!</strong> α = 0.1은 r = 0.8, α = 0.9는 r = −0.8이므로 두 경우의 오차가 4 → 3.2 → 2.56 → 2.048 → 1.6384로 같아요. 하지만 α = 0.9는 x의 부호가 매번 바뀌어서 골짜기를 지그재그로 건너요. α = 1은 오차가 계속 4이고, α = 1.5는 4 → 8 → 16 → 32 → 64로 증가해요.</p>'
      : fn.id === 'F02'
      ? '<p class="guide-focus"><strong>완만하면 더 크게 움직여도 괜찮아요.</strong> f(x) = 0.25x²는 α = 2에서 한 번에 최솟값에 도착해요. 이 사이트에서는 학습률을 최대 2까지만 설정할 수 있어요. 수학적으로는 α가 2보다 크고 4보다 작으면 지그재그 수렴하지만, 여기서는 그 범위를 직접 설정하지 않아요.</p>'
      : '<p class="guide-focus"><strong>가파른 함수에서는 작은 학습률이 중요해요.</strong> α = 0.125면 한 번에 도착하지만, α = 0.3이면 r = −1.4이므로 오차가 매번 1.4배로 커져 발산해요.</p>';
    return '<section class="guide-block"><h4>2. 이동 횟수별 오차를 실제로 계산해 보기</h4>' +
      '<p>이 함수는 <strong>f(x) = ' + a + 'x²</strong> 형태예요. 목표는 x* = 0이므로 오차는 <strong>eₙ = |xₙ|</strong>예요. ' +
      '매번 <strong>r = 1 − 2aα</strong>만큼 위치가 바뀌어 <strong>xₙ = x₀ · rⁿ</strong>, <strong>eₙ = |x₀| · |r|ⁿ</strong>이 돼요. ' +
      '아래 표는 x₀ = <strong>' + guideNumber(x0) + '</strong>일 때의 오차 크기예요.</p>' +
      '<div class="c-table-scroll guide-number-table"><table class="c-table"><caption>n = 0~4의 반복에 따른 위치 오차 |xₙ|</caption><thead><tr><th scope="col">n</th>' +
      alphas.map(function (alpha, i) { return '<th scope="col">α = ' + guideNumber(alpha) + '<br><span class="guide-muted">r = ' + guideNumber(ratio[i]) + '</span></th>'; }).join('') +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<ul class="guide-findings">' + notes + '</ul>' + exact +
      '<p class="c-note"><strong>판단 기준:</strong> |r| &lt; 1이면 수렴, |r| = 1이면 오차가 유지, |r| &gt; 1이면 발산해요. r이 음수면 이동할 때마다 방향이 바뀌어요.</p></section>';
  }
  function quarticGuideTable() {
    var examples = fn.id === 'F04' ? [
      { start: -1.6, alpha: 0.15, label: '왼쪽에서 출발' },
      { start: 1.5, alpha: 0.15, label: '오른쪽에서 출발' },
      { start: -1, alpha: 0.15, label: '왼쪽 극솟값에서 출발' },
      { start: 0, alpha: 0.15, label: '산봉우리에서 출발' }
    ] : fn.id === 'F05' ? [
      { start: 1.3, alpha: 0.025, label: '극솟값 쪽으로 이동' },
      { start: 0.4, alpha: 0.025, label: '평평한 곳을 통과' },
      { start: 0, alpha: 0.025, label: '수평변곡점에서 출발' },
      { start: 1, alpha: 0.025, label: '극솟값에서 출발' }
    ] : [
      { start: 2, alpha: 0.01, label: '작게 이동' },
      { start: 2, alpha: 0.02, label: '보통 크기로 이동' },
      { start: 2, alpha: 0.06, label: '큰 이동으로 진동 가능' },
      { start: 2, alpha: 0.12, label: '큰 학습률로 발산 가능' }
    ];
    var results = examples.map(function (ex) { return GD.engine.run(fn, { start: ex.start, alpha: ex.alpha, maxIter: 4 }); });
    var rows = Array.from({ length: 5 }, function (_, k) {
      return '<tr><th scope="row">' + k + '</th>' + results.map(function (result) {
        return '<td>' + (k < result.xs.length ? guideNumber(result.xs[k]) : '—') + '</td>';
      }).join('') + '</tr>';
    }).join('');
    var summary = fn.id === 'F04'
      ? '<p class="guide-focus"><strong>두 골짜기가 모두 최솟값일까요?</strong> x = −1은 Loss = 2.25인 국소극솟값, x = 2는 Loss = 0인 전역최솟값이에요. x = 0은 오히려 Loss ≈ 2.6667인 극댓값이에요. 시작 위치가 x = 0의 어느 쪽인지에 따라 도착할 골짜기가 달라질 수 있어요. 단, 학습률이 아주 크면 경계를 넘어갈 수 있어요.</p>'
      : fn.id === 'F05'
      ? '<p class="guide-focus"><strong>기울기 0 = 최솟값은 아니에요.</strong> x = 0에서는 f′(0) = 0이지만 Loss = 1인 수평변곡점이라 출발하면 멈춰요. x = 1은 Loss = 0인 진짜 극솟값이에요. x = 0.4처럼 평평한 부분 근처에서는 기울기가 작아 이동이 느려질 수 있어요.</p>'
      : '<p class="guide-focus"><strong>2차함수처럼 보여도 움직임은 달라요.</strong> 이 함수는 x = 0에서만 최소가 되지만 f′(x) = 4x³ + x라서 멀리 있을수록 기울기가 급격히 커져요. x₀ = 2이면 f′(2) = 34이므로 α = 0.02일 때 x₁ = 2 − 0.02 × 34 = 1.32예요.</p>';
    return '<section class="guide-block"><h4>2. 숫자로 확인하는 4차함수의 이동</h4><p>4차함수는 위치에 따라 기울기가 달라져요. 아래 표의 각 열은 <strong>같은 함수</strong>에서 출발점·학습률을 다르게 정하고, 공식 xₙ₊₁ = xₙ − αf′(xₙ)으로 계산한 x 위치예요. ‘—’는 최솟값·정지점 등에 도달해 일찍 종료된 경우예요.</p>' +
      '<div class="c-table-scroll guide-number-table"><table class="c-table"><caption>시작 위치·학습률에 따른 처음 4회 이동</caption><thead><tr><th scope="col">n</th>' +
      examples.map(function (ex) { return '<th scope="col">' + esc(ex.label) + '<br><span class="guide-muted">x₀ ' + guideNumber(ex.start) + ' · α ' + guideNumber(ex.alpha) + '</span></th>'; }).join('') +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' + summary +
      '<p class="c-note">4차함수는 학습률만 보고 ‘반드시 수렴’이라고 말하기 어려워요. 시작 위치·기울기·반복 결과를 함께 확인하세요. 이 표는 초반 4회만 비교한 것이므로 최종 수렴 여부를 뜻하지 않아요.</p></section>';
  }
  function renderGuide() {
    var examples = fn.id === 'F01' ? [[4, 0.1], [4, 0.9], [4, 1], [4, 1.5]] :
      fn.id === 'F02' ? [[8, 0.2], [8, 1], [8, 1.5], [8, 2]] :
      fn.id === 'F03' ? [[3, 0.05], [3, 0.125], [3, 0.2], [3, 0.3]] :
      fn.id === 'F04' ? [[-1.6, 0.15], [1.5, 0.15], [-1, 0.15], [0, 0.15]] :
      fn.id === 'F05' ? [[1.3, 0.025], [0.4, 0.025], [0, 0.025], [1, 0.025]] :
      [[2, 0.01], [2, 0.02], [2, 0.06], [2, 0.12]];
    var rows = examples.map(function (ex) {
      var x0 = ex[0], alpha = ex[1], gradient = fn.df(x0), x1 = x0 - alpha * gradient;
      var before = fn.f(x0), after = fn.f(x1), delta = after - before;
      var verdict = Math.abs(delta) < 1e-9 ? '그대로' : delta < 0 ? '감소' : '증가';
      return '<tr><td class="left">x₀ = ' + guideNumber(x0) + '<span class="guide-muted"> · α = ' + guideNumber(alpha) + '</span></td>' +
        '<td class="left">' + guideNumber(x0) + ' − ' + guideNumber(alpha) + ' × (' + guideNumber(gradient) + ') = <strong>' + guideNumber(x1) + '</strong></td>' +
        '<td class="left">' + guideNumber(before) + ' → ' + guideNumber(after) + ' <strong>(' + verdict + ')</strong></td></tr>';
    }).join('');
    var isQuadratic = Number(fn.id.slice(1)) <= 3;
    $('#panGuide').innerHTML = '<div class="c-stack guide-content">' +
      '<header><h3 class="c-subtitle">' + esc(fn.name) + ' · 관찰 가이드</h3>' +
      '<p class="c-note">' + esc(fn.expr) + ' · ' + esc(fn.dexpr) + '</p>' +
      '<p><strong>오늘의 탐구 질문:</strong> ' + esc(fn.goal) + '</p></header>' +
      '<section class="guide-block"><h4>1. 학습률은 어떻게 이동을 바꿀까요?</h4>' +
      '<p>출발점이 <strong>x₀</strong>이고 학습률이 <strong>α</strong>라면 기울기 f′(x₀)를 계산해 <strong>x₁ = x₀ − α × f′(x₀)</strong>로 다음 위치를 정해요. ' +
      '학습률이 너무 작으면 조금씩 이동하고, 너무 크면 골짜기를 넘어가거나 멀어질 수 있어요.</p>' +
      '<div class="c-table-scroll"><table class="c-table guide-table"><caption>학습률별 첫 이동과 Loss 변화</caption><thead><tr><th class="left">출발점과 학습률</th><th class="left">첫 이동 x₁ 계산</th><th class="left">Loss f(x₀) → f(x₁)</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="c-note">Loss는 함수값 f(x)를 뜻해요. 한 번의 Loss 감소만으로 최종 수렴을 보장할 수 없으니, 이어지는 반복도 살펴보세요.</p></section>' +
      (isQuadratic ? quadraticGuideTable() : quarticGuideTable()) +
      '<section class="guide-block"><h4>3. 직접 실험해 보세요</h4><ol>' +
      '<li>표의 <strong>시작점과 학습률</strong>을 그대로 입력하고 실험 실행을 누르세요. 시작 위치를 바꾸면 그래프의 공이 즉시 움직여요.</li>' +
      '<li><strong>Loss 변화</strong>에서 한 점을 누르면 해당 단계의 위치 계산과 함수값 계산을 확인할 수 있어요.</li>' +
      '<li><strong>학습률 비교</strong>에서는 시작점과 반복 횟수를 고정하고 학습률만 바꾸어 결과를 비교해 보세요.</li>' +
      (fn.id === 'F04' ? '<li>출발점을 x = −1.6과 x = 1.5로 바꿔 보세요. 어느 골짜기로 수렴하는지 비교하면 전역·국소극솟값의 차이를 알 수 있어요.</li>' :
        fn.id === 'F05' ? '<li>출발점을 x = 0과 x = 1로 두고 비교해 보세요. 두 지점 모두 f′(x) = 0이지만 최솟값은 x = 1뿐이에요.</li>' : '') +
      '</ol></section>' +
      '<section class="guide-block"><h4>4. 결과를 해석하는 기준</h4>' +
      '<div class="c-table-scroll"><table class="c-table guide-table"><thead><tr><th class="left">조건 / 상황</th><th class="left">관찰 결과</th><th class="left">이유</th></tr></thead><tbody>' +
      fn.guide.map(function (g) { return '<tr><td class="left">' + esc(g[0]) + '</td><td class="left">' + esc(g[1]) + '</td><td class="left">' + esc(g[2]) + '</td></tr>'; }).join('') +
      '</tbody></table></div><p class="c-note">참고: 반복 횟수가 끝났다는 이유만으로 발산이라고 판단하지 않아요. 오차와 Loss의 변화를 확인하세요.</p></section></div>';
  }

  /* ---------- 학습률 비교 실험실 ---------- */
  function tagsHTML() {
    var cols = GD.viz.seriesColors();
    return st.cmp.alphas.map(function (a, i) { return '<span class="alpha-tag"><span class="swatch" style="--sw:' + cols[i % cols.length] + '"></span>α ' + a + '<button type="button" data-rm="' + a + '" aria-label="학습률 ' + a + ' 빼기">×</button></span>'; }).join('');
  }
  function renderCompare() {
    var p = $('#panCompare');
    p.innerHTML = '<div class="c-stack"><div><h3 class="c-subtitle">학습률 비교 실험실</h3><p class="c-note">학습률만 다르게 하고, 함수·시작 위치·반복 제한·성공 판정은 모두 같게 실행해요.</p></div>' +
      '<div class="c-field" style="margin:0"><span class="c-label">비교할 학습률 (최대 8개)</span><div class="alpha-tags" id="cmpTags">' + tagsHTML() + '</div>' +
      '<div class="c-row"><input class="c-num" style="width:96px" type="number" id="cmpAdd" aria-label="추가할 학습률" min="' + researchAlpha().min + '" max="' + researchAlpha().max + '" step="' + researchAlpha().step + '" placeholder="α">' +
      '<button class="c-btn c-btn--sm" type="button" id="cmpAddBtn">' + U.icon('plus', 16) + '추가</button><button class="c-btn c-btn--sm c-btn--quiet" type="button" id="cmpReset">기본값으로</button></div>' +
      '<span class="c-hint" id="cmpHint">' + researchAlpha().min + ' ~ ' + researchAlpha().max + ' 사이의 값을 넣을 수 있어요.</span></div>' +
      '<div><button class="c-btn c-btn--primary" type="button" id="cmpRun">' + U.icon('play', 18) + '비교 실행</button></div><div id="cmpOut"></div></div>';
    if (st.cmp.items.length) renderCompareOut();
    on($('#cmpAddBtn'), 'click', addAlpha); on($('#cmpAdd'), 'keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addAlpha(); } });
    on($('#cmpReset'), 'click', function () { resetCompareAlphas(); renderCompare(); });
    on($('#cmpRun'), 'click', runCompare);
    on($('#cmpTags'), 'click', function (e) { var b = e.target.closest('[data-rm]'); if (!b) return; var a = Number(b.dataset.rm); st.cmp.alphas = st.cmp.alphas.filter(function (x) { return x !== a; }); $('#cmpTags').innerHTML = tagsHTML(); });
  }
  function addAlpha() {
    var inp = $('#cmpAdd'), hint = $('#cmpHint'), v = parseFloat(inp.value), a = researchAlpha(), msg = '';
    if (!isFinite(v)) msg = '숫자를 입력해 주세요.'; else if (v < a.min - 1e-9 || v > a.max + 1e-9) msg = a.min + ' ~ ' + a.max + ' 사이의 값만 쓸 수 있어요.';
    else { v = U.snap(v, a.step); if (st.cmp.alphas.indexOf(v) !== -1) msg = '이미 들어 있는 학습률이에요.'; else if (st.cmp.alphas.length >= 8) msg = '최대 8개까지 비교할 수 있어요.'; }
    if (msg) { hint.textContent = msg; hint.setAttribute('role', 'alert'); hint.style.color = 'var(--color-error)'; return; }
    hint.textContent = a.min + ' ~ ' + a.max + ' 사이의 값을 넣을 수 있어요.'; hint.removeAttribute('role'); hint.style.color = '';
    st.cmp.alphas.push(v); st.cmp.alphas.sort(function (x, y) { return x - y; }); inp.value = ''; $('#cmpTags').innerHTML = tagsHTML();
  }
  function runCompare() {
    var v = ctl.values(); if (!v.valid) { var bad = host.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; }
    if (!st.cmp.alphas.length) { var h = $('#cmpHint'); h.textContent = '비교할 학습률을 하나 이상 넣어 주세요.'; h.setAttribute('role', 'alert'); return; }
    var cols = GD.viz.seriesColors();
    st.cmp.conds = { start: v.start, maxIter: v.maxIter, fnId: fn.id };
    st.cmp.items = st.cmp.alphas.map(function (a, i) {
      var r = GD.engine.run(fn, { start: v.start, alpha: a, maxIter: v.maxIter });   // 같은 공통 엔진으로 각각 따로 계산
      return { alpha: a, result: r, analysis: GD.analyzer.analyze(r, fn), color: cols[i % cols.length], visible: true };
    });
    st.cmp.scale = GD.viz.suggestLossScale(st.cmp.items.map(function (it) { return { values: it.result.losses.map(function (l) { return l - fStar(); }) }; })) === 'log' ? 'log' : 'linear';
    renderCompareOut();
  }
  function renderCompareOut() {
    var out = $('#cmpOut'), c = st.cmp, items = c.items;
    out.innerHTML = '<div class="c-stack"><p class="c-note" id="cmpConds">조건 · ' + esc(fn.expr) + ' · 시작 x = ' + U.fmtNum(c.conds.start) + ' · 최대 반복 ' + c.conds.maxIter + '회 · 같은 성공 판정</p>' +
      '<div class="compare-legend" role="group" aria-label="보이는 학습률 선택">' + items.map(function (it, i) { return '<button type="button" class="c-chip" data-vis="' + i + '" aria-pressed="' + it.visible + '" style="--sw:' + it.color + '"><span class="swatch"></span>α ' + it.alpha + '</button>'; }).join('') + '</div>' +
      '<div class="graph-card"><div class="graph-bar"><span class="c-note">비교 그래프 · 확대/축소 가능</span><div class="graph-zoom" role="group" aria-label="학습률 비교 그래프 확대 축소"><button class="graph-zoom-btn" id="cmpZoomIn" type="button" aria-label="비교 그래프 확대" title="확대">' + U.icon('zoom-in', 18) + '</button><button class="graph-zoom-btn" id="cmpZoomOut" type="button" aria-label="비교 그래프 축소" title="축소">' + U.icon('zoom-out', 18) + '</button><button class="graph-zoom-btn" id="cmpZoomReset" type="button" aria-label="비교 그래프 원래 화면으로" title="원래 화면">' + U.icon('reset-view', 18) + '</button></div></div><div class="graph-stage" style="height:clamp(260px,42vh,380px)"><canvas id="cmpCv" role="img" aria-label="학습률별 이동 경로 비교 그래프"></canvas></div></div>' +
      '<div class="toolbar"><h3 class="c-subtitle">학습률별 Loss 변화</h3>' + scaleChips(c.scale, 'cmp') + '</div><div class="loss-chart" id="cmpLossBox"></div>' +
      '<div class="loss-calc" id="cmpLossRead" aria-live="polite">비교 그래프에서 점을 누르면 해당 학습률의 계산식을 볼 수 있어요.</div>' +
      '<div class="compare-step-export"><button class="c-btn c-btn--sm" id="cmpStepCsv" type="button">' + U.icon('download', 18) + '비교 실험 단계별 CSV</button><span class="c-hint">비교한 모든 학습률의 반복 데이터를 하나의 파일로 저장해요.</span></div>' +
      '<div class="c-table-scroll"><table class="c-table" id="cmpTable"><caption>학습률별 결과 요약</caption><thead><tr><th scope="col">학습률</th><th class="left" scope="col">결과</th><th scope="col">반복 횟수</th><th scope="col">최종 위치</th><th scope="col">최종 Loss</th><th class="left" scope="col">종료 사유</th></tr></thead><tbody>' +
      items.map(function (it) { var r = it.result; return '<tr><td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;margin-inline-end:8px;background:' + it.color + '"></span>' + it.alpha + '</td><td class="left">' + esc(it.analysis.label) + '</td><td>' + r.iterations + '</td><td>' + U.fmtNum(r.finalX) + '</td><td>' + U.fmtNum(r.finalLoss) + '</td><td class="left">' + esc(GD.engine.stopLabel(r.stopReason)) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
    if (cmpGraph) cmpGraph.destroy(); if (cmpLoss) cmpLoss.destroy();
    cmpGraph = GD.viz.createFunctionGraph($('#cmpCv'), { interactive: true }); cmpGraph.setFunction(fn);
    cmpLoss = GD.viz.createLossChart($('#cmpLossBox'), { onSelect: function (k, i) {
      var picked = st.cmp.items.filter(function (it) { return it.visible; })[i];
      if (!picked) return;
      $('#cmpLossRead').innerHTML = '<div><strong>학습률 α = ' + U.fmtNum(picked.alpha) + '</strong></div>' + stepCalcHTML(picked.result, k);
    } });
    refreshCompareViz();
    on($('#cmpStepCsv'), 'click', function () { GD.csv.downloadText(GD.csv.toCompareStepCSV(st.cmp.items, fn), 'gradient_descent_compare_' + fn.id + '_steps.csv'); });
    on($('#cmpZoomIn'), 'click', function () { cmpGraph.zoomBy(0.75); });
    on($('#cmpZoomOut'), 'click', function () { cmpGraph.zoomBy(1.3); });
    on($('#cmpZoomReset'), 'click', function () { cmpGraph.resetView(); });
    on(out, 'click', function (e) {
      var v = e.target.closest('[data-vis]'); if (v) { var it = items[Number(v.dataset.vis)]; it.visible = !it.visible; v.setAttribute('aria-pressed', String(it.visible)); refreshCompareViz(); }
      var s = e.target.closest('[data-for="cmp"]'); if (s) { c.scale = s.dataset.scale; $$('[data-for="cmp"]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.scale === c.scale)); }); refreshCompareViz(); }
    });
  }
  function refreshCompareViz() {
    var items = st.cmp.items; cmpGraph.showMulti(items.map(function (it) { return { result: it.result, color: it.color, visible: it.visible }; }));
    var vis = items.filter(function (it) { return it.visible; });
    cmpLoss.render(vis.map(function (it) { return { label: 'α ' + it.alpha, color: it.color, values: it.result.losses }; }), { scale: st.cmp.scale, baseline: fStar(), selected: -1, label: '학습률별 Loss 변화 비교 그래프' });
    var read = $('#cmpLossRead'); if (read) read.textContent = '비교 그래프에서 점을 누르면 해당 학습률의 계산식을 볼 수 있어요.';
  }

  /* ---------- 개인 기록 ---------- */
  function renderRecords() {
    var recs = GD.records.list({ mode: 'research' }), box = $('#rRec'); $('#rRecNote').textContent = GD.storage.notice();
    if (!recs.length) { box.innerHTML = U.callout('info', '아직 기록이 없어요', '실험을 실행하면 이 브라우저에 저장돼요.'); return; }
    box.innerHTML = '<div class="c-stack"><div class="c-table-scroll" tabindex="0" role="region" aria-label="연구자모드 실험 기록(스크롤 가능)"><table class="c-table" id="rTable"><thead><tr><th class="left" scope="col">날짜</th><th class="left" scope="col">함수</th><th scope="col">학습률</th><th scope="col">시작</th><th scope="col">반복</th><th scope="col">최종 위치</th><th scope="col">최종 Loss</th><th class="left" scope="col">결과</th></tr></thead><tbody>' +
      recs.slice().reverse().map(function (r) { return '<tr><td class="left">' + esc(GD.csv.localTime(r.createdAt)) + '</td><td class="left">' + esc(r.functionId) + ' · ' + esc(r.functionName) + '</td><td>' + r.alpha + '</td><td>' + U.fmtNum(r.start) + '</td><td>' + r.iterations + '</td><td>' + U.fmtNum(r.finalX) + '</td><td>' + U.fmtNum(r.finalLoss) + '</td><td class="left">' + esc(r.statusLabel) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="c-row"><button class="c-btn" type="button" id="rCsv">' + U.icon('download', 18) + 'CSV 내려받기</button><button class="c-btn c-btn--quiet" type="button" id="rClear">' + U.icon('trash', 18) + '기록 지우기</button></div></div>';
    on($('#rCsv'), 'click', function () { GD.csv.download(GD.records.list({ mode: 'research' }), 'research_mode_records.csv'); });
    on($('#rClear'), 'click', function () { if (root.confirm('연구자모드 기록을 모두 지울까요? 이 브라우저에서만 지워지고 되돌릴 수 없어요.')) { GD.records.clear({ mode: 'research' }); renderRecords(); } });
  }

  /* ---------- 함수 바꾸기 ---------- */
  function changeFunction(id) {
    // 2차 ↔ 4차를 넘어서 바꿀 때도 선택한 함수에 맞는 경로로 이동해요.
    var next = GD.functions.get(id);
    if (!next || next.id === fn.id) return;
    var nextFamily = Number(next.id.slice(1)) <= 3 ? 'quadratic' : 'quartic';
    location.hash = '#/research/' + nextFamily + '/' + next.id;
  }

  function familyFunctions(group) { return GD.functions.list.filter(function (f) { return group === 'quadratic' ? Number(f.id.slice(1)) <= 3 : Number(f.id.slice(1)) > 3; }); }
  function picker(params) {
    var group = params[0], valid = group === 'quadratic' || group === 'quartic';
    host.innerHTML = '<section class="home"><header class="page-head"><h1>연구자모드</h1><p>' + (valid ? '2단계 · 그래프를 보고 실험할 함수를 고르세요.' : '1단계 · 2차함수 또는 4차함수를 선택하세요.') + '</p></header>' +
      (valid ? '<a class="c-btn" href="#/research">← 차수 다시 선택</a>' : '') + '<div class="mode-grid">' +
      (valid ? familyFunctions(group).map(function (f) { var pts = f.stationaryInflections || []; return '<a class="mode-card research-fn-card" href="#/research/' + group + '/' + f.id + '"><div class="research-fn-preview"><canvas data-r-preview="' + f.id + '" role="img" aria-label="' + esc(f.name) + ' 함수 그래프 미리보기"></canvas></div><div class="research-fn-meta"><span class="fn-id">' + esc(f.id) + '</span><span>' + (pts.length ? '★ 극솟값 ' + f.minima.length + '개 · ◉ 수평변곡점 ' + pts.length + '개' : '★ 극솟값 ' + f.minima.length + '개' + (f.minima.length > 1 ? ' · 깊이 다름' : '')) + '</span></div><h2>' + esc(f.name) + '</h2><p class="fn-expr">' + esc(f.expr) + '</p><p>' + esc(f.feature) + '</p><span class="go">이 함수로 실험하기 →</span></a>'; }).join('') :
      '<a class="mode-card" href="#/research/quadratic"><h2>2차함수</h2><p>기본·완만한·가파른 포물선 3종으로 학습률과 곡률의 관계를 관찰해요.</p><span class="go">종류 선택 →</span></a><a class="mode-card" href="#/research/quartic"><h2>4차함수</h2><p>깊이가 다른 두 골짜기·수평변곡점·U자형 4차함수로 시작 위치와 수렴을 탐구해요.</p><span class="go">종류 선택 →</span></a>') + '</div></section>'
    if (valid) previews = $$('canvas[data-r-preview]').map(function (canvas) {
      var g = GD.viz.createFunctionGraph(canvas, { compact: true, previewOnly: true });
      g.setFunction(GD.functions.get(canvas.dataset.rPreview));
      return g;
    });
  }
  // 설정 중에는 기존 실험 경로 대신 새로운 출발점을 즉시 보여줘요.
  // 결과를 저장하지 않으며, 조정한 조건으로 다시 실험해야 분석값이 갱신돼요.
  function settingsChanged() {
    if (!ctl || !graph) return;
    var v = ctl.values();
    if (!isFinite(v.start) || v.start < fn.start.min || v.start > fn.start.max) return;
    graph.showIdle(v.start);
    $('#rStepCsv').disabled = true;
    st.result = null; st.analysis = null; st.selected = -1;
    $('#rSummary').innerHTML = ''; $('#rPath').textContent = '';
    $('#rEmpty').hidden = false;
    $('#rEmpty').innerHTML = '새 시작 위치 <strong>x = ' + U.fmtNum(v.start) + '</strong> · 학습률과 반복 횟수를 정한 뒤 실험을 실행하세요.';
    $('#rCv').setAttribute('aria-label', esc(fn.name) + ' 함수 그래프. 현재 시작 위치 x = ' + U.fmtNum(v.start) + ', 함수값 f(x) = ' + U.fmtNum(fn.f(v.start)));
    $('#tabLoss').disabled = true;
    $('#panLoss').innerHTML = '';
    $('#rToolsHint').textContent = '조건이 변경됐어요. 실험 실행 후 Loss 계산을 확인할 수 있어요.';
    if (st.cmp.items.length) { st.cmp.items = []; if (cmpGraph) { cmpGraph.destroy(); cmpGraph = null; } if (cmpLoss) { cmpLoss.destroy(); cmpLoss = null; } var old = $('#cmpOut'); if (old) old.innerHTML = ''; }
    setPhase('idle');
  }

  function mount(el, params) {
    host = el; listeners = []; st = newState(); previews = []; params = params || []; family = params[0];
    if ((family !== 'quadratic' && family !== 'quartic') || !familyFunctions(family).some(function (f) { return f.id === params[1]; })) { picker(params); return; }
    fn = GD.functions.get(params[1]); resetCompareAlphas();
    host.innerHTML = layout();
    ctl = GD.ui.createControls($('#rCtl'), { prefix: 'r', fn: fn, alpha: researchAlpha(), showFunction: true, functions: GD.functions.list, otherFunctionsOnly: true, iterations: researchIterations(), onRun: runExperiment, onChange: settingsChanged, onFunctionChange: changeFunction });
    graph = GD.viz.createFunctionGraph($('#rCv'), { interactive: true, onSelectStep: function (k) { selectStep(k, 'graph'); }, onPhase: setPhase });
    graph.setFunction(fn); setPhase('idle'); renderRecords();
    on($('#rZoomIn'), 'click', function () { graph.zoomBy(0.75); });
    on($('#rZoomOut'), 'click', function () { graph.zoomBy(1.3); });
    on($('#rZoomReset'), 'click', function () { graph.resetView(); });
    on($('#rSpeed'), 'change', function () { graph.setPlaybackSpeed(Number(this.value)); });
    on($('#rStepCsv'), 'click', function () { if (st.result) GD.csv.downloadSteps(st.result, fn, 'gradient_descent_' + fn.id + '_steps.csv'); });
    on($('#rSteps'), 'change', function () { st.showSteps = $('#rSteps').checked; graph.setShowSteps(st.showSteps); });
    on($('#rAct'), 'click', function () { if (graph.isPlaying()) graph.skip(); else if (st.result) graph.replay(); });
    $$('.c-tab').forEach(function (b) { on(b, 'click', function () { if (!b.disabled) selectTab(b.dataset.tab); });
      on(b, 'keydown', function (e) {   // 탭 목록은 좌우 방향키로 이동해요(Enter/Space 로 열기)
        var tabs = $$('.c-tab').filter(function (t) { return !t.disabled; }), i = tabs.indexOf(b), n = -1;
        if (e.key === 'ArrowRight') n = (i + 1) % tabs.length; else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length; else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = tabs.length - 1;
        if (n >= 0) { e.preventDefault(); tabs[n].focus(); } }); });
    on($('#panLoss'), 'click', function (e) { var s = e.target.closest('[data-for="loss"]'); if (!s) return; st.lossScale = s.dataset.scale; renderLoss(); });
  }
  function unmount() {
    previews.forEach(function (g) { g.destroy(); }); previews = [];
    if (graph) graph.destroy(); if (cmpGraph) cmpGraph.destroy(); if (loss) loss.destroy(); if (cmpLoss) cmpLoss.destroy();
    graph = cmpGraph = loss = cmpLoss = null; (listeners || []).forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); }); listeners = [];
  }
  GD.modes.research = { title: '연구자모드', mount: mount, unmount: unmount, _state: function () { return st; }, _graph: function () { return graph; }, _cmpGraph: function () { return cmpGraph; } };
})(typeof window !== 'undefined' ? window : globalThis);
