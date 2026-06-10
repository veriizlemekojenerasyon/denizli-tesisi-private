/**
 * Ortak Google Apps Script URL konfigurasyonu.
 *
 * Server-side Apps Script dosyalari tarayicidaki js/app-config.js dosyasini
 * okuyamaz. Baska Apps Script API'lerine istek atan GAS projelerine bu dosyayi
 * ayni Apps Script projesinde ayri bir dosya olarak ekleyin.
 */

var APPS_SCRIPT_URLS = {
  saatlik: 'https://script.google.com/macros/s/AKfycbwpAgGwe5-AIJSmllURtAj_zNeVkKjkkTFW3_k5zlMcfXdsr9z-mA8HCDRhhC3NpkGH/exec',
  motor: 'https://script.google.com/macros/s/AKfycbwDvLwc6FAyGvADqrPzS_hqUrAngr4vJm6bY8ZSTemYd3acUm0GlZTUrfNcRUHmkU1I/exec',
  enerji: 'https://script.google.com/macros/s/AKfycbzpXTMOhzIEj9IUt3Ch8lJWtPDrURYk0aKQ27DHQHcFCAWB5fRWdZEfCLH_sFH8i9jF/exec',
  enerjiGunSonu: 'https://script.google.com/macros/s/AKfycbxi4qHxf-EdltRpWAfEnM2qVQln66VPuuU-hnNk9g8T6_wosCrRakDEjSzeTNFqS3tQ/exec',
  yillikEnerjiRapor: 'https://script.google.com/macros/s/AKfycbxTOJuZuGXKTy2JoICtsgXMXjntSmkkWJAaUsiZg8pIwRWeDLjl027KzBTRTMYpsn8r/exec',
  buhar: 'https://script.google.com/macros/s/AKfycbwDlfLp36QguZqRH7_PYtSjWUJihU2dTxodkKiW58rhcK41jtvpS0NKnlw9kBBnZnTJ/exec',
  gunluk: 'https://script.google.com/macros/s/AKfycbyAMleBYMDKxwnNRLi6ogL8rl1-c6hia_v-NJ07pbsiT4R_1pkxrpR_FUmu13FIpFQm/exec',
  bakim: 'https://script.google.com/macros/s/AKfycby2EIEvRXvSuoYMEBqKDBAvHlgADT43hCMb7vM-1Nas8jgqi5JfJldI8EwkPNfpneF5/exec',
  vardiya: 'https://script.google.com/macros/s/AKfycbxZE7LNlZRCbjI0PehXQN8-jhTyj5t735inYQ5b2ti6xN_ZNG23EASAbvf2SQUNCjat/exec',
  bildirim: 'https://script.google.com/macros/s/AKfycbyGNwzU4z_iPNWKoye4jFt3DP6Zqdm6fF_I-nfvs5e_bjlAF-2SHivtRdiNiOzqT9TI/exec',
  kullanici: 'https://script.google.com/macros/s/AKfycbzRARgxJUV2JWpRHVcx3BFFnNE1keUq1SsEKfMjt-nLDolF4at8JRpi3ksfdRbew0ld/exec',
  stok: 'https://script.google.com/macros/s/AKfycbyGW2gUC5kqt6xH2Y6LJWM8-p2m6VxJ-C9ib9ZdqqlomsBxlvM1JEV2Yyx783jeQ6X2/exec',
  motorTakip: 'https://script.google.com/macros/s/AKfycbxLYn6NGBOdpgTCcbFbQJ815JFmoEsosjVmo9MRaSMqdZoc5UyLPq2X9eIV88OY77LN/exec',
  elzMainpage: 'https://script.google.com/macros/s/AKfycbww7IzvG3dgsQgzHTOtzjwDHCJ561KLRBWTCNW3oD5aLVNqj4iRk-FJXome4XTccV_Z/exec'
};

function getAppsScriptUrl(key) {
  return APPS_SCRIPT_URLS[key] || '';
}
