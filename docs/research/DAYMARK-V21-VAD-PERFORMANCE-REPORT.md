# Daymark V2.1 — VAD / performance assessment

**Agent:** D (VAD/performance)
**Branch:** `research/v21-vad-performance`
**Baseline commit:** `622eff2` (`feat(ui): gate optional narration on native voice READY state`), worktree `/Users/m1/Desktop/DayMark Research /wt-agent-d`
**Current checkout cross-check:** `4f5eb01`. Five of the six speech-path sources cited below are **byte-identical** between `622eff2` and `4f5eb01`; the sixth, `ParakeetSpeechRecognitionPlugin.java`, differs only in the model-install storage preflight at `:751-761` — not the capture, endpoint, or decode path (Appendix B).
**Date:** 2026-11-09
**Status:** read-only assessment. **No production code, constants, tests, or device state were changed. Physical device NOT TESTED; no adb, no install, no push.**

**Evidence labels used throughout**

| Label | Meaning |
|---|---|
| **[C]** | Code fact, read at the cited file/line in `622eff2` |
| **[S]** | Exact output of the offline simulator in `docs/research/v21-vad-performance/harness/` (synthetic signals, no model, no phone) |
| **[H]** | Host measurement re-derived on 2026-11-09 from retained FLEURS result CSVs (desktop, not a phone) |
| **[M]** | Measurement previously recorded on a physical device, quoted from a retained report; raw data is not in this workspace |
| **[P]** | Projection / arithmetic inference from the measured anchors above; not measured |
| **[U]** | Unknown — not measured, not retained, or contradicted by the evidence |

---

## At a glance

| Quantity | Value | Type |
|---|---:|---|
| Sample rate / chunk | 16 000 Hz / 320 samples (20 ms) | [C] |
| Speech gate | 0.02 RMS (≈ −34 dBFS), fixed | [C] |
| Onset / hangover / cap | 60 ms / 1500 ms / 30 000 ms | [C] |
| Detector frames | 960 / 24 000 / — | [C] |
| Capture for a 2 s command (0.5 s lead-in) | 4000 ms | [S] |
| Post-speech floor before decode | **1500 ms** (+0–20 ms) | [C]/[S] |
| Trailing silence handed to the decoder, 2 s command | 1500 ms = **43 %** of captured speech-to-end audio (37.5 % including lead-in) | [S]/[P] |
| Weather API inside the transcript→answer path | **0 ms** | [C] |
| FLEURS desktop WER EN / FR / ES | 7.84 % / 7.05 % / 4.76 % (n=200 each) | [H] |
| Desktop median RTF EN / FR / ES | 0.038 / 0.036 / 0.035 | [H] |
| Device decode anchor (different device/build) | 6.50 s median / 7.39 s P95, 8 live runs | [M] |
| Retained integrated session note | 6–8 s wall | [M] (conflicts with the decode anchor; §3.3) |
| **Recommended production setting** | **onset 60 / hangover 1500 (keep)** | assessment |

---

## 1. Scope

This assessment re-verifies the VAD/endpoint path at `622eff2` against the current code, re-validates the offline replay harness, and states what is measured versus simulated versus unknown for the requested coverage matrix (short/medium/long, EN/FR/ES, quiet speech, noise, false starts/endings).

The prior analysis in `/Users/m1/Desktop/DayMark Research /v21-vad-analysis/` (baseline `3426bb4`) reached the same endpoint recommendation and proposed leading/trailing silence trimming before decode. That proposal is **still unimplemented and unapproved**; this report does not implement it and does not treat it as evidence. FLEURS inference was **not** re-run. The harness was re-run because the task requires validating that it still matches the current detector.

---

## 2. Pipeline verified against current code

### 2.1 Constants

`ParakeetSpeechRecognitionPlugin.java:85-114`:

| Constant | Value | Line | Effect |
|---|---:|---:|---|
| `SAMPLE_RATE` | 16 000 Hz | `:86` | mono, 1 PCM short = 1 frame |
| `CHUNK_SAMPLES` | 320 | `:92` | one read = 20 ms |
| `MAX_CAPTURE_MS` | 30 000 | `:94` | hard cap |
| `READ_TIMEOUT_MS` | 100 | `:100` | bounds a stalled read |
| `SPEECH_THRESHOLD` | 0.02 | `:102` | fixed RMS gate |
| `ONSET_MS` | 60 | `:104` | consecutive speech to start |
| `HANGOVER_MS` | 1500 | `:106` | consecutive quiet to end |
| `NUM_THREADS` | 2 | `:108` | inference threads |

