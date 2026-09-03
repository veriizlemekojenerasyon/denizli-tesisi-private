/**
 * Ortak Google Apps Script URL konfigurasyonu.
 *
 * Server-side Apps Script dosyalari tarayicidaki js/app-config.js dosyasini
 * okuyamaz. Baska Apps Script API'lerine istek atan GAS projelerine bu dosyayi
 * ayni Apps Script projesinde ayri bir dosya olarak ekleyin.
 */

var APPS_SCRIPT_URLS = {
  saatlik: 'https://script.google.com/macros/s/AKfycbw7gTKX-mN5YJtOseDUr6R3qAYme9rEM5Lb0hYYm3RCKHD1Q2A6GZqlXihYCYtsPgBcXA/exec',
  motor: 'https://script.google.com/macros/s/AKfycbyrSjQAH5k8bDIQXf7g1hJ59xo2Kv7rLN_mstZxDZxK3wiXV5Fo2mkGzPyiMx9DoBmq/exec',
  enerji: 'https://script.google.com/macros/s/AKfycbwX9FSvBeBN5vpe3fX_encGid-5JZ0LrrQ_5bHn2wS7lzzU7NlDn95FTLnhWTn_FGsl/exec',
  enerjiGunSonu: 'https://script.google.com/macros/s/AKfycbxi4qHxf-EdltRpWAfEnM2qVQln66VPuuU-hnNk9g8T6_wosCrRakDEjSzeTNFqS3tQ/exec',
  yillikEnerjiRapor: 'https://script.google.com/macros/s/AKfycbxTOJuZuGXKTy2JoICtsgXMXjntSmkkWJAaUsiZg8pIwRWeDLjl027KzBTRTMYpsn8r/exec',
  buhar: 'https://script.google.com/macros/s/AKfycbxRCMHqXKVq-qHx8IxWxQgEqZtnU5RByCVHu6pxUFgIPq-8g-0NPTiJgnPM3glZd-UDvw/exec',
  gunluk: 'https://script.google.com/macros/s/AKfycbygWsxTYiiu78JjYzEP4_Erk9qpK4ceXQ3JSWZrkCvX908Qtt920ReBMn-jBgqrAbSwlw/exec',
  bakim: 'https://script.google.com/macros/s/AKfycbyrBtgc3spsh4jCpVtojfiFac5La8WKzh0Hlazndj0w-O-GCpMzYwCNevUJReXUI_zV/exec',
  vardiya: 'https://script.google.com/macros/s/AKfycbxZE7LNlZRCbjI0PehXQN8-jhTyj5t735inYQ5b2ti6xN_ZNG23EASAbvf2SQUNCjat/exec',
  bildirim: 'https://script.google.com/macros/s/AKfycbx6kbSNPQV0hIj8aOeW1QamYe3R995vXg-3uSw4Qw5N0M8-RARL262cce3RdQFIbso/exec',
  kullanici: 'https://script.google.com/macros/s/AKfycbx0cj7AcYyf3SiVmLdJVrutOR_VA6P_1XhvyAmINXs5JUMfIr0NnPHtRfC_p7TJKhzD/exec',
  stok: 'https://script.google.com/macros/s/AKfycbwdgKAxZ9J4NdxKFvlTUPnr-pCGD7UfHXqM8q3VWR4OHgKXs0eCjVAy9LHU-EkcHVKv/exec',
  motorTakip: 'https://script.google.com/macros/s/AKfycbyxfk2wUCJVDzHETdYWf4-zTxeMMwwd4wJ1uPkgVSFy1x6Ujy-lkWAkqPRMQlt3ZyPx/exec',
  elzMainpage: 'https://script.google.com/macros/s/AKfycbww7IzvG3dgsQgzHTOtzjwDHCJ561KLRBWTCNW3oD5aLVNqj4iRk-FJXome4XTccV_Z/exec'
};

function getAppsScriptUrl(key) {
  return APPS_SCRIPT_URLS[key] || '';
}
