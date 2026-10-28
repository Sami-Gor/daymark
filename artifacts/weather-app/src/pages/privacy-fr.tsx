import { PrivacyPolicyLayout } from '@/pages/privacy-layout';

/*
 * French privacy policy for Daymark V2 (2.0.0). Meaning-for-meaning
 * translation of the English policy: web/PWA is a limited weather demo without
 * voice; Android has on-device Parakeet input and local English Kokoro
 * narration; French/Spanish narration is unavailable in V2.
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
      effectiveText="Date d’entrée en vigueur : 27 octobre 2026 · Dernière mise à jour : 27 octobre 2026"
      tagline="Daymark — la météo, simplement"
    >
      <p>
        Daymark est une application météo composée d’une démo web/PWA limitée et d’une application
        Android plus complète. La plupart du traitement se fait dans votre navigateur ou votre
        application installée, mais Daymark envoie directement les requêtes météo, de qualité de
        l’air et de recherche de lieux à Open-Meteo, et l’hébergeur du site traite les métadonnées
        de requête ordinaires. Cette politique décrit ces flux et vos choix.
      </p>

      <h2>Qui exploite Daymark</h2>
      <p>
        Daymark est exploité par Sami. Pour toute question concernant cette politique ou vos
        informations, contactez
        <a href="mailto:skylinelabdev@gmail.com"> skylinelabdev@gmail.com</a>.
      </p>

      <h2>Transition V2 / V1</h2>
      <p>
        Cette politique décrit Daymark V2 (version 2.0.0) sur le web/PWA et Android. Daymark 1.0.0
        peut rester installée sur un appareil ou disponible sur Google Play jusqu’à la publication
        complète de V2 en production. Lorsque V2 sera pleinement publiée, V1 sera retirée de Google
        Play et le support officiel de V1 prendra fin. Les installations V1 existantes ne seront pas
        désactivées volontairement.
      </p>
      <p>
        V1 se comportait différemment : sa version Android demandait la localisation précise en plus
        de la localisation approximative, utilisait la reconnaissance vocale du navigateur ou de la
        WebView et pouvait employer la voix de synthèse Android par défaut pour la narration en
        français et en espagnol. Ces comportements V1 ne s’appliquent que tant qu’une installation V1
        est utilisée.
      </p>

      <h2>Requêtes météo et recherche de lieux</h2>
      <p>
        À l’ouverture, Daymark charge une prévision pour Londres, son lieu par défaut. Cette requête
        est envoyée directement depuis votre navigateur ou votre application installée à Open-Meteo et
        ne nécessite aucune autorisation de localisation.
      </p>
      <p>
        Les données météo, de qualité de l’air et de recherche de lieux proviennent d’
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>. Les requêtes
        vont directement à :
      </p>
      <ul>
        <li><code>api.open-meteo.com</code> — prévisions</li>
        <li><code>air-quality-api.open-meteo.com</code> — qualité de l’air</li>
        <li><code>geocoding-api.open-meteo.com</code> — recherche de lieux</li>
      </ul>
      <p>
        Lorsque vous saisissez du texte dans le champ de recherche, ce texte est envoyé au service de
        géocodage d’Open-Meteo pour proposer des lieux correspondants. Daymark n’enregistre pas vos
        recherches. Daymark n’exploite pas de backend ni de serveur d’application pour les comptes,
        l’historique météo, les recherches ou les données vocales.
      </p>

      <h2>Données de localisation</h2>
      <p>
        Daymark ne demande pas votre localisation au chargement. La localisation de l’appareil n’est
        utilisée que si vous appuyez sur « Utiliser ma position » et accordez l’autorisation. Vous
        pouvez l’éviter et utiliser le lieu par défaut ou rechercher un lieu.
      </p>
      <p>
        L’application Android déclare uniquement <code>ACCESS_COARSE_LOCATION</code> et ne déclare pas
        <code>ACCESS_FINE_LOCATION</code>. Android et le web/PWA arrondissent la position dérivée de
        l’appareil sur une grille de 0,025 degré sur l’appareil avant de l’envoyer à Open-Meteo. Près
        de Londres, cela représente environ 2,8 km nord/sud et 1,7 km est/ouest (environ 4,8 km²). La
        grille réduit la précision mais n’anonymise pas la requête : les coordonnées arrondies quittent
        votre appareil et sont envoyées à Open-Meteo. L’application revient à Londres lors d’un
        rechargement ou d’une réouverture.
      </p>
      <p>
        Pour la localisation de l’appareil, Daymark résout aussi localement un nom de localité proche
        (par exemple une ville) à partir du jeu de données GeoNames statique. Le web/PWA télécharge ce
        jeu de données depuis le site de Daymark et le met en cache localement ; l’application Android
        l’inclut dans ses ressources. Aucun service de géocodage inverse, y compris GeoNames, ne reçoit
        vos coordonnées.
      </p>

      <h2>Démo web/PWA</h2>
      <p>
        La version web/PWA est une démo météo limitée. Elle ne propose ni le bouton micro Ask Daymark
        ni la narration « Hear today ». Elle ne demande pas l’autorisation du microphone et n’appelle
        pas les API de reconnaissance ou de synthèse vocale du navigateur. L’application Android
        fournit l’ensemble des fonctions vocales décrites ci-dessous.
      </p>

      <h2>Entrée vocale Android (Ask Daymark)</h2>
      <p>
        Ask Daymark est facultatif sur Android. Il démarre uniquement lorsque vous appuyez sur le
        bouton du microphone et accordez l’autorisation. La reconnaissance utilise le modèle Parakeet
        TDT 0.6B v3 int8 intégré, via le runtime sherpa-onnx sur l’appareil. L’audio est capturé
        temporairement pendant cette session déclenchée par vous et conservé en mémoire pour la
        reconnaissance ; Daymark n’enregistre ni ne conserve intentionnellement l’audio ou la
        transcription, et ne les envoie pas à un serveur vocal Daymark. Le parcours Android n’utilise
        ni Android SpeechRecognizer, ni la reconnaissance du navigateur, ni un recognizer en ligne de
        secours dans le code. Il s’agit d’une constatation du code et des tests automatisés, et non
        d’une preuve indépendante au niveau des paquets d’une absence totale de trafic.
      </p>

      <h2>Narration Android</h2>
      <p>
        La narration en anglais est générée sur votre appareil par le modèle Kokoro intégré. Daymark
        ne stocke pas le texte de narration. La narration en français et en espagnol n’est pas
        disponible dans V2 et est prévue pour V2.2 ; Daymark affiche un message d’indisponibilité et
        ne se rabat ni sur la synthèse vocale Android, ni sur une voix réseau, ni sur la synthèse du
        navigateur.
      </p>

      <h2>Informations stockées sur votre appareil</h2>
      <p>
        Daymark stocke le code de langue dans le stockage local sous <code>daymark.locale</code>.
        L’application Android stocke aussi une valeur d’état privée dans SharedPreferences sous
        <code>daymark.permissions</code> : le booléen <code>microphone-requested</code>, utilisé
        uniquement pour éviter de répéter une demande d’autorisation de microphone après qu’elle a
        déjà été demandée ou refusée.
        Aucune de ces valeurs n’est un historique de localisation, de recherche, de transcription ou de
        météo, et Daymark n’en conserve aucun. Le service worker du web/PWA met en cache les ressources
        de l’application, et la recherche de localité utilise Cache Storage pour le jeu de données
        statique ; ce sont des ressources de l’application, pas un historique utilisateur.
        L’application Android charge le jeu de données depuis ses ressources intégrées.
      </p>
      <p>
        Le code applicatif de Daymark n’utilise pas de cookies, de stockage de session du navigateur
        ni d’IndexedDB pour l’état utilisateur. Vous pouvez effacer la préférence de langue et les caches de l’application
        en effaçant le stockage de ce site ou de cette application dans les réglages de votre
        navigateur ou de votre appareil. Effacer le stockage local ne supprime pas automatiquement les
        données déjà conservées par des fournisseurs tiers comme Open-Meteo.
      </p>

      <h2>Tiers et conservation</h2>
      <ul>
        <li>
          Open-Meteo — météo, qualité de l’air et recherche de lieux. Sa politique publiée indique
          qu’il agit comme responsable indépendant du traitement, qu’il peut conserver des journaux
          techniques contenant notamment des coordonnées géographiques et que ces journaux sont
          supprimés après 90 jours. Open-Meteo reçoit aussi les métadonnées réseau ordinaires,
          notamment l’adresse IP source et l’URL demandée, pour traiter la requête. Daymark n’utilise
          pas l’adresse IP pour vous identifier ni pour déterminer votre localisation ; la politique
          d’Open-Meteo indique qu’il peut traiter les adresses IP pour des raisons techniques. Daymark
          ne contrôle pas cette conservation. Consultez les
          <a href="https://open-meteo.com/en/terms" target="_blank" rel="noreferrer">conditions et la politique de confidentialité d’Open-Meteo</a>.
        </li>
        <li>
          Cloudflare Pages — hébergement statique du web/PWA. Cloudflare traite les métadonnées de
          requête standard, comme l’adresse IP, l’URL demandée et l’agent utilisateur, pour la
          diffusion, la sécurité et la prévention des abus, conformément à sa
          <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">politique de confidentialité</a>.
          Daymark ne revendique pas une durée de conservation Cloudflare fixe.
        </li>
        <li>
          GeoNames — le jeu de données statique des localités et la recherche locale de la localité la
          plus proche. Aucune coordonnée n’est envoyée à GeoNames.
        </li>
        <li>
          Les modèles Parakeet et Kokoro et le runtime sherpa-onnx sont intégrés à l’application
          Android ou livrés comme ressources de l’application. Ils s’exécutent sur l’appareil pour les
          fonctions décrites ci-dessus.
        </li>
      </ul>
      <p>
        Daymark n’intègre ni analyse d’audience, ni publicité, ni pixel de suivi, ni SDK de suivi.
        Daymark ne prétend pas que chaque service tiers est indépendamment sûr ni que tous les
        traitements externes sont conservés zéro jour.
      </p>

      <h2>Sécurité</h2>
      <p>
        Le web/PWA hébergé est servi via HTTPS et utilise la politique de sécurité du contenu
        configurée pour le site. L’application Android installée charge des ressources locales
        intégrées ; les en-têtes de sécurité HTTP du site ne s’appliquent pas dans sa WebView. Daymark
        est un ensemble statique sans secrets et sans backend exploité par Daymark. Ces propriétés
        vérifiables ne constituent pas une garantie concernant les services tiers ou l’appareil entier.
      </p>

      <h2>Public concerné</h2>
      <p>
        Daymark est destiné aux adultes âgés de 18 ans ou plus et ne s’adresse pas aux enfants. Il
        s’agit d’une déclaration de public cible dans Google Play, et non d’une restriction technique
        d’accès ni d’un contrôle d’âge ; Daymark ne prétend pas qu’aucun mineur ne peut accéder à
        l’application. Elle ne propose pas de comptes et Daymark ne conserve ni profils, ni historiques
        de localisation, ni historiques de recherche, ni transcriptions vocales. Daymark n’utilise ni
        publicité ni identifiants de suivi. L’application ne demande pas de date de naissance. Le choix
        d’un public adulte ne résout pas à lui seul une évaluation juridique ou réglementaire distincte,
        notamment le UK Children’s Code lorsqu’il s’applique.
      </p>

      <h2>Vos choix</h2>
      <ul>
        <li>Utiliser la prévision par défaut de Londres ou la recherche sans autoriser la localisation.</li>
        <li>Refuser ou révoquer la localisation dans les réglages du navigateur ou de l’appareil.</li>
        <li>Sur Android, ne pas utiliser Ask Daymark et se passer du microphone.</li>
        <li>Refuser ou révoquer le microphone à tout moment.</li>
        <li>Effacer la préférence de langue et les caches de l’application dans les réglages.</li>
      </ul>

      <h2>Modifications et contact</h2>
      <p>
        Si les pratiques de Daymark changent, cette page sera mise à jour et la date d’entrée en
        vigueur révisée. Questions ou préoccupations :
        <a href="mailto:skylinelabdev@gmail.com">skylinelabdev@gmail.com</a>. Daymark est exploité
        par Sami.
      </p>
    </PrivacyPolicyLayout>
  );
}