Detector arithmetic (`SpeechEndpointDetector.java:63-64`): `onsetFrames = round(16000 × 0.060) = 960`, `hangoverFrames = round(16000 × 1.500) = 24000`. Frame counts are **real PCM frames**, not reads (`accept(rms, frameCount)` at `:75-103`), so a short read contributes only its true duration.

### 2.2 Stage-by-stage

| # | Stage | Code | Behaviour | Class |
|---:|---|---|---|---|
| 1 | Tap → start | `AskDaymark.tsx:61-83` → `use-speech-recognition.ts:98-114` → `voice-input-native.ts:202-242` | Creates `sessionId`, calls native `start({sessionId, lang})`. No timer starts until the native `started` event. | [C] |
| 2 | Native admission | `ParakeetSpeechRecognitionPlugin.java:198-242` | Language must normalize, model must be ready, session must be idle, `RECORD_AUDIO` must be granted; otherwise explicit error. | [C] |
| 3 | Recorder open | `AudioSpeechCaptureDevice.java:52-113` | Checks permission again, `AudioRecord` mono/PCM16/16 kHz, `startRecording()`, verifies `RECORDSTATE_RECORDING`. | [C] |
| 4 | `started` + t0 | `ParakeetSpeechRecognitionPlugin.java:586-600`, `:485` | `notifyStarted` + `start` resolve; **`captureStartMs` is read only after this** (`:485`). | [C] |
| 5 | Capture loop | `:493-521` | 20 ms reads; every byte appended to `SampleBuffer`; per-block RMS compared with 0.02; 30 s deadline checked every iteration. | [C] |
| 6 | Onset | `SpeechEndpointDetector.java:82-89` | 960 consecutive above-threshold frames set `speechStarted`; quiet before onset resets the run (`:91-97`). | [C]/[S] |
| 7 | Endpoint | `SpeechEndpointDetector.java:90-101` | 24 000 consecutive sub-threshold frames end the utterance. | [C]/[S] |
| 8 | Mic release + `captureEnd` | `ParakeetSpeechRecognitionPlugin.java:530-534` | Mic released **before** decode; `captureEnd` carries wall-clock `capturedMs` since step 4. | [C] |
| 9 | Decode | `:547` → `:911-930`; config `:871-897` | A fresh stream is fed the **entire captured buffer** (lead-in + speech + 1500 ms tail), `greedy_search`, CPU, 2 threads. | [C] |
| 10 | Result | `:550-554` | Empty text → `no-speech`; otherwise `result {transcript}` → JS `onResult`. | [C] |
| 11 | Intent | `AskDaymark.tsx:68-79` → `weather-intents.ts:801` | `normalizeTranscript` + pure in-memory resolver using the already-loaded `weather` prop. No network. | [C] |
| 12 | Response | `AskDaymark.tsx:79-80`, `:43-49` | Answer text set in React state, then TTS is queued after `isListening` flips false. | [C] |

**Two consequences that matter for latency**

1. The hangover is a **fixed 1.5 s tax on every successful utterance**, even when the speaker stopped cleanly. For a last speech frame at `t_speech_end`:
   `capture_end ≈ t_speech_end + 1500 ms + (0…20 ms read quantisation)`.
2. That same 1500 ms is **decoded**. Capture and decode input are the same buffer; nothing is trimmed today.

The 30 s cap is checked after each read, so the buffer can exceed 30 000 ms by at most one read (20 ms nominal, up to ~100 ms under a stalled read). If the cap is reached with speech already in the buffer, the 30 s is decoded (`:541-545` discards only an empty buffer).

### 2.3 Capture/decode input composition [P]

Arithmetic from the production constants; excludes lead-in.

| Speech | Captured (speech + 1500 ms) | Trailing silence | Trailing share |
|---:|---:|---:|---:|
| 1 s | 2500 ms | 1500 ms | 60 % |
| 2 s | 3500 ms | 1500 ms | 43 % |
| 3 s | 4500 ms | 1500 ms | 33 % |
| 5 s | 6500 ms | 1500 ms | 23 % |
| 10 s | 11 500 ms | 1500 ms | 13 % |
| 20 s | 21 500 ms | 1500 ms | 7 % |

With a typical 0.5 s lead-in the 2 s case becomes 4000 ms captured, 1500 ms trailing (37.5 %). This is the largest guaranteed inefficiency in the path, and it is larger for short commands than for long ones.

