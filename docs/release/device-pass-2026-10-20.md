# Daymark V2 — physical-device test record

**Date:** 20 October 2026
**Applies to:** the V2 candidate on `v2/privacy-hardened-voice`
**Status:** **no gate in this record is closed.** This file defines the
procedures and the evidence each one needs, and records the observations that
exist so far as explicitly maintainer-attested.

## What this record is, and what it is not

This is a **procedure and evidence specification** for the physical-device
gates in [`version-2-privacy-hardening.md`](version-2-privacy-hardening.md). It
is written so that a device session can be run and its result recorded without
publishing anything sensitive.

It is **not** a test report. A gate is closed only when the evidence named in
the table below exists, in redacted form, in this repository. A passing CI run,
a clean logcat, or a claim made in a document is **not** evidence for any gate
here.

## Redaction rules for anything attached to this record

| Keep | Remove |
|---|---|
| Device model and Android version | Device serial, IMEI, Android ID, MAC/BSSID |
| Screen records of the Daymark UI | The notification shade, clock, carrier text, Wi-Fi names, any other app's content |
| Redacted logcat with payload lines removed | Any recognised speech, any transcript, any audio |
| Request URLs with the coordinate rounded to two decimals | The full-precision coordinate |
| Timestamps, durations, exit codes | Anything that identifies the operator or the place the test ran |

The specific test area, the recorded spoken prompts, and the recognised
transcripts are **not** recorded in this repository. The named-place result is
published only as an aggregate in
[`parakeet-v3-android-phone-evaluation.md`](parakeet-v3-android-phone-evaluation.md),
and the verbatim prompt previously quoted in the v1.0.0 device-pass table has
been removed.

## Device and conditions

| Property | Value |
|---|---|
| Device | `Nothing A059P` (model only) |
| Android | 16 (API 36), arm64-v8a |
| Build under test | the V2 candidate, package `io.github.sami_gor.daymark` |
| Network condition | Airplane mode on, Wi-Fi off — for every offline gate |
| Permissions | `ACCESS_COARSE_LOCATION` only; `ACCESS_FINE_LOCATION` must be absent |
| Production package | must be untouched; a separate candidate package may be used for the test build |

A second device running Android 10 or 11 (API ≤ 30) is required for G5.

## The gates, the procedure, and the evidence

### G3 — offline voice input produces the expected result

**Procedure.** Airplane mode on, Wi-Fi off. Grant only `ACCESS_COARSE_LOCATION`.
Open the voice control and speak one short weather question. Confirm the
interface shows a recognised question and produces a spoken answer.

**Evidence required.** A screen record of the question and the answer, and a
redacted logcat excerpt for the session showing the recogniser started and
finished with no error. The recognised text itself is **not** retained; the
evidence is that the flow completed and that no recogniser error was raised.

**Current status: PARTIAL — maintainer-attested.** A local observation on
2026-10-15 recorded that the microphone captured and a rain answer was
narrated, with no recogniser errors in logcat. The transcript was never
independently captured, so this gate stays open.

### G4 — recogniser unavailable reports unavailable, with no generic fallback

**Procedure.** On a device with no on-device speech recogniser for the
selected language (or a language the device does not support offline), open the
voice control.

**Evidence required.** A screen record showing the explicit "voice input is not
available on this device" state, and a redacted logcat showing the plugin
returned the unavailable code rather than starting any recogniser.

**Current status: OPEN.** No device run. The committed branch adds deterministic
unit coverage that pins the refused start and the terminal `offline-unavailable`
behaviour, but a unit test proves the state machine, not the device.

### G5 — Android API 24–30 has no voice input and invokes no network recogniser

**Procedure.** On a device running Android 10 or 11, open the voice control.

**Evidence required.** A screen record showing the unavailable state, and a
redacted logcat showing no recogniser was constructed.

**Current status: OPEN.** No device on API ≤ 30 has been tested.

### G6 — cancellation, timeout, error, backgrounding, unmount and repeat invalidate the session

**Procedure.** With a recogniser session running, trigger each of the six
conditions in turn: cancel, let it time out, force a recogniser error, send the
app to the background, unmount the route, and start a second session while the
first is live.

