# Microphone Results

| Test | Result |
|---|---|
| Microphone permission flow | PASS |
| AudioRecord initialization | PASS |
| Non-zero audio frames | PASS - 5,004 frames over 5 s |
| Short utterance capture | PASS |
| Long utterance capture | PASS |
| Cancellation while listening | PASS 3/3 |
| Repeated listening sessions | PASS |
| App alive after cancellation/repeat | PASS |

Microphone ownership was released before the final test; no privacy or permission
controls were bypassed. Device identifiers and raw audio are not published.
