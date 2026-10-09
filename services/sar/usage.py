"""Per-run model usage as the provider reports it. Tokens are never estimated."""
from contextvars import ContextVar
from dataclasses import dataclass


@dataclass
class ModelUsage:
    llm_calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    reported: bool = False

    def record(self, generations) -> tuple[int | None, int | None]:
        self.llm_calls += 1
        call_in = call_out = 0
        seen = False
        for generation in generations:
            usage = getattr(getattr(generation, "message", None), "usage_metadata", None)
            if usage:
                call_in += int(usage.get("input_tokens") or 0)
                call_out += int(usage.get("output_tokens") or 0)
                seen = True
        if seen:
            self.input_tokens += call_in
            self.output_tokens += call_out
            self.reported = True
        return (call_in, call_out) if seen else (None, None)

    def summary(self) -> dict:
        return {
            "llm_calls": self.llm_calls,
            "input_tokens": self.input_tokens if self.reported else None,
            "output_tokens": self.output_tokens if self.reported else None,
        }


model_usage: ContextVar[ModelUsage | None] = ContextVar("sar_model_usage", default=None)
