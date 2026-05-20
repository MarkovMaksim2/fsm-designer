from typing import Dict, List
from core.state import State
from core.transition import Transition
from core.signal import Signal


class FSM:
    def __init__(self):
        self.states: Dict[str, State] = {}
        self.transitions: List[Transition] = []
        self.signals: Dict[str, Signal] = {}

        self.initial_state: str | None = None
        self.reset_actions: List[str] = []
        self.module_name: str = "fsm_module"
        self.module_ports: List[str] = []
        self.preserved_items: List[str] = []
        self.generation_style: str = "auto"
        self.reset_mode: str = "async"
        self.state_signal_name: str = "state"
        self.next_state_signal_name: str = "next_state"
        self.clock_signal_name: str = "clk"
        self.reset_signal_name: str = "reset"
        self.original_source: str | None = None
        self.import_fingerprint: str | None = None
        self.imported_from_verilog: bool = False
        self.safe_to_regenerate: bool = True
        self.regeneration_warning: str | None = None
        self.import_style: str = "native"
        self.import_has_mixed_datapath: bool = False
        self.import_fsm_blocks: int = 0
        self.import_block_roles: List[str] = []
        self.import_internal_action_targets: List[str] = []
        self.external_modules: List[dict] = []
        self.module_instances: List[dict] = []

    # --- Signals ---

    def add_signal(self, name: str, direction: str, width: int = 1):
        if name in self.signals:
            raise ValueError(f"Сигнал {name} уже существует.")

        self.signals[name] = Signal(name, direction, width)

    # --- States ---

    def add_state(self, name: str, is_initial: bool = False, action_domain: str = "comb"):
        if name in self.states:
            raise ValueError(f"Состояние {name} уже существует.")

        self.states[name] = State(name, is_initial, action_domain=action_domain)

        if is_initial:
            if self.initial_state and self.initial_state != name:
                raise ValueError("Начальное состояние уже задано.")
            self.initial_state = name

    def set_initial_state(self, name: str):
        if name not in self.states:
            raise ValueError(f"Неизвестное состояние {name}.")
        if self.initial_state and self.initial_state in self.states:
            self.states[self.initial_state].is_initial = False
        self.initial_state = name
        self.states[name].is_initial = True

    def add_state_action(self, state: str, action: str):
        if state not in self.states:
            raise ValueError(f"Неизвестное состояние {state}.")
        self.states[state].add_action(action)

    def add_reset_action(self, action: str):
        action = action.strip()
        if not action:
            raise ValueError("Действие при сбросе не может быть пустым.")
        self.reset_actions.append(action)

    # --- Transitions ---

    def add_transition(self, from_state: str, to_state: str, condition: str = "1", action_domain: str = "comb"):
        if from_state not in self.states:
            raise ValueError(f"Неизвестное исходное состояние {from_state}.")
        if to_state not in self.states:
            raise ValueError(f"Неизвестное целевое состояние {to_state}.")
        t = Transition(from_state, to_state, condition, action_domain=action_domain)
        self.transitions.append(t)
        return t

    # --- Validation ---

    def validate(self):
        if not self.states:
            raise ValueError("FSM должна содержать хотя бы одно состояние.")
        if not self.initial_state:
            raise ValueError("Не задано начальное состояние.")
        if self.initial_state not in self.states:
            raise ValueError(f"Неизвестное начальное состояние {self.initial_state}.")

        initial_count = sum(1 for state in self.states.values() if state.is_initial)
        if initial_count != 1:
            raise ValueError("FSM должна содержать ровно одно начальное состояние.")

        if self.generation_style not in {"auto", "single_process", "two_process"}:
            raise ValueError("Неподдерживаемый стиль генерации FSM.")
        if self.reset_mode not in {"async", "sync", "none"}:
            raise ValueError("Режим сброса должен быть async, sync или none.")

        for t in self.transitions:
            if t.from_state not in self.states:
                raise ValueError(f"Неизвестное исходное состояние {t.from_state}.")
            if t.to_state not in self.states:
                raise ValueError(f"Неизвестное целевое состояние {t.to_state}.")

    def get_input_signals(self):
        return [signal for signal in self.signals.values() if signal.direction == "input"]

    def get_output_signals(self):
        return [
            signal
            for signal in self.signals.values()
            if signal.direction in {"output", "output_reg"}
        ]

    def get_output_reg_signals(self):
        return [signal for signal in self.signals.values() if signal.direction == "output_reg"]

    def get_wire_signals(self):
        return [signal for signal in self.signals.values() if signal.direction == "wire"]

    # --- Helpers ---

    def get_transitions_from(self, state):
        return [t for t in self.transitions if t.from_state == state]
