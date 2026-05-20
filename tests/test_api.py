import pytest
import httpx
from fastapi.testclient import TestClient
from fastapi import HTTPException
from pydantic import ValidationError

from api.main import _fingerprint_schema, analyze, app, generate, get_graph, health, import_verilog, simulate
from core.fsm import FSM
from api.schemas import FSMSchema, ImportVerilogRequest, SimulateRequest


def build_valid_payload():
    return {
        "signals": [
            {"name": "clk", "direction": "input", "width": 1},
            {"name": "reset", "direction": "input", "width": 1},
            {"name": "go", "direction": "input", "width": 1},
            {"name": "armed", "direction": "wire", "width": 1, "expression": "go & reset"},
            {"name": "done", "direction": "output", "width": 1, "default": "1'b0"},
        ],
        "states": [
            {"name": "IDLE", "is_initial": True, "actions": []},
            {"name": "RUN", "is_initial": False, "actions": ["done = 1'b1;"]},
        ],
        "transitions": [
            {"from_state": "IDLE", "to_state": "RUN", "condition": "go", "actions": []},
            {"from_state": "IDLE", "to_state": "IDLE", "condition": "1", "actions": []},
            {"from_state": "RUN", "to_state": "IDLE", "condition": "!go", "actions": []},
            {"from_state": "RUN", "to_state": "RUN", "condition": "1", "actions": []},
        ],
    }


def build_schema(payload=None):
    return FSMSchema(**(payload or build_valid_payload()))


client = TestClient(app)


def test_health_endpoint():
    assert health() == {"status": "ok"}


def test_generate_endpoint_returns_verilog():
    response = generate(build_schema())

    assert "module fsm_module" in response["verilog"]


def test_generate_infers_clock_and_reset_names_from_input_signals():
    schema = FSMSchema(
        signals=[
            {"name": "start_i", "direction": "input", "width": 1},
            {"name": "a_bi", "direction": "input", "width": 8},
            {"name": "b_bi", "direction": "input", "width": 8},
            {"name": "clk_i", "direction": "input", "width": 1},
            {"name": "rst_i", "direction": "input", "width": 1},
            {"name": "ready_o", "direction": "output", "width": 1, "default": "1'b0"},
            {"name": "y_bo", "direction": "output", "width": 9, "default": "9'd0"},
        ],
        states=[
            {"name": "IDLE", "is_initial": True, "action_domain": "seq", "actions": ["ready_o <= 1'b0;"]},
            {"name": "DONE", "is_initial": False, "action_domain": "seq", "actions": ["y_bo <= a_bi + b_bi;", "ready_o <= 1'b1;"]},
        ],
        transitions=[
            {"from_state": "IDLE", "to_state": "DONE", "condition": "start_i", "actions": []},
            {"from_state": "DONE", "to_state": "IDLE", "condition": "1", "actions": []},
        ],
    )

    response = generate(schema)

    assert "always @(posedge clk_i or posedge rst_i)" in response["verilog"]
    assert "y_bo <= a_bi + b_bi;" in response["verilog"]


def test_analyze_endpoint_returns_summary():
    response = analyze(build_schema())

    assert response["summary"]["states"] == 2
    assert response["structure"]["unreachable_states"] == []
    assert response["signals"]["unassigned_outputs"] == []


def test_graph_endpoint_returns_nodes_and_edges():
    response = get_graph(build_schema())

    assert response == {
        "nodes": [
            {"id": "IDLE", "label": "IDLE", "initial": True},
            {"id": "RUN", "label": "RUN", "initial": False},
        ],
        "edges": [
            {"source": "IDLE", "target": "RUN", "label": "go"},
            {"source": "IDLE", "target": "IDLE", "label": "1"},
            {"source": "RUN", "target": "IDLE", "label": "!go"},
            {"source": "RUN", "target": "RUN", "label": "1"},
        ],
    }


def test_invalid_fsm_is_rejected():
    payload = {
        "signals": [],
        "states": [{"name": "IDLE", "is_initial": False, "actions": []}],
        "transitions": [],
    }

    with pytest.raises(HTTPException) as exc_info:
        analyze(build_schema(payload))

    assert exc_info.value.status_code == 422


def test_domain_validation_errors_are_returned_as_422():
    payload = build_valid_payload()
    payload["states"][1]["is_initial"] = True

    with pytest.raises(HTTPException) as exc_info:
        generate(build_schema(payload))

    assert exc_info.value.status_code == 422
    assert "Начальное состояние уже задано." in exc_info.value.detail


