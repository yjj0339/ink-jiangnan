// UI：建造面板 / 顶栏 / 检视 / 弹窗 / 提示 —— 全部中文，宣纸风
import * as C from './config.js';
import { fmt, fmtRate } from './util.js';
import { sfx } from './audio.js';
import * as Save from './save.js';

const $ = (sel) => document.querySelector(sel);

export const ui = {
  tool: { mode: 'view', defId: null },
  game: null, R: null,
  rateAvg: {}, lastSnap: null,
  selectedUid: 0,

  init(game, R) {
    this.game = game; this.R = R;
    this.buildPalette();
    this.bindTopbar();
    this.bindModalRoot();
    this.bindKeys();
    this.buildQuestCard();
    import('./game.js').then(({ bus }) => {
      bus.addEventListener('tick', () => this.onTick());
      bus.addEventListener('toast', (e) => this.toast(e.detail.msg, e.detail.type));
      bus.addEventListener('build', () => { this.refreshPaletteLocks(); });
      bus.addEventListener('tech', () => { this.refreshPaletteLocks(); if (this.modalName === 'tech') this.openModal('tech'); });
      bus.addEventListener('tierup', () => this.refreshInspector());
      bus.addEventListener('repair', () => this.refreshInspector());
    });
    this.onTick();
  },

  // ================= 建造面板 =================
  buildPalette() {
    const tabs = $('#palette-tabs'), cards = $('#palette-cards');
    tabs.innerHTML = '';
    C.CATS.forEach((cat, i) => {
      const b = document.createElement('button');
      b.className = 'ptab' + (i === 0 ? ' on' : '');
      b.textContent = cat;
      b.dataset.cat = cat;
      b.onclick = () => {
        tabs.querySelectorAll('.ptab').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        this.renderCards(cat);
      };
      tabs.appendChild(b);
    });
    this.renderCards(C.CATS[0]);
    // 拆除按钮
    const dz = document.createElement('button');
    dz.id = 'demolish-btn'; dz.className = 'ptab'; dz.textContent = '拆除'; dz.title = '拆除工具 (X)';
    dz.onclick = () => { this.setTool(this.tool.mode === 'demolish' ? 'view' : 'demolish'); };
    tabs.appendChild(dz);
  },

  renderCards(cat) {
    const cards = $('#palette-cards');
    cards.innerHTML = '';
    const g = this.game;
    for (const def of C.BUILDINGS) {
      if (def.cat !== cat) continue;
      const locked = def.tech && !g.techs.has(def.tech);
      const el = document.createElement('div');
      el.className = 'pcard' + (locked ? ' locked' : '') + (this.tool.defId === def.id ? ' sel' : '');
      const cost = Object.entries(def.cost).map(([k, v]) =>
        `<span class="cost ${k}">${k === 'silver' ? '银' : C.RES_META[k].char}${v}</span>`).join('');
      el.innerHTML = `<div class="pname">${def.name}</div><div class="pcost">${cost}</div>`;
      el.title = def.desc + (locked ? `（需研习「${C.TECHS.find(t => t.id === def.tech).name}」）` : '');
      el.onclick = () => {
        if (locked) { sfx.error(); this.toast(`需先研习「${C.TECHS.find(t => t.id === def.tech).name}」`, 'bad'); return; }
        this.setTool(this.tool.defId === def.id ? 'view' : 'place', def.id);
      };
      cards.appendChild(el);
    }
    if (!cards.children.length) cards.innerHTML = '<div class="pempty">此类暂无建筑</div>';
  },

  refreshPaletteLocks() { const on = $('#palette-tabs .ptab.on'); if (on) this.renderCards(on.dataset.cat); },

  setTool(mode, defId = null) {
    this.tool = { mode, defId };
    this.R.ghost = null;
    document.getElementById('app').classList.toggle('placing', mode !== 'view');
    $('#demolish-btn')?.classList.toggle('on', mode === 'demolish');
    document.querySelectorAll('.pcard').forEach(el => el.classList.remove('sel'));
    if (defId) {
      const cards = document.querySelectorAll('.pcard');
      for (const el of cards) if (el.title.startsWith(C.B[defId].name)) el.classList.add('sel');
    }
    if (mode !== 'view') sfx.select();
  },

  // ================= 顶栏 =================
  bindTopbar() {
    const spd = $('#speed-ctrl');
    spd.querySelectorAll('button').forEach(b => {
      b.onclick = () => { this.game.speed = Number(b.dataset.s); sfx.select(); this.syncSpeed(); };
    });
    $('#btn-tech').onclick = () => this.openModal('tech');
    $('#btn-quest').onclick = () => this.openModal('quest');
    $('#btn-stats').onclick = () => this.openModal('stats');
    $('#btn-save').onclick = () => this.openModal('save');
    $('#btn-help').onclick = () => this.openModal('help');
    $('#btn-sound').onclick = () => {
      sfx.enabled = !sfx.enabled;
      $('#btn-sound').classList.toggle('off', !sfx.enabled);
      if (sfx.enabled) sfx.select();
    };
    this.syncSpeed();
  },

  syncSpeed() {
    document.querySelectorAll('#speed-ctrl button').forEach(b =>
      b.classList.toggle('on', Number(b.dataset.s) === this.game.speed));
  },

  onTick() {
    const g = this.game;
    // 速率（近5日滑动）
    if (!this.lastSnap || g.day - this.lastSnap.day >= 5) {
      if (this.lastSnap) {
        const dt = g.day - this.lastSnap.day;
        const calc = (cur, prev) => (cur - prev) / dt;
        this.rateAvg.silver = calc(g.silver, this.lastSnap.silver);
        for (const k of C.RES_ORDER) this.rateAvg[k] = calc(g.res[k], this.lastSnap.res[k]);
        this.rateAvg.pop = calc(g.pop, this.lastSnap.pop);
      }
      this.lastSnap = { day: g.day, silver: g.silver, res: { ...g.res }, pop: g.pop };
    }
    // 日期
    $('#date-chip').innerHTML = `<b>第${g.year}年</b> ${g.seasonName} · ${this.seasonIcon(g.season)}`;
    // 资源
    let html = `<div class="chip silver" title="白银（税赋与贸易所得）">银 <b>${fmt(g.silver)}</b><i>${fmtRate(this.rateAvg.silver)}</i></div>`;
    for (const k of C.RES_ORDER) {
      const m = C.RES_META[k];
      const cap = g.capOf(k);
      const full = g.res[k] >= cap - 0.5 ? ' full' : '';
      html += `<div class="chip${full}" style="--c:${m.color}" title="${m.name}：${m.desc}（存上限 ${cap}）">${m.char} <b>${fmt(g.res[k])}</b><i>${fmtRate(this.rateAvg[k])}</i></div>`;
    }
    const cap = g.housingCapacity();
    const hapCol = g.hap >= 60 ? '#5f7f4a' : g.hap >= 40 ? '#a8842e' : '#a8402e';
    html += `<div class="chip pop" title="人口 / 住宅容量 · 幸福">口 <b>${Math.floor(g.pop)}</b>/${cap}<span class="hap" style="background:${hapCol}">${Math.round(g.hap)}</span></div>`;
    html += `<div class="chip" title="研究点（书院产出）" style="--c:#3d5a66">研 <b>${Math.floor(g.rp)}</b></div>`;
    $('#res-chips').innerHTML = html;
    // 任务卡
    this.updateQuestCard();
    // 刷新检视（劳动效率实时变）
    if (this.selectedUid && g.day % 3 === 0) this.refreshInspector(true);
  },

  seasonIcon(s) { return ['草木蔓发', '万物并秀', '五谷飘香', '岁暮天寒'][s]; },

  // ================= 任务卡 =================
  buildQuestCard() {
    $('#quest-card').onclick = () => this.openModal('quest');
  },
  updateQuestCard() {
    const g = this.game;
    const q = C.QUESTS[g.quests.idx];
    const el = $('#quest-card');
    if (!q) { el.innerHTML = `<div class="qtitle">✦ 江南名镇已建成</div><div class="qdesc">自由营造，颐养天年</div>`; return; }
    el.innerHTML = `<div class="qtitle">任务 · ${q.name}</div><div class="qdesc">${q.desc} <span class="qrew">${q.rewardText}</span>${this.questProgress(q)}</div>`;
  },
  questProgress(q) {
    const g = this.game;
    const P = {
      q1: [g.roadCount(), 8], q2: [g.count('hut'), 3], q3: [g.count('farm'), 2],
      q4: [g.count('granary') >= 1 ? Math.min(150, Math.round(g.res.food)) : 0, 150],
      q5: [g.count('well'), 1], q6: [Math.floor(g.pop), 30], q7: [g.count('market'), 1],
      q8: [g.count('carpenter') >= 1 ? Math.min(10, Math.round(g.res.tools)) : 0, 10],
      q9: [g.count('academy'), 1], q11: [Math.floor(Math.min(g.pop, 80)), 80],
      q12: [Math.min(Math.round(g.stats.traded), 300), 300],
      q13: [Math.floor(Math.min(g.pop, 150)), 150],
    };
    const p = P[q.id];
    return p ? ` <b class="qnum">${p[0]}/${p[1]}</b>` : '';
  },

  // ================= 检视面板 =================
  select(uid) {
    this.selectedUid = uid;
    this.R.selectedUid = uid;
    this.refreshInspector();
    if (uid) sfx.select();
  },
  refreshInspector(light = false) {
    const g = this.game;
    const el = $('#inspector');
    const b = g.buildings.find(o => o.uid === this.selectedUid);
    if (!b) { el.classList.add('hidden'); this.selectedUid = 0; this.R.selectedUid = 0; return; }
    el.classList.remove('hidden');
    if (light && el.dataset.bid === String(b.uid) && !el.dataset.dirty) {
      // 轻刷新只更新状态行
      const st = el.querySelector('.istatus'); if (st) st.innerHTML = this.bStatus(b);
      return;
    }
    el.dataset.bid = b.uid; el.dataset.dirty = '';
    const def = b.def;
    let body = `<div class="ititle">${def.name}</div>
      <div class="istatus">${this.bStatus(b)}</div>
      <div class="idesc">${def.desc}</div>`;
    if (def.workers > 0) {
      body += `<div class="irow">用工 <b>${def.workers}</b> 人 · 当前效率 <b>${Math.round(b.eff * 100)}%</b>（全镇劳力 ${g.pool}/${g.jobs} 岗）</div>`;
    }
    if (def.prod) {
      const parts = [];
      for (const k in def.prod) parts.push(`${C.RES_META[k].name} +${(def.prod[k] * b.eff).toFixed(1)}/日`);
      if (parts.length) body += `<div class="irow">产出：${parts.join('　')}</div>`;
    }
    if (def.inp) {
      const parts = [];
      for (const k in def.inp) parts.push(`${C.RES_META[k].name} −${(def.inp[k] * b.eff).toFixed(1)}/日`);
      body += `<div class="irow">耗用：${parts.join('　')}</div>`;
    }
    if (def.storage) {
      body += `<div class="irow">${def.storage.food ? `存粮上限 +${def.storage.food}` : `各类物资上限 +${def.storage.each}`}</div>`;
    }
    if (def.trade) {
      body += this.tradeUI(b);
    }
    if (defId(b) === 'academy') {
      const t = C.TECHS.find(t => t.id === g.researching);
      body += `<div class="irow">${t ? `在研「${t.name}」${Math.round(g.techProgress)}/${t.cost}` : '待选课题（打开科技树）'}</div>`;
    }
    // 操作区
    let ops = '';
    if (b.defId === 'hut' && !b.damaged) {
      const chk = g.canUpgradeHouse(b);
      const next = C.HOUSE_TIERS[b.tier + 1];
      if (next) {
        const cost = Object.entries(next.upCost).map(([k, v]) => `${k === 'silver' ? '银' : C.RES_META[k].char}${v}`).join(' ');
        ops += `<button id="i-upgrade" ${chk.ok ? '' : 'disabled'}>升为${next.name}（${cost}）</button>`;
        if (!chk.ok && chk.reason) ops += `<div class="iwarn">${chk.reason}</div>`;
      } else {
        ops += `<div class="irow">已是最高规格（楼阁）</div>`;
      }
    }
    if (b.damaged) ops += `<button id="i-repair">修缮（银${g.repairCost(b)}）</button>`;
    ops += `<button id="i-demolish" class="danger">拆除（返还银${Math.floor((def.cost.silver || 0) * 0.3)}）</button>`;
    body += `<div class="iops">${ops}</div>`;
    el.innerHTML = body;
    $('#i-demolish').onclick = () => { g.demolish(b.x, b.y); sfx.demolish(); this.select(0); };
    const up = $('#i-upgrade'); if (up) up.onclick = () => { if (g.upgradeHouse(b)) { sfx.coin(); this.refreshInspector(); } else sfx.error(); };
    const rp = $('#i-repair'); if (rp) rp.onclick = () => { g.repair(b); sfx.build(); };
    this.bindTradeUI(b);
  },
  bStatus(b) {
    const g = this.game;
    if (b.damaged) return `<span class="st st-bad">已损毁</span> 需修缮后恢复`;
    if (!g.hasRoadAccess(b)) return `<span class="st st-warn">未临路</span> 请在旁铺设道路`;
    if (b.def.workers > 0 && b.eff <= 0) return `<span class="st st-warn">人手不足</span> 人口增长后恢复`;
    if (b.def.workers > 0 && b.eff < 0.99) return `<span class="st st-warn">劳力紧缺</span> 效率 ${Math.round(b.eff * 100)}%`;
    return `<span class="st st-ok">运作中</span>`;
  },
  tradeUI(b) {
    const dock = !!b.def.trade.dock;
    let rows = `<div class="irow">吞吐 ${b.def.trade.throughput}/日·项${dock ? ' · 船运价优' : ''}</div><div class="trade-rows">`;
    for (const k of C.RES_ORDER) {
      const m = C.RES_META[k];
      rows += `<div class="trow" data-k="${k}">
        <span class="tchar" style="color:${m.color}">${m.char}</span>
        <span class="tname">${m.name}</span>
        <span class="tprice">卖${(m.price * (dock ? 1.1 : 1)).toFixed(1)} / 买${(m.price * (dock ? C.DOCK_BUY_MULT : C.BUY_MULT)).toFixed(1)}</span>
        <button data-act="sell">售20</button><button data-act="buy">购20</button>
      </div>`;
    }
    return rows + '</div>';
  },
  bindTradeUI(b) {
    const el = $('#inspector');
    el.querySelectorAll('.trow button').forEach(btn => {
      btn.onclick = () => {
        const g = this.game, k = btn.parentElement.dataset.k, m = C.RES_META[k];
        const dock = !!b.def.trade.dock;
        if (btn.dataset.act === 'sell') {
          const n = Math.min(20, Math.floor(g.res[k]));
          if (n <= 0) { sfx.error(); return; }
          g.res[k] -= n; const gain = n * m.price * (dock ? 1.1 : 1);
          g.silver += gain; g.stats.traded += gain; sfx.coin();
        } else {
          const price = m.price * (dock ? C.DOCK_BUY_MULT : C.BUY_MULT);
          const n = Math.min(20, Math.floor(g.silver / price), Math.floor(g.capOf(k) - g.res[k]));
          if (n <= 0) { sfx.error(); return; }
          g.silver -= n * price; g.res[k] += n; sfx.coin();
        }
        this.refreshInspector();
      };
    });
  },

  // ================= 弹窗 =================
  bindModalRoot() {
    $('#modal-root').addEventListener('click', (e) => {
      if (e.target.id === 'modal-root') this.closeModal();
    });
  },
  closeModal() {
    $('#modal-root').classList.add('hidden');
    this.modalName = null;
  },
  openModal(name) {
    this.modalName = name;
    const root = $('#modal-root');
    const card = $('#modal-card');
    root.classList.remove('hidden');
    sfx.select();
    if (name === 'tech') this.renderTech(card);
    else if (name === 'quest') this.renderQuest(card);
    else if (name === 'stats') this.renderStats(card);
    else if (name === 'save') this.renderSave(card);
    else if (name === 'help') this.renderHelp(card);
  },
  modalShell(card, title, inner) {
    card.innerHTML = `<div class="mhead"><h2>${title}</h2><button class="mclose">×</button></div><div class="mbody">${inner}</div>`;
    card.querySelector('.mclose').onclick = () => this.closeModal();
  },

  renderTech(card) {
    const g = this.game;
    let rows = '';
    for (const t of C.TECHS) {
      const done = g.techs.has(t.id);
      const cur = g.researching === t.id;
      const locked = t.req.some(r => !g.techs.has(r));
      const state = done ? '<span class="tst done">已研成</span>'
        : cur ? `<span class="tst doing">研究中 ${Math.round(g.techProgress)}/${t.cost}</span>`
          : locked ? '<span class="tst lock">前置未研</span>'
            : `<span class="tst">需研究点 ${t.cost}</span>`;
      rows += `<div class="tech ${done ? 'done' : ''} ${cur ? 'cur' : ''} ${locked ? 'lock' : ''}" data-id="${t.id}">
        <div class="tname">${t.name}</div><div class="tdesc">${t.desc}</div><div class="tstate">${state}</div></div>`;
    }
    this.modalShell(card, `科技 · 研究点 ${Math.floor(g.rp)}`,
      `<div class="techgrid">${rows}</div>
       <div class="mhint">书院产出研究点；供纸可大幅加速。点击课题开始研习。</div>`);
    card.querySelectorAll('.tech').forEach(el => {
      el.onclick = () => {
        const t = C.TECHS.find(t => t.id === el.dataset.id);
        if (g.techs.has(t.id) || t.req.some(r => !g.techs.has(r))) { sfx.error(); return; }
        g.researching = t.id;
        if (g.techProgress > t.cost) g.techProgress = 0;
        this.openModal('tech');
      };
    });
  },

  renderQuest(card) {
    const g = this.game;
    let qh = '';
    C.QUESTS.forEach((q, i) => {
      if (i > g.quests.idx + 2) return;
      const done = i < g.quests.idx, cur = i === g.quests.idx;
      qh += `<div class="qitem ${done ? 'done' : ''} ${cur ? 'cur' : ''}">
        <div class="qname">${done ? '✓' : cur ? '◆' : '◇'} ${q.name}</div>
        <div class="qdesc">${q.desc} · ${q.rewardText}${cur ? this.questProgress(q) : ''}</div></div>`;
    });
    let ah = '';
    for (const a of C.ACHIEVEMENTS) {
      const got = g.achvs.has(a.id);
      ah += `<div class="achv ${got ? 'got' : ''}"><div class="aname">${got ? '印' : '○'} ${a.name}</div><div class="adesc">${a.desc}</div></div>`;
    }
    this.modalShell(card, '功名簿',
      `<div class="twocol"><div><h3>营造任务</h3>${qh}</div><div><h3>成就 ${g.achvs.size}/${C.ACHIEVEMENTS.length}</h3>${ah}</div></div>`);
  },

  renderStats(card) {
    const g = this.game;
    this.modalShell(card, `镇志 · 第${g.year}年${g.seasonName}`,
      `<canvas id="stat-chart" width="640" height="200"></canvas>
       <div class="legend"><span style="--c:#4a5a6e">人口</span><span style="--c:#7a8b3c">存粮</span><span style="--c:#a8842e">幸福</span><span style="--c:#96402e">白银</span></div>
       <h3>大事记</h3>
       <div class="loglist">${g.log.slice(0, 14).map(l => `<div class="logitem"><span>第${l.year}年${l.season}</span>${l.msg}</div>`).join('') || '<div class="logitem">尚无大事</div>'}</div>
       <div class="irow" style="margin-top:10px">累计落成 ${g.stats.built} · 拆除 ${g.stats.demolished} · 贸易额 ${Math.round(g.stats.traded)} 银 · 火灾 ${g.stats.fires} 次 · 事件 ${g.stats.events.length} 起</div>`);
    this.drawChart($('#stat-chart'));
  },
  drawChart(cv) {
    const g = this.game;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.fillStyle = '#faf6ea'; ctx.fillRect(0, 0, W, H);
    const hist = g.history;
    if (hist.length < 2) return;
    const series = [
      { key: 'pop', col: '#4a5a6e', min: 0 },
      { key: 'food', col: '#7a8b3c', min: 0 },
      { key: 'hap', col: '#a8842e', min: 0, max: 100 },
      { key: 'silver', col: '#96402e', min: 0 },
    ];
    ctx.strokeStyle = 'rgba(90,85,70,0.25)'; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, H * i / 4); ctx.lineTo(W, H * i / 4); ctx.stroke(); }
    for (const s of series) {
      let max = s.max;
      if (!max) for (const h of hist) max = Math.max(max, h[s.key]);
      max = Math.max(max, 1);
      ctx.strokeStyle = s.col; ctx.lineWidth = 1.8; ctx.beginPath();
      hist.forEach((h, i) => {
        const x = (i / (hist.length - 1)) * W;
        const y = H - (h[s.key] - s.min) / (max - s.min) * (H - 8) - 4;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
    }
  },

  renderSave(card) {
    let slots = '';
    for (const s of [1, 2, 3]) {
      const info = Save.slotInfo(s);
      slots += `<div class="slot"><div class="slotname">存档 ${s}</div>
        <div class="slotinfo">${info ? `第${info.year}年 · 人口${info.pop} · 银${info.silver}` : '空'}</div>
        <div class="slotops"><button data-a="save" data-s="${s}">存入</button>
        <button data-a="load" data-s="${s}" ${info ? '' : 'disabled'}>读取</button>
        <button data-a="del" data-s="${s}" ${info ? '' : 'disabled'}>删除</button></div></div>`;
    }
    this.modalShell(card, '存档',
      `<div class="slots">${slots}</div>
       <div class="mhint">每年岁末与页面隐藏时自动存入「自动」档。</div>
       <div class="slotops" style="margin-top:10px">
         <button id="s-export">导出存档文件</button>
         <button id="s-import">导入存档文件</button>
         <input type="file" id="s-file" accept=".json" style="display:none">
       </div>`);
    card.querySelectorAll('.slot button').forEach(b => {
      b.onclick = async () => {
        const g = this.game, s = b.dataset.s, a = b.dataset.a;
        if (a === 'save') { Save.saveGame(g, s); sfx.coin(); this.toast(`已存入存档 ${s}`, 'good'); this.openModal('save'); }
        else if (a === 'load') {
          const d = Save.loadSlot(s);
          if (d) { this.closeModal(); window.__startFromSave(d); }
        } else { Save.deleteSlot(s); this.openModal('save'); }
      };
    });
    $('#s-export').onclick = () => { Save.exportFile(this.game); sfx.coin(); };
    $('#s-import').onclick = () => $('#s-file').click();
    $('#s-file').onchange = async (e) => {
      if (!e.target.files[0]) return;
      try {
        const d = await Save.importFile(e.target.files[0]);
        this.closeModal(); window.__startFromSave(d);
      } catch { this.toast('存档文件无法读取', 'bad'); }
    };
  },

  renderHelp(card) {
    this.modalShell(card, '营造指南', `
      <div class="help">
      <p><b>目标</b>：在山水之间营造一座欣欣向荣的江南小镇。人口、幸福、白银、风雅，皆可追求。</p>
      <p><b>起手</b>：先铺<b>道路</b>，再建<b>草屋</b>安置乡民；在沃土上开<b>农田</b>， 林边设<b>伐木场</b>。绝大多数建筑需临路才能运作。</p>
      <p><b>温饱</b>：粮食是根本——农田春种秋收、冬季休耕，记得建<b>粮仓</b>扩仓储。人口不足时建筑会「缺人」怠工。</p>
      <p><b>百业</b>：伐木取材、采石采矿；<b>木匠坊</b>锻造工具供民宅升级；研习科技后可开<b>纸坊</b><b>瓷窑</b>，纸供书院加速研究，瓷是高价值商品。</p>
      <p><b>生财</b>：人口纳税，集市增税；<b>商行</b>自动贩售盈余、可手动交易，临水建<b>码头</b>利市三倍。</p>
      <p><b>安居</b>：幸福源于温饱、茶馆戏台之乐、庙宇医馆之安。税率宜轻。民宅在集市辐射内可逐级升为瓦房、楼阁。</p>
      <p><b>天灾</b>：水井防火，望楼防贼，医馆防疫。留意右上提示，未雨绸缪。</p>
      <p><b>操作</b>：拖动平移 · 滚轮/双指缩放 · 空格暂停 · 1/2/3 变速 · X 拆除 · Esc 取消。手机上点按建造，底部面板可横滑。</p>
      </div>`);
  },

  // ================= 提示 =================
  toast(msg, type = 'info') {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 500); }, 3600);
  },

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'Escape') { this.setTool('view'); this.select(0); this.closeModal(); }
      if (e.key === ' ') { e.preventDefault(); this.game.speed = this.game.speed === 0 ? 1 : 0; this.syncSpeed(); }
      if (e.key === '1' || e.key === '2' || e.key === '3') { this.game.speed = Number(e.key); this.syncSpeed(); }
      if (e.key === 'x' || e.key === 'X') this.setTool(this.tool.mode === 'demolish' ? 'view' : 'demolish');
      if (e.key === 'g' || e.key === 'G') this.R.showGrid = !this.R.showGrid;
    });
  },
};

function defId(b) { return b.defId; }
