# Historical TWA Digital Asset Links reference — superseded

> **Not the current release procedure.** For the Capacitor release, use
> [`docs/release/play-console-checklist.md`](../../docs/release/play-console-checklist.md)
> and `docs/release/assetlinks.template.json`. This directory is retained only
> with the legacy TWA rollback project; the key table below is historical except
> where explicitly labelled as the current upload certificate.

The template in this directory belongs to the old TWA-era workflow. Do not use
it as evidence of the live website's current state. The current endpoint must be
checked using the Capacitor release checklist; the live endpoint could not be
verified from this audit environment.

## Historical TWA-era steps (reference only)

1. Historical TWA-era step: the final HTTPS origin was selected as
   `https://daymark-weather.pages.dev` (Cloudflare Pages). The website is
   already deployed; do not treat this as an instruction to create a new site.
2. Enroll the app in **Google Play App Signing** — Play then holds the
   *app signing key*; the fingerprint of THAT key is what belongs in
   `assetlinks.json` (not the upload key, not the debug key). The first AAB has
   been uploaded and Play App Signing is enrolled; the app-signing SHA-256 has
   not yet been recorded.
3. Fill `sha256_cert_fingerprints` with the real Play App Signing SHA-256
   (Play Console → Release → Setup → App signing), keeping the upload-key
   fingerprint as a second entry so local `adb install` builds verify too.
4. Publish at `https://<origin>/.well-known/assetlinks.json` (served with
   `application/json`, no redirects, HTTP 200) only if the existing endpoint
   does not already serve the correct JSON and fingerprints. Check before changing
   the deployed website.
5. Verify — the TWA-era `bubblewrap verifyLinks` flow is historical; for the
   Capacitor release use the Play link checker and `pm verify-app-links`
   commands in `docs/release/play-console-checklist.md` §7.

## Historical fingerprints (TWA era, local machine)

| Key | SHA-256 | Purpose |
|---|---|---|
| Upload key (`android/android.keystore`, alias `daymark`) | `3A:50:70:37:9D:DF:AF:54:42:30:0D:37:86:37:66:04:CB:DF:7F:A8:85:DC:FB:3C:D4:86:AA:35:26:5F:31:64` | Historical TWA-era upload key; superseded by `android/daymark-upload.keystore` |
| Android debug key (`~/.android/debug.keystore`) | `33:F4:5A:81:66:86:46:42:88:7D:83:BB:29:85:D6:53:7A:0A:8D:FA:69:F5:09:0C:4F:24:33:9A:F1:DD:1F:E2` | Signs local debug APKs only |

The keystore itself is gitignored and must never be committed. Play App Signing
was enrolled on the first upload; copy the Play app-signing SHA-256 from Play
Console only if the active website's Digital Asset Links file needs to be
created or corrected. The current live endpoint was not independently verified
in this audit.
