import json
import os
from dataclasses import dataclass

from openai import OpenAI

from agents.base import Perception, TradePlan


PLAN_SCHEMA = {
    "name": "trade_plan",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "side": {"type": "string", "enum": ["long", "short", "flat"]},
            "entry": {"type": ["number", "null"]},
            "stop": {"type": ["number", "null"]},
            "targets": {"type": "array", "items": {"type": "number"}},
            "rationale": {"type": "string"},
        },
        "required": ["side", "entry", "stop", "targets", "rationale"],
    },
}


PLAN_SYSTEM = """你是资深交易员。根据给定的结构化感知结果（当前价、趋势、S/R levels、ATR），
产出一个交易方案。要求：
- side ∈ {long, short, flat}
- long：entry 放在支撑，stop 在支撑下方至少 0.5×ATR，targets 选阻力位
- short：镜像
- 趋势向下不做多，趋势向上不做空
- R:R 必须 ≥ 1.5 否则返回 side=flat
- rationale 用一两句中文解释
严格输出符合 schema 的 JSON。"""


@dataclass
class LLMPlannerConfig:
    model: str = "gpt-4o-mini"
    max_tokens: int = 800


def plan_llm(perception: Perception, cfg: LLMPlannerConfig | None = None, api_key: str | None = None) -> TradePlan:
    cfg = cfg or LLMPlannerConfig()
    client = OpenAI(api_key=api_key or os.environ.get("OPENAI_API_KEY"))

    resp = client.chat.completions.create(
        model=cfg.model,
        max_tokens=cfg.max_tokens,
        response_format={"type": "json_schema", "json_schema": PLAN_SCHEMA},
        messages=[
            {"role": "system", "content": PLAN_SYSTEM},
            {"role": "user", "content": json.dumps(perception.to_dict(), ensure_ascii=False)},
        ],
    )
    data = json.loads(resp.choices[0].message.content or "{}")
    return TradePlan(
        side=data.get("side", "flat"),
        entry=data.get("entry"),
        stop=data.get("stop"),
        targets=data.get("targets") or [],
        rationale=data.get("rationale", ""),
    )
