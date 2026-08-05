/**
 * Ortak Google Apps Script URL konfigurasyonu.
 *
 * Server-side Apps Script dosyalari tarayicidaki js/app-config.js dosyasini
 * okuyamaz. Baska Apps Script API'lerine istek atan GAS projelerine bu dosyayi
 * ayni Apps Script projesinde ayri bir dosya olarak ekleyin.
 */

var APPS_SCRIPT_URLS = {
  saatlik: 'https://script.google.com/macros/s/AKfycbz8tCK7XmV3I-wnCiM2iv8UwbUOkmBwj6s3IXEBeU5AZ0cwXF2Le4sejT8j7oXOz-QR/exec',
  motor: 'https://script.google.com/macros/s/AKfycbzVl10NVvrcQ9kxuMwW7aDb6iaTs6FgtwHVpYc_83AhEwyOIsYZAGTtnlm_pmu-JwOO/exec',
  enerji: 'https://script.google.com/macros/s/AKfycbyiULDEaklYKRnO9QSm16z_maXlhSJAPb6qPKqIgMjJXWHemjYNCMkBjO4lttwOreVi/exec',
  enerjiGunSonu: 'https://script.google.com/macros/s/AKfycbxi4qHxf-EdltRpWAfEnM2qVQln66VPuuU-hnNk9g8T6_wosCrRakDEjSzeTNFqS3tQ/exec',
  yillikEnerjiRapor: 'https://script.google.com/macros/s/AKfycbxTOJuZuGXKTy2JoICtsgXMXjntSmkkWJAaUsiZg8pIwRWeDLjl027KzBTRTMYpsn8r/exec',
  buhar: 'https://script.google.com/macros/s/AKfycbwSBDT_7rnYmIDgCORUUZxULHewlSc-1QqVoUgOPAoYC5429zckWxVcgFE4vTTRigtd/exec',
  gunluk: 'https://script.google.com/macros/s/AKfycbwObrja3MBernSzq6Q8PGlik0btKgA6DXCswp3atilbuU0Sd-hEc3M6KtWaDU4hhloN/exec',
  bakim: 'https://script.google.com/macros/s/AKfycby2EIEvRXvSuoYMEBqKDBAvHlgADT43hCMb7vM-1Nas8jgqi5JfJldI8EwkPNfpneF5/exec',
  vardiya: 'https://script.google.com/macros/s/AKfycbxZE7LNlZRCbjI0PehXQN8-jhTyj5t735inYQ5b2ti6xN_ZNG23EASAbvf2SQUNCjat/exec',
  bildirim: 'https://script.google.com/macros/s/AKfycbz2TpddOgrNQoWL7jak5OAoNGPvEsbjDy-mwH06P9Z7iFQOcOsKgtOjtbzwTrW1HVsQ/exec',
  kullanici: 'https://script.google.com/macros/s/AKfycbx0cj7AcYyf3SiVmLdJVrutOR_VA6P_1XhvyAmINXs5JUMfIr0NnPHtRfC_p7TJKhzD/exec',
  stok: 'https://script.google.com/macros/s/AKfycbwdgKAxZ9J4NdxKFvlTUPnr-pCGD7UfHXqM8q3VWR4OHgKXs0eCjVAy9LHU-EkcHVKv/exec',
  motorTakip: 'https://script.google.com/macros/s/AKfycbxLYn6NGBOdpgTCcbFbQJ815JFmoEsosjVmo9MRaSMqdZoc5UyLPq2X9eIV88OY77LN/exec',
  elzMainpage: 'https://script.google.com/macros/s/AKfycbww7IzvG3dgsQgzHTOtzjwDHCJ561KLRBWTCNW3oD5aLVNqj4iRk-FJXome4XTccV_Z/exec'
};

function getAppsScriptUrl(key) {
  return APPS_SCRIPT_URLS[key] || '';
}
