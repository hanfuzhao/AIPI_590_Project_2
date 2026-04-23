from dataclasses import dataclass, field, asdict
from typing import Literal


@dataclass
class PriceScale:
    chart_left: int
    chart_right: int
    chart_top: int
    chart_bottom: int
    price_top: float
    price_bot: float

    def px_to_price(self, y: float) -> float:
        frac = (y - self.chart_top) / max(1, self.chart_bottom - self.chart_top)
        return self.price_top - frac * (self.price_top - self.price_bot)


@dataclass
class Level:
    price: float
    role: Literal["support", "resistance"]
    strength: float = 1.0


@dataclass
class Perception:
    levels: list[Level] = field(default_factory=list)
    current_price: float | None = None
    trend: Literal["up", "down", "sideways", "unknown"] = "unknown"
    volatility_atr: float | None = None
    raw: dict = field(default_factory=dict)

    def to_dict(self):
        return {
            "levels": [asdict(l) for l in self.levels],
            "current_price": self.current_price,
            "trend": self.trend,
            "volatility_atr": self.volatility_atr,
            "raw": self.raw,
        }


@dataclass
class TradePlan:
    side: Literal["long", "short", "flat"]
    entry: float | None = None
    stop: float | None = None
    targets: list[float] = field(default_factory=list)
    rationale: str = ""

    @property
    def risk_reward(self) -> float | None:
        if self.side == "flat" or self.entry is None or self.stop is None or not self.targets:
            return None
        risk = abs(self.entry - self.stop)
        if risk == 0:
            return None
        reward = abs(self.targets[0] - self.entry)
        return reward / risk


@dataclass
class ControlActions:
    actions: list[dict] = field(default_factory=list)


class Agent:
    name: str = "base"

    def perceive(self, image_path: str, scale: PriceScale) -> Perception:
        raise NotImplementedError

    def plan(self, perception: Perception) -> TradePlan:
        raise NotImplementedError

    def control(self, perception: Perception, plan: TradePlan) -> ControlActions:
        acts: list[dict] = []

        level_items = []
        for l in perception.levels:
            color = "#22c55e" if l.role == "support" else "#ef4444"
            level_items.append({
                "price": float(l.price),
                "label": f"{l.role.upper()} ({l.strength:.2f})",
                "color": color,
                "style": "dashed",
                "linewidth": 1,
            })
        if level_items:
            acts.append({
                "action": "draw_levels",
                "params": {"levels": level_items, "kind": "entry_sl_tp", "clear_existing": True},
            })

        if plan.side != "flat" and plan.entry is not None and plan.stop is not None:
            trade_levels = [
                {"price": float(plan.entry), "label": f"ENTRY {plan.side.upper()}", "color": "#22c55e" if plan.side == "long" else "#ef4444", "style": "solid", "linewidth": 2},
                {"price": float(plan.stop), "label": "STOP", "color": "#ef4444" if plan.side == "long" else "#22c55e", "style": "dashed", "linewidth": 2},
            ]
            for i, t in enumerate(plan.targets):
                trade_levels.append({"price": float(t), "label": f"TP{i + 1}", "color": "#3b82f6", "style": "dashed", "linewidth": 2})
            acts.append({
                "action": "draw_levels",
                "params": {"levels": trade_levels, "kind": "entry_sl_tp", "clear_existing": False},
            })

        return ControlActions(actions=acts)

    def run(self, image_path: str, scale: PriceScale):
        perception = self.perceive(image_path, scale)
        plan = self.plan(perception)
        control = self.control(perception, plan)
        return perception, plan, control
