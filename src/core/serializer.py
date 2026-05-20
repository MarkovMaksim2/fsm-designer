import json
from core.fsm import FSM


def fsm_to_json(fsm: FSM) -> str:
    data = {
        "signals": [
            {
                "name": signal.name,
                "direction": signal.direction,
                "width": signal.width,
                "default": signal.default,
                "expression": signal.expression,
            }
            for signal in fsm.signals.values()
        ],
        "reset_actions": fsm.reset_actions,
        "module_name": fsm.module_name,
        "module_ports": fsm.module_ports,
        "preserved_items": fsm.preserved_items,
        "generation_style": fsm.generation_style,
        "reset_mode": fsm.reset_mode,
        "state_signal_name": fsm.state_signal_name,
        "next_state_signal_name": fsm.next_state_signal_name,
        "clock_signal_name": fsm.clock_signal_name,
        "reset_signal_name": fsm.reset_signal_name,
        "original_source": fsm.original_source,
        "import_fingerprint": fsm.import_fingerprint,
        "imported_from_verilog": fsm.imported_from_verilog,
        "safe_to_regenerate": fsm.safe_to_regenerate,
        "regeneration_warning": fsm.regeneration_warning,
        "import_style": fsm.import_style,
        "import_has_mixed_datapath": fsm.import_has_mixed_datapath,
        "import_fsm_blocks": fsm.import_fsm_blocks,
        "import_block_roles": fsm.import_block_roles,
        "import_internal_action_targets": fsm.import_internal_action_targets,
        "external_modules": fsm.external_modules,
        "module_instances": fsm.module_instances,
        "states": [
            {
                "name": state.name,
                "is_initial": state.is_initial,
                "actions": state.actions,
                "action_domain": state.action_domain,
            }
            for state in fsm.states.values()
        ],
        "initial_state": fsm.initial_state,
        "transitions": [
            {
                "from_state": t.from_state,
                "to_state": t.to_state,
                "condition": t.condition,
                "actions": t.actions,
                "action_domain": t.action_domain,
            }
            for t in fsm.transitions
        ],
    }
    return json.dumps(data, indent=2)


def fsm_from_json(json_str: str) -> FSM:
    data = json.loads(json_str)

    fsm = FSM()
    fsm.module_name = data.get("module_name", "fsm_module")
    fsm.module_ports = list(data.get("module_ports", []))
    fsm.preserved_items = list(data.get("preserved_items", []))
    fsm.generation_style = data.get("generation_style", "auto")
    fsm.reset_mode = data.get("reset_mode", "async")
    fsm.state_signal_name = data.get("state_signal_name", "state")
    fsm.next_state_signal_name = data.get("next_state_signal_name", "next_state")
    fsm.clock_signal_name = data.get("clock_signal_name", "clk")
    fsm.reset_signal_name = data.get("reset_signal_name", "reset")
    fsm.original_source = data.get("original_source")
    fsm.import_fingerprint = data.get("import_fingerprint")
    fsm.imported_from_verilog = data.get("imported_from_verilog", False)
    fsm.safe_to_regenerate = data.get("safe_to_regenerate", True)
    fsm.regeneration_warning = data.get("regeneration_warning")
    fsm.import_style = data.get("import_style", "native")
    fsm.import_has_mixed_datapath = data.get("import_has_mixed_datapath", False)
    fsm.import_fsm_blocks = data.get("import_fsm_blocks", 0)
    fsm.import_block_roles = list(data.get("import_block_roles", []))
    fsm.import_internal_action_targets = list(data.get("import_internal_action_targets", []))
    fsm.external_modules = list(data.get("external_modules", []))
    fsm.module_instances = list(data.get("module_instances", []))

    for signal in data.get("signals", []):
        fsm.add_signal(signal["name"], signal["direction"], signal.get("width", 1))
        if signal.get("default") is not None:
            fsm.signals[signal["name"]].set_default(signal["default"])
        if signal.get("expression") is not None:
            fsm.signals[signal["name"]].set_expression(signal["expression"])

    for state in data["states"]:
        if isinstance(state, str):
            fsm.add_state(state, is_initial=(state == data["initial_state"]))
            continue

        fsm.add_state(
            state["name"],
            is_initial=state.get("is_initial", False),
            action_domain=state.get("action_domain", "comb"),
        )
        for action in state.get("actions", []):
            fsm.add_state_action(state["name"], action)

    for action in data.get("reset_actions", []):
        fsm.add_reset_action(action)

    if data.get("initial_state") and data["initial_state"] != fsm.initial_state:
        fsm.set_initial_state(data["initial_state"])

    for t in data["transitions"]:
        transition = fsm.add_transition(
            t["from_state"],
            t["to_state"],
            t.get("condition", "1"),
            action_domain=t.get("action_domain", "comb"),
        )
        for action in t.get("actions", []):
            transition.add_action(action)

    fsm.validate()
    return fsm
