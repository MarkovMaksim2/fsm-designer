from core.fsm import FSM


class FSMAnalyzer:
    def __init__(self, fsm: FSM):
        self.fsm = fsm

    # =========================================================
    # PUBLIC
    # =========================================================

    def full_analysis(self):
        return {
            "unreachable_states": self.find_unreachable_states(),
            "dead_states": self.find_dead_states(),
            "missing_transitions": self.find_missing_transitions(),
            "warnings": self.collect_warnings(),
        }

    # =========================================================
    # ANALYSIS
    # =========================================================

    def find_unreachable_states(self):
        if not self.fsm.initial_state:
            return list(self.fsm.states)

        visited = set()

        def dfs(state):
            if state in visited:
                return
            visited.add(state)

            for t in self.fsm.get_transitions_from(state):
                dfs(t.to_state)

        dfs(self.fsm.initial_state)

        return [s for s in self.fsm.states if s not in visited]

    # ---------------------------------------------------------

    def find_dead_states(self):
        dead = []

        for state in self.fsm.states:
            transitions = self.fsm.get_transitions_from(state)

            if not transitions:
                dead.append(state)

        return dead

    # ---------------------------------------------------------

    def find_missing_transitions(self):
        issues = []

        for state in self.fsm.states:
            transitions = self.fsm.get_transitions_from(state)

            if len(transitions) == 0:
                issues.append(f"{state}: no transitions")

        return issues

    # ---------------------------------------------------------

    def collect_warnings(self):
        warnings = []

        if len(self.fsm.states) == 0:
            warnings.append("FSM has no states")

        if not self.fsm.initial_state:
            warnings.append("Не задано начальное состояние.")

        for state in self.fsm.states:
            if not self.fsm.get_transitions_from(state):
                warnings.append(f"State {state} has no outgoing transitions")

        return warnings
