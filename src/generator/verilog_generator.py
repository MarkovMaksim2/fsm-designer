import math
import re

from core.fsm import FSM


class VerilogGenerator:
    IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_$]*$")
    NONBLOCKING_ASSIGNMENT_RE = re.compile(r"^(\s*[A-Za-z_][A-Za-z0-9_$]*)\s*<=\s*")
    NUMERIC_LITERAL_RE = re.compile(r"^\s*(\d+'[bdhoBDHO][0-9a-fA-F_xXzZ]+|\d+)\s*$")

    def __init__(
        self,
        fsm: FSM,
        module_name=None,
        encoding="onehot",
        use_sv=False,
        safe_fsm=True,
        reset_type="async",
        reset_level="high",
    ):
        self.fsm = fsm
        self.module_name = module_name or fsm.module_name
        self.encoding = encoding
        self.use_sv = use_sv
        self.safe_fsm = safe_fsm
        self.reset_type = fsm.reset_mode if getattr(fsm, "reset_mode", None) else reset_type
        self.reset_level = reset_level

        self.fsm.validate()
        self._validate_options()
        self._normalize_imported_action_domains()

        self.states = list(fsm.states.keys())
        self.state_map, self.state_width = self._encode_states()
        self.assigned_targets = self._collect_assigned_targets()
        self.comb_assigned_targets = self._collect_assigned_targets("comb")
        self.seq_assigned_targets = self._collect_assigned_targets("seq")
        self._validate_action_domains()
        self.generation_style = self._resolve_generation_style()

    def _validate_options(self):
        if not self.IDENTIFIER_RE.match(self.module_name):
            raise ValueError(f"Некорректное имя модуля: {self.module_name}.")
        if self.encoding not in {"onehot", "binary"}:
            raise ValueError("Неподдерживаемый тип кодирования состояний.")
        if self.reset_type not in {"async", "sync"}:
            if self.reset_type != "none":
                raise ValueError("Параметр reset_type должен быть равен 'async', 'sync' или 'none'.")
        if self.reset_level not in {"high", "low"}:
            raise ValueError("Параметр reset_level должен быть равен 'high' или 'low'.")
        if getattr(self.fsm, "generation_style", "auto") not in {"auto", "single_process", "two_process"}:
            raise ValueError("Стиль генерации должен быть auto, single_process или two_process.")

    def _validate_action_domains(self):
        if self.comb_assigned_targets & self.seq_assigned_targets:
            overlapping = ", ".join(sorted(self.comb_assigned_targets & self.seq_assigned_targets))
            raise ValueError(
                "Один и тот же сигнал не может одновременно присваиваться из combinational и sequential действий: "
                f"{overlapping}."
            )

    def _normalize_imported_action_domains(self):
        use_seq = (
            self.fsm.import_style == "single_process"
            or (
                self.fsm.imported_from_verilog
                and bool(getattr(self.fsm, "import_internal_action_targets", []))
                and not getattr(self.fsm, "import_has_mixed_datapath", False)
            )
        )
        if not use_seq:
            return

        for state in self.fsm.states.values():
            if state.actions:
                state.action_domain = "seq"
        for transition in self.fsm.transitions:
            if transition.actions:
                transition.action_domain = "seq"

    def _resolve_generation_style(self):
        requested = getattr(self.fsm, "generation_style", "auto")
        if requested == "single_process":
            has_comb_actions = any(
                state.action_domain == "comb" and state.actions for state in self.fsm.states.values()
            ) or any(
                transition.action_domain == "comb" and transition.actions for transition in self.fsm.transitions
            )
            if has_comb_actions:
                raise ValueError(
                    "Стиль single_process нельзя использовать вместе с combinational действиями состояний или переходов."
                )
            return "single_process"
        if requested == "two_process":
            return "two_process"
        if self.fsm.import_style == "single_process":
            return "single_process"
        return "two_process"

    def _encode_states(self):
        if self.encoding == "onehot":
            width = max(1, len(self.states))
            mapping = {state: (1 << index) for index, state in enumerate(self.states)}
            return mapping, width

        width = max(1, math.ceil(math.log2(max(1, len(self.states)))))
        mapping = {state: index for index, state in enumerate(self.states)}
        return mapping, width

    def generate(self):
        parts = [
            self._header(),
            self._signal_declarations(),
            *([self._module_instances()] if self.fsm.module_instances else []),
            self._state_encoding(),
        ]

        if self.generation_style == "single_process":
            if self.reset_type == "none":
                parts.append(self._initial_block())
            parts.append(self._single_process_logic())
        else:
            parts.extend(
                [
                    self._state_register(),
                    self._next_state_logic(),
                    *([self._initial_block()] if self.reset_type == "none" else []),
                    *([self._sequential_action_logic()] if self._has_sequential_action_logic() else []),
                    *([self._output_logic()] if self._has_combinational_action_logic() else []),
                ]
            )

        parts.append("endmodule")
        return "\n\n".join(parts)

    def _header(self):
        ports = [
            *self.fsm.module_ports
        ]
        if not ports:
            ports = [
                signal.name
                for signal in self.fsm.signals.values()
                if signal.direction in {"input", "output", "output_reg"}
            ]
        if not ports:
            return f"module {self.module_name};"

        joined_ports = ",\n    ".join(ports)
        return f"module {self.module_name} (\n    {joined_ports}\n);"

    def _signal_declarations(self):
        lines = [
            self._signal_decl(signal)
            for signal in self.fsm.signals.values()
        ]

        for signal in self.fsm.get_wire_signals():
            if signal.expression:
                lines.append(f"assign {signal.name} = {signal.expression};")

        lines.extend(self._filtered_preserved_items())
        return "\n".join(lines)

    def _signal_decl(self, signal):
        width_str = f"[{signal.width - 1}:0] " if signal.width > 1 else ""
        if signal.direction == "input":
            return f"input {width_str}{signal.name};"
        if signal.direction == "output":
            if self._is_output_register_signal(signal):
                prefix = "output logic" if self.use_sv else "output reg"
                return f"{prefix} {width_str}{signal.name};"
            return f"output {width_str}{signal.name};"
        if signal.direction == "output_reg":
            prefix = "output logic" if self.use_sv else "output reg"
            return f"{prefix} {width_str}{signal.name};"
        if signal.direction == "reg":
            keyword = "logic" if self.use_sv else "reg"
            return f"{keyword} {width_str}{signal.name};"
        return f"wire {width_str}{signal.name};"

    def _filtered_preserved_items(self):
        state_names = set(self.fsm.states.keys())
        filtered = []

        for item in self.fsm.preserved_items:
            stripped = item.strip()
            if any(
                stripped.startswith(keyword) and f" {state_name} " in f" {stripped} "
                for keyword in ("localparam", "parameter")
                for state_name in state_names
            ):
                continue
            filtered.append(item)

        return filtered

    def _state_encoding(self):
        state_keyword = "logic" if self.use_sv else "reg"
        if self.generation_style == "single_process":
            lines = [f"{state_keyword} [{self.state_width - 1}:0] {self.fsm.state_signal_name};"]
        else:
            lines = [
                f"{state_keyword} [{self.state_width - 1}:0] "
                f"{self.fsm.state_signal_name}, {self.fsm.next_state_signal_name};"
            ]

        for state_name, value in self.state_map.items():
            if self.encoding == "onehot":
                encoded = f"{self.state_width}'b{value:0{self.state_width}b}"
            else:
                encoded = f"{self.state_width}'d{value}"
            lines.append(f"localparam {state_name} = {encoded};")

        return "\n".join(lines)

    def _collect_assigned_targets(self, domain=None):
        targets = set()

        def collect_from_action(action):
            for raw_line in action.splitlines():
                line = raw_line.strip()
                if not line or line.startswith("if ") or line.startswith("else") or line in {"begin", "end"}:
                    continue
                match = re.match(r"^([A-Za-z_][A-Za-z0-9_$]*)\s*(<=|=)", line)
                if match:
                    targets.add(match.group(1))

        if domain in {None, "seq"}:
            for action in self.fsm.reset_actions:
                collect_from_action(action)

        for state in self.fsm.states.values():
            if domain is not None and state.action_domain != domain:
                continue
            for action in state.actions:
                collect_from_action(action)

        for transition in self.fsm.transitions:
            if domain is not None and transition.action_domain != domain:
                continue
            for action in transition.actions:
                collect_from_action(action)

        return targets

    def _is_output_register_signal(self, signal):
        return signal.direction == "output_reg" or (
            signal.direction == "output" and (
                signal.name in self.assigned_targets or signal.default is not None
            )
        )

    def _is_combinational_output_signal(self, signal):
        return signal.direction in {"output", "output_reg"} and (
            signal.name in self.comb_assigned_targets or (
                signal.default is not None and signal.name not in self.seq_assigned_targets
            )
        )

    def _has_combinational_action_logic(self):
        if any(self._is_combinational_output_signal(signal) for signal in self.fsm.get_output_signals()):
            return True
        if any(state.action_domain == "comb" and state.actions for state in self.fsm.states.values()):
            return True
        return any(transition.action_domain == "comb" and transition.actions for transition in self.fsm.transitions)

    def _has_sequential_action_logic(self):
        if self.fsm.reset_actions:
            return True
        if any(state.action_domain == "seq" and state.actions for state in self.fsm.states.values()):
            return True
        return any(transition.action_domain == "seq" and transition.actions for transition in self.fsm.transitions)

    def _module_instances(self):
        modules = {
            module.get("name"): module
            for module in self.fsm.external_modules
            if module.get("name")
        }
        signal_names = set(self.fsm.signals.keys())
        lines = []

        for instance in self.fsm.module_instances:
            module_name = instance.get("module_name", "").strip()
            instance_name = instance.get("name", "").strip()
            connections = instance.get("connections", {})

            if module_name not in modules:
                raise ValueError(f"Неизвестный внешний модуль {module_name}.")
            if not self.IDENTIFIER_RE.match(instance_name):
                raise ValueError(f"Некорректное имя экземпляра модуля: {instance_name}.")

            module_ports = {
                port.get("name"): port
                for port in modules[module_name].get("ports", [])
                if port.get("name")
            }

            rendered_connections = []
            for port in modules[module_name].get("ports", []):
                port_name = port.get("name")
                if not port_name:
                    continue
                connection = connections.get(port_name)
                if not connection or not str(connection).strip():
                    raise ValueError(
                        f"Для порта {port_name} экземпляра {instance_name} не задано подключение."
                    )
                connection = str(connection).strip()
                if (
                    connection not in signal_names
                    and not self.NUMERIC_LITERAL_RE.match(connection)
                ):
                    raise ValueError(
                        f"Подключение {connection} для порта {port_name} экземпляра {instance_name} не является известным сигналом или числовой константой."
                    )
                port_direction = module_ports[port_name].get("direction")
                if port_direction in {"output", "output_reg"} and self.NUMERIC_LITERAL_RE.match(connection):
                    raise ValueError(
                        f"Константу нельзя подключать к выходному порту {port_name} экземпляра {instance_name}."
                    )
                local_signal = self.fsm.signals.get(connection)
                if (
                    local_signal
                    and port_direction in {"output", "output_reg"}
                    and local_signal.direction not in {"wire", "output"}
                ):
                    raise ValueError(
                        f"Выходной порт {port_name} экземпляра {instance_name} можно подключать только к wire или обычному output текущего модуля."
                    )
                rendered_connections.append(f"    .{port_name}({connection})")

            for port_name in connections:
                if port_name not in module_ports:
                    raise ValueError(
                        f"У внешнего модуля {module_name} нет порта {port_name}."
                    )

            if not rendered_connections:
                lines.append(f"{module_name} {instance_name} ();")
                continue

            lines.append(
                f"{module_name} {instance_name} (\n"
                + ",\n".join(rendered_connections)
                + "\n);"
            )

        return "\n\n".join(lines)

    def _state_register(self):
        reset_cond = self.fsm.reset_signal_name if self.reset_level == "high" else f"!{self.fsm.reset_signal_name}"
        edge = "posedge" if self.reset_level == "high" else "negedge"
        sens = f"posedge {self.fsm.clock_signal_name}"
        always_keyword = "always_ff" if self.use_sv else "always"

        if self.reset_type == "async":
            sens += f" or {edge} {self.fsm.reset_signal_name}"

        if self.reset_type == "none":
            return (
                f"{always_keyword} @({sens}) begin\n"
                f"    {self.fsm.state_signal_name} <= {self.fsm.next_state_signal_name};\n"
                f"end"
            )

        return (
            f"{always_keyword} @({sens}) begin\n"
            f"    if ({reset_cond})\n"
            f"        {self.fsm.state_signal_name} <= {self.fsm.initial_state};\n"
            f"    else\n"
            f"        {self.fsm.state_signal_name} <= {self.fsm.next_state_signal_name};\n"
            f"end"
        )

    def _next_state_logic(self):
        case_keyword = "unique case" if self.use_sv else "case"
        lines = [
            "always_comb begin" if self.use_sv else "always @(*) begin",
            f"    {self.fsm.next_state_signal_name} = {self.fsm.state_signal_name};",
            f"    {case_keyword} ({self.fsm.state_signal_name})",
        ]

        for state in self.states:
            transitions = self.fsm.get_transitions_from(state)
            lines.append(f"        {state}: begin")
            if transitions:
                lines.extend(self._render_next_state_chain(transitions, "            "))
            else:
                lines.append(
                    f"            {self.fsm.next_state_signal_name} = {self.fsm.state_signal_name};"
                )
            lines.append("        end")

        if self.safe_fsm:
            lines.append("        default: begin")
            lines.append(f"            {self.fsm.next_state_signal_name} = {self.fsm.initial_state};")
            lines.append("        end")

        lines.append("    endcase")
        lines.append("end")
        return "\n".join(lines)

    def _render_next_state_chain(self, transitions, indent):
        lines = []
        for index, transition in enumerate(transitions):
            keyword = "if" if index == 0 else "else if"
            if transition.condition == "1":
                keyword = "if" if index == 0 else "else"
                if keyword == "else":
                    lines.append(f"{indent}else begin")
                else:
                    lines.append(f"{indent}if (1'b1) begin")
            else:
                lines.append(f"{indent}{keyword} ({transition.condition}) begin")

            lines.append(f"{indent}    {self.fsm.next_state_signal_name} = {transition.to_state};")
            lines.append(f"{indent}end")
        return lines

    def _output_logic(self):
        lines = ["always_comb begin" if self.use_sv else "always @(*) begin"]

        for signal in self.fsm.get_output_signals():
            if not self._is_combinational_output_signal(signal):
                continue
            default_value = signal.default if signal.default is not None else self._zero_literal(signal.width)
            lines.append(f"    {signal.name} = {default_value};")

        lines.append(f"    case ({self.fsm.state_signal_name})")

        for state in self.fsm.states.values():
            lines.append(f"        {state.name}: begin")
            for action in state.actions:
                if state.action_domain != "comb":
                    continue
                lines.extend(self._render_comb_action(action, "            "))
            transition_actions = [
                t for t in self.fsm.get_transitions_from(state.name) if t.actions and t.action_domain == "comb"
            ]
            if transition_actions:
                lines.extend(self._render_action_chain(transition_actions, "            "))
            lines.append("        end")

        if self.safe_fsm:
            lines.append("        default: begin")
            lines.append("        end")

        lines.append("    endcase")
        lines.append("end")
        return "\n".join(lines)

    def _sequential_action_logic(self):
        reset_cond = self.fsm.reset_signal_name if self.reset_level == "high" else f"!{self.fsm.reset_signal_name}"
        edge = "posedge" if self.reset_level == "high" else "negedge"
        sens = f"posedge {self.fsm.clock_signal_name}"
        always_keyword = "always_ff" if self.use_sv else "always"

        if self.reset_type == "async":
            sens += f" or {edge} {self.fsm.reset_signal_name}"

        lines = [f"{always_keyword} @({sens}) begin"]
        if self.reset_type != "none":
            lines.append(f"    if ({reset_cond}) begin")
            for action in self.fsm.reset_actions:
                lines.append(f"        {action}")
            lines.append("    end else begin")
            indent = "        "
        else:
            indent = "    "

        lines.append(f"{indent}case ({self.fsm.state_signal_name})")

        for state in self.fsm.states.values():
            lines.append(f"{indent}    {state.name}: begin")
            for action in state.actions:
                if state.action_domain != "seq":
                    continue
                lines.extend(self._render_raw_action(action, f"{indent}        "))
            transition_actions = [t for t in self.fsm.get_transitions_from(state.name) if t.actions and t.action_domain == "seq"]
            if transition_actions:
                lines.extend(self._render_sequential_action_chain(transition_actions, f"{indent}        "))
            lines.append(f"{indent}    end")

        if self.safe_fsm:
            lines.append(f"{indent}    default: begin")
            lines.append(f"{indent}    end")

        lines.append(f"{indent}endcase")
        if self.reset_type != "none":
            lines.append("    end")
        lines.append("end")
        return "\n".join(lines)

    def _render_action_chain(self, transitions, indent):
        lines = []
        for index, transition in enumerate(transitions):
            keyword = "if" if index == 0 else "else if"
            if transition.condition == "1":
                keyword = "if" if index == 0 else "else"
                if keyword == "else":
                    lines.append(f"{indent}else begin")
                else:
                    lines.append(f"{indent}if (1'b1) begin")
            else:
                lines.append(f"{indent}{keyword} ({transition.condition}) begin")

            for action in transition.actions:
                lines.extend(self._render_comb_action(action, f"{indent}    "))
            lines.append(f"{indent}end")
        return lines

    def _render_comb_action(self, action: str, indent: str):
        rendered_lines = []
        for raw_line in action.splitlines():
            if self.NONBLOCKING_ASSIGNMENT_RE.match(raw_line):
                raise ValueError(
                    "Неблокирующее присваивание `<=` нельзя размещать в combinational-действии. "
                    "Переведи действие в sequential domain или используй `=`."
                )
            rendered_lines.append(f"{indent}{raw_line}")
        return rendered_lines

    def _zero_literal(self, width: int):
        if self.use_sv:
            return "'0"
        return f"{max(1, width)}'d0"

    def _single_process_logic(self):
        reset_cond = self.fsm.reset_signal_name if self.reset_level == "high" else f"!{self.fsm.reset_signal_name}"
        edge = "posedge" if self.reset_level == "high" else "negedge"
        sens = f"posedge {self.fsm.clock_signal_name}"
        always_keyword = "always_ff" if self.use_sv else "always"

        if self.reset_type == "async":
            sens += f" or {edge} {self.fsm.reset_signal_name}"

        lines = [f"{always_keyword} @({sens}) begin"]
        if self.reset_type == "none":
            indent = "    "
        else:
            lines.append(f"    if ({reset_cond}) begin")
            for action in self.fsm.reset_actions:
                lines.append(f"        {action}")
            lines.append(f"        {self.fsm.state_signal_name} <= {self.fsm.initial_state};")
            lines.append("    end else begin")
            indent = "        "
        lines.append(f"{indent}case ({self.fsm.state_signal_name})")

        for state in self.fsm.states.values():
            lines.append(f"{indent}    {state.name}: begin")
            for action in state.actions:
                lines.append(f"{indent}        {action}")

            transitions = self.fsm.get_transitions_from(state.name)
            if transitions:
                lines.extend(self._render_single_process_transition_chain(transitions, f"{indent}        "))
            lines.append(f"{indent}    end")

        if self.safe_fsm:
            lines.append(f"{indent}    default: begin")
            lines.append(f"{indent}        {self.fsm.state_signal_name} <= {self.fsm.initial_state};")
            lines.append(f"{indent}    end")

        lines.append(f"{indent}endcase")
        if self.reset_type != "none":
            lines.append("    end")
        lines.append("end")
        return "\n".join(lines)

    def _initial_block(self):
        lines = ["initial begin"]
        lines.append(f"    {self.fsm.state_signal_name} = {self.fsm.initial_state};")
        for action in self.fsm.reset_actions:
            assignment = self.NONBLOCKING_ASSIGNMENT_RE.sub(r"\1 = ", action)
            lines.append(f"    {assignment}")
        lines.append("end")
        return "\n".join(lines)

    def _render_single_process_transition_chain(self, transitions, indent):
        lines = []
        for index, transition in enumerate(transitions):
            if transition.condition == "1":
                keyword = "if" if index == 0 else "else"
                if keyword == "else":
                    lines.append(f"{indent}else begin")
                else:
                    lines.append(f"{indent}if (1'b1) begin")
            else:
                keyword = "if" if index == 0 else "else if"
                lines.append(f"{indent}{keyword} ({transition.condition}) begin")

            lines.append(f"{indent}    {self.fsm.state_signal_name} <= {transition.to_state};")
            for action in transition.actions:
                lines.append(f"{indent}    {action}")
            lines.append(f"{indent}end")
        return lines

    def _render_sequential_action_chain(self, transitions, indent):
        lines = []
        for index, transition in enumerate(transitions):
            if transition.condition == "1":
                keyword = "if" if index == 0 else "else"
                if keyword == "else":
                    lines.append(f"{indent}else begin")
                else:
                    lines.append(f"{indent}if (1'b1) begin")
            else:
                keyword = "if" if index == 0 else "else if"
                lines.append(f"{indent}{keyword} ({transition.condition}) begin")

            for action in transition.actions:
                lines.extend(self._render_raw_action(action, f"{indent}    "))
            lines.append(f"{indent}end")
        return lines

    def _render_raw_action(self, action: str, indent: str):
        return [f"{indent}{line}" for line in action.splitlines()]
