/* 仙途十二阶 V6.10 学习闭环专项测试
   覆盖：错词入队(P0-1) / 学会判定(P0-2) / 每日目标打卡(P1-1) / Boss战本章词池(P1-2) / 生词本(P1-3) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
const vocabJs = fs.readFileSync(path.join(__dirname, 'vocab.js'), 'utf8');
html = html.replace('<script src="vocab.js"></script>', '<script>' + vocabJs + '</script>');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('✅ ' + name); }
  else { fail++; console.log('❌ ' + name); }
}

const dom = new JSDOM(html, {
  url: 'http://localhost',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  resources: 'usable',
  beforeParse(window) {
    window.localStorage = {
      _store: {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this._store, k) ? this._store[k] : null; },
      setItem(k, v) { this._store[k] = String(v); },
      removeItem(k) { delete this._store[k]; }
    };
    window.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    window.confirm = () => true;
    window.scrollTo = () => {};
  }
});

const { window } = dom;
const { document } = window;
const $ = id => document.getElementById(id);
const st = () => window.eval('state'); // 顶层 let state 通过 eval 访问

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async function main() {
  await wait(300);

  ok(typeof window.markLearned === 'function', 'markLearned 为全局函数');
  ok(typeof window.recordWrong === 'function', 'recordWrong 为全局函数');
  ok(typeof window.setDailyGoal === 'function', 'setDailyGoal 为全局函数');
  ok(typeof window.toggleBookmark === 'function', 'toggleBookmark 为全局函数');
  ok(typeof window.todayLearnedCount === 'function', 'todayLearnedCount 为全局函数');

  /* ---- P0-2：点开词卡不再自动学会 ---- */
  const w0 = 'abandon';
  window.openWordModal(w0);
  ok(!st().learned.has(w0), 'P0-2 点开词卡不自动计入已学');

  /* ---- P0-1 + 学会判定：速测答对 = 学会 + 打卡 ---- */
  window.eval(`currentQuizWord = '${w0}'`);
  const btnRight = document.createElement('button');
  window.checkMCAnswer(btnRight, '放弃', '放弃');
  let s = st();
  ok(s.learned.has(w0), '速测答对后计入已学');
  ok(s.mastered.has(w0), '答对后计入已悟');
  ok(s.learnedDates[w0] === window.todayStr(), '记录学会日期');
  ok(s.streak.count === 1 && s.streak.lastDate === window.todayStr(), '首次打卡 streak=1');

  /* ---- P0-1：答错进错题本 + 入温养队列 ---- */
  const w1 = 'abdomen';
  window.eval(`currentQuizWord = '${w1}'`);
  const btnWrong = document.createElement('button');
  window.checkMCAnswer(btnWrong, '错误答案', '正确释义');
  s = st();
  ok((s.wrongWords[w1] || 0) === 1, '答错记录错题次数=1');
  ok(!!s.reviewSchedule[w1], '答错词已进入温养队列');
  ok(s.learned.has(w1), '答错也计入接触过（防刷：必须答题才算）');
  // 再答错一次次数累加
  window.eval(`currentQuizWord = '${w1}'`);
  window.checkMCAnswer(document.createElement('button'), '又错', '正确释义');
  ok((st().wrongWords[w1] || 0) === 2, '错题次数累加=2');

  /* ---- P1-1：每日目标 + 连续打卡 ---- */
  window.setDailyGoal(20);
  ok(st().dailyGoal === 20, '每日目标可设置为 20');
  ok($('tc-goal-text') && /20/.test($('tc-goal-text').textContent), '首页今日修行卡显示目标 20');
  ok($('tc-streak') && $('tc-streak').textContent.trim() === '1', '首页显示连续打卡 1 天');
  window.setDailyGoal(50);

  /* ---- P1-3：生词本 ---- */
  window.toggleBookmark(w1);
  s = st();
  ok(s.bookmarks.has(w1), '收藏后进入生词本');
  ok(!!s.reviewSchedule[w1], '生词自动进入温养队列');
  // 生词筛选
  st().vocabFilter = 'bookmark';
  window.renderVocabList();
  ok(/abdomen/.test($('vocab-list-container').textContent), '词库「生词」筛选命中');
  // 错题筛选
  st().vocabFilter = 'wrong';
  window.renderVocabList();
  ok(/abdomen/.test($('vocab-list-container').textContent), '词库「错题」筛选命中');
  // 取消收藏
  window.toggleBookmark(w1);
  ok(!st().bookmarks.has(w1), '再点一次移出生词本');

  /* ---- P1-2：Boss 战词池以本章词为主 ---- */
  const ch1words = window.chapterWords(1);
  window.startChapterBattle(1);
  const qw = st().currentQuizWords;
  ok(qw.length === 20, 'Boss 战固定 20 题');
  if (ch1words.length >= 20) {
    ok(qw.every(w => ch1words.includes(w)), '本章词≥20 时全部来自本章词池');
  } else {
    ok(ch1words.every(w => qw.includes(w)), '本章词<20 时包含全部本章词并补齐');
    ok(qw.filter(w => ch1words.includes(w)).length >= Math.min(10, ch1words.length), '本章词占主导');
  }

  /* ---- 存档持久化包含新字段 ---- */
  const saved = JSON.parse(window.localStorage.getItem('xt12_state_v2') || '{}');
  ok(typeof saved.dailyGoal === 'number', '存档含 dailyGoal');
  ok(!!saved.learnedDates && typeof saved.learnedDates === 'object', '存档含 learnedDates');
  ok(!!saved.streak && typeof saved.streak.count === 'number', '存档含 streak');
  ok(Array.isArray(saved.bookmarks), '存档含 bookmarks');
  ok(!!saved.wrongWords, '存档含 wrongWords');

  /* ---- 老存档兼容：缺新字段不崩 ---- */
  window.localStorage.setItem('xt12_state_v2', JSON.stringify({ learned: ['abandon'], mastered: [], reviewSchedule: {}, sfxOn: true }));
  window.loadState();
  s = st();
  ok(s.dailyGoal === 50 && s.streak.count === 0 && s.bookmarks.size === 0 && Object.keys(s.wrongWords).length === 0, '老存档加载兼容（默认值兜底）');
  ok(s.learned.has('abandon'), '老存档已学词保留');

  console.log('\n=== 结果: ' + pass + ' 通过, ' + fail + ' 失败 ===');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试崩溃: ' + e.stack); process.exit(2); });
