from agents.base import Agent, Perception, PriceScale, TradePlan
from perception.vision_llm import VisionPerceptionConfig, run_vision_perception
from planning.llm_planner import LLMPlannerConfig, plan_llm


class DLAgent(Agent):
    name = "dl"

    def __init__(
        self,
        perception_cfg: VisionPerceptionConfig | None = None,
        planner_cfg: LLMPlannerConfig | None = None,
        api_key: str | None = None,
    ):
        self.perception_cfg = perception_cfg or VisionPerceptionConfig()
        self.planner_cfg = planner_cfg or LLMPlannerConfig()
        self.api_key = api_key

    def perceive(self, image_path: str, scale: PriceScale) -> Perception:
        return run_vision_perception(image_path, scale, self.perception_cfg, self.api_key)

    def plan(self, perception: Perception) -> TradePlan:
        return plan_llm(perception, self.planner_cfg, self.api_key)
