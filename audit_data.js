/* 数据一致性审计：剧情词/奇遇词/词灵/章节词池 与 vocab.js 全量校验 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const vocabJs = fs.readFileSync(path.join(__dirname, 'vocab.js'), 'utf8');
html = html.replace('<script src="vocab.js"></script>', '<script>' + vocabJs + '</script>');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('✅ ' + name); } else { fail++; console.log('❌ ' + name); } }

const vc = new VirtualConsole();
const dom = new JSDOM(html, {
  url: 'http://localhost', runScripts: 'dangerously', pretendToBeVisual: true, resources: 'usable',
  virtualConsole: vc,
  beforeParse(window) {
    window.localStorage = { _store: {}, getItem(k) { return this._store[k] ?? null; }, setItem(k, v) { this._store[k] = String(v); }, removeItem(k) { delete this._store[k]; } };
    window.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    window.confirm = () => true; window.scrollTo = () => {};
  }
});

setTimeout(() => {
  const { window } = dom;
  const { document } = window;
  const vocabSet = new Set((window.VOCAB || []).map(v => v.word));
  const vocabDefs = new Map((window.VOCAB || []).map(v => [v.word, v.def || '']));

  /* ===== 1. STORY_WORDS 全量在词库 ===== */
  console.log('== 1. STORY_WORDS 词库校验 ==');
  const sw = window.eval('STORY_WORDS');
  ok(Array.isArray(sw) && sw.length >= 380, `STORY_WORDS 挂载（${sw.length} 词）`);
  const swMissing = sw.filter(w => !vocabSet.has(w.word));
  ok(swMissing.length === 0, '剧情词全部在词库' + (swMissing.length ? '：' + swMissing.map(x => x.word).join(',') : ''));
  // 章节分配完整
  const chSet = new Set(sw.map(w => w.chapter));
  ok(chSet.size === 12, `剧情词覆盖 12 章（实际 ${chSet.size}）`);
  const chCounts = {};
  sw.forEach(w => chCounts[w.chapter] = (chCounts[w.chapter] || 0) + 1);
  const chMissing = Object.values(chCounts).filter(c => c < 20);
  ok(chMissing.length === 0, `每章插叙词 ≥20（${Object.values(chCounts).join('/')}）`);

  /* ===== 2. EXPLORE_EVENTS（本章奇遇）词校验 ===== */
  console.log('== 2. EXPLORE_EVENTS 词库校验 ==');
  const ee = window.eval('EXPLORE_EVENTS');
  const eeList = ee ? Object.values(ee) : [];
  ok(eeList.length >= 10, `本章奇遇事件（${eeList.length} 个）`);
  const eeMissing = eeList.filter(e => e && !vocabSet.has(e.word));
  ok(eeMissing.length === 0, '奇遇词全部在词库' + (eeMissing.length ? '：' + eeMissing.map(x => x.word).join(',') : ''));
  const eeNoDef = eeList.filter(e => e && !vocabDefs.get(e.word));
  ok(eeNoDef.length === 0, '奇遇词全部有释义');

  /* ===== 3. 词灵家族 ===== */
  console.log('== 3. 词灵家族 ==');
  const stats = window.lingHallStats();
  ok(stats.length >= 35, `词灵家族数（${stats.length}）`);
  const emptyFam = stats.filter(f => f.total === 0);
  ok(emptyFam.length === 0, '无空家族');
  const allCovered = stats.reduce((s, f) => s + f.total, 0);
  ok(allCovered <= vocabSet.size, `家族覆盖词数（${allCovered} ≤ ${vocabSet.size}）`);
  // 散修族（无词缀词）存在
  const stray = stats.find(f => f.family.includes('散修'));
  ok(!!stray, '散修族存在');

  /* ===== 4. SCENE_TEMPLATES 完整性 ===== */
  console.log('== 4. SCENE_TEMPLATES ==');
  const st = window.eval('SCENE_TEMPLATES');
  ok(Array.isArray(st) && st.length >= 20, `场景模板数（${st.length}）`);
  const badSc = st.filter(s => !s || !s.pre || !s.pre.includes('{word}'));
  ok(badSc.length === 0, '全部场景模板含 {word} 插槽');
  // 插槽词渲染：随机挑 3 个词渲染场景句，确认不抛错且含词
  let renderOk = true;
  for (const v of window.VOCAB.slice(0, 200).filter((_, i) => i % 70 === 0)) {
    const sc = st[Math.floor(Math.random() * st.length)];
    const flavor = sc.pre.replace('{word}', v.word);
    if (!flavor.includes(v.word)) renderOk = false;
  }
  ok(renderOk, '场景句渲染包含词（抽样）');

  /* ===== 5. CTX_TEMPLATES（语境降级） ===== */
  console.log('== 5. 语境降级链 ==');
  const ctxT = window.eval('CTX_TEMPLATES');
  ok(!!ctxT && Object.keys(ctxT).length >= 4, `词性句架模板（${Object.keys(ctxT).length} 类）`);
  // 抽 30 个词全部能拿到语境
  const sample = window.VOCAB.filter((_, i) => i % 183 === 0);
  let ctxOk = true, ctxFail = [];
  for (const v of sample) {
    try {
      const c = window.buildQuizContext(v.word);
      if (!c || c.length < 5) { ctxOk = false; ctxFail.push(v.word + '(空)'); }
    } catch (e) { ctxOk = false; ctxFail.push(v.word + '(' + e.message + ')'); }
  }
  ok(ctxOk, `语境题 100% 有上下文（抽 ${sample.length} 词）` + (ctxFail.length ? '：' + ctxFail.join(',') : ''));

  /* ===== 6. 词库数据本身 ===== */
  console.log('== 6. 词库数据完整性 ==');
  const noDef = window.VOCAB.filter(v => !v.def);
  ok(noDef.length === 0, '全部词有条目' + (noDef.length ? '：' + noDef.slice(0,5).map(v=>v.word).join(',') : ''));
  const dup = window.VOCAB.length - vocabSet.size;
  ok(dup === 0, '词库无重复词');
  const noPos = window.VOCAB.filter(v => !/^[a-z]+\./.test((v.def || '')));
  ok(noPos.length < window.VOCAB.length * 0.02, `词性标注覆盖（缺失 ${noPos.length}/${window.VOCAB.length}）`);

  /* ===== 7. 极端词渲染 ===== */
  console.log('== 7. 极端词渲染 ==');
  const longest = [...window.VOCAB].sort((a, b) => b.word.length - a.word.length)[0];
  const extWords = window.VOCAB.slice(0, 3).map(v => v.word);
  let extOk = true;
  for (const w of [...extWords, longest.word]) {
    try { window.openWordModal(w); if (!document.getElementById('word-modal').classList.contains('show')) extOk = false; window.hideWordModal(); }
    catch (e) { extOk = false; console.log('  极端词异常:', w, e.message); }
  }
  ok(extOk, `词库内极端词词卡渲染（含最长词 ${longest.word} ${longest.word.length} 字母）`);
  // 词库外词：优雅拒绝不崩溃
  let extSafe = true;
  try { window.openWordModal('a'); } catch (e) { extSafe = false; }
  window.hideWordModal();
  ok(extSafe, '词库外词（a）安全拒绝不崩溃');
  // 搜索空结果
  try { document.getElementById('vocab-search').value = 'zzzzqqqq'; window.renderVocabList(); } catch (e) { ok(false, '搜索渲染异常:' + e.message); }
  ok(document.getElementById('vocab-list-container').textContent.includes('暂无匹配'), '空搜索结果有占位提示');
  document.getElementById('vocab-search').value = '';

  console.log(`\n===== 数据审计: ${pass} 通过 / ${fail} 失败 =====`);
  process.exit(fail ? 1 : 0);
}, 500);
