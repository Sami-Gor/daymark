import { PrivacyPolicyLayout } from '@/pages/privacy-layout';

/*
 * English privacy policy for Daymark V2 (2.0.0).
 *
 * This page is the source for the web/PWA and Android policy. It deliberately
 * separates Daymark-controlled processing from direct Open-Meteo requests and
 * web-host request metadata, and it does not present V2.2 plans as current
 * capabilities.
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
      effectiveText="Effective date: October 27, 2026 · Last updated: October 27, 2026"
      tagline="Daymark — weather, simply"
    >
      <p>
        Daymark is a weather app for a limited web/PWA demo and a fuller Android app. Most
        processing happens in your browser or installed app, but Daymark sends weather,
        air-quality, and place-search requests directly to Open-Meteo, and the website host
        processes ordinary request metadata. This policy explains those flows and the choices
        available to you.
      </p>

      <h2>Who operates Daymark</h2>
      <p>
        Daymark is operated by Sami. For questions about this policy or your information, contact
        <a href="mailto:skylinelabdev@gmail.com"> skylinelabdev@gmail.com</a>.
      </p>

      <h2>V2 and V1 transition</h2>
      <p>
        This policy describes Daymark V2 (version 2.0.0) on the web/PWA and Android. Daymark 1.0.0
        may remain installed on a device, or available through Google Play, until V2 reaches its full
        production release. When V2 is fully released, V1 will be removed from Google Play and
        official support for V1 will end. Existing V1 installations will not be deliberately disabled.
      </p>
      <p>
        V1 behaved differently: its Android build requested precise location as well as approximate
        location, used browser/WebView speech recognition for voice input, and could use the device&rsquo;s
        default Android text-to-speech voice for French and Spanish narration. Those V1 behaviours
        apply only while a V1 installation is in use.
      </p>

      <h2>Weather and place-search requests</h2>
      <p>
        When the app opens, Daymark loads a forecast for London, its default place. That request is
        sent directly from your browser or installed app to Open-Meteo and does not require location
        permission.
      </p>
      <p>
        Weather, air-quality, and place-search data come from
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>. Requests go
        directly to:
      </p>
      <ul>
        <li><code>api.open-meteo.com</code> — forecasts</li>
        <li><code>air-quality-api.open-meteo.com</code> — air quality</li>
        <li><code>geocoding-api.open-meteo.com</code> — place search</li>
      </ul>
      <p>
        When you type in the search box, the text you enter is sent to Open-Meteo&rsquo;s geocoding
        service to suggest matching places. Daymark does not save your searches. Daymark does not
        operate a backend or application server for accounts, weather history, searches, or voice data.
      </p>

      <h2>Location data</h2>
      <p>
        Daymark does not request location on load. Your device location is used only when you press
        &ldquo;Use my location&rdquo; and grant permission. You can skip location entirely and use the
        default place or search for a place.
      </p>
      <p>
        The Android app declares <code>ACCESS_COARSE_LOCATION</code> only and does not declare
        <code>ACCESS_FINE_LOCATION</code>. Both Android and the web/PWA snap the device-derived
        coordinates to a 0.025-degree grid on your device before they are sent to Open-Meteo. Near
        London this is roughly 2.8 km north/south and 1.7 km east/west (about 4.8 km²). The grid reduces
        precision but does not anonymise the request: the rounded coordinates still leave your device
        and are sent to Open-Meteo. The app returns to its default London location when you reload or
        reopen it.
      </p>
      <p>
        For device location, Daymark also resolves a nearby locality name (for example, a town name)
        locally from a static GeoNames dataset. The web/PWA downloads the dataset from Daymark&rsquo;s
        site and caches it locally; the Android app includes it in bundled assets. No reverse-geocoding
        service, including GeoNames, receives your coordinates.
      </p>

      <h2>Web/PWA demo</h2>
      <p>
        The web/PWA build is a limited weather demo. It has no Ask Daymark microphone control and no
        &ldquo;Hear today&rdquo; narration control. It does not request microphone permission and does
        not invoke browser speech-recognition or speech-synthesis APIs. The Android app provides the
        full voice feature set described below.
      </p>

      <h2>Android voice input (Ask Daymark)</h2>
      <p>
        Ask Daymark is optional on Android. It starts only when you press the microphone button and
        grant microphone permission. Recognition uses the bundled Parakeet TDT 0.6B v3 int8 model
        through the sherpa-onnx runtime on the device. Audio is captured temporarily during that
        user-initiated session and held in memory for recognition; Daymark does not intentionally
        record or persist the audio or the resulting transcript, and does not send either to a Daymark
        speech server. The Android voice path has no Android SpeechRecognizer, browser-speech, or
        online-recogniser fallback in the code. This is a source-level and automated-test statement,
        not an independently verified packet-level zero-egress claim.
      </p>

      <h2>Android narration</h2>
      <p>
        English narration is generated on your device by the bundled Kokoro model. Daymark does not
        store narration text. French and Spanish narration is not available in V2 and is planned for
        V2.2; Daymark shows an unavailable message and does not fall back to Android system TTS, a
        network voice, or browser speech synthesis.
      </p>

      <h2>Information stored on your device</h2>
      <p>
        Daymark stores the language code in local storage under <code>daymark.locale</code>. The
        Android app also stores one private app-state value in SharedPreferences named
        <code>daymark.permissions</code>: the boolean <code>microphone-requested</code>, used only to
        avoid repeatedly prompting for microphone permission after it has already been requested or
        denied. Neither value is location,
        search, transcript, or weather history, and Daymark stores none of those histories. The web/PWA
        service worker caches app-shell resources, and the locality lookup uses Cache Storage for the
        static dataset; those are application resources, not user history. The Android app loads the
        locality dataset from bundled assets.
      </p>
      <p>
        Daymark&rsquo;s app code does not use cookies, browser session storage, or IndexedDB for user state. You can
        clear the locale preference and application caches by clearing this site&rsquo;s or app&rsquo;s
        storage in your browser or device settings. Clearing local storage does not automatically
        delete data already retained by third-party providers such as Open-Meteo.
      </p>

      <h2>Third parties and retention</h2>
      <ul>
        <li>
          Open-Meteo — weather, air quality, and place search. Its current published privacy notice says
          it acts as an independent data controller, may keep troubleshooting webserver logs containing
          sensitive information such as geographical coordinates, and deletes those log files after 90
          days. Open-Meteo also receives ordinary network request metadata, including the source IP
          address and requested URL, to serve the request. Daymark does not use the IP address to
          identify you or to determine your location; Open-Meteo&rsquo;s notice says it may process IP
          addresses for technical reasons. Daymark does not control that retention. Please check
          Open-Meteo&rsquo;s current
          <a href="https://open-meteo.com/en/terms" target="_blank" rel="noreferrer">Terms &amp; Privacy</a>.
        </li>
        <li>
          Cloudflare Pages — static hosting for the web/PWA. Cloudflare processes standard website
          request metadata such as IP address, requested URL, and user agent for delivery, security,
          and abuse prevention under its own
          <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">privacy policy</a>.
          Daymark does not claim a fixed Cloudflare retention period.
        </li>
        <li>
          GeoNames — the static locality dataset and local nearest-locality lookup. No coordinates are
          sent to GeoNames.
        </li>
        <li>
          The Parakeet speech model, Kokoro narration model, and sherpa-onnx runtime are bundled with the
          Android app or delivered as app assets. They run on the device for the features described
          above.
        </li>
      </ul>
      <p>
        Daymark does not include analytics, advertising, tracking pixels, or tracking SDKs. Daymark does
        not claim that every third-party service is independently secure or that all external processing
        is retained for zero days.
      </p>

      <h2>Security</h2>
      <p>
        The hosted web/PWA is served over HTTPS and uses the site&rsquo;s configured Content Security
        Policy. The installed Android app loads bundled local assets; the hosted site&rsquo;s HTTP
        security headers do not apply inside its WebView. Daymark is a static bundle with no secrets and
        no Daymark-operated backend. These are limited, verifiable properties; they are not a guarantee
        about third-party services or the entire device.
      </p>

      <h2>Age suitability</h2>
      <p>
        Daymark is intended for adults aged 18 and over and is not directed to children. This is a
        Google Play target-audience declaration, not a technical access restriction or an age gate;
        Daymark does not claim that no minor can access the app. It has no user accounts and Daymark
        does not maintain profiles, location histories, search histories, or voice-transcript
        histories. Daymark does not use advertising or tracking IDs. The app does not ask for a date
        of birth. Selecting an adult audience does not by itself resolve any separate legal or
        regulatory assessment, including the UK Children’s Code where applicable.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Use the default London forecast or place search without granting device location.</li>
        <li>Deny or revoke location permission in your browser or device settings.</li>
        <li>On Android, avoid Ask Daymark and use the weather features without microphone access.</li>
        <li>Deny or revoke microphone permission at any time.</li>
        <li>Clear the locale preference and application caches in your browser or device settings.</li>
      </ul>

      <h2>Changes and contact</h2>
      <p>
        If Daymark&rsquo;s practices change, this page will be updated and the effective date revised.
        Questions or concerns: <a href="mailto:skylinelabdev@gmail.com">skylinelabdev@gmail.com</a>.
        Daymark is operated by Sami.
      </p>
    </PrivacyPolicyLayout>
  );
}
