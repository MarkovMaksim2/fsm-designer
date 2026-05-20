from itertools import product
import re


class BooleanExpression:
    IDENTIFIER_RE = re.compile(r"\b[A-Za-z_][A-Za-z0-9_]*\b")
    KEYWORDS = {"and", "or", "not", "if", "else", "true", "false"}
    TRUE_LITERALS = {"1", "1'b1", "1'd1", "1'h1", "true"}
    FALSE_LITERALS = {"0", "1'b0", "1'd0", "1'h0", "false"}
    TOKEN_RE = re.compile(
        r"""
        \s*(
            \|\| | && | == | != | >= | <= | << | >> | ~& | ~\| | \^~ | ~\^ |
            [()!~&|^<>+\-*/%\[\]:] |
            \d+'[bdhBDH][0-9a-fA-F_xXzZ]+ |
            true | false |
            \d+ |
            [A-Za-z_][A-Za-z0-9_]*
        )
        """,
        re.VERBOSE,
    )
    MAX_ENUM_VARS = 8
    MAX_TOTAL_BITS = 12
    MAX_ENUM_SPACE = 4096

    def __init__(self, expr: str, variable_widths: dict[str, int] | None = None):
        self.expr = (expr or "1").strip()
        self.variable_widths = {
            name: max(int(width), 1) for name, width in (variable_widths or {}).items()
        }
        self._ast = None
        self._parse_error = None
        self._ast_variables = None
        self._support_details = None

    def variables(self):
        if self._ast_variables is not None:
            return set(self._ast_variables)
        self._ensure_parsed()
        if self._ast_variables is not None:
            return set(self._ast_variables)

        variables = set(self.IDENTIFIER_RE.findall(self.expr))
        return {
            variable
            for variable in variables
            if variable.lower() not in self.KEYWORDS and not variable.isdigit()
        }

    def is_unconditional(self):
        supported, truth_table = self.truth_table()
        return supported and all(row[1] for row in truth_table)

    def is_unsatisfiable(self):
        supported, truth_table = self.truth_table()
        return supported and not any(row[1] for row in truth_table)

    def formal_constraints(self):
        supported, truth_table = self.truth_table()
        if not supported:
            return False, False, {}

        satisfiable = any(result for _, result in truth_table)
        constraints = self._extract_constant_constraints(truth_table)
        return True, satisfiable, constraints

    def overlaps_with(self, other: "BooleanExpression"):
        supported, rows = self._combined_truth_table([other])
        if not supported:
            return False, False
        return True, any(left and right for _, left, right in rows)

    def is_exact_complement_of(self, other: "BooleanExpression"):
        supported, rows = self._combined_truth_table([other])
        if not supported:
            return False
        return all(left != right for _, left, right in rows)

    def formal_summary(self):
        supported, truth_table = self.truth_table()
        variable_names = sorted(self.variables())
        total_bits = sum(self.variable_widths.get(name, 1) for name in variable_names)
        support_details = self.support_details()

        if not supported:
            return {
                "supported": False,
                "satisfiable": False,
                "constraints": {},
                "method": "не поддерживается",
                "reason": support_details["reason"],
                "reason_code": support_details["reason_code"],
                "variables": variable_names,
                "variable_count": len(variable_names),
                "total_bits": total_bits,
                "max_variables": self.MAX_ENUM_VARS,
                "max_total_bits": self.MAX_TOTAL_BITS,
            }

        satisfiable = any(result for _, result in truth_table)
        return {
            "supported": True,
            "satisfiable": satisfiable,
            "constraints": self._extract_constant_constraints(truth_table),
            "method": "полный перебор допустимого домена",
            "reason": None,
            "reason_code": None,
            "variables": variable_names,
            "variable_count": len(variable_names),
            "total_bits": total_bits,
            "max_variables": self.MAX_ENUM_VARS,
            "max_total_bits": self.MAX_TOTAL_BITS,
        }

    def support_details(self):
        if self._support_details is not None:
            return self._support_details

        self._ensure_parsed()
        variable_names = sorted(self.variables())
        total_bits = sum(self.variable_widths.get(name, 1) for name in variable_names)

        if self._parse_error or self._ast is None:
            self._support_details = {
                "supported": False,
                "reason_code": "parse_error",
                "reason": self._parse_error or "Выражение не удалось разобрать формальным модулем анализа условий.",
                "variables": variable_names,
                "variable_count": len(variable_names),
                "total_bits": total_bits,
            }
            return self._support_details

        supported, _, _, reason = self._domains()
        if not supported:
            self._support_details = {
                "supported": False,
                "reason_code": reason["code"],
                "reason": reason["message"],
                "variables": variable_names,
                "variable_count": len(variable_names),
                "total_bits": total_bits,
            }
            return self._support_details

        self._support_details = {
            "supported": True,
            "reason_code": None,
            "reason": None,
            "variables": variable_names,
            "variable_count": len(variable_names),
            "total_bits": total_bits,
        }
        return self._support_details

    def truth_table(self):
        self._ensure_parsed()
        if self._parse_error or self._ast is None:
            return False, []

        supported, variable_names, domains, _ = self._domains()
        if not supported:
            return False, []

        rows = []
        for values in product(*domains):
            assignment = dict(zip(variable_names, values, strict=True))
            rows.append((assignment, self._as_bool(self._eval(self._ast, assignment))))
        return True, rows

    def __repr__(self):
        return self.expr

    @classmethod
    def covers_all(cls, expressions: list["BooleanExpression"]):
        supported, rows = cls._combined_truth_table_static(expressions)
        if not supported:
            return False, False
        return True, all(any(result for result in outcomes) for _, *outcomes in rows)

    def _combined_truth_table(self, others: list["BooleanExpression"]):
        return self._combined_truth_table_static([self, *others])

    @classmethod
    def _combined_truth_table_static(cls, expressions: list["BooleanExpression"]):
        if not expressions:
            return True, []

        for expression in expressions:
            expression._ensure_parsed()
            if expression._parse_error or expression._ast is None:
                return False, []

        variable_names = sorted(
            {variable for expression in expressions for variable in expression._ast_variables}
        )
        width_map = {}
        for variable in variable_names:
            width_map[variable] = max(
                expression.variable_widths.get(variable, 1) for expression in expressions
            )

        supported, domains, _ = cls._domains_for_variables(variable_names, width_map)
        if not supported:
            return False, []

        rows = []
        for values in product(*domains):
            assignment = dict(zip(variable_names, values, strict=True))
            rows.append(
                (
                    assignment,
                    *[expression._as_bool(expression._eval(expression._ast, assignment)) for expression in expressions],
                )
            )
        return True, rows

    def _domains(self):
        variable_names = sorted(self._ast_variables)
        supported, domains, reason = self._domains_for_variables(variable_names, self.variable_widths)
        return supported, variable_names, domains, reason

    @classmethod
    def _domains_for_variables(cls, variable_names, width_map):
        if len(variable_names) > cls.MAX_ENUM_VARS:
            return False, [], {
                "code": "too_many_variables",
                "message": (
                    f"Формальный анализ поддерживает не более {cls.MAX_ENUM_VARS} независимых переменных, "
                    f"но получено {len(variable_names)}."
                ),
            }

        total_bits = sum(max(int(width_map.get(name, 1)), 1) for name in variable_names)
        if total_bits > cls.MAX_TOTAL_BITS:
            return False, [], {
                "code": "domain_too_wide",
                "message": (
                    f"Формальный анализ поддерживает не более {cls.MAX_TOTAL_BITS} суммарных битов "
                    f"в исследуемом домене, но получено {total_bits}."
                ),
            }

        domains = []
        space = 1
        for name in variable_names:
            width = max(int(width_map.get(name, 1)), 1)
            size = 1 << width
            space *= size
            if space > cls.MAX_ENUM_SPACE:
                return False, [], {
                    "code": "domain_too_large",
                    "message": (
                        f"Формальный анализ поддерживает не более {cls.MAX_ENUM_SPACE} комбинаций "
                        f"при полном переборе, но текущее условие требует {space}."
                    ),
                }
            domains.append(range(size))
        return True, domains, None

    def _extract_constant_constraints(self, truth_table):
        variables = sorted(self.variables())
        satisfying_assignments = [
            assignment for assignment, result in truth_table if result
        ]
        if not satisfying_assignments:
            return {}

        constraints = {}
        for variable in variables:
            values = {assignment[variable] for assignment in satisfying_assignments}
            if len(values) == 1:
                constraints[variable] = values.pop()
        return constraints

    def _ensure_parsed(self):
        if self._ast is not None or self._parse_error is not None:
            return

        try:
            tokens = self._tokenize(self.expr)
            parser = _BooleanParser(tokens)
            self._ast = parser.parse()
            self._ast_variables = parser.variables
        except ValueError as exc:
            self._parse_error = str(exc)

    def _eval(self, node, assignment):
        kind = node[0]
        if kind == "lit":
            return node[1]
        if kind == "var":
            return assignment.get(node[1], 0)
        if kind == "index":
            base_value = self._eval(node[1], assignment)
            index_value = self._eval(node[2], assignment)
            if isinstance(index_value, bool):
                index_value = int(index_value)
            if index_value < 0:
                return 0
            return (int(base_value) >> int(index_value)) & 1
        if kind == "slice":
            base_value = int(self._eval(node[1], assignment))
            msb_value = int(self._eval(node[2], assignment))
            lsb_value = int(self._eval(node[3], assignment))
            upper = max(msb_value, lsb_value)
            lower = min(msb_value, lsb_value)
            width = upper - lower + 1
            mask = (1 << width) - 1
            return (base_value >> lower) & mask
        if kind == "bitnot":
            width = max(self._width_of(node[1]), 1)
            mask = (1 << width) - 1
            return (~int(self._eval(node[1], assignment))) & mask
        if kind == "redand":
            value = int(self._eval(node[1], assignment))
            width = max(self._width_of(node[1]), 1)
            mask = (1 << width) - 1
            return 1 if (value & mask) == mask else 0
        if kind == "redor":
            return 1 if int(self._eval(node[1], assignment)) != 0 else 0
        if kind == "redxor":
            value = int(self._eval(node[1], assignment))
            width = max(self._width_of(node[1]), 1)
            parity = 0
            for bit in range(width):
                parity ^= (value >> bit) & 1
            return parity
        if kind == "rednand":
            return 0 if self._eval(("redand", node[1]), assignment) else 1
        if kind == "rednor":
            return 0 if self._eval(("redor", node[1]), assignment) else 1
        if kind == "redxnor":
            return 0 if self._eval(("redxor", node[1]), assignment) else 1
        if kind == "not":
            return not self._as_bool(self._eval(node[1], assignment))
        if kind == "bitand":
            return int(self._eval(node[1], assignment)) & int(self._eval(node[2], assignment))
        if kind == "bitor":
            return int(self._eval(node[1], assignment)) | int(self._eval(node[2], assignment))
        if kind == "bitxor":
            return int(self._eval(node[1], assignment)) ^ int(self._eval(node[2], assignment))
        if kind == "and":
            return self._as_bool(self._eval(node[1], assignment)) and self._as_bool(self._eval(node[2], assignment))
        if kind == "or":
            return self._as_bool(self._eval(node[1], assignment)) or self._as_bool(self._eval(node[2], assignment))
        if kind == "shl":
            return int(self._eval(node[1], assignment)) << int(self._eval(node[2], assignment))
        if kind == "shr":
            return int(self._eval(node[1], assignment)) >> int(self._eval(node[2], assignment))
        if kind == "add":
            return int(self._eval(node[1], assignment)) + int(self._eval(node[2], assignment))
        if kind == "sub":
            return int(self._eval(node[1], assignment)) - int(self._eval(node[2], assignment))
        if kind == "mul":
            return int(self._eval(node[1], assignment)) * int(self._eval(node[2], assignment))
        if kind == "div":
            divisor = int(self._eval(node[2], assignment))
            return 0 if divisor == 0 else int(self._eval(node[1], assignment)) // divisor
        if kind == "mod":
            divisor = int(self._eval(node[2], assignment))
            return 0 if divisor == 0 else int(self._eval(node[1], assignment)) % divisor
        if kind == "neg":
            return -int(self._eval(node[1], assignment))
        if kind == "eq":
            return self._eval(node[1], assignment) == self._eval(node[2], assignment)
        if kind == "ne":
            return self._eval(node[1], assignment) != self._eval(node[2], assignment)
        if kind == "gt":
            return self._eval(node[1], assignment) > self._eval(node[2], assignment)
        if kind == "lt":
            return self._eval(node[1], assignment) < self._eval(node[2], assignment)
        if kind == "ge":
            return self._eval(node[1], assignment) >= self._eval(node[2], assignment)
        if kind == "le":
            return self._eval(node[1], assignment) <= self._eval(node[2], assignment)
        raise ValueError(f"Неизвестный узел булева AST: {kind}")

    def _width_of(self, node):
        kind = node[0]
        if kind == "lit":
            value = int(node[1])
            return max(value.bit_length(), 1)
        if kind == "var":
            return max(int(self.variable_widths.get(node[1], 1)), 1)
        if kind == "index":
            return 1
        if kind == "slice":
            msb_value = int(node[2][1]) if node[2][0] == "lit" else 0
            lsb_value = int(node[3][1]) if node[3][0] == "lit" else 0
            return abs(msb_value - lsb_value) + 1
        if kind in {"bitnot", "neg"}:
            return self._width_of(node[1])
        if kind in {"redand", "redor", "redxor", "rednand", "rednor", "redxnor"}:
            return 1
        if kind in {"bitand", "bitor", "bitxor", "add", "sub", "mul", "div", "mod"}:
            return max(self._width_of(node[1]), self._width_of(node[2]))
        if kind in {"shl", "shr"}:
            return self._width_of(node[1])
        if kind in {"not", "and", "or", "eq", "ne", "gt", "lt", "ge", "le"}:
            return 1
        return 1

    @staticmethod
    def _as_bool(value):
        if isinstance(value, bool):
            return value
        return value != 0

    @classmethod
    def _tokenize(cls, text: str):
        tokens = []
        index = 0
        while index < len(text):
            match = cls.TOKEN_RE.match(text, index)
            if not match:
                raise ValueError(f"Неподдерживаемый токен рядом с: {text[index:index + 16]}")
            token = match.group(1)
            tokens.append(token)
            index = match.end()
        return tokens

    @classmethod
    def parse_numeric_literal(cls, token: str):
        normalized = token.replace("_", "").lower()
        if normalized in cls.TRUE_LITERALS:
            return 1
        if normalized in cls.FALSE_LITERALS:
            return 0
        if normalized.isdigit():
            return int(normalized, 10)

        match = re.fullmatch(r"(?P<width>\d+)'(?P<base>[bdh])(?P<value>[0-9a-fxz]+)", normalized)
        if not match:
            raise ValueError(f"Неподдерживаемый числовой литерал: {token}")

        base = match.group("base")
        digits = match.group("value").replace("x", "0").replace("z", "0")
        radix = {"b": 2, "d": 10, "h": 16}[base]
        return int(digits, radix)


