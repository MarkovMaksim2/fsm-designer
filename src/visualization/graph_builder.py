from core.fsm import FSM


class GraphBuilder:
    def __init__(self, fsm: FSM):
        self.fsm = fsm

    def to_json(self):
        nodes = []
        edges = []

        for state_name, state in self.fsm.states.items():
            nodes.append({
                "id": state_name,
                "label": state_name,
                "initial": state.is_initial
            })

        for t in self.fsm.transitions:
            edges.append({
                "source": t.from_state,
                "target": t.to_state,
                "label": t.condition
            })

        return {
            "nodes": nodes,
            "edges": edges
        }