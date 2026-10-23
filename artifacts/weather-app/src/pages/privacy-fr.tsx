import { PrivacyPolicyLayout } from '@/pages/privacy-layout';

/*
 * French privacy policy (/fr/privacy). Meaning-for-meaning translation of the
 * English 2.0.0 policy, including its version note and its Daymark-vs-third-party
 * distinction; platform-specific voice processing is stated explicitly.
 * Forecast loading includes the default place on app open; optional location
 * and voice flows are separate. No stronger or weaker claims than the English
 * page.
 */

export default function PrivacyFr() {
  return (
    <PrivacyPolicyLayout
      lang="fr"
      documentTitle="Politique de confidentialité — Daymark"
      title="Politique de confidentialité"
      brandNote="Politique de confidentialité"
      backLabel="← Retour à la météo"
      switcherLabel="Langue de la politique"
      effectiveText="Date d’entrée en vigueur : 11 octobre 2026 · Dernière mise à jour : 21 octobre 2026"
      tagline="Daymark — la météo, simplement"
    >
      <p>
        Daymark est une application météo qui fonctionne entièrement dans votre navigateur ou en tant
        qu&rsquo;application installée. Cette politique explique, en termes simples, quelles
        informations sont concernées lorsque vous l&rsquo;utilisez.
      </p>

      <h2>Versions de Daymark</h2>
      <p>
        Cette politique décrit Daymark 2.0.0 et la version web/PWA actuelle. Daymark 1.0.0, qui peut
        encore être installée sur un appareil ou disponible jusqu&rsquo;à son remplacement, se
        comporte différemment sur trois points. Sur Android, elle demandait la localisation précise
        (<code>ACCESS_FINE_LOCATION</code> en plus d&rsquo;<code>ACCESS_COARSE_LOCATION</code>) et
        arrondissait les coordonnées à deux décimales avant de les envoyer à Open-Meteo. Ask Daymark
        utilisait la reconnaissance vocale du navigateur ou de la WebView décrite ci-dessous, et non
        le modèle Parakeet intégré. Sur Android, la narration en français et en espagnol pouvait
        utiliser la voix de synthèse par défaut de l&rsquo;appareil, qui peut nécessiter une connexion
        réseau. Si vous utilisez Daymark 1.0.0, ces comportements s&rsquo;appliquent.
      </p>

      <h2>Qui exploite Daymark</h2>
      <p>
        Daymark est exploité par Sami Belhadj. Pour toute question concernant cette politique ou vos
        informations, contactez skylinelabdev@gmail.com.
      </p>

      <h2>L&rsquo;essentiel</h2>
      <ul>
        <li>Daymark n&rsquo;a ni comptes utilisateur ni base de données, et n&rsquo;exploite pas son propre backend ni serveur d&rsquo;application pour les comptes, l&rsquo;analyse d&rsquo;audience, le stockage ou l&rsquo;historique.</li>
        <li>L&rsquo;application Daymark n&rsquo;intègre aucun SDK d&rsquo;analyse d&rsquo;audience, de publicité ou de suivi.</li>
        <li>
          Daymark ne conserve pas lui-même votre localisation, vos recherches, votre voix ou
          l&rsquo;historique météo.
        </li>
        <li>
          À l’ouverture de l’application, Daymark charge une prévision pour son lieu par défaut.
          Lorsque vous recherchez un autre lieu, actualisez les conditions ou utilisez la localisation
          de l’appareil, les requêtes météo ou de recherche correspondantes sont envoyées directement
          depuis votre navigateur ou votre application installée vers Open-Meteo, un service météo tiers.
          Cela signifie que votre position approximative, lorsque vous choisissez de l’utiliser, et le
          texte saisi dans la recherche de lieu quittent votre appareil et sont envoyés à Open-Meteo
          lorsque vous utilisez ces fonctions.
        </li>
        <li>
          Dans l’application Android installée, Ask Daymark transcrit la parole sur votre appareil à
          l’aide d’un modèle vocal intégré à l’application. Dans la version web/PWA, la saisie vocale
          utilise la reconnaissance vocale de votre navigateur, qui peut envoyer l’audio au fournisseur
          du navigateur ou du système d’exploitation.
        </li>
        <li>
          La narration utilise une voix locale intégrée pour l’anglais sur Android, une voix Android
          installée et disponible hors ligne pour le français et l’espagnol, et la synthèse vocale du
          navigateur sur le web.
        </li>
      </ul>

      <h2>Quelles informations Daymark traite</h2>
      <p>Pour afficher la météo, Daymark traite :</p>
      <ul>
        <li>
          le lieu par défaut affiché à l’ouverture de l’application (Londres), un lieu recherché, ou
          la localisation de votre appareil si vous l’autorisez ;
        </li>
        <li>les réponses météo, de qualité de l&rsquo;air et de recherche de lieux renvoyées par Open-Meteo ;</li>
        <li>vos préférences stockées sur l&rsquo;appareil, comme la langue.</li>
      </ul>
      <p>
        Ces informations sont traitées dans votre navigateur ou votre application installée pendant
        l’utilisation de Daymark. Elles ne sont envoyées à aucun backend ni serveur d’application
        exploité par Daymark, car Daymark n’en exploite aucun. Certaines quittent votre appareil et
        sont envoyées à Open-Meteo : les coordonnées approximatives utilisées pour une prévision basée
        sur la position, et le texte saisi dans la recherche de lieu. Ces requêtes sont décrites ci-dessous.
      </p>

      <h2>Données de localisation</h2>
      <p>
        Daymark ne demande jamais votre localisation de sa propre initiative. Votre localisation
        n&rsquo;est utilisée que si vous appuyez sur « Utiliser ma position » et accordez
        l&rsquo;autorisation.
      </p>
      <p>
        Dans l’application Android installée, Daymark demande uniquement une localisation approximative :
        l’application déclare la permission Android ACCESS_COARSE_LOCATION et ne déclare pas
        ACCESS_FINE_LOCATION. Daymark utilise l’estimation approximative fournie par Android sans
        l’arrondir davantage. Dans la version web/PWA, la position fournie par le navigateur est arrondie
        sur l’appareil à une grille de 0,025 degré (environ 2,8 km nord/sud et 1,7 km est/ouest près de
        Londres) avant son envoi à Open-Meteo. Cela réduit la précision sans anonymiser la requête :
        les coordonnées approximatives quittent donc votre appareil et sont envoyées à Open-Meteo, même
        si Daymark ne les enregistre pas. L’application revient à son lieu par défaut lorsque vous la
        rechargez ou la rouvrez.
      </p>
      <p>
        Lorsque vous utilisez la position de l’appareil, Daymark détermine aussi un nom de localité
        proche (par exemple une ville) localement à partir d’un jeu de données GeoNames statique. Dans
        la version web/PWA, le jeu de données est téléchargé depuis le site de Daymark et mis en cache
        localement dans Cache Storage après la première utilisation. Dans l’application Android
        installée, il est inclus dans les ressources de l’application. Aucun service de géocodage
        inverse — y compris GeoNames — ne reçoit vos coordonnées, et le résultat reste sur votre
        appareil.
      </p>

      <h2>Recherche de lieu</h2>
      <p>
        Lorsque vous saisissez du texte dans le champ de recherche, le texte saisi quitte votre appareil
        et est envoyé au service de géocodage d&rsquo;Open-Meteo pour proposer des lieux correspondants.
        Daymark n&rsquo;enregistre pas vos recherches.
      </p>

      <h2>Services météo et de qualité de l&rsquo;air</h2>
      <p>
        Les prévisions, les données de qualité de l&rsquo;air et la recherche de lieux proviennent
        d&rsquo;
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>. Les requêtes
        sont envoyées directement depuis votre navigateur ou votre application installée vers les
        serveurs d&rsquo;Open-Meteo :
      </p>
      <ul>
        <li><code>api.open-meteo.com</code> — prévisions</li>
        <li><code>air-quality-api.open-meteo.com</code> — qualité de l&rsquo;air</li>
        <li><code>geocoding-api.open-meteo.com</code> — recherche de lieux</li>
      </ul>
      <p>
        Les conditions publiées par Open-Meteo pour son API gratuite à usage non commercial indiquent
        que les journaux techniques peuvent contenir des informations sensibles, notamment des
        coordonnées géographiques, et que les fichiers journaux sont supprimés après 90 jours. Cette
        conservation relève d’Open-Meteo, pas de Daymark. Consultez les
        <a href="https://open-meteo.com/en/terms" target="_blank" rel="noreferrer">conditions et la politique de confidentialité d’Open-Meteo</a>
        pour plus de détails.
      </p>

      <h2>Entrée vocale (Ask Daymark)</h2>
      <p>
        Ask Daymark est facultatif. Il ne démarre que lorsque vous appuyez sur le bouton du microphone
        et accordez l&rsquo;autorisation.
      </p>
      <p>
        Dans l’application Android installée, la reconnaissance s’exécute entièrement sur votre
        appareil : le modèle vocal Parakeet TDT 0.6B v3, intégré à l’application, transcrit votre parole
        localement via le runtime sherpa-onnx. Daymark n’envoie pas votre audio à un service vocal ni à
        un serveur Daymark. La transcription est conservée en mémoire uniquement ;
        Daymark n’enregistre ni ne conserve votre audio vocal ni vos transcriptions.
      </p>
      <p>
        Dans la version web/PWA, la reconnaissance vocale est assurée par l’interface SpeechRecognition
        ou webkitSpeechRecognition de votre navigateur. Selon votre navigateur, votre système
        d’exploitation et votre configuration, ce service peut envoyer votre audio au fournisseur du
        navigateur ou de la plateforme, y compris à un service distant. Daymark ne reçoit pas
        l’audio ; le navigateur lui transmet une transcription pour qu’il puisse répondre à la
        question, et Daymark la conserve en mémoire sans l’enregistrer. Le comportement de la saisie
        vocale diffère donc entre l’application Android et la version web/PWA, et cette politique
        décrit les deux. Dans Daymark 1.0.0, l’application Android utilisait aussi ce parcours
        navigateur/WebView ; la même mise en garde sur le fournisseur s’y appliquait.
      </p>

      <h2>Sortie vocale (Hear today)</h2>
      <p>
        « Hear today » lit le bulletin à voix haute. Dans l’application Android, la narration en anglais
        est générée sur l’appareil par le modèle Kokoro intégré. Le français et l’espagnol utilisent une
        voix de synthèse vocale Android installée, et Daymark ne sélectionne qu’une voix qui ne nécessite
        pas de connexion réseau ; le texte de narration est transmis à cette voix installée sur votre
        appareil. Si aucune voix hors ligne de ce type n’est installée, Daymark signale que la
        narration est indisponible au lieu d’utiliser une voix réseau ou un autre service vocal. Dans la
        version web, la narration utilise l’API de synthèse vocale du navigateur, qui peut employer une
        voix locale ou distante selon le navigateur et les réglages. Daymark n’exploite aucun serveur
        vocal et ne stocke pas le texte de la narration. Les fournisseurs de navigateur, de système
        d’exploitation et de voix gèrent leur propre traitement et leurs propres données vocales.
      </p>

      <h2>Informations stockées sur votre appareil</h2>
      <p>
        Daymark stocke votre préférence de langue (anglais, français ou espagnol) dans le stockage
        local de votre navigateur sous la clé <code>daymark.locale</code>. C’est la seule préférence
        utilisateur persistante que Daymark stocke intentionnellement. Elle reste jusqu’à ce que vous la
        modifiiez ou effaciez le stockage du navigateur ou du site. Dans la version web/PWA, Daymark met
        en cache le jeu de données statique des localités dans Cache Storage pour les recherches hors
        ligne ; le service worker met séparément en cache les fichiers de l’application. L’application
        Android installée utilise le jeu de données inclus dans ses ressources. Il s’agit de ressources
        de l’application, pas d’un historique de vos localisations ou de la météo.
      </p>
      <p>
        Daymark n&rsquo;utilise pas de cookies, n&rsquo;utilise pas le stockage de session du
        navigateur ni IndexedDB, et ne conserve aucun historique de localisations, de recherches, de
        transcriptions ou de météo. Dans la version web/PWA, le service worker met en cache les fichiers
        de l’application (HTML, scripts, styles, icônes et polices) pour permettre une ouverture hors
        ligne ; il ne met pas en cache les réponses météo ou de qualité de l’air.
      </p>

      <h2>Services tiers</h2>
      <ul>
        <li>Open-Meteo — météo, qualité de l&rsquo;air et recherche de lieux, comme décrit ci-dessus.</li>
        <li>
          GeoNames — noms de localités pour la position de l’appareil. Dans la version web/PWA, le jeu
          de données statique est téléchargé depuis le site de Daymark ; dans l’application Android
          installée, il est inclus dans les ressources de l’application. La recherche s’effectue sur
          l’appareil ; aucune coordonnée n’est envoyée à GeoNames.
        </li>
        <li>
          Le service vocal de votre navigateur — uniquement dans l&rsquo;application web, et
          uniquement lorsque vous utilisez les fonctions vocales facultatives. La saisie vocale Android
          s&rsquo;exécute sur votre appareil et ne contacte aucun service vocal. La narration française
          et espagnole sur Android utilise uniquement une voix système installée et disponible hors ligne.
        </li>
        <li>
          Cloudflare Pages — hébergement statique de la version web/PWA. Cloudflare diffuse le site et
          traite les métadonnées de requête standard, telles que l&rsquo;adresse IP, l&rsquo;URL
          demandée et l&rsquo;agent utilisateur, pour la diffusion, la sécurité et la prévention des
          abus, conformément à sa
          <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">politique de confidentialité</a>.
        </li>
        <li>
          Le modèle vocal Parakeet et le runtime sherpa-onnx, inclus dans l&rsquo;application Android
          et utilisés pour reconnaître la parole sur votre appareil.
        </li>
      </ul>
      <p>
        Données de localités © <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>,
        utilisées sous licence Creative Commons Attribution 4.0 (CC BY 4.0).
      </p>
      <p>
        Modèle vocal : <a href="https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3" target="_blank" rel="noreferrer">Parakeet TDT 0.6B v3</a> de
        NVIDIA Corporation, utilisé sous licence Creative Commons Attribution 4.0 International
        (CC BY 4.0). Les poids publiés sont quantifiés en int8 pour l&rsquo;inférence sur l&rsquo;appareil.
      </p>
      <p>
        L&rsquo;application Daymark n&rsquo;intègre pas de services tiers d&rsquo;analyse
        d&rsquo;audience, de publicité, de pixels de suivi ni de SDK de traçage. Open-Meteo est utilisé
        pour la météo et la recherche de lieux ; l&rsquo;application web utilise les fonctions vocales
        du navigateur, et la narration française et espagnole sur Android utilise des voix Android
        installées et disponibles hors ligne.
      </p>

      <h2>Analyse d&rsquo;audience, publicité et suivi</h2>
      <p>
        L&rsquo;application Daymark n&rsquo;intègre ni outils d&rsquo;analyse, ni publicité, ni
        traqueurs, ni SDK de télémétrie. L&rsquo;hébergeur de la version web/PWA traite les
        métadonnées de requête standard pour la diffusion et la sécurité, comme décrit dans la section
        Services tiers.
      </p>

      <h2>Durée de conservation</h2>
      <p>
        Daymark n&rsquo;a ni comptes ni base de données et n&rsquo;exploite pas son propre backend ni
        serveur d&rsquo;application ; il ne conserve donc pas votre
        localisation, vos recherches, votre audio vocal, vos transcriptions ou l&rsquo;historique
        météo. Votre préférence de langue reste sur votre appareil jusqu&rsquo;à ce que vous la
        modifiiez ou effaciez le stockage. Les fournisseurs tiers fixent leurs propres durées de
        conservation ; veuillez consulter leurs politiques.
      </p>

      <h2>Sécurité</h2>
      <p>
        La version web/PWA hébergée est servie via HTTPS et utilise la politique de sécurité du
        contenu configurée sur le site. L’application Android installée charge des ressources locales
        intégrées ; les en-têtes de sécurité HTTP du site ne s’appliquent pas dans sa WebView, mais la
        page intégrée contient une balise meta Content-Security-Policy équivalente. L’application est
        un ensemble de fichiers statiques, sans secrets ni backend ou serveur d’application exploité
        par Daymark.
      </p>

      <h2>Traitement international</h2>
      <p>
        Open-Meteo traite les requêtes météo et de recherche sur ses propres serveurs. Dans
        l&rsquo;application web, la reconnaissance et la synthèse vocales du navigateur peuvent traiter
        l’audio ou la narration à distance, selon le fournisseur et les réglages. Dans l’application
        Android, la saisie vocale et la narration anglaise sont traitées sur votre appareil, et la
        narration française ou espagnole utilise uniquement une voix installée et disponible hors ligne.
        Les politiques de ces fournisseurs décrivent où et comment ce traitement a lieu.
      </p>

      <h2>Confidentialité des enfants</h2>
      <p>
        Daymark est un service météo grand public, qui n&rsquo;est pas spécifiquement conçu pour les
        enfants. Il ne propose pas de comptes utilisateur et Daymark ne conserve lui-même ni profils,
        ni historiques de localisation, ni historiques de recherche, ni transcriptions vocales. Les
        enfants doivent utiliser les autorisations de localisation et de microphone sous la
        supervision appropriée lorsque leur appareil, leur plateforme ou la réglementation locale
        l&rsquo;exigent.
      </p>

      <h2>Vos choix et vos contrôles</h2>
      <ul>
        <li>Vous pouvez renoncer entièrement à la géolocalisation et rechercher un lieu par son nom.</li>
        <li>
          Vous pouvez refuser ou révoquer l&rsquo;autorisation de localisation dans les réglages de
          votre navigateur ou de votre appareil.
        </li>
        <li>Vous pouvez ne pas utiliser Ask Daymark et vous passer de la saisie vocale.</li>
        <li>Vous pouvez refuser ou révoquer l&rsquo;autorisation d&rsquo;accès au microphone à tout moment.</li>
        <li>
          Vous pouvez supprimer la préférence de langue enregistrée en effaçant le stockage de ce site
          ou de cette application dans les réglages de votre navigateur ou de votre appareil.
        </li>
      </ul>

      <h2>Modifications de cette politique</h2>
      <p>
        Si les pratiques de Daymark en matière de données changent, cette page sera mise à jour et la
        date d&rsquo;entrée en vigueur révisée.
      </p>

      <h2>Contact</h2>
      <p>
        Questions ou préoccupations : skylinelabdev@gmail.com — exploité par Sami Belhadj.
      </p>
    </PrivacyPolicyLayout>
  );
}
