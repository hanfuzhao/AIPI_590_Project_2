import base64
import json
import os
from dataclasses import dataclass

from openai import OpenAI

from agents.base import Level, Perception, PriceScale


PERCEPTION_SCHEMA = {
    "name": "chart_perception",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "current_price": {"type": "number"},
            "trend": {"type": "string", "enum": ["up", "down", "sideways", "unknown"]},
            "volatility_atr": {"type": ["number", "null"]},
            "levels": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "price": {"type": "number"},
                        "role": {"type": "string", "enum": ["support", "resistance"]},
                        "strength": {"type": "number"},
                        "reason": {"type": "string"},
                    },
                    "required": ["price", "role", "strength", "reason"],
                },
            },
            "notes": {"type": "string"},
        },
        "required": ["current_price", "trend", "volatility_atr", "levels", "notes"],
    },
}


PERCEPTION_SYSTEM = """你在看一张 TradingView 股票/加密 K 线截图。你的任务是从图像中识别：
1. 当前价格（最新 candle 的收盘价估计）
2. 中期趋势（up/down/sideways）
3. ATR 估计（近 14 根 candle 平均价差），看不出来就填 null
4. 支撑位 (support) 和阻力位 (resistance)，每个位置给：
   - price：数值
   - role：support 或 resistance
   - strength：被触碰的次数（估计值，1-5）
   - reason：一句话说明识别依据
最多返回 8 个 level，按 strength 降序。
严格输出符合 schema 的 JSON。"""


@dataclass
class VisionPerceptionConfig:
    model: str = "gpt-4o"
    max_tokens: int = 1500


def _encode(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def run_vision_perception(image_path: str, scale: PriceScale, cfg: VisionPerceptionConfig | None = None, api_key: str | None = None) -> Perception:
    cfg = cfg or VisionPerceptionConfig()
    client = OpenAI(api_key=api_key or os.environ.get("OPENAI_API_KEY"))

    b64 = _encode(image_path)
    resp = client.chat.completions.create(
        model=cfg.model,
        max_tokens=cfg.max_tokens,
        response_format={"type": "json_schema", "json_schema": PERCEPTION_SCHEMA},
        messages=[
            {"role": "system", "content": PERCEPTION_SYSTEM},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": f"图表价格区间已知：{scale.price_bot:.4f} 到 {scale.price_top:.4f}。请输出感知结果。"},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                ],
            },
        ],
    )
    content = resp.choices[0].message.content or "{}"
    data = json.loads(content)

    levels = [
        Level(price=float(l["price"]), role=l["role"], strength=float(l["strength"]))
        for l in data.get("levels", [])
    ]
    return Perception(
        levels=levels,
        current_price=data.get("current_price"),
        trend=data.get("trend", "unknown"),
        volatility_atr=data.get("volatility_atr"),
        raw={
            "notes": data.get("notes", ""),
            "level_reasons": [l.get("reason", "") for l in data.get("levels", [])],
            "model": cfg.model,
        },
    )
