/* Localized retry UI for the Capacitor server.errorPath page.
 * Loaded from the bundled app origin; no network, storage or analytics access. */
(function () {
  'use strict';

  var COPY = {
    en: {
      title: 'Daymark could not load',
      message:
        'The app shell did not finish loading. Check your connection to the app and try again.',
      retry: 'Try again',
    },
    fr: {
      title: 'Daymark n’a pas pu se charger',
      message:
        'L’interface de l’application n’a pas fini de se charger. Vérifiez la connexion à l’application, puis réessayez.',
      retry: 'Réessayer',
    },
    es: {
      title: 'Daymark no pudo cargarse',
      message:
        'La interfaz de la aplicación no terminó de cargarse. Comprueba la conexión con la aplicación y vuelve a intentarlo.',
      retry: 'Reintentar',
    },
  };

  var language = (navigator.language || 'en').slice(0, 2).toLowerCase();
  var copy = COPY[language] || COPY.en;
  document.documentElement.lang = COPY[language] ? language : 'en';
  document.title = copy.title + ' — Daymark';

  var titleNode = document.querySelector('[data-recovery-title]');
  var messageNode = document.querySelector('[data-recovery-message]');
  var retryNode = document.querySelector('[data-recovery-retry]');
  if (titleNode) titleNode.textContent = copy.title;
  if (messageNode) messageNode.textContent = copy.message;
  if (retryNode) {
    retryNode.textContent = copy.retry;
    retryNode.addEventListener('click', function () {
      retryNode.disabled = true;
      // Bundled app root on the local Capacitor origin.
      window.location.replace('/');
    });
  }
})();
