# Digital Asset Links — NOT YET ACTIVE

> **Superseded for the Capacitor release:** use
> [`docs/release/play-console-checklist.md`](../../docs/release/play-console-checklist.md)
> and `docs/release/assetlinks.template.json`. This directory is kept only as
> the TWA rollback reference; its key table is historical. The current upload
> keystore is `android/daymark-upload.keystore` (alias `daymark-upload`),
> SHA-256
> `34:6B:BE:F3:43:8C:6F:E8:1E:89:F6:3F:C0:A0:FF:29:E9:6D:A1:98:98:74:E6:BA:18:7A:9E:52:C3:AA:FA:7E`.

This directory prepares Step 9B (live domain + asset links verification).
**No assetlinks.json has been published anywhere.** The template above is a
structure only; it intentionally contains a placeholder fingerprint.

## What Step 9B requires

1. Deploy Daymark to its final HTTPS origin — now
   `https://daymark-weather.pages.dev` (Cloudflare Pages).
2. Enroll the app in **Google Play App Signing** — Play then holds the
   *app signing key*; the fingerprint of THAT key is what belongs in
   `assetlinks.json` (not the upload key, not the debug key). The first AAB has
   been uploaded and Play App Signing is enrolled; the app-signing SHA-256 has
   not yet been recorded.
3. Fill `sha256_cert_fingerprints` with the real Play App Signing SHA-256
   (Play Console → Release → Setup → App signing), keeping the upload-key
   fingerprint as a second entry so local `adb install` builds verify too.
4. Publish at `https://<origin>/.well-known/assetlinks.json` (served with
   `application/json`, no redirects, HTTP 200).
5. Verify — the TWA-era `bubblewrap verifyLinks` flow is historical; for the
   Capacitor release use the Play link checker and `pm verify-app-links`
   commands in `docs/release/play-console-checklist.md` §7.

## Historical fingerprints (TWA era, local machine)

| Key | SHA-256 | Purpose |
|---|---|---|
| Upload key (`android/android.keystore`, alias `daymark`) | `3A:50:70:37:9D:DF:AF:54:42:30:0D:37:86:37:66:04:CB:DF:7F:A8:85:DC:FB:3C:D4:86:AA:35:26:5F:31:64` | Historical TWA-era upload key; superseded by `android/daymark-upload.keystore` |
| Android debug key (`~/.android/debug.keystore`) | `33:F4:5A:81:66:86:46:42:88:7D:83:BB:29:85:D6:53:7A:0A:8D:FA:69:F5:09:0C:4F:24:33:9A:F1:DD:1F:E2` | Signs local debug APKs only |

The keystore itself is gitignored and must never be committed. The app has now
been uploaded to Play, so the app signing key exists — its SHA-256 still needs
to be copied from the Play Console before `assetlinks.json` is finalized.
