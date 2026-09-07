# Digital Asset Links — NOT YET ACTIVE

This directory prepares Step 9B (live domain + asset links verification).
**No assetlinks.json has been published anywhere.** The template above is a
structure only; it intentionally contains a placeholder fingerprint.

## What Step 9B requires

1. Deploy Daymark to its final HTTPS origin (the origin choice is still open).
2. Enroll the app in **Google Play App Signing** — Play then holds the
   *app signing key*; the fingerprint of THAT key is what belongs in
   `assetlinks.json` (not the upload key, not the debug key).
3. Fill `sha256_cert_fingerprints` with the real Play App Signing SHA-256
   (Play Console → Release → Setup → App signing). If the upload-key
   fingerprint is also listed, local `adb install` builds verify too.
4. Publish at `https://<origin>/.well-known/assetlinks.json` (served with
   `application/json`, no redirects, HTTP 200).
5. Verify with `bubblewrap verifyLinks` from `android/`.

## Real fingerprints already computed (local machine)

| Key | SHA-256 | Purpose |
|---|---|---|
| Upload key (`android/android.keystore`, alias `daymark`) | `3A:50:70:37:9D:DF:AF:54:42:30:0D:37:86:37:66:04:CB:DF:7F:A8:85:DC:FB:3C:D4:86:AA:35:26:5F:31:64` | Signs AABs uploaded to Play; **not** the Play signing key |
| Android debug key (`~/.android/debug.keystore`) | `33:F4:5A:81:66:86:46:42:88:7D:83:BB:29:85:D6:53:7A:0A:8D:FA:69:F5:09:0C:4F:24:33:9A:F1:DD:1F:E2` | Signs local debug APKs only |

The keystore itself is gitignored and must never be committed. Play App
Signing's fingerprint is unknown until the app is first uploaded (Step 9B+).
