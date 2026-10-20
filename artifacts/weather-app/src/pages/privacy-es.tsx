import { PrivacyPolicyLayout } from '@/pages/privacy-layout';

/*
 * Spanish privacy policy (/es/privacy). Meaning-for-meaning translation of the
 * English policy: same data practices, same Daymark-vs-third-party
 * distinction, same voice-processing caveat. Forecast loading includes the
 * default place on app open; optional location and voice flows are separate.
 * No stronger or weaker claims.
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
      effectiveText="Fecha de entrada en vigor: 11 de octubre de 2026"
      tagline="Daymark — el tiempo, de forma sencilla"
    >
      <p>
        Daymark es una aplicación del tiempo que funciona por completo en tu navegador o como
        aplicación instalada. Esta política explica, en lenguaje sencillo, qué información interviene
        cuando la utilizas.
      </p>

      <h2>Quién opera Daymark</h2>
      <p>
        Daymark está operado por Sami Belhadj. Si tienes preguntas sobre esta política o sobre tu
        información, escribe a skylinelabdev@gmail.com.
      </p>

      <h2>Lo esencial</h2>
      <ul>
        <li>Daymark no tiene cuentas de usuario ni base de datos, y no opera su propio backend ni servidor de aplicaciones para cuentas, analíticas, almacenamiento o historial.</li>
        <li>Daymark no utiliza analíticas, publicidad ni seguimiento.</li>
        <li>
          Daymark no almacena por sí mismo tu ubicación, tus búsquedas, tu voz ni el historial del
          tiempo.
        </li>
        <li>
          Al abrir la aplicación, Daymark carga un pronóstico para su ubicación predeterminada. Cuando
          buscas otro lugar, actualizas las condiciones o utilizas la ubicación del dispositivo, las
          solicitudes meteorológicas o de búsqueda correspondientes se envían directamente desde tu
          navegador o aplicación instalada a Open-Meteo, un servicio meteorológico externo.
        </li>
        <li>
          Las funciones de voz opcionales dependen de las capacidades de voz de tu navegador o
          dispositivo.
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
        no tiene ninguno.
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
        antes de enviarse a Open-Meteo. Esto reduce la precisión, pero no anonimiza la solicitud.
        Daymark no guarda tu ubicación y la aplicación vuelve a su ubicación predeterminada cuando la
        recargas o vuelves a abrirla.
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
        Cuando escribes en el cuadro de búsqueda, tu texto se envía al servicio de geocodificación de
        Open-Meteo para sugerir lugares coincidentes. Daymark no guarda tus búsquedas.
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
        permiso. El reconocimiento de voz lo gestiona tu navegador o dispositivo y puede usar su
        servicio de voz. Según tu navegador, sistema operativo y configuración, el audio puede ser
        procesado por el proveedor de la plataforma. Daymark no graba ni almacena tu audio de voz ni
        tus transcripciones, y ningún backend ni servidor de aplicaciones de Daymark las recibe.
      </p>

      <h2>Salida de voz (Hear today)</h2>
      <p>
        «Hear today» lee el boletín en voz alta. En la aplicación Android, la narración en inglés
        se genera en el dispositivo mediante el modelo Kokoro integrado; el francés y el español usan
        la síntesis de voz del sistema Android. En la versión web, la narración utiliza la API de
        síntesis de voz del navegador. El tratamiento por los proveedores de voz del navegador o del
        sistema depende del dispositivo, la configuración y la voz elegida. Daymark no opera un
        servidor de voz ni almacena el texto de la narración.
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
          funciones de voz opcionales. La aplicación Android reconoce el habla en tu dispositivo y no
          contacta con ningún servicio de voz.
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
        Daymark no utiliza servicios externos de analítica, publicidad, píxeles de seguimiento ni
        rastreo. Open-Meteo y el servicio de voz del navegador son servicios externos utilizados para
        las funciones descritas arriba. En la aplicación Android, el reconocimiento de voz se ejecuta
        en tu dispositivo.
      </p>

      <h2>Analíticas, publicidad y seguimiento</h2>
      <p>
        No incluye nada de esto. No hay herramientas de analítica, publicidad, rastreadores ni
        telemetría.
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
        integrados; las cabeceras de seguridad HTTP del sitio no se aplican dentro de su WebView.
        La aplicación es un conjunto de archivos estáticos, sin secretos ni backend o servidor de
        aplicaciones operado por Daymark.
      </p>

      <h2>Tratamiento internacional</h2>
      <p>
        Open-Meteo procesa las solicitudes meteorológicas y de búsqueda en sus propios servidores.
        Los servicios de voz de tu navegador o dispositivo también pueden procesar la entrada de voz
        o el texto de la narración de forma remota, según el proveedor y la configuración. Las políticas
        de esos proveedores describen dónde y cómo se realiza ese procesamiento.
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
