import { PrivacyPolicyLayout } from '@/pages/privacy-layout';

/*
 * English privacy policy. This page describes verified production behaviour:
 * Daymark operates no backend or database of its own, so the important
 * distinction is between what Daymark itself stores (nothing but the language
 * preference) and what is transmitted to third-party services (Open-Meteo,
 * browser/device speech) when the user invokes a feature.
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
      effectiveText="Effective date: September 11, 2026"
      tagline="Daymark — weather, simply"
    >
      <p>
        Daymark is a weather app that runs entirely in your browser or installed app. This policy
        explains, in plain language, what information is involved when you use it.
      </p>

      <h2>Who operates Daymark</h2>
      <p>
        Daymark is operated by Sami Belhadj. For questions about this policy or your information,
        contact skylinelabdev@gmail.com.
      </p>

      <h2>The short version</h2>
      <ul>
        <li>Daymark has no user accounts or database, and does not operate its own backend or application server for accounts, analytics, storage, or history.</li>
        <li>Daymark does not use analytics, advertising, or tracking.</li>
        <li>Daymark itself does not store your location, searches, voice, or weather history.</li>
        <li>
          To work, Daymark sends the requests you trigger — such as a forecast for a place you chose —
          directly from your browser to Open-Meteo, a third-party weather service.
        </li>
        <li>Optional voice features rely on your browser&rsquo;s or device&rsquo;s own speech capabilities.</li>
      </ul>

      <h2>What information Daymark processes</h2>
      <p>To show weather, Daymark processes:</p>
      <ul>
        <li>the place you choose (from search, or from your device&rsquo;s location if you allow it);</li>
        <li>the weather, air-quality, and place-search responses returned by Open-Meteo;</li>
        <li>your on-device preferences, such as language.</li>
      </ul>
      <p>
        This information exists in your browser while you use the app. It is not sent to any backend
        or application server operated by Daymark, because Daymark does not operate one.
      </p>

      <h2>Location data</h2>
      <p>
        Daymark never asks for your location on its own. Your location is used only if you press
        &ldquo;Use my location&rdquo; and grant permission.
      </p>
      <p>
        When you do, your coordinates are rounded to two decimal places (roughly 1 km) on your device
        before being sent to Open-Meteo to look up your local forecast. Daymark does not save your
        location; it is not kept between visits, and the app returns to its default location when you
        reload or reopen it.
      </p>
      <p>
        When you use device location, Daymark also resolves a nearby locality name (for example, a
        town name) entirely in your browser, from a static GeoNames dataset served by Daymark and
        cached on your device after first use. No reverse-geocoding service — including GeoNames —
        receives your coordinates, and the lookup result stays on your device.
      </p>

      <h2>Location search</h2>
      <p>
        When you type in the search box, your search text is sent to Open-Meteo&rsquo;s geocoding
        service to suggest matching places. Daymark does not save your searches.
      </p>

      <h2>Weather and air-quality services</h2>
      <p>
        Forecasts, air-quality data, and place search come from{' '}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>. Requests go
        directly from your browser to Open-Meteo&rsquo;s servers:
      </p>
      <ul>
        <li><code>api.open-meteo.com</code> — forecasts</li>
        <li><code>air-quality-api.open-meteo.com</code> — air quality</li>
        <li><code>geocoding-api.open-meteo.com</code> — place search</li>
      </ul>
      <p>
        Because these requests are handled by Open-Meteo, their processing — including any logging or
        retention — is governed by Open-Meteo&rsquo;s own policies. Daymark does not control those
        practices; please review Open-Meteo&rsquo;s privacy and terms information on their website.
      </p>

      <h2>Voice input (Ask Daymark)</h2>
      <p>
        Ask Daymark is optional. It starts only when you press the microphone button and grant
        permission. Voice recognition is handled by your browser or device and may use its speech
        service. Depending on your browser, operating system, and configuration, audio may be
        processed by the platform provider. Daymark does not record or store your voice audio or
        speech transcripts, and there is no Daymark-operated backend or application server that
        receives them.
      </p>

      <h2>Voice output (Hear today)</h2>
      <p>
        &ldquo;Hear today&rdquo; reads the forecast aloud using your browser&rsquo;s or device&rsquo;s
        built-in speech synthesis. The briefing text is processed by that platform capability, not by
        a Daymark-operated speech backend.
      </p>

      <h2>Information stored on your device</h2>
      <p>
        Daymark stores your language preference (English, French, or Spanish) in your browser&rsquo;s
        local storage under the key <code>daymark.locale</code>. That is the only persistent
        application value Daymark intentionally stores. It remains until you change it or clear your
        browser or site storage.
      </p>
      <p>
        Daymark does not use cookies, does not use browser session storage or IndexedDB, and does not
        keep a history of locations, searches, transcripts, or weather. Daymark&rsquo;s service worker
        caches the app&rsquo;s own files (HTML, scripts, styles, icons, and fonts) so the app can open
        offline; it does not cache weather or air-quality responses.
      </p>

      <h2>Third-party services</h2>
      <ul>
        <li>Open-Meteo — weather, air quality, and place search, as described above.</li>
        <li>
          GeoNames — locality names for device location. The dataset is downloaded from Daymark&rsquo;s
          own site and the lookup runs on your device; no coordinates are sent to GeoNames.
        </li>
        <li>
          Your browser&rsquo;s or device&rsquo;s speech services — only when you use the optional voice
          features.
        </li>
      </ul>
      <p>
        Locality data © <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>,
        used under the Creative Commons Attribution 4.0 licence (CC BY 4.0).
      </p>
      <p>
        Daymark does not use analytics, advertising, tracking pixels, or any other third-party
        service.
      </p>

      <h2>Analytics, advertising, and tracking</h2>
      <p>
        Daymark includes none. There are no analytics tools, no advertising, no trackers, and no
        telemetry.
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
        Daymark is served over HTTPS and enforces a strict content security policy. The app is a
        static bundle with no secrets and no backend or application server operated by Daymark.
      </p>

      <h2>International processing</h2>
      <p>
        Open-Meteo and your browser&rsquo;s or device&rsquo;s speech services may process data on
        servers in various countries. Their own policies describe where and how this happens.
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
