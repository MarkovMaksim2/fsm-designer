from core.fsm import FSM


class DotExporter:
    def __init__(self, fsm: FSM):
        self.fsm = fsm

    def export(self):
        lines = ["digraph FSM {"]

        for state in self.fsm.states.values():
            shape = "doublecircle" if state.is_initial else "circle"
            lines.append(f'{state.name} [shape={shape}];')

        for t in self.fsm.transitions:
            lines.append(
                f'{t.from_state} -> {t.to_state} [label="{t.condition}"];'
            )

        lines.append("}")
        return "\n".join(lines)