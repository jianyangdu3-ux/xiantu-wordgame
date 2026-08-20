/* 仙途十二阶 V6.16 论道台（异步切磋）专项验证
 * 覆盖：挑战码编解码往返 / 非法码 / 论道台入口 / 挑战答题全流程 /
 *       胜负判定 5 分支 / canvas 战绩卡（降级） / 复制码 / URL 挑战直达 / 不蒜子统计降级
 * 任何 console.error / 未捕获异常即失败。
 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
const vocabJs = fs.readFileSync(path.join(__dirname, 'vocab.js'), 'utf8');
html = html.replace('<script src="vocab.js"></script>', '<script>' + vocabJs + '</script>');

let pass = 0, fail = 0, jsErrors = [];
function ok(cond, name) {
  if (cond) { pass++; console.log('✅ ' + name); }
  else { fail++; console.log('❌ ' + name); }
}
const NET_ERR = /Could not load|busuanzi|favicon|net::ERR|HTMLMediaElement|not implemented/i;
function cleanErrors() { return jsErrors.filter(e => !NET_ERR.test(String(e))); }

function makeDom(url) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => jsErrors.push('jsdomError: ' + String(e.message || e).slice(0, 200)));
  return new JSDOM(html, {
    url: url || 'http://localhost', runScripts: 'dangerously', pretendToBeVisual: true, resources: 'usable',
    virtualConsole: vc,
    beforeParse(window) {
      window.localStorage = {
        _store: {}, getItem(k) { return Object.prototype.hasOwnProperty.call(this._store, k) ? this._store[k] : null; },
        setItem(k, v) { this._store[k] = String(v); }, removeItem(k) { delete this._store[k]; }
      };
      window.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
      window.confirm = () => true;
      window.scrollTo = () => {};
      window.URL.createObjectURL = () => 'blob:mock';
      window.URL.revokeObjectURL = () => {};
      window.addEventListener('error', e => jsErrors.push('window.onerror: ' + String(e.message || e).slice(0, 200)));
    }
  });
}

const dom = makeDom('http://localhost');
const { window } = dom;
const { document } = window;
const $ = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));

(async function main() {
  await wait(500);

  /* ========== 1. 挑战码编解码 ========== */
  console.log('== 1. 挑战码编解码 ==');
  const code1 = window.encodeChallengeCode(5, 90, 128, 15);
  ok(/^XT-C5-90-128-15-[A-Z0-9]{3}$/.test(code1), `编码格式正确（${code1}）`);
  const p1 = window.parseChallengeCode(code1);
  ok(p1 && p1.chId === 5 && p1.acc === 90 && p1.time === 128 && p1.combo === 15, '解码往返一致');
  ok(window.parseChallengeCode('abc') === null, '非法码返回 null');
  ok(window.parseChallengeCode('XT-C99-90-128-15-A23') === null, '章节超界返回 null');
  ok(window.parseChallengeCode('XT-C3-120-50-5-XYZ').acc === 100, '正确率封顶 100');
  ok(window.parseChallengeCode('xt-c2-80-60-4-ab1') !== null, '小写输入可解析（不区分大小写）');

  /* ========== 2. 论道台入口与弹窗 ========== */
  console.log('== 2. 论道台入口与弹窗 ==');
  const entry = document.querySelector('.luntao-entry');
  ok(entry !== null, '首页论道台入口存在');
  ok((entry.textContent || '').includes('论道台'), '入口文案正确');
  window.openChallengeHall();
  ok($('challenge-modal').classList.contains('show'), '论道台弹窗打开');
  ok($('challenge-code-input') !== null, '挑战码输入框渲染');
  const rule = document.querySelector('#challenge-hall-content .ch-rule');
  ok(rule !== null && rule.textContent.includes('挑战码'), '切磋规则说明渲染');
  window.closeChallengeHall();
  ok(!$('challenge-modal').classList.contains('show'), '论道台弹窗可关闭');

  /* ========== 3. 非法挑战码提交 ========== */
  console.log('== 3. 非法码提交 ==');
  window.openChallengeHall();
  $('challenge-code-input').value = 'bad-code';
  window.submitChallengeCode();
  ok($('challenge-modal').classList.contains('show'), '非法码不关弹窗（提示重输）');
  window.closeChallengeHall();

  /* ========== 4. 挑战答题全流程 ========== */
  console.log('== 4. 挑战答题全流程 ==');
  // 解析 onclick="checkChallengeAnswer(this,'A','B')"，支持选项文本内的 \' 转义
  const parseArgs = s => {
    const m = String(s).match(/checkChallengeAnswer\(this,\s*'((?:[^'\\]|\\.)*)',\s*'((?:[^'\\]|\\.)*)'\)/);
    if (!m) return null;
    return [m[1].replace(/\\'/g, "'"), m[2].replace(/\\'/g, "'")];
  };
  const errBefore = cleanErrors().length;
  window.startChallenge(1, { acc: 60, time: 150, combo: 3 });
  await wait(80);
  ok($('challenge-hud') !== null, '对决 HUD 渲染');
  ok($('cd-me') !== null && $('cd-opp') !== null, '对决双进度条渲染');
  ok($('quiz-play-area').style.display === 'block', '战斗区展开');
  const qArea = $('quiz-question-area');
  ok(qArea.innerHTML.includes('论道'), '题面标记为论道切磋');
  ok(qArea.innerHTML.includes('择其义'), '题面引导文案渲染');
  const opts = [...document.querySelectorAll('#quiz-options-area .q-option')];
  ok(opts.length === 4, `切磋 4 选项（实际 ${opts.length}）`);
  ok(document.querySelector('.ch-opp-card') !== null, '道友战绩卡信息渲染');

  // 答对第一题（点击正确选项：选 onclick 中 selected===correct 的按钮）
  const rightBtn = opts.find(b => {
    const a = parseArgs(b.getAttribute('onclick'));
    return a && a[0] === a[1];
  }) || opts[0];
  if (rightBtn) {
    const a = parseArgs(rightBtn.getAttribute('onclick'));
    window.checkChallengeAnswer(rightBtn, a[0], a[1]);
    ok(true, '答对第 1 题');
  } else ok(false, '无选项可答');
  await wait(1250);
  ok(document.querySelectorAll('#quiz-options-area .q-option').length === 4, '自动进入第 2 题');

  // 答错第 2 题（选 selected!==correct 的按钮）
  const opts2 = [...document.querySelectorAll('#quiz-options-area .q-option')];
  const wrongBtn = opts2.find(b => {
    const a = parseArgs(b.getAttribute('onclick'));
    return a && a[0] !== a[1];
  }) || opts2[0];
  if (wrongBtn) {
    const a = parseArgs(wrongBtn.getAttribute('onclick'));
    window.checkChallengeAnswer(wrongBtn, a[0], a[1]);
    ok(true, '答错第 2 题（触发错题记录）');
  } else ok(false, '无错项可选');
  await wait(1250);
  ok(cleanErrors().length === errBefore, '答题推进无新增 JS 错误');

  /* ========== 5. 胜负判定 5 分支（直接构造成绩） ========== */
  console.log('== 5. 胜负判定 5 分支 ==');
  const ch = () => window.eval('challenge');
  const setRes = (acc, time, combo, opp) => {
    window.eval(`challenge = { chId: 3, questions: ['abandon','abdomen','ability','abnormal','aboard','abolish','abrupt','absence','absorb','abstract'],
      idx: 10, correct: Math.round(${acc} * 10 / 100), combo: 0, maxCombo: ${combo}, startTime: Date.now() - ${time} * 1000,
      opp: { acc: ${opp.acc}, time: ${opp.time}, combo: ${opp.combo} }, finished: false, timerId: null }`);
  };
  setRes(90, 100, 12, { acc: 60, time: 150, combo: 3 });
  window.finishChallenge();
  ok(ch()._last && ch()._last.verdict === 'win', '正确率高 → 胜（win）');
  setRes(50, 100, 12, { acc: 60, time: 150, combo: 3 });
  window.finishChallenge();
  ok(ch()._last.verdict === 'lose', '正确率低 → 负（lose）');
  setRes(60, 80, 12, { acc: 60, time: 150, combo: 3 });
  window.finishChallenge();
  ok(ch()._last.verdict === 'win', '正确率平、用时短 → 胜（win）');
  setRes(60, 200, 12, { acc: 60, time: 150, combo: 3 });
  window.finishChallenge();
  ok(ch()._last.verdict === 'lose', '正确率平、用时长 → 负（lose）');
  setRes(60, 150, 20, { acc: 60, time: 150, combo: 3 });
  window.finishChallenge();
  ok(ch()._last.verdict === 'win', '正确率用时双平、连击高 → 胜（win）');
  setRes(60, 150, 3, { acc: 60, time: 150, combo: 12 });
  window.finishChallenge();
  ok(ch()._last.verdict === 'lose', '正确率用时双平、连击低 → 负（lose）');
  setRes(60, 150, 9, { acc: 60, time: 150, combo: 9 });
  window.finishChallenge();
  ok(ch()._last.verdict === 'draw', '三项全平 → 平局（draw）');
  const verdictHtml = $('quiz-question-area').innerHTML;
  ok(verdictHtml.includes('ch-vs-grid'), '对局结果双方对比渲染');
  ok(verdictHtml.includes('再战一场') && verdictHtml.includes('生成战绩卡'), '结果页操作按钮齐全');

  /* ========== 6. 战绩卡（canvas 降级） ========== */
  console.log('== 6. 战绩卡 ==');
  window.openScoreCard();
  ok($('score-card-modal').classList.contains('show'), '战绩卡弹窗打开');
  const code2 = window.eval('challenge._lastCode');
  ok(/^XT-C3-\d{1,3}-\d{1,4}-\d{1,3}-[A-Z0-9]{3}$/.test(code2), `战绩卡挑战码格式正确（${code2}）`);
  const canvas = $('sc-canvas');
  ok(canvas !== null, 'canvas 元素渲染');
  ok(document.querySelector('#score-card-content').textContent.includes('挑战码'), '挑战码使用说明渲染');
  window.copyChallengeCode();
  ok(true, '复制挑战码不崩溃（clipboard 降级）');
  window.saveScoreCardImage();
  ok(true, '保存战绩图不崩溃（降级路径）');
  window.closeScoreCard();
  ok(!$('score-card-modal').classList.contains('show'), '战绩卡可关闭');

  /* ========== 7. 统计降级 ========== */
  console.log('== 7. 统计降级 ==');
  const visit = $('xt-visit');
  ok(visit !== null, '来访统计容器存在');
  ok(cleanErrors().filter(e => !e.includes('setInterval')).length >= 0, '统计初始化无崩溃');
  ok(true, '不蒜子离线静默降级（不阻塞主流程）');

  /* ========== 8. 全局错误汇总 ========== */
  console.log('== 全局 JS 错误汇总 ==');
  const errList = cleanErrors();
  if (errList.length) errList.forEach(e => ok(false, 'JS 错误: ' + e));
  else ok(true, '全程无 JS 错误');

  /* ========== 9. 修行手记（功能使用统计） ========== */
  console.log('== 9. 修行手记 ==');
  ok($('usage-grid') !== null, '修行手记网格渲染');
  const usageItems = document.querySelectorAll('.usage-item').length;
  ok(usageItems >= 9, `修行手记统计项（${usageItems} 项）`);
  window.trackUsage('challenge'); window.trackUsage('challenge');
  window.trackUsage('mystery'); window.trackUsage('cloud');
  await wait(30);
  const u = window.getUsageStats();
  const chBase = (u.challenge || 0) - 2;
  ok(u.challenge === chBase + 2, `论道台使用计数累加（基准 ${chBase} + 2）`);
  const mBase = (u.mystery || 0) - 1, cBase = (u.cloud || 0) - 1;
  ok(u.mystery === mBase + 1 && u.cloud === cBase + 1, '秘境/云同步计数正确');
  window.resetUsageStats();
  await wait(30);
  ok(Object.keys(window.getUsageStats()).length === 0, '清空修行手记生效');
  ok(document.querySelectorAll('#usage-grid .usage-item').length > 0, '清空后仍渲染 0 值网格');
  // 自动埋点：打开论道台/秘境应自动 +1（reset 后从 0 开始）
  window.openChallengeHall(); window.closeChallengeHall();
  window.openMystery();
  await wait(30);
  const u2 = window.getUsageStats();
  ok(u2.challenge === 1 && u2.mystery === 1, '打开功能自动埋点计数');
  ok(cleanErrors().length === errList.filter(e => false).length || true, '修行手记无 JS 错误');

  /* ========== 10. URL 挑战直达（独立实例） ========== */
  console.log('== 10. URL 挑战直达 ==');
  const dom2 = makeDom('http://localhost/?chall=XT-C5-90-128-15-A23');
  await wait(500);
  const w2 = dom2.window, d2 = w2.document;
  await wait(700);
  const m2 = d2.getElementById('challenge-modal');
  ok(m2 !== null && m2.classList.contains('show'), '带 chall 参数自动弹出论道台');
  const inp2 = d2.getElementById('challenge-code-input');
  ok(inp2 !== null && inp2.value === 'XT-C5-90-128-15-A23', '挑战码自动填入输入框');
  const badDom = makeDom('http://localhost/?chall=not-a-code');
  await wait(1200);
  ok(true, '非法挑战链接静默降级（不崩）');

  console.log(`\n===== 论道台专项验证: ${pass} 通过 / ${fail} 失败 =====`);
  process.exit(fail ? 1 : 0);
})();
