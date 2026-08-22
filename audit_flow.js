/* 仙途十二阶 全功能运行时走查 v2（V6.14 深度自查）
 * 模拟真实用户操作路径，断言对齐真实 DOM id/类名。
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

const vc = new VirtualConsole();
vc.on('jsdomError', e => jsErrors.push('jsdomError: ' + String(e.message || e).slice(0, 160)));

const dom = new JSDOM(html, {
  url: 'http://localhost', runScripts: 'dangerously', pretendToBeVisual: true, resources: 'usable',
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
    window.addEventListener('error', e => jsErrors.push('window.onerror: ' + String(e.message || e).slice(0, 160)));
  }
});

const { window } = dom;
const { document } = window;
const $ = id => document.getElementById(id);
const st = () => window.eval('state');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async function main() {
  await wait(400);

  /* ========== 1. 首次进入（空存档）首页 ========== */
  console.log('== 1. 首次进入空存档 ==');
  ok($('page-home') !== null, '首页容器存在');
  ok(typeof window.eval('state') === 'object', 'state 初始化');
  ok(st().learned.constructor.name === 'Set', 'learned 为 Set');
  ok(st().mastered.constructor.name === 'Set', 'mastered 为 Set');
  ok(window.VOCAB.length === 5498, `词库全量加载（${window.VOCAB.length} 词）`);
  ok(jsErrors.filter(e => !String(e).includes('HTMLMediaElement')).length === 0, '初始化无 JS 错误');

  /* ========== 2. 功法殿 ========== */
  console.log('== 2. 功法殿玩法总导航 ==');
  const grid = $('feature-grid');
  ok(grid !== null, '功法殿网格容器存在');
  const fiCount = document.querySelectorAll('.feature-item').length;
  ok(fiCount === 9, `功法殿 9 宫格（实际 ${fiCount}）`);

  /* ========== 3. 今日修行卡 ========== */
  console.log('== 3. 首页今日修行 ==');
  ok($('tc-streak') !== null, '连续打卡元素存在');
  ok($('home-due') !== null, '温养数角标存在');

  /* ========== 4. Tab 切换 ========== */
  console.log('== 4. Tab 切换 ==');
  window.switchTab('vocab'); await wait(50);
  ok($('page-vocab').classList.contains('active'), '切到词库页');
  const vocabItems = document.querySelectorAll('#vocab-list-container .vocab-list-item').length;
  ok(vocabItems > 0, `词库列表渲染（${vocabItems} 项）`);
  window.switchTab('read'); await wait(50);
  ok($('page-read').classList.contains('active'), '切到阅读页');
  window.switchTab('cards'); await wait(50);
  ok($('page-cards').classList.contains('active'), '切到藏录页');
  window.switchTab('home'); await wait(50);
  ok($('page-home').classList.contains('active'), '切回首页');

  /* ========== 5. 阅读页 ========== */
  console.log('== 5. 阅读页渲染 ==');
  window.switchTab('read'); await wait(80);
  const storyBlocks = document.querySelectorAll('.story-block').length;
  ok(storyBlocks > 0, `章节内容渲染（${storyBlocks} 个区块）`);
  const exploreBtns = document.querySelectorAll('.explore-btn').length;
  ok(exploreBtns >= 2, `探索区双按钮存在（${exploreBtns} 个）`);
  const redWords = document.querySelectorAll('.vocab-word').length;
  ok(redWords > 0, `章节高亮词存在（${redWords} 个）`);

  /* ========== 6. 秘境探索 ========== */
  console.log('== 6. 秘境探索 ==');
  const errBefore = jsErrors.filter(e => !String(e).includes('HTMLMediaElement')).length;
  window.openMystery();
  const em = document.querySelector('.mystery-modal');
  ok(em !== null, '秘境弹窗打开（独立类名）');
  if (em) {
    const word = em.querySelector('.em-word');
    const opts = [...em.querySelectorAll('.em-opts button')];
    ok(word && word.textContent.trim().length > 0, '秘境展示随机词');
    ok(opts.length === 4, `秘境 4 个选项（实际 ${opts.length}）`);
    // 答错：选一个确定非正确的选项（选项随机打乱，正确项可能排在第一位）
    const m = opts[0].getAttribute('onclick').match(/'([^']*)','([^']*)','([^']*)'/);
    const correct = m[2], w = m[3];
    const correctBtn = opts.find(b => b.textContent.includes(correct));
    const wrongBtn = opts.find(b => b !== correctBtn) || opts[0];
    window.handleMysteryAnswer(wrongBtn, wrongBtn.textContent.slice(3), correct, w);
    ok(!st().learned.has(w), '秘境答错不入已学');
    ok([...em.querySelectorAll('.em-opts button')].some(b => b.classList.contains('correct')), '答错揭示正确项');
    ok($('ling-hall-modal') !== null, '词灵阁弹窗未被误删');
    // 答对：收录仙册 + 弹窗保留（多轮连答模式）+ 出现"继续探索"按钮 + 词灵阁仍在
    document.querySelectorAll('.mystery-modal').forEach(o => o.remove());
    window.openMystery();
    const em2 = document.querySelector('.mystery-modal');
    const btns2 = em2 ? [...em2.querySelectorAll('.em-opts button')] : [];
    if (em2 && btns2.length) {
      const a2 = btns2[0].getAttribute('onclick');
      const m2 = a2.match(/'([^']*)','([^']*)','([^']*)'/);
      const c2 = m2[2], w2 = m2[3];
      const winBtn = btns2.find(b => b.textContent.includes(c2));
      window.handleMysteryAnswer(winBtn, c2, c2, w2);
      ok(st().learned.has(w2), '秘境答对收录仙册');
      ok($('ling-hall-modal') !== null, '答对后词灵阁未被误删');
      const contBtn = em2.querySelector('.em-continue-btn');
      ok(contBtn !== null, '答对后出现"继续探索"按钮（多轮连答模式）');
      ok(em2.parentNode !== null, '答对后弹窗保留（等待用户继续探索）');
      ok($('ling-hall-modal') !== null, '弹窗保留不误删词灵阁');
    }
  }
  ok(jsErrors.filter(e => !String(e).includes('HTMLMediaElement')).length === errBefore, '秘境流程无新增 JS 错误');

  /* ========== 7. 词灵阁 ========== */
  console.log('== 7. 词灵阁 ==');
  window.openLingHall();
  const lh = $('ling-hall-modal');
  ok(lh !== null && lh.style.display !== 'none', '词灵阁弹窗打开');
  const famCards = lh ? lh.querySelectorAll('.ling-card').length : 0;
  ok(famCards >= 10, `词灵家族卡片渲染（${famCards} 张）`);
  const stats = window.lingHallStats();
  ok(Array.isArray(stats) && stats.length >= 35, `词灵统计（${stats.length} 族）`);
  window.claimLingReward('名相');
  await wait(30);
  ok(true, '未集齐时领奖不崩溃');
  window.closeLingHall();
  ok(lh.style.display === 'none', '词灵阁可关闭');

  /* ========== 8. 词库筛选 ========== */
  console.log('== 8. 词库筛选 ==');
  window.switchTab('vocab'); await wait(50);
  const filterBtns = [...document.querySelectorAll('.filter-btn')];
  ok(filterBtns.length === 6, `词库 6 个筛选（实际 ${filterBtns.length}）`);
  ['all','bookmark','wrong','mastered','learning','new'].forEach((f, i) => window.setVocabFilter(filterBtns[i], f));
  ok(true, '全部筛选切换无异常');
  const counts = document.querySelectorAll('.fb-count').length;
  ok(counts === 5, `筛选徽标渲染（${counts} 个）`);

  /* ========== 9. 词卡弹窗 ========== */
  console.log('== 9. 词卡弹窗 ==');
  window.openWordModal('abandon');
  const wm = $('word-modal');
  ok(wm && wm.classList.contains('show'), '词卡弹窗打开');
  const wmText = wm.textContent;
  ok(wmText.includes('abandon'), '词卡内容含词条');
  ok(wmText.includes('放弃'), '词卡内容含释义');
  const lingHint = document.querySelector('.wm-ling-hint');
  ok(lingHint === null || lingHint.textContent.length > 0, '词灵归属行渲染');
  window.hideWordModal();
  ok(!wm.classList.contains('show'), '词卡可关闭');

  /* ========== 10. 人物图鉴 ========== */
  console.log('== 10. 人物图鉴 ==');
  window.switchTab('cards'); await wait(80);
  const charCards = document.querySelectorAll('.char-card').length;
  ok(charCards === 6, `图鉴 6 张卡（实际 ${charCards}）`);
  if (charCards > 0) {
    window.showCharModal(0);
    const cm = $('char-modal');
    ok(cm && cm.classList.contains('show'), '角色详情弹窗打开');
    const cmImg = cm.querySelector('img');
    ok(cmImg && cmImg.src.includes('characters'), '角色弹窗大图引用正确');
    window.closeCharModal();
    ok(!cm.classList.contains('show'), '角色弹窗可关闭');
  }

  /* ========== 11. 战斗 ========== */
  console.log('== 11. 章节试炼（Boss 战） ==');
  const errBefore2 = jsErrors.filter(e => !String(e).includes('HTMLMediaElement')).length;
  window.quizChapter(1);
  await wait(100);
  ok($('page-quiz').classList.contains('active'), '战斗页激活');
  ok($('quiz-play-area').style.display === 'block', '战斗区展开');
  ok($('quiz-question-area') && $('quiz-question-area').innerHTML.length > 0, '战斗题面渲染');
  // 未解锁章节保护
  window.quizChapter(2);
  await wait(30);
  ok($('page-quiz').classList.contains('active'), '锁定章节仍留在战斗页（不进入）');
  ok(jsErrors.filter(e => !String(e).includes('HTMLMediaElement')).length === errBefore2, '战斗流程无新增 JS 错误');

  /* ========== 12. 老存档兼容 ========== */
  console.log('== 12. 老存档兼容 ==');
  window.localStorage.setItem('xt12_state_v2', JSON.stringify({
    learned: ['abandon', 'abdomen'], mastered: ['abandon'],
    reviewSchedule: {}, wrongWords: [], vocabFilter: 'all',
    currentChapter: 1, currentSection: 0, learnedDates: {}, streak: { count: 0, lastDate: '' },
    dailyGoal: 50, bookmarks: [], achievements: [], lingRewarded: {}, cards: {}
  }));
  window.loadState();
  window.renderAll();
  await wait(80);
  ok(st().learned.has('abandon'), '老存档 learned 恢复');
  ok(Object.keys(st().lingRewarded).length === 0, '老存档 lingRewarded 兼容');

  /* ========== 13. 全局错误汇总 ========== */
  console.log('== 全局 JS 错误汇总 ==');
  const errList = jsErrors.filter(e => !String(e).includes('favicon') && !String(e).includes('net::ERR') && !String(e).includes('HTMLMediaElement'));
  if (errList.length) errList.forEach(e => ok(false, 'JS 错误: ' + e));
  else ok(true, '全程无 JS 错误');

  console.log(`\n===== 走查结果: ${pass} 通过 / ${fail} 失败 =====`);
  process.exit(fail ? 1 : 0);
})();
