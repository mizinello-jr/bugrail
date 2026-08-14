/* ==========================================================
   bugreport.js — Bug Report module, tightly integrated with
   Test Case (per spec: selecting a Test Case auto-fills
   Module/Feature/Scenario/Expected Result/Steps/Tester).
   ========================================================== */

const BugReportModule = {
  SEVERITY: ['Critical', 'High', 'Medium', 'Low'],
  PRIORITY: ['Highest', 'High', 'Medium', 'Low'],
  /* Seed for Settings > Master > Status Bug Report (js/masterstatus.js) */
  DEFAULT_STATUS_MASTER: [
    { code: 'OPEN', name: 'Open', color: '#2563EB', order: 1 },
    { code: 'IN_PROGRESS', name: 'In Progress', color: '#F59E0B', order: 2 },
    { code: 'RETEST', name: 'Retest', color: '#06B6D4', order: 3 },
    { code: 'RESOLVED', name: 'Resolved', color: '#22C55E', order: 4 },
    { code: 'CLOSED', name: 'Closed', color: '#6B7280', order: 5 },
    { code: 'REJECTED', name: 'Rejected', color: '#EF4444', order: 6 }
  ],
  statusMaster(){
    const list = App.state.settings.bugStatusMaster;
    return (list && list.length) ? list : this.DEFAULT_STATUS_MASTER;
  },
  get STATUS(){
    return this.statusMaster().slice().sort((a, b) => a.order - b.order).map(s => s.name);
  },

  ui: {
    search: '', filters: { module:'', severity:'', priority:'', status:'', tester:'' },
    sortKey: 'reportDate', sortDir: 'desc', page: 1, pageSize: 10,
    selected: new Set(), editingId: null
  },

  setSearch(term){ this.ui.search = term; this.ui.page = 1; this.render(); },
  all(){ return App.state.bugs; },

  filtered(){
    const { search, filters, sortKey, sortDir } = this.ui;
    let rows = this.all().filter(b => {
      if (search){
        const hay = `${b.id} ${b.module} ${b.title} ${b.tester} ${b.testCaseId||''} ${b.description||''} ${b.stepsToReproduce||''} ${b.expectedResult||''} ${b.actualResult||''}`.toLowerCase();
        const words = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
        if (!words.every(w => hay.includes(w))) return false;
      }
      if (filters.module && b.module !== filters.module) return false;
      if (filters.severity && b.severity !== filters.severity) return false;
      if (filters.priority && b.priority !== filters.priority) return false;
      if (filters.status && b.status !== filters.status) return false;
      if (filters.tester && b.tester !== filters.tester) return false;
      return true;
    });
    rows.sort((a,b) => {
      const av = (a[sortKey] ?? '').toString().toLowerCase();
      const bv = (b[sortKey] ?? '').toString().toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return rows;
  },

  uniqueValues(field){ return [...new Set(this.all().map(b => b[field]).filter(Boolean))].sort(); },

  render(){
    this.renderFilterOptions();
    const rows = this.filtered();
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / this.ui.pageSize));
    if (this.ui.page > totalPages) this.ui.page = totalPages;
    const start = (this.ui.page - 1) * this.ui.pageSize;
    const pageRows = rows.slice(start, start + this.ui.pageSize);

    document.getElementById('bugEmptyState').style.display = total ? 'none' : 'flex';
    document.getElementById('bugTableWrap').style.display = total ? 'block' : 'none';

    const bulkBar = document.getElementById('bugBulkBar');
    bulkBar.style.display = this.ui.selected.size ? 'flex' : 'none';
    bulkBar.querySelector('.count').textContent = this.ui.selected.size;

    document.getElementById('bugTableBody').innerHTML = pageRows.map(b => `
      <tr>
        <td><input type="checkbox" class="checkbox bug-row-check" data-id="${b.id}" ${this.ui.selected.has(b.id)?'checked':''}></td>
        <td class="mono">${escapeHtml(b.id)}</td>
        <td class="mono text-dim">${escapeHtml(b.testCaseId || '-')}</td>
        <td class="truncate" title="${escapeHtml(b.title)}">${escapeHtml(b.title)}</td>
        <td class="truncate" title="${escapeHtml(b.module)}">${escapeHtml(b.module)}</td>
        <td>${this.severityBadge(b.severity)}</td>
        <td>${this.statusBadge(b.status)}</td>
        <td>${escapeHtml(b.tester || '-')}</td>
        <td>${formatDate(b.reportDate)}</td>
        <td class="cell-actions">
          <button class="btn sm ghost" data-act="view" data-id="${b.id}" title="Lihat / Edit">✎</button>
          <button class="btn sm ghost" data-act="print" data-id="${b.id}" title="Print">🖨</button>
          <button class="btn sm ghost" data-act="del" data-id="${b.id}" title="Delete">🗑</button>
        </td>
      </tr>
    `).join('');

    document.getElementById('bugResultInfo').textContent = `Menampilkan ${pageRows.length} dari ${total} bug`;
    this.renderPagination(totalPages);
    this.bindRowEvents();
    document.getElementById('bugSelectAll').checked = pageRows.length > 0 && pageRows.every(r => this.ui.selected.has(r.id));
  },

  severityBadge(sev){ return `<span class="badge sev-${sev.toLowerCase()}"><span class="dot"></span>${sev}</span>`; },
  statusBadge(status){
    const map = { 'Open':'open','Assigned':'assigned','In Progress':'inprogress','Ready To Test':'readytotest','Reopened':'reopened','Closed':'closed' };
    return `<span class="badge bug-${map[status]}">${status}</span>`;
  },

  renderFilterOptions(){
    const build = (id, field) => {
      const el = document.getElementById(id);
      const current = this.ui.filters[field];
      el.innerHTML = `<option value="">${el.dataset.label}</option>` +
        this.uniqueValues(field).map(v => `<option value="${escapeHtml(v)}" ${v===current?'selected':''}>${escapeHtml(v)}</option>`).join('');
    };
    build('bugFilterModule', 'module');
    build('bugFilterTester', 'tester');
  },

  renderPagination(totalPages){
    const el = document.getElementById('bugPagination');
    let html = `<button ${this.ui.page===1?'disabled':''} data-pg="prev">‹</button>`;
    for (let i=1;i<=totalPages;i++){
      if (totalPages > 7 && Math.abs(i-this.ui.page) > 2 && i!==1 && i!==totalPages){
        if (i === 2 || i === totalPages-1) html += `<span>…</span>`;
        continue;
      }
      html += `<button class="${i===this.ui.page?'active':''}" data-pg="${i}">${i}</button>`;
    }
    html += `<button ${this.ui.page===totalPages?'disabled':''} data-pg="next">›</button>`;
    el.innerHTML = html;
    el.querySelectorAll('button[data-pg]').forEach(b => b.addEventListener('click', () => {
      const v = b.dataset.pg;
      if (v==='prev') this.ui.page--; else if (v==='next') this.ui.page++; else this.ui.page = parseInt(v,10);
      this.render();
    }));
  },

  bindRowEvents(){
    document.querySelectorAll('.bug-row-check').forEach(cb => {
      cb.onchange = () => { cb.checked ? this.ui.selected.add(cb.dataset.id) : this.ui.selected.delete(cb.dataset.id); this.render(); };
    });
    document.querySelectorAll('#bugTableBody button[data-act]').forEach(btn => {
      btn.onclick = () => {
        const { act, id } = btn.dataset;
        if (act === 'view') this.openForm(id);
        if (act === 'del') this.remove(id);
        if (act === 'print') this.printOne(id);
      };
    });
  },

  /* ---- Form: openForm(bugId, prefillTestCaseId) ----
     - bugId set => editing existing bug
     - prefillTestCaseId set (from "Create Bug" on a Failed test case) => new bug pre-linked */
  openForm(bugId = null, prefillTestCaseId = null){
    this.ui.editingId = bugId;
    const f = document.getElementById('bugForm');
    f.reset();
    const bug = bugId ? this.all().find(b => b.id === bugId) : null;

    this.populateTestCaseSelect();
    document.getElementById('bugModalTitle').textContent = bug ? `Edit Bug — ${bug.id}` : 'Buat Bug Report';
    document.getElementById('bugFieldId').value = bug ? bug.id : '(auto generate)';
    document.getElementById('bugFieldDate').value = bug ? formatDate(bug.reportDate) : formatDate(todayISO());

    if (bug){
      f.testCaseId.value = bug.testCaseId || '';
      this.fillFromTestCase(bug.testCaseId, true);
      f.title.value = bug.title; f.description.value = bug.description;
      f.actualResult.value = bug.actualResult || '';
      f.severity.value = bug.severity; f.priority.value = bug.priority; f.status.value = bug.status;
      f.environment.value = bug.environment || ''; f.browser.value = bug.browser || '';
      f.os.value = bug.os || ''; f.device.value = bug.device || ''; f.buildVersion.value = bug.buildVersion || '';
      f.attachments.value = bug.attachments || ''; f.tester.value = bug.tester || '';
    } else {
      f.severity.value = 'Medium'; f.priority.value = 'Medium'; f.status.value = 'Open';
      if (prefillTestCaseId){
        f.testCaseId.value = prefillTestCaseId;
        this.fillFromTestCase(prefillTestCaseId, true);
      }
    }
    document.getElementById('bugModalOverlay').classList.add('active');
  },
  closeForm(){ document.getElementById('bugModalOverlay').classList.remove('active'); },

  populateTestCaseSelect(){
    const sel = document.getElementById('bugTestCaseSelect');
    sel.innerHTML = `<option value="">— Tidak terkait Test Case —</option>` +
      App.state.testcases.map(t => `<option value="${t.id}">${t.id} — ${escapeHtml(t.scenario).slice(0,60)}</option>`).join('');
  },

  /* Core integration behaviour: auto-fill readonly fields from the chosen Test Case. */
  fillFromTestCase(tcId, silent = false){
    const f = document.getElementById('bugForm');
    const tc = App.state.testcases.find(t => t.id === tcId);
    if (!tc){
      f.module.value = ''; f.scenario.value = '';
      f.expectedResultRef.value = ''; f.stepsRef.value = '';
      return;
    }
    f.module.value = tc.module; f.scenario.value = tc.scenario;
    f.expectedResultRef.value = tc.expectedResult || ''; f.stepsRef.value = tc.steps || '';
    if (!silent) Toast.show('Field Test Case otomatis terisi.', 'info', { duration: 1800 });
  },

  submitForm(e){
    e.preventDefault();
    const f = e.target;
    const data = {
      testCaseId: f.testCaseId.value || null,
      module: f.module.value, scenario: f.scenario.value,
      expectedResult: f.expectedResultRef.value, steps: f.stepsRef.value, tester: f.tester.value.trim(),
      title: f.title.value.trim(), description: f.description.value.trim(), actualResult: f.actualResult.value.trim(),
      severity: f.severity.value, priority: f.priority.value, status: f.status.value,
      environment: f.environment.value.trim(), browser: f.browser.value.trim(),
      os: f.os.value.trim(), device: f.device.value.trim(), buildVersion: f.buildVersion.value.trim(),
      attachments: f.attachments.value.trim()
    };
    if (!data.title || !data.actualResult){
      Toast.show('Bug Title dan Actual Result wajib diisi.', 'error'); return;
    }
    if (this.ui.editingId){
      const idx = App.state.bugs.findIndex(b => b.id === this.ui.editingId);
      App.state.bugs[idx] = { ...App.state.bugs[idx], ...data };
      Toast.show(`Bug ${this.ui.editingId} diperbarui.`, 'success');
    } else {
      const id = IdGen.next('BUG');
      App.state.bugs.push({ id, ...data, reportDate: nowISO() });
      Toast.show(`Bug ${id} dibuat.`, 'success');
    }
    App.saveBugs();
    this.closeForm();
    this.render();
  },

  async remove(id){
    const ok = await confirmDialog('Hapus Bug Report?', `${id} akan dihapus.`);
    if (!ok) return;
    const idx = App.state.bugs.findIndex(b => b.id === id);
    const removed = App.state.bugs.splice(idx,1)[0];
    App.saveBugs(); this.ui.selected.delete(id); this.render();
    Toast.show(`${id} dihapus.`, 'info', { undo: () => { App.state.bugs.splice(idx,0,removed); App.saveBugs(); this.render(); } });
  },

  async bulkDelete(){
    if (!this.ui.selected.size) return;
    const ids = [...this.ui.selected];
    const ok = await confirmDialog('Hapus Bug Terpilih?', `${ids.length} bug akan dihapus.`);
    if (!ok) return;
    const removed = App.state.bugs.filter(b => ids.includes(b.id));
    App.state.bugs = App.state.bugs.filter(b => !ids.includes(b.id));
    App.saveBugs(); this.ui.selected.clear(); this.render();
    Toast.show(`${ids.length} bug dihapus.`, 'info', { undo: () => { App.state.bugs.push(...removed); App.saveBugs(); this.render(); } });
  },

  bulkUpdateStatus(status){
    if (!this.ui.selected.size || !status) return;
    App.state.bugs.forEach(b => { if (this.ui.selected.has(b.id)) b.status = status; });
    App.saveBugs(); this.render();
    Toast.show(`Status ${this.ui.selected.size} bug diubah menjadi ${status}.`, 'success');
  },

  printOne(id){
    App.goTo('bugreport');
    this.openForm(id);
    setTimeout(() => window.print(), 200);
  },

  /* ---- Export ---- */
  exportExcel(){
    const rows = this.filtered().map(b => ({
      'Bug ID': b.id, 'Test Case ID': b.testCaseId || '', Module: b.module,
      Scenario: b.scenario, 'Bug Title': b.title, Description: b.description,
      'Expected Result': b.expectedResult, 'Actual Result': b.actualResult,
      Severity: b.severity, Priority: b.priority, Status: b.status, Tester: b.tester,
      Date: formatDate(b.reportDate), Environment: b.environment, Browser: b.browser, OS: b.os,
      Attachment: b.attachments || '',
      'Build Version': b.buildVersion
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bug Reports');
    XLSX.writeFile(wb, `BugReports_${todayISO()}.xlsx`);
    Toast.show('Export Excel Bug Report berhasil.', 'success');
  },
  exportCSV(){
    const cols = [
      {key:'id',label:'Bug ID'},{key:'testCaseId',label:'Test Case ID'},{key:'module',label:'Module'},
      {key:'scenario',label:'Scenario'},{key:'title',label:'Bug Title'},
      {key:'description',label:'Description'},{key:'expectedResult',label:'Expected Result'},
      {key:'actualResult',label:'Actual Result'},{key:'severity',label:'Severity'},{key:'priority',label:'Priority'},
      {key:'status',label:'Status'},{key:'tester',label:'Tester'},{key:'reportDate',label:'Date'},
      {key:'environment',label:'Environment'},{key:'browser',label:'Browser'},{key:'os',label:'OS'},
      {key:'attachments',label:'Attachment'},{key:'buildVersion',label:'Build Version'}
    ];
    downloadBlob(arrayToCSV(this.filtered(), cols), `BugReports_${todayISO()}.csv`, 'text/csv');
    Toast.show('Export CSV Bug Report berhasil (siap import ke Google Spreadsheet).', 'success');
  },

  bindStaticEvents(){
    const f = document.getElementById('bugForm');
    f.addEventListener('submit', e => this.submitForm(e));
    f.testCaseId.addEventListener('change', e => this.fillFromTestCase(e.target.value));

    document.getElementById('bugSearchInput').addEventListener('input', debounce(e => this.setSearch(e.target.value), 200));
    document.getElementById('bugSelectAll').addEventListener('change', e => {
      const rows = this.filtered().slice((this.ui.page-1)*this.ui.pageSize, this.ui.page*this.ui.pageSize);
      rows.forEach(r => e.target.checked ? this.ui.selected.add(r.id) : this.ui.selected.delete(r.id));
      this.render();
    });
    ['bugFilterModule','bugFilterSeverity','bugFilterPriority','bugFilterStatus','bugFilterTester'].forEach(id => {
      document.getElementById(id).addEventListener('change', e => {
        const map = { bugFilterModule:'module', bugFilterSeverity:'severity', bugFilterPriority:'priority', bugFilterStatus:'status', bugFilterTester:'tester' };
        this.ui.filters[map[id]] = e.target.value; this.ui.page = 1; this.render();
      });
    });
    document.querySelectorAll('#bugTable thead th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.key;
        this.ui.sortDir = (this.ui.sortKey === key && this.ui.sortDir === 'asc') ? 'desc' : 'asc';
        this.ui.sortKey = key; this.render();
      });
    });
    document.getElementById('bugBulkDeleteBtn').addEventListener('click', () => this.bulkDelete());
    document.getElementById('bugBulkStatusSelect').addEventListener('change', e => { this.bulkUpdateStatus(e.target.value); e.target.value=''; });
  }
};

document.addEventListener('DOMContentLoaded', () => BugReportModule.bindStaticEvents());
