# Parakeet Inference Results

Model: Parakeet TDT 0.6B v3 int8, bundled in the application.
Runtime JNI: 3611bbe18d282afc95bd5e4b8edf8f9f49f09d2148bf084c4878f6c390457cfb

| Test | Captured transcript | Response summary | Result |
|---|---|---|---|
| Short | "is it raining" | Rain not expected for rest of today | PASS |
| Compound | "what is the temperature wind and chance of rain in london" | Rain, wind 13/29 km/h, 5 C, feels 1 C | PASS |
| Long | "i am going out this evening will it rain later and should i take a jacket with me" | Rain and next-6-hours temperature | PASS |
| Repeated after cancellation | "will it be windy tomorrow" | Tomorrow forecast and wind 13/29 km/h | PASS |

These are actual captured acoustic inferences, not synthetic harness results.
No formal accuracy certification is claimed beyond these transcripts.
