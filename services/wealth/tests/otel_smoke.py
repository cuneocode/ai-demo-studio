"""Isolated OTLP receiver test: no credentials, model network, or cloud export."""
import asyncio
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx
from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import ExportTraceServiceRequest
from opentelemetry.proto.collector.metrics.v1.metrics_service_pb2 import ExportMetricsServiceRequest

received = {"traces": [], "metrics": []}
class Receiver(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_POST(self):
        body = self.rfile.read(int(self.headers["Content-Length"]))
        signal = "traces" if self.path.endswith("traces") else "metrics"
        msg = ExportTraceServiceRequest() if signal == "traces" else ExportMetricsServiceRequest()
        msg.ParseFromString(body)
        received[signal].append(msg)
        self.send_response(200)
        self.send_header("Content-Type", "application/x-protobuf")
        self.send_header("Content-Length", "0")
        self.end_headers()

receiver = ThreadingHTTPServer(("127.0.0.1", 0), Receiver)
threading.Thread(target=receiver.serve_forever, daemon=True).start()
for key in list(os.environ):
    if key.startswith(("OTEL_", "SPLUNK_", "AIDEFENSE_", "WEALTH_AIDEFENSE_", "GALILEO_")):
        os.environ.pop(key)
os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"] = f"http://127.0.0.1:{receiver.server_port}"
os.environ["AIDEFENSE_MODE"] = "off"
os.environ["WEALTH_AIDEFENSE_MODE"] = "off"

from telemetry import WealthTelemetry
telemetry = WealthTelemetry()
telemetry.start()
from nim import ProtectedChatOpenAI
from security import defense
defense.mode = "off"

calls = 0
def model_response(request):
    global calls
    calls += 1
    return httpx.Response(200, json={"id": f"chat-{calls}", "object": "chat.completion", "created": 1, "model": "test-model", "choices": [{"index": 0, "message": {"role": "assistant", "content": "Watch the issuer."}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}})

async def run():
    async with httpx.AsyncClient(transport=httpx.MockTransport(model_response)) as client:
        model = ProtectedChatOpenAI(api_key="test-key", model="test-model", http_async_client=client)
        with telemetry.span() as span:
            tid = format(span.get_span_context().trace_id, "032x")
            result = await model.ainvoke([("user", "PRIVATE_TEST_PROMPT")], config={"metadata": {"workflow_name": "wealth-research"}})
            assert "Watch" in result.content
        assert telemetry.delivery(tid)["status"] == "accepted_by_endpoint"
        telemetry.meter_provider.force_flush()
        return tid

tid = asyncio.run(run())
spans = [s for batch in received["traces"] for r in batch.resource_spans for scope in r.scope_spans for s in scope.spans]
attrs = [{a.key: a.value.string_value for a in s.attributes} for s in spans]
operations = {a.get("gen_ai.operation.name") for a in attrs}
assert "chat" in operations, operations
assert any(s.trace_id.hex() == tid for s in spans), "Broken parent trace propagation"
assert received["metrics"], "GenAI metrics were not exported"
assert "PRIVATE_TEST_PROMPT" not in str(received), "Message privacy was not respected"
print(json.dumps({"span_count": len(spans), "operations": sorted(str(op) for op in operations), "metric_batches": len(received["metrics"]), "content_privacy": "passed"}))
telemetry.shutdown()
receiver.shutdown()
