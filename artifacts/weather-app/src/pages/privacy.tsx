import { PrivacyPolicyLayout } from '@/pages/privacy-layout';

/*
 * English privacy policy. This page describes Daymark 2.0.0 and records the
 * differences from released 1.0.0 in the version note. Daymark operates no
 * backend or database of its own, so the important distinction is between what
 * Daymark itself stores (the language preference plus non-user-history app
 * resources) and what is transmitted to third-party services (Open-Meteo,
 * browser speech in the web/PWA app, installed Android text-to-speech voices)
 * during normal use, including the default forecast request and optional
 * location/voice features.
 */

export default function Privacy() {
  return (
    <PrivacyPolicyLayout
      lang="en"
      documentTitle="Privacy Policy — Daymark"
      title="Privacy Policy"
      brandNote="Privacy Policy"
      backLabel="← Back to weather"
      switcherLabel="Policy language"
      effectiveText="Effective date: October 11, 2026 · Last updated: October 21, 2026"
      tagline="Daymark — weather, simply"
    >
      <p>
        Daymark is a weather app that runs entirely in your browser or installed app. This policy
        explains, in plain language, what information is involved when you use it.
      </p>

      <h2>Versions of Daymark</h2>
      <p>
        This policy describes Daymark 2.0.0 and the current web/PWA build. Daymark 1.0.0, which may
        still be installed on a device or available until it is replaced, behaves differently in three
        ways. On Android, it requested precise location (<code>ACCESS_FINE_LOCATION</code> as well as{' '}
        <code>ACCESS_COARSE_LOCATION</code>) and rounded coordinates to two decimal places before
        sending them to Open-Meteo. Ask Daymark used the browser or WebView speech recognition
        described below, not the bundled Parakeet model. On Android, French and Spanish narration
        could use the device&rsquo;s default text-to-speech voice, which may have required a network
        connection. If you are using Daymark 1.0.0, those behaviours apply.
      </p>

      <h2>Who operates Daymark</h2>
      <p>
        Daymark is operated by Sami Belhadj. For questions about this policy or your information,
        contact skylinelabdev@gmail.com.
      </p>

      <h2>The short version</h2>
      <ul>
        <li>Daymark has no user accounts or database, and does not operate its own backend or application server for accounts, analytics, storage, or history.</li>
        <li>The Daymark app includes no analytics, advertising, or tracking SDKs.</li>
        <li>Daymark itself does not store your location, searches, voice, or weather history.</li>
        <li>
          Daymark loads a forecast for its default place when the app opens. When you search for another
          place, refresh conditions, or use device location, the corresponding weather or place-search
          requests are sent directly from your browser or installed app to Open-Meteo, a third-party weather service.
          This means your approximate location, when you choose to use it, and the text you type into place
          search leave your device and are sent to Open-Meteo when you use those features.
        </li>
        <li>
          In the installed Android app, Ask Daymark transcribes speech on your device with a speech model
          bundled with the app. In the web/PWA app, voice input uses your browser&rsquo;s speech recognition,
          which may send audio to your browser or operating-system provider.
        </li>
        <li>
          Narration uses a bundled local voice for English on Android, an installed offline Android voice for
          French and Spanish, and your browser&rsquo;s speech synthesis on the web.
        </li>
      </ul>

      <h2>What information Daymark processes</h2>
      <p>To show weather, Daymark processes:</p>
      <ul>
        <li>the default place shown when the app opens (London), a place you search for, or your device&rsquo;s location if you allow it;</li>
        <li>the weather, air-quality, and place-search responses returned by Open-Meteo;</li>
        <li>your on-device preferences, such as language.</li>
      </ul>
      <p>
        This information is processed in your browser or installed app while you use Daymark. It is
        not sent to any backend or application server operated by Daymark, because Daymark does not
        operate one. Some of it is sent off your device to Open-Meteo: the approximate coordinates
        used for a device-location forecast, and the text you type into place search. Those requests
        are described below.
      </p>

      <h2>Location data</h2>
      <p>
        Daymark never asks for your location on its own. Your location is used only if you press
        &ldquo;Use my location&rdquo; and grant permission.
      </p>
      <p>
        In the installed Android app, Daymark requests approximate location only: it declares
        Android&rsquo;s ACCESS_COARSE_LOCATION permission and does not declare ACCESS_FINE_LOCATION.
        Daymark uses the approximate estimate returned by Android without further rounding. In the
        web/PWA version, the browser&rsquo;s device location is snapped on your device to a 0.025-degree
        grid (about 2.8 km north/south and 1.7 km east/west near London) before it is sent to Open-Meteo.
        This reduces precision; it does not anonymise the request. The approximate coordinates still
        leave your device and are sent to Open-Meteo. Daymark itself does not save your location, and
        the app returns to its default location when you reload or reopen it.
      </p>
      <p>
        When you use device location, Daymark also resolves a nearby locality name (for example, a
        town name) locally from a static GeoNames dataset. In the web/PWA version, the dataset is
        downloaded from Daymark&rsquo;s site and the app caches it locally in Cache Storage after first
        use. In the installed Android app, the dataset is included with the app&rsquo;s bundled assets.
        No reverse-geocoding service — including GeoNames — receives your coordinates, and the lookup
        result stays on your device.
      </p>

      <h2>Location search</h2>
      <p>
        When you type in the search box, the text you enter leaves your device and is sent to
        Open-Meteo&rsquo;s geocoding service to suggest matching places. Daymark does not save your
        searches.
      </p>

      <h2>Weather and air-quality services</h2>
      <p>
        Forecasts, air-quality data, and place search come from{' '}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>. Requests go
        directly from your browser or installed app to Open-Meteo&rsquo;s servers:
      </p>
      <ul>
        <li><code>api.open-meteo.com</code> — forecasts</li>
        <li><code>air-quality-api.open-meteo.com</code> — air quality</li>
        <li><code>geocoding-api.open-meteo.com</code> — place search</li>
      </ul>
      <p>
        Open-Meteo&rsquo;s published terms for its free non-commercial API say that troubleshooting
        server logs may contain sensitive information such as geographic coordinates and that log files
        are deleted after 90 days. This retention is controlled by Open-Meteo, not Daymark. Please check
        Open-Meteo&rsquo;s current <a href="https://open-meteo.com/en/terms" target="_blank" rel="noreferrer">Terms &amp; Privacy</a>
        for details.
      </p>

      <h2>Voice input (Ask Daymark)</h2>
      <p>
        Ask Daymark is optional. It starts only when you press the microphone button and grant
        permission.
      </p>
      <p>
        In the installed Android app, recognition runs entirely on your device: the Parakeet
        TDT 0.6B v3 speech model, bundled with the app, transcribes your speech locally through the
        sherpa-onnx runtime. Daymark does not send your audio to a speech service or to any Daymark
        server. The transcript is held in memory only; Daymark does not record or store your voice
        audio or speech transcripts.
      </p>
      <p>
        In the web/PWA app, voice recognition is handled by your browser&rsquo;s SpeechRecognition or
        webkitSpeechRecognition interface. Depending on your browser, operating system, and
        configuration, that service may send your audio to the browser or platform provider for
        processing, including a remote service. Daymark does not receive the audio; the browser
        returns a transcript to Daymark so it can answer the question, and Daymark holds that
        transcript in memory without storing it. The Android app and the web/PWA app therefore have
        different voice-input behaviour, and this policy describes both. In Daymark 1.0.0, the
        Android app used this browser/WebView path too, so the same provider caveat applied there.
      </p>

      <h2>Voice output (Hear today)</h2>
      <p>
        &ldquo;Hear today&rdquo; reads the briefing aloud. In the Android app, English narration is
        generated on your device by the bundled Kokoro model. French and Spanish use an installed Android
        system text-to-speech voice, and Daymark selects only a voice that does not require a network
        connection; the narration text is passed to that installed voice on your device. If no such
        offline voice is installed, Daymark reports that narration is unavailable instead of using a
        network voice or another speech service. In the web app, narration uses the browser&rsquo;s
        speech-synthesis API, which may use a local or remote voice depending on your browser and
        settings. Daymark does not operate a speech backend or store narration text. Browser,
        operating-system, and voice providers manage their own processing and voice data.
      </p>

      <h2>Information stored on your device</h2>
      <p>
        Daymark stores your language preference (English, French, or Spanish) in your browser&rsquo;s
        local storage under the key <code>daymark.locale</code>. This is the only persistent user
        preference Daymark intentionally stores. It remains until you change it or clear your browser
        or site storage. In the web/PWA version, Daymark caches the static locality dataset in Cache
        Storage for offline lookup, while the service worker separately caches app-shell files. The
        installed Android app loads the locality dataset from bundled assets. These are application
        resources, not a history of your locations or weather.
      </p>
      <p>
        Daymark does not use cookies, does not use browser session storage or IndexedDB, and does not
        keep a history of locations, searches, transcripts, or weather. In the web/PWA version,
        Daymark&rsquo;s service worker caches the app&rsquo;s own files (HTML, scripts, styles, icons,
        and fonts) so the app can open offline; it does not cache weather or air-quality responses.
      </p>

      <h2>Third-party services</h2>
      <ul>
        <li>Open-Meteo — weather, air quality, and place search, as described above.</li>
        <li>
          GeoNames — locality names for device location. In the web/PWA version, the static dataset
          is downloaded from Daymark&rsquo;s site; in the installed Android app it is bundled with the
          app. The lookup runs on your device; no coordinates are sent to GeoNames.
        </li>
        <li>
          Your browser&rsquo;s speech service — only in the web app, and only when you use the
          optional voice features. The Android app recognises speech on your device and does not
          contact a speech service. Android French and Spanish narration uses only an installed
          offline Android voice.
        </li>
        <li>
          Cloudflare Pages — static hosting for the web/PWA. Cloudflare delivers the site and
          processes standard request metadata, such as IP address, requested URL and user agent, for
          delivery, security and abuse prevention under its own{' '}
          <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">privacy policy</a>.
        </li>
        <li>
          The Parakeet speech model and the sherpa-onnx runtime, bundled with the Android app and
          used to recognise speech on your device.
        </li>
      </ul>
      <p>
        Locality data © <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>,
        used under the Creative Commons Attribution 4.0 licence (CC BY 4.0).
      </p>
      <p>
        Speech model: <a href="https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3" target="_blank" rel="noreferrer">Parakeet TDT 0.6B v3</a> by
        NVIDIA Corporation, used under the Creative Commons Attribution 4.0 International Licence
        (CC BY 4.0). The published weights are quantised to int8 for on-device inference.
      </p>
      <p>
        The Daymark app does not include third-party analytics, advertising, tracking pixels, or
        tracking SDKs. Open-Meteo is used for weather and place search; the web app uses browser
        speech capabilities, and Android French and Spanish narration uses installed offline Android
        voices.
      </p>

      <h2>Analytics, advertising, and tracking</h2>
      <p>
        The Daymark app includes no analytics tools, advertising, trackers, or telemetry SDKs. The
        web/PWA host processes standard request metadata for delivery and security, as described
        under Third-party services.
      </p>

      <h2>Data retention</h2>
      <p>
        Daymark has no accounts or database and does not operate its own backend or application
        server, so it does not retain your location, searches, voice audio, transcripts, or weather
        history. Your language preference stays on your device until you change it or clear storage.
        Third-party providers set their own retention periods; please see their policies.
      </p>

      <h2>Security</h2>
      <p>
        The hosted web/PWA version is served over HTTPS and uses the site's configured content
        security policy. The installed Android app loads bundled local assets; the website's HTTP
        security headers do not apply inside its WebView, but the bundled page carries an equivalent
        Content-Security-Policy meta tag. The app is a static bundle with no secrets and no backend
        or application server operated by Daymark.
      </p>

      <h2>International processing</h2>
      <p>
        Open-Meteo processes weather and search requests on its own servers. In the web app, browser
        speech recognition and speech synthesis may process audio or narration remotely, depending on
        the provider and settings. In the Android app, voice input and English narration are processed
        on your device, and French or Spanish narration uses only an installed offline voice. Those
        providers&rsquo; own policies describe where and how such processing happens.
      </p>

      <h2>Children&rsquo;s privacy</h2>
      <p>
        Daymark is a general-audience weather utility and is not specifically designed for children.
        It does not provide user accounts, and Daymark itself does not maintain profiles, location
        histories, search histories, or voice-transcript histories. Children should use location and
        microphone permissions with appropriate supervision where required by their device, platform,
        or local rules.
      </p>

      <h2>Your choices and controls</h2>
      <ul>
        <li>You can skip geolocation entirely and search for a place by name.</li>
        <li>You can deny or revoke location permission in your browser or device settings.</li>
        <li>You can avoid Ask Daymark and use the app without voice input.</li>
        <li>You can deny or revoke microphone permission at any time.</li>
        <li>
          You can clear the stored language preference by clearing this site&rsquo;s or app&rsquo;s
          storage in your browser or device settings.
        </li>
      </ul>

      <h2>Changes to this policy</h2>
      <p>
        If Daymark&rsquo;s data practices change, this page will be updated and the effective date
        revised.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or concerns: skylinelabdev@gmail.com — operated by Sami Belhadj.
      </p>
    </PrivacyPolicyLayout>
  );
}
