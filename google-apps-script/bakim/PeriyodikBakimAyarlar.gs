/**
 * Periyodik Bakım Ayarları - API Endpoint
 * Ayarlar sayfasından GM1, GM2, GM3 için periyodik bakım kalan saat verilerini çeker
 */

function doGet(e) {
  const action = e.parameter.action;
  
  try {
    switch(action) {
      case 'getPeriyodikBakimData':
        return getPeriyodikBakimData();
      case 'getMotorDetailData':
        return getMotorDetailData(e);
      default:
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: 'Geçersiz işlem'
        })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Ayarlar sayfasından periyodik bakım verilerini çeker
 */
function getPeriyodikBakimData() {
  try {
    const ss = SpreadsheetApp.openById('1g6ibbyoc8NmK788oqyxg2EJJGRfRrnPIuULvCRNaEjU');
    const ayarlarSheet = ss.getSheetByName('Ayarlar');
    
    if (!ayarlarSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Ayarlar sayfası bulunamadı'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Motor verilerini bul - Direkt hücre konumlarından oku
    const motorData = {
      gm1: {
        bakimaKalanSaat: parseFloat(ayarlarSheet.getRange('J7').getDisplayValue()) || 0,
        greslemeKalanSaat: parseFloat(ayarlarSheet.getRange('H15').getDisplayValue()) || 0,
        numuneKalanSaat: parseFloat(ayarlarSheet.getRange('H23').getDisplayValue()) || 0
      },
      gm2: {
        bakimaKalanSaat: parseFloat(ayarlarSheet.getRange('J8').getDisplayValue()) || 0,
        greslemeKalanSaat: parseFloat(ayarlarSheet.getRange('H16').getDisplayValue()) || 0,
        numuneKalanSaat: parseFloat(ayarlarSheet.getRange('H24').getDisplayValue()) || 0
      },
      gm3: {
        bakimaKalanSaat: parseFloat(ayarlarSheet.getRange('J9').getDisplayValue()) || 0,
        greslemeKalanSaat: parseFloat(ayarlarSheet.getRange('H17').getDisplayValue()) || 0,
        numuneKalanSaat: parseFloat(ayarlarSheet.getRange('H25').getDisplayValue()) || 0
      }
    };
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      data: motorData,
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log('Periyodik bakım verisi alınamadı: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Motor bazlı detaylı bakım bilgilerini çeker
 */
function getMotorDetailData(e) {
  try {
    const motorId = e.parameter.motorId; // gm1, gm2, gm3
    
    if (!motorId) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Motor ID gerekli'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const ss = SpreadsheetApp.openById('1g6ibbyoc8NmK788oqyxg2EJJGRfRrnPIuULvCRNaEjU');
    const ayarlarSheet = ss.getSheetByName('Ayarlar');
    
    if (!ayarlarSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Ayarlar sayfası bulunamadı'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Motor numarasını belirle (1, 2, 3)
    const motorNum = motorId.replace('gm', '');
    const rowOffset = parseInt(motorNum) - 1; // 0, 1, 2
    
    // Hücre satırlarını hesapla - VERİLER SATIR 2'DEN BAŞLIYOR!
    const guncelCalismaSaatiRow = 2 + rowOffset; // 2, 3, 4
    const periyodikBakimRow = 7 + rowOffset; // 7, 8, 9
    const greslemeRow = 15 + rowOffset; // 15, 16, 17
    const numuneRow = 23 + rowOffset; // 23, 24, 25
    
    // Verileri oku - getDisplayValue() kullanarak formüllerin sonucunu al
    const motorData = {
      motor: 'GM-' + motorNum,
      
      // Güncel çalışma saati bilgileri (Satır 2-4, D=motor, E=saat, F=kaynak, G=güncelleme, H=not)
      guncelCalismaSaati: {
        saat: parseFloat(ayarlarSheet.getRange('E' + guncelCalismaSaatiRow).getDisplayValue()) || 0,
        kaynak: String(ayarlarSheet.getRange('F' + guncelCalismaSaatiRow).getValue() || 'Enerji Spreadsheet'),
        sonGuncelleme: String(ayarlarSheet.getRange('G' + guncelCalismaSaatiRow).getValue() || ''),
        not: String(ayarlarSheet.getRange('H' + guncelCalismaSaatiRow).getValue() || '')
      },
      
      // Periyodik bakım bilgileri (Satır 7-9, D=motor, E-J=veriler)
      periyodikBakim: {
        guncelMotorSaati: parseFloat(ayarlarSheet.getRange('E' + periyodikBakimRow).getDisplayValue()) || 0,
        sonPeriyodikEsik: parseFloat(ayarlarSheet.getRange('F' + periyodikBakimRow).getDisplayValue()) || 0,
        sonBakimTipi: String(ayarlarSheet.getRange('G' + periyodikBakimRow).getValue() || ''),
        sonrakiPeriyodikEsik: parseFloat(ayarlarSheet.getRange('H' + periyodikBakimRow).getDisplayValue()) || 0,
        sonrakiBakimTipi: String(ayarlarSheet.getRange('I' + periyodikBakimRow).getValue() || ''),
        bakimaKalanSaat: parseFloat(ayarlarSheet.getRange('J' + periyodikBakimRow).getDisplayValue()) || 0,
        durum: String(ayarlarSheet.getRange('K' + periyodikBakimRow).getValue() || 'Normal')
      },
      
      // Gresleme bilgileri (Satır 15-17, D=motor, E-H=veriler)
      gresleme: {
        sonAlternatorGreslemeSaati: parseFloat(ayarlarSheet.getRange('E' + greslemeRow).getDisplayValue()) || 0,
        guncelMotorSaati: parseFloat(ayarlarSheet.getRange('F' + greslemeRow).getDisplayValue()) || 0,
        sonrakiGreslemeSaati: parseFloat(ayarlarSheet.getRange('G' + greslemeRow).getDisplayValue()) || 0,
        greslemeKalanSaat: parseFloat(ayarlarSheet.getRange('H' + greslemeRow).getDisplayValue()) || 0,
        durum: String(ayarlarSheet.getRange('I' + greslemeRow).getValue() || 'Normal')
      },
      
      // Yağ numune bilgileri (Satır 23-25, D=motor, E-H=veriler)
      yagNumune: {
        sonYagNumuneSaati: parseFloat(ayarlarSheet.getRange('E' + numuneRow).getDisplayValue()) || 0,
        guncelMotorSaati: parseFloat(ayarlarSheet.getRange('F' + numuneRow).getDisplayValue()) || 0,
        sonrakiNumuneSaati: parseFloat(ayarlarSheet.getRange('G' + numuneRow).getDisplayValue()) || 0,
        numuneKalanSaat: parseFloat(ayarlarSheet.getRange('H' + numuneRow).getDisplayValue()) || 0,
        durum: String(ayarlarSheet.getRange('I' + numuneRow).getValue() || 'Normal')
      }
    };
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      data: motorData,
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log('Motor detay verisi alınamadı: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
