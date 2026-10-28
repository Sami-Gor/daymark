# Daymark testing — QA review brief

## Purpose

This is a short overview for independent feedback on Daymark's existing test coverage. It describes the automated layers and the most important gaps; it is not a release approval or security certification.

**Candidate reference:** `release/v2-candidate` at commit `26c933a2917090e9249719680f36178e1448fe53`.

That SHA is the reference point for this brief, not a claim that it is still the latest candidate. Any fresh test result should record the exact commit tested and, for device testing, the APK identity as well.

## Existing test layers

| Layer | What it covers | Important limit |
| --- | --- | --- |
| TypeScript type checks and Vitest | Web source logic, validation, privacy guards, intent parsing and related regressions | Only the assertions in the tests; not device runtime behaviour |
| Playwright | Browser end-to-end tests against the built web app in Chromium, using deterministic/mock network fixtures | Not Android WebView, real provider behaviour or physical sensors |
| Android JVM tests | App-shell and native voice-module logic, including endpoint detection, cancellation/lifecycle and model-integrity cases | Not a physical microphone, OEM AudioRecord behaviour or integrated speech accuracy |
| Android Gradle packaging and app lint | Debug APK/AAB packaging paths, web-asset consistency and lint checks | Not a production-signed release build; lint warnings may remain |
| GitHub Actions, CodeQL and dependency audit | CI execution, configured static analysis and dependency-advisory checks | Not dynamic testing or a complete security review; the dependency audit gate is set to critical severity |

## Main coverage gaps

- **No physical-device CI or instrumented Android test suite is checked in.** Actual microphone behaviour, device lifecycle, audible narration and GNSS delivery need device evidence.
- **No integrated speech-accuracy suite is present.** Endpoint-detector tests use synthetic samples; they do not measure recognition accuracy for real speech through the app.
- **No packet-level proof of speech privacy has been produced.** Source-level guards and log inspection do not establish that the installed binary sends no speech-related traffic.
- **Browser tests are Chromium-only and use mocks.** They do not validate the Android WebView, real network services or hardware.
- **CI does not produce a verified production-signed release artifact.** Debug packaging does not prove release signing, release configuration or Play readiness.
- **Coverage and results can drift.** Test counts and prior reports are historical unless rerun against the exact candidate SHA.

## Feedback requested

The most useful feedback would be:

1. Are any existing checks materially duplicated, low-value or giving a false sense of coverage?
2. What are the most important missing tests, given the current web and native Android architecture?
3. What is the smallest practical improvement that would materially increase confidence without introducing unnecessary tooling?
4. Which risks should remain explicit manual/device or network-evidence gates rather than being treated as covered by automation?

## Reproduction details

The companion [detailed testing reference](TESTING-REFERENCE.md) contains commands, tool versions, test locations, coverage descriptions, reporting conventions and known limitations. Use it when a concrete reproduction step is needed.

For any result, record the branch and exact commit SHA. For physical-device evidence, also record the APK SHA-256, package ID, version and signing certificate. Distinguish source-test results from installed-build, device and packet-capture evidence.

**Interpretation rule:** a passing test establishes only the behaviour asserted by that test at the commit and environment actually tested. It does not by itself establish release readiness.
