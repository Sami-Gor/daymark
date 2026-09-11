import { PrivacyPolicyLayout } from '@/pages/privacy-layout';

/*
 * Spanish privacy policy (/es/privacy). Meaning-for-meaning translation of the
 * English policy: same data practices, same Daymark-vs-third-party
 * distinction, same voice-processing caveat. No stronger or weaker claims.
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
      effectiveText="Fecha de entrada en vigor: 11 de septiembre de 2026"
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
          Para funcionar, Daymark envía las solicitudes que tú activas —por ejemplo, el pronóstico de
          un lugar que has elegido— directamente desde tu navegador a Open-Meteo, un servicio
          meteorológico externo.
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
          el lugar que eliges (mediante la búsqueda o la ubicación de tu dispositivo si lo autorizas);
        </li>
        <li>las respuestas meteorológicas, de calidad del aire y de búsqueda de lugares que devuelve Open-Meteo;</li>
        <li>tus preferencias guardadas en el dispositivo, como el idioma.</li>
      </ul>
      <p>
        Esta información existe en tu navegador mientras usas la aplicación. No se envía a ningún
        backend ni servidor de aplicaciones operado por Daymark, porque Daymark no tiene ninguno.
      </p>

      <h2>Datos de ubicación</h2>
      <p>
        Daymark nunca solicita tu ubicación por iniciativa propia. Tu ubicación solo se utiliza si
        pulsas «Usar mi ubicación» y concedes el permiso.
      </p>
      <p>
        En ese caso, tus coordenadas se redondean a dos decimales (aproximadamente 1 km) en tu
        dispositivo antes de enviarse a Open-Meteo para buscar tu pronóstico local y el nombre del
        lugar. Daymark no guarda tu ubicación; no se conserva entre visitas y la aplicación vuelve a
        su ubicación predeterminada cuando la recargas o vuelves a abrirla.
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
        solicitudes van directamente desde tu navegador a los servidores de Open-Meteo:
      </p>
      <ul>
        <li><code>api.open-meteo.com</code> — pronósticos</li>
        <li><code>air-quality-api.open-meteo.com</code> — calidad del aire</li>
        <li><code>geocoding-api.open-meteo.com</code> — búsqueda de lugares</li>
      </ul>
      <p>
        Como estas solicitudes las gestiona Open-Meteo, su tratamiento —incluida cualquier forma de
        registro o conservación— se rige por las políticas propias de Open-Meteo. Daymark no controla
        esas prácticas; consulta la información de privacidad y los términos de Open-Meteo en su
        sitio web.
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
        «Hear today» lee el pronóstico en voz alta mediante la síntesis de voz integrada en tu
        navegador o dispositivo. El texto del boletín lo procesa esa capacidad de la plataforma, no un
        servicio de voz operado por Daymark.
      </p>

      <h2>Información almacenada en tu dispositivo</h2>
      <p>
        Daymark guarda tu preferencia de idioma (inglés, francés o español) en el almacenamiento local
        de tu navegador con la clave <code>daymark.locale</code>. Es el único valor persistente de la
        aplicación que Daymark almacena intencionadamente. Permanece hasta que lo cambies o borres el
        almacenamiento de tu navegador o del sitio.
      </p>
      <p>
        Daymark no usa cookies, no usa el almacenamiento de sesión del navegador ni IndexedDB, y no
        conserva ningún historial de ubicaciones, búsquedas, transcripciones o del tiempo. El service
        worker de Daymark almacena en caché los archivos de la propia aplicación (HTML, scripts,
        estilos, iconos y fuentes) para que la aplicación pueda abrirse sin conexión; no almacena en
        caché las respuestas del tiempo ni de calidad del aire.
      </p>

      <h2>Servicios de terceros</h2>
      <ul>
        <li>Open-Meteo — tiempo, calidad del aire y búsqueda de lugares, como se describe arriba.</li>
        <li>
          Los servicios de voz de tu navegador o dispositivo — solo cuando utilizas las funciones de
          voz opcionales.
        </li>
      </ul>
      <p>
        Daymark no utiliza analíticas, publicidad, píxeles de seguimiento ni ningún otro servicio
        externo.
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
        Daymark se sirve a través de HTTPS y aplica una política de seguridad de contenido estricta.
        La aplicación es un conjunto de archivos estáticos, sin secretos ni backend o servidor de
        aplicaciones operado por Daymark.
      </p>

      <h2>Tratamiento internacional</h2>
      <p>
        Open-Meteo y los servicios de voz de tu navegador o dispositivo pueden procesar datos en
        servidores situados en distintos países. Sus propias políticas describen dónde y cómo ocurre.
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
