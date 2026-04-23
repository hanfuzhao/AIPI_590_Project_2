from dataclasses import dataclass, field, asdict

from agents.base import Level, Perception, TradePlan


@dataclass
class LevelMetrics:
    tp: int = 0
    fp: int = 0
    fn: int = 0

    @property
    def precision(self) -> float:
        d = self.tp + self.fp
        return self.tp / d if d else 0.0

    @property
    def recall(self) -> float:
        d = self.tp + self.fn
        return self.tp / d if d else 0.0

    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if (p + r) else 0.0


def match_levels(predicted: list[Level], ground_truth: list[dict], tol_pct: float = 0.005) -> LevelMetrics:
    m = LevelMetrics()
    gt_matched = [False] * len(ground_truth)
    for p in predicted:
        hit = False
        for i, g in enumerate(ground_truth):
            if gt_matched[i]:
                continue
            if p.role != g["role"]:
                continue
            if abs(p.price - g["price"]) / max(1e-9, g["price"]) <= tol_pct:
                gt_matched[i] = True
                hit = True
                break
        if hit:
            m.tp += 1
        else:
            m.fp += 1
    m.fn = sum(1 for x in gt_matched if not x)
    return m


@dataclass
class PlanMetrics:
    has_plan: bool = False
    side: str = "flat"
    risk_reward: float | None = None
    meets_min_rr: bool = False
    backtest_outcome: str = "no_trade"
    bars_to_outcome: int | None = None


def evaluate_plan(plan: TradePlan, future_bars: list[dict], min_rr: float = 1.5, max_bars: int = 96) -> PlanMetrics:
    out = PlanMetrics(
        has_plan=plan.side != "flat",
        side=plan.side,
        risk_reward=plan.risk_reward,
        meets_min_rr=(plan.risk_reward or 0) >= min_rr,
    )
    if plan.side == "flat" or plan.entry is None or plan.stop is None or not plan.targets:
        return out

    entered = False
    target = plan.targets[0]
    for i, bar in enumerate(future_bars[:max_bars]):
        lo, hi = bar["low"], bar["high"]
        if not entered:
            if plan.side == "long" and lo <= plan.entry:
                entered = True
            elif plan.side == "short" and hi >= plan.entry:
                entered = True
            if not entered:
                continue
        if plan.side == "long":
            if lo <= plan.stop:
                out.backtest_outcome = "loss"
                out.bars_to_outcome = i
                return out
            if hi >= target:
                out.backtest_outcome = "win"
                out.bars_to_outcome = i
                return out
        else:
            if hi >= plan.stop:
                out.backtest_outcome = "loss"
                out.bars_to_outcome = i
                return out
            if lo <= target:
                out.backtest_outcome = "win"
                out.bars_to_outcome = i
                return out

    if entered:
        out.backtest_outcome = "timeout"
    else:
        out.backtest_outcome = "not_filled"
    return out


@dataclass
class CaseResult:
    case_id: str
    agent: str
    level_metrics: LevelMetrics
    plan_metrics: PlanMetrics
    perception: dict = field(default_factory=dict)
    plan: dict = field(default_factory=dict)
    error: str | None = None

    def to_dict(self):
        return {
            "case_id": self.case_id,
            "agent": self.agent,
            "level_metrics": asdict(self.level_metrics),
            "plan_metrics": asdict(self.plan_metrics),
            "perception": self.perception,
            "plan": self.plan,
            "error": self.error,
        }


@dataclass
class AggregateMetrics:
    agent: str
    n_cases: int
    n_errors: int
    level_precision: float
    level_recall: float
    level_f1: float
    plan_rate: float
    win_rate: float
    avg_rr: float

    def to_dict(self):
        return asdict(self)


def aggregate(results: list[CaseResult]) -> AggregateMetrics:
    if not results:
        raise ValueError("no results")
    agent = results[0].agent
    n = len(results)
    errs = sum(1 for r in results if r.error)

    tp = sum(r.level_metrics.tp for r in results)
    fp = sum(r.level_metrics.fp for r in results)
    fn = sum(r.level_metrics.fn for r in results)
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0

    planned = [r for r in results if r.plan_metrics.has_plan]
    plan_rate = len(planned) / n if n else 0.0

    wins = sum(1 for r in planned if r.plan_metrics.backtest_outcome == "win")
    losses = sum(1 for r in planned if r.plan_metrics.backtest_outcome == "loss")
    win_rate = wins / (wins + losses) if (wins + losses) else 0.0

    rrs = [r.plan_metrics.risk_reward for r in planned if r.plan_metrics.risk_reward is not None]
    avg_rr = sum(rrs) / len(rrs) if rrs else 0.0

    return AggregateMetrics(
        agent=agent,
        n_cases=n,
        n_errors=errs,
        level_precision=precision,
        level_recall=recall,
        level_f1=f1,
        plan_rate=plan_rate,
        win_rate=win_rate,
        avg_rr=avg_rr,
    )
