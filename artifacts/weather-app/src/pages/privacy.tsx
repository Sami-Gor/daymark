import { PrivacyPolicyLayout } from '@/pages/privacy-layout';

/*
 * English privacy policy for Daymark, corrected on 2026-11-04 to be
 * version-aware. The deployed web/PWA still runs V1 behaviour. Android V1
 * (versionCode 1) is described separately from Android V2 (versionCode 2,
 * Android 2.0.0), which was published as a GitHub release on 2026-11-04.
 *
 * This page deliberately separates Daymark-controlled processing from direct
 * Open-Meteo requests and web-host request metadata. It does not equate the
 * verified GitHub release bundle with a Play-served bundle, and it does not
 * present future-release plans as current capabilities.
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
      effectiveText="Effective date: October 29, 2026 · Last updated: November 4, 2026"
      tagline="Daymark — weather, simply"
    >
      <p>
        Daymark is a weather app available as a web/PWA and an Android app. The currently deployed
        web/PWA uses the V1 behaviour described below. On Android, V1 (versionCode 1, Android 1.0.0)
        may still be installed, and V2 (versionCode 2, Android 2.0.0) was published as a GitHub
        release on November 4, 2026. Each section below states which generation it describes. Most
        processing happens in your browser or installed app, but Daymark sends weather, air-quality,
        and place-search requests directly to Open-Meteo, and the website host processes ordinary
        request metadata. This policy explains those flows and your choices.
      </p>

      <h2>Who operates Daymark</h2>
      <p>
        Daymark is operated by Sami Belhadj. For questions about this policy or your information,
        contact
        <a href="mailto:skylinelabdev@gmail.com"> skylinelabdev@gmail.com</a>.
      </p>

      <h2>Which version applies</h2>
      <p>
        On Android, open Settings → Apps → Daymark → App info to see the installed version. Android
        1.0.0 uses versionCode 1 and is called V1 in this policy. Android 2.0.0 uses versionCode 2
        and is called V2. The web/PWA has no Android version code; the site that is currently
        deployed uses the V1 behaviour described below.
      </p>
      <p>
        V2.0.0 is a published release: the source is tagged v2.0.0 and a GitHub release was published
        on November 4, 2026. Google Play distribution of the verified release bundle is tracked
        separately and is not verified on this page. V1 may remain installed on a device; existing
        V1 installations are not deliberately disabled.
      </p>

      <h2>Android permissions by version</h2>
      <p>V1 (Android 1.0.0, versionCode 1) declares five Android permissions:</p>
      <ul>
        <li><code>INTERNET</code> — network access for forecasts, air quality, and place search</li>
        <li>
          <code>ACCESS_COARSE_LOCATION</code> — approximate device location when you choose
          &ldquo;Use my location&rdquo;
        </li>
        <li>
          <code>ACCESS_FINE_LOCATION</code> — precise device location (V1 only)
        </li>
        <li><code>RECORD_AUDIO</code> — voice input</li>
        <li><code>MODIFY_AUDIO_SETTINGS</code> — audio settings used by the voice features</li>
      </ul>
      <p>V2 (Android 2.0.0, versionCode 2) declares exactly four Android permissions:</p>
      <ul>
        <li><code>INTERNET</code> — network access for forecasts, air quality, and place search</li>
        <li>
          <code>ACCESS_COARSE_LOCATION</code> — approximate device location when you choose
          &ldquo;Use my location&rdquo;
        </li>
        <li><code>RECORD_AUDIO</code> — voice input</li>
        <li><code>MODIFY_AUDIO_SETTINGS</code> — audio settings used by the voice features</li>
      </ul>
      <p>
        V2 does not declare or receive a precise-location permission. The web/PWA has no Android
        manifest; your browser asks for location or microphone access only when you use the
        corresponding control, and only if you grant it.
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
        For the currently deployed web/PWA and Android V1 (versionCode 1), device-derived weather
        coordinates are rounded to two decimal places (roughly 1 km) on the device before being sent
        to Open-Meteo. V1 Android requests both <code>ACCESS_COARSE_LOCATION</code> and
        <code>ACCESS_FINE_LOCATION</code>, but the weather request uses the rounded coordinates.
        Daymark does not save your location; it returns to the default London location when you
        reload or reopen it.
      </p>
      <p>
        Android V2 (versionCode 2) does not receive a precise-location permission: it declares
        <code>ACCESS_COARSE_LOCATION</code> only, never sends the raw device fix to Open-Meteo, and
        snaps device-derived coordinates to a 0.025-degree grid with a 0.025-degree minimum latitude
        step on the device before sending them. Above roughly 67° latitude, the longitude spacing
        widens just enough to keep the represented cell at least 3 km²; the latitude step never goes
        below 0.025°. Near London this is roughly 2.8 km north/south and 1.7 km east/west (about
        4.8 km²); at high latitude the longitude spacing may be wider. The grid reduces precision but
        does not anonymise the request: the rounded coordinates still leave your device and are sent
        to Open-Meteo. The currently deployed web/PWA does not use this grid; it keeps the
        two-decimal rounding described above.
      </p>
      <p>
        For device location, Daymark also resolves a nearby locality name (for example, a town name)
        locally from a static GeoNames dataset. The web/PWA downloads the dataset from Daymark&rsquo;s
        site and caches it locally; the Android app includes it in bundled assets. No reverse-geocoding
        service, including GeoNames, receives your coordinates.
      </p>

      <h2>Current web/PWA</h2>
      <p>
        The deployed web/PWA includes the optional Ask Daymark microphone control and the
        &ldquo;Hear today&rdquo; narration control. It uses the browser&rsquo;s or device&rsquo;s
        speech-recognition and speech-synthesis services for those features. Daymark does not
        record or store your voice audio or speech transcripts. It does not use the
        Android Parakeet or Kokoro engines, and its weather requests use the two-decimal rounding
        described above. The Android V2 voice and location-grid behaviour does not apply to the
        deployed web/PWA.
      </p>

      <h2>Android V2 voice input (Ask Daymark)</h2>
      <p>
        On Android V2, Ask Daymark is optional. It starts only when you press the microphone button
        and grant microphone permission. Recognition uses the bundled Parakeet TDT 0.6B v3 int8 model
        through the sherpa-onnx runtime on the device. Audio is captured temporarily during that
        user-initiated session and held in memory for recognition; Daymark does not intentionally
        record or persist the audio or the resulting transcript, and does not send either to a
        Daymark speech server. The Android V2 voice path has no Android SpeechRecognizer,
        browser-speech, or online-recogniser fallback in the code. This is a source-level and
        automated-test statement, not an independently verified packet-level zero-egress claim. V1
        Android and the deployed web/PWA use browser/WebView speech recognition instead.
      </p>

      <h2>Android V2 narration</h2>
      <p>
        On Android V2, English narration is generated on your device by the bundled Kokoro model.
        Daymark does not store narration text. French and Spanish narration is not available in
        Android V2; Daymark shows an unavailable message and does not fall back to Android system
        TTS, a network voice, or browser speech synthesis. The deployed web/PWA uses browser/device
        speech synthesis, and V1 Android can use Android system TTS.
      </p>

      <h2>Information stored on your device</h2>
      <p>
        Daymark stores the language code in local storage under <code>daymark.locale</code>. Android
        V2 also stores one private app-state value in SharedPreferences named
        <code>daymark.permissions</code>: the boolean <code>microphone-requested</code>, used only to
        avoid repeatedly prompting for microphone permission after it has already been requested or
        denied. The currently deployed web/PWA and V1 Android store the locale preference and
        application caches, not the V2 permission flag. None of these values is location, search,
        transcript, or weather history, and Daymark stores none of those histories. The web/PWA
        service worker caches app-shell resources, and the locality lookup uses Cache Storage for the
        static dataset; those are application resources, not user history. The Android app loads the
        locality dataset from bundled assets.
      </p>
      <p>
        Daymark&rsquo;s app code does not use cookies, browser session storage, or IndexedDB for user
        state. You can clear the locale preference and application caches by clearing this
        site&rsquo;s or app&rsquo;s storage in your browser or device settings. Clearing local
        storage does not automatically delete data already retained by third-party providers such as
        Open-Meteo.
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
          Android V2 bundles the Parakeet speech model, Kokoro narration model, and sherpa-onnx runtime
          with the app or delivers them as app assets. They run on the device for the features
          described above. The deployed web/PWA and V1 Android do not use these bundled engines.
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
        Android V2 (Android 2.0.0, versionCode 2) is intended for adults aged 18 and over and is not
        directed to children. This is a Google Play target-audience declaration for V2, not a
        technical access restriction or an age gate; Daymark does not claim that no minor can access
        the app. The distributed V1 build was offered as a general-audience weather utility. Neither
        version has user accounts, and Daymark does not maintain profiles, location histories, search
        histories, or voice-transcript histories. Daymark does not use advertising or tracking IDs.
        The app does not ask for a date of birth. Selecting an adult audience does not by itself
        resolve any separate legal or regulatory assessment, including the UK Children&rsquo;s Code
        where applicable.
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
        Daymark is operated by Sami Belhadj.
      </p>
    </PrivacyPolicyLayout>
  );
}