---

## 3. Latency decomposition

### 3.1 What the path can and cannot tell us

| Component | Value | Class | Basis |
|---|---:|---|---|
| Tap → `started` (permission already granted) | unknown; plausibly tens of ms | [U] | code path only, no timing log |
| Lead-in silence before speech | user-dependent; 500 ms in the simulated command | [P] | scenario assumption; it is captured and decoded |
| Onset detection | 60 ms | [C]/[S] | `:104`; starts at 560 ms with a 500 ms lead-in |
| User speech | 2.0 s (assumed command) | [P] | scenario |
| **Hangover after last speech** | **1500 ms** | **[C]/[S]** | exact; +0–20 ms quantisation |
| **`captureEnd` → `result` (decode)** | **6.50 s median / 7.39 s P95** on a different device/build, **or** ~70–76 ms by desktop RTF projection, **or unknown** for this build | **[M]/[P]/[U]** | §3.3–3.4 |
| `result` → visible answer | unknown; pure in-memory JS, no I/O | [U]/[C] | `AskDaymark.tsx:68-80` |
| Weather API | **0 ms** | **[C]** | §3.2 |
| TTS start | after the answer; not part of session wall time | [C] | `AskDaymark.tsx:43-49` |
| Model preparation | one-time on first run, not per utterance | [C] | `prepareModel()` `:729`; JS waits up to 30 s `voice-input-native.ts:63` |

The user-perceived wait **after they stop speaking** is therefore:

```
L_after_speech = 1500 ms (hangover) + T_decode + T_bridge/render
```

Onset does **not** add to post-speech latency; it only decides whether a short/faint sound counts as speech at all. That is why changing 60 ms cannot buy meaningful response time.

### 3.2 Correction: the weather API contributes 0 ms in this path

> **Correction.** `v21-eval/DAYMARK-PARAKEET-MULTILINGUAL-EVALUATION.md:64` says the 6–8 s device latency is "mostly the 1.5 s hangover plus decoder start-up and the weather request". The weather request is **not** in the voice path, and per-session "decoder start-up" does not exist either.

Evidence:

- `App.tsx:226` renders the weather UI only inside `{weather && ( ... )}`; `CurrentWeather.tsx:94-95` passes that payload into `AskDaymark`. **The Ask Daymark button is not mounted until the payload is already in React state**, so a voice session cannot start before it.
- `AskDaymark.tsx:76-79` calls `getCombinedIntentResponse` / `getIntentResponse` with the `weather` prop; `weather-intents.ts:801` is a pure function. A content search of `weather-intents.ts` finds **no `fetch`, no HTTP client, no geocoding, no storage**.
- A weather refresh (`App.tsx:59-88`) can run concurrently after a place change, but `onResult` neither triggers nor awaits it.

**After the payload is loaded the weather API contributes 0 ms — not "some", and not "~0 with jitter".** The voice path performs no weather request at all. If the payload were absent the UI would not offer the button, so there is no cold-fetch-inside-voice case.

The second half of the quoted sentence is also wrong: the recogniser is built once in `prepareModel()` when the plugin loads, not per session; `SherpaUtteranceDecoder.decode` only creates a stream (`:916`). Model preparation can be a **one-time first-run** cost (JS waits up to 30 s for `model-preparing`), but it is not part of a warm session.

### 3.3 The unresolved decode anchor

The two retained device figures cannot both describe the same measurement basis:

- `docs/release/parakeet-v3-android-phone-evaluation.md:41,81`: median **6.50 s**, P95 **7.39 s** decode after recording, 8 live runs, on a **Nothing A059P**, standalone model harness, with no retained thread count and no retained clip durations.
- `v21-eval/runtime-and-hardware.md:16`: **6–8 s session wall time** on a **Xiaomi Redmi Note 17 Pro Max 5G**, with "no direct decode-time log".

For a 2 s command, the successful-session floor is:

```
1.50 s hangover + T_decode + 2.0 s speech + ~0.1 s UI
```

| Reading | Assumed decode | Implied tap→answer | Post-speech wait | Internally consistent? |
|---|---:|---:|---:|---|
| A: 6.50 s decode is right | 6.50 s | ≥ 10.1 s | ≥ 8.0 s | contradicts the 6–8 s session note |
| B: 6–8 s session is right | 2.4–4.4 s [P] | 6.0–8.0 s | 4.0–6.0 s | contradicts the 6.50 s decode note |

