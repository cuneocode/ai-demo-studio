"""Per-request model usage as the provider reports it. Tokens are never estimated."""
from contextvars import ContextVar
from dataclasses import dataclass


@dataclass
class ModelUsage:
    llm_calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    reported: bool = False

    def record(self, generations) -> None:
        self.llm_calls += 1
        for generation in generations:
            usage = getattr(getattr(generation, "message", None), "usage_metadata", None)
            if usage:
                self.input_tokens += int(usage.get("input_tokens") or 0)
                self.output_tokens += int(usage.get("output_tokens") or 0)
                self.reported = True

    def summary(self) -> dict:
        return {
            "llm_calls": self.llm_calls,
            "input_tokens": self.input_tokens if self.reported else None,
            "output_tokens": self.output_tokens if self.reported else None,
        }


model_usage: ContextVar[ModelUsage | None] = ContextVar("briefing_model_usage", default=None)
