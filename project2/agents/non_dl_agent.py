from agents.base import Agent, Perception, PriceScale, TradePlan
from perception.opencv_chart import OpenCVPerceptionConfig, run_opencv_perception
from planning.rule_based import plan_rule_based


class NonDLAgent(Agent):
    name = "non_dl"

    def __init__(self, perception_cfg: OpenCVPerceptionConfig | None = None, min_rr: float = 1.5):
        self.perception_cfg = perception_cfg or OpenCVPerceptionConfig()
        self.min_rr = min_rr

    def perceive(self, image_path: str, scale: PriceScale) -> Perception:
        return run_opencv_perception(image_path, scale, self.perception_cfg)

    def plan(self, perception: Perception) -> TradePlan:
        return plan_rule_based(perception, min_rr=self.min_rr)
