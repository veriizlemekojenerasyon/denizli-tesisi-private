/**
 * Ortak Google Apps Script URL konfigurasyonu.
 *
 * Server-side Apps Script dosyalari tarayicidaki js/app-config.js dosyasini
 * okuyamaz. Baska Apps Script API'lerine istek atan GAS projelerine bu dosyayi
 * ayni Apps Script projesinde ayri bir dosya olarak ekleyin.
 */

var APPS_SCRIPT_URLS = {
  saatlik: 'https://script.google.com/macros/s/AKfycbwkremvq1zC9SKWOa9c-YIWR78qACGwHbdRp3m7D89CLAJ7gKc0pTKr0PoPvlj47BgA/exec',
  motor: 'https://script.google.com/macros/s/AKfycby22gILvlrEBZNCDqaRGDssA6sytZidDVJoxkn4YXaGiWXjW3U8M3uRaXpMwo-JB9gZ/exec',
  enerji: 'https://script.google.com/macros/s/AKfycbzk7NgKVL7q2l3nNXk1Vc4-oJweUx6aeZTuxN6Eu7YMb4g95pwZUnmBchjpLscOz7JO/exec',
  enerjiGunSonu: 'https://script.google.com/macros/s/AKfycbwlOXh_QNnSYyYlwUeXSx2BZM252ah3Sgms34RGoluVaa8qvedCr66MsXOTX_yQKfvq/exec',
  yillikEnerjiRapor: 'https://script.google.com/macros/s/AKfycbx07VTw0WJCUnv6ofspEQ7qfeJ9gcQwE70jybV8p13JfI8VaOTxBFiE66-_QfKU0ucn/exec',
  buhar: 'https://script.google.com/macros/s/AKfycbwDlfLp36QguZqRH7_PYtSjWUJihU2dTxodkKiW58rhcK41jtvpS0NKnlw9kBBnZnTJ/exec',
  gunluk: 'https://script.google.com/macros/s/AKfycby-PF0-EVC4PJTNgxm6P09lda_v1DA1SmBGiB4JD3gSg34QKzXN0LT9zKHVXwgDbLB6/exec',
  bakim: 'https://script.google.com/macros/s/AKfycbyXhYSqiam0mI-CUXPLdMlZ1nRtJNev1S3sGPXsrz0sE0gTevsxoBsWnBaw77WMmF6p/exec',
  vardiya: 'https://script.google.com/macros/s/AKfycbxZE7LNlZRCbjI0PehXQN8-jhTyj5t735inYQ5b2ti6xN_ZNG23EASAbvf2SQUNCjat/exec',
  bildirim: 'https://script.google.com/macros/s/AKfycbwyDx3x8B28pDAd9ala4WfC40DlNPyqTmc9wUfV8Dxd_Ux7Pvq_PZmE1hTkdUSqR5P-/exec',
  kullanici: 'https://script.google.com/macros/s/AKfycbyUApo62cwpr6dZxOXv-Cyt2deGGiw3Eos_KOZ5I037BErj_qvE-Qa0mRCXgK2pRUjI/exec',
  stok: 'https://script.google.com/macros/s/AKfycbzHE0ehSGriQ8wiLcl0tj19YUFKJRnMOyN0PrBd7a6vTrzy2Q7Dkws8ILmmhQbMN_VS/exec',
  motorTakip: 'https://script.google.com/macros/s/AKfycbxLYn6NGBOdpgTCcbFbQJ815JFmoEsosjVmo9MRaSMqdZoc5UyLPq2X9eIV88OY77LN/exec'
};

function getAppsScriptUrl(key) {
  return APPS_SCRIPT_URLS[key] || '';
}
