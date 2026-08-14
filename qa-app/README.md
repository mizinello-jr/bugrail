# BugRail — QA Test Management & Bug Tracking

Aplikasi web single-page untuk mengelola **Test Case** dan **Bug Report** yang saling terintegrasi, tanpa server dan tanpa database — semua data disimpan otomatis di **Local Storage** browser.

## Cara Menjalankan

Cukup buka `index.html` langsung di browser (double-click atau drag ke tab browser). Tidak perlu instalasi, server, atau build step.

> **Catatan koneksi internet:** chart (Chart.js), export Excel (SheetJS) dan export PDF (jsPDF) dimuat dari CDN saat halaman pertama kali dibuka. Setelah library tersebut termuat di cache browser, seluruh fitur inti (mengisi/mengedit Test Case & Bug Report, filter, search, dark mode) tetap berjalan penuh offline karena logikanya 100% Vanilla JS dan datanya 100% Local Storage. Jika Anda benar‑benar tanpa internet sama sekali, chart & export Excel/PDF tidak akan tampil, namun seluruh data tetap tersimpan dan dapat diekspor sebagai CSV/JSON (tidak butuh library eksternal).

## Struktur Folder

```
/index.html
/css/style.css
/js
  utils.js       -> helper umum (storage, id generator, toast, modal, csv)
  app.js         -> bootstrap, routing sidebar, tema, shortcut keyboard
  dashboard.js   -> widget statistik & chart dashboard
  testcase.js    -> modul Test Case (CRUD, filter, sort, bulk, import/export)
  bugreport.js   -> modul Bug Report (CRUD, integrasi Test Case, attachment)
  summary.js     -> rekap & filter progres testing, export PDF
  import.js      -> halaman Import (template + drag & drop)
  export.js      -> halaman Export (Excel/CSV/Google Sheets/backup JSON)
  settings.js    -> preferensi & manajemen data
/assets/icons, /assets/images  -> tempat aset custom (kosong, siap dipakai)
```

## Fitur Utama

- **Dashboard** — 14 widget statistik realtime + pie chart status Test Case, pie chart severity Bug, bar chart progres per module, progress percentage.
- **Test Case** — tabel modern (mirip TestRail/Zephyr) dengan Add/Edit/Delete/Duplicate, search realtime, filter multi-kolom, sorting per kolom, pagination, bulk delete & bulk update status, Import Excel/CSV, Export Excel/CSV. Mode "Run" khusus hanya mengisi **Actual Result** dan **Status** tanpa mengubah field lain.
- **Bug Report** — terintegrasi penuh dengan Test Case: memilih Test Case ID otomatis mengisi Module, Feature, Scenario, Expected Result, Test Steps, dan Tester. Tester hanya mengisi Actual Result, Bug Title, Description, Severity, Priority, Environment, Browser, OS, Device, Build Version, dan Attachment. Bug ID & Report Date digenerate otomatis.
- **Integrasi Failed → Create Bug** — Test Case berstatus *Failed* menampilkan tombol "Create Bug" yang langsung membuka form Bug Report dengan seluruh data Test Case terisi.
- **Summary** — rekap total, pass rate, fail rate, breakdown bug, progress bar, pie chart, filter by Module/Feature/Tester/Tanggal, export PDF.
- **Import** — drag & drop Excel/CSV + template unduhan.
- **Export** — Excel & CSV untuk Test Case dan Bug Report, panduan Export ke Google Spreadsheet (CSV import langsung, atau Google Apps Script siap-pakai untuk push otomatis), backup & restore seluruh data sebagai JSON.
- **Settings** — Dark/Light mode, info pemakaian storage, hapus semua data, referensi keyboard shortcut.
- **Bonus** — Auto Generate ID (TC-0001 / BUG-0001), toast notification, confirm delete + undo, auto save setiap perubahan, empty state, loading animation, print Test Case/Bug Report, responsive mobile dengan sidebar collapsible.

## Keyboard Shortcut

| Shortcut | Fungsi |
|---|---|
| `/` | Fokus ke kotak pencarian global |
| `N` | Tambah item baru pada halaman aktif |
| `Ctrl/Cmd + S` | Konfirmasi bahwa data sudah tersimpan otomatis |

## Mengembangkan ke Backend

Setiap modul memanggil data melalui `App.state` dan menyimpannya lewat `Storage` (di `utils.js`). Untuk migrasi ke backend nyata, cukup ganti isi `Storage.get/set` dan `App.saveTestcases()/saveBugs()` menjadi pemanggilan REST API — struktur data (field-field Test Case & Bug) tidak perlu diubah.
