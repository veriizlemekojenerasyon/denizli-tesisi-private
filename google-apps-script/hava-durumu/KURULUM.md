# 🌤️ Hava Durumu Sistemi Kurulum Rehberi

## 📋 Adım 1: OpenWeatherMap API Key Alma (2 dakika)

1. **openweathermap.org/api** sitesine gidin
2. **Sign Up** (Üye Ol) butonuna tıklayın
3. Formu doldurun ve hesap oluşturun
4. Email'inizi doğrulayın
5. **API Keys** bölümünden API key'inizi kopyalayın

> ✅ **Ücretsiz Plan:** Günde 1,000 çağrı (bizim için fazlasıyla yeter)

---

## 📋 Adım 2: Google Apps Script Kurulumu (3 dakika)

### 2.1. Script Projesini Oluşturun

1. Google Drive'a gidin
2. **Yeni** → **Diğer** → **Google Apps Script**
3. Proje adını **"Hava Durumu API"** olarak değiştirin

### 2.2. Kodu Yapıştırın

1. `Code.gs` dosyasını açın
2. `google-apps-script/hava-durumu/HavaDurumu.gs` dosyasının içeriğini kopyalayıp yapıştırın
3. **4. satırdaki** `API_KEY` değerini değiştirin:

```javascript
API_KEY: 'SİZİN_API_KEY_BURASİ'
```

### 2.3. Web Uygulaması Olarak Yayınlayın

1. Sağ üstteki **Deploy** (Dağıt) → **New deployment** (Yeni dağıtım)
2. ⚙️ **Select type** → **Web app** seçin
3. Ayarlar:
   - **Description:** Hava Durumu API v1
   - **Execute as:** Me
   - **Who has access:** Anyone (Herkes)
4. **Deploy** butonuna tıklayın
5. **Web app URL'ini KOPYALAYIN** (çok önemli!)

> 📌 URL şuna benzer: `https://script.google.com/macros/s/AKfycby.../exec`

---

## 📋 Adım 3: HTML Sayfası Kurulumu (1 dakika)

1. `hava-durumu.html` dosyasını açın
2. **17. satırda** GAS URL'sini yapıştırın:

```javascript
const GAS_URL = 'BURAYA_KOPYALADIGINIZ_URL';
```

3. Dosyayı kaydedin

---

## 🎯 Adım 4: Test Edin

### Google Apps Script'te Test

1. Apps Script editöründe `testHavaDurumu` fonksiyonunu seçin
2. **▶ Run** butonuna tıklayın
3. İlk çalıştırmada **Review Permissions** diyecek → **Allow** verin
4. **Execution log** kısmında şunları göreceksiniz:
   ```
   Şehir: Honaz
   Sıcaklık: 18°C
   Durum: açık
   Nem: %65
   Rüzgar: 12 km/h
   ```

### Web Sayfasında Test

1. `hava-durumu.html` dosyasını tarayıcıda açın
2. Honaz hava durumunu görmelisiniz 🎉

---

## 🔧 Sorun Giderme

### ❌ "Hava durumu alınamadı" hatası

**Neden:** API key yanlış veya eksik

**Çözüm:**
1. `HavaDurumu.gs` dosyasında API_KEY'i kontrol edin
2. OpenWeatherMap'te API key'in aktif olduğunu doğrulayın
3. 10 dakika bekleyin (yeni key'ler aktif olmak için süre ister)

### ❌ "CORS hatası" (tarayıcı konsolunda)

**Neden:** Google Apps Script URL'si yanlış

**Çözüm:**
1. Apps Script'te **Deploy** → **Manage deployments**
2. URL'yi tekrar kopyalayın
3. `hava-durumu.html` içindeki `GAS_URL`'i güncelleyin

### ❌ Sayfa boş görünüyor

**Neden:** JavaScript hatası

**Çözüm:**
1. Tarayıcıda **F12** basın → **Console** sekmesini açın
2. Kırmızı hataları kontrol edin
3. URL'nin doğru yapıştırıldığını kontrol edin

---

## 🎨 Anasayfanıza Ekleme

### Widget Olarak Eklemek İsterseniz

`anasayfa.html` dosyanıza şunu ekleyin:

```html
<!-- Hava Durumu Widget -->
<div class="weather-widget">
    <iframe src="hava-durumu.html" width="100%" height="600" frameborder="0"></iframe>
</div>
```

### Küçük Kart Olarak İsterseniz

CSS ile boyutlandırabilirsiniz:

```css
.weather-widget {
    max-width: 400px;
    margin: 20px auto;
}
```

---

## 📊 Özellikler

✅ **Güncel Hava Durumu:**
- Sıcaklık (°C)
- Hissedilen sıcaklık
- Hava durumu açıklaması (Türkçe)
- Nem oranı
- Rüzgar hızı
- Basınç

✅ **5 Günlük Tahmin**

✅ **Otomatik Yenileme** (30 dakikada bir)

✅ **Cache Sistemi** (gereksiz API çağrılarını önler)

✅ **Responsive Tasarım** (mobil uyumlu)

---

## 🔐 Güvenlik

✅ API key Google Apps Script içinde saklanır (HTML'de görünmez)

✅ CORS problemi yok (Google Apps Script proxy görevi görür)

✅ Rate limit koruması (cache ile)

---

## 📞 Destek

Sorun yaşarsanız:
1. `testHavaDurumu()` fonksiyonunu çalıştırın
2. Execution log'u kontrol edin
3. Hata mesajını paylaşın

---

## 🚀 İleri Seviye (Opsiyonel)

### Farklı Şehir Eklemek

`HAVA_CONFIG` içinde koordinatları değiştirin:

```javascript
LAT: 37.75,  // Kuzey-Güney
LON: 29.26,  // Doğu-Batı
```

### Otomatik Güncelleme (Her 30 Dakikada)

Apps Script'te:
1. ⏰ **Triggers** → **Add Trigger**
2. Function: `getHavaDurumu`
3. Time based: Every 30 minutes

### Veritabanına Kaydetmek

Google Sheets'e log atmak için:

```javascript
function kaydetHavaDurumu() {
  const hava = getHavaDurumu();
  const sheet = SpreadsheetApp.openById('SHEET_ID').getSheetByName('Hava');
  sheet.appendRow([
    new Date(),
    hava.sicaklik,
    hava.nem,
    hava.durum
  ]);
}
```

---

**🎉 Kurulum tamamlandı! Artık sisteminizde canlı hava durumu var.**
