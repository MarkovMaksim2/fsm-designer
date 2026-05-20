from dataclasses import dataclass


@dataclass(slots=True)
class Signal:
    name: str
    direction: str
    width: int = 1
    default: str | None = None
    expression: str | None = None

    ALLOWED_DIRECTIONS = {"input", "output", "output_reg", "reg", "wire"}

    def __post_init__(self):
        if not self.name or not self.name.strip():
            raise ValueError("Имя сигнала не может быть пустым.")
        if self.direction not in self.ALLOWED_DIRECTIONS:
            raise ValueError(f"Неизвестный тип сигнала: {self.direction}.")
        if self.width < 1:
            raise ValueError("Разрядность сигнала должна быть больше нуля.")
        if self.direction == "wire" and self.default is not None:
            raise ValueError("Для wire нельзя задавать значение по умолчанию.")

    def verilog_decl(self, system_verilog: bool = True):
        width_str = f"[{self.width - 1}:0] " if self.width > 1 else ""

        if self.direction == "input":
            return f"input {width_str}{self.name};"
        if self.direction == "output":
            return f"output {width_str}{self.name};"
        if self.direction == "output_reg":
            prefix = "output logic" if system_verilog else "output reg"
            return f"{prefix} {width_str}{self.name};"
        if self.direction == "reg":
            keyword = "logic" if system_verilog else "reg"
            return f"{keyword} {width_str}{self.name};"
        return f"wire {width_str}{self.name};"

    def set_default(self, value: str):
        if self.direction not in {"output", "output_reg"}:
            raise ValueError("Значения по умолчанию поддерживаются только для выходных сигналов.")
        value = value.strip()
        if not value:
            raise ValueError("Значение сигнала по умолчанию не может быть пустым.")
        self.default = value

    def set_expression(self, value: str):
        if self.direction != "wire":
            raise ValueError("Выражения поддерживаются только для сигналов типа wire.")
        value = value.strip()
        if not value:
            raise ValueError("Выражение сигнала не может быть пустым.")
        self.expression = value