I do **not** choose between them. Section 3.4 shows why the desktop figure cannot arbitrate, and the retained reports do not contain a `captureEnd → result` timestamp for the integrated build. **The only way to settle this is instrumentation on the current APK**, not a VAD constants change.

### 3.4 Desktop versus device

Re-derived from the retained FLEURS CSVs on 2026-11-09 [H]:

| Language | n | Median RTF | Median decode | Median audio | Decode for 2 s audio [P] |
|---|---:|---:|---:|---:|---:|
| EN | 200 | 0.038 | 0.377 s | 9.49 s | ~76 ms |
| FR | 200 | 0.036 | 0.355 s | 9.87 s | ~72 ms |
| ES | 200 | 0.035 | 0.407 s | 12.27 s | ~70 ms |

These are **desktop** numbers: sherpa-onnx 2.0.1 wheel, Python, **4 decoding threads**, Apple silicon (`v21-eval/runtime-and-hardware.md:2-7`). Production is the Android AAR, **2 threads**, phone CPU. Desktop RTF is therefore a lower bound on the phone's cost, not a transferable estimate. The 6.50 s device anchor implies a phone RTF near 1.6–3.3 **if** those eight clips were 2–4 s, but their durations are not retained [U]. Do not derive phone RTF from it.

### 3.5 Measured / simulated / unknown summary

| Question | Answer | Class |
|---|---|---|
| What decides the endpoint? | 60 ms consecutive ≥0.02 RMS; 1500 ms consecutive <0.02 | [C] |
| How long after speech does capture end? | 1500 ms + 0–20 ms | [C]/[S] |
| How much audio is decoded for a 2 s command? | 3500 ms excluding lead-in (4000 ms with 0.5 s lead-in) | [S] |
| Does the weather API delay the answer? | No — 0 ms after payload load | [C] |
| Desktop accuracy on 4–30 s read speech | 7.84 / 7.05 / 4.76 % WER | [H] |
| Device decode on a different device/build | 6.50 s median | [M] |
| Integrated decode on this build | unknown | [U] |
| Mic-open and render latency | unknown | [U] |
| Short-command accuracy on humans | unknown (no corpus) | [U] |

---

## 4. Reproducible harness

### 4.1 What and where

Committed alongside this report:

```
docs/research/v21-vad-performance/
├── harness/vad_replay.py          # literal port + capture-loop model
├── harness/java_probe/EndpointProbe.java
└── results/{tables.md, sweep.csv, sweep.json, selftest.txt, crosscheck.txt}
```

The harness is a **simulation**: it never runs Parakeet, never touches a phone, and produces no transcripts. It re-implements `SpeechEndpointDetector.java` (same constructor validation, `Math.round` frame conversion, consecutive-onset reset, `>=` comparisons, frame-count accounting) and the capture loop (320-sample reads, 30 s cap, synthetic 0.02 gate).

The copy differs from the previously used `/Users/m1/Desktop/DayMark Research /v21-vad-analysis/vad_replay.py` **only** in `REPO_COMMIT` (`3426bb4` → `622eff2`) and default paths (source lookup and results directory). The algorithm is byte-for-byte the same; `diff` is in Appendix A.

### 4.2 Validation performed on 2026-11-09

| Check | Result |
|---|---|
| `--selftest` (detector port, 959+1 onset boundary, isolated blips, exact 1500 ms hangover, WAV round-trip, 600 ms-pause truncation at 500 ms) | **PASS** (`results/selftest.txt`) |
| `--crosscheck` compiling the real `622eff2` `SpeechEndpointDetector.java` (JDK 21) and feeding it the same `(rms, frameCount)` stream: 32 scenarios × 5 hangovers | **160 comparisons, 0 mismatches** (`results/crosscheck.txt`) |
| Full sweep: 32 scenarios × onset {40,60,80} × hangover {500,800,1000,1200,1500} | 480 rows (`results/sweep.csv`, `results/sweep.json`) |
| Detector source identity | SHA-256 `c4597abb…6d17`, unchanged from the prior analysis and identical at `622eff2` and `4f5eb01` |

The crosscheck covers the **detector**, not the capture loop; capture timing is covered by the analytic selftest (2 s speech + 1.5 s hangover → 3500 ms) and by reading the production loop.

### 4.3 Commands

```bash
cd "/Users/m1/Desktop/DayMark Research /wt-agent-d/docs/research/v21-vad-performance/harness"
PY=/Users/m1/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/bin/python3

$PY vad_replay.py --selftest
$PY vad_replay.py --crosscheck          # default --source points into this worktree
$PY vad_replay.py --quiet               # writes ../results/
```

