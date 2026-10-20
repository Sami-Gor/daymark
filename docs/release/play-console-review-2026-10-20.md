# Daymark — Play Console review record

**Date:** 20 October 2026
**Applies to:** the released v1.0.0 build, and the V2 candidate
**Status:** **nothing in this record is verified.** This file lists the exact
questions to ask the live Console, the answer each one must give, and where the
current answer is only asserted.

## Why this file exists

The repository's release documents contain several statements about the Play
Console — that the app is in production, that the Data safety form is complete,
that Play App Signing is enrolled, that closed testing finished, that the store
listing is done. **None of those statements can be verified from this
repository.** There is no Console export, no rollout record, no store-listing
capture and no tagged release here; the GitHub releases and tags are both empty.

So each item below is marked with the status it actually has:

- **VERIFIED** — a dated, recorded check of the live Console is in this
  repository. There are currently **none**.
- **MAINTAINER-REPORTED** — the maintainer asserts it. It is not disproved, and
  it is not proved.
- **OPEN** — the answer must still be established.

Nothing in this pass changed the Play Console, published a policy, submitted a
bundle or deployed anything. The purpose is to make the next Console session
cheap and to record honestly what is still asserted rather than established.

## The multi-version rule comes first

Play's Data safety section describes the **sum** of an app's data collection and
sharing across **all versions currently distributed** on Google Play.

v1.0.0 is distributed. It declares `ACCESS_FINE_LOCATION` and transmits a
two-decimal fix — under 3 km², so it is a **Precise** location answer. The V2
candidate declares `ACCESS_COARSE_LOCATION` only and sends the OS-provided
approximate fix, which is an **Approximate** answer.

Therefore an Approximate-only answer would be **inaccurate** while v1.0.0
remains live. The options are to withdraw v1.0.0 from Play before the candidate
ships, or to declare both location types until it is gone. This decision comes
before any other Data safety question, because it determines what the answer is.

## Item-by-item record

| # | Item | Must be checked | Current status |
|---|---|---|---|
| C1 | Production rollout | The production track's release status, the rollout state, and the first date the app was available to users | **MAINTAINER-REPORTED** — production since 13 October 2026, per the maintainer. No rollout record in this repository. |
| C2 | Distributed versions | The complete list of versions currently distributed, with their version codes and their permissions | **OPEN** — required before C4 can be answered. |
| C3 | Play App Signing | That enrolment is active, and that the app-signing certificate SHA-256 recorded in `docs/release/assetlinks.template.json` is the one actually in use | **MAINTAINER-REPORTED** — the fingerprint was transcribed from the Console; it has not been re-read. |
| C4 | Data safety — location | The saved answer, and the data type it selects | **OPEN** — the saved answer was not exported. See the multi-version rule above. |
| C5 | Data safety — voice input | Whether the saved answer accounts for audio being transmitted off-device | **OPEN** — the shipped build calls the WebView speech API, so the released answer and the candidate answer differ. |
| C6 | Data safety — voice output | Whether the saved answer accounts for the narration text going to a speech provider | **OPEN** |
| C7 | Data safety — in-app search history | Whether the typed place query is declared as app activity, separately from app interactions | **OPEN** |
| C8 | Data safety — deletion request mechanism | The saved answer | **OPEN** — and it is a required question for an app with a Data safety form. Daymark cannot erase provider-held logs, and the answer must not say otherwise. |
| C9 | Data safety — ephemeral | Whether the location answer is marked ephemeral | **OPEN** — the current guidance treats "No" as the conservative choice, because the provider's free-API logs may retain coordinates for up to 90 days. |
| C10 | Store listing | That the default listing and every asset are complete and current | **MAINTAINER-REPORTED** — recorded as complete; no capture in this repository. |
| C11 | Other app-content declarations | Content rating, target audience, ads, app access and the AI-asset declaration | **MAINTAINER-REPORTED** — same status. |
| C12 | Closed testing | That it was completed, and when | **MAINTAINER-REPORTED** — same status. |
| C13 | Privacy policy field | That the Console field points at the deployed policy URL, and that the deployed wording matches the shipped build | **PARTLY VERIFIABLE** — the URL is independently reachable and returns HTTP 200. The deployed wording is the v1.0.0 wording, which matches the shipped build; the revised V2 wording is not live. |
| C14 | Digital Asset Links | That the website endpoint serves the expected statements and that the fingerprints match | **VERIFIED** — HTTP 200, `application/json`, both fingerprints present, and the Digital Asset Links API returns the expected statements. The website side only; on-device domain verification remains untested. |
| C15 | On-device App Links | That a device with a signed build opens the verified links in the app | **OPEN** — requires a device. Correctly recorded as untested elsewhere. |
| C16 | Native debug symbols | Whether the symbols warning for the current release is still outstanding, and the plan for the next one | **OPEN** |
| C17 | Version code and submission | That the next release uses the next unused version code, and that the candidate is submitted through closed testing before production | **OPEN** — the candidate still reads `versionCode 1`, the same as the live v1.0.0. |

## What to record after a Console session

For every item that is checked, add a row with: the item number, the date, what
the Console showed, and who checked it. Replace **MAINTAINER-REPORTED** with
**VERIFIED** only then.

A screenshot or a pasted export of the Data safety answers is the strongest
evidence and is the only way to answer C4–C9 from the repository afterwards. The
export contains no user data and is safe to commit once the privacy policy
question is settled.

## Release readiness remains blocked

The V2 candidate is not releasable on the strength of this record. The
physical-device gates in
[`device-pass-2026-10-20.md`](device-pass-2026-10-20.md) are separately open,
and the policy pages on the candidate still describe browser/platform voice
recognition rather than the on-device path.
