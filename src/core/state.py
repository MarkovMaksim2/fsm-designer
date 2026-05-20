from dataclasses import dataclass, field


@dataclass(slots=True)
class State:
    name: str
    is_initial: bool = False
    actions: list[str] = field(default_factory=list)
    action_domain: str = "comb"

    def __post_init__(self):
        if not self.name or not self.name.strip():
            raise ValueError("Имя состояния не может быть пустым.")
        if self.action_domain not in {"comb", "seq"}:
            raise ValueError("Домен действий состояния должен быть 'comb' или 'seq'.")

    def add_action(self, action: str):
        action = action.strip()
        if not action:
            raise ValueError("Действие состояния не может быть пустым.")
        self.actions.append(action)

    def __repr__(self):
        return f"State({self.name})"
