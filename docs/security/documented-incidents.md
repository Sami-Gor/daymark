# Documented weather-app security and privacy incidents

This overview uses public reporting and vendor/security advisories to illustrate different kinds of risk. It is deliberately narrow: it is not an exhaustive survey, and it does not establish that weather apps as a class are routinely compromised.

## 1. Windows Vista Weather Gadget — CVE-2007-3891

**Classification:** Software vulnerability; remote code execution under specific conditions.

Microsoft's MS07-048 bulletin documented a vulnerability in the Windows Vista Weather Gadget. Exploitation required the gadget to be running with links visible and user interaction with a malicious link. Microsoft said it had no information at the time indicating that this issue had been used to attack customers. Microsoft issued a security update.

**What it shows:** Even a small widget can create a meaningful attack surface when it processes rich or externally influenced content.

**What it does not show:** It is not evidence of a modern mobile weather app being remotely compromised at scale.

Source: [Microsoft Security Bulletin MS07-048](https://learn.microsoft.com/en-us/security-updates/securitybulletins/2007/ms07-048).

## 2. TCL/Alcatel weather app — data collection and fraudulent subscription attempts

**Classification:** Reported malicious or abusive app behavior; privacy and financial harm, not an external attacker hacking a legitimate app.

Mobile-security company Upstream reported that the pre-installed com.tct.weather app on some Alcatel devices collected location, email, and device identifiers and attempted premium-service transactions without users' knowledge. In a later report, Upstream described renewed suspicious transaction attempts. These are vendor-researcher findings; this summary does not independently reproduce the technical analysis.

**What it shows:** App provenance, embedded code, unnecessary device identifiers, and behavior beyond the app's stated purpose matter. Distribution through a known channel or pre-installation does not by itself guarantee benign behavior.

**What it does not show:** It should not be described as an outside attacker taking over all weather apps.

Sources:
- [Upstream's January 2019 investigation](https://www.upstreamsystems.com/secure-d-uncovers-pre-installed-suspicious-application-com-tct-weather-on-alcatel-android-smartphones-manufactured-by-tcl/)
- [Upstream's September 2019 follow-up](https://www.upstreamsystems.com/press/press-releases/returning-rogue-weather-app-continues-mobile-ad-fraud/)

## 3. Infinix pre-installed Weather app — CVE-2024-12993

**Classification:** Android component access-control vulnerability and location disclosure.

CERT Polska reported that version 7.0.0.037 of the pre-installed com.rlk.weathers app exposed an unsecured content provider that could reveal a user's location to another app without privileges. CERT Polska said it had tried to contact the vendor without receiving a response and assessed that the issue might affect all Infinix devices. That broad device scope is the adviser's assessment, not a device-by-device verification in this document.

**What it shows:** Exported Android components must enforce access controls. Sensitive location data should not be readable through an unintended inter-app interface.

**What it does not show:** The advisory does not establish widespread in-the-wild exploitation or full-device takeover.

Source: [CERT Polska advisory for CVE-2024-12993](https://cert.pl/en/posts/2024/12/CVE-2024-12993/).

## 4. AccuWeather and the Reveal Mobile SDK — location-data controversy

**Classification:** Privacy and SDK data-handling controversy; not established as an external breach.

In 2017, reporting on a researcher's analysis raised concerns about data transmitted by the AccuWeather iOS app and the Reveal Mobile SDK, including data that could be used to infer location. AccuWeather and Reveal Mobile disputed parts of the characterization and said that GPS coordinates were not collected or passed after a user opted out; Reveal said it would change its SDK behavior to avoid sending signals that could be used to infer location in that situation.

**What it shows:** A privacy review needs to examine SDK behavior and what data can be inferred—not just whether an app directly reads GPS coordinates.

**Important qualification:** The reporting included responses disputing the initial interpretation. It should be described as a contested data-handling controversy, not a proven breach or settled finding of wrongdoing.

Sources:
- [TechCrunch coverage and company response](https://techcrunch.com/2017/08/22/accuweather-revealmobile-ios/)
- [9to5Mac coverage and company responses](https://9to5mac.com/2017/08/21/accuweather-app-sends-location-data-when-denied-access/)

## 5. Apple platform location disclosures — CVE identifiers need careful attribution

Apple's security advisories include location-privacy issues affecting operating-system components. The source material supplied for this project appeared to attribute CVE-2022-46718 to the Weather component. Apple's advisory lists **CVE-2022-46718 under TCC** and lists a separate **Weather** location issue as **CVE-2022-46703**. Keep these identifiers separate; do not repeat the earlier attribution without correction.

Sources:
- [Apple security content for iOS 16.2 / iPadOS 16.2](https://support.apple.com/en-hk/102807)
- [Apple security content for macOS Monterey 12.6.2](https://support.apple.com/en-is/102806)

## Research boundaries

This page summarizes selected public sources, not an independent forensic examination. Before making stronger claims, verify the original advisory, affected versions, patch status, and the precise behavior described. Where a source is a company security vendor or media report rather than a regulator or software vendor, that distinction should remain visible.

The defensible conclusion is limited: documented cases justify attention to location privacy, dependency behavior, component access control, and secure content handling. They do not justify blanket claims that weather apps are inherently dangerous or commonly used to take over phones.
