# 🏭 Kojen Maliyet & EP-A Analiz — Google Sheets Apps Script

Bu klasörde **iki farklı Excel dosyasını** Google Sheets formatına dönüştüren ve hesaplama yapan Apps Script kodları bulunmaktadır:

1. **Kojen Maliyeti.xlsx** → Bakım masrafları, birim maliyetler, motor çalışma saatleri
2. **EP-A-.xlsx** → Kojen avantaj analizi, dengesizlik maliyeti, faturalaşma, aylık özet

---

## 📁 Dosya Yapısı

```
kojen-maliyet/
├── 00_Ortak.gs           ← Ortak yardımcı fonksiyonlar + Web API
├── KojenMaliyeti.gs      ← Bakım masrafları ve maliyet hesaplama
├── EP_A_Analiz.gs        ← EP-A analiz raporları (avantaj, dengesizlik, fatura)
└── README.md             ← (bu dosya)
```

---

## ⚙️ Kurulum Adımları

### 1. Google Sheets Oluşturun
- [Google Sheets](https://sheets.google.com) açın
- Yeni bir boş Spreadsheet oluşturun
- URL'den **Spreadsheet ID**'sini kopyalayın:
  ```
  https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
                                           ^^^^^^^^^^^^^^
  ```

### 2. Apps Script Projesini Açın
- Sheets'te menüden: **Extensions > Apps Script**
- `Code.gs` dosyası açılır; ismini **"00_Ortak.gs"** yapın

### 3. Dosyaları Ekleyin
Bu klasördeki 3 dosyayı Apps Script'e ekleyin:

**a) 00_Ortak.gs** → Zaten var, içeriğini yapıştırın  
**b) KojenMaliyeti.gs** → Yeni dosya ekleyin (`+` tuşu), içeriği yapıştırın  
**c) EP_A_Analiz.gs** → Yeni dosya ekleyin, içeriği yapıştırın

### 4. Spreadsheet ID'yi Güvenli Şekilde Kaydedin

Kod içine ID yazmak yerine **PropertiesService** kullanılır.  
Apps Script editöründe **Console** sekmesini açıp şunu çalıştırın:

```javascript
kojenMaliyetIdKaydet('BURAYA_SPREADSHEET_ID_GIRIN')
```

Ya da editörde fonksiyonu seçip **Run** tuşuna basın — parametre isterse:

```
Run > kojenMaliyetIdKaydet
```

ID bir kez kaydedilir; sonraki tüm çalıştırmalarda otomatik okunur.  
ID'yi güncellemek için aynı fonksiyonu yeniden çalıştırmanız yeterlidir.

### 5. İlk Çalıştırma
Apps Script editöründe:
- **Run** > `kureKojenMaliyetSayfalarini` seçin → Maliyet sayfaları oluşur
- **Run** > `kureEP_A_Sayfalarini` seçin → EP-A sayfaları oluşur

İlk çalıştırmada **yetki izni** isteyecektir — **Allow** deyin.

---

## 📊 Oluşturulan Sayfalar

### **Kojen Maliyet Grubu**
| Sayfa Adı         | İçerik                                        |
|------------------|----------------------------------------------|
| BakimMasraflari  | Bakım türü, birim fiyat, adet, toplam       |
| BirimMaliyetler  | kWh başına bakım/arıza/doğalgaz/buhar/net   |
| MotorCalisma     | GM1/GM2/GM3 çalışma saatleri + genel toplam |
| BakimSayilari    | 2k/6k/10k/20k/30k bakım adedi (motor bazlı) |
| MaliyetOzet      | Tüm maliyet bilgilerini özetleyen dashboard |

### **EP-A Analiz Grubu**
| Sayfa Adı           | İçerik                                      |
|--------------------|-------------------------------------------|
| BaglantiNoktalari  | Koruma Klor Denizli bağlantı noktaları (tüketim + GM1/GM2/GM3 üretim saatlik) |
| KojenAvantaj       | Saatlik kojen üretim vs şebeke + günlük avantaj |
| DengesizlikMaliyet | Saatlik dengesizlik + EPİAŞ/TEİAŞ toplamları   |
| Faturalasma        | Saatlik fatura detayı + sabit bedeller         |
| AylikOzet          | Tüm günleri kapsayan aylık özet tablo          |

---

## 🔄 Veri Güncelleme

