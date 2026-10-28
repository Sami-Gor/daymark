import { PrivacyPolicyLayout } from '@/pages/privacy-layout';

/*
 * Spanish privacy policy for Daymark V2 (2.0.0). Meaning-for-meaning
 * translation of the English policy: web/PWA is a limited weather demo without
 * voice; Android has on-device Parakeet input and local English Kokoro
 * narration; French/Spanish narration is unavailable in V2.
 */

export default function PrivacyEs() {
  return (
    <PrivacyPolicyLayout
      lang="es"
      documentTitle="Política de privacidad — Daymark"
      title="Política de privacidad"
      brandNote="Política de privacidad"
      backLabel="← Volver al tiempo"
      switcherLabel="Idioma de la política"
      effectiveText="Fecha de entrada en vigor: 28 de octubre de 2026 · Última actualización: 28 de octubre de 2026"
      tagline="Daymark — el tiempo, de forma sencilla"
    >
      <p>
        Daymark es una aplicación del tiempo formada por una demo web/PWA limitada y una aplicación
        Android más completa. La mayor parte del procesamiento ocurre en tu navegador o aplicación
        instalada, pero Daymark envía directamente las solicitudes de tiempo, calidad del aire y
        búsqueda de lugares a Open-Meteo, y el alojamiento del sitio procesa metadatos de solicitud
        ordinarios. Esta política describe esos flujos y tus opciones.
      </p>

      <h2>Quién opera Daymark</h2>
      <p>
        Daymark está operado por Sami. Si tienes preguntas sobre esta política o sobre tu información,
        escribe a
        <a href="mailto:skylinelabdev@gmail.com"> skylinelabdev@gmail.com</a>.
      </p>

      <h2>Transición V2 / V1</h2>
      <p>
        Esta política describe Daymark V2 (versión 2.0.0) en la web/PWA y Android. Daymark 1.0.0
        puede seguir instalada en un dispositivo o disponible en Google Play hasta que V2 se publique
        completamente en producción. Cuando V2 se publique por completo, V1 se retirará de Google Play
        y finalizará el soporte oficial de V1. Las instalaciones V1 existentes no se desactivarán
        deliberadamente.
      </p>
      <p>
        V1 se comportaba de forma distinta: su versión Android solicitaba ubicación precisa además de
        la aproximada, usaba el reconocimiento de voz del navegador o de la WebView y podía usar la voz
        de síntesis Android predeterminada para la narración en francés y español. Esos
        comportamientos de V1 solo se aplican mientras se use una instalación V1.
      </p>

      <h2>Solicitudes meteorológicas y búsqueda de lugares</h2>
      <p>
        Al abrirse, Daymark carga un pronóstico para Londres, su lugar predeterminado. Esa solicitud se
        envía directamente desde tu navegador o aplicación instalada a Open-Meteo y no requiere permiso
        de ubicación.
      </p>
      <p>
        Los datos del tiempo, la calidad del aire y la búsqueda de lugares provienen de
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>. Las
        solicitudes van directamente a:
      </p>
      <ul>
        <li><code>api.open-meteo.com</code> — pronósticos</li>
        <li><code>air-quality-api.open-meteo.com</code> — calidad del aire</li>
        <li><code>geocoding-api.open-meteo.com</code> — búsqueda de lugares</li>
      </ul>
      <p>
        Cuando escribes en el cuadro de búsqueda, el texto se envía al servicio de geocodificación de
        Open-Meteo para sugerir lugares coincidentes. Daymark no guarda tus búsquedas. Daymark no
        opera un backend ni un servidor de aplicaciones para cuentas, historial del tiempo, búsquedas
        o datos de voz.
      </p>

      <h2>Datos de ubicación</h2>
      <p>
        Daymark no solicita tu ubicación al cargar. La ubicación del dispositivo solo se usa cuando
        pulsas «Usar mi ubicación» y concedes permiso. Puedes evitarlo y usar el lugar predeterminado o
        buscar un lugar.
      </p>
      <p>
        La aplicación Android declara únicamente <code>ACCESS_COARSE_LOCATION</code> y no declara
        <code>ACCESS_FINE_LOCATION</code>. Android y la web/PWA ajustan la posición derivada del
        dispositivo a una cuadrícula de 0,025 grados con un paso mínimo de 0,025 grados en el
        dispositivo antes de enviarla a Open-Meteo. En latitudes altas, el espaciado de longitud se
        amplía justo lo necesario para mantener un área de al menos 3 km²; el paso de latitud nunca
        baja de 0,025°. Cerca de Londres son unos 2,8 km norte/sur y 1,7 km este/oeste (unos 4,8 km²);
        en latitudes altas el espaciado de longitud puede ser mayor. La cuadrícula reduce la precisión
        pero no anonimiza la solicitud: las coordenadas redondeadas salen de tu dispositivo y se envían
        a Open-Meteo. La aplicación vuelve a Londres al recargar o reabrir.
      </p>
      <p>
        Para la ubicación del dispositivo, Daymark también resuelve localmente un nombre de localidad
        cercano (por ejemplo, un pueblo) a partir del conjunto de datos GeoNames estático. La web/PWA
        descarga el conjunto desde el sitio de Daymark y lo guarda en caché localmente; la aplicación
        Android lo incluye en sus recursos. Ningún servicio de geocodificación inversa, incluido
        GeoNames, recibe tus coordenadas.
      </p>

      <h2>Demo web/PWA</h2>
      <p>
        La versión web/PWA es una demo meteorológica limitada. No tiene el botón de micrófono Ask
        Daymark ni la narración «Hear today». No solicita permiso de micrófono y no invoca las API de
        reconocimiento ni de síntesis de voz del navegador. La aplicación Android ofrece el conjunto
        completo de funciones de voz descrito a continuación.
      </p>

      <h2>Entrada de voz Android (Ask Daymark)</h2>
      <p>
        Ask Daymark es opcional en Android. Solo se inicia cuando pulsas el botón del micrófono y
        concedes permiso. El reconocimiento usa el modelo Parakeet TDT 0.6B v3 int8 integrado, mediante
        el runtime sherpa-onnx en el dispositivo. El audio se captura temporalmente durante esa sesión
        iniciada por ti y se mantiene en memoria para el reconocimiento; Daymark no graba ni conserva
        intencionadamente el audio ni la transcripción, y no los envía a un servidor de voz de Daymark.
        La ruta Android no usa Android SpeechRecognizer, reconocimiento del navegador ni un
        reconocedor en línea de respaldo en el código. Es una constatación del código y de las pruebas
        automatizadas, no una prueba independiente a nivel de paquetes de ausencia total de tráfico.
      </p>

      <h2>Narración Android</h2>
      <p>
        La narración en inglés se genera en tu dispositivo con el modelo Kokoro integrado. Daymark no
        almacena el texto de la narración. La narración en francés y español no está disponible en V2 y
        está prevista para V2.2; Daymark muestra un mensaje de indisponibilidad y no recurre a la
        síntesis de voz Android, a una voz de red ni a la síntesis del navegador.
      </p>

      <h2>Información almacenada en tu dispositivo</h2>
      <p>
        Daymark guarda el código de idioma en el almacenamiento local con <code>daymark.locale</code>.
        La app de Android también guarda un valor privado de estado en SharedPreferences con
        <code>daymark.permissions</code>: el booleano <code>microphone-requested</code>, usado solo para
        evitar repetir una solicitud de permiso de micrófono después de haberla solicitado o de que
        se haya denegado. Ninguno de esos
        valores es un historial de ubicación, búsquedas, transcripciones ni del tiempo, y Daymark no
        conserva esos historiales. El service worker de la web/PWA guarda en caché los recursos de la
        aplicación, y la búsqueda de localidades usa Cache Storage para el conjunto de datos estático;
        son recursos de la aplicación, no historial del usuario. La app de Android carga el conjunto de
        datos desde sus recursos integrados.
      </p>
      <p>
        El código de la app Daymark no usa cookies, almacenamiento de sesión del navegador ni IndexedDB
        para el estado del usuario. Puedes borrar la preferencia de idioma y las cachés de la aplicación borrando el
        almacenamiento de este sitio o aplicación en los ajustes de tu navegador o dispositivo. Borrar
        el almacenamiento local no elimina automáticamente los datos que ya conserven terceros como
        Open-Meteo.
      </p>

      <h2>Terceros y conservación</h2>
      <ul>
        <li>
          Open-Meteo — tiempo, calidad del aire y búsqueda de lugares. Su política publicada indica que
          actúa como responsable independiente del tratamiento, que puede conservar registros técnicos
          con información sensible como coordenadas geográficas y que esos archivos se eliminan tras 90
          días. Open-Meteo también recibe metadatos de red habituales, incluida la dirección IP de
          origen y la URL solicitada, para atender la solicitud. Daymark no usa la dirección IP para
          identificarte ni para determinar tu ubicación; la política de Open-Meteo indica que puede
          procesar direcciones IP por motivos técnicos. Daymark no controla esa conservación. Consulta las
          <a href="https://open-meteo.com/en/terms" target="_blank" rel="noreferrer">condiciones y la política de privacidad de Open-Meteo</a>.
        </li>
        <li>
          Cloudflare Pages — alojamiento estático de la web/PWA. Cloudflare procesa metadatos de
          solicitud estándar, como la dirección IP, la URL solicitada y el agente de usuario, para la
          entrega, la seguridad y la prevención de abusos, conforme a su
          <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">política de privacidad</a>.
          Daymark no afirma un plazo de conservación fijo de Cloudflare.
        </li>
        <li>
          GeoNames — el conjunto de datos estático de localidades y la búsqueda local de la localidad
          más cercana. No se envían coordenadas a GeoNames.
        </li>
        <li>
          Los modelos Parakeet y Kokoro y el runtime sherpa-onnx están integrados en la aplicación
          Android o se entregan como recursos de la aplicación. Se ejecutan en el dispositivo para las
          funciones descritas.
        </li>
      </ul>
      <p>
        Daymark no incluye analíticas, publicidad, píxeles de seguimiento ni SDK de seguimiento.
        Daymark no afirma que todos los servicios externos sean independientemente seguros ni que todo
        el procesamiento externo se conserve cero días.
      </p>

      <h2>Seguridad</h2>
      <p>
        La web/PWA alojada se sirve mediante HTTPS y usa la política de seguridad de contenido
        configurada para el sitio. La aplicación Android instalada carga recursos locales integrados;
        las cabeceras HTTP del sitio no se aplican dentro de su WebView. Daymark es un conjunto
        estático sin secretos y sin backend operado por Daymark. Estas propiedades verificables no
        garantizan la seguridad de servicios terceros ni de todo el dispositivo.
      </p>

      <h2>Público destinatario</h2>
      <p>
        Daymark está destinada a adultos de 18 años o más y no está dirigida a niños. Es una
        declaración de público objetivo en Google Play, no una restricción técnica de acceso ni un
        control de edad; Daymark no afirma que ningún menor pueda acceder a la app. No tiene cuentas y
        Daymark no mantiene perfiles, historiales de ubicación, historiales de búsqueda ni
        transcripciones de voz. Daymark no usa publicidad ni identificadores de seguimiento. La app no
        solicita fecha de nacimiento. Elegir un público adulto no resuelve por sí solo una evaluación
        legal o regulatoria distinta, incluido el UK Children’s Code cuando corresponda.
      </p>

      <h2>Tus opciones</h2>
      <ul>
        <li>Usar el pronóstico predeterminado de Londres o la búsqueda sin conceder ubicación.</li>
        <li>Denegar o revocar la ubicación en los ajustes del navegador o dispositivo.</li>
        <li>En Android, no usar Ask Daymark y prescindir del micrófono.</li>
        <li>Denegar o revocar el micrófono en cualquier momento.</li>
        <li>Borrar la preferencia de idioma y las cachés de la aplicación en los ajustes.</li>
      </ul>

      <h2>Cambios y contacto</h2>
      <p>
        Si cambian las prácticas de Daymark, esta página se actualizará y se revisará la fecha de
        entrada en vigor. Preguntas o dudas:
        <a href="mailto:skylinelabdev@gmail.com">skylinelabdev@gmail.com</a>. Daymark está operado
        por Sami.
      </p>
    </PrivacyPolicyLayout>
  );
}
