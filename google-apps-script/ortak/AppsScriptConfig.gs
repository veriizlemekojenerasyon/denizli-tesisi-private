/**
 * Ortak Google Apps Script URL konfigurasyonu.
 *
 * Server-side Apps Script dosyalari tarayicidaki js/app-config.js dosyasini
 * okuyamaz. Baska Apps Script API'lerine istek atan GAS projelerine bu dosyayi
 * ayni Apps Script projesinde ayri bir dosya olarak ekleyin.
 */

var APPS_SCRIPT_URLS = {
  saatlik: 'https://script.google.com/macros/s/AKfycbwUvCZzYOrJiwXxUpytH5LEfPhTVX_E8_WVRfytUj6KmmPQn8cU4PcZ0JlmALd1148/exec',
  motor: 'https://script.google.com/macros/s/AKfycbxJFAATa4R2kD3T8i0c57JoA_pIryNJGJgCZ7P3WF5SFldswf2pcLd0jnYr4zbOCFCn/exec',
  enerji: 'https://script.google.com/macros/s/AKfycbwjnp7B4zr8M71hxh3sqey_VuLHeL8IRafu7GjnQpB3ER0u9gnL3kMd0QPdWib-gjhh/exec',
  enerjiGunSonu: 'https://script.google.com/macros/s/AKfycbxi4qHxf-EdltRpWAfEnM2qVQln66VPuuU-hnNk9g8T6_wosCrRakDEjSzeTNFqS3tQ/exec',
  yillikEnerjiRapor: 'https://script.google.com/macros/s/AKfycbxTOJuZuGXKTy2JoICtsgXMXjntSmkkWJAaUsiZg8pIwRWeDLjl027KzBTRTMYpsn8r/exec',
  buhar: 'https://script.google.com/macros/s/AKfycbwDlfLp36QguZqRH7_PYtSjWUJihU2dTxodkKiW58rhcK41jtvpS0NKnlw9kBBnZnTJ/exec',
  gunluk: 'https://script.google.com/macros/s/AKfycby-PF0-EVC4PJTNgxm6P09lda_v1DA1SmBGiB4JD3gSg34QKzXN0LT9zKHVXwgDbLB6/exec',
  bakim: 'https://script.google.com/macros/s/AKfycby2EIEvRXvSuoYMEBqKDBAvHlgADT43hCMb7vM-1Nas8jgqi5JfJldI8EwkPNfpneF5/exec',
  vardiya: 'https://script.google.com/macros/s/AKfycbxZE7LNlZRCbjI0PehXQN8-jhTyj5t735inYQ5b2ti6xN_ZNG23EASAbvf2SQUNCjat/exec',
  bildirim: 'https://script.google.com/macros/s/AKfycbz8I8Jk1mZQaWZtJe4eXgVaM2vrVcFbiPndZYQj0NWvZt__wgYKwFJsRndCc1hToRBM/exec ',
  kullanici: 'https://script.google.com/macros/s/AKfycbyUApo62cwpr6dZxOXv-Cyt2deGGiw3Eos_KOZ5I037BErj_qvE-Qa0mRCXgK2pRUjI/exec',
  stok: 'https://script.google.com/macros/s/AKfycbyGW2gUC5kqt6xH2Y6LJWM8-p2m6VxJ-C9ib9ZdqqlomsBxlvM1JEV2Yyx783jeQ6X2/exec',
  motorTakip: 'https://script.google.com/macros/s/AKfycbxLYn6NGBOdpgTCcbFbQJ815JFmoEsosjVmo9MRaSMqdZoc5UyLPq2X9eIV88OY77LN/exec'
};

function getAppsScriptUrl(key) {
  return APPS_SCRIPT_URLS[key] || '';
}
