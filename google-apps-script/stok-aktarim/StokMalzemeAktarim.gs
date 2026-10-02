/**
 * STOK MALZEME AKTARIM SİSTEMİ
 * Kaynak spreadsheet'teki StokMalzemeler sayfasını hedef spreadsheet'e aktarır
 */

// Konfigürasyon
const KAYNAK_SPREADSHEET_ID = '1ncEnE6vG76HIXFzJRRWz2yehiN2oolg4t2pzfbKt2vI';
const HEDEF_SPREADSHEET_ID = '1ZxriRyYX5lrgQwlaKXt2fNS_x49Tx5pXFq4Mb9JgFo8';

// Aktarılacak sayfalar
const AKTARILACAK_SAYFALAR = [
  'StokMalzemeler',
  'StokIslemleri'
];

/**
 * Ana aktarım fonksiyonu - tüm stok sayfalarını aktarır
 */
function tumStokSayfalariniAktar() {
  const sonuc = {
    baslangic: new Date().toISOString(),
    basarili: [],
    basarisiz: [],
    toplamKayit: 0
  };
  
  try {
    const kaynakSpreadsheet = SpreadsheetApp.openById(KAYNAK_SPREADSHEET_ID);
    const hedefSpreadsheet = SpreadsheetApp.openById(HEDEF_SPREADSHEET_ID);
    
    console.log('Kaynak spreadsheet:', kaynakSpreadsheet.getName());
    console.log('Hedef spreadsheet:', hedefSpreadsheet.getName());
    
    for (const sayfaAdi of AKTARILACAK_SAYFALAR) {
      try {
        const sayfaSonuc = sayfaAktar(kaynakSpreadsheet, hedefSpreadsheet, sayfaAdi);
        
        if (sayfaSonuc.basarili) {
          sonuc.basarili.push({
            sayfa: sayfaAdi,
            kayitSayisi: sayfaSonuc.kayitSayisi
          });
          sonuc.toplamKayit += sayfaSonuc.kayitSayisi;
        } else {
          sonuc.basarisiz.push({
            sayfa: sayfaAdi,
            hata: sayfaSonuc.hata
          });
        }
      } catch (error) {
        sonuc.basarisiz.push({
          sayfa: sayfaAdi,
          hata: error.toString()
        });
      }
    }
    
    sonuc.bitis = new Date().toISOString();
    sonuc.durum = 'TAMAMLANDI';
    
    console.log('Aktarım sonucu:', JSON.stringify(sonuc, null, 2));
    return sonuc;
    
  } catch (error) {
    sonuc.bitis = new Date().toISOString();
    sonuc.durum = 'HATA';
    sonuc.genelHata = error.toString();
    console.error('Genel aktarım hatası:', error);
    return sonuc;
  }
}

/**
 * Tek bir sayfayı aktarır (eski sürüm uyumluluğu için)
 */
function stokMalzemeleriAktar() {
  return tekSayfaAktar('StokMalzemeler');
}

/**
 * Tek bir sayfayı aktarır
 */
