import { PrivacyPolicyLayout } from '@/pages/privacy-layout';

/*
 * Spanish privacy policy (/es/privacy). Meaning-for-meaning translation of the
 * English 2.0.0 policy, including its version note and its Daymark-vs-third-party
 * distinction; platform-specific voice processing is stated explicitly.
 * Forecast loading includes the default place on app open; optional location
 * and voice flows are separate. No stronger or weaker claims than the English
 * page.
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
      effectiveText="Fecha de entrada en vigor: 11 de octubre de 2026 · Última actualización: 21 de octubre de 2026"
      tagline="Daymark — el tiempo, de forma sencilla"
    >
      <p>
        Daymark es una aplicación del tiempo que funciona por completo en tu navegador o como
        aplicación instalada. Esta política explica, en lenguaje sencillo, qué información interviene
        cuando la utilizas.
      </p>

      <h2>Versiones de Daymark</h2>
      <p>
        Esta política describe Daymark 2.0.0 y la versión web/PWA actual. Daymark 1.0.0, que puede
        seguir instalada en un dispositivo o disponible hasta que se sustituya, se comporta de forma
        distinta en tres aspectos. En Android, solicitaba ubicación precisa
        (<code>ACCESS_FINE_LOCATION</code> además de <code>ACCESS_COARSE_LOCATION</code>) y
        redondeaba las coordenadas a dos decimales antes de enviarlas a Open-Meteo. Ask Daymark
        utilizaba el reconocimiento de voz del navegador o de la WebView descrito a continuación, no
        el modelo Parakeet integrado. En Android, la narración en francés y español podía usar la voz
        de síntesis predeterminada del dispositivo, que puede requerir una conexión de red. Si
        utilizas Daymark 1.0.0, se aplican esos comportamientos.
      </p>

      <h2>Quién opera Daymark</h2>
      <p>
        Daymark está operado por Sami Belhadj. Si tienes preguntas sobre esta política o sobre tu
        información, escribe a skylinelabdev@gmail.com.
      </p>

      <h2>Lo esencial</h2>
      <ul>
        <li>Daymark no tiene cuentas de usuario ni base de datos, y no opera su propio backend ni servidor de aplicaciones para cuentas, analíticas, almacenamiento o historial.</li>
        <li>La aplicación Daymark no incluye SDK de analíticas, publicidad ni seguimiento.</li>
        <li>
          Daymark no almacena por sí mismo tu ubicación, tus búsquedas, tu voz ni el historial del
          tiempo.
        </li>
        <li>
          Al abrir la aplicación, Daymark carga un pronóstico para su ubicación predeterminada. Cuando
          buscas otro lugar, actualizas las condiciones o utilizas la ubicación del dispositivo, las
          solicitudes meteorológicas o de búsqueda correspondientes se envían directamente desde tu
          navegador o aplicación instalada a Open-Meteo, un servicio meteorológico externo. Esto significa
          que tu ubicación aproximada, cuando eliges usarla, y el texto que escribes en la búsqueda de
          lugares salen de tu dispositivo y se envían a Open-Meteo cuando utilizas esas funciones.
        </li>
        <li>
          En la aplicación Android instalada, Ask Daymark transcribe el habla en tu dispositivo con un
          modelo de voz integrado en la aplicación. En la versión web/PWA, la entrada de voz utiliza el
          reconocimiento de voz de tu navegador, que puede enviar el audio al proveedor del navegador o
          del sistema operativo.
        </li>
        <li>
          La narración utiliza una voz local integrada para el inglés en Android, una voz Android
          instalada y disponible sin conexión para el francés y el español, y la síntesis de voz del
          navegador en la web.
        </li>
      </ul>

      <h2>Qué información procesa Daymark</h2>
      <p>Para mostrar el tiempo, Daymark procesa:</p>
      <ul>
        <li>
          la ubicación predeterminada que se muestra al abrir la aplicación (Londres), el lugar que
          buscas o la ubicación de tu dispositivo si la autorizas;
        </li>
        <li>las respuestas meteorológicas, de calidad del aire y de búsqueda de lugares que devuelve Open-Meteo;</li>
        <li>tus preferencias guardadas en el dispositivo, como el idioma.</li>
      </ul>
      <p>
        Esta información se procesa en tu navegador o en la aplicación instalada mientras usas Daymark.
        No se envía a ningún backend ni servidor de aplicaciones operado por Daymark, porque Daymark
        no tiene ninguno. Parte de ella sale de tu dispositivo y se envía a Open-Meteo: las coordenadas
        aproximadas utilizadas para un pronóstico basado en la ubicación, y el texto que escribes en la
        búsqueda de lugares. Esas solicitudes se describen a continuación.
      </p>

      <h2>Datos de ubicación</h2>
      <p>
        Daymark nunca solicita tu ubicación por iniciativa propia. Tu ubicación solo se utiliza si
        pulsas «Usar mi ubicación» y concedes el permiso.
      </p>
      <p>
        En la aplicación Android instalada, Daymark solicita únicamente ubicación aproximada:
        declara el permiso Android ACCESS_COARSE_LOCATION y no declara ACCESS_FINE_LOCATION.
        Daymark utiliza la estimación aproximada que devuelve Android sin redondearla más. En la versión
        web/PWA, la ubicación del dispositivo que devuelve el navegador se ajusta en el propio dispositivo
        a una cuadrícula de 0,025 grados (unos 2,8 km norte/sur y 1,7 km este/oeste cerca de Londres)
        antes de enviarse a Open-Meteo. Esto reduce la precisión, pero no anonimiza la solicitud: las
        coordenadas aproximadas salen de tu dispositivo y se envían a Open-Meteo, aunque Daymark no las
        guarde. La aplicación vuelve a su ubicación predeterminada cuando la recargas o vuelves a abrirla.
      </p>
      <p>
        Cuando usas la ubicación del dispositivo, Daymark también resuelve un nombre de localidad
        cercano (por ejemplo, un pueblo) localmente a partir de un conjunto de datos GeoNames estático.
        En la versión web/PWA, el conjunto de datos se descarga desde el sitio de Daymark y se guarda
        localmente en Cache Storage después del primer uso. En la aplicación Android instalada, se
        incluye en los recursos integrados de la aplicación. Ningún servicio de geocodificación inversa
        —incluido GeoNames— recibe tus coordenadas, y el resultado permanece en tu dispositivo.
      </p>

      <h2>Búsqueda de lugares</h2>
      <p>
        Cuando escribes en el cuadro de búsqueda, el texto que introduces sale de tu dispositivo y se
        envía al servicio de geocodificación de Open-Meteo para sugerir lugares coincidentes. Daymark
        no guarda tus búsquedas.
      </p>

      <h2>Servicios meteorológicos y de calidad del aire</h2>
      <p>
        Los pronósticos, los datos de calidad del aire y la búsqueda de lugares provienen de{' '}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>. Las
        solicitudes van directamente desde tu navegador o aplicación instalada a los servidores de
        Open-Meteo:
      </p>
      <ul>
        <li><code>api.open-meteo.com</code> — pronósticos</li>
        <li><code>air-quality-api.open-meteo.com</code> — calidad del aire</li>
        <li><code>geocoding-api.open-meteo.com</code> — búsqueda de lugares</li>
      </ul>
      <p>
        Las condiciones publicadas de Open-Meteo para su API gratuita no comercial indican que los
        registros del servidor utilizados para resolver problemas pueden contener información sensible,
        como coordenadas geográficas, y que los archivos de registro se eliminan después de 90 días.
        Esta conservación depende de Open-Meteo, no de Daymark. Consulta las
        <a href="https://open-meteo.com/en/terms" target="_blank" rel="noreferrer">condiciones y la política de privacidad de Open-Meteo</a>
        para más detalles.
      </p>

      <h2>Entrada de voz (Ask Daymark)</h2>
      <p>
        Ask Daymark es opcional. Solo se inicia cuando pulsas el botón del micrófono y concedes el
        permiso.
      </p>
      <p>
        En la aplicación Android instalada, el reconocimiento se ejecuta por completo en tu dispositivo:
        el modelo de voz Parakeet TDT 0.6B v3, integrado en la aplicación, transcribe tu habla localmente
        mediante el runtime sherpa-onnx. Daymark no envía tu audio a ningún servicio de voz ni a ningún
        servidor de Daymark. La transcripción se mantiene en memoria únicamente; Daymark no graba ni
        almacena tu audio de voz ni tus transcripciones.
      </p>
      <p>
        En la versión web/PWA, el reconocimiento de voz lo gestiona la interfaz SpeechRecognition o
        webkitSpeechRecognition de tu navegador. Según tu navegador, sistema operativo y configuración,
        ese servicio puede enviar tu audio al proveedor del navegador o de la plataforma, incluido un
        servicio remoto. Daymark no recibe el audio; el navegador le devuelve una transcripción para
        que pueda responder a la pregunta, y Daymark la mantiene en memoria sin almacenarla. Por tanto,
        la entrada de voz funciona de forma distinta en la aplicación Android y en la versión web/PWA,
        y esta política describe ambas. En Daymark 1.0.0, la aplicación Android también usaba esta vía
        de navegador/WebView, por lo que se aplicaba la misma advertencia sobre el proveedor.
      </p>

      <h2>Salida de voz (Hear today)</h2>
      <p>
        «Hear today» lee el boletín en voz alta. En la aplicación Android, la narración en inglés se
        genera en tu dispositivo mediante el modelo Kokoro integrado. El francés y el español usan una
        voz de síntesis de Android instalada, y Daymark solo selecciona una voz que no requiera conexión
        de red; el texto de la narración se entrega a esa voz instalada en tu dispositivo. Si no hay
        instalada ninguna voz sin conexión de ese tipo, Daymark indica que la narración no está
        disponible en lugar de usar una voz de red u otro servicio de voz. En la versión web, la narración
        utiliza la API de síntesis de voz del navegador, que puede usar una voz local o remota según el
        navegador y la configuración. Daymark no opera un servidor de voz ni almacena el texto de la
        narración. Los proveedores de navegador, sistema operativo y voces gestionan su propio
        procesamiento y sus propios datos de voz.
      </p>

      <h2>Información almacenada en tu dispositivo</h2>
      <p>
        Daymark guarda tu preferencia de idioma (inglés, francés o español) en el almacenamiento local
        de tu navegador con la clave <code>daymark.locale</code>. Es la única preferencia de usuario
        persistente que Daymark almacena intencionadamente. Permanece hasta que la cambies o borres el
        almacenamiento del navegador o del sitio. En la versión web/PWA, Daymark guarda el conjunto de
        datos estático de localidades en Cache Storage para consultas sin conexión; el service worker
        guarda por separado los archivos de la aplicación. La aplicación Android instalada utiliza el
        conjunto de datos incluido en sus recursos. Son recursos de la aplicación, no un historial de
        tus ubicaciones o del tiempo.
      </p>
      <p>
        Daymark no usa cookies, no usa el almacenamiento de sesión del navegador ni IndexedDB, y no
        conserva ningún historial de ubicaciones, búsquedas, transcripciones o del tiempo. En la versión
        web/PWA, el service worker guarda en caché los archivos de la aplicación (HTML, scripts, estilos,
        iconos y fuentes) para que pueda abrirse sin conexión; no guarda en caché las respuestas
        meteorológicas ni las de calidad del aire.
      </p>

      <h2>Servicios de terceros</h2>
      <ul>
        <li>Open-Meteo — tiempo, calidad del aire y búsqueda de lugares, como se describe arriba.</li>
        <li>
          GeoNames — nombres de localidades para la ubicación del dispositivo. En la versión web/PWA,
          el conjunto de datos estático se descarga desde el sitio de Daymark; en la aplicación Android
          instalada, se incluye en los recursos de la aplicación. La búsqueda se ejecuta en tu
          dispositivo; no se envían coordenadas a GeoNames.
        </li>
        <li>
          El servicio de voz de tu navegador — solo en la aplicación web, y solo cuando utilizas las
          funciones de voz opcionales. La entrada de voz en Android se ejecuta en tu dispositivo y no
          contacta con ningún servicio de voz. La narración francesa y española en Android utiliza
          únicamente una voz del sistema instalada y disponible sin conexión.
        </li>
        <li>
          Cloudflare Pages — alojamiento estático de la versión web/PWA. Cloudflare entrega el sitio y
          procesa metadatos de solicitud estándar, como la dirección IP, la URL solicitada y el agente
          de usuario, para la entrega, la seguridad y la prevención de abusos, conforme a su
          <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">política de privacidad</a>.
        </li>
        <li>
          El modelo de voz Parakeet y el runtime sherpa-onnx, incluidos en la aplicación Android y
          usados para reconocer el habla en tu dispositivo.
        </li>
      </ul>
      <p>
        Datos de localidades © <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>,
        usados bajo la licencia Creative Commons Attribution 4.0 (CC BY 4.0).
      </p>
      <p>
        Modelo de voz: <a href="https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3" target="_blank" rel="noreferrer">Parakeet TDT 0.6B v3</a> de
        NVIDIA Corporation, usado bajo la licencia Creative Commons Attribution 4.0 International
        (CC BY 4.0). Los pesos publicados se cuantizan a int8 para la inferencia en el dispositivo.
      </p>
      <p>
        La aplicación Daymark no incluye servicios externos de analítica, publicidad, píxeles de
        seguimiento ni SDK de rastreo. Open-Meteo se utiliza para el tiempo y la búsqueda de lugares; la
        aplicación web usa las funciones de voz del navegador, y la narración francesa y española en
        Android utiliza voces Android instaladas y disponibles sin conexión.
      </p>

      <h2>Analíticas, publicidad y seguimiento</h2>
      <p>
        La aplicación Daymark no incluye herramientas de analítica, publicidad, rastreadores ni SDK de
        telemetría. El alojamiento de la versión web/PWA procesa metadatos de solicitud estándar para
        la entrega y la seguridad, como se describe en Servicios de terceros.
      </p>

      <h2>Conservación de datos</h2>
      <p>
        Daymark no tiene cuentas ni base de datos y no opera su propio backend ni servidor de
        aplicaciones, por lo que no conserva tu ubicación,
        tus búsquedas, tu audio de voz, tus transcripciones ni el historial del tiempo. Tu preferencia
        de idioma permanece en tu dispositivo hasta que la cambies o borres el almacenamiento. Los
        proveedores externos fijan sus propios plazos de conservación; consulta sus políticas.
      </p>

      <h2>Seguridad</h2>
      <p>
        La versión web/PWA alojada se sirve mediante HTTPS y utiliza la política de seguridad de
        contenido configurada en el sitio. La aplicación Android instalada carga recursos locales
        integrados; las cabeceras de seguridad HTTP del sitio no se aplican dentro de su WebView, pero
        la página integrada incluye una etiqueta meta Content-Security-Policy equivalente. La
        aplicación es un conjunto de archivos estáticos, sin secretos ni backend o servidor de
        aplicaciones operado por Daymark.
      </p>

      <h2>Tratamiento internacional</h2>
      <p>
        Open-Meteo procesa las solicitudes meteorológicas y de búsqueda en sus propios servidores. En la
        aplicación web, el reconocimiento y la síntesis de voz del navegador pueden procesar el audio o
        la narración de forma remota, según el proveedor y la configuración. En la aplicación Android, la
        entrada de voz y la narración en inglés se procesan en tu dispositivo, y la narración francesa o
        española utiliza únicamente una voz instalada y disponible sin conexión. Las políticas de esos
        proveedores describen dónde y cómo se realiza ese procesamiento.
      </p>

      <h2>Privacidad de los niños</h2>
      <p>
        Daymark es una utilidad meteorológica para público general y no está diseñada específicamente
        para niños. No ofrece cuentas de usuario y Daymark no mantiene por sí misma perfiles,
        historiales de ubicación, historiales de búsqueda ni transcripciones de voz. Los niños deben
        usar los permisos de ubicación y micrófono con la supervisión adecuada cuando así lo exijan su
        dispositivo, su plataforma o la normativa local.
      </p>

      <h2>Tus opciones y controles</h2>
      <ul>
        <li>Puedes prescindir por completo de la geolocalización y buscar un lugar por su nombre.</li>
        <li>
          Puedes denegar o revocar el permiso de ubicación en los ajustes de tu navegador o
          dispositivo.
        </li>
        <li>Puedes no usar Ask Daymark y utilizar la aplicación sin entrada de voz.</li>
        <li>Puedes denegar o revocar el permiso del micrófono en cualquier momento.</li>
        <li>
          Puedes borrar la preferencia de idioma guardada borrando el almacenamiento de este sitio o
          aplicación en los ajustes de tu navegador o dispositivo.
        </li>
      </ul>

      <h2>Cambios en esta política</h2>
      <p>
        Si cambian las prácticas de Daymark con respecto a los datos, esta página se actualizará y se
        revisará la fecha de entrada en vigor.
      </p>

      <h2>Contacto</h2>
      <p>
        Preguntas o dudas: skylinelabdev@gmail.com — operado por Sami Belhadj.
      </p>
    </PrivacyPolicyLayout>
  );
}
