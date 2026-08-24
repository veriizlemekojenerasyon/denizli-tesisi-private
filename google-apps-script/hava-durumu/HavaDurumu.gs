/**
 * Hava Durumu API Servisi
 * OpenWeatherMap kullanarak Denizli/Honaz hava durumu
 */

// ⚙️ YAPLANDIRMA
const HAVA_CONFIG = {
  API_KEY: '7fdc707d3c40c2fc9ef88153e9c77184', // openweathermap.org'dan alın
  SEHIR: 'Honaz,TR',
  LAT: 37.75,
  LON: 29.26,
  DIL: 'tr',
  CACHE_SURESI: 30 // dakika (gereksiz API çağrılarını önler)
};

/**
 * Güncel hava durumu verilerini çeker
 */
function getHavaDurumu() {
  try {
    // Cache kontrol (30 dk içinde tekrar çağrılırsa cache'den döner)
    const cache = CacheService.getScriptCache();
    const cachedData = cache.get('hava_durumu');
    
    if (cachedData) {
      Logger.log('Cache\'den döndü');
      return JSON.parse(cachedData);
    }

    // API çağrısı
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${HAVA_CONFIG.LAT}&lon=${HAVA_CONFIG.LON}&appid=${HAVA_CONFIG.API_KEY}&lang=${HAVA_CONFIG.DIL}&units=metric`;
    
    const response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() !== 200) {
      throw new Error('API hatası: ' + response.getContentText());
    }
    
    const data = JSON.parse(response.getContentText());
    
    // Türkçe formatlanmış veri
    const havaDurumu = {
      sehir: data.name,
      sicaklik: Math.round(data.main.temp),
      hissedilen: Math.round(data.main.feels_like),
      durum: data.weather[0].description,
      durumKodu: data.weather[0].id,
      icon: data.weather[0].icon,
      nem: data.main.humidity,
      ruzgar: Math.round(data.wind.speed * 3.6), // m/s -> km/h
      basinc: data.main.pressure,
      guncellemeSaati: new Date().toLocaleString('tr-TR'),
      timestamp: new Date().getTime()
    };
    
    // Cache'e kaydet (30 dakika)
    cache.put('hava_durumu', JSON.stringify(havaDurumu), HAVA_CONFIG.CACHE_SURESI * 60);
    
    return havaDurumu;
    
  } catch (error) {
    Logger.log('Hata: ' + error.message);
    return {
      hata: true,
      mesaj: 'Hava durumu alınamadı: ' + error.message
    };
  }
}

/**
 * 5 günlük tahmin
 */
function getHavaTahmini() {
  try {
    const cache = CacheService.getScriptCache();
    const cachedData = cache.get('hava_tahmini');
    
    if (cachedData) {
      return JSON.parse(cachedData);
    }

    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${HAVA_CONFIG.LAT}&lon=${HAVA_CONFIG.LON}&appid=${HAVA_CONFIG.API_KEY}&lang=${HAVA_CONFIG.DIL}&units=metric&cnt=16`;
    
    const response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() !== 200) {
      throw new Error('API hatası');
    }
    
    const data = JSON.parse(response.getContentText());
    
    // Günlük özet çıkar (her 8 saatte 1)
    const gunlukTahmin = [];
    for (let i = 0; i < data.list.length; i += 8) {
      const gun = data.list[i];
      gunlukTahmin.push({
        tarih: new Date(gun.dt * 1000).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' }),
        sicaklik: Math.round(gun.main.temp),
        durum: gun.weather[0].description,
        icon: gun.weather[0].icon,
        nem: gun.main.humidity
      });
    }
    
    cache.put('hava_tahmini', JSON.stringify(gunlukTahmin), 180); // 3 saat cache
    
    return gunlukTahmin;
    
  } catch (error) {
    Logger.log('Tahmin hatası: ' + error.message);
    return [];
  }
}

/**
 * Web uygulaması için endpoint
 */
function doGet(e) {
  const action = e.parameter.action || 'guncel';
  
  let data;
  if (action === 'tahmin') {
    data = getHavaTahmini();
  } else {
    data = getHavaDurumu();
  }
  
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Manuel test fonksiyonu
 */
function testHavaDurumu() {
  const hava = getHavaDurumu();
  Logger.log('Şehir: ' + hava.sehir);
  Logger.log('Sıcaklık: ' + hava.sicaklik + '°C');
  Logger.log('Durum: ' + hava.durum);
  Logger.log('Nem: %' + hava.nem);
  Logger.log('Rüzgar: ' + hava.ruzgar + ' km/h');
}
