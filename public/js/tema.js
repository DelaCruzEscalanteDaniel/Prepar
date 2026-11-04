(function () {
  'use strict';
  var tema = 'oscuro';
  var idioma = 'es';
  try {
    tema = localStorage.getItem('prepar_tema') || 'oscuro';
    idioma = localStorage.getItem('prepar_idioma') || 'es';
  } catch (e) { }
  if (tema !== 'claro' && tema !== 'oscuro') tema = 'oscuro';
  if (idioma !== 'es' && idioma !== 'en') idioma = 'es';
  document.documentElement.setAttribute('data-tema', tema);
  document.documentElement.setAttribute('lang', idioma);
}());
