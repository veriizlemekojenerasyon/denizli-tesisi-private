# Periyodik Bakım - Ana Sayfa Entegrasyonu

## Kurulum Adımları

### 1. Google Apps Script Deployment

1. `PeriyodikBakimAyarlar.gs` dosyasını Google Apps Script'e yükleyin
2. Script'i deploy edin:
   - **Deploy** > **New deployment** seçin
   - **Type**: Web app
   - **Execute as**: Me
   - **Who has access**: Anyone (veya projenize uygun erişim seviyesi)
   - **Deploy** butonuna tıklayın
3. Deployment URL'ini kopyalayın (örnek: `https://script.google.com/macros/s/ABC.../exec`)

### 2. Frontend Konfigürasyonu

1. `js/app-config.js` dosyasını açın
2. `SCRIPT_URLS` objesindeki `periyodikBakim` satırını bulun:
   ```javascript
   periyodikBakim: 'BURAYA_GOOGLE_APPS_SCRIPT_DEPLOYMENT_URL_GELECEK',
   ```
3. `BURAYA_GOOGLE_APPS_SCRIPT_DEPLOYMENT_URL_GELECEK` yerine yukarıdaki adımda kopyaladığınız URL'i yapıştırın:
   ```javascript
   periyodikBakim: 'https://script.google.com/macros/s/ABC.../exec',
   ```

### 3. Google Sheets Yapısı

Script, aşağıdaki Google Sheets'i kullanır:
- **Spreadsheet ID**: `1g6ibbyoc8NmK788oqyxg2EJJGRfRrnPIuULvCRNaEjU`
- **Sayfa Adı**: `Ayarlar`

#### Beklenen Veri Yapısı

Ayarlar sayfasında aşağıdaki satırlar aranır:

| A Sütunu (Etiket) | B Sütunu (Değer) |
|-------------------|------------------|
| GM-1 Bakıma Kalan Saat | 250 |
| GM-1 Greslemeye Kalan Saat | 120 |
| GM-1 Numuneye Kalan Saat | 80 |
| GM-2 Bakıma Kalan Saat | 340 |
| GM-2 Greslemeye Kalan Saat | 95 |
| GM-2 Numuneye Kalan Saat | 150 |
| GM-3 Bakıma Kalan Saat | 180 |
| GM-3 Greslemeye Kalan Saat | 65 |
| GM-3 Numuneye Kalan Saat | 110 |

**Not**: Etiket isimleri büyük/küçük harf duyarsızdır ve Türkçe karakterler normalleştirilir.

## Özellikler

### Ana Sayfa Entegrasyonu

1. **Admin Kullanıcı Kontrolü**: Bakım kartları sadece `role: 'admin'` olan kullanıcılara gösterilir
2. **Otomatik Güncelleme**: Veriler her 5 dakikada bir otomatik olarak güncellenir
3. **Cache Sistemi**: Veriler localStorage'da cache'lenir (5 dakika)
4. **Animasyonlu Gösterim**: Sayılar animasyonlu bir şekilde gösterilir

### Renk Kodlaması

Kalan saat değerine göre otomatik renk kodlaması:
- **Kırmızı (Critical)**: 0-49 saat kaldı - Acil bakım gerekli
- **Turuncu (Warning)**: 50-99 saat kaldı - Yakında bakım gerekli
- **Sarı (Normal)**: 100+ saat kaldı - Normal durum

### Kartlar

Her motor için 3 ayrı bakım kartı gösterilir:
- **GM-1 Periyodik Bakım**
- **GM-2 Periyodik Bakım**
- **GM-3 Periyodik Bakım**

Her kartın içinde:
- Bakıma Kalan Saat
- Greslemeye Kalan Saat
- Numuneye Kalan Saat

## API Endpoint

### Endpoint URL
```
GET https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?action=getPeriyodikBakimData
```

### Başarılı Yanıt
```json
{
  "success": true,
  "data": {
    "gm1": {
      "bakimaKalanSaat": 250,
      "greslemeKalanSaat": 120,
      "numuneKalanSaat": 80
    },
    "gm2": {
      "bakimaKalanSaat": 340,
      "greslemeKalanSaat": 95,
      "numuneKalanSaat": 150
    },
    "gm3": {
      "bakimaKalanSaat": 180,
      "greslemeKalanSaat": 65,
      "numuneKalanSaat": 110
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Hata Yanıtı
```json
{
  "success": false,
  "error": "Ayarlar sayfası bulunamadı"
}
```

## Sorun Giderme

### Bakım kartları görünmüyor
1. Kullanıcı admin mi? (localStorage'da `loggedInUser` kontrol edin)
2. Console'da hata var mı?
3. `app-config.js` dosyasında URL doğru tanımlanmış mı?

### Veriler güncellenmiyor
1. Google Apps Script deployment URL'i doğru mu?
2. Apps Script'te CORS ayarları yapıldı mı?
3. Network sekmesinde API isteği başarılı mı?
4. Console'da hata mesajı var mı?

### Renkler yanlış
1. Sheets'teki değerler sayı mı, metin mi?
2. Console'da `periyodikBakimData` objesini kontrol edin

## Güncelleme

Sheets'teki değerleri güncelledikten sonra:
- Sayfa otomatik olarak 5 dakika içinde güncellenir
- Manuel güncelleme için sayfayı yenileyin (F5)
- Cache temizlemek için localStorage'ı temizleyin

## Teknik Detaylar

### JavaScript Dosyaları
- `js/anasayfa.js` - Ana sayfa mantığı ve periyodik bakım fonksiyonları
- `js/app-config.js` - API URL konfigürasyonu

### CSS Dosyası
- `css/anasayfa.css` - Bakım kartları stilleri

### HTML Dosyası
- `anasayfa.html` - Ana sayfa yapısı ve bakım kartları HTML

### Google Apps Script
- `google-apps-script/bakim/PeriyodikBakimAyarlar.gs` - Backend API

## Lisans ve Destek

Bu özellik Kojenerasyon Kontrol Paneli projesinin bir parçasıdır.
Destek için: [proje sahibine başvurun]
