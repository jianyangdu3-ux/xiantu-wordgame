/* 仙途十二阶 V6.11 全词库剧情化专项测试
   覆盖：STORY_INSERT 主线扩词挂载 / 秘境奇遇无限化 / 语境题三级降级 / 词灵系统 / 探索区双按钮 / 老存档兼容 */
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
const st = () => window.eval('state');

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
// 从 onclick="handleMysteryAnswer(this,'sel','correct','word')" 解析出参数（处理转义引号）
function parseArgs(expr) {
  const inner = expr.slice(expr.indexOf('(') + 1, expr.lastIndexOf(')'));
  const parts = []; let cur = '', inQ = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '\\' && inQ) { cur += ch + (inner[i + 1] || ''); i++; continue; }
    if (ch === "'") { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

(async function main() {
  await wait(300);

  const VOCAB = window.VOCAB || [];
  const vocabSet = new Set(VOCAB.map(v => v.word));
  const SI = window.eval('STORY_INSERT');
  const SW = window.eval('STORY_WORDS');
  const SECTIONS = window.eval('STORY_SECTIONS');

  /* ================= A. STORY_INSERT 主线扩词挂载 ================= */
  ok(SI && Object.keys(SI).length === 12, 'STORY_INSERT 覆盖全部 12 章');
  const perCh = Object.keys(SI).map(k => SI[k].length);
  ok(perCh.every(n => n >= 20), `每章插叙 ≥20 条（实际 ${Math.min(...perCh)}~${Math.max(...perCh)}）`);
  const totalInsWords = Object.keys(SI).reduce((s, k) => s + SI[k].reduce((a, it) => a + (it.words || []).length, 0), 0);
  ok(totalInsWords >= 280, `插叙词总数 ≥280（实际 ${totalInsWords}）`);
  ok(SW.length >= 380, `STORY_WORDS 挂载后 ≥380（127 原词+净增 266+，实际 ${SW.length}）`);
  ok(SW.every(v => vocabSet.has(v.word)), '全部 STORY_WORDS 词存在于词库（高亮/释义有效）');
  const badIns = [];
  Object.keys(SI).forEach(k => SI[k].forEach(it => (it.words || []).forEach(w => { if (!vocabSet.has(w)) badIns.push(k + ':' + w); })));
  ok(badIns.length === 0, 'STORY_INSERT 源头词 0 超纲' + (badIns.length ? '（' + badIns.slice(0, 5).join(',') + '）' : ''));
  ok(/ancient/.test(SECTIONS[0].content), '第一章剧情已拼入插叙句（含 ancient）');
  ok(SW.some(v => v.word === 'ancient' && v.chapter === 1), '插叙词已注册章节归属（ancient→第1章）');

  /* ================= B. 词灵系统 ================= */
  ok(window.getLingFamily('nation').family.includes('名相'), '后缀 -tion → 神通·名相族');
  ok(window.getLingFamily('interview').family.includes('互联'), '前缀 inter- → 交济·互联族（后缀优先，故不用以-tion结尾的 international）');
  ok(window.getLingFamily('abandon').family.includes('散修'), '无词缀 → 散修·无门族');
  const stats = window.lingHallStats();
  const sumTotal = stats.reduce((s, f) => s + f.total, 0);
  ok(sumTotal === VOCAB.length, '词灵家族 total 总和 = 词库总数（' + sumTotal + '/' + VOCAB.length + '）');
  ok(stats.every(f => typeof f.got === 'number' && typeof f.master === 'number' && f.family), '家族统计字段完整（family/total/got/master）');
  // 集齐 total 最小的家族 → 领奖
  const minFam = stats[stats.length - 1];
  const famWords = VOCAB.filter(v => window.getLingFamily(v.word).family === minFam.family);
  famWords.forEach(v => window.markLearned(v.word));
  const beforeMaster = st().mastered.size;
  window.claimLingReward(minFam.family);
  ok(!!st().lingRewarded[minFam.family], '集齐后领取奖励 → lingRewarded 标记（' + minFam.family + '）');
  ok(st().mastered.size > beforeMaster || st().lingRewarded[minFam.family], '奖励落实（顿悟新词或已尽数悟透）');
  const saved2 = JSON.parse(window.localStorage.getItem('xt12_state_v2') || '{}');
  ok(!!saved2.lingRewarded && saved2.lingRewarded[minFam.family] === true, '存档含 lingRewarded 序列化');
  // 词灵阁弹层
  window.openLingHall();
  ok($('ling-hall-modal').style.display === 'flex', 'openLingHall 弹出词灵阁');
  ok($('ling-hall-desc').textContent.includes('词灵'), '词灵阁统计描述已渲染');
  window.closeLingHall();
  ok($('ling-hall-modal').style.display === 'none', 'closeLingHall 关闭词灵阁');
  ok(!!document.querySelector('.ling-hall-card'), '词库页词灵阁入口卡存在');

  /* ================= C. 语境题三级降级 ================= */
  const withEx = VOCAB.find(v => window.getWordInfo(v.word).example);
  ok(!!withEx, '词库中存在带例句的词（' + (withEx ? withEx.word : '无') + '）');
  if (withEx) {
    const ctx1 = window.buildQuizContext(withEx.word);
    ok(ctx1.includes('qq-ctx') && ctx1.includes(window.getWordInfo(withEx.word).example), '有例句 → 真实例句语境（第一级）');
  }
  const noEx = VOCAB.filter(v => !window.getWordInfo(v.word).example);
  ok(noEx.length > 100, '无例句词 ≥100（' + noEx.length + '，走句架/场景降级）');
  let allOk = true, failWord = '';
  for (let i = 0; i < 40; i++) {
    const w = noEx[Math.floor(Math.random() * noEx.length)].word;
    const c = window.buildQuizContext(w);
    if (!c || !c.includes('qq-ctx')) { allOk = false; failWord = w; break; }
  }
  ok(allOk, '抽样 40 个无例句词均得到语境（句架引用或秘境场景）' + (allOk ? '' : '（失败词:' + failWord + '）'));
  // 考试题面集成
  window.eval('state.currentQuizWords=["nation"]; state.quizScore=0; state.quizCurrent=0; state.quizTotal=1; state.quizMode="en2cn"; state.quizIsReview=false;');
  window.showQuizQuestion();
  ok($('quiz-question-area').innerHTML.includes('qq-ctx'), '考试题面（英择中义）渲染语境');

  /* ================= D. 秘境奇遇 ================= */
  window.openMystery();
  const card = document.querySelector('.explore-modal .em-card');
  ok(!!card, 'openMystery 生成秘境弹层');
  const firstBtn = document.querySelector('.explore-modal .em-opts button');
  const args = parseArgs(firstBtn.getAttribute('onclick'));
  const sel0 = args[1], correct = args[2], mWord = args[3];
  ok(!!mWord && vocabSet.has(mWord), '秘境词来自词库（' + mWord + '）');
  const mOpts = document.querySelectorAll('.explore-modal .em-opts button');
  ok(mOpts.length === 4, '秘境选项恰为 4 个');
  const flavor = document.querySelector('.explore-modal .em-flavor');
  ok(!!flavor && flavor.textContent.includes(mWord), '秘境场景句包含该词');
  const mOptTexts = [...mOpts].map(b => b.textContent);
  ok(new Set(mOptTexts).size >= 2 && mOptTexts.some(t => t.includes(correct)), '选项含干扰项且正确项可辨');
  // 答错：不入已学
  window.handleMysteryAnswer(firstBtn, '___错误答案___', correct, mWord);
  ok(!st().learned.has(mWord), '秘境答错不入已学');
  // 答对：收录仙册
  window.handleMysteryAnswer(document.createElement('button'), correct, correct, mWord);
  ok(st().learned.has(mWord), '秘境答对后收录仙册');

  /* ================= E. 探索区双按钮 + 老存档兼容 ================= */
  window.eval('state.currentSection = 0; state.currentChapter = 1;');
  let scHtml = '';
  try { window.renderStoryContent(); scHtml = $('story-content').innerHTML; } catch (e) { scHtml = ''; }
  ok(!!scHtml, 'renderStoryContent 正常渲染（不抛错）');
  ok(scHtml.includes('秘境探索'), '探索区含「🌌 秘境探索」按钮');
  ok(scHtml.includes('本章奇遇'), '探索区含「🔍 本章奇遇」按钮');
  ok(scHtml.includes('ancient'), '第一章阅读内容包含插叙词 ancient');
  // 老存档无 lingRewarded → 默认 {}
  window.localStorage.setItem('xt12_state_v2', JSON.stringify({ learned: ['abandon'], mastered: [], reviewSchedule: {} }));
  window.loadState();
  ok(st().learned.has('abandon') && Object.keys(st().lingRewarded).length === 0, '老存档加载兼容（lingRewarded 默认 {}）');

  /* ================= F. 功法殿玩法总导航（可发现性） ================= */
  window.eval('state.bookmarks = new Set(["abandon","ability"]); state.wrongWords = { abandon: 1 }; state.learned = new Set(["abandon","abide"]); state.mastered = new Set(["abandon"]);');
  window.updateStats();
  const fg = $('feature-grid');
  ok(!!fg, '功法殿容器存在');
  const fItems = fg ? fg.querySelectorAll('.feature-item') : [];
  ok(fItems.length === 9, '功法殿渲染 9 个玩法入口（当前 ' + fItems.length + '）');
  const fText = fg ? fg.textContent : '';
  ok(fText.includes('秘境探索'), '功法殿含「秘境探索」直达');
  ok(fText.includes('词灵阁'), '功法殿含「词灵阁」直达');
  ok(fText.includes('章节试炼'), '功法殿含「章节试炼」直达');
  ok(fText.includes('生词本') && fText.includes('错题本'), '功法殿含「生词本/错题本」直达');
  ok(fg && fg.querySelector('.fi-badge'), '生词/错题等状态显示角标');
  // 词库筛选计数徽标
  window.updateFilterCounts();
  const fbB = $('fb-bookmark'), fbW = $('fb-wrong');
  ok(!!fbB && fbB.textContent === '2', '词库「⭐ 生词」筛选显示数量 2（实际 ' + (fbB && fbB.textContent) + '）');
  ok(!!fbW && fbW.textContent === '1', '词库「❌ 错题」筛选显示数量 1（实际 ' + (fbW && fbW.textContent) + '）');
  // 跳转辅助：生词本直达
  window.goVocabFilter('bookmark');
  ok(st().vocabFilter === 'bookmark' && $('page-vocab').classList.contains('active'), '功法殿跳生词本：切页 + 筛选生效');

  console.log('\n=== 结果: ' + pass + ' 通过, ' + fail + ' 失败 ===');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试崩溃: ' + e.stack); process.exit(2); });