def test_schema_forbids_unknown_fields():
    payload = build_valid_payload()
    payload["unexpected"] = True

    with pytest.raises(ValidationError):
        build_schema(payload)


@pytest.mark.anyio
async def test_cors_preflight_allows_browser_requests():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as async_client:
        response = await async_client.options(
            "/analyze",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"
    assert "POST" in response.headers["access-control-allow-methods"]


def test_cors_headers_are_present_on_post_requests():
    cors_middleware = next(
        middleware for middleware in app.user_middleware if middleware.cls.__name__ == "CORSMiddleware"
    )

    assert cors_middleware.kwargs["allow_origins"] == ["*"]
    assert cors_middleware.kwargs["allow_methods"] == ["*"]
    assert cors_middleware.kwargs["allow_headers"] == ["*"]


def test_import_verilog_endpoint_returns_fsm(monkeypatch):
    fsm = FSM()
    fsm.module_name = "imported_top"
    fsm.module_ports = ["clk", "reset", "go", "done"]
    fsm.state_signal_name = "state_q"
    fsm.next_state_signal_name = "state_d"
    fsm.clock_signal_name = "clk"
    fsm.reset_signal_name = "reset"
    fsm.preserved_items = ["assign sticky = done;"]
    fsm.imported_from_verilog = True
    fsm.safe_to_regenerate = False
    fsm.regeneration_warning = "Unsafe mixed control/datapath import."
    fsm.import_style = "single_process"
    fsm.import_has_mixed_datapath = True
    fsm.import_fsm_blocks = 1
    fsm.import_internal_action_targets = ["part_res", "ready"]
    fsm.add_signal("clk", "input")
    fsm.add_signal("reset", "input")
    fsm.add_signal("go", "input")
    fsm.add_signal("done", "output")
    fsm.add_state("IDLE", is_initial=True)
    fsm.add_state("RUN")
    fsm.add_transition("IDLE", "RUN", "go")
    fsm.add_transition("RUN", "IDLE", "!go")

    monkeypatch.setattr(
        "api.main.VerilogParser.extract_fsm_from_source",
        lambda source: fsm,
    )

    body = import_verilog(ImportVerilogRequest(source="module imported_top; endmodule"))
    schema = body["fsm"]
    assert schema.module_name == "imported_top"
    assert schema.module_ports == ["clk", "reset", "go", "done"]
    assert schema.state_signal_name == "state_q"
    assert schema.preserved_items == ["assign sticky = done;"]
    assert schema.imported_from_verilog is True
    assert schema.safe_to_regenerate is False
    assert schema.import_style == "single_process"
    assert schema.import_internal_action_targets == ["part_res", "ready"]


def test_generate_returns_original_source_for_untouched_import():
    schema = FSMSchema(
        **build_valid_payload(),
        module_name="imported_top",
        module_ports=["clk", "reset", "go", "done"],
        preserved_items=["assign sticky = done;"],
        state_signal_name="state_q",
        next_state_signal_name="state_d",
        clock_signal_name="clk",
        reset_signal_name="reset",
        original_source="module imported_top; endmodule",
        imported_from_verilog=True,
        safe_to_regenerate=False,
        regeneration_warning="Unsafe mixed control/datapath import.",
    )
    schema.import_fingerprint = _fingerprint_schema(schema)

    response = generate(schema)

    assert response["verilog"] == "module imported_top; endmodule"


def test_generate_rejects_unsafe_regeneration_for_modified_import():
    schema = FSMSchema(
        **build_valid_payload(),
        module_name="imported_top",
        imported_from_verilog=True,
        safe_to_regenerate=False,
        regeneration_warning="Unsafe mixed control/datapath import.",
        original_source="module imported_top; endmodule",
        import_fingerprint="old-fingerprint",
    )

    with pytest.raises(HTTPException) as exc_info:
        generate(schema)

    assert exc_info.value.status_code == 422
    assert "Unsafe mixed control/datapath import." in exc_info.value.detail


def test_simulate_endpoint_returns_simulation_output(monkeypatch):
    monkeypatch.setattr(
        "api.main.simulate_verilog",
        lambda source, testbench: {
            "success": True,
            "stdout": "PASS\n",
            "stderr": "",
        },
    )

    response = simulate(SimulateRequest(source="module top; endmodule", testbench="module tb; endmodule"))

    assert response == {
        "success": True,
        "stdout": "PASS\n",
        "stderr": "",
    }
