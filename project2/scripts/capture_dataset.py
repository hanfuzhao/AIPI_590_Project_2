import argparse
import csv
import json
import os
from pathlib import Path


def build_case_from_csv(
    case_id: str,
    image_relpath: str,
    csv_path: str,
    split_idx: int,
    price_scale: dict,
):
    bars = []
    with open(csv_path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            bars.append({
                "time": int(float(row["time"])),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": float(row.get("volume", 0)),
            })
    past = bars[:split_idx]
    future = bars[split_idx:]
    return {
        "id": case_id,
        "image": image_relpath,
        "price_scale": price_scale,
        "past_bars": past,
        "future_bars": future,
        "ground_truth_levels": [],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--case_id", required=True)
    ap.add_argument("--image", required=True, help="相对 data/ 的 PNG 路径")
    ap.add_argument("--csv", required=True)
    ap.add_argument("--split_idx", type=int, required=True)
    ap.add_argument("--chart_left", type=int, required=True)
    ap.add_argument("--chart_right", type=int, required=True)
    ap.add_argument("--chart_top", type=int, required=True)
    ap.add_argument("--chart_bottom", type=int, required=True)
    ap.add_argument("--price_top", type=float, required=True)
    ap.add_argument("--price_bot", type=float, required=True)
    ap.add_argument("--dataset_out", default="data/ground_truth.json")
    args = ap.parse_args()

    case = build_case_from_csv(
        args.case_id,
        args.image,
        args.csv,
        args.split_idx,
        {
            "chart_left": args.chart_left,
            "chart_right": args.chart_right,
            "chart_top": args.chart_top,
            "chart_bottom": args.chart_bottom,
            "price_top": args.price_top,
            "price_bot": args.price_bot,
        },
    )

    if os.path.exists(args.dataset_out):
        with open(args.dataset_out) as f:
            data = json.load(f)
    else:
        data = {"cases": []}

    existing = {c["id"]: i for i, c in enumerate(data["cases"])}
    if args.case_id in existing:
        data["cases"][existing[args.case_id]] = case
    else:
        data["cases"].append(case)

    Path(os.path.dirname(args.dataset_out)).mkdir(parents=True, exist_ok=True)
    with open(args.dataset_out, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Wrote case {args.case_id} to {args.dataset_out}")


if __name__ == "__main__":
    main()