class _BooleanParser:
    def __init__(self, tokens):
        self.tokens = tokens
        self.index = 0
        self.variables = set()

    def parse(self):
        if not self.tokens:
            return ("lit", True)

        node = self.parse_or()
        if self.index != len(self.tokens):
            raise ValueError(f"Unexpected token: {self.tokens[self.index]}")
        return node

    def parse_or(self):
        node = self.parse_logical_and()
        while self._peek() == "||":
            self._consume()
            node = ("or", node, self.parse_logical_and())
        return node

    def parse_logical_and(self):
        node = self.parse_bitwise_or()
        while self._peek() == "&&":
            self._consume()
            node = ("and", node, self.parse_bitwise_or())
        return node

    def parse_bitwise_or(self):
        node = self.parse_bitwise_xor()
        while self._peek() == "|":
            self._consume()
            node = ("bitor", node, self.parse_bitwise_xor())
        return node

    def parse_bitwise_xor(self):
        node = self.parse_bitwise_and()
        while self._peek() == "^":
            self._consume()
            node = ("bitxor", node, self.parse_bitwise_and())
        return node

    def parse_bitwise_and(self):
        node = self.parse_relation()
        while self._peek() == "&":
            self._consume()
            node = ("bitand", node, self.parse_relation())
        return node

    def parse_relation(self):
        node = self.parse_shift()
        while self._peek() in {"==", "!=", ">", "<", ">=", "<="}:
            operator = self._consume()
            right = self.parse_shift()
            node = (
                {
                    "==": "eq",
                    "!=": "ne",
                    ">": "gt",
                    "<": "lt",
                    ">=": "ge",
                    "<=": "le",
                }[operator],
                node,
                right,
            )
        return node

    def parse_shift(self):
        node = self.parse_additive()
        while self._peek() in {"<<", ">>"}:
            operator = self._consume()
            node = ("shl" if operator == "<<" else "shr", node, self.parse_additive())
        return node

    def parse_additive(self):
        node = self.parse_multiplicative()
        while self._peek() in {"+", "-"}:
            operator = self._consume()
            node = ("add" if operator == "+" else "sub", node, self.parse_multiplicative())
        return node

    def parse_multiplicative(self):
        node = self.parse_unary()
        while self._peek() in {"*", "/", "%"}:
            operator = self._consume()
            node = (
                {
                    "*": "mul",
                    "/": "div",
                    "%": "mod",
                }[operator],
                node,
                self.parse_unary(),
            )
        return node

    def parse_unary(self):
        token = self._peek()
        if token == "!":
            self._consume()
            return ("not", self.parse_unary())
        if token == "~":
            self._consume()
            return ("bitnot", self.parse_unary())
        if token == "&":
            self._consume()
            return ("redand", self.parse_unary())
        if token == "|":
            self._consume()
            return ("redor", self.parse_unary())
        if token == "^":
            self._consume()
            return ("redxor", self.parse_unary())
        if token == "~&":
            self._consume()
            return ("rednand", self.parse_unary())
        if token == "~|":
            self._consume()
            return ("rednor", self.parse_unary())
        if token in {"^~", "~^"}:
            self._consume()
            return ("redxnor", self.parse_unary())
        if token == "-":
            self._consume()
            return ("neg", self.parse_unary())
        return self.parse_postfix()

    def parse_postfix(self):
        node = self.parse_primary()
        while self._peek() == "[":
            self._consume()
            first = self.parse_or()
            if self._peek() == ":":
                self._consume()
                second = self.parse_or()
                if self._consume() != "]":
                    raise ValueError("Expected closing ']'")
                node = ("slice", node, first, second)
                continue
            if self._consume() != "]":
                raise ValueError("Expected closing ']'")
            node = ("index", node, first)
        return node

    def parse_primary(self):
        token = self._consume()
        if token is None:
            raise ValueError("Unexpected end of boolean expression")

        if token == "(":
            node = self.parse_or()
            if self._consume() != ")":
                raise ValueError("Expected closing ')'")
            return node

        normalized = token.lower()
        if normalized in BooleanExpression.TRUE_LITERALS:
            return ("lit", 1)
        if normalized in BooleanExpression.FALSE_LITERALS:
            return ("lit", 0)
        if re.fullmatch(r"\d+'[bdhBDH][0-9a-fA-F_xXzZ]+", token) or token.isdigit():
            return ("lit", BooleanExpression.parse_numeric_literal(token))
        if BooleanExpression.IDENTIFIER_RE.fullmatch(token):
            self.variables.add(token)
            return ("var", token)
        raise ValueError(f"Неподдерживаемый первичный токен: {token}")

    def _peek(self):
        if self.index >= len(self.tokens):
            return None
        return self.tokens[self.index]

    def _consume(self):
        token = self._peek()
        if token is None:
            raise ValueError("Unexpected end of boolean expression")
        self.index += 1
        return token
