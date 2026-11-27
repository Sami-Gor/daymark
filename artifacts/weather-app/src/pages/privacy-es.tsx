import { PrivacyPolicyLayout } from '@/pages/privacy-layout';

/*
 * Spanish privacy policy for Daymark V1 (1.0.0, closed testing) and V2
 * (2.0.0, production). Meaning-for-meaning translation of the English policy:
 * the deployed V1 website demo has browser voice controls; Android V2 has
 * on-device Parakeet input and local English Kokoro narration; French/Spanish
 * narration is unavailable in V2.
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
      effectiveText="Fecha de entrada en vigor: 27 de octubre de 2026 · Última actualización: 27 de noviembre de 2026"
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
        Esta política cubre Daymark V2 (versión 2.0.0), actualmente en producción, y Daymark V1
        (versión 1.0.0), que sigue en pruebas cerradas y también puede seguir instalada en un
        dispositivo. Ambas versiones usan el nombre y el paquete Daymark, pero no se comportan de forma
        idéntica. Las instalaciones V1 existentes no se desactivarán deliberadamente.
      </p>
      <p>
        La versión Android de Daymark V1 solicitaba ubicación precisa además de la aproximada, usaba
        el reconocimiento de voz del navegador o de la WebView y podía usar la voz de síntesis Android
        predeterminada para la narración en francés y español. La versión Android de Daymark V2
        solicita únicamente ubicación aproximada, realiza el reconocimiento de voz en el dispositivo
        con Parakeet y ofrece narración inglesa Kokoro; la narración en francés y español no está
        disponible en V2. Estas diferencias se aplican según la versión que uses.
      </p>
      <p>
        La demo web/PWA actualmente desplegada es la experiencia web V1 y expone los controles de
        demostración «Ask Daymark» y «Hear today». Cuando se usan, esos controles recurren a los
        servicios de reconocimiento y síntesis de voz del navegador o de la plataforma; no son la ruta
        Parakeet/Kokoro en el dispositivo de V2 Android. La declaración actual de seguridad de datos
        de Google Play cubre las versiones distribuidas e incluye la ubicación aproximada y precisa,
        el historial de búsquedas en la aplicación y las grabaciones de voz o sonido como datos
        recopilados y compartidos. La ubicación precisa y la voz siguen siendo relevantes mientras V1
        esté en pruebas cerradas.
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
        Android V2 declara únicamente <code>ACCESS_COARSE_LOCATION</code> y no declara
        <code>ACCESS_FINE_LOCATION</code>. V2 ajusta la posición derivada del dispositivo a una
        cuadrícula de 0,025 grados con un paso mínimo de 0,025 grados antes de enviarla a Open-Meteo.
        En latitudes altas, el espaciado de longitud se amplía justo lo necesario para mantener un
        área de al menos 3 km²; el paso de latitud nunca baja de 0,025°. Cerca de Londres son unos
        2,8 km norte/sur y 1,7 km este/oeste (unos 4,8 km²); en latitudes altas el espaciado de
        longitud puede ser mayor. La cuadrícula reduce la precisión pero no anonimiza la solicitud:
        las coordenadas redondeadas salen de tu dispositivo y se envían a Open-Meteo.
      </p>
      <p>
        Android V1 declara tanto <code>ACCESS_COARSE_LOCATION</code> como
        <code>ACCESS_FINE_LOCATION</code>. Su ruta de ubicación usaba coordenadas con dos decimales
        (unos 1,1 km según el paso de latitud) y puede enviarlas a Open-Meteo cuando se usa V1. Las
        instalaciones V1 existentes conservan ese comportamiento; no es la ruta de ubicación de V2.
        La demo web/PWA actualmente desplegada usa la geolocalización del navegador y el
        comportamiento web V1, por lo que su precisión puede diferir de Android V2. La versión web V2
        actual aplica la misma cuadrícula de 0,025 grados que Android V2 cuando se despliega.
      </p>
      <p>
        La aplicación vuelve a Londres al recargar o reabrir.
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
        La demo web/PWA actualmente desplegada es una demo meteorológica V1 limitada y expone el botón
        de micrófono «Ask Daymark» y el control de narración «Hear today». Si usas esos controles, los
        servicios de reconocimiento y síntesis de voz del navegador o de la plataforma pueden procesar
        tu audio o tu solicitud de narración según sus propias condiciones. Son funciones de demo web,
        no la ruta Parakeet o Kokoro de V2 Android, y no debe suponerse que la demo se comporta como la
        aplicación V2 instalada. La demo web no usa los modelos Parakeet o Kokoro de Android.
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
        También recuerda tu unidad de temperatura preferida (<code>C</code> o <code>F</code>) con
        <code>daymark.unit</code>. La app de Android también guarda un valor privado de estado en SharedPreferences con
        <code>daymark.permissions</code>: el booleano <code>microphone-requested</code>, usado solo para
        evitar repetir una solicitud de permiso de micrófono después de haberla solicitado o de que
        se haya denegado. Son preferencias de visualización y de estado de la app; ninguno de esos
        valores es un historial de ubicación, búsquedas, transcripciones ni del tiempo, y Daymark no
        conserva esos historiales. El service worker de la web/PWA guarda en caché los recursos de la
        aplicación, y la búsqueda de localidades usa Cache Storage para el conjunto de datos estático;
        son recursos de la aplicación, no historial del usuario. La app de Android carga el conjunto de
        datos desde sus recursos integrados.
      </p>
      <p>
        El código de la app Daymark no usa cookies, almacenamiento de sesión del navegador ni IndexedDB
        para el estado del usuario. Puedes borrar las preferencias de idioma y de unidad y las cachés de la aplicación borrando el
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
        estático sin secretos y sin backend operado por Daymark. Las solicitudes V2 de tiempo, calidad
        del aire y búsqueda de lugares usan HTTPS. No formulamos una garantía general de cifrado para
        el transporte de los servicios de voz o síntesis V1 del navegador o la WebView; esos servicios
        no están controlados por Daymark y se rigen por sus propias condiciones. Estas propiedades
        verificables no garantizan la seguridad de servicios terceros ni de todo el dispositivo.
      </p>

      <h2>Público destinatario</h2>
      <p>
        Daymark V1 y V2 están destinadas a adultos de 18 años o más y no están dirigidas a niños. Es
        una declaración de público objetivo en Google Play, no una restricción técnica de acceso ni
        un control de edad; Daymark no afirma que ningún menor pueda acceder a la app. No tiene
        cuentas y Daymark no mantiene perfiles, historiales de ubicación, historiales de búsqueda ni
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
        <li>Elegir Celsius o Fahrenheit para mostrar las temperaturas. La elección se guarda únicamente en el almacenamiento local de este navegador o aplicación con <code>daymark.unit</code>; los valores válidos son <code>C</code> y <code>F</code>, y se usa Celsius cuando no hay ningún valor válido guardado. No se envía a ningún servidor, no se sincroniza con ninguna cuenta y no se usa para telemetría.</li>
        <li>Borrar las preferencias de idioma y de unidad y las cachés de la aplicación en los ajustes.</li>
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
