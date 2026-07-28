// kojen-maliyet-rapor.js

'use strict';

// ─── KONFİGÜRASYON ───────────────────────────────────────────────────────────

// Maliyet kayıt GAS Web App URL — deploy sonrası buraya yapıştırın
var KMR_URL = 'https://script.google.com/macros/s/AKfycbwizn4pYfxP0hjyvn_C8ak2sCTZbvJe8v7-xjCrHbFQ5cweFJUhdLGM7OHlya2qAozS1g/exec';

var State = {
  user         : null,
  reportData   : null,
  history      : JSON.parse(sessionStorage.getItem('kmrHistory') || '[]'),
  loading      : false,
  currentFilter: {}
};

// ─── DOM YARDIMCILARI ─────────────────────────────────────────────────────────

function getVal(id)      { var el = document.getElementById(id); return el ? el.value : ''; }
function setVal(id, val) { var el = document.getElementById(id); if (el) el.value = val; }
function setEl(id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; }
function on(id, ev, fn)  { var el = document.getElementById(id); if (el) el.addEventListener(ev, fn); }

// ─── FORMAT YARDIMCILARI ──────────────────────────────────────────────────────

function num(v)    { return parseFloat(String(v || '').replace(',', '.')) || 0; }
function pad2(n)   { return String(n).padStart(2, '0'); }
function fmt3(v)   { return num(v).toFixed(3); }
function fmt5(v)   { return num(v).toFixed(5); }
function fmtTL(v)  { return num(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺'; }
function fmtKwh(v) { return num(v).toLocaleString('tr-TR') + ' kWh'; }
function fmtMwh(v) { return num(v).toFixed(3) + ' MWh'; }
function fmtPct(v) { return num(v).toFixed(2) + '%'; }
function isoDate(d){ return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function formatDate(d)   { return pad2(d.getDate()) + '.' + pad2(d.getMonth()+1) + '.' + d.getFullYear() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function formatDateTR(s) { var p = s.split('-'); return (p[2]||'') + '.' + (p[1]||'') + '.' + (p[0]||''); }

// ─── BİLDİRİM ─────────────────────────────────────────────────────────────────

function showNotice(msg, type) {
  var el = document.getElementById('noticeBar');
  if (!el) return;
  el.className = 'notice-bar ' + (type || '');
  el.textContent = msg;
  el.hidden = false;
  if (type === 'success') setTimeout(function () { el.hidden = true; }, 4000);
}

function showToast(msg, type) {
  var t = document.createElement('div');
  t.className = 'toast ' + (type || 'info');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3500);
}

function setLoading(isOn) {
  State.loading = isOn;
  var btn = document.getElementById('generateReportBtn');
  if (!btn) return;
  btn.disabled = isOn;
  btn.textContent = isOn ? 'Yükleniyor...' : 'Rapor Üret';
}

// ─── OLAY DİNLEYİCİLERİ ──────────────────────────────────────────────────────

function bindEvents() {
  on('generateReportBtn', 'click', handleGenerateReport);
  on('applyFilterBtn',    'click', handleGenerateReport);
  on('baglantiCekBtn',    'click', handleBaglantiCek);
  on('exportCsvBtn',      'click', function () { exportReport('csv'); });
  on('exportPdfBtn',      'click', function () { exportReport('pdf'); });
  on('faturaExportBtn',   'click', function () { exportTable('faturaTableBody', 'faturalasma'); });
  on('aylikExportBtn',    'click', function () { exportTable('aylikTableBody', 'aylik-ozet'); });
  on('clearHistoryBtn',   'click', clearHistory);
  on('sidebarLogout',     'click', handleLogout);

  document.querySelectorAll('.chip[data-quick]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      document.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
      applyQuickFilter(chip.dataset.quick);
    });
  });
}

function applyQuickFilter(key) {
  var now = new Date(), y = now.getFullYear(), m = now.getMonth();
  var start, end = isoDate(now);
  if (key === 'thisMonth')  { start = isoDate(new Date(y, m, 1)); }
  else if (key === 'lastMonth') { start = isoDate(new Date(y, m-1, 1)); end = isoDate(new Date(y, m, 0)); }
  else if (key === 'last7')  { start = isoDate(new Date(now.getTime() - 6*86400000)); }
  else if (key === 'last30') { start = isoDate(new Date(now.getTime() - 29*86400000)); }
  else if (key === 'ytd')    { start = isoDate(new Date(y, 0, 1)); }
  else { start = isoDate(new Date(y, m, 1)); }
  setVal('reportStartDate', start);
  setVal('reportEndDate',   end);
  handleGenerateReport();
}

