/* ==========================================================
   export.js — dedicated Export page.
   Excel/CSV export delegates to TestCaseModule / BugReportModule
   so the column mapping lives in one place per entity.
   "Export to Google Spreadsheet" is implemented as a CSV that
   Google Sheets can import directly (File > Import in Sheets),
   plus a ready-to-copy Google Apps Script for a fully automated
   push, since a static offline page cannot call Google's API
   without OAuth server-side credentials.
   ========================================================== */

const ExportPage = {
  APPS_SCRIPT: `function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('BugReports')
              || SpreadsheetApp.getActiveSpreadsheet().insertSheet('BugReports');
  var rows = JSON.parse(e.postData.contents);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(Object.keys(rows[0]));
  }
  rows.forEach(function(r){ sheet.appendRow(Object.values(r)); });
  return ContentService.createTextOutput('OK');
}`,

  copyScript(){
    navigator.clipboard.writeText(this.APPS_SCRIPT).then(() => {
      Toast.show('Google Apps Script disalin ke clipboard.', 'success');
    }).catch(() => Toast.show('Gagal menyalin, silakan copy manual dari kotak kode.', 'error'));
  },

  backupJSON(){
    const payload = {
      testcases: App.state.testcases,
      bugs: App.state.bugs,
      settings: App.state.settings,
      exportedAt: nowISO()
    };
    downloadBlob(JSON.stringify(payload, null, 2), `QA_Backup_${todayISO()}.json`, 'application/json');
    Toast.show('Backup JSON berhasil diunduh.', 'success');
  },

  restoreJSON(file){
    const reader = new FileReader();
    reader.onload = async (e) => {
      try{
        const data = JSON.parse(e.target.result);
        const ok = await confirmDialog('Restore Data?', 'Data Test Case & Bug Report saat ini akan digantikan dengan isi file backup.', 'Restore');
        if (!ok) return;
        App.state.testcases = data.testcases || [];
        App.state.bugs = data.bugs || [];
        App.saveTestcases(); App.saveBugs();
        Toast.show('Data berhasil di-restore.', 'success');
        App.goTo('dashboard');
      }catch(err){
        console.error(err);
        Toast.show('File backup tidak valid.', 'error');
      }
    };
    reader.readAsText(file);
  },

  bindStaticEvents(){
    document.getElementById('expTcExcelBtn').addEventListener('click', () => TestCaseModule.exportExcel());
    document.getElementById('expTcCsvBtn').addEventListener('click', () => TestCaseModule.exportCSV());
    document.getElementById('expBugExcelBtn').addEventListener('click', () => BugReportModule.exportExcel());
    document.getElementById('expBugCsvBtn').addEventListener('click', () => BugReportModule.exportCSV());
    document.getElementById('expCopyScriptBtn').addEventListener('click', () => this.copyScript());
    document.getElementById('expBackupBtn').addEventListener('click', () => this.backupJSON());
    document.getElementById('expRestoreInput').addEventListener('change', e => {
      if (e.target.files[0]) this.restoreJSON(e.target.files[0]);
      e.target.value = '';
    });
    document.getElementById('expScriptCode').textContent = this.APPS_SCRIPT;
  }
};

document.addEventListener('DOMContentLoaded', () => ExportPage.bindStaticEvents());