### 4.4 Limits of the harness

1. **No human audio remains.** `v21-eval/` retains FLEURS TSVs and result CSVs but zero FLEURS WAVs (only three synthetic selftest WAVs exist under `v21-vad-analysis/results/wav-selftest/`). FLEURS replay is impossible.
2. "Speech" is a deterministic harmonic complex or syllabic envelope, not recorded speech. It exercises timing and level logic, not speaker, accent, microphone, or room variability.
3. Capture is modelled in audio time. Real `capturedMs` is wall-clock and includes OS scheduling jitter.
4. Read boundaries are idealised to 20 ms; production counts real frames so decisions are invariant to read splitting, but the endpoint timestamp can move by one block.
5. No decode is run, so the harness says nothing about decode time or about the effect of trimming on recognition.

---

## 5. Coverage: short/medium/long, EN/FR/ES, quiet, noise, false starts

### 5.1 Duration × language

The detector is a language-independent energy gate: the same 60/1500 applies to EN/FR/ES. Language can change phoneme durations and pause habits, but there is no language-specific threshold in the code. The language-varying evidence is **ASR accuracy**, not VAD timing.

| Duration band | EN | FR | ES |
|---|---|---|---|
| **< 1 s** (short command) | VAD timing **[S]** (200/300/500/800 ms words all capture normally); ASR accuracy **unmeasured** | VAD timing **[S]**; ASR **unmeasured** | VAD timing **[S]**; ASR **unmeasured** (only anecdote: 0.8 s synthetic TTS `no-speech` **[M]**, not human) |
| **1–4 s** | VAD timing **[S]** (2 s, 4 s); ASR **unmeasured** (FLEURS has no clip < 4.14 s) | VAD timing **[S]**; ASR **unmeasured** (min 4.02 s) | VAD timing **[S]**; ASR **unmeasured** (min 6.00 s) |
| **4–8 s** (medium) | ASR **[H]** 5.44 % WER (n=68); VAD timing **[S]** at 4 s | ASR **[H]** 8.58 % (n=52) | ASR **[H]** 4.76 % (n=17) |
| **8–30 s** (long) | ASR **[H]** 8.64 % (n=132); VAD on human clips **unmeasured** | ASR **[H]** 6.70 % (n=148) | ASR **[H]** 4.76 % (n=183); 1 clip is 30.30 s, just over the 30 s cap |
| **> 30 s** | Cap truncates at 30 s **[C]**; behaviour on human speech **unmeasured** | same | same |

Sources: WER buckets re-read from retained `v21-eval/results/summary-{en,fr,es}.json`; corpus totals `v21-eval/summary-by-language.csv` (7.84 / 7.05 / 4.76 %); durations from the result CSVs (EN median 9.49 s, FR 9.87 s, ES 12.27 s). Buckets are desktop, 4 threads, FLEURS read speech — **not** short commands, not a phone.

**What this matrix does not say:** it does not establish that a 0.5 s "Will it rain?" survives the gate, that a natural 1.1 s thinking pause is preserved, or that FR/ES speakers pause like the English read corpus. Those are the unmeasured rows.

### 5.2 Short utterances

Simulated [S]:

| Input | Capture | Result |
|---|---:|---|
| 200 ms word | 2200 ms | ok, starts at 560 ms |
| 300 ms word | 2300 ms | ok |
| 500 ms word | 2500 ms | ok |
| 800 ms word | 2800 ms | ok |
| 40 ms bursts (three, 120 ms apart) | 30 000 ms | **no-speech** |
| 60 ms burst | 2420 ms | ok (exactly the onset boundary) |

So a short **word** is not blocked by 60 ms onset, and the capture cost is dominated by the 1500 ms hangover, not by the word. But this is synthetic steady-tone audio. The real short-command question — a quiet, fast, natural "rain?" at arm's length — is **unmeasured**. The only retained short-utterance anecdote is a 0.8 s synthetic Spanish clip that produced `no-speech` even at 2.5–6× amplification (`v21-eval/DAYMARK-PARAKEET-MULTILINGUAL-EVALUATION.md:186-188`); that points at level/timbre, not length, and it is not human speech.

### 5.3 Quiet speech

The gate is a hard cliff at 0.02 RMS (−34 dBFS) [C], simulated [S]:

