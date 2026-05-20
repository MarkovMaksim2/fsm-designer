from dataclasses import dataclass, field


@dataclass(slots=True)
class Transition:
    from_state: str
    to_state: str
    condition: str = "1"
    actions: list[str] = field(default_factory=list)
    action_domain: str = "comb"

    def __post_init__(self):
        if not self.from_state or not self.to_state:
            raise ValueError("У перехода должны быть заданы исходное и целевое состояния.")
        self.condition = (self.condition or "1").strip()
        if self.action_domain not in {"comb", "seq"}:
            raise ValueError("Домен действий перехода должен быть 'comb' или 'seq'.")

    def add_action(self, action: str):
        action = action.strip()
        if not action:
            raise ValueError("Действие перехода не может быть пустым.")
        self.actions.append(action)

    def __repr__(self):
        return f"{self.from_state} -> {self.to_state} [{self.condition}]"
