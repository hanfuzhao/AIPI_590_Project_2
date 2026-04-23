# Project 2 — Chart-reading Trading Agent (DL vs Non-DL)

An agent that looks at a **TradingView candlestick chart image** (perception is
image-based, not text), identifies support/resistance levels, and produces a
trade plan (entry / stop / target) plus a list of TradingView Remix bridge
actions to draw the plan on the chart (control).

Two variants share the same `perceive → plan → control` pipeline:

| Stage | Non-DL agent | DL agent |
|---|---|---|
| Perception | **OpenCV**: HSV candle mask → per-column high/low pixels → local pivots → price clustering | **GPT-4o Vision**: image + strict JSON schema returns levels, trend, ATR |
| Planning | **Rule-based**: nearest support/resistance + ATR stop, filtered by trend & R:R ≥ 1.5 | **GPT-4o-mini** reasoning over the structured perception output, same R:R rule in the prompt |
| Control | **Shared**: translates the `Perception + TradePlan` into `draw_levels` / `change_symbol` / etc. action dicts consumable by the TV Remix bridge |

## Motivation

Chart reading is a natural perception task — traders literally look at candles
and wicks to locate S/R. It is image-native (text-only features throw away the
visual structure) and has an objective downstream decision (the trade plan that
can be backtested). This makes it a good fit for comparing classical CV + rule
planning against a vision LLM stack: **same I/O, same control layer, very
different perception + planning internals**.

## Architecture

```
image (PNG)                      scale (px↔price, known)
     │                                     │
     ▼                                     ▼
┌─────────────────────────────────────────────────────┐
│                   Agent.perceive                    │
│  Non-DL: OpenCV   │   DL: GPT-4o Vision (JSON)      │
└─────────────────────────────────────────────────────┘
     │
     ▼  Perception {levels[], current_price, trend, ATR}
┌─────────────────────────────────────────────────────┐
│                    Agent.plan                       │
│  Non-DL: rule engine │ DL: GPT-4o-mini reasoning    │
└─────────────────────────────────────────────────────┘
     │
     ▼  TradePlan {side, entry, stop, targets[], rationale}
┌─────────────────────────────────────────────────────┐
│     Agent.control (shared)                          │
│     → list of TV Remix bridge actions               │
│       [{action:"draw_levels", params:{...}}, ...]   │
└─────────────────────────────────────────────────────┘
```

## Repo layout

```
project2/
├── agents/               # base.py + non_dl_agent.py + dl_agent.py
├── perception/           # opencv_chart.py + vision_llm.py
├── planning/             # rule_based.py + llm_planner.py
├── control/              # (shared, inside base.Agent.control)
├── evaluation/           # metrics.py + run_eval.py + results/
├── scripts/              # make_synthetic_case.py + label_tool.py + capture_dataset.py
└── data/
    ├── charts/           # PNG screenshots
    └── ground_truth.json # {cases: [{id, image, price_scale, ground_truth_levels, future_bars}]}
```

## Install

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
```

## Quick demo (non-DL, no API key needed)

```bash
# generate 3 synthetic cases
.venv/bin/python scripts/make_synthetic_case.py --case_id test_001 --support 100 --resistance 120 --seed 42
.venv/bin/python scripts/make_synthetic_case.py --case_id test_002 --support 45  --resistance 60  --seed 11
.venv/bin/python scripts/make_synthetic_case.py --case_id test_003 --support 2500 --resistance 3200 --seed 77

# run Non-DL agent across all cases
.venv/bin/python evaluation/run_eval.py --agents non_dl --tol_pct 0.015
```

You should see per-case P/R/backtest lines and an aggregate JSON.

## Full eval with both agents

```bash
export OPENAI_API_KEY=sk-...
.venv/bin/python evaluation/run_eval.py --agents non_dl dl --tol_pct 0.015
```

Output: `evaluation/results/{non_dl,dl}_details.json` + `summary.json`.

## Building a real dataset

1. Screenshot a TV chart (Cmd+Shift+4 or Remix `take_screenshot`) → `data/charts/<id>.png`
2. Note the chart-area pixel bounds and visible price range for calibration
3. `scripts/capture_dataset.py ...` to seed the case with OHLCV + price_scale
4. `scripts/label_tool.py --case_id <id>` to click in S/R levels
5. `scripts/capture_dataset.py` with a `split_idx` reserves post-screenshot bars as `future_bars` for backtest

## Evaluation metrics (see `evaluation/metrics.py`)

- **Level precision / recall / F1** — a predicted level is a TP if a GT level
  of the same role (support vs resistance) is within `±tol_pct` (default
  1.5%). Each GT level matches at most once.
- **R:R sanity** — does the plan satisfy the ≥ 1.5 R:R rule the prompt /
  rule-engine both target?
- **Plan rate** — fraction of cases where the agent gave a non-flat plan
- **Backtest win rate** — replay the `future_bars`; once the entry fills, did
  price hit target before stop? Wins / (Wins + Losses).

## Notes on the design

- **Same control layer for both agents** isolates the comparison to perception
  + planning — the thing the project actually compares.
- **Structured output (`response_format=json_schema`) on the DL side** is
  deliberate — it forces the LLM to output the same `Perception` and
  `TradePlan` shapes the Non-DL agent produces, so eval code is shared.
- **Price-scale calibration is required** for both agents. Non-DL absolutely
  needs it (it works in pixel space); DL technically can read axis labels
  itself, but we still pass the price range in the user turn so it doesn't
  hallucinate the wrong absolute prices.
- **Smoke-test data is synthetic** (`make_synthetic_case.py` draws its own
  candles). For the real evaluation in the project video, use real TV
  screenshots + manual labels via `label_tool.py`.

## Lessons learned (populate after collecting real data)

- Non-DL precision is bounded by how cleanly candle colors are segmented —
  light-theme TV reduces contrast on red/green and hurts the mask
- DL excels on trend naming but can mis-estimate absolute prices unless the
  axis range is given in the prompt
- Backtest win rate is dominated by the planning step, not perception —
  identifying the right S/R is necessary but not sufficient
