# Source recovery and authenticity — ONNX Runtime v1.32.0

Verdict: **RECOVERED AND CONTENT-AUTHENTICATED; canonical-org provenance assumption remains**.

Evidence directory: `/tmp/ort132-sourceforge` and lead copy `/tmp/ort132-sourceforge-lead`.

## Archive

URL: `https://sourceforge.net/projects/onnx-runtime.mirror/files/v1.32.0/ONNX%20Runtime%20v1.32.0%20source%20code.tar.gz/download`

- Size: 282,439,612 bytes
- SHA-256: `c8752f1f7d79a624341826d0a23a9c06f3a7ee0201f1927023355264d04137e9`
- HTTP: 200, `application/x-gzip`, `Last-Modified: Fri, 13 Nov 2026 06:12:11 GMT`, ETag `6af6aa3b-10d5afbc`
- Root: `microsoft-onnxruntime-fab30a4/`; 12,998 tar entries; 11,667 regular files
- No `.git`, no `GIT_COMMIT_ID`, no archive signature/checksum
- `VERSION_NUMBER=1.32.0`; plugin EPs 0.4.0 / 0.6.0
- `pax_global_header` comment: `fab30a46491a40f5e4c968b80e8a59acbbb91b53`

## Independent authentication

- Independent codeload copy from `Craigacp/onnxruntime` at `fab30a46…`: 282,464,170 bytes, SHA-256 `b5e568e990dd07f9f8a48277baeded007db338156d0f2c6fc1e75de4340b0a68`; 11,667/11,667 files identical in content and mode.
- Commit tree `65dbd7f0d881551343749845cb03b616f666e228`; 12,989/12,989 entries match GitHub tree listing after CRLF handling for 9 `.sln` files.
- Commit `fab30a46…` has a GitHub web-flow signature; sub-agent verified the OpenPGP/RSA signature cryptographically (digest `0e77c13bd27c80fba07d84dfcd3150303a88c39da1fe0a811e5b0e1f758a849f`).
- SourceForge bytes independently reproduced twice.

## Limitation

`api.github.com/repos/microsoft/onnxruntime` and the canonical GitHub pages return 404. No signed `v1.32.0` tag or release attestation is available. The commit exists in a fork-network root, but the claim that it is the canonical Microsoft-published commit cannot be independently queried. SourceForge itself supplies no signature.

**Do not start a build without explicit owner approval of this commit/mirror provenance.**