### **Kojen Maliyet** → Statik parametreler
`KojenMaliyeti.gs` dosyasındaki sabitleri düzenleyin:
```javascript
var BAKIM_TURLERI = [...];
var KOJEN_PARAMETRELER = {...};
var MOTOR_CALISMA_SAATLERI = {...};
var BAKIM_SAYILARI = {...};
```
Sonra tekrar `kureKojenMaliyetSayfalarini()` çalıştırın.

### **EP-A Analiz** → Günlük veri
`EP_A_Analiz.gs` dosyasındaki dizileri düzenleyin:
```javascript
var EP_A_TARIH = '26.07.2026';
var EP_A_KOJEN_SAATLIK = [...];
var EP_A_GUNLUK_AVANTAJ = [...];
var EP_A_DENGESIZLIK_SAATLIK = [...];
// vb.
```
Sonra `kureEP_A_Sayfalarini()` çalıştırın.

**Alternatif:** Oluşturulan sayfaları Excel'den kopyala-yapıştır ile doldurabilirsiniz.

---

## 🌐 Web API (Opsiyonel)

Script'i bir web servisi olarak yayınlayabilirsiniz:

1. **Deploy > New Deployment > Web App**
2. **Execute as:** Me  
3. **Who has access:** Anyone (veya sadece kendi kuruluşunuz)
4. **Deploy** → URL'yi kopyalayın

### Desteklenen Endpoint'ler

| Action                      | Açıklama                              |
|-----------------------------|--------------------------------------|
| `?action=health`            | Servis sağlık durumu                 |
| `?action=maliyetHesapla`    | Hesap sonuçlarını JSON olarak döndürür |
| `?action=maliyetSayfalariniKur` | Maliyet sayfalarını oluşturur   |
| `?action=epaAnalizi`        | EP-A sayfalarını oluşturur           |
| `?action=tumSayfalariniKur` | Her iki grubu da oluşturur           |

**Örnek çağrı:**
```
https://script.google.com/macros/s/[DEPLOY_ID]/exec?action=maliyetHesapla
```

---

## 🎨 Renk Şeması

- **Başlık satırları:** `#1e3a5f` (koyu mavi) + beyaz yazı
- **Toplam satırlar:** `#1e3a5f` + beyaz yazı + bold
- **Veri satırları:** `#F7F9FC` (açık gri) / `#FFFFFF` (beyaz) — zebra çizgili
- **Vurgular:**
  - Yüksek avantaj → `#EBF8EE` (yeşilimsi)
  - Düşük avantaj → `#FFF9C4` (sarı)
  - Negatif farklar → `#FFF0F0` (kırmızımsı)
  - Özet kutular → `#FFF2CC` (turuncu-sarı)

---

## 📝 Notlar

- **Euro/TL Kuru:** Excel'deki **0.104613 TL/kWh** arıza bedelinden geri hesaplanmıştır (~53.88 TL/€). Gerçek kuru güncellemek isterseniz `EURO_TL_KURU` değişkenini düzenleyin.
- **Buhar Geliri:** Kojen elektrik üretiminden elde edilen buhar geliri net maliyetten düşülür.
- **Dengesizlik Maliyeti:** EPİAŞ ve TEİAŞ toplamları aylık özette gösterilir.
- **Faturalaşma:** Saatlik EPİAŞ + Dağıtım + Dengesizlik (Koruma tarafı) toplamı günlük fatura olarak hesaplanır.

---

## 🛠️ Sorun Giderme

### "ReferenceError: getOrCreateSheet is not defined"
→ `00_Ortak.gs` dosyasının proje içinde olduğundan ve alfabetik olarak ilk sırada olduğundan emin olun.

### "Exception: You do not have permission to call SpreadsheetApp.openById"
→ Script'i **ilk çalıştırmada** izin vermeniz gerekir. Execution log'da **Review Permissions** bağlantısına tıklayın.

### "Sayfa oluşturuluyor ama veri boş"
→ `KOJEN_MALIYET_SPREADSHEET_ID` sabitini **doğru Spreadsheet ID** ile güncellediğinizden emin olun.

---

## 📞 Destek

Sorularınız için:
- **Google Apps Script Dokümanları:** https://developers.google.com/apps-script
- **SpreadsheetApp Reference:** https://developers.google.com/apps-script/reference/spreadsheet

---

**Hazırlayan:** Kiro AI  
**Tarih:** 2026-08-01  
**Versiyon:** 1.0.0