function sayfaAktar(kaynakSpreadsheet, hedefSpreadsheet, sayfaAdi) {
  const sonuc = {
    sayfa: sayfaAdi,
    basarili: false,
    kayitSayisi: 0,
    hata: null
  };
  
  try {
    // Kaynak sayfayı al
    const kaynakSayfa = kaynakSpreadsheet.getSheetByName(sayfaAdi);
    if (!kaynakSayfa) {
      sonuc.hata = 'Kaynak sayfa bulunamadı: ' + sayfaAdi;
      return sonuc;
    }
    
    // Hedef sayfayı kontrol et veya oluştur
    let hedefSayfa = hedefSpreadsheet.getSheetByName(sayfaAdi);
    if (!hedefSayfa) {
      hedefSayfa = hedefSpreadsheet.insertSheet(sayfaAdi);
      console.log('Yeni sayfa oluşturuldu:', sayfaAdi);
    }
    
    // Veri aralığını al
    const sonSatir = kaynakSayfa.getLastRow();
    const sonSutun = kaynakSayfa.getLastColumn();
    
    if (sonSatir < 1) {
      sonuc.hata = 'Kaynak sayfa boş: ' + sayfaAdi;
      return sonuc;
    }
    
    // Tüm verileri al
    const veriAraligi = kaynakSayfa.getRange(1, 1, sonSatir, sonSutun);
    const degerler = veriAraligi.getValues();
    
    // Hedef sayfayı temizle
    if (hedefSayfa.getLastRow() > 0) {
      hedefSayfa.clear();
    }
    
    // Verileri hedef sayfaya yaz
    if (degerler.length > 0) {
      hedefSayfa.getRange(1, 1, degerler.length, degerler[0].length).setValues(degerler);
      
      // Formatlamaları kopyala
      formatlamaKopyala(kaynakSayfa, hedefSayfa, sonSatir, sonSutun);
    }
    
    sonuc.basarili = true;
    sonuc.kayitSayisi = sonSatir;
    console.log(sayfaAdi + ' aktarıldı:', sonSatir, 'satır');
    
    return sonuc;
    
  } catch (error) {
    sonuc.hata = error.toString();
    console.error(sayfaAdi + ' aktarım hatası:', error);
    return sonuc;
  }
}

/**
 * Formatlamaları kopyalar
 */
function formatlamaKopyala(kaynakSayfa, hedefSayfa, satirSayisi, sutunSayisi) {
  try {
    // Hücre formatları
    const kaynakAralik = kaynakSayfa.getRange(1, 1, satirSayisi, sutunSayisi);
    const hedefAralik = hedefSayfa.getRange(1, 1, satirSayisi, sutunSayisi);
    
    // Number formatları
    const numberFormats = kaynakAralik.getNumberFormats();
    hedefAralik.setNumberFormats(numberFormats);
    
    // Font formatları
    const fontWeights = kaynakAralik.getFontWeights();
    hedefAralik.setFontWeights(fontWeights);
    
    const fontColors = kaynakAralik.getFontColors();
    hedefAralik.setFontColors(fontColors);
    
    const fontSizes = kaynakAralik.getFontSizes();
    hedefAralik.setFontSizes(fontSizes);
    
    // Arka plan renkleri
    const backgrounds = kaynakAralik.getBackgrounds();
    hedefAralik.setBackgrounds(backgrounds);
    
    // Hizalamalar
    const horizontalAlignments = kaynakAralik.getHorizontalAlignments();
    hedefAralik.setHorizontalAlignments(horizontalAlignments);
    
    const verticalAlignments = kaynakAralik.getVerticalAlignments();
    hedefAralik.setVerticalAlignments(verticalAlignments);
    
    // Kenarlıklar (try-catch ile, bazı aralıklarda hata verebiliyor)
    try {
      const borders = kaynakAralik.getBorders();
      hedefAralik.setBorders(borders);
    } catch (borderError) {
      console.warn('Kenarlık kopyalama atlandı:', borderError.toString());
    }
    
    // Sütun genişlikleri
    for (let i = 1; i <= sutunSayisi; i++) {
      const genislik = kaynakSayfa.getColumnWidth(i);
      hedefSayfa.setColumnWidth(i, genislik);
    }
    
    console.log('Formatlamalar kopyalandı');
    
  } catch (error) {
    console.error('Formatlama kopyalama hatası:', error);
  }
}

/**
 * Belirli bir sayfayı aktarır
 */
function tekSayfaAktar(sayfaAdi) {
  if (!AKTARILACAK_SAYFALAR.includes(sayfaAdi)) {
    return {
      basarili: false,
      hata: 'Bu sayfa aktarım listesinde yok: ' + sayfaAdi
    };
  }
  
  try {
    const kaynakSpreadsheet = SpreadsheetApp.openById(KAYNAK_SPREADSHEET_ID);
    const hedefSpreadsheet = SpreadsheetApp.openById(HEDEF_SPREADSHEET_ID);
    
    const sonuc = sayfaAktar(kaynakSpreadsheet, hedefSpreadsheet, sayfaAdi);
    return sonuc;
    
  } catch (error) {
    return {
      basarili: false,
      hata: error.toString()
    };
  }
}

