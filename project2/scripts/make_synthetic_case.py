import argparse
import json
import os
import random
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np


def simulate_bars(n_past: int, n_future: int, support: float, resistance: float, seed: int):
    rng = random.Random(seed)
    rng_range = resistance - support
    price = support + rng_range * 0.5
    targets = [support, resistance] * 6
    bars = []
    total = n_past + n_future
    legs = max(1, total // len(targets))
    for leg_i, tgt in enumerate(targets):
        for _ in range(legs):
            if len(bars) >= total:
                break
            step_toward = (tgt - price) * 0.18
            noise = rng.gauss(0, rng_range * 0.015)
            open_ = price
            close = price + step_toward + noise
            close = max(support - rng_range * 0.01, min(resistance + rng_range * 0.01, close))
            high = max(open_, close) + abs(rng.gauss(0, rng_range * 0.01))
            low = min(open_, close) - abs(rng.gauss(0, rng_range * 0.01))
            high = min(high, resistance + rng_range * 0.015)
            low = max(low, support - rng_range * 0.015)
            bars.append({
                "time": 1_700_000_000 + len(bars) * 3600,
                "open": float(open_), "high": float(high),
                "low": float(low), "close": float(close),
                "volume": rng.random() * 100,
            })
            price = close
    return bars[:total]


def render_chart(bars, out_path, price_top, price_bot, width=1280, height=720):
    n = len(bars)
    dpi = 100
    fig = plt.figure(figsize=(width / dpi, height / dpi), dpi=dpi, facecolor="#131722")
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_facecolor("#131722")
    for i, b in enumerate(bars):
        color = "#26a69a" if b["close"] >= b["open"] else "#ef5350"
        ax.vlines(i, b["low"], b["high"], color=color, linewidth=1)
        body_h = abs(b["close"] - b["open"]) or (price_top - price_bot) * 0.001
        bottom = min(b["open"], b["close"])
        ax.add_patch(plt.Rectangle((i - 0.35, bottom), 0.7, body_h, color=color))
    ax.set_xlim(-1, n)
    ax.set_ylim(price_bot, price_top)
    ax.set_xticks([])
    ax.set_yticks([])
    for spine in ax.spines.values():
        spine.set_visible(False)
    fig.savefig(out_path, facecolor=fig.get_facecolor())
    plt.close(fig)

    return {
        "chart_left": 0,
        "chart_right": width,
        "chart_top": 0,
        "chart_bottom": height,
        "price_top": price_top,
        "price_bot": price_bot,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--case_id", required=True)
    ap.add_argument("--support", type=float, default=100.0)
    ap.add_argument("--resistance", type=float, default=120.0)
    ap.add_argument("--n_past", type=int, default=200)
    ap.add_argument("--n_future", type=int, default=60)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--dataset", default="data/ground_truth.json")
    ap.add_argument("--dataset_dir", default="data")
    args = ap.parse_args()

    bars = simulate_bars(args.n_past, args.n_future, args.support, args.resistance, args.seed)
    past = bars[:args.n_past]
    future = bars[args.n_past:]

    img_rel = f"charts/synth_{args.case_id}.png"
    img_path = os.path.join(args.dataset_dir, img_rel)
    Path(os.path.dirname(img_path)).mkdir(parents=True, exist_ok=True)

    price_top = args.resistance * 1.05
    price_bot = args.support * 0.95
    scale = render_chart(past, img_path, price_top=price_top, price_bot=price_bot)

    levels = [
        {"price": args.support, "role": "support", "strength": 3.0},
        {"price": args.resistance, "role": "resistance", "strength": 3.0},
    ]

    case = {
        "id": args.case_id,
        "image": img_rel,
        "price_scale": scale,
        "ground_truth_levels": levels,
        "future_bars": future,
        "meta": {"synthetic": True, "support": args.support, "resistance": args.resistance, "seed": args.seed},
    }

    if os.path.exists(args.dataset):
        with open(args.dataset) as f:
            data = json.load(f)
    else:
        data = {"cases": []}
    existing = {c["id"]: i for i, c in enumerate(data["cases"])}
    if args.case_id in existing:
        data["cases"][existing[args.case_id]] = case
    else:
        data["cases"].append(case)
    with open(args.dataset, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Wrote synthetic case {args.case_id} -> {img_path}")


if __name__ == "__main__":
    main()