| Speech RMS | dBFS | Outcome |
|---:|---:|---|
| 0.019 | −34.4 | **30 000 ms**, then `no-speech` |
| 0.025 | −32.0 | normal 4 s |
| 0.040 | −28.0 | normal 4 s |

A quiet speaker therefore waits the **full 30 s** and gets an error — a worse UX failure than the 1.5 s hangover, and no onset/hangover setting can fix it. There are **no human quiet-speech recordings** retained, so the real distribution of levels at 20/40/60 cm is unknown [U]. AGC and microphone gain are not modelled; the threshold is absolute, not SNR-relative.

### 5.4 Background noise

Simulated [S], with noise at 0.03 RMS (above the gate):

| Scenario | Capture | Outcome |
|---|---:|---|
| 0.5 s noise, 2.5 s quiet, then speech | 2000 ms | **false start**: onset fires at 60 ms, the 1.5 s hangover ends capture during the quiet gap, and the first 1500 ms of real speech is lost |
| 2 s speech, then continuous noise | 30 000 ms | **cap**; `quietFrames` never accumulates, so the hangover never fires |
| 2 s speech over continuous noise | 30 000 ms | **cap** |

No real room-noise, fan, traffic, or café recordings exist here [U]. A fixed amplitude gate has no SNR notion; in noise above 0.02 the endpoint can never end, and the session decodes up to 30 s. This is a larger regression than any hangover value.

### 5.5 False starts and false endings

| Event | Simulated result | Class |
|---|---|---|
| Isolated 40 ms transient | rejected (needs 60 ms consecutive) | [S] |
| 60 ms transient | accepted — a 60 ms click can start an utterance | [S] |
| Noise before speech | **false start**; 1500 ms of speech truncated | [S] |
| Speaker pauses 500–1200 ms | kept at 1500 ms hangover | [S] |
| Speaker pauses 1200 ms | cut at 1200 ms hangover | [S] |
| Quiet continuation below 0.02 after loud speech | **false ending**; 1000 ms lost even at baseline | [S] |
| Human disfluency ("um", breath, lip smack) | **unmeasured** | [U] |

The production tests encode the important guarantee: a 1000 ms clause pause must not end the utterance (`SpeechEndpointDetectorTest.java:127-137`), and a multi-clause question with 800/600/700 ms pauses is one utterance (`:139-152`). Those are design requirements, not measured user behaviour.

### 5.6 What remains unmeasured

- Any **human** utterance shorter than 4 s (the core short-command case).
- Any **phone** capture for EN/FR/ES short commands: onset success, `capturedMs`, `no-speech`, transcript.
- Natural pause distribution for weather questions in any language.
- Real quiet speech near the threshold, and real background noise.
- Decode time on the current build; therefore the true hangover share.
- TTS and mic-open latency on the current device.

---

## 6. Recommendation

### 6.1 Keep onset 60 / hangover 1500 for now

There is no evidence in this workspace that justifies a constants change, and there is positive evidence against the alternatives:

1. **Decode dominates the post-speech wait** under either retained reading (2.4–4.4 s or 6.5 s), while the hangover is 1.5 s. The maximum capture saving from any hangover change is 1000 ms (at 500 ms), and the realistic 1200/1000 ms options save 300/500 ms.
2. **The project already rejected 500 ms** in `41d0b91` ("extend the endpoint hangover to 1.5 s for multi-clause questions"). The simulator reproduces the failure: 500 ms truncates every pause ≥500 ms and loses the whole following clause.
3. **The 1 s pause guarantee is a production test** (`SpeechEndpointDetectorTest.java:127-137`). A 1000 ms hangover cuts exactly that pause (`24000`-frame logic; sim table); 1200 ms keeps it but narrows the tested window from 1200 ms to 1000 ms.
4. **No human audio and no device run exist for this build.** All timing numbers except the quoted historical ones are synthetic.
5. **Quiet speech and noise are bigger cliffs**: both can produce a 30 s cap, not a 6–8 s session.

Onset 60 should not move either: 40 ms saves no post-speech latency and lets 40 ms transients start utterances; 80 ms costs 20 ms of onset and rejects 60 ms sounds without fixing quiet speech.

### 6.2 Trade-offs of 1000 / 1200 ms hangover

