import { PrivacyPolicyLayout } from '@/pages/privacy-layout';

/*
 * French privacy policy (/fr/privacy). Meaning-for-meaning translation of the
 * English policy: same data practices, same Daymark-vs-third-party
 * distinction, same voice-processing caveat. No stronger or weaker claims.
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
      effectiveText="Date d’entrée en vigueur : 11 septembre 2026"
      tagline="Daymark — la météo, simplement"
    >
      <p>
        Daymark est une application météo qui fonctionne entièrement dans votre navigateur ou en tant
        qu&rsquo;application installée. Cette politique explique, en termes simples, quelles
        informations sont concernées lorsque vous l&rsquo;utilisez.
      </p>

      <h2>Qui exploite Daymark</h2>
      <p>
        Daymark est exploité par Sami Belhadj. Pour toute question concernant cette politique ou vos
        informations, contactez skylinelabdev@gmail.com.
      </p>

      <h2>L&rsquo;essentiel</h2>
      <ul>
        <li>Daymark n&rsquo;a ni comptes utilisateur ni base de données, et n&rsquo;exploite pas son propre backend ni serveur d&rsquo;application pour les comptes, l&rsquo;analyse d&rsquo;audience, le stockage ou l&rsquo;historique.</li>
        <li>Daymark n&rsquo;utilise ni analyse d&rsquo;audience, ni publicité, ni suivi.</li>
        <li>
          Daymark ne conserve pas lui-même votre localisation, vos recherches, votre voix ou
          l&rsquo;historique météo.
        </li>
        <li>
          Pour fonctionner, Daymark envoie les requêtes que vous déclenchez — par exemple une
          prévision pour un lieu que vous avez choisi — directement depuis votre navigateur à
          Open-Meteo, un service météo tiers.
        </li>
        <li>
          Les fonctions vocales facultatives reposent sur les capacités vocales de votre navigateur ou
          de votre appareil.
        </li>
      </ul>

      <h2>Quelles informations Daymark traite</h2>
      <p>Pour afficher la météo, Daymark traite :</p>
      <ul>
        <li>
          le lieu que vous choisissez (via la recherche, ou via la localisation de votre appareil si
          vous l&rsquo;autorisez) ;
        </li>
        <li>les réponses météo, de qualité de l&rsquo;air et de recherche de lieux renvoyées par Open-Meteo ;</li>
        <li>vos préférences stockées sur l&rsquo;appareil, comme la langue.</li>
      </ul>
      <p>
        Ces informations existent dans votre navigateur pendant que vous utilisez l&rsquo;application.
        Elles ne sont envoyées à aucun backend ni serveur d&rsquo;application exploité par Daymark,
        car Daymark n&rsquo;en exploite aucun.
      </p>

      <h2>Données de localisation</h2>
      <p>
        Daymark ne demande jamais votre localisation de sa propre initiative. Votre localisation
        n&rsquo;est utilisée que si vous appuyez sur « Utiliser ma position » et accordez
        l&rsquo;autorisation.
      </p>
      <p>
        Dans ce cas, vos coordonnées sont arrondies à deux décimales (environ 1 km) sur votre appareil
        avant d&rsquo;être envoyées à Open-Meteo pour rechercher votre prévision locale. Daymark
        n&rsquo;enregistre pas votre localisation ; elle n&rsquo;est pas conservée entre les visites et
        l&rsquo;application revient à son lieu par défaut lorsque vous la rechargez ou la rouvrez.
      </p>
      <p>
        Lorsque vous utilisez la position de l&rsquo;appareil, Daymark détermine aussi un nom de
        localité proche (par exemple une ville) entièrement dans votre navigateur, à partir d&rsquo;un
        jeu de données GeoNames statique servi par Daymark et mis en cache sur votre appareil après la
        première utilisation. Aucun service de géocodage inverse — y compris GeoNames — ne reçoit vos
        coordonnées, et le résultat reste sur votre appareil.
      </p>

      <h2>Recherche de lieu</h2>
      <p>
        Lorsque vous saisissez du texte dans le champ de recherche, votre recherche est envoyée au
        service de géocodage d&rsquo;Open-Meteo pour proposer des lieux correspondants. Daymark
        n&rsquo;enregistre pas vos recherches.
      </p>

      <h2>Services météo et de qualité de l&rsquo;air</h2>
      <p>
        Les prévisions, les données de qualité de l&rsquo;air et la recherche de lieux proviennent
        d&rsquo;
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>. Les requêtes
        sont envoyées directement depuis votre navigateur vers les serveurs d&rsquo;Open-Meteo :
      </p>
      <ul>
        <li><code>api.open-meteo.com</code> — prévisions</li>
        <li><code>air-quality-api.open-meteo.com</code> — qualité de l&rsquo;air</li>
        <li><code>geocoding-api.open-meteo.com</code> — recherche de lieux</li>
      </ul>
      <p>
        Ces requêtes étant traitées par Open-Meteo, leur traitement — y compris toute journalisation
        ou conservation — relève des politiques propres à Open-Meteo. Daymark ne contrôle pas ces
        pratiques ; veuillez consulter les informations de confidentialité et les conditions
        d&rsquo;Open-Meteo sur son site.
      </p>

      <h2>Entrée vocale (Ask Daymark)</h2>
      <p>
        Ask Daymark est facultatif. Il ne démarre que lorsque vous appuyez sur le bouton du microphone
        et accordez l&rsquo;autorisation. La reconnaissance vocale est assurée par votre navigateur ou
        votre appareil et peut faire appel à son service vocal. Selon votre navigateur, votre système
        d&rsquo;exploitation et votre configuration, l&rsquo;audio peut être traité par le fournisseur
        de la plateforme. Daymark n&rsquo;enregistre ni ne conserve votre audio vocal ni vos
        transcriptions vocales, et aucun backend ni serveur d&rsquo;application Daymark ne les reçoit.
      </p>

      <h2>Sortie vocale (Hear today)</h2>
      <p>
        « Hear today » lit les prévisions à voix haute à l&rsquo;aide de la synthèse vocale intégrée à
        votre navigateur ou à votre appareil. Le texte du bulletin est traité par cette capacité de la
        plateforme, et non par un service vocal exploité par Daymark.
      </p>

      <h2>Informations stockées sur votre appareil</h2>
      <p>
        Daymark stocke votre préférence de langue (anglais, français ou espagnol) dans le stockage
        local de votre navigateur sous la clé <code>daymark.locale</code>. Il s&rsquo;agit de la seule
        valeur applicative persistante que Daymark conserve intentionnellement. Elle reste enregistrée
        jusqu&rsquo;à ce que vous la modifiiez ou que vous effaciez le stockage de votre navigateur ou
        du site.
      </p>
      <p>
        Daymark n&rsquo;utilise pas de cookies, n&rsquo;utilise pas le stockage de session du
        navigateur ni IndexedDB, et ne conserve aucun historique de localisations, de recherches, de
        transcriptions ou de météo. Le service worker de Daymark met en cache les fichiers de
        l&rsquo;application elle-même (HTML, scripts, styles, icônes et polices) afin que
        l&rsquo;application puisse s&rsquo;ouvrir hors ligne ; il ne met pas en cache les réponses
        météo ou de qualité de l&rsquo;air.
      </p>

      <h2>Services tiers</h2>
      <ul>
        <li>Open-Meteo — météo, qualité de l&rsquo;air et recherche de lieux, comme décrit ci-dessus.</li>
        <li>
          GeoNames — noms de localités pour la position de l&rsquo;appareil. Le jeu de données est
          téléchargé depuis le site de Daymark et la recherche s&rsquo;effectue sur votre appareil ;
          aucune coordonnée n&rsquo;est envoyée à GeoNames.
        </li>
        <li>
          Les services vocaux de votre navigateur ou de votre appareil — uniquement lorsque vous
          utilisez les fonctions vocales facultatives.
        </li>
      </ul>
      <p>
        Données de localités © <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>,
        utilisées sous licence Creative Commons Attribution 4.0 (CC BY 4.0).
      </p>
      <p>
        Daymark n&rsquo;utilise ni analyse d&rsquo;audience, ni publicité, ni pixels de suivi, ni aucun
        autre service tiers.
      </p>

      <h2>Analyse d&rsquo;audience, publicité et suivi</h2>
      <p>
        Daymark n&rsquo;en contient aucun. Il n&rsquo;y a ni outils d&rsquo;analyse, ni publicité, ni
        traqueurs, ni télémétrie.
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
        Daymark est servi via HTTPS et applique une politique de sécurité du contenu stricte.
        L&rsquo;application est un ensemble de fichiers statiques, sans secrets ni backend ou serveur
        d&rsquo;application exploité par Daymark.
      </p>

      <h2>Traitement international</h2>
      <p>
        Open-Meteo et les services vocaux de votre navigateur ou de votre appareil peuvent traiter des
        données sur des serveurs situés dans différents pays. Leurs propres politiques décrivent où et
        comment cela se produit.
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
