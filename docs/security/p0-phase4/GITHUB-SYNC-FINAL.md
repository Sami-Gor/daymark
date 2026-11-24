# GitHub Synchronization Final

Date: 2026-11-24. Operation: documentation/evidence PR housekeeping only.
Repository: Sami-Gor/daymark.

## Commits and refs

| Ref | SHA | Purpose |
|---|---|---|
| main | 6aafa15333101e39e61b7cc70f23431f122c82e0 | unchanged |
| release/v2-candidate | c8fe6cea87867f61dd7706535163e93d5795a0f0 | unchanged |
| PR #90 head | fd11e287153f6b0b897851877e8c1bb8c12575d4 | unchanged |
| PR #91 head | 2dc4eb99f199c55bcb1faff838b739b2d25a833b | unchanged |
| security/p0-phase4-app | 4c79213c5e8866699d4d16d0db28ccb36a8ff214 | build branch used as sync base |
| security/p0-sync-evidence | a1c65ad0fd48b73c4aa9c4b9f8d1400b81205945 | sanitised evidence publication |

The final report is committed on security/p0-sync-evidence after `a1c65ad`; the branch
head is authoritative for its own commit SHA. No force-push was used.

## Files published

Under `docs/security/p0-phase4/`:

- PHASE4-FINAL-REPORT.md
- PHASE4-1-FINAL-REPORT.md
- KOKORO-REGRESSION-RESULTS.md
- MICROPHONE-RESULTS.md
- PARAKEET-INFERENCE-RESULTS.md
- DEVICE-VALIDATION-STATUS.md
- P0-RELEASE-READINESS.md
- README.md
- SHA256SUMS
- GITHUB-SYNC-FINAL.md

Not published: APK/AAB binaries, model files, private audio, raw device logs, device
identifiers or network details. Original evidence remains under the T5 workstreams.

## Pull requests

- PR #90: https://github.com/Sami-Gor/daymark/pull/90
  - open, draft, head fd11e28
  - description now limits scope to F1-F5 implementation, 0002 tests and rebuild workflow;
    final guard/0003/adoption are explicitly attributed to PR #91.
- PR #91: https://github.com/Sami-Gor/daymark/pull/91
  - open, draft, head 2dc4eb9
  - description refreshed to fixed AAR 8e1edb57, JNI 3611bbe1, ORT 33847ad4,
    corrected 0001 -> 0002 -> 0003 chain, native/negative-control and device results.
- Status comments added:
  - PR #90: #issuecomment-7146084900
  - PR #91: #issuecomment-7146085332

Neither PR was marked ready or merged.

## CI links

- Phase 3 native tests: https://github.com/Sami-Gor/daymark/actions/runs/45444714229
- Phase 3 ASan negative control: https://github.com/Sami-Gor/daymark/actions/runs/45444714112
- AAR build/compare 45441318753: https://github.com/Sami-Gor/daymark/actions/runs/45441318753
- Phase 4 full app build 45465058948: https://github.com/Sami-Gor/daymark/actions/runs/45465058948
- Phase 4.1 Kokoro build 45475872471: https://github.com/Sami-Gor/daymark/actions/runs/45475872471

PR #91 checks are green except the pre-existing GitLab mirror infrastructure failure.
PR #90 retains stale CI verify/model-dependent failures at its head; its native, Android,
CodeQL and AAR checks pass. This is documented, not reclassified as green.

## Completed vs outstanding

Completed: Heejun F1-F5; FND-1 through FND-7 within demonstrated scope; D-102;
fixed-chain AAR and adoption; native normal/ASan; adopted-JNI Android validation;
full app startup; Kokoro English narration; live microphone; Parakeet inference and
transcription; weather; basic WebView/privacy navigation.

Outstanding: formal speech accuracy benchmark; API 24-30 matrix; network-error/offline
handling; WebView recovery/fallback; FR/ES offline narration; privacy/packet verification;
Play declarations; signing-key backup/restore verification; final release/version
reconciliation; final production AAB build and independent integrity checks.

Release status remains HOLD. No merges, main/release changes, signing changes, Play
uploads, GitLab mirror push or evidence deletion occurred.

## Post-publication verification

- Evidence publication commit: a1c65ad0fd48b73c4aa9c4b9f8d1400b81205945.
- Final report publication commit: d6bd1ffdc7a806ed20943eeabd8596ef5cadd735.
- All published docs return HTTP 200 from raw.githubusercontent.com.
- PR #90/#91 descriptions updated; obsolete 829a0f4e/03f4e3d/21586f09 references removed.
- Both PRs remain OPEN and DRAFT at heads fd11e28 (PR90) and 2dc4eb9 (PR91).
- main = 6aafa15...; release/v2-candidate = c8fe6ce... unchanged.
