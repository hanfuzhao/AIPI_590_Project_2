import argparse
import json
import os
import sys
import time
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agents.base import PriceScale
from agents.dl_agent import DLAgent
from agents.non_dl_agent import NonDLAgent
from evaluation.metrics import CaseResult, aggregate, evaluate_plan, match_levels


def load_dataset(path: str) -> list[dict]:
    with open(path) as f:
        data = json.load(f)
    return data["cases"]


def run_agent_on_cases(agent, cases, dataset_dir: str, tol_pct: float) -> list[CaseResult]:
    results: list[CaseResult] = []
    for case in cases:
        case_id = case["id"]
        image_path = os.path.join(dataset_dir, case["image"])
        scale = PriceScale(**case["price_scale"])

        try:
            t0 = time.time()
            perception, plan, _ = agent.run(image_path, scale)
            dt = time.time() - t0

            lm = match_levels(perception.levels, case["ground_truth_levels"], tol_pct=tol_pct)
            pm = evaluate_plan(plan, case.get("future_bars", []), min_rr=1.5)

            perc_dict = perception.to_dict()
            perc_dict["_latency_s"] = round(dt, 3)

            results.append(CaseResult(
                case_id=case_id,
                agent=agent.name,
                level_metrics=lm,
                plan_metrics=pm,
                perception=perc_dict,
                plan={
                    "side": plan.side,
                    "entry": plan.entry,
                    "stop": plan.stop,
                    "targets": plan.targets,
                    "rationale": plan.rationale,
                    "risk_reward": plan.risk_reward,
                },
            ))
            print(f"[{agent.name}] {case_id}: P={lm.precision:.2f} R={lm.recall:.2f} side={plan.side} outcome={pm.backtest_outcome} ({dt:.1f}s)")
        except Exception as e:
            print(f"[{agent.name}] {case_id}: ERROR {e}")
            traceback.print_exc()
            results.append(CaseResult(
                case_id=case_id,
                agent=agent.name,
                level_metrics=match_levels([], case["ground_truth_levels"], tol_pct=tol_pct),
                plan_metrics=evaluate_plan(type("P", (), {"side": "flat", "entry": None, "stop": None, "targets": [], "risk_reward": None})(), []),
                error=str(e),
            ))
    return results


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", default="data/ground_truth.json")
    ap.add_argument("--dataset_dir", default="data")
    ap.add_argument("--out", default="evaluation/results")
    ap.add_argument("--tol_pct", type=float, default=0.005)
    ap.add_argument("--agents", nargs="+", default=["non_dl", "dl"])
    ap.add_argument("--api_key", default=os.environ.get("OPENAI_API_KEY"))
    args = ap.parse_args()

    cases = load_dataset(args.dataset)
    os.makedirs(args.out, exist_ok=True)

    all_agents = {
        "non_dl": lambda: NonDLAgent(),
        "dl": lambda: DLAgent(api_key=args.api_key),
    }

    summary = {}
    for name in args.agents:
        agent = all_agents[name]()
        results = run_agent_on_cases(agent, cases, args.dataset_dir, args.tol_pct)
        with open(os.path.join(args.out, f"{name}_details.json"), "w") as f:
            json.dump([r.to_dict() for r in results], f, indent=2, ensure_ascii=False)
        agg = aggregate(results)
        summary[name] = agg.to_dict()
        print(f"\n=== {name} aggregate ===")
        print(json.dumps(agg.to_dict(), indent=2, ensure_ascii=False))

    with open(os.path.join(args.out, "summary.json"), "w") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    print(f"\nSaved summary to {os.path.join(args.out, 'summary.json')}")


if __name__ == "__main__":
    main()
