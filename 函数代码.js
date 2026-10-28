// 页面逻辑与选号函数；初始数据位于“历史期数.js”。
// 100 Authentic Official Chinese Super Lotto Draws (26122 down to 26023)
    

    // Global App State
    let currentDraws = [];
    let currentSelection = null;
    let fiveBatchList = [];
    let currentPage = 1;
    const pageSize = 12;

    // 所有默认值与原选号条件一致；回测可传入覆盖参数，不改日常选号。
    const DEFAULT_RULES = Object.freeze({
      useZone: true, useParity: true, usePrimes: true,
      useSum: true, sumMin: 75, sumMax: 105,
      useSpan: true, spanMin: 20, spanMax: 31, rejectTripleConsecutive: true,
      useAc: true, acMin: 4, acMax: 6,
      useTail: true, rejectTripleTail: true,
      useAntiCollide: true, largeNumberMin: 30,
      useHotCold: true, hotMin: 1, hotMax: 3, warmMin: 1, warmMax: 3, coldMax: 2,
      useMarkov: true, inheritedMin: 1, inheritedMax: 3, repeatMax: 2,
      useBackParity: true, useBackSpan: true, backSpanMin: 3, backSpanMax: 7,
      excludeLatestBack: true, distinctBatchBack: true, maxFrontOverlap: 2,
      maxAttempts: 8000
    });

    function resolveRules(overrides = {}) {
      const rules = { ...DEFAULT_RULES, ...overrides };
      for (const key of Object.keys(rules)) {
        if (!(key in DEFAULT_RULES)) throw new Error('未知规则参数：' + key);
        if (typeof DEFAULT_RULES[key] === 'boolean') {
          if (typeof rules[key] !== 'boolean') throw new Error(key + ' 必须是布尔值');
        } else if (!Number.isInteger(rules[key]) || rules[key] < 0) {
          throw new Error(key + ' 必须是非负整数');
        }
      }
      for (const prefix of ['sum', 'span', 'ac', 'hot', 'warm', 'inherited', 'backSpan']) {
        if (rules[prefix + 'Min'] > rules[prefix + 'Max']) throw new Error(prefix + ' 最小值不能大于最大值');
      }
      if (rules.maxAttempts < 1 || rules.maxAttempts > 100000) throw new Error('maxAttempts 须在 1—100000 之间');
      return rules;
    }

    // Primes set in 1-35
    const PRIMES = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31]);

    // Calculate AC Value (Arithmetic Complexity) for 5 sorted numbers
    function calcAC(front) {
      const diffs = new Set();
      for (let i = 0; i < front.length; i++) {
        for (let j = i + 1; j < front.length; j++) {
          diffs.add(Math.abs(front[j] - front[i]));
        }
      }
      return diffs.size - (front.length - 1);
    }

    // Analyze currentDraws to classify Hot, Warm, Cold numbers and Markov sets
    function buildHistoricalProfile(draws = currentDraws) {
      const countsF = Array(36).fill(0);
      const lastSeenF = Array(36).fill(-1);
      const countsB = Array(13).fill(0);

      draws.forEach((draw, drawIdx) => {
        draw.front.forEach(n => {
          countsF[n]++;
          if (lastSeenF[n] === -1) lastSeenF[n] = drawIdx;
        });
        draw.back.forEach(n => {
          countsB[n]++;
        });
      });

      // Rank front numbers by frequency in current window
      const ranked = [];
      for (let i = 1; i <= 35; i++) {
        ranked.push({
          num: i,
          count: countsF[i],
          missed: lastSeenF[i] === -1 ? draws.length : lastSeenF[i]
        });
      }
      ranked.sort((a, b) => b.count - a.count || a.missed - b.missed);

      // Top 12 = Hot, Middle 13 = Warm, Bottom 10 = Cold
      const hotSet = new Set(ranked.slice(0, 12).map(x => x.num));
      const warmSet = new Set(ranked.slice(12, 25).map(x => x.num));
      const coldSet = new Set(ranked.slice(25).map(x => x.num));

      const latestDraw = draws[0] || null;
      const latestFront = latestDraw ? new Set(latestDraw.front) : new Set();
      const latestNeighbors = new Set();
      if (latestDraw) {
        latestDraw.front.forEach(n => {
          if (n > 1 && !latestFront.has(n - 1)) latestNeighbors.add(n - 1);
          if (n < 35 && !latestFront.has(n + 1)) latestNeighbors.add(n + 1);
        });
      }

      return {
        countsF,
        lastSeenF,
        countsB,
        ranked,
        hotSet,
        warmSet,
        coldSet,
        latestDraw,
        latestFront,
        latestNeighbors
      };
    }

    // Toast utility
    function showToast(message, type = 'success') {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.className = `px-4 py-2.5 rounded-xl shadow-xl text-xs font-medium text-white flex items-center gap-2 transform transition-all duration-300 pointer-events-auto ${
        type === 'success' ? 'bg-emerald-600 border border-emerald-500' :
        type === 'error' ? 'bg-rose-600 border border-rose-500' : 'bg-indigo-600 border border-indigo-500'
      }`;
      toast.innerHTML = `
        <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>${message}</span>
      `;
      container.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    }

    // LocalStorage helper (using v3 key to load authentic 100 draws cleanly)
    function loadDraws() {
      try {
        const stored = localStorage.getItem('dlt_draws_v3_real100');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (e) {
        console.warn('LocalStorage read error:', e);
      }
      return JSON.parse(JSON.stringify(DEFAULT_DRAWS));
    }

    function saveDraws(data) {
      currentDraws = data;
      try {
        localStorage.setItem('dlt_draws_v3_real100', JSON.stringify(data));
      } catch (e) {
        console.warn('LocalStorage save error:', e);
      }
      updateUI();
    }

    // Core 6-Dimension + Historical Markov/Hot-Cold Filtering Algorithm
    function generateOptimalDraw(existingDrawsToDiversify = [], settings = {}) {
      const profile = settings.profile || buildHistoricalProfile(settings.history || currentDraws);
      const opts = resolveRules(settings.rules || {});
      const rng = settings.rng || Math.random;
      const latestBackStr = profile.latestDraw ? profile.latestDraw.back.join(',') : '';

      let attempts = 0;
      const MAX_ATTEMPTS = opts.maxAttempts;

      while (attempts < MAX_ATTEMPTS) {
        attempts++;

        // 1. Sample Front Zone 5 balls from 1-35
        const front = [];
        const poolF = Array.from({length: 35}, (_, i) => i + 1);
        while (front.length < 5) {
          const idx = Math.floor(rng() * poolF.length);
          front.push(poolF.splice(idx, 1)[0]);
        }
        front.sort((a, b) => a - b);

        // Constraint 1: Zone Ratio (一区 1-12, 二区 13-24, 三区 25-35) -> 2:2:1, 2:1:2, 1:2:2
        const z1 = front.filter(x => x <= 12).length;
        const z2 = front.filter(x => x >= 13 && x <= 24).length;
        const z3 = front.filter(x => x >= 25).length;
        if (opts.useZone && (z1 === 0 || z2 === 0 || z3 === 0)) continue;
        if (opts.useZone && Math.max(z1, z2, z3) > 2) continue;

        // Constraint 2: Parity (Odd-Even: 2:3 or 3:2) & Prime Count (1~2)
        const oddCount = front.filter(x => x % 2 === 1).length;
        if (opts.useParity && oddCount !== 2 && oddCount !== 3) continue;
        const primeCount = front.filter(x => PRIMES.has(x)).length;
        if (opts.usePrimes && (primeCount < 1 || primeCount > 2)) continue;

        // Constraint 3: Sum Band [75, 105]
        const sum = front.reduce((acc, v) => acc + v, 0);
        if (opts.useSum && (sum < opts.sumMin || sum > opts.sumMax)) continue;

        // Constraint 4: Span [20, 31] & No 3 consecutive numbers
        const span = front[4] - front[0];
        if (opts.useSpan && (span < opts.spanMin || span > opts.spanMax)) continue;
        let has3Consec = false;
        for (let i = 0; i < 3; i++) {
          if (front[i+2] === front[i+1] + 1 && front[i+1] === front[i] + 1) {
            has3Consec = true;
            break;
          }
        }
        if (opts.rejectTripleConsecutive && has3Consec) continue;

        // Constraint 5: Same ending digit (Tail)
        const tails = front.map(x => x % 10);
        const tailCounts = {};
        tails.forEach(t => tailCounts[t] = (tailCounts[t] || 0) + 1);
        const pairs = Object.values(tailCounts).filter(c => c >= 2);
        if (opts.useTail) {
          if (pairs.length !== 1 || pairs[0] !== 2) continue;
        } else {
          if (opts.rejectTripleTail && pairs.some(c => c >= 3)) continue; // Still avoid 3 of same ending
        }

        // Constraint 6: AC Complexity (4~6, eliminates arithmetic progressions)
        const acVal = calcAC(front);
        if (opts.useAc && (acVal < opts.acMin || acVal > opts.acMax)) continue;

        // Constraint 7: Anti-collision high number (>= 30)
        if (opts.useAntiCollide && front[4] < opts.largeNumberMin) continue;

        // Constraint 8: 100-Draw Hot/Warm/Cold Dynamic Balance
        const hotCount = front.filter(x => profile.hotSet.has(x)).length;
        const warmCount = front.filter(x => profile.warmSet.has(x)).length;
        const coldCount = front.filter(x => profile.coldSet.has(x)).length;
        if (opts.useHotCold) {
          // Require 1~3 Hot, 1~3 Warm, and 0~2 Cold (prevents all-cold or all-hot extremes)
          if (hotCount < opts.hotMin || hotCount > opts.hotMax) continue;
          if (warmCount < opts.warmMin || warmCount > opts.warmMax) continue;
          if (coldCount > opts.coldMax) continue;
        }

        // Constraint 9: Latest Draw Markov Inheritance (Repeat & Neighbor numbers)
        const repeatNums = front.filter(x => profile.latestFront.has(x));
        const neighborNums = front.filter(x => profile.latestNeighbors.has(x));
        const markovTotal = repeatNums.length + neighborNums.length;
        if (opts.useMarkov && profile.latestDraw) {
          // Require 1~3 numbers inherited from last draw's repeat or neighbor pool, max 2 repeats
          if (markovTotal < opts.inheritedMin || markovTotal > opts.inheritedMax || repeatNums.length > opts.repeatMax) continue;
        }

        // 2. Sample Back Zone 2 balls from 1-12
        const poolB = Array.from({length: 12}, (_, i) => i + 1);
        const back = [];
        while (back.length < 2) {
          const idx = Math.floor(rng() * poolB.length);
          back.push(poolB.splice(idx, 1)[0]);
        }
        back.sort((a, b) => a - b);

        // Back Zone Constraints: 1 Odd + 1 Even, Span [3, 7], Not identical to last draw's back
        if (opts.useBackParity && (back[0] % 2) === (back[1] % 2)) continue;
        const bSpan = back[1] - back[0];
        if (opts.useBackSpan && (bSpan < opts.backSpanMin || bSpan > opts.backSpanMax)) continue;
        if (opts.excludeLatestBack && back.join(',') === latestBackStr) continue;

        // Orthogonal Diversification Check (when generating 5-batch)
        if (existingDrawsToDiversify.length > 0) {
          let tooSimilar = false;
          for (const prev of existingDrawsToDiversify) {
            // Never repeat identical back zone pair in a 5-batch
            if (opts.distinctBatchBack && prev.back[0] === back[0] && prev.back[1] === back[1]) {
              tooSimilar = true;
              break;
            }
            // Max 2 overlapping front numbers between any two sets in a 5-batch
            const overlapF = front.filter(x => prev.front.includes(x)).length;
            if (overlapF > opts.maxFrontOverlap) {
              tooSimilar = true;
              break;
            }
          }
          if (tooSimilar) continue;
        }

        const sameTailKey = Object.keys(tailCounts).find(k => tailCounts[k] === 2);
        const tailDesc = sameTailKey !== undefined ? `尾${sameTailKey}同尾 · 跨度${span}` : `不同尾 · 跨度${span}`;

        return {
          front,
          back,
          attempts,
          metrics: {
            zoneStr: `${z1} : ${z2} : ${z3}`,
            parityStr: `${oddCount}奇${5 - oddCount}偶 · ${primeCount}质数`,
            sum,
            sumRule: opts.useSum ? `∈ [${opts.sumMin}, ${opts.sumMax}]` : "不限制和值",
            span,
            acVal,
            tailStr: tailDesc,
            backStr: `${back.filter(n => n % 2).length}奇${back.filter(n => !(n % 2)).length}偶 · 跨度${bSpan}`,
            hotColdStr: `${hotCount}热${warmCount}温${coldCount}冷`,
            markovStr: `AC=${acVal} · ${hotCount}热${warmCount}温${coldCount}冷`,
            markovDetail: `重号${repeatNums.length}枚 / 邻号${neighborNums.length}枚`
          }
        };
      }

      // 在尝试次数用尽时明确报告失败，不返回固定号码。
      return null;
    }

    // Normalize and merge draws (Supports both single object and array, deduplicates by issue, sorts descending, caps at 100)
    function mergeAndNormalizeDraws(incoming, replaceAll = false) {
      let list = replaceAll ? [] : [...currentDraws];
      const items = Array.isArray(incoming) ? incoming : [incoming];

      const validItems = [];
      for (const raw of items) {
        if (!raw || typeof raw !== 'object') continue;
        const issue = String(raw.issue || '').trim();
        const date = String(raw.date || new Date().toISOString().split('T')[0]).trim();
        const front = Array.isArray(raw.front) ? raw.front.map(Number).filter(n => n >= 1 && n <= 35) : [];
        const back = Array.isArray(raw.back) ? raw.back.map(Number).filter(n => n >= 1 && n <= 12) : [];

        if (!issue || new Set(front).size !== 5 || new Set(back).size !== 2) {
          continue;
        }
        validItems.push({
          issue,
          date,
          front: [...front].sort((a, b) => a - b),
          back: [...back].sort((a, b) => a - b)
        });
      }

      if (validItems.length === 0) {
        return { ok: false, msg: '未检测到合法的期号与号码格式（需包含 issue、5个前区号、2个后区号）' };
      }

      const mapByIssue = new Map();
      list.forEach(d => mapByIssue.set(String(d.issue), d));
      validItems.forEach(d => mapByIssue.set(String(d.issue), d));

      const merged = Array.from(mapByIssue.values());
      merged.sort((a, b) => Number(b.issue) - Number(a.issue));

      const removedCount = Math.max(0, merged.length - 100);
      const finalDraws = merged.slice(0, 100);

      saveDraws(finalDraws);
      return {
        ok: true,
        addedCount: validItems.length,
        removedCount,
        latestIssue: finalDraws[0].issue,
        total: finalDraws.length
      };
    }

    // Update UI elements
    function updateUI() {
      const total = currentDraws.length;
      const latest = currentDraws[0] || { issue: "无", date: "-", front: [], back: [] };

      document.getElementById('header-sample-count').textContent = total;
      document.getElementById('header-latest-issue').textContent = `第 ${latest.issue} 期`;
      document.getElementById('label-active-window').textContent = total;
      const heroIssueTag = document.getElementById('hero-latest-issue-tag');
      if (heroIssueTag) heroIssueTag.textContent = latest.issue;
      document.querySelectorAll('.active-window-span').forEach(el => el.textContent = total);
      const trendIssueEl = document.getElementById('trend-latest-issue-num');
      if (trendIssueEl) trendIssueEl.textContent = latest.issue;

      const jsonArea = document.getElementById('raw-json-textarea');
      if (jsonArea) {
        jsonArea.value = JSON.stringify(currentDraws, null, 2);
      }

      renderTrends();
      renderHistoryTable();
    }

    // Render balls to DOM
    function renderSelectedDraw(draw) {
      currentSelection = draw;
      const container = document.getElementById('balls-display');
      container.innerHTML = '';
      const status = document.getElementById('gen-status-text');
      if (!draw) {
        container.textContent = '暂时没有找到符合条件的号码，请再试一次。';
        status.textContent = '本次尝试未生成结果。';
        ['metric-zone', 'metric-parity', 'metric-sum', 'metric-tail', 'metric-back', 'metric-markov', 'desc-markov'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.textContent = '—';
        });
        return;
      }
      status.innerHTML = '已生成号码（尝试 <strong id="iter-count" class="text-amber-400 font-mono-num"></strong> 次）';

      draw.front.forEach(n => {
        const b = document.createElement('div');
        b.className = 'ball-red w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-white font-extrabold text-xl sm:text-2xl font-mono-num transform transition-all duration-300 hover:scale-110 shadow-lg';
        b.textContent = String(n).padStart(2, '0');
        container.appendChild(b);
      });

      const plus = document.createElement('span');
      plus.className = 'text-slate-600 font-bold text-2xl mx-1 sm:mx-2';
      plus.textContent = '+';
      container.appendChild(plus);

      draw.back.forEach(n => {
        const b = document.createElement('div');
        b.className = 'ball-blue w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-white font-extrabold text-xl sm:text-2xl font-mono-num transform transition-all duration-300 hover:scale-110 shadow-lg';
        b.textContent = String(n).padStart(2, '0');
        container.appendChild(b);
      });

      document.getElementById('iter-count').textContent = draw.attempts;
      document.getElementById('metric-zone').textContent = draw.metrics.zoneStr;
      document.getElementById('metric-parity').textContent = draw.metrics.parityStr;
      document.getElementById('metric-sum').innerHTML = `${draw.metrics.sum} <span class="text-xs text-slate-400 font-normal">${draw.metrics.sumRule}</span>`;
      document.getElementById('metric-tail').textContent = draw.metrics.tailStr;
      document.getElementById('metric-back').textContent = draw.metrics.backStr;
      const mMarkov = document.getElementById('metric-markov');
      if (mMarkov) mMarkov.textContent = draw.metrics.markovStr;
      const dMarkov = document.getElementById('desc-markov');
      if (dMarkov) dMarkov.textContent = draw.metrics.markovDetail;
    }

    // Render Orthogonal Diversified Batch of 5
    function renderBatchFive() {
      const list = [];
      for (let i = 0; i < 5; i++) {
        const draw = generateOptimalDraw(list);
        if (!draw) break;
        list.push(draw);
      }
      fiveBatchList = list;

      // Calculate total unique front & back coverage across the 5 sets
      const uniqueF = new Set();
      const uniqueB = new Set();
      list.forEach(item => {
        item.front.forEach(n => uniqueF.add(n));
        item.back.forEach(n => uniqueB.add(n));
      });
      const covBadge = document.getElementById('batch-coverage-badge');
      if (covBadge) {
        covBadge.textContent = `${list.length}注总覆盖：前区 ${uniqueF.size} 码 / 后区 ${uniqueB.size} 码${list.length < 5 ? "（未能生成全部5注，请重试）" : ""}`;
      }

      const container = document.getElementById('five-rows-list');
      container.innerHTML = '';

      list.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-wrap items-center justify-between gap-3 hover:border-slate-700 transition-all';
        
        const left = document.createElement('div');
        left.className = 'flex items-center gap-2 sm:gap-3 flex-wrap';

        const badge = document.createElement('span');
        badge.className = 'w-6 h-6 rounded-full bg-slate-800 text-slate-300 font-bold text-xs flex items-center justify-center font-mono-num';
        badge.textContent = idx + 1;
        left.appendChild(badge);

        const ballsBox = document.createElement('div');
        ballsBox.className = 'flex items-center gap-1.5 font-mono-num';

        item.front.forEach(n => {
          const b = document.createElement('span');
          b.className = 'ball-mini-red w-7 h-7 rounded-full text-white font-bold text-xs flex items-center justify-center shadow-sm';
          b.textContent = String(n).padStart(2, '0');
          ballsBox.appendChild(b);
        });

        const sep = document.createElement('span');
        sep.className = 'text-slate-600 font-bold px-1';
        sep.textContent = '+';
        ballsBox.appendChild(sep);

        item.back.forEach(n => {
          const b = document.createElement('span');
          b.className = 'ball-mini-blue w-7 h-7 rounded-full text-white font-bold text-xs flex items-center justify-center shadow-sm';
          b.textContent = String(n).padStart(2, '0');
          ballsBox.appendChild(b);
        });
        left.appendChild(ballsBox);

        const right = document.createElement('div');
        right.className = 'flex items-center gap-2.5 text-xs text-slate-400 flex-wrap';
        right.innerHTML = `
          <span class="hidden sm:inline">和值:<strong class="text-slate-200 font-mono-num ml-0.5">${item.metrics.sum}</strong></span>
          <span class="hidden md:inline">AC:<strong class="text-amber-400 font-mono-num ml-0.5">${item.metrics.acVal}</strong></span>
          <span class="hidden lg:inline text-slate-400">${item.metrics.hotColdStr}</span>
          <span class="hidden xl:inline text-emerald-400/90">${item.metrics.markovDetail}</span>
          <button data-idx="${idx}" class="btn-copy-single-row text-rose-400 hover:text-rose-300 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:border-rose-500/40 transition-all">复制</button>
        `;

        row.appendChild(left);
        row.appendChild(right);
        container.appendChild(row);
      });

      if (list.length < 5) showToast(`只生成 ${list.length} 注，未能生成全部 5 注，请重试。`, 'error');

      document.querySelectorAll('.btn-copy-single-row').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(e.target.getAttribute('data-idx'));
          const target = fiveBatchList[idx];
          if (target) {
            const txt = `大乐透方案${idx+1}：前区 [${target.front.map(x => String(x).padStart(2, '0')).join(' ')}] + 后区 [${target.back.map(x => String(x).padStart(2, '0')).join(' ')}] (和值${target.metrics.sum} | AC=${target.metrics.acVal} | ${target.metrics.hotColdStr})`;
            copyTextToClipboard(txt, `已复制第 ${idx+1} 注方案`);
          }
        });
      });
    }

    // Render Trends & Frequencies
    function renderTrends() {
      const profile = buildHistoricalProfile();
      const { countsF, lastSeenF } = profile;

      const frontStats = [];
      for (let i = 1; i <= 35; i++) {
        frontStats.push({ num: i, count: countsF[i], missed: lastSeenF[i] === -1 ? currentDraws.length : lastSeenF[i] });
      }

      // Top 6 Hot
      const hotList = [...frontStats].sort((a, b) => b.count - a.count || a.missed - b.missed).slice(0, 6);
      const hotContainer = document.getElementById('top-hot-front');
      hotContainer.innerHTML = '';
      hotList.forEach(item => {
        const b = document.createElement('span');
        b.className = 'px-2 py-1 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-mono-num font-bold';
        b.textContent = `${String(item.num).padStart(2, '0')} (${item.count}次)`;
        hotContainer.appendChild(b);
      });

      // Top 6 Cold (Max missed)
      const coldList = [...frontStats].sort((a, b) => b.missed - a.missed || a.count - b.count).slice(0, 6);
      const coldContainer = document.getElementById('top-cold-front');
      coldContainer.innerHTML = '';
      coldList.forEach(item => {
        const b = document.createElement('span');
        b.className = 'px-2 py-1 bg-slate-800 text-slate-300 border border-slate-700 rounded-lg text-xs font-mono-num font-bold';
        b.textContent = `${String(item.num).padStart(2, '0')} (遗漏${item.missed}期)`;
        coldContainer.appendChild(b);
      });

      // Latest Anchor Balls
      const anchorContainer = document.getElementById('latest-anchor-balls');
      anchorContainer.innerHTML = '';
      if (currentDraws.length > 0) {
        const d = currentDraws[0];
        d.front.forEach(n => {
          const b = document.createElement('span');
          b.className = 'ball-mini-red w-6 h-6 rounded-full text-white text-[11px] font-bold flex items-center justify-center font-mono-num';
          b.textContent = String(n).padStart(2, '0');
          anchorContainer.appendChild(b);
        });
        const plus = document.createElement('span');
        plus.className = 'text-slate-600 font-bold px-0.5 text-xs';
        plus.textContent = '+';
        anchorContainer.appendChild(plus);
        d.back.forEach(n => {
          const b = document.createElement('span');
          b.className = 'ball-mini-blue w-6 h-6 rounded-full text-white text-[11px] font-bold flex items-center justify-center font-mono-num';
          b.textContent = String(n).padStart(2, '0');
          anchorContainer.appendChild(b);
        });
      }

      // Frequency Bars Visualizer
      const barsContainer = document.getElementById('freq-bars-container');
      barsContainer.innerHTML = '';
      const maxCount = Math.max(...countsF.slice(1), 1);

      for (let i = 1; i <= 35; i++) {
        const c = countsF[i];
        const heightPct = Math.max(12, Math.round((c / maxCount) * 100));
        
        let barColor = 'bg-slate-700 hover:bg-slate-600';
        if (profile.hotSet.has(i)) barColor = 'bg-rose-500 hover:bg-rose-400';
        else if (profile.warmSet.has(i)) barColor = 'bg-amber-500 hover:bg-amber-400';

        const col = document.createElement('div');
        col.className = 'flex-1 flex flex-col items-center gap-1 group relative h-full justify-end';
        col.innerHTML = `
          <div class="text-[9px] text-slate-400 font-mono-num group-hover:text-white">${c}</div>
          <div class="w-full ${barColor} rounded-t transition-all duration-300" style="height: ${heightPct}%;"></div>
          <div class="text-[10px] text-slate-300 font-mono-num font-bold group-hover:text-amber-400">${String(i).padStart(2, '0')}</div>
        `;
        barsContainer.appendChild(col);
      }
    }

    // Render History Table with Pagination
    function renderHistoryTable() {
      const query = (document.getElementById('search-issue-input').value || '').trim();
      const filtered = query 
        ? currentDraws.filter(d => d.issue.includes(query) || d.date.includes(query))
        : currentDraws;

      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      if (currentPage > totalPages) currentPage = totalPages;
      if (currentPage < 1) currentPage = 1;

      const start = (currentPage - 1) * pageSize;
      const slice = filtered.slice(start, start + pageSize);

      const tbody = document.getElementById('history-table-body');
      tbody.innerHTML = '';

      slice.forEach(d => {
        const sum = d.front.reduce((a, b) => a + b, 0);
        const oddCount = d.front.filter(x => x % 2 === 1).length;
        const ac = calcAC(d.front);

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-800/40 transition-colors';
        tr.innerHTML = `
          <td class="py-2.5 px-3 font-bold text-white">${d.issue}</td>
          <td class="py-2.5 px-3 text-slate-400">${d.date}</td>
          <td class="py-2.5 px-3">
            <div class="flex items-center gap-1">
              ${d.front.map(n => `<span class="ball-mini-red w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center">${String(n).padStart(2, '0')}</span>`).join('')}
            </div>
          </td>
          <td class="py-2.5 px-3">
            <div class="flex items-center gap-1">
              ${d.back.map(n => `<span class="ball-mini-blue w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center">${String(n).padStart(2, '0')}</span>`).join('')}
            </div>
          </td>
          <td class="py-2.5 px-3 text-right text-slate-300">${sum}</td>
          <td class="py-2.5 px-3 text-right text-slate-400">${oddCount}:${5 - oddCount}</td>
          <td class="py-2.5 px-3 text-right text-amber-400">${ac}</td>
        `;
        tbody.appendChild(tr);
      });

      document.getElementById('table-pagination-info').textContent = `显示 ${start + 1} 至 ${Math.min(start + pageSize, total)} 条，共 ${total} 条`;
      document.getElementById('btn-page-prev').disabled = currentPage <= 1;
      document.getElementById('btn-page-next').disabled = currentPage >= totalPages;
    }

    // Clipboard copy helper
    function copyTextToClipboard(text, successMsg = '已复制到剪贴板') {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          showToast(successMsg, 'success');
        }).catch(() => {
          fallbackCopy(text, successMsg);
        });
      } else {
        fallbackCopy(text, successMsg);
      }
    }

    function fallbackCopy(text, successMsg) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast(successMsg, 'success');
      } catch (err) {
        showToast('复制失败，请手动选择复制', 'error');
      }
    }

    // Event Listeners setup
    window.addEventListener('DOMContentLoaded', () => {
      currentDraws = loadDraws();

      const today = new Date().toISOString().split('T')[0];
      const dateInput = document.getElementById('input-date');
      if (dateInput) dateInput.value = today;

      const tabBtnGen = document.getElementById('tab-btn-generator');
      const tabBtnTrends = document.getElementById('tab-btn-trends');
      const tabBtnManager = document.getElementById('tab-btn-manager');

      const viewGen = document.getElementById('view-generator');
      const viewTrends = document.getElementById('view-trends');
      const viewManager = document.getElementById('view-manager');

      function switchTab(activeBtn, activeView) {
        [tabBtnGen, tabBtnTrends, tabBtnManager].forEach(b => {
          b.className = 'tab-btn px-4 py-2 rounded-lg text-sm font-medium transition-all text-slate-400 hover:text-white flex items-center gap-1.5';
        });
        activeBtn.className = 'tab-btn px-4 py-2 rounded-lg text-sm font-medium transition-all bg-rose-600 text-white shadow-sm flex items-center gap-1.5';

        [viewGen, viewTrends, viewManager].forEach(v => v.classList.add('hidden'));
        activeView.classList.remove('hidden');
      }

      tabBtnGen.addEventListener('click', () => switchTab(tabBtnGen, viewGen));
      tabBtnTrends.addEventListener('click', () => {
        switchTab(tabBtnTrends, viewTrends);
        renderTrends();
        renderHistoryTable();
      });
      tabBtnManager.addEventListener('click', () => switchTab(tabBtnManager, viewManager));

      // Generate single button
      document.getElementById('btn-generate-single').addEventListener('click', () => {
        const spin = document.getElementById('spin-icon');
        spin.classList.remove('hidden');
        setTimeout(() => {
          const res = generateOptimalDraw();
          renderSelectedDraw(res);
          spin.classList.add('hidden');
          if (res) showToast('已生成一注号码', 'success');
          else showToast('暂时没有找到符合条件的号码，请再试一次。', 'error');
        }, 100);
      });

      // Generate five batch
      document.getElementById('btn-generate-five').addEventListener('click', () => {
        renderBatchFive();
        if (fiveBatchList.length === 5) showToast('已生成 5 注号码', 'success');
      });

      // Copy current single result
      document.getElementById('btn-copy-result').addEventListener('click', () => {
        if (!currentSelection) return;
        const fStr = currentSelection.front.map(n => String(n).padStart(2, '0')).join(' ');
        const bStr = currentSelection.back.map(n => String(n).padStart(2, '0')).join(' ');
        const text = `超级大乐透推荐方案：\n前区：${fStr}\n后区：${bStr}\n和值：${currentSelection.metrics.sum} | 奇偶：${currentSelection.metrics.parityStr} | ${currentSelection.metrics.markovStr} | ${currentSelection.metrics.markovDetail}`;
        copyTextToClipboard(text, '已复制当前号码！');
      });

      // Copy all five
      document.getElementById('btn-copy-all-five').addEventListener('click', () => {
        if (!fiveBatchList || fiveBatchList.length === 0) return;
        const lines = fiveBatchList.map((item, i) => {
          const f = item.front.map(n => String(n).padStart(2, '0')).join(' ');
          const b = item.back.map(n => String(n).padStart(2, '0')).join(' ');
          return `第${i+1}注：前区 [${f}] + 后区 [${b}] (和值${item.metrics.sum} | AC=${item.metrics.acVal} | ${item.metrics.hotColdStr})`;
        });
        copyTextToClipboard(lines.join('\n'), '已复制全部 5 注正交分散方案到剪贴板！');
      });

      // Copy AI prompt template
      document.getElementById('btn-copy-prompt').addEventListener('click', () => {
        const pText = document.getElementById('ai-prompt-box').innerText;
        copyTextToClipboard(pText, '已复制 AI 接管提示词模版！');
      });

      // Export Raw JSON
      document.getElementById('btn-export-json').addEventListener('click', () => {
        const text = JSON.stringify(currentDraws, null, 2);
        copyTextToClipboard(text, '已复制当前 100 期完整 JSON！');
      });

      // Dual-mode Smart JSON Parser (supports single object `{...}` OR full/partial array `[...]`)
      document.getElementById('btn-save-raw-json').addEventListener('click', () => {
        const val = document.getElementById('raw-json-textarea').value.trim();
        try {
          const parsed = JSON.parse(val);
          const isFullReplace = Array.isArray(parsed) && parsed.length >= 50;
          const res = mergeAndNormalizeDraws(parsed, isFullReplace);
          if (res.ok) {
            const newDraw = generateOptimalDraw();
            renderSelectedDraw(newDraw);
            renderBatchFive();
            showToast(`同步成功！已合并 ${res.addedCount} 期数据，最新期号：第 ${res.latestIssue} 期，样本池保持 ${res.total} 期。`, 'success');
          } else {
            showToast(res.msg, 'error');
          }
        } catch (err) {
          showToast('JSON 语法解析失败，请检查括号或引号：' + err.message, 'error');
        }
      });

      // Reset to Default 100 Official Draws
      document.getElementById('btn-reset-default').addEventListener('click', () => {
        saveDraws(JSON.parse(JSON.stringify(DEFAULT_DRAWS)));
        const newDraw = generateOptimalDraw();
        renderSelectedDraw(newDraw);
        renderBatchFive();
        showToast('已重置为官方真实 100 期（26122~26023期）历史数据！', 'info');
      });

      // Form: Add New Issue (FIFO Sliding Window with Deduplication & Auto-Sort)
      document.getElementById('add-issue-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const issue = document.getElementById('input-issue').value.trim();
        const date = document.getElementById('input-date').value.trim();
        const frontRaw = document.getElementById('input-front').value.trim();
        const backRaw = document.getElementById('input-back').value.trim();

        const frontArr = frontRaw.split(/[,\s]+/).map(x => parseInt(x, 10)).filter(x => !isNaN(x) && x >= 1 && x <= 35);
        const frontSet = new Set(frontArr);
        if (frontArr.length !== 5 || frontSet.size !== 5) {
          showToast('前区必须是 5 个不重复的数字 (1-35)', 'error');
          return;
        }

        const backArr = backRaw.split(/[,\s]+/).map(x => parseInt(x, 10)).filter(x => !isNaN(x) && x >= 1 && x <= 12);
        const backSet = new Set(backArr);
        if (backArr.length !== 2 || backSet.size !== 2) {
          showToast('后区必须是 2 个不重复的数字 (1-12)', 'error');
          return;
        }

        const res = mergeAndNormalizeDraws({
          issue,
          date,
          front: frontArr,
          back: backArr
        }, false);

        if (res.ok) {
          document.getElementById('input-issue').value = '';
          document.getElementById('input-front').value = '';
          document.getElementById('input-back').value = '';
          const newDraw = generateOptimalDraw();
          renderSelectedDraw(newDraw);
          renderBatchFive();
          showToast(`🎉 成功写入第 ${issue} 期并淘汰最旧期！最新锚定：第 ${res.latestIssue} 期（共 ${res.total} 期）。`, 'success');
        }
      });

      // Table Search & Pagination
      document.getElementById('search-issue-input').addEventListener('input', () => {
        currentPage = 1;
        renderHistoryTable();
      });
      document.getElementById('btn-page-prev').addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          renderHistoryTable();
        }
      });
      document.getElementById('btn-page-next').addEventListener('click', () => {
        currentPage++;
        renderHistoryTable();
      });

      // Initial generation
      const initial = generateOptimalDraw();
      renderSelectedDraw(initial);
      renderBatchFive();
      updateUI();
    });

    // 独立回测入口：不写浏览器存储，不替换 currentDraws，不自动调参。
    function normalizeBacktestHistory(history) {
      if (!Array.isArray(history) || history.length < 101) throw new Error('回测至少需要101期，建议提供完整200期。');
      const seen = new Set();
      const normalized = history.map(d => {
        if (!d || typeof d !== 'object') throw new Error('每期必须是对象');
        const issue = String(d.issue || '');
        if (!/^\d{5}$/.test(issue) || seen.has(issue)) throw new Error('期号无效或重复：' + issue);
        seen.add(issue);
        const date = String(d.date || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw new Error('日期无效：' + issue);
        const balls = (xs, count, max) => {
          if (!Array.isArray(xs) || xs.length !== count || new Set(xs).size !== count || xs.some(n => !Number.isInteger(n) || n < 1 || n > max)) throw new Error('号码格式无效：' + issue);
          return [...xs].sort((a,b) => a-b);
        };
        return { issue, date, front: balls(d.front, 5, 35), back: balls(d.back, 2, 12) };
      }).sort((a,b) => Number(a.issue)-Number(b.issue));
      for (let i=1; i<normalized.length; i++) {
        const prev=normalized[i-1], next=normalized[i];
        if (next.date <= prev.date) throw new Error('日期与期号顺序冲突');
        if (prev.issue.slice(0,2) === next.issue.slice(0,2) && Number(next.issue) !== Number(prev.issue)+1) throw new Error('同一年期号不连续，请补齐数据');
      }
      return normalized;
    }

    // 固定种子用于复现结果；不用于更改日常随机选号。
    function seededRandom(seed) {
      let state = seed >>> 0;
      return function () {
        state += 0x6D2B79F5;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function generateUniformDraw(rng) {
      const sample = (max, n) => {
        const pool = Array.from({length:max}, (_,i)=>i+1), result=[];
        for (let i=0;i<n;i++) result.push(pool.splice(Math.floor(rng()*pool.length),1)[0]);
        return result.sort((a,b)=>a-b);
      };
      return {front:sample(35,5),back:sample(12,2)};
    }

    function runBacktest(history, settings = {}) {
      const draws = normalizeBacktestHistory(history);
      const rules = resolveRules(settings.rules || {});
      const repeats = settings.repeats ?? 20;
      const seed = settings.seed ?? 20261028;
      if (!Number.isInteger(repeats) || repeats<1 || repeats>1000) throw new Error('repeats须为1—1000');
      if (!Number.isInteger(seed)) throw new Error('seed必须是整数');
      const empty = () => ({ tickets:0, frontHits:0, backHits:0, matches:Array.from({length:6},()=>Array(3).fill(0)) });
      const score = (acc, ticket, actual) => {
        const f=ticket.front.filter(n=>actual.front.includes(n)).length;
        const b=ticket.back.filter(n=>actual.back.includes(n)).length;
        acc.tickets++;acc.frontHits+=f;acc.backHits+=b;acc.matches[f][b]++;
      };
      const algorithm=empty(), random=empty(), perIssue=[];
      let failedGenerations=0;
      for(let i=100;i<draws.length;i++) {
        // 只取目标期之前的100期；profile要求新到旧。
        const profile=buildHistoricalProfile(draws.slice(i-100,i).reverse());
        const algoRng=seededRandom((seed ^ Number(draws[i].issue)) >>> 0);
        const randomRng=seededRandom((seed ^ Number(draws[i].issue) ^ 0x9E3779B9) >>> 0);
        const a=empty(), r=empty();let failed=0;
        for(let j=0;j<repeats;j++) {
          const ticket=generateOptimalDraw([], {profile,rules,rng:algoRng});
          if(!ticket) {failed++;continue;}
          const baseline=generateUniformDraw(randomRng);
          score(a,ticket,draws[i]);score(r,baseline,draws[i]);
          score(algorithm,ticket,draws[i]);score(random,baseline,draws[i]);
        }
        failedGenerations+=failed;
        perIssue.push({issue:draws[i].issue, trainingStart:draws[i-100].issue,trainingEnd:draws[i-1].issue,failedGenerations:failed,algorithm:a,random:r});
      }
      const summary = x => ({...x,meanFrontHits:x.tickets ? x.frontHits/x.tickets : null,meanBackHits:x.tickets ? x.backHits/x.tickets : null});
      return {version:1,window:100,mode:'每期单注，重复随机试验；非五注模式',seed,repeats,rules,
        historyCount:draws.length,evaluatedPeriods:perIssue.length,requestedTickets:perIssue.length*repeats,
        failedGenerations,algorithm:summary(algorithm),random:summary(random),perIssue,
        note:'两组比较实际生成的相同注数；失败单独记录。重复次数不是独立开奖期数。命中矩阵行=前区命中数，列=后区命中数；不换算奖金，不自动判定优势或修改规则。'};
    }