| Setting | Post-speech floor | Capture saving (2 s cmd) | Trailing silence decoded | Largest tested pause kept | 1 s pause test | Main risk |
|---|---:|---:|---:|---:|---|---|
| **1500 (current)** | 1500 ms | 0 | 1500 ms (43 %) | 1200 ms | passes | 1.5 s tax on every turn |
| **1200** | 1200 ms | **300 ms** | 1200 ms (38 %) | 1000 ms | passes | cuts natural pauses of 1000–1200 ms |
| **1000** | 1000 ms | **500 ms** | 1000 ms (33 %) | 900 ms | **breaks** (1 s pause ends) | needs test change + product sign-off |
| 800 | 800 ms | 700 ms | 800 ms (29 %) | 700 ms | breaks | high truncation risk |

The 1200 ms option is the only defensible reduction: it saves ~300 ms (≈3–5 % of a 6–10 s session) while preserving the project's 1 s guarantee. It is still a narrowing of the pause window with no human data. The 1000 ms option saves ~500 ms (≈5–8 %) but directly breaks the tested 1 s pause and would truncate a thinking pause at exactly 1000 ms.

Note that the saving is not only capture time: 300/500 ms less audio is also 300/500 ms less **decode input**, so the decode saving is `0.3 s × phone RTF` / `0.5 s × phone RTF`. On desktop that is ~11/18 ms; on the phone RTF is unknown, so the total is a range, not a number [P].

### 6.3 Minimum evidence needed before any change

1. **One instrumented device trace on the current APK**: `captureEnd → result` and `result → rendered answer`, ≥20 utterances. This resolves the 6.50 s vs 6–8 s conflict and tells us whether the hangover is 15 % or 25 % of the wait. Without it the change is guesswork.
2. **A human short-command corpus**: ≥30 utterances per language (EN/FR/ES), 0.3–5 s, at 20/40/60 cm and quiet/normal/loud levels; at least 10 with a deliberate 600–1200 ms mid-question pause and 10 near 0.02 RMS; ≥10 in realistic noise (SNR ~5–15 dB). None exists today.
3. **Replay that corpus through the real endpoint** at onset 60 × hangover {1000, 1200, 1500} (JVM harness or the app), scoring: exact/full transcript (truncation), `no-speech` rate, `capturedMs`, and post-speech latency. A setting that improves median latency but loses one clause in twenty is not a win.
4. **Product sign-off** on any change to the 1 s pause guarantee, plus a test change if 1000 is chosen.
5. **Device A/B**: the same corpus on the phone, because the desktop harness cannot model mic gain, AGC, or room noise.

If the goal is latency rather than endpoint behaviour, the higher-value lever remains **trimming leading/trailing silence before decode while keeping 1500 ms hangover** (prior proposal, still unimplemented and unapproved). It leaves endpoint semantics unchanged, removes ~1.3 s of guaranteed silence from a 2 s command, and does not trade a pause guarantee. It needs its own model validation (trailing-context effects) and approval; it is not proposed as a change in this report.

---

## 7. Limitations and blockers

| # | Blocker | Impact |
|---:|---|---|
| 1 | **Physical device NOT TESTED** | Every timing statement about the real app is a budget, not a profile; no mic-open, decode, or render measurement exists for this build. |
| 2 | **No human short-utterance corpus retained** | FLEURS min clip is 4.14 s (EN), 4.02 s (FR), 6.00 s (ES); the 0.3–3 s command case — the one the hangover affects most — is unmeasured. |
| 3 | **FLEURS WAVs deleted** | No VAD replay on human speech; accuracy numbers are historical and desktop-only. |
| 4 | **Decode anchor conflict** | 6.50 s decode and 6–8 s session cannot both be true on one basis; the hangover share is therefore 15–25 % or more. |
| 5 | **No production instrumentation** for `captureEnd → result` | Resolving blocker 4 requires a code/log change and approval; none was made. |
| 6 | **Synthetic signals are not speech** | Timing/level logic is exercised; speaker, accent, mic, room, and disfluency are not. |
| 7 | **Historical device figures are from a different device/build/harness** | Nothing A059P, standalone model harness, unknown threads/clip lengths; not this APK. |
| 8 | **No noise/quiet human recordings** | The 30 s-cap failure modes are simulated only; their real frequency is unknown. |
| 9 | **No AGC/mic model** | The absolute 0.02 gate's real-world level distribution is unknown. |

---

## 8. Bottom line

