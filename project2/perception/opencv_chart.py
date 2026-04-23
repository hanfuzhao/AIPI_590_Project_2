from dataclasses import dataclass

import cv2
import numpy as np

from agents.base import Level, Perception, PriceScale


@dataclass
class OpenCVPerceptionConfig:
    min_pivot_separation_px: int = 6
    cluster_tolerance_pct: float = 0.004
    min_cluster_touches: int = 2
    max_levels: int = 8


def _candle_mask(bgr: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    green = cv2.inRange(hsv, np.array([35, 40, 40]), np.array([95, 255, 255]))
    red_lo = cv2.inRange(hsv, np.array([0, 40, 40]), np.array([12, 255, 255]))
    red_hi = cv2.inRange(hsv, np.array([160, 40, 40]), np.array([180, 255, 255]))
    mask = cv2.bitwise_or(green, cv2.bitwise_or(red_lo, red_hi))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 1), np.uint8))
    return mask


def _per_column_extrema(mask: np.ndarray, scale: PriceScale):
    crop = mask[scale.chart_top:scale.chart_bottom, scale.chart_left:scale.chart_right]
    h, w = crop.shape
    highs = np.full(w, np.nan)
    lows = np.full(w, np.nan)
    for x in range(w):
        col = crop[:, x]
        idx = np.where(col > 0)[0]
        if idx.size == 0:
            continue
        highs[x] = idx[0]
        lows[x] = idx[-1]
    return highs, lows


def _find_pivots(series: np.ndarray, kind: str, sep: int) -> list[tuple[int, float]]:
    pivots: list[tuple[int, float]] = []
    n = len(series)
    for i in range(sep, n - sep):
        v = series[i]
        if np.isnan(v):
            continue
        window = series[i - sep:i + sep + 1]
        if np.all(np.isnan(window)):
            continue
        if kind == "high" and v == np.nanmin(window):
            pivots.append((i, v))
        elif kind == "low" and v == np.nanmax(window):
            pivots.append((i, v))
    return pivots


def _cluster_prices(prices: list[float], tol_pct: float) -> list[tuple[float, int]]:
    if not prices:
        return []
    prices = sorted(prices)
    clusters: list[list[float]] = [[prices[0]]]
    for p in prices[1:]:
        anchor = np.mean(clusters[-1])
        if abs(p - anchor) / max(1e-9, anchor) <= tol_pct:
            clusters[-1].append(p)
        else:
            clusters.append([p])
    return [(float(np.mean(c)), len(c)) for c in clusters]


def run_opencv_perception(image_path: str, scale: PriceScale, cfg: OpenCVPerceptionConfig | None = None) -> Perception:
    cfg = cfg or OpenCVPerceptionConfig()
    bgr = cv2.imread(image_path)
    if bgr is None:
        raise FileNotFoundError(image_path)

    mask = _candle_mask(bgr)
    highs_px, lows_px = _per_column_extrema(mask, scale)

    pivot_highs_px = _find_pivots(highs_px, "high", cfg.min_pivot_separation_px)
    pivot_lows_px = _find_pivots(lows_px, "low", cfg.min_pivot_separation_px)

    def px_to_price(y_rel: float) -> float:
        return scale.px_to_price(y_rel + scale.chart_top)

    high_prices = [px_to_price(y) for _, y in pivot_highs_px]
    low_prices = [px_to_price(y) for _, y in pivot_lows_px]

    res_clusters = _cluster_prices(high_prices, cfg.cluster_tolerance_pct)
    sup_clusters = _cluster_prices(low_prices, cfg.cluster_tolerance_pct)

    levels: list[Level] = []
    for price, touches in res_clusters:
        if touches >= cfg.min_cluster_touches:
            levels.append(Level(price=price, role="resistance", strength=float(touches)))
    for price, touches in sup_clusters:
        if touches >= cfg.min_cluster_touches:
            levels.append(Level(price=price, role="support", strength=float(touches)))

    levels.sort(key=lambda l: l.strength, reverse=True)
    levels = levels[:cfg.max_levels]

    valid_cols = np.where(~np.isnan(highs_px))[0]
    current_price = None
    if valid_cols.size:
        last = valid_cols[-1]
        mid_y = (highs_px[last] + lows_px[last]) / 2.0
        current_price = px_to_price(mid_y)

    trend = "unknown"
    if valid_cols.size >= 120:
        recent = highs_px[valid_cols[-60:]]
        earlier = highs_px[valid_cols[-120:-60]]
        rec_p = px_to_price(float(np.nanmean(recent)))
        old_p = px_to_price(float(np.nanmean(earlier)))
        diff_pct = (rec_p - old_p) / old_p
        if diff_pct > 0.01:
            trend = "up"
        elif diff_pct < -0.01:
            trend = "down"
        else:
            trend = "sideways"

    volatility = None
    if valid_cols.size >= 60:
        tail = valid_cols[-60:]
        ranges = [abs(px_to_price(highs_px[i]) - px_to_price(lows_px[i])) for i in tail]
        volatility = float(np.mean(ranges))

    return Perception(
        levels=levels,
        current_price=current_price,
        trend=trend,
        volatility_atr=volatility,
        raw={
            "pivot_high_count": len(pivot_highs_px),
            "pivot_low_count": len(pivot_lows_px),
            "resistance_clusters": len(res_clusters),
            "support_clusters": len(sup_clusters),
        },
    )
