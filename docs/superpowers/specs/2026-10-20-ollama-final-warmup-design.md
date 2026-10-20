# Design: warm the Ollama final model during summarisation

**Status:** Implemented

## Behaviour

When `models.final` is an `ollama:` model different from `models.summary`,
cco loads it while the summary stage runs, so the final request does not
start with a cold load. No setting controls this.

With a Claude summariser, the final model starts loading before the
first chunk. The two models do not share a server, so there is nothing to
contend for.

With an Ollama summariser, the final model starts loading when the last
chunk of the last partition streams its first text. The last partition is
the low-priority one when it exists, and the primary one otherwise. That
chunk is the only summary request that streams.

Nothing is warmed when both stages use the same model, when the final
model is Claude, or under `filenamesOnly`.

The load uses the window the final request pins. Under `"auto"` the
existing probe is the load (no `num_ctx`, then `/api/ps`). Its memoised
result is what the final stage awaits, so a probe failure still fails the
run. With a configured number, `warmOllamaModel` sends an empty chat with
`options.num_ctx` set to it, so the final request's matching `num_ctx`
reuses the runner instead of reloading. A failed preload is dropped,
because the final request makes the same call and reports the same error.

## Why the last chunk, and why streamed

Ollama's scheduler (`server/sched.go`) loads a model that does not fit
beside the resident ones by evicting a runner, the process that holds a
loaded model. It evicts an idle runner
immediately. For a busy runner, it waits until the in-flight request
finishes, then evicts it. The runner is idle between summary chunks. So
if the final model starts loading at the first chunk, the summary model is
evicted at the next gap and reloaded for the next chunk. That evicts the
final model, which is then reloaded for the final stage: two extra loads
instead of one saved.

A load that starts during the last chunk can only displace the summary
model after the summary model's work is done. When the two
fit together, the load overlaps the last chunk. When they do not, the
order of events matches a run with no warm-up, so there is no loss.

"Running" has to mean the server has received the request, not only that
cco has sent it. A large chunk body takes longer to read than an empty
preload, so a preload sent just after the summary request can reach the
scheduler first. That risk is greatest with a remote `ollama.host`. The
first streamed line arrives only after the request holds the runner, so
it is a deterministic signal. A fixed delay was not used: it is a guess.

## Rejected

- Warming at the start of the summary stage on a shared server causes
  the eviction thrash above whenever the pair does not fit in GPU memory
  (VRAM).
- A config switch adds nothing: the safe timing has no downside to opt
  out of.
- Probing free VRAM cannot decide it: `/api/ps` reports the sizes of
  loaded models, not the size of an unloaded one.

## Known limits

- A reasoning model streams `thinking` before content. Only content
  deltas reach `onText`, so for such a model the warm-up starts later in
  the last chunk.
- If the last chunk overflows and is re-split, the pieces run after the
  warm-up started. In the no-fit case they can push the summary model out
  once. This is rare and the cost is bounded.
- The default `"auto"` window is chosen from total VRAM at server start,
  not free VRAM. So loading beside a resident summary model does not
  shrink the window the probe reports.