function handleLogout() {
  localStorage.removeItem('loggedInUser');
  localStorage.removeItem('currentUser');
  window.location.href = 'index.html';
}

// ─── RAPOR ÜRET ───────────────────────────────────────────────────────────────

async function handleGenerateReport() {
  if (State.loading) return;
  var filter = {
    month: parseInt(getVal('reportMonth'), 10), year: parseInt(getVal('reportYear'), 10),
    type: getVal('reportType'), startDate: getVal('reportStartDate'), endDate: getVal('reportEndDate')
  };
  State.currentFilter = filter;
  setLoading(true);
  showNotice('Rapor verileri yükleniyor...', 'info');
  try {
    var data = await fetchReportData(filter);
    State.reportData = data;
    renderKpis(data);
    renderCostBreakdown(data.maliyet);
    renderAvantajTable(data.avantaj);
    renderDengesizlikTable(data.dengesizlik);
    renderFaturaTable(data.fatura);
    renderMotorKartlari(data.motorlar);
    renderAylikOzetTable(data.aylikOzet);
    addToHistory(filter, data);
    showNotice('Rapor oluşturuldu. (' + formatDate(new Date()) + ')', 'success');
  } catch (err) {
    showNotice('Hata: ' + err.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function fetchReportData(filter) {
  if (!KMR_URL) return buildDemoData(filter);
  var params = new URLSearchParams({ action: 'getRaporData', startDate: filter.startDate,
    endDate: filter.endDate, month: filter.month, year: filter.year, type: filter.type });
  var res  = await fetch(KMR_URL + '?' + params.toString());
  if (!res.ok) throw new Error('HTTP ' + res.status);
  var json = await res.json();
  if (!json.success) throw new Error(json.error || 'Sunucu hatası');
  return json.data;
}

// ─── KPI ──────────────────────────────────────────────────────────────────────

function renderKpis(data) {
  var m = data.maliyet||{}, a = data.avantaj||{}, d = data.dengesizlik||{}, f = data.fatura||{}, b = data.baglanti||{};
  setEl('kpiBirimMaliyet',    fmt5(m.birimMaliyet || 0));
  setEl('kpiBirimMaliyetSub', 'Bakım+Arıza+Doğalgaz');
  setEl('kpiKojenAvantaj',    fmtTL(a.toplam || 0));
  setEl('kpiKojenAvantajSub', 'Günlük ort: ' + fmtTL((a.toplam||0) / Math.max(a.gunSayisi||1,1)));
  setEl('kpiDengesizlik',    fmtTL((d.epiasToplam||0)+(d.teiasToplam||0)));
  setEl('kpiDengesizlikSub', 'EPİAŞ: ' + fmtTL(d.epiasToplam||0));
  setEl('kpiFatura',    fmtTL(f.toplam||0));
  setEl('kpiFaturaSub', 'Şebeke: ' + fmtMwh(f.sebekeMwh||0));
  setEl('kpiKojenUretim',    fmtKwh(b.toplamUretim||0));
  setEl('kpiKojenUretimSub', 'GM1+GM2+GM3');
  setEl('kpiSebeke',    fmtMwh(b.toplamSebeke||0));
  setEl('kpiSebekeSub', 'Karşılama: ' + fmtPct(b.karsilama||0));
}

// ─── MALİYET BREAKDOWN ────────────────────────────────────────────────────────

function renderCostBreakdown(m) {
  m = m || {};
  var items = [
    { label: 'Bakım',       value: m.bakim    || 0.1798, cls: 'bakim' },
    { label: 'Arıza',       value: m.ariza    || 0.1046, cls: 'ariza' },
    { label: 'Doğalgaz',    value: m.dogalgaz || 4.5420, cls: 'dogalgaz' },
    { label: 'Buhar (−)',   value: m.buhar    || 0.5636, cls: 'buhar', neg: true },
    { label: 'Net Maliyet', value: m.net      || 4.2628, cls: 'net' }
  ];
  var maxV = Math.max.apply(null, items.map(function (i) { return Math.abs(i.value); }));
  var el = document.getElementById('costBreakdown');
  el.innerHTML = items.map(function (item, idx) {
    var pct = maxV > 0 ? (Math.abs(item.value)/maxV*100).toFixed(1) : 0;
    return (idx===3?'<hr class="cost-divider">':'') +
      '<div class="cost-item">' +
      '<span class="cost-item-label">' + item.label + '</span>' +
      '<div class="cost-bar-wrap"><div class="cost-bar ' + item.cls + '" style="width:' + pct + '%"></div></div>' +
      '<span class="cost-item-value">' + (item.neg?'− ':'') + fmt5(Math.abs(item.value)) + ' TL/kWh</span>' +
      '</div>';
  }).join('');
  setEl('maliyetBadge', fmt5(m.net||4.2628) + ' TL/kWh');
}

// ─── TABLO RENDER FONKSİYONLARI ──────────────────────────────────────────────

function renderAvantajTable(avantaj) {
  avantaj = avantaj || {};
  var rows = avantaj.gunluk || [];
  var top  = rows.reduce(function (s, r) { return s + num(r.avantaj||r[1]); }, 0);
  var tbody = document.getElementById('avantajTableBody');
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="3" class="empty-row">Veri yok</td></tr>'; setEl('avantajToplamBadge','--'); return; }
  tbody.innerHTML = rows.map(function (r) {
    var v = num(r.avantaj||r[1]), cls = v>80000?'high-avantaj':v<10000?'low-avantaj':'';
    return '<tr><td>'+(r.tarih||r[0]||'')+'</td><td class="'+cls+'">'+fmtTL(v)+'</td><td>'+(v>80000?'↑':v<10000?'↓':'→')+'</td></tr>';
  }).join('');
  setEl('avantajToplamBadge', fmtTL(top));
}

function renderDengesizlikTable(d) {
  d = d || {}; var rows = d.aylik||[];
  var tbody = document.getElementById('dengesizlikTableBody');
  var tE=0, tT=0;
  if (!rows.length) { tbody.innerHTML='<tr><td colspan="4" class="empty-row">Veri yok</td></tr>'; setEl('dengesizlikToplamBadge','--'); return; }
  tbody.innerHTML = rows.map(function (r) {
    var e=num(r.epias||r[1]), t=num(r.teias||r[2]); tE+=e; tT+=t;
    return '<tr><td>'+(r.tarih||r[0]||'')+'</td><td class="'+(e>10000?'negative':'')+'">'
      +fmtTL(e)+'</td><td>'+fmtTL(t)+'</td><td><strong>'+fmtTL(e+t)+'</strong></td></tr>';
  }).join('');
  tbody.innerHTML += '<tr style="background:#edf2f7;font-weight:700"><td>TOPLAM</td><td>'+fmtTL(tE)+'</td><td>'+fmtTL(tT)+'</td><td>'+fmtTL(tE+tT)+'</td></tr>';
  setEl('dengesizlikToplamBadge', fmtTL(tE+tT));
}

function renderFaturaTable(fatura) {
  fatura = fatura||{}; var rows=fatura.saatlik||[];
  var tbody=document.getElementById('faturaTableBody'), tfoot=document.getElementById('faturaTableFoot');
  if (!rows.length) { tbody.innerHTML='<tr><td colspan="8" class="empty-row">Veri yok</td></tr>'; setEl('faturaToplamBadge','--'); return; }
  var tot=[0,0,0,0,0,0,0];
  tbody.innerHTML = rows.map(function (r) {
    var v=[num(r.dengesizlik||r[1]),num(r.epias||r[2]),num(r.dagitim||r[3]),num(r.koruma||r[4]),num(r.vtc||r[5]),num(r.tahmin||r[6]),num(r.gercek||r[7])];
    v.forEach(function(x,i){tot[i]+=x;});
    return '<tr><td class="saat-cell">'+(r.saat||r[0]||'')+'</td>'
      +'<td class="'+(v[0]<0?'negative':'')+'">'+fmtTL(v[0])+'</td>'
      +'<td>'+fmtTL(v[1])+'</td><td>'+fmtTL(v[2])+'</td><td>'+fmtTL(v[3])+'</td>'
      +'<td class="'+(v[4]<0?'negative':'')+'">'+fmtTL(v[4])+'</td>'
      +'<td>'+fmt3(v[5])+'</td><td>'+fmt3(v[6])+'</td></tr>';
  }).join('');
  tfoot.innerHTML = '<tr><td>TOPLAM</td>'+tot.slice(0,5).map(function(v){return '<td><strong>'+fmtTL(v)+'</strong></td>';}).join('')+tot.slice(5).map(function(v){return '<td>'+fmt3(v)+'</td>';}).join('')+'</tr>';
  setEl('faturaToplamBadge', fmtTL(tot[1]+tot[2]+Math.max(0,tot[3])));
}

function renderMotorKartlari(motorlar) {
  motorlar = motorlar||{};
  ['gm1','gm2','gm3'].forEach(function(gm){
    var d=motorlar[gm]||{};
    setEl(gm+'Hours',  d.calismaSaati ? d.calismaSaati+' h' : '--');
    setEl(gm+'Plan',   d.planUretim  ? fmtMwh(d.planUretim)   : '--');
    setEl(gm+'Bakim',  d.bakimMaliyet? fmtTL(d.bakimMaliyet)  : '--');
  });
}

function renderAylikOzetTable(aylikOzet) {
  aylikOzet = aylikOzet||{}; var rows=aylikOzet.gunluk||[];
  var tbody=document.getElementById('aylikTableBody'), tfoot=document.getElementById('aylikTableFoot');
  if (!rows.length) { tbody.innerHTML='<tr><td colspan="8" class="empty-row">Veri yok</td></tr>'; return; }
  var tAv=0,tSeb=0,tKu=0,tKm=0,tDen=0;
  tbody.innerHTML = rows.map(function(r){
    var av=num(r.avantaj||r[1]),seb=num(r.sebekeMal||r[2]),bm=num(r.birimMal||r[3]);
    var ku=num(r.kojenUretim||r[4]),km=num(r.kojenMal||r[5]),den=num(r.dengesizlik||r[6]);
    tAv+=av;tSeb+=seb;tKu+=ku;tKm+=km;tDen+=den;
    var bg=av>80000?'background:#f0fff4':av<10000?'background:#fffbeb':'';
    var dur=av>80000?'✅ Yüksek':av<10000?'⚠️ Düşük':'→ Normal';
    return '<tr style="'+bg+'"><td>'+(r.tarih||r[0]||'')+'</td>'
      +'<td class="'+(av>80000?'high-avantaj':av<10000?'low-avantaj':'')+'">'+fmtTL(av)+'</td>'
      +'<td>'+fmtTL(seb)+'</td><td>'+fmt5(bm)+'</td>'
      +'<td>'+num(ku).toLocaleString('tr-TR')+'</td>'
      +'<td>'+fmtTL(km)+'</td><td class="'+(den>20000?'negative':'')+'">'+fmtTL(den)+'</td>'
      +'<td style="font-size:12px">'+dur+'</td></tr>';
  }).join('');
  var ort=tSeb>0?tSeb/Math.max(tKu,1):0;
  tfoot.innerHTML='<tr><td>TOPLAM</td><td><strong>'+fmtTL(tAv)+'</strong></td><td>'+fmtTL(tSeb)+'</td><td>'+fmt5(ort)+'</td><td>'+tKu.toLocaleString('tr-TR')+'</td><td>'+fmtTL(tKm)+'</td><td>'+fmtTL(tDen)+'</td><td></td></tr>';
}

// ─── BAĞLANTI NOKTALARI ───────────────────────────────────────────────────────

async function handleBaglantiCek() {
  var tarih = getVal('baglantiTarihInput');
  if (!tarih) { showToast('Tarih seçin','error'); return; }
  setEl('baglantiTarihLabel','Yükleniyor...');
  document.getElementById('baglantiTableBody').innerHTML='<tr><td colspan="7" class="empty-row">Yükleniyor...</td></tr>';
  try {
    var rows=[];
    if (KMR_URL) {
      var res=await fetch(KMR_URL+'?'+new URLSearchParams({action:'getBaglantiNoktalari',date:tarih}).toString());
      var json=await res.json(); if(!json.success) throw new Error(json.error||'Hata');
      rows=json.data||[];
    } else { rows=buildDemoBaglantiRows(); }
    renderBaglantiTable(rows);
    setEl('baglantiTarihLabel','Tarih: '+formatDateTR(tarih));
  } catch(err) {
    document.getElementById('baglantiTableBody').innerHTML='<tr><td colspan="7" class="empty-row" style="color:#c53030">Hata: '+err.message+'</td></tr>';
    setEl('baglantiTarihLabel','Bağlantı noktası verileri');
  }
}

function renderBaglantiTable(rows) {
  var tbody=document.getElementById('baglantiTableBody');
  var SAATLER=[]; for(var i=0;i<24;i++) SAATLER.push(pad2(i)+':00:00');
  var map={}; (rows||[]).forEach(function(r){ var k=pad2(parseInt(String(r.saat||r[0]||'0').split(':')[0],10))+':00:00'; map[k]=r; });
  var tT=0,tG1=0,tG2=0,tG3=0,tK=0,tS=0;
  var html=SAATLER.map(function(saat){
    var r=map[saat]||{};
    var tu=num(r.tuketim||r[1]),g1=num(r.gm1||r[2]),g2=num(r.gm2||r[3]),g3=num(r.gm3||r[4]);
    var kj=g1+g2+g3, sb=tu-kj;
    tT+=tu;tG1+=g1;tG2+=g2;tG3+=g3;tK+=kj;tS+=sb;
    return '<tr class="'+(kj>0?'kojen-aktif':'')+'"><td class="saat-cell">'+saat+'</td>'
      +'<td>'+fmt3(tu)+'</td>'
      +'<td>'+(g1>0?fmt3(g1):'<span style="color:#a0aec0">—</span>')+'</td>'
      +'<td>'+(g2>0?fmt3(g2):'<span style="color:#a0aec0">—</span>')+'</td>'
      +'<td>'+(g3>0?fmt3(g3):'<span style="color:#a0aec0">—</span>')+'</td>'
      +'<td><strong>'+(kj>0?fmt3(kj):'—')+'</strong></td>'
      +'<td>'+fmt3(sb)+'</td></tr>';
  }).join('');
  html+='<tr style="background:#edf2f7;font-weight:700"><td class="saat-cell">Total</td><td>'+fmt3(tT)+'</td><td>'+fmt3(tG1)+'</td><td>'+fmt3(tG2)+'</td><td>'+fmt3(tG3)+'</td><td>'+fmt3(tK)+'</td><td>'+fmt3(tS)+'</td></tr>';
  tbody.innerHTML=html;
}

// ─── GEÇMİŞ ──────────────────────────────────────────────────────────────────

function addToHistory(filter, data) {
  var a=data.avantaj||{}, d=data.dengesizlik||{};
  State.history.unshift({ id:Date.now(), tarih:formatDate(new Date()),
    filtre: filter.startDate+' → '+filter.endDate, tur:filter.type,
    avantaj: a.toplam?fmtTL(a.toplam):'--',
    dengesizlik: fmtTL((d.epiasToplam||0)+(d.teiasToplam||0)) });
  if (State.history.length>20) State.history=State.history.slice(0,20);
  sessionStorage.setItem('kmrHistory', JSON.stringify(State.history));
  renderHistory();
}

function renderHistory() {
  var el=document.getElementById('historyList'); if(!el) return;
  if (!State.history.length) { el.innerHTML='<p class="empty-row">Henüz rapor üretilmedi.</p>'; return; }
  el.innerHTML=State.history.map(function(h){
    return '<div class="history-item">'
      +'<div><div class="history-item-label">'+h.filtre+' · '+h.tur+'</div>'
      +'<div class="history-item-meta">'+h.tarih+' &nbsp;|&nbsp; Avantaj: '+h.avantaj+' &nbsp;|&nbsp; Dengesizlik: '+h.dengesizlik+'</div></div>'
      +'<div class="history-item-actions"><button class="btn ghost sm" onclick="restoreFilter('+h.id+')">Yükle</button></div>'
      +'</div>';
  }).join('');
}

function clearHistory() {
  State.history=[]; sessionStorage.removeItem('kmrHistory'); renderHistory(); showToast('Geçmiş temizlendi','info');
}

function restoreFilter(id) {
  var h=State.history.find(function(x){return x.id===id;}); if(!h) return;
  showToast(h.filtre+' yüklendi','info');
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────

function exportReport(format) {
  if (!State.reportData) { showToast('Önce rapor üretin','error'); return; }
  if (format==='pdf') { showToast('PDF için Ctrl+P kullanın','info'); window.print(); return; }
  exportTable('aylikTableBody','kojen-maliyet-rapor');
}

function exportTable(tbodyId, filename) {
  var rows=document.querySelectorAll('#'+tbodyId+' tr');
  if (!rows.length) { showToast('Dışa aktarılacak veri yok','error'); return; }
  var lines=[];
  rows.forEach(function(tr){
    var cells=Array.from(tr.querySelectorAll('td,th')).map(function(td){
      return '"'+td.innerText.replace(/"/g,'""').replace(/\n/g,' ')+'"';
    });
    lines.push(cells.join(';'));
  });
  var blob=new Blob(['\uFEFF'+lines.join('\n')],{type:'text/csv;charset=utf-8;'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url; a.download=filename+'-'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast('CSV indirildi','success');
}

// ─── DEMO VERİ ────────────────────────────────────────────────────────────────

function buildDemoData(filter) {
  var avList=[111283,60689,50486,34117,2960,21601,38484,39818,68388,59592,42336,49016,47935,56313,31747,83361,72728,74956,69662,94512,98596,120347,94826,108412,25129,69665];
  var gunler=[], start=new Date(filter.startDate||'2026-07-01'), end=new Date(filter.endDate||'2026-07-26'), i=0;
  for(var d=new Date(start);d<=end&&i<avList.length;d.setDate(d.getDate()+1),i++){
    gunler.push({ tarih:pad2(d.getDate())+'.'+pad2(d.getMonth()+1)+'.'+d.getFullYear(),
      avantaj:avList[i], sebekeMal:800000+Math.round(Math.random()*200000),
      birimMal:3.5+Math.random()*2, kojenUretim:Math.round(avList[i]/1.3),
      kojenMal:Math.round(avList[i]*1.3), dengesizlik:Math.round(Math.random()*15000+2000) });
  }
  var tAv=gunler.reduce(function(s,g){return s+g.avantaj;},0);
  var tDen=gunler.reduce(function(s,g){return s+g.dengesizlik;},0);
  return {
    maliyet:{bakim:0.1798,ariza:0.1046,dogalgaz:4.5419,buhar:0.5636,net:4.2628,birimMaliyet:4.403},
    avantaj:{toplam:tAv,gunSayisi:gunler.length,gunluk:gunler.map(function(g){return{tarih:g.tarih,avantaj:g.avantaj};})},
    dengesizlik:{epiasToplam:Math.round(tDen*.93),teiasToplam:Math.round(tDen*.07),
      aylik:gunler.map(function(g){return{tarih:g.tarih,epias:Math.round(g.dengesizlik*.93),teias:Math.round(g.dengesizlik*.07)};})},
    fatura:{toplam:762458,sebekeMwh:213.636,saatlik:buildDemoFaturaRows()},
    baglanti:{toplamUretim:2188700,toplamSebeke:4093831,karsilama:34.8},
    motorlar:{gm1:{calismaSaati:42634,planUretim:29,bakimMaliyet:234090},gm2:{calismaSaati:48549,planUretim:29,bakimMaliyet:196931},gm3:{calismaSaati:32845,planUretim:29.88,bakimMaliyet:99678}},
    aylikOzet:{gunluk:gunler}
  };
}

function buildDemoFaturaRows() {
  var d=[[253.8,33767,19005,253.8,0,13,12.70],[-969.6,13508,6179,0,-969.6,3.86,4.13],[447.1,14190,6062,447.1,0,4.30,4.05],[8.70,4386,38158,5040,43852,4.60,5.30],[8.70,4386,38158,5796,50429,4.60,4.40],[8.70,4386,38158,5540,48202,4.50,4.18]];
  var rows=[];
  for(var i=0;i<24;i++){
    var v=d[i%d.length]||[0,3000,18000,0,0,13,12.5];
    rows.push({saat:pad2(i)+':00:00',dengesizlik:v[0],epias:v[1],dagitim:v[2],koruma:v[3],vtc:v[4],tahmin:v[5],gercek:v[6]});
  }
  return rows;
}

function buildDemoBaglantiRows() {
  var plan=[[13,0,0,0],[13,0,0,0],[13,0,0,0],[13,2.9,2.9,3.34],[13,2.9,2.9,3.34],[13,2.9,2.9,2.9],[13,2.9,2.9,2.9],[13,0,0,0],[13,0,0,0],[13,0,0,0],[13,0,0,0],[13,0,0,0],[13,0,0,0],[13,0,0,0],[13,0,0,0],[13,0,0,0],[13,0,0,0],[13,0,0,0],[13.3,2.9,2.9,2.9],[13.3,2.9,2.9,2.9],[13.2,2.9,2.9,2.9],[13.1,2.9,2.9,2.9],[13,2.9,2.9,2.9],[13,2.9,2.9,2.9]];
  return plan.map(function(p,i){return{saat:pad2(i)+':00:00',tuketim:p[0],gm1:p[1],gm2:p[2],gm3:p[3]};});
}

// ─── BAŞLANGIÇ — tek DOMContentLoaded ────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {

  // Admin kontrolü — enerji-rapor.js ile aynı pattern, file:// protokolünde de çalışır
  var user = null;
  try { user = JSON.parse(localStorage.getItem('loggedInUser') || 'null'); } catch (_) {}

  function _isAdmin(u) {
    if (!u) return false;
    var norm = function (v) {
      return String(v||'').trim().toUpperCase()
        .replace(/İ/g,'I').replace(/Ğ/g,'G').replace(/Ü/g,'U')
        .replace(/Ş/g,'S').replace(/Ö/g,'O').replace(/Ç/g,'C');
    };
    var role = norm(u.role||u.yetki||u.userRole||'');
    var type = norm(u.type||u.kullaniciTipi||'');
    return role==='ADMIN'||role==='YONETICI'||type==='ADMIN'||u.isAdmin===true||u.admin===true;
  }

  if (!user || !_isAdmin(user)) {
    document.body.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f0f4f8">' +
      '<div style="background:#fff;border-radius:12px;padding:48px 40px;text-align:center;max-width:380px;box-shadow:0 4px 20px rgba(0,0,0,.1)">' +
      '<div style="font-size:48px;margin-bottom:16px">🔒</div>' +
      '<h2 style="margin:0 0 8px;font-family:Inter,sans-serif;color:#1a202c">Erişim Kısıtlı</h2>' +
      '<p style="color:#718096;font-family:Inter,sans-serif;margin-bottom:24px">Bu sayfa yalnızca <strong>admin</strong> kullanıcılarına açıktır.</p>' +
      '<a href="anasayfa.html" style="display:inline-block;padding:10px 24px;background:#2c5282;color:#fff;border-radius:7px;text-decoration:none;font-weight:600">Ana Sayfaya Dön</a>' +
      '</div></div>';
    return;
  }

  State.user = user;
  document.getElementById('appShell').hidden = false;

  var name = ((user.firstName||'') + ' ' + (user.lastName||'')).trim() || user.email || 'Admin';
  setEl('userNameDisplay',        name);
  setEl('sidebarUserNameDisplay', name);

  // Tarih varsayılanları
  var now = new Date(), y = now.getFullYear(), m = now.getMonth() + 1;
  setVal('reportMonth',      m);
  setVal('reportYear',       y);
  setVal('reportStartDate',  y + '-' + pad2(m) + '-01');
  setVal('reportEndDate',    isoDate(now));
  setVal('baglantiTarihInput', isoDate(new Date(now.getTime() - 86400000)));

  bindEvents();
  renderHistory();
});


// ─── MALİYET GİRİŞ MODALI ─────────────────────────────────────────────────────

var KM_MODAL = {
  overlay : null,
  saving  : false,

  init: function () {
    this.overlay = document.getElementById('maliyetGirisModal');
    if (!this.overlay) return;

    on('maliyetGirisBtn',   'click',  function () { KM_MODAL.ac(); });
    on('maliyetModalKapat', 'click',  function () { KM_MODAL.kapat(); });
    on('kmIptalBtn',        'click',  function () { KM_MODAL.kapat(); });
    on('kmKaydetBtn',       'click',  function () { KM_MODAL.kaydet(); });

    // Overlay'e (backdrop) tıklanınca kapat
    this.overlay.addEventListener('click', function (e) {
      if (e.target === KM_MODAL.overlay) KM_MODAL.kapat();
    });

    // Escape tuşu
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !KM_MODAL.overlay.hidden) KM_MODAL.kapat();
    });

    // Bileşenler değişince birim maliyeti otomatik hesapla
    ['kmKojenMaliyet','kmYekdem','kmDagitim','kmVtcGider','kmGucBedeli'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', function () { KM_MODAL.autoHesapla(); });
    });
  },

  /** Modalı açar ve dönem değerlerini rapor filtresinden doldurur */
  ac: function () {
    // Rapor filtresinden mevcut ay/yıl değerlerini al
    var ay  = getVal('reportMonth')  || (new Date().getMonth() + 1);
    var yil = getVal('reportYear')   || new Date().getFullYear();
    setVal('kmAy',  ay);
    setVal('kmYil', yil);

    // Eğer rapor verisi varsa maliyet bileşenlerini prefill et
    if (State.reportData && State.reportData.maliyet) {
      var m = State.reportData.maliyet;
      setVal('kmKojenMaliyet', m.kojenMaliyet || '');
      setVal('kmYekdem',       m.yekdem       || '');
      setVal('kmDagitim',      m.dagitim      || '');
      setVal('kmVtcGider',     m.vtcGider     || '');
      setVal('kmGucBedeli',    m.gucBedeli    || '');
    } else {
      ['kmKojenMaliyet','kmYekdem','kmDagitim','kmVtcGider','kmGucBedeli','kmNot'].forEach(function (id) {
        setVal(id, '');
      });
    }

    this.autoHesapla();
    this.noticeGizle();
    this.overlay.hidden = false;
    // İlk input'a odaklan
    var ilk = document.getElementById('kmBirimMaliyet');
    if (ilk) setTimeout(function () { ilk.focus(); ilk.select(); }, 80);
  },

  kapat: function () {
    if (this.saving) return;
    this.overlay.hidden = true;
    this.noticeGizle();
  },

  /** Bakım + Arıza + Doğalgaz − Buhar → birim maliyet otomatik ipucu */
  autoHesapla: function () {
    var b  = parseFloat(getVal('kmBakim'))    || 0;
    var a  = parseFloat(getVal('kmAriza'))    || 0;
    var d  = parseFloat(getVal('kmDogalgaz')) || 0;
    var bh = parseFloat(getVal('kmBuhar'))    || 0;
    var net = b + a + d - bh;

    var hintEl = document.getElementById('kmAutoHint');
    var valEl  = document.getElementById('kmAutoVal');
    if (!hintEl || !valEl) return;

    if (b || a || d || bh) {
      valEl.textContent = net.toFixed(5) + ' TL/kWh';
      hintEl.hidden = false;
    } else {
      hintEl.hidden = true;
    }
  },

  noticeCal: function (msg, tip) {
    var el = document.getElementById('kmModalNotice');
    if (!el) return;
    el.className = 'km-notice ' + (tip || '');
    el.textContent = msg;
    el.hidden = false;
  },
  noticeGizle: function () {
    var el = document.getElementById('kmModalNotice');
    if (el) { el.hidden = true; el.className = 'km-notice'; }
  },

  setSaving: function (durum) {
    this.saving = durum;
    var btn = document.getElementById('kmKaydetBtn');
    if (!btn) return;
    btn.disabled = durum;
    btn.innerHTML = durum
      ? '<span class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px"></span>Kaydediliyor...'
      : '<svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg> Kaydet';
  },

  /** Formu doğrular, GAS'a gönderir */
  kaydet: async function () {
    if (this.saving) return;
    this.noticeGizle();

    var ay   = parseInt(getVal('kmAy'),  10);
    var yil  = parseInt(getVal('kmYil'), 10);

    // Zorunlu alan kontrolü
    if (!ay || !yil) {
      this.noticeCal('Ay ve yıl alanları zorunludur.', 'error');
      return;
    }

    var payload = {
      action      : 'maliyetBedeliKaydet',
      ay          : ay,
      yil         : yil,
      kojenMaliyet: getVal('kmKojenMaliyet').trim() || '0',
      yekdem      : getVal('kmYekdem').trim()       || '0',
      dagitim     : getVal('kmDagitim').trim()      || '0',
      vtcGider    : getVal('kmVtcGider').trim()     || '0',
      gucBedeli   : getVal('kmGucBedeli').trim()    || '0',
      not         : getVal('kmNot').trim(),
      kaydedenKullanici: (State.user && (State.user.email || State.user.firstName)) || 'admin'
    };

    this.setSaving(true);

    try {
      if (!KMR_URL) {
        // Demo mod — URL yoksa simüle et
        await new Promise(function (r) { setTimeout(r, 800); });
        KM_MODAL._kaydetBasarili(payload);
        return;
      }

      var params = new URLSearchParams(payload);
      var res    = await fetch(KMR_URL + '?' + params.toString());
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var json = await res.json();
      if (!json.success) throw new Error(json.error || 'Sunucu hatası');

      KM_MODAL._kaydetBasarili(payload);

    } catch (err) {
      this.noticeCal('Kayıt hatası: ' + err.message, 'error');
    } finally {
      this.setSaving(false);
    }
  },

  _kaydetBasarili: function (payload) {
    var AYLAR = ['','Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                 'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
    var donem = AYLAR[payload.ay] + ' ' + payload.yil;

    this.noticeCal(
      '✓ ' + donem + ' dönemi maliyet bilgileri kaydedildi.',
      'success'
    );
    showToast(donem + ' maliyet bedeli kaydedildi', 'success');

    // Rapor verisini güncelle (canlı KPI yansıması)
    if (State.reportData && State.reportData.maliyet) {
      State.reportData.maliyet.kojenMaliyet = payload.kojenMaliyet;
      State.reportData.maliyet.yekdem       = payload.yekdem;
      State.reportData.maliyet.dagitim      = payload.dagitim;
      State.reportData.maliyet.vtcGider     = payload.vtcGider;
      State.reportData.maliyet.gucBedeli    = payload.gucBedeli;
      renderCostBreakdown(State.reportData.maliyet);
      renderKpis(State.reportData);
    }

    // 2 saniye sonra modalı kapat
    setTimeout(function () { KM_MODAL.kapat(); }, 2000);
  }
};

// ─── MODAL INIT — DOMContentLoaded'e bağla ───────────────────────────────────
// Mevcut DOMContentLoaded bloğunun sonundaki bindEvents() çağrısının ardından
// KM_MODAL.init() otomatik çağrılır; bunun için dosya sonuna ayrı bir listener ekliyoruz.
document.addEventListener('DOMContentLoaded', function () {
  KM_MODAL.init();
});