- The endpoint path is exactly understood: **16 kHz, 20 ms reads, fixed 0.02 RMS gate, 60 ms consecutive onset, 1500 ms consecutive hangover, 30 s cap, entire buffer decoded**, with the microphone released before decode.
- **Every successful utterance pays 1500 ms after the last speech frame**, and hands that same 1500 ms of silence to the decoder — 43 % of a 2 s command's speech-to-end audio.
- **The weather API contributes 0 ms** after the payload is loaded; the earlier "hangover + decoder start-up + weather request" explanation is wrong. Decode is the dominant term, but its exact size on this build is unresolved.
- The simulator (validated 160/0 against the real Java detector) shows the only realistic hangover savings are **300 ms (1200) / 500 ms (1000)**, at the cost of narrowing the pause guarantee; **1000 ms breaks the project's 1 s pause test**.
- **Recommendation: keep 60/1500 until device instrumentation and a human short-command corpus exist.** Quiet speech (<0.02 RMS) and noise are worse failure modes than the hangover and need threshold/UX work, not hangover tuning.

---

## Appendix A — Reproduction and harness diff

```bash
cd "/Users/m1/Desktop/DayMark Research /wt-agent-d/docs/research/v21-vad-performance/harness"
PY=/Users/m1/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/bin/python3

$PY vad_replay.py --selftest      # PASS
$PY vad_replay.py --crosscheck    # 160 comparisons, 0 mismatches
$PY vad_replay.py --quiet         # 480 rows -> ../results/
```

Diff against the previously used harness (abridged; algorithm untouched):

```diff
-REPO_COMMIT = "3426bb4"
+REPO_COMMIT = "622eff2"
-            "..", ".research-clone", "artifacts", ...
+            "..", "..", "..", "..", "artifacts", ...
-... __file__), "results", "sweep.json")
+... __file__), "..", "results", "sweep.json")
```

## Appendix B — Provenance

- Analysis baseline: `622eff2` in worktree `wt-agent-d`. Current checkout `4f5eb01`.
- `622eff2..4f5eb01` diff for the cited sources: `SpeechEndpointDetector.java`, `AudioSpeechCaptureDevice.java`, `voice-input-native.ts`, `AskDaymark.tsx`, `use-speech-recognition.ts` — **no diff**. `ParakeetSpeechRecognitionPlugin.java` — only the model-install storage preflight at `:751-761` (11 deletions/1 insertion), outside the capture/decode path.
- SHA-256 at `622eff2`:
  - `SpeechEndpointDetector.java` `c4597abbd062b740566c27d69f7a25c26e2884c157900f6d556cb3f8f1006d17`
  - `ParakeetSpeechRecognitionPlugin.java` `a13118bac51c255e9557abbc78b4edf43def34d1fa187a63cd8faf1d3b51f3d9`
  - `AudioSpeechCaptureDevice.java` `3d049b8976d8b8ef4b7311e1d2c9110e24f5276ad18f64018a48ff3e3e8fcb43`
  - `voice-input-native.ts` `3a2c1e4b707c099d99add26f76f085946ab344e7822f639f29d301d844e83dce`
  - `AskDaymark.tsx` `800f55678529125fd6996bb5fbef92e1cfbcb12d16b93d09829d646bb4402b51`
  - `use-speech-recognition.ts` `dd0ad4eeca22a076f8ce51a10cd3ed3539d6524bdfd5c07b1aca8c41f84951ed`
- Harness environment: Python 3.12.14, numpy 2.3.5, JDK 21.0.13 (Temurin), recorded in `results/sweep.json` (`repo_commit: 622eff2`, 480 rows, caveat field).
- Device figures quoted, not re-measured: `docs/release/parakeet-v3-android-phone-evaluation.md:41,81` (6.50 s median / 7.39 s P95, 8 runs, Nothing A059P); `v21-eval/runtime-and-hardware.md:16` (6–8 s session, Xiaomi Redmi Note 17 Pro Max 5G); `v21-eval/DAYMARK-PARAKEET-MULTILINGUAL-EVALUATION.md:64` (the corrected claim), `:180-181` (6–7 s logcat note).
- FLEURS figures re-derived from `v21-eval/results/{en,fr,es}.csv` and `summary-{en,fr,es}.json`: corpus WER 7.84/7.05/4.76 %, median RTF 0.038/0.036/0.035, median decode 0.377/0.355/0.407 s, n=200 each; duration buckets 4–8 s / ≥8 s as in §5.1. No model inference was run on 2026-11-09.
- Prior analysis: `/Users/m1/Desktop/DayMark Research /v21-vad-analysis/VAD-PERFORMANCE-ANALYSIS.md` (baseline `3426bb4`); this report re-validates its harness and constants at `622eff2` but is self-contained.
