/**
 * BUHAR SAYFASI - KURULUM KILAVUZU
 * 
 * ADIM 1: Google Apps Script Kurulumu
 * =====================================
 * 1. Google Sheets'de yeni bir spreadsheet oluşturun
 * 2. Sheet1 adını "BuharVerileri" olarak değiştirin
 * 3. A1:D1 hücrelerine şu başlıkları yazın:
 *    - Tarih | Buhar (Ton) | Kaydeden | Kayıt Tarihi
 * 4. Menüden Extensions > Apps Script'e tıklayın
 * 5. Code.gs dosyasındaki kodu kopyalayıp yapıştırın
 * 6. Deploy > New Deployment > Web App seçin
 * 7. Execute as: Me, Who has access: Anyone seçin
 * 8. Deploy'a tıklayın ve Web App URL'ini kopyalayın
 * 
 * ADIM 2: JavaScript Konfigürasyonu
 * =====================================
 * 1. buhar-sheets.js dosyasını açın
 * 2. BUHAR_CONFIG.APPS_SCRIPT_URL alanına kopyaladığınız URL'i yapıştırın
 * 3. Dosyayı kaydedin
 * 
 * ADIM 3: HTML Güncelleme
 * =====================================
 * 1. buhar-verisi.html dosyasını açın
 * 2. <script src="js/buhar-verisi.js"></script> satırını bulun
 * 3. Şu şekilde değiştirin:
 *    <script src="js/buhar-sheets.js"></script>
 * 4. Dosyayı kaydedin
 * 
 * ADIM 4: Test
 * =====================================
 * 1. buhar-verisi.html sayfasını tarayıcıda açın
 * 2. Formu doldurup kaydetmeyi deneyin
 * 3. Google Sheets'te kaydın geldiğini kontrol edin
 * 
 * NOTLAR:
 * - Aynı tarih için birden fazla kayıt yapılamaz (kontrol var)
 * - Tüm veriler Google Sheets'te saklanır
 * - LocalStorage kullanılmaz (veri kaybı riski yok)
 */
