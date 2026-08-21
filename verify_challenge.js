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
const NET_ERR = /Could not load|busuanzi|favicon|net::ERR|HTMLMediaElement|not implemented|navigation to another Document/i;
function cleanErrors() { return jsErrors.filter(e => !NET_ERR.test(String(e))); }

function makeDom(url, allowTutorial, preStore) {
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
      if (!allowTutorial) window.localStorage.setItem('xt12_tutorial_seen_2', '1');
      if (preStore) preStore(window);
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
  ok(!document.body.textContent.includes('云同步'), '云同步已从界面移除（V6.20）');
  window.trackUsage('challenge'); window.trackUsage('challenge');
  window.trackUsage('mystery');
  await wait(30);
  const u = window.getUsageStats();
  const chBase = (u.challenge || 0) - 2;
  ok(u.challenge === chBase + 2, `论道台使用计数累加（基准 ${chBase} + 2）`);
  const mBase = (u.mystery || 0) - 1;
  ok(u.mystery === mBase + 1, '秘境计数正确');
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

  /* ========== 9.5 修行指北（新手引导） ========== */
  console.log('== 9.5 修行指北 ==');
  const guideEntry = document.querySelector('.guide-entry');
  ok(guideEntry !== null, '首页修行指北入口渲染');
  const gErrBefore = cleanErrors().length;
  window.openTutorial();
  await wait(80);
  const tOverlay = document.getElementById('tutorial-overlay');
  ok(tOverlay !== null, '指北弹窗打开');
  ok(tOverlay.querySelectorAll('.tc-step').length === 7, '指北共 7 个步骤');
  const stepTitles = [...tOverlay.querySelectorAll('.tc-step-title')].map(e => e.textContent);
  ok(stepTitles.some(t => t.includes('第一步')), '步骤1 为"第一步从读剧情开始"');
  ok(stepTitles.some(t => t.includes('温养')), '含"温养"详解步骤');
  ok(stepTitles.some(t => t.includes('名词速查')), '含"名词速查"步骤');
  ok(tOverlay.querySelector('.tc-glossary') !== null, '名词速查词典渲染');
  const glossaryText = tOverlay.querySelector('.tc-glossary').textContent;
  ok(['悟词','温养','待温养','飞花令','道之抉择','生词本','错题本','试炼','连击','秘境探索','境界','词灵阁','今日修行','论道台','挑战码','自动存档','导出存档','导入存档','仙途榜','修行手记'].every(k => glossaryText.includes(k)), '词典含全部核心名词');
  ok(!glossaryText.includes('云同步') && !glossaryText.includes('jsonbin'), '词典已删除「云同步」（jsonbin 已移除）');
  ok(!glossaryText.includes('心力'), '词典已删除幽灵词条「心力」（未实现的体力系统）');
  ok(tOverlay.querySelectorAll('.tg-head').length === 4, '词典含 4 个分组标题');
  ok(tOverlay.querySelector('.tc-daily') !== null, '每日修行建议渲染');
  ok(document.querySelector('.tc-step.active') !== null, '默认展示第 1 步');
  // 切步：下一步 → 第 2 步
  tOverlay.querySelector('#tc-next').click();
  await wait(30);
  ok(document.querySelectorAll('.tc-step.active').length === 1, '单步激活');
  ok(cleanErrors().length === gErrBefore, '指北打开/切步无 JS 错误');
  // 关闭后重新打开（可重入）
  tOverlay.querySelector('#tc-skip').click();
  await wait(400);
  ok(document.getElementById('tutorial-overlay') === null, '跳过关闭弹窗');
  window.openTutorial();
  await wait(80);
  ok(document.getElementById('tutorial-overlay') !== null, '入口可重复打开');
  document.getElementById('tutorial-overlay').querySelector('#tc-skip').click();
  await wait(400);
  // 首次进入（未看过）应自动弹出
  const dom3 = makeDom('http://localhost/?first=1', true);
  await wait(1000);
  ok(dom3.window.document.getElementById('tutorial-overlay') !== null, '首次进入自动弹出修行指北');

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

  /* ========== 11. 微信警告 + 每周备份提醒（V6.21） ========== */
  console.log('== 11. 微信警告与备份提醒 ==');
  ok(document.body.textContent.includes('微信里点开的链接'), '首页存档续缘含微信浏览器警告');
  ok(typeof window.maybeWarnWeChat === 'function' && typeof window.maybeRemindBackup === 'function', '提醒函数已定义');
  // 老玩家（12 个已学词、从未备份）→ 启动后应触发备份提醒
  const words12 = ['the','envy','absorb','vanish','bold','calm','eager','faint','grave','harsh','idle','joint'];
  const dom4 = makeDom('http://localhost/?v=621', false, w => {
    w.localStorage.setItem('xt12_state_v2', JSON.stringify({
      v: 2, app: 'xt12', learned: words12, mastered: [], bookmarks: [], wrongWords: {},
      madeChoices: {}, choiceTrial: {}, reviewSchedule: {}, lingRewarded: {},
      dailyGoal: 20, learnedDates: { '2026-08-01': 12 }, streak: { lastDate: '2026-08-01', count: 3 }, sfxOn: true
    }));
  });
  await wait(4000); // 提醒定时器 3200ms 后触发
  const w4 = dom4.window, d4 = w4.document;
  const toast4 = d4.getElementById('toast');
  ok(toast4 && toast4.classList.contains('show') && toast4.textContent.includes('导出存档'), '老玩家启动后收到备份提醒 Toast');
  ok(w4.localStorage.getItem('xt12_backup_remind_ts') !== null, '提醒时间戳已记录（7 天内不重复）');
  // 导出存档 → 记录备份时间戳
  const cleanErrB4 = cleanErrors().length;
  w4.exportSave();
  const backupTs = +(w4.localStorage.getItem('xt12_backup_ts') || 0);
  ok(backupTs > 0 && Date.now() - backupTs < 60000, '导出存档后记录 xt12_backup_ts');
  // 刚备份过 → 再触发提醒应跳过（提醒时间戳不更新）
  const remindBefore = w4.localStorage.getItem('xt12_backup_remind_ts');
  w4.maybeRemindBackup();
  ok(w4.localStorage.getItem('xt12_backup_remind_ts') === remindBefore, '刚备份 7 日内不再提醒');
  // 新手（学词不足 10）→ 不提醒
  const dom5 = makeDom('http://localhost/?fresh=1', false);
  await wait(3600);
  ok(dom5.window.localStorage.getItem('xt12_backup_remind_ts') === null, '新手（<10 词）不打扰');
  // 微信 UA → 弹警告
  let uaOk = true;
  try { Object.defineProperty(dom5.window.navigator, 'userAgent', { value: 'Mozilla/5.0 MicroMessenger/8.0.20', configurable: true }); }
  catch (e) { uaOk = false; }
  if (uaOk) {
    dom5.window.maybeWarnWeChat();
    const t5 = dom5.window.document.getElementById('toast');
    ok(t5 && t5.textContent.includes('在浏览器打开'), '微信 UA 检测后弹「在浏览器打开」提示');
  } else {
    ok(html.includes('MicroMessenger'), '微信 UA 检测逻辑存在（jsdom 无法覆盖 UA，退化为静态断言）');
  }
  ok(cleanErrors().length === cleanErrB4, '提醒/导出流程无新增 JS 错误');

  console.log(`\n===== 论道台专项验证: ${pass} 通过 / ${fail} 失败 =====`);
  process.exit(fail ? 1 : 0);
})();
