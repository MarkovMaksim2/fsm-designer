from core.fsm import FSM
from api.schemas import FSMSchema


def _infer_named_input(signals, preferred_tokens, fallback_names):
    input_names = [
        signal.name
        for signal in signals
        if signal.direction == "input"
    ]
    lowered = {name.lower(): name for name in input_names}

    for fallback in fallback_names:
        if fallback in input_names:
            return fallback

    for token in preferred_tokens:
        for lowered_name, original_name in lowered.items():
            if token in lowered_name:
                return original_name

    return None


def build_fsm(schema: FSMSchema) -> FSM:
    fsm = FSM()
    fsm.module_name = schema.module_name
    fsm.module_ports = list(schema.module_ports)
    fsm.preserved_items = list(schema.preserved_items)
    fsm.generation_style = schema.generation_style
    fsm.reset_mode = schema.reset_mode
    fsm.state_signal_name = schema.state_signal_name
    fsm.next_state_signal_name = schema.next_state_signal_name
    fsm.clock_signal_name = schema.clock_signal_name
    fsm.reset_signal_name = schema.reset_signal_name
    fsm.original_source = schema.original_source
    fsm.import_fingerprint = schema.import_fingerprint
    fsm.imported_from_verilog = schema.imported_from_verilog
    fsm.safe_to_regenerate = schema.safe_to_regenerate
    fsm.regeneration_warning = schema.regeneration_warning
    fsm.import_style = schema.import_style
    fsm.import_has_mixed_datapath = schema.import_has_mixed_datapath
    fsm.import_fsm_blocks = schema.import_fsm_blocks
    fsm.import_block_roles = list(schema.import_block_roles)
    fsm.import_internal_action_targets = list(schema.import_internal_action_targets)
    fsm.external_modules = [module.model_dump() for module in schema.external_modules]
    fsm.module_instances = [instance.model_dump() for instance in schema.module_instances]

    # signals
    for s in schema.signals:
        fsm.add_signal(s.name, s.direction, s.width)
        if s.default:
            fsm.signals[s.name].set_default(s.default)
        if s.expression:
            fsm.signals[s.name].set_expression(s.expression)

    if fsm.clock_signal_name not in fsm.signals:
        inferred_clock = _infer_named_input(
            schema.signals,
            preferred_tokens=("clk", "clock"),
            fallback_names=("clk", "clock"),
        )
        if inferred_clock:
            fsm.clock_signal_name = inferred_clock

    if fsm.reset_signal_name not in fsm.signals:
        inferred_reset = _infer_named_input(
            schema.signals,
            preferred_tokens=("rst", "reset"),
            fallback_names=("rst", "reset"),
        )
        if inferred_reset:
            fsm.reset_signal_name = inferred_reset

    # states
    for st in schema.states:
        fsm.add_state(st.name, st.is_initial, st.action_domain)
        for act in st.actions:
            fsm.add_state_action(st.name, act)

    for action in schema.reset_actions:
        fsm.add_reset_action(action)

    # transitions
    for t in schema.transitions:
        tr = fsm.add_transition(t.from_state, t.to_state, t.condition, t.action_domain)
        for act in t.actions:
            tr.add_action(act)

    fsm.validate()
    return fsm
