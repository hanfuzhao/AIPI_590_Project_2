from agents.base import Perception, TradePlan


def plan_rule_based(perception: Perception, min_rr: float = 1.5) -> TradePlan:
    cp = perception.current_price
    if cp is None or not perception.levels:
        return TradePlan(side="flat", rationale="perception missing price or levels")

    atr = perception.volatility_atr or (cp * 0.005)

    supports = sorted(
        (l for l in perception.levels if l.role == "support" and l.price < cp),
        key=lambda l: cp - l.price,
    )
    resistances = sorted(
        (l for l in perception.levels if l.role == "resistance" and l.price > cp),
        key=lambda l: l.price - cp,
    )

    long_plan: TradePlan | None = None
    if supports and resistances and perception.trend != "down":
        entry = supports[0].price
        stop = entry - max(0.5 * atr, entry * 0.003)
        t1 = resistances[0].price
        targets = [t1]
        if len(resistances) > 1:
            targets.append(resistances[1].price)
        long_plan = TradePlan(
            side="long",
            entry=entry,
            stop=stop,
            targets=targets,
            rationale=(
                f"buy pullback at nearest support {entry:.4f} "
                f"(strength={supports[0].strength:.1f}); target next resistance {t1:.4f}; "
                f"trend={perception.trend}"
            ),
        )

    short_plan: TradePlan | None = None
    if supports and resistances and perception.trend != "up":
        entry = resistances[0].price
        stop = entry + max(0.5 * atr, entry * 0.003)
        t1 = supports[0].price
        targets = [t1]
        if len(supports) > 1:
            targets.append(supports[1].price)
        short_plan = TradePlan(
            side="short",
            entry=entry,
            stop=stop,
            targets=targets,
            rationale=(
                f"sell rally at nearest resistance {entry:.4f} "
                f"(strength={resistances[0].strength:.1f}); target next support {t1:.4f}; "
                f"trend={perception.trend}"
            ),
        )

    candidates = [p for p in (long_plan, short_plan) if p is not None]
    candidates = [p for p in candidates if (p.risk_reward or 0) >= min_rr]

    if not candidates:
        return TradePlan(
            side="flat",
            rationale=f"no setup meets min R:R {min_rr} (trend={perception.trend})",
        )

    best = max(candidates, key=lambda p: p.risk_reward or 0)
    return best
