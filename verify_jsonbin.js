/* 仙途十二阶 JSONBin 云同步测试（V6.5：binId 接管 + 完整 ID 显示） */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const vocabPath = path.join(__dirname, 'vocab.js');
const vocabJs = fs.readFileSync(vocabPath, 'utf8');
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
    /* mock JSONBin API：POST 创建 bin，GET latest 读，PUT 写 */
    window.__bins = {};
    window.__binSeq = 0;
    window.fetch = function (url, opt) {
      const m = String(url);
      const method = (opt && opt.method) || 'GET';
      if (method === 'POST') {
        window.__binSeq++;
        const id = 'bin' + window.__binSeq + '0000000000';
        window.__bins[id] = JSON.parse(opt.body);
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ metadata: { id } }) });
      }
      const gm = /\/b\/([^/]+)\/latest$/.exec(m);
      if (method === 'GET' && gm) {
        const id = gm[1];
        if (window.__bins[id]) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ record: window.__bins[id], metadata: { id } }) });
        }
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
      }
      const pm = /\/b\/([^/]+)$/.exec(m);
      if (method === 'PUT' && pm) {
        window.__bins[pm[1]] = JSON.parse(opt.body);
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    };
    window.confirm = () => true;
    window.scrollTo = () => {};
  }
});

const { window } = dom;
const { document } = window;
const $ = id => document.getElementById(id);

/* 等主脚本 IIFE 初始化完成 */
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async function main() {
  await wait(300);

  ok(typeof window.cloudConnect === 'function', 'cloudConnect 为全局函数');
  ok(typeof window.cloudPush === 'function', 'cloudPush 为全局函数');
  ok(typeof window.cloudPull === 'function', 'cloudPull 为全局函数');

  /* 1. 未配置时状态提示 */
  let statusEl = $('cloud-status');
  ok(statusEl && /未连接/.test(statusEl.textContent), '初始状态显示未连接');

  /* 2. 首次连接：填 Key 不填 binId → 自动创建 bin */
  const keyEl = $('cloud-key');
  const binEl = $('cloud-bin');
  keyEl.value = 'TEST_MASTER_KEY';
  binEl.value = '';
  await window.cloudConnect();
  let cfg = JSON.parse(window.localStorage.getItem('xt12_cloud') || '{}');
  ok(!!cfg.binId, '首次连接自动创建 bin 并保存 binId');
  ok(/^bin1\d+$/.test(cfg.binId), 'binId 为 mock 生成格式');
  statusEl = $('cloud-status');
  ok(/已连接/.test(statusEl.textContent), '连接后状态显示已连接');
  ok(statusEl.textContent.indexOf(cfg.binId) !== -1, '状态显示完整存档 ID（不再截断）');
  ok(binEl.value === cfg.binId, 'binId 回填到输入框（方便换设备抄录）');

  /* 3. 模拟旧设备已有进度：本地 state → 手动上传到云端 */
  const cloudState = JSON.stringify({ learned: ['abandon', 'abdomen'], mastered: ['ability'], collectedCards: [1, 2, 3], madeChoices: { c1: 'a' }, choiceTrial: {}, reviewSchedule: {}, sfxOn: true });
  window.localStorage.setItem('xt12_state_v2', cloudState);
  await window.cloudPush(true);
  const stored = window.__bins[cfg.binId];
  ok(stored && stored.state === cloudState, '手动上传后云端内容正确');

  /* 4. 换设备接管：新 localStorage + 填 binId → 拉到旧档 */
  window.localStorage._store = {}; /* 清空模拟换设备 */
  window.localStorage.setItem('xt12_cloud', JSON.stringify({ apiKey: 'TEST_MASTER_KEY' }));
  keyEl.value = 'TEST_MASTER_KEY';
  binEl.value = cfg.binId;
  await window.cloudConnect();
  const restored = window.localStorage.getItem('xt12_state_v2');
  ok(restored === cloudState, '换设备填 binId 接管成功，本地进度恢复');
  ok(window.wordStatus && window.wordStatus('abandon') === 'learning', '接管后 abandon 处于学习状态');
  ok(window.wordStatus && window.wordStatus('ability') === 'mastered', '接管后 ability 已掌握');
  cfg = JSON.parse(window.localStorage.getItem('xt12_cloud') || '{}');
  ok(cfg.binId === cfg.binId && !!cfg.lastSync, '接管后配置保存 lastSync');

  /* 5. 填不存在的 binId → 提示错误且不崩 */
  window.localStorage._store = {};
  keyEl.value = 'TEST_MASTER_KEY';
  binEl.value = 'bogusbin0000000000';
  await window.cloudConnect();
  const errCfg = JSON.parse(window.localStorage.getItem('xt12_cloud') || '{}');
  ok(errCfg.binId === 'bogusbin0000000000', '无效 binId 也保存（可让用户改）');
  ok(!window.localStorage.getItem('xt12_state_v2') || !/接管/.test(String(window.localStorage.getItem('xt12_state_v2'))), '无效 binId 未覆盖本地进度');

  /* 6. 手动拉取 */
  window.localStorage._store = {};
  window.localStorage.setItem('xt12_cloud', JSON.stringify({ apiKey: 'TEST_MASTER_KEY', binId: cfg.binId }));
  await window.cloudPull(true);
  ok(window.localStorage.getItem('xt12_state_v2') === cloudState, '手动拉取恢复云端进度');

  /* 7. scheduleCloudPush 存在且已配置时不报错 */
  ok(typeof window.scheduleCloudPush === 'function', 'scheduleCloudPush 为全局函数');

  console.log('\n=== 结果: ' + pass + ' 通过, ' + fail + ' 失败 ===');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试崩溃: ' + e.stack); process.exit(2); });