**Evidence required.** One redacted logcat excerpt per condition, each showing
the session invalidated, the native recogniser destroyed, and the transient
handlers cleared.

**Current status: OPEN.** No device run.

### G7 — French and Spanish narration uses a local voice, and refuses network-dependent voices

**Procedure.** On a device with an installed offline French or Spanish voice,
trigger narration. Then on a device that has only network-dependent voices for
that language, trigger narration again.

**Evidence required.** In the first case, a screen record and a logcat excerpt
showing the local voice was selected. In the second, a screen record and a
logcat excerpt showing the explicit offline-unavailable state and **no** engine
switch.

**Current status: OPEN.** Deferred: suitable local voices are not installed on
the test device. The `offline-voice-unavailable` error chain is verified by
inspection and by pinned locale strings only.

### G8 — English Kokoro narrates in airplane mode without falling back to system TTS

**Procedure.** Airplane mode on, Wi-Fi off, English selected. Trigger narration
and time it to the first audible audio.

**Evidence required.** A **packet capture** covering the narration window,
showing no outbound connection, plus a redacted logcat excerpt showing the
Kokoro engine rather than the system TTS engine.

**Current status: PARTIAL — maintainer-attested.** A local observation on
2026-10-15 recorded narration completing offline with roughly 7.6 s to first
audio buffer on a cold start. No capture is retained, and the cold-start figure
deviates both from this repository's own readiness target and from the
4.4–5.3 s first-buffer figure recorded for the Kokoro POC, so it needs its own
measurement. English narration is unchanged from v1.0.0, but the v1.0.0 record
does not evidence this candidate.

### G9 — no speech-service traffic during voice input and narration

**Procedure.** Airplane mode is not sufficient for this gate, because the point
is to prove that the app itself opens no speech-service connection. Capture
traffic on a connected device while performing the voice and narration flows,
and separately capture the request log.

**Evidence required.** A packet capture showing no connection to a speech
service, and a request log showing that no audio or transcript was sent to the
weather or geocoding endpoints.

**Current status: OPEN.** A logcat excerpt showed no recogniser errors or
payloads, but absence of log messages is not treated as proof of no traffic.

### G10 — only `ACCESS_COARSE_LOCATION`, and the OS approximate fix is sent unmodified

**Procedure.** On a connected device, grant only `ACCESS_COARSE_LOCATION`, then
use the device-location control.

**Evidence required.** The merged manifest, proving `ACCESS_FINE_LOCATION` is
absent — **this half is met by the branch and is provable now**. For the
transmitted coordinate, a request-URL capture or a server-side access log
showing the coordinate that actually left the device, with the value rounded to
two decimals in the public record.

**Current status: PARTIAL.** The permission half is met by the branch: the
merged manifest declares `ACCESS_COARSE_LOCATION` and not
`ACCESS_FINE_LOCATION`, and a unit test now asserts the exact permission set
so a re-added precise permission fails the build. The transmitted coordinate is
unproven, and the observation that exists is maintainer-attested with no
retained artefact.

### G12 — representative UK microclimate locations

**Procedure.** Repeat the device-location flow in a coastal, an elevated and an
urban location, and confirm the forecast and the region labels remain useful
at the transmitted precision.

**Evidence required.** A redacted table of the locations tested, the results,
and the dates. **The specific locations are not recorded in this public
repository.**

**Current status: OPEN.** One tested area is covered by a maintainer-attested
observation; the wider sample is not.

## The Play Console gates

G12, G14 and G15 also require the live Console. They are specified separately
in [`play-console-review-2026-10-20.md`](play-console-review-2026-10-20.md) and
are **not** part of a device session.

## Summary

| Gate | Class | Status |
|---|---|---|
| G3 | Physical device | PARTIAL — maintainer-attested |
| G4 | Physical device | OPEN |
| G5 | Physical device | OPEN |
| G6 | Physical device | OPEN |
| G7 | Physical device | OPEN |
| G8 | Physical device | PARTIAL — maintainer-attested |
| G9 | Physical device | OPEN |
| G10 | Automated + physical device | PARTIAL — permission half met by the branch |
| G12 | Physical device + Play Console | OPEN |

**No physical-device gate is closed.** Three of them are partly evidenced by
maintainer attestation, which is recorded as such and is not treated as proof.
