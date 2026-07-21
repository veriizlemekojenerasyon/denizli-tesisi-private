/**
 * Ortak Google Apps Script URL konfigurasyonu.
 *
 * Server-side Apps Script dosyalari tarayicidaki js/app-config.js dosyasini
 * okuyamaz. Baska Apps Script API'lerine istek atan GAS projelerine bu dosyayi
 * ayni Apps Script projesinde ayri bir dosya olarak ekleyin.
 */

var APPS_SCRIPT_URLS = {
  saatlik: 'https://script.google.com/macros/s/AKfycbz8tCK7XmV3I-wnCiM2iv8UwbUOkmBwj6s3IXEBeU5AZ0cwXF2Le4sejT8j7oXOz-QR/exec',
  motor: 'https://script.google.com/macros/s/AKfycbwq19k4VPxzM_qe-i6M1HAujdAuP5hEHvi4aypdbHFTY-XnVuYDqrySFYF3HoB8ahMB/exec',
  enerji: 'https://script.google.com/macros/s/AKfycbz1UCYZDqq5QsMZyIKXdLux_snA3NFusReBhYxjAhBNPMAmxH6Rw2o4ZZ09yT4WRmIb/exec',
  enerjiGunSonu: 'https://script.google.com/macros/s/AKfycbxi4qHxf-EdltRpWAfEnM2qVQln66VPuuU-hnNk9g8T6_wosCrRakDEjSzeTNFqS3tQ/exec',
  yillikEnerjiRapor: 'https://script.google.com/macros/s/AKfycbxTOJuZuGXKTy2JoICtsgXMXjntSmkkWJAaUsiZg8pIwRWeDLjl027KzBTRTMYpsn8r/exec',
  buhar: 'https://script.google.com/macros/s/AKfycbwDlfLp36QguZqRH7_PYtSjWUJihU2dTxodkKiW58rhcK41jtvpS0NKnlw9kBBnZnTJ/exec',
  gunluk: 'https://script.google.com/macros/s/AKfycbwObrja3MBernSzq6Q8PGlik0btKgA6DXCswp3atilbuU0Sd-hEc3M6KtWaDU4hhloN/exec',
  bakim: 'https://script.google.com/macros/s/AKfycby2EIEvRXvSuoYMEBqKDBAvHlgADT43hCMb7vM-1Nas8jgqi5JfJldI8EwkPNfpneF5/exec',
  vardiya: 'https://script.google.com/macros/s/AKfycbxZE7LNlZRCbjI0PehXQN8-jhTyj5t735inYQ5b2ti6xN_ZNG23EASAbvf2SQUNCjat/exec',
  bildirim: 'https://script.google.com/macros/s/AKfycbz2TpddOgrNQoWL7jak5OAoNGPvEsbjDy-mwH06P9Z7iFQOcOsKgtOjtbzwTrW1HVsQ/exec',
  kullanici: 'https://script.google.com/macros/s/AKfycbx9vl-siC8bKbGlrX1bJ2LHluuafZ4WbUnM3wxiQ4opvDbD1_8ll34T2mfpIWFR2Nu7/exec',
  stok: 'https://script.google.com/macros/s/AKfycbz8LKe17Xcly6_ujWrnLbD1BnprW19rGtrVssExet5iUgGkiZ23Cf25H--THCKOKWmE/exec',
  motorTakip: 'https://script.google.com/macros/s/AKfycbxLYn6NGBOdpgTCcbFbQJ815JFmoEsosjVmo9MRaSMqdZoc5UyLPq2X9eIV88OY77LN/exec',
  elzMainpage: 'https://script.google.com/macros/s/AKfycbww7IzvG3dgsQgzHTOtzjwDHCJ561KLRBWTCNW3oD5aLVNqj4iRk-FJXome4XTccV_Z/exec'
};

function getAppsScriptUrl(key) {
  return APPS_SCRIPT_URLS[key] || '';
}
