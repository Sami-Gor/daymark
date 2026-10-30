// CDP helper for one Ask Daymark capture window.
// Prints JSON only: { ok, started, ended, outcome, listeningMs, reason }.
// Never reads or prints the transcript.
const port = process.argv[2];
const mode = process.argv[3] ?? 'run';
const timeoutMs = Number(process.argv[4] ?? 45000);

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((target) => target.type === 'page');
if (!page) {
  console.log(JSON.stringify({ ok: false, reason: 'no-webview-page' }));
  process.exit(3);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});
const evaluate = (expression) => new Promise((resolve) => {
  const id = ++nextId;
  pending.set(id, (message) => resolve(message.result?.result?.value));
  ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
});

const STATE = `(() => {
  const button = document.querySelector('[data-testid="button-ask-daymark"]');
  const answer = document.querySelector('[data-testid="ask-answer"]');
  const error = document.querySelector('[data-testid="ask-error"]');
  return {
    listening: button ? button.getAttribute('aria-pressed') === 'true' : null,
    hasAnswer: Boolean(answer),
    hasError: Boolean(error),
  };
})()`;

const initial = await evaluate(STATE);
if (!initial || initial.listening === null) {
  console.log(JSON.stringify({ ok: false, reason: 'ask-button-not-found' }));
  process.exit(3);
}
if (initial.listening) {
  console.log(JSON.stringify({ ok: false, reason: 'already-listening' }));
  process.exit(3);
}

if (mode === 'self-check') {
  console.log(JSON.stringify({ ok: true, reason: 'idle' }));
  process.exit(0);
}

// Click through the DOM rather than raw coordinates: the narration control is
// a different button and must never be mistaken for the listening state.
await evaluate(`document.querySelector('[data-testid="button-ask-daymark"]').click(); true`);

const startDeadline = Date.now() + 6000;
let state = await evaluate(STATE);
while (Date.now() < startDeadline && !state?.listening) {
  await new Promise((resolve) => setTimeout(resolve, 200));
  state = await evaluate(STATE);
}
if (!state?.listening) {
  console.log(JSON.stringify({ ok: false, reason: 'start-not-confirmed' }));
  process.exit(3);
}
const listeningSince = Date.now();

const endDeadline = Date.now() + timeoutMs;
while (Date.now() < endDeadline) {
  state = await evaluate(STATE);
  if (state && !state.listening && (state.hasAnswer || state.hasError)) break;
  await new Promise((resolve) => setTimeout(resolve, 300));
}
if (!state || state.listening) {
  console.log(JSON.stringify({ ok: false, reason: 'end-not-confirmed', listeningMs: Date.now() - listeningSince }));
  process.exit(3);
}

console.log(JSON.stringify({
  ok: true,
  started: true,
  ended: true,
  outcome: state.hasAnswer ? 'answer' : state.hasError ? 'error' : 'unknown',
  listeningMs: Date.now() - listeningSince,
}));
ws.close();
