/**
 * LOCAL STORAGE TEMİZLEME KODU
 * 
 * Kullanım: Tarayıcı konsolunda (F12 > Console) çalıştırın
 */

// === VARDIYA TAKİP LOCAL KAYITLARINI TEMİZLE ===

// 1. Mevcut vardiya kaydını sil
localStorage.removeItem('mevcutVardiya');

// 2. Vardiya işlemlerini sil (geçmiş kayıtlar)
localStorage.removeItem('vardiyaIslemleri');

console.log('✅ Vardiya local kayıtları temizlendi!');

// === TÜM LOCAL STORAGE'I TEMİZLE (DİKKAT: Tüm veriler silinir!) ===
// localStorage.clear();
// console.log('🗑️ Tüm local storage temizlendi!');

// === DOĞRULAMA ===
console.log('Mevcut Vardiya:', localStorage.getItem('mevcutVardiya'));
console.log('Vardiya İşlemleri:', localStorage.getItem('vardiyaIslemleri'));
