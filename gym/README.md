# gym/

A training camp for the body: events of rising difficulty, every method judged the same way. The
concept, the level ladder and how to add an event or a method are in [`docs/GYM.md`](../docs/GYM.md);
the current results are in [`docs/lab/SCOREBOARD.md`](../docs/lab/SCOREBOARD.md).

```
node gym/run.mjs --list
node gym/run.mjs --seeds 8 --md docs/lab/SCOREBOARD.md
```

`core/` the statistics, the whole-body gate, the episode runner, the ensemble and the report ·
`methods/` one adaptor per way of moving her · `events/` the events · `worker.mjs` a worker thread.
Tests: `tests/gym.test.mjs`.