/**
 * Kaynak spreadsheet'teki sayfaları listeler
 */
function kaynakSayfalariListele() {
  try {
    const kaynakSpreadsheet = SpreadsheetApp.openById(KAYNAK_SPREADSHEET_ID);
    const sayfalar = kaynakSpreadsheet.getSheets();
    
    const sayfaListesi = sayfalar.map(sayfa => ({
      ad: sayfa.getName(),
      satirSayisi: sayfa.getLastRow(),
      sutunSayisi: sayfa.getLastColumn()
    }));
    
    return {
      basarili: true,
      spreadsheet: kaynakSpreadsheet.getName(),
      sayfalar: sayfaListesi
    };
    
  } catch (error) {
    return {
      basarili: false,
      hata: error.toString()
    };
  }
}

/**
 * Hedef spreadsheet'teki sayfaları listeler
 */
function hedefSayfalariListele() {
  try {
    const hedefSpreadsheet = SpreadsheetApp.openById(HEDEF_SPREADSHEET_ID);
    const sayfalar = hedefSpreadsheet.getSheets();
    
    const sayfaListesi = sayfalar.map(sayfa => ({
      ad: sayfa.getName(),
      satirSayisi: sayfa.getLastRow(),
      sutunSayisi: sayfa.getLastColumn()
    }));
    
    return {
      basarili: true,
      spreadsheet: hedefSpreadsheet.getName(),
      sayfalar: sayfaListesi
    };
    
  } catch (error) {
    return {
      basarili: false,
      hata: error.toString()
    };
  }
}

/**
 * Aktarım öncesi kontrol yapar
 */
function aktarimKontrol() {
  const sonuc = {
    kaynak: null,
    hedef: null,
    aktarilacakSayfalar: AKTARILACAK_SAYFALAR,
    kontrolSonucu: []
  };
  
  // Kaynak kontrol
  const kaynakSonuc = kaynakSayfalariListele();
  sonuc.kaynak = kaynakSonuc;
  
  // Hedef kontrol
  const hedefSonuc = hedefSayfalariListele();
  sonuc.hedef = hedefSonuc;
  
  // Her sayfa için kontrol
  for (const sayfaAdi of AKTARILACAK_SAYFALAR) {
    const kontrol = {
      sayfa: sayfaAdi,
      kaynakVar: false,
      hedefVar: false,
      kaynakKayit: 0,
      hedefKayit: 0
    };
    
    if (kaynakSonuc.basarili) {
      const kaynakSayfa = kaynakSonuc.sayfalar.find(s => s.ad === sayfaAdi);
      if (kaynakSayfa) {
        kontrol.kaynakVar = true;
        kontrol.kaynakKayit = kaynakSayfa.satirSayisi;
      }
    }
    
    if (hedefSonuc.basarili) {
      const hedefSayfa = hedefSonuc.sayfalar.find(s => s.ad === sayfaAdi);
      if (hedefSayfa) {
        kontrol.hedefVar = true;
        kontrol.hedefKayit = hedefSayfa.satirSayisi;
      }
    }
    
    sonuc.kontrolSonucu.push(kontrol);
  }
  
  return sonuc;
}

/**
 * Web app için ana fonksiyon
 */
function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action || 'aktarimKontrol';
  
  let result;
  
  switch (action) {
    case 'tumAktar':
      result = tumStokSayfalariniAktar();
      break;
    case 'tekSayfa':
      result = tekSayfaAktar(params.sayfa);
      break;
    case 'kaynakListele':
      result = kaynakSayfalariListele();
      break;
    case 'hedefListele':
      result = hedefSayfalariListele();
      break;
    case 'aktarimKontrol':
    default:
      result = aktarimKontrol();
      break;
  }
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}