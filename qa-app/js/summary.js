/* ==========================================================
   summary.js — filterable testing/bug rollup + PDF export
   ========================================================== */

const Summary = {
  charts: {},
  filters: { fileId:'', module:'', tester:'', dateFrom:'', dateTo:'' },

  filteredTC(){
    return App.state.testcases.filter(t => {
      if (this.filters.fileId && t.fileId !== this.filters.fileId) return false;
      if (this.filters.module && t.module !== this.filters.module) return false;
      if (this.filters.dateFrom && t.executionDate && t.executionDate < this.filters.dateFrom) return false;
      if (this.filters.dateTo && t.executionDate && t.executionDate > this.filters.dateTo) return false;
      return true;
    });
  },
  filteredBugs(){
    return App.state.bugs.filter(b => {
      if (this.filters.fileId && b.fileId !== this.filters.fileId) return false;
      if (this.filters.module && b.module !== this.filters.module) return false;
      if (this.filters.tester && b.tester !== this.filters.tester) return false;
      const reportDay = b.reportDate ? b.reportDate.slice(0,10) : '';
      if (this.filters.dateFrom && reportDay && reportDay < this.filters.dateFrom) return false;
      if (this.filters.dateTo && reportDay && reportDay > this.filters.dateTo) return false;
      return true;
    });
  },

  /* Bug count per file, ignoring the file filter itself — lets you spot
     which file has the most bug reports regardless of which one is picked. */
  bugCountsByFile(){
    const base = App.state.bugs.filter(b => {
      if (this.filters.module && b.module !== this.filters.module) return false;
      if (this.filters.tester && b.tester !== this.filters.tester) return false;
      const reportDay = b.reportDate ? b.reportDate.slice(0,10) : '';
      if (this.filters.dateFrom && reportDay && reportDay < this.filters.dateFrom) return false;
      if (this.filters.dateTo && reportDay && reportDay > this.filters.dateTo) return false;
      return true;
    });
    const counts = {};
    base.forEach(b => { const id = b.fileId || ''; counts[id] = (counts[id] || 0) + 1; });
    return Object.entries(counts)
      .map(([fileId, count]) => ({
        name: (App.state.files.find(f => f.id === fileId) || { name: 'Tanpa File' }).name,
        count
      }))
      .sort((a, b) => b.count - a.count);
  },

  bugPerFileCard(){
    const rows = this.bugCountsByFile();
    if (!rows.length) return '';
    const max = rows[0].count || 1;
    const bars = rows.map(r => `
      <div class="sum-legend-row">
        <span class="dot" style="background:var(--status-failed);"></span>
        <div>
          <div style="font-size:13px; font-weight:600;">${escapeHtml(r.name)}</div>
          <div class="sum-legend-bar"><span style="width:${Math.round(r.count/max*100)}%; background:var(--status-failed);"></span></div>
        </div>
        <span class="sum-legend-val">${r.count}</span>
      </div>
    `).join('');
    return `<div class="sum-card" style="--card-accent:var(--status-failed); --card-accent-bg:var(--status-failed-bg);">
      <div class="card-head" style="margin-bottom:10px;"><h3 style="margin:0; font-size:14px;">Bug per File</h3></div>
      <div class="sum-legend">${bars}</div>
    </div>`;
  },

  renderFilterOptions(){
    const build = (id, arr, field) => {
      const el = document.getElementById(id);
      const current = this.filters[field];
      const values = [...new Set(arr.map(x => x[field]).filter(Boolean))].sort();
      el.innerHTML = `<option value="">${el.dataset.label}</option>` +
        values.map(v => `<option value="${escapeHtml(v)}" ${v===current?'selected':''}>${escapeHtml(v)}</option>`).join('');
    };
    build('sumFilterModule', App.state.testcases, 'module');
    build('sumFilterTester', App.state.bugs, 'tester');

    const fileEl = document.getElementById('sumFilterFile');
    const curFile = this.filters.fileId;
    fileEl.innerHTML = `<option value="">${fileEl.dataset.label}</option>` +
      App.state.files.map(f => `<option value="${f.id}" ${f.id===curFile?'selected':''}>${escapeHtml(f.name)}</option>`).join('');
  },

  render(){
    this.renderFilterOptions();
    const tcs = this.filteredTC();
    const bugs = this.filteredBugs();
    const total = tcs.length;
    const totalModules = new Set(tcs.map(t => t.module).filter(Boolean)).size;
    const passed = tcs.filter(t => t.status === 'Passed').length;
    const failed = tcs.filter(t => t.status === 'Failed').length;
    const blocked = tcs.filter(t => t.status === 'Blocked').length;
    const notrun = tcs.filter(t => t.status === 'Open').length;
    const retest = tcs.filter(t => t.status === 'Retest').length;
    const passRate = total ? Math.round((passed/total)*100) : 0;
    const failRate = total ? Math.round((failed/total)*100) : 0;
    const pct = (n) => total ? Math.round((n/total)*1000)/10 : 0;

    document.getElementById('sumBody').innerHTML = `
      <div class="sum-section">
        <div class="sum-section-head"><span class="icon">📋</span><h2 style="color:var(--primary);">TEST CASE SUMMARY</h2></div>
        <p class="sum-hint">Ringkasan berdasarkan filter yang dipilih</p>
        <div class="sum-card-grid">
          ${this.sumCard('🗂️','Total Module', totalModules, '100% dari keseluruhan', 100, 'var(--primary)')}
          ${this.sumCard('📄','Total Test Case', total, '100% dari keseluruhan', 100, 'var(--primary)')}
          ${this.sumCard('📁','Total Open', notrun, `${pct(notrun)}% dari total test case`, pct(notrun), 'var(--status-notrun)')}
          ${this.sumCard('✅','Total Passed', passed, `${pct(passed)}% dari total test case`, pct(passed), 'var(--status-passed)')}
          ${this.sumCard('⏸️','Total Blocked', blocked, `${pct(blocked)}% dari total test case`, pct(blocked), 'var(--status-blocked)')}
          ${this.sumCard('❌','Total Failed', failed, `${pct(failed)}% dari total test case`, pct(failed), 'var(--status-failed)')}
          ${this.sumCard('🔄','Total Retest', retest, `${pct(retest)}% dari total test case`, pct(retest), 'var(--status-retest)')}
        </div>
      </div>

      <div class="sum-section sum-overall">
        <div style="flex:1; min-width:240px;">
          <div class="card-head" style="margin-bottom:10px;"><h3 style="margin:0;">Overall Test Case Progress</h3></div>
          <div class="progress-bar-outer"><span style="width:${passRate}%; background:var(--status-passed);"></span></div>
        </div>
        <div>
          <div class="sum-overall-pct">${passRate}%</div>
          <div class="sum-overall-sub">${passed} / ${total} Passed</div>
        </div>
      </div>

      <div class="sum-section">
        <div class="sum-section-head"><span class="icon">🐞</span><h2 style="color:var(--status-failed);">BUG REPORT SUMMARY</h2></div>
        <p class="sum-hint">Ringkasan berdasarkan filter yang dipilih</p>
        <div class="bug-summary-grid">
          <div class="sum-card" style="--card-accent:var(--status-failed); --card-accent-bg:var(--status-failed-bg); justify-content:center;">
            <div class="sum-card-top"><span class="sum-card-icon">🐞</span><span class="sum-card-label">Total Bug</span></div>
            <span class="sum-card-value">${bugs.length}</span>
            <span class="sum-card-sub">100% dari keseluruhan bug</span>
            <div class="sum-mini-bar"><span style="width:100%;"></span></div>
          </div>
          ${this.donutCard('Distribusi Severity', bugs.length, 'Total Bug',
            ['Critical','High','Medium','Low'],
            ['Critical','High','Medium','Low'].map(s => bugs.filter(b=>b.severity===s).length),
            ['var(--sev-critical)','var(--sev-high)','var(--sev-medium)','var(--sev-low)'], 'sumDonutSeverity')}
          ${this.donutCard('Distribusi Priority', bugs.length, 'Total Bug',
            ['Highest','High','Medium','Low'],
            ['Highest','High','Medium','Low'].map(p => bugs.filter(b=>b.priority===p).length),
            ['var(--sev-critical)','var(--sev-high)','var(--sev-medium)','var(--sev-low)'], 'sumDonutPriority')}
          ${this.bugPerFileCard()}
        </div>
      </div>
    `;

    const sevCounts = ['Critical','High','Medium','Low'].map(s => bugs.filter(b=>b.severity===s).length);
    this.donut('sumDonutSeverity', sevCounts, ['#B0203A','#D64550','#D98A2B','#4E88C7']);
    const prioCounts = ['Highest','High','Medium','Low'].map(p => bugs.filter(b=>b.priority===p).length);
    this.donut('sumDonutPriority', prioCounts, ['#B0203A','#D64550','#D98A2B','#4E88C7']);

    this._lastData = { total, passed, failed, blocked, notrun, retest, passRate, failRate, bugs, tcs: { totalModules } };
    this._lastTC = tcs;
  },

  sumCard(icon, label, value, sub, pct, color){
    return `<div class="sum-card" style="--card-accent:${color}; --card-accent-bg:color-mix(in srgb, ${color} 16%, transparent);">
      <div class="sum-card-top"><span class="sum-card-icon">${icon}</span><span class="sum-card-label">${label}</span></div>
      <span class="sum-card-value">${value}</span>
      <span class="sum-card-sub">${sub}</span>
      <div class="sum-mini-bar"><span style="width:${Math.min(pct,100)}%;"></span></div>
    </div>`;
  },

  donutCard(title, total, centerLabel, labels, counts, colors, canvasId){
    const sum = counts.reduce((a,b)=>a+b,0) || 1;
    const rows = labels.map((l,i) => `
      <div class="sum-legend-row">
        <span class="dot" style="background:${colors[i]};"></span>
        <div>
          <div style="font-size:13px; font-weight:600;">${l}</div>
          <div class="sum-legend-bar"><span style="width:${Math.round(counts[i]/sum*100)}%; background:${colors[i]};"></span></div>
        </div>
        <span class="sum-legend-val">${counts[i]} (${Math.round(counts[i]/sum*1000)/10}%)</span>
      </div>
    `).join('');
    return `<div class="sum-card sum-donut-card" style="--card-accent:var(--primary); --card-accent-bg:var(--primary-soft);">
      <div class="sum-donut-wrap">
        <canvas id="${canvasId}"></canvas>
        <div class="sum-donut-center"><b>${total}</b><span>${centerLabel}</span></div>
      </div>
      <div>
        <div class="card-head" style="margin-bottom:10px;"><h3 style="margin:0; font-size:14px;">${title}</h3></div>
        <div class="sum-legend">${rows}</div>
      </div>
    </div>`;
  },

  donut(id, data, colors){
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (this.charts[id]) this.charts[id].destroy();
    const empty = data.every(v => v===0);
    this.charts[id] = new Chart(ctx, {
      type:'doughnut',
      data:{ datasets:[{ data: empty?[1]:data, backgroundColor: empty?['#E3E7ED']:colors, borderWidth:0 }] },
      options:{ maintainAspectRatio:false, cutout:'68%', plugins:{ legend:{display:false}, tooltip:{enabled:!empty} } }
    });
  },

  /* Insight lines derived from the current filtered summary — same numbers
     shown on screen, turned into plain-language conclusions for the PDF. */
  buildAnalysis(d){
    const bugs = d.bugs || [];
    const notes = [];

    if (!d.total){
      notes.push('Belum ada test case pada rentang filter ini.');
    } else if (d.passRate >= 80){
      notes.push(`Progress testing baik: pass rate ${d.passRate}% (${d.passed}/${d.total} test case Passed).`);
    } else if (d.passRate >= 50){
      notes.push(`Progress testing masih moderat: pass rate ${d.passRate}% (${d.passed}/${d.total} test case Passed), perlu percepatan eksekusi/perbaikan.`);
    } else {
      notes.push(`Pass rate rendah: ${d.passRate}% (${d.passed}/${d.total} test case Passed), perlu perhatian segera.`);
    }

    if (d.failed) notes.push(`Terdapat ${d.failed} test case Failed (${d.failRate}%) yang berpotensi menghasilkan bug baru.`);
    if (d.blocked) notes.push(`${d.blocked} test case masih Blocked, kemungkinan menunggu dependency/environment.`);
    if (d.notrun) notes.push(`${d.notrun} test case belum dieksekusi (Open).`);

    const moduleStats = {};
    (this._lastTC || []).forEach(t => {
      if (!t.module) return;
      moduleStats[t.module] = moduleStats[t.module] || { total:0, failed:0 };
      moduleStats[t.module].total++;
      if (t.status === 'Failed') moduleStats[t.module].failed++;
    });
    const worstModule = Object.entries(moduleStats)
      .filter(([,s]) => s.failed > 0)
      .sort((a,b) => (b[1].failed/b[1].total) - (a[1].failed/a[1].total))[0];
    if (worstModule) notes.push(`Modul dengan tingkat kegagalan tertinggi: "${worstModule[0]}" (${worstModule[1].failed}/${worstModule[1].total} test case Failed).`);

    if (!bugs.length){
      notes.push('Tidak ada bug tercatat pada rentang filter ini.');
    } else {
      const critical = bugs.filter(b=>b.severity==='Critical').length;
      const high = bugs.filter(b=>b.severity==='High').length;
      const openBugs = bugs.filter(b=>['Open','Assigned','Reopened'].includes(b.status)).length;
      const closedBugs = bugs.filter(b=>b.status==='Closed').length;
      if (critical) notes.push(`${critical} bug berseverity Critical, disarankan diprioritaskan sebelum rilis.`);
      if (high) notes.push(`${high} bug berseverity High menunggu perbaikan.`);
      notes.push(`${openBugs} bug masih terbuka (Open/Assigned/Reopened), ${closedBugs} bug sudah Closed dari total ${bugs.length} bug.`);
    }

    return notes;
  },

  exportPDF(){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const d = this._lastData || {};
    const pageW = doc.internal.pageSize.getWidth();
    const primary = [57, 73, 171];

    doc.setFillColor(...primary);
    doc.rect(0, 0, pageW, 22, 'F');
    doc.setTextColor(255,255,255); doc.setFontSize(16);
    doc.text('QA Testing Summary Report', 14, 14);
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleString('id-ID')}`, pageW - 14, 14, { align: 'right' });

    const filterBits = [];
    if (this.filters.fileId){
      const f = App.state.files.find(x => x.id === this.filters.fileId);
      if (f) filterBits.push(`File: ${f.name}`);
    }
    if (this.filters.module) filterBits.push(`Module: ${this.filters.module}`);
    if (this.filters.tester) filterBits.push(`Tester: ${this.filters.tester}`);
    if (this.filters.dateFrom) filterBits.push(`Dari: ${this.filters.dateFrom}`);
    if (this.filters.dateTo) filterBits.push(`Sampai: ${this.filters.dateTo}`);
    doc.setTextColor(90); doc.setFontSize(9);
    doc.text(filterBits.length ? `Filter: ${filterBits.join(' | ')}` : 'Filter: Semua Data', 14, 30);

    let y = 40;
    doc.setTextColor(20); doc.setFontSize(12);
    doc.text('Test Case Summary', 14, y);
    y += 4;

    doc.autoTable({
      startY: y,
      head: [['Total Module','Total TC','Open','Passed','Blocked','Failed','Retest','Pass Rate']],
      body: [[
        d.tcs?.totalModules ?? '', d.total || 0, d.notrun || 0, d.passed || 0,
        d.blocked || 0, d.failed || 0, d.retest || 0, `${d.passRate || 0}%`
      ]],
      theme: 'grid',
      headStyles: { fillColor: primary, textColor: 255, halign: 'center' },
      bodyStyles: { halign: 'center' },
      styles: { fontSize: 9 },
      margin: { left: 14, right: 14 }
    });
    y = doc.lastAutoTable.finalY + 10;

    doc.setFontSize(12); doc.setTextColor(20);
    doc.text('Bug Report Summary', 14, y);
    y += 4;

    const bugs = d.bugs || [];
    doc.autoTable({
      startY: y,
      head: [['Total Bug','Critical','High','Medium','Low','Open','Closed']],
      body: [[
        bugs.length,
        bugs.filter(b=>b.severity==='Critical').length,
        bugs.filter(b=>b.severity==='High').length,
        bugs.filter(b=>b.severity==='Medium').length,
        bugs.filter(b=>b.severity==='Low').length,
        bugs.filter(b=>['Open','Assigned','Reopened'].includes(b.status)).length,
        bugs.filter(b=>b.status==='Closed').length
      ]],
      theme: 'grid',
      headStyles: { fillColor: [214,69,80], textColor: 255, halign: 'center' },
      bodyStyles: { halign: 'center' },
      styles: { fontSize: 9 },
      margin: { left: 14, right: 14 }
    });
    y = doc.lastAutoTable.finalY + 8;

    [['sumDonutSeverity','Distribusi Severity'], ['sumDonutPriority','Distribusi Priority']].forEach(([id, label], i) => {
      const canvas = document.getElementById(id);
      if (!canvas) return;
      const x = 14 + i * 95;
      doc.setFontSize(10); doc.setTextColor(20);
      doc.text(label, x, y);
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', x, y + 3, 40, 40);
    });
    y += 50;

    doc.setFontSize(12); doc.setTextColor(20);
    doc.text('Analisa & Rekomendasi', 14, y);
    y += 6;
    doc.setFontSize(9.5); doc.setTextColor(50);
    this.buildAnalysis(d).forEach(note => {
      const wrapped = doc.splitTextToSize(`•  ${note}`, pageW - 28);
      if (y + wrapped.length * 5 > doc.internal.pageSize.getHeight() - 10){ doc.addPage(); y = 16; }
      doc.text(wrapped, 14, y);
      y += wrapped.length * 5 + 2;
    });

    doc.save(`QA_Summary_${todayISO()}.pdf`);
    Toast.show('Export PDF Summary berhasil.', 'success');
  },

  bindStaticEvents(){
    ['sumFilterFile','sumFilterModule','sumFilterTester'].forEach(id => {
      document.getElementById(id).addEventListener('change', e => {
        const map = { sumFilterFile:'fileId', sumFilterModule:'module', sumFilterTester:'tester' };
        this.filters[map[id]] = e.target.value; this.render();
      });
    });
    document.getElementById('sumDateFrom').addEventListener('change', e => { this.filters.dateFrom = e.target.value; this.render(); });
    document.getElementById('sumDateTo').addEventListener('change', e => { this.filters.dateTo = e.target.value; this.render(); });
    document.getElementById('sumExportPdfBtn').addEventListener('click', () => this.exportPDF());
  }
};

document.addEventListener('DOMContentLoaded', () => Summary.bindStaticEvents());
