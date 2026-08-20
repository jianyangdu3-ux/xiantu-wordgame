/* 静态审计 v2：排除动态创建/拼接的合法模式 + 新增重复 id / 重复函数名检查 */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const js = html.split(/<script>|<\/script>/).filter(s => s.includes('function ')).join('\n');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log('❌ ' + name); } }

/* ---- 1. onclick 引用 vs 函数定义（排除 onclick="if(...) 内嵌语句） ---- */
const onClickCalls = new Set();
const reCall = /onclick="([A-Za-z_$][\w$]*)\s*\(/g;
let m;
while ((m = reCall.exec(html))) {
  // 排除 "onclick=\"if(" 这种内嵌条件语句
  if (m[1] === 'if' || m[1] === 'return') continue;
  onClickCalls.add(m[1]);
}
const defined = new Set();
const reFn = /function\s+([A-Za-z_$][\w$]*)/g;
while ((m = reFn.exec(js))) defined.add(m[1]);
const reVar = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function|\(|[A-Za-z_$])/g;
while ((m = reVar.exec(js))) defined.add(m[1]);

console.log('== 1. onclick 函数引用检查 ==');
const missingCalls = [...onClickCalls].filter(f => !defined.has(f)).sort();
if (missingCalls.length) missingCalls.forEach(f => ok(false, `onclick 引用了未定义函数: ${f}()`));
else ok(true, `全部 ${onClickCalls.size} 个 onclick 函数均已定义`);

/* ---- 2. getElementById 引用（排除动态创建的元素，单独列动态创建的 id） ---- */
const idsInHtml = new Set();
const reId = /\bid="([^"]+)"/g;
while ((m = reId.exec(html))) idsInHtml.add(m[1]);

// 找出动态创建的 id（createElement + id = 'x'）
const dynIds = new Set();
const reDyn = /\.id\s*=\s*['"]([^'"]+)['"]/g;
while ((m = reDyn.exec(js))) dynIds.add(m[1]);

const getIdCalls = new Set();
const reGet = /getElementById\(['"]([^'"]+)['"]\)/g;
while ((m = reGet.exec(js))) getIdCalls.add(m[1]);

console.log('== 2. getElementById 引用检查 ==');
const missingIds = [...getIdCalls].filter(id => !idsInHtml.has(id) && !dynIds.has(id)).sort();
if (missingIds.length) missingIds.forEach(id => ok(false, `getElementById 引用了不存在的 id（非动态创建）: #${id}`));
else ok(true, `全部 ${getIdCalls.size} 个 getElementById id 均有来源（HTML 或动态创建）`);

/* ---- 3. 重复 id 检查（HTML 中） ---- */
console.log('== 3. 重复 id 检查 ==');
const idCount = {};
idsInHtml.forEach(id => idCount[id] = (idCount[id] || 0) + 1);
const dupIds = Object.entries(idCount).filter(([, c]) => c > 1);
if (dupIds.length) dupIds.forEach(([id, c]) => ok(false, `HTML 重复 id: #${id} ×${c}`));
else ok(true, `HTML 无重复 id（共 ${idsInHtml.size} 个唯一 id）`);

/* ---- 4. 重复函数定义检查 ---- */
console.log('== 4. 重复函数定义检查 ==');
const fnCount = {};
defined.forEach(f => fnCount[f] = (fnCount[f] || 0) + 1);
const dupFns = Object.entries(fnCount).filter(([, c]) => c > 1);
if (dupFns.length) dupFns.forEach(([f, c]) => ok(false, `重复定义函数: ${f} ×${c}`));
else ok(true, `无重复函数定义（共 ${defined.size} 个唯一函数）`);

/* ---- 5. 模板字符串中的 ${} 配对粗略检查（统计 ${ 和 } 数量） ---- */
console.log('== 5. 模板字符串完整性（粗查） ==');
const backtickCount = (js.match(/`/g) || []).length;
if (backtickCount % 2 !== 0) ok(false, `反引号数量为奇数 ${backtickCount}，存在未闭合模板字符串`);
else ok(true, `反引号数量 ${backtickCount} 为偶数`);

/* ---- 6. 弹窗卡片必须有实色背景（防浅色/透明弹窗回归，用户反馈"看不清"） ---- */
console.log('== 6. 弹窗卡片实色背景检查 ==');
const modalBgRules = [
  ['.word-modal', '#ffffff', '单词/分享/论道台/战绩卡弹窗卡片须纯白背景'],
  ['.tutorial-card', '#ffffff', '修行指北卡片须纯白背景'],
  ['.em-card', '#ffffff', '秘境/奇遇卡片须纯白背景'],
  ['.ling-hall', '#221A3F', '词灵阁卡片须深色背景'],
];
for (const [sel, expect, name] of modalBgRules) {
  const re = new RegExp(sel.replace('.', '\\.') + '\\s*\\{[^}]*background:\\s*' + expect.replace('#', '#') + '\\b');
  if (re.test(html)) ok(true, name);
  else ok(false, name + `（期望 ${expect} 未匹配）`);
}
/* 遮罩层透明度检查：所有 overlay 遮罩 alpha ≥ .7 */
console.log('== 7. 遮罩层透明度检查 ==');
const overlayRules = [
  ['.word-modal-overlay', 'rgba(0,0,0,0.72)', '单词/分享/论道台/战绩卡遮罩'],
  ['.explore-modal, .mystery-modal', 'rgba(0,0,0,.75)', '词灵阁/秘境遮罩'],
  ['.tutorial-overlay', 'rgba(0,0,0,.78)', '修行指北遮罩'],
];
for (const [sel, expect, name] of overlayRules) {
  const esc = s => s.replace(/[.()]/g, ch => '\\' + ch);
  const sels = sel.split(',').map(s => s.trim().replace('.', '\\.')).join('|');
  const re = new RegExp('(?:' + sels + ')\\s*\\{[^}]*background:\\s*' + esc(expect));
  if (re.test(html)) ok(true, name + ' 遮罩足够暗');
  else ok(false, name + ` 期望 ${expect} 未匹配`);
}

console.log(`\n===== 审计结果 v2: ${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
