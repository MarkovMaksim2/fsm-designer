from core.fsm import FSM
import re
from analysis.logic import BooleanExpression


class AdvancedFSMAnalyzer:
    IMPORT_STYLE_LABELS = {
        "native": "внутренняя модель",
        "single_process": "однопроцессный",
        "two_process": "двухпроцессный",
        "hybrid": "гибридный",
    }

    IMPORT_ROLE_LABELS = {
        "state_register": "регистр состояния",
        "next_state_logic": "логика следующего состояния",
        "output_logic": "логика выходов",
        "single_process_output_logic": "однопроцессная логика действий",
        "mixed_fsm_datapath": "смешанная логика автомата и операционной части",
        "datapath_logic": "операционная логика",
        "fsm_aux": "вспомогательный FSM-блок",
    }

    FORMAL_REASON_LABELS = {
        "parse_error": "ошибка разбора выражения",
        "too_many_variables": "слишком много независимых переменных",
        "domain_too_wide": "слишком широкая суммарная разрядность домена",
        "domain_too_large": "слишком большой перебираемый домен",
    }

    def __init__(self, fsm: FSM):
        self.fsm = fsm
        self.signal_widths = {
            name: signal.width for name, signal in fsm.signals.items()
        }

    # =========================================================
    # PUBLIC
    # =========================================================

    def full_analysis(self):
        unreachable_details = self.describe_unreachable_states()
        dead_details = self.describe_dead_states()
        unsafe_details = self.describe_unsafe_states()
        structure = {
            "unreachable_states": self.find_unreachable_states(),
            "dead_states": self.find_dead_states(),
            "livelocks": self.find_livelocks(),
            "unreachable_details": unreachable_details,
            "dead_state_details": dead_details,
        }
        behavior = {
            "nondeterministic": self.find_nondeterministic_transitions(),
            "conflicts": self.find_conflicting_conditions(),
            "missing_coverage": self.check_condition_coverage(),
        }
        signals = {
            "unused_signals": self.find_unused_signals(),
            "unassigned_outputs": self.find_unassigned_outputs(),
        }
        safety = {
            "unsafe_states": self.find_unsafe_states(),
            "unsafe_state_details": unsafe_details,
        }
        formal = {
            "nondeterministic": self.find_nondeterministic_formal(),
            "coverage_issues": self.check_coverage_formal(),
            "constraints": self.extract_constraints(),
            "summary": self.formal_summary(),
            "unsupported_guards": self.find_unsupported_formal_guards(),
        }
        import_info = {
            "imported_from_verilog": self.fsm.imported_from_verilog,
            "safe_to_regenerate": self.fsm.safe_to_regenerate,
            "safety_status_label": "безопасно" if self.fsm.safe_to_regenerate else "ограничено",
            "regeneration_warning": self.fsm.regeneration_warning,
            "style": self.fsm.import_style,
            "style_label": self._import_style_label(self.fsm.import_style),
            "mixed_datapath": self.fsm.import_has_mixed_datapath,
            "fsm_blocks": self.fsm.import_fsm_blocks,
            "block_roles": self.fsm.import_block_roles,
            "block_role_labels": [self._import_role_label(role) for role in self.fsm.import_block_roles],
            "internal_action_targets": self.fsm.import_internal_action_targets,
        }

        return {
            "summary": {
                "states": len(self.fsm.states),
                "transitions": len(self.fsm.transitions),
                "signals": len(self.fsm.signals),
                "issue_count": sum(
                    len(items)
                    for items in [
                        structure["unreachable_states"],
                        structure["dead_states"],
                        structure["livelocks"],
                        behavior["nondeterministic"],
                        behavior["conflicts"],
                        behavior["missing_coverage"],
                        signals["unused_signals"],
                        signals["unassigned_outputs"],
                        safety["unsafe_states"],
                    ]
                ),
            },
            "structure": {
                **structure,
            },
            "behavior": {
                **behavior,
            },
            "signals": {
                **signals,
            },
            "safety": {
                **safety,
            },
            "formal": {
                **formal,
            },
            "import": import_info,
        }

    # =========================================================
    # STRUCTURE
    # =========================================================

    def _expr(self, text: str):
        return BooleanExpression(text, variable_widths=self.signal_widths)

    def _import_style_label(self, style: str):
        return self.IMPORT_STYLE_LABELS.get(style, style or "неизвестно")

    def _import_role_label(self, role: str):
        return self.IMPORT_ROLE_LABELS.get(role, role)

    def _formal_reason_label(self, reason_code: str):
        return self.FORMAL_REASON_LABELS.get(reason_code, reason_code)

    def _coverage_status(self, transitions):
        if not transitions:
            return {
                "complete": False,
                "method": "нет переходов",
                "reason": "У состояния отсутствуют исходящие переходы.",
            }

        expressions = [self._expr(transition.condition) for transition in transitions]
        if any(expression.is_unconditional() for expression in expressions):
            return {
                "complete": True,
                "method": "безусловный переход",
                "reason": None,
            }

        supported, covered = BooleanExpression.covers_all(expressions)
        if supported:
            return {
                "complete": covered,
                "method": "формальный анализ",
                "reason": None if covered else "Набор условий не покрывает все возможные значения входов.",
            }

        return {
            "complete": False,
            "method": "эвристический режим",
            "reason": "Полноту покрытия не удалось строго доказать без безусловного перехода.",
        }

    def find_unreachable_states(self):
        visited = set()

        def dfs(state):
            if state in visited:
                return
            visited.add(state)
            for t in self.fsm.get_transitions_from(state):
                dfs(t.to_state)

        if self.fsm.initial_state:
            dfs(self.fsm.initial_state)

        return [s for s in self.fsm.states if s not in visited]

    def describe_unreachable_states(self):
        details = []
        for state in self.find_unreachable_states():
            details.append(
                {
                    "state": state,
                    "message": f"Состояние `{state}` недостижимо из начального состояния `{self.fsm.initial_state}`.",
                    "location": f"Узел состояния `{state}` и все связанные с ним переходы.",
                    "quick_fix": {
                        "type": "unreachable",
                        "title": "Удалить недостижимое состояние",
                        "description": (
                            f"Удалить состояние `{state}` и все переходы, у которых `{state}` является источником или целью."
                        ),
                        "location": f"Узел графа `{state}` и его инцидентные рёбра.",
                    },
                }
            )
        return details

    # ---------------------------------------------------------

    def find_dead_states(self):
        return [
            s for s in self.fsm.states
            if len(self.fsm.get_transitions_from(s)) == 0
        ]

    def describe_dead_states(self):
        details = []
        for state in self.find_dead_states():
            details.append(
                {
                    "state": state,
                    "message": f"У состояния `{state}` нет исходящих переходов.",
                    "location": f"Набор исходящих переходов состояния `{state}`.",
                    "quick_fix": {
                        "type": "dead",
                        "title": "Добавить самопереход по умолчанию",
                        "description": (
                            f"Добавить переход `{state} -> {state}` с условием `1`, чтобы автомат оставался полным в этом состоянии."
                        ),
                        "location": f"Список переходов состояния `{state}`.",
                    },
                }
            )
        return details

    # ---------------------------------------------------------

    def find_livelocks(self):
        livelocks = []
        for state in self.fsm.states:
            transitions = self.fsm.get_transitions_from(state)
            if transitions and all(t.to_state == state for t in transitions):
                livelocks.append([state])

        return livelocks

    # =========================================================
    # BEHAVIOR
    # =========================================================

    def find_nondeterministic_transitions(self):
        issues = []

        for state in self.fsm.states:
            transitions = self.fsm.get_transitions_from(state)
            conditions = [self._expr(t.condition) for t in transitions]

            duplicates = len({condition.expr for condition in conditions}) != len(conditions)
            fallback_indices = [
                index for index, condition in enumerate(conditions) if condition.is_unconditional()
            ]
            multiple_fallbacks = len(fallback_indices) > 1
            misplaced_fallback = len(fallback_indices) == 1 and fallback_indices[0] != len(conditions) - 1

            if duplicates or multiple_fallbacks or misplaced_fallback:
                fixes = []
                if duplicates:
                    fixes.append("удалить более поздние дубликаты условий")
                if multiple_fallbacks:
                    fixes.append("оставить только один безусловный переход по умолчанию")
                if misplaced_fallback:
                    fixes.append("переместить безусловный переход по умолчанию в конец списка ветвей")
                issues.append({
                    "state": state,
                    "transitions": [
                        {"to": t.to_state, "cond": t.condition}
                        for t in transitions
                    ],
                    "reason": "дубли условий или неоднозначный порядок ветвей по умолчанию",
                    "location": f"Исходящие переходы состояния `{state}`.",
                    "message": (
                        f"Исходящие переходы из `{state}` содержат дубли условий или неоднозначный порядок ветвей по умолчанию."
                    ),
                    "quick_fix": {
                        "type": "nondet",
                        "title": "Нормализовать порядок переходов",
                        "description": "; ".join(fixes).capitalize() + ".",
                        "location": f"Список переходов состояния `{state}`.",
                    },
                })

        return issues

    # ---------------------------------------------------------

    def find_conflicting_conditions(self):
        conflicts = []

        for state in self.fsm.states:
            transitions = self.fsm.get_transitions_from(state)
            seen = set()
            duplicates = set()
            for transition in transitions:
                normalized = transition.condition.strip()
                if normalized in seen:
                    duplicates.add(normalized)
                seen.add(normalized)

            if duplicates:
                conflicts.append({
                    "state": state,
                    "duplicate_conditions": sorted(duplicates),
                })

        return conflicts

    # ---------------------------------------------------------

    def check_condition_coverage(self):
        issues = []

        for state in self.fsm.states:
            transitions = self.fsm.get_transitions_from(state)
            coverage = self._coverage_status(transitions)
            if transitions and not coverage["complete"]:
                issues.append({
                    "state": state,
                    "problem": "нет полного покрытия условий переходов",
                    "location": f"Исходящие переходы состояния `{state}`.",
                    "method": coverage["method"],
                    "reason": coverage["reason"],
                })

        return issues

    # =========================================================
    # SIGNALS
    # =========================================================

    def find_unused_signals(self):
        used = set()

        pattern = re.compile(r"\b[a-zA-Z_][a-zA-Z0-9_]*\b")

        for t in self.fsm.transitions:
            used.update(pattern.findall(t.condition))
            for act in t.actions:
                used.update(pattern.findall(act))

        for s in self.fsm.states.values():
            for act in s.actions:
                used.update(pattern.findall(act))

        for instance in getattr(self.fsm, "module_instances", []):
            for connection in instance.get("connections", {}).values():
                used.update(pattern.findall(str(connection)))

        declared = set(self.fsm.signals.keys())
        declared -= {"clk", "reset"}

        return sorted(declared - used)

    # ---------------------------------------------------------

    def find_unassigned_outputs(self):
        assigned = set()

        for signal in self.fsm.signals.values():
            if signal.direction in {"output", "output_reg"} and signal.default is not None:
                assigned.add(signal.name)

        for s in self.fsm.states.values():
            for act in s.actions:
                if "=" in act:
                    assigned.add(act.split("=", maxsplit=1)[0].strip())

        for t in self.fsm.transitions:
            for act in t.actions:
                if "=" in act:
                    assigned.add(act.split("=", maxsplit=1)[0].strip())

        module_defs = {
            module.get("name"): module
            for module in getattr(self.fsm, "external_modules", [])
            if module.get("name")
        }
        for instance in getattr(self.fsm, "module_instances", []):
            module = module_defs.get(instance.get("module_name"))
            if not module:
                continue
            outputs = {
                port.get("name")
                for port in module.get("ports", [])
                if port.get("direction") in {"output", "output_reg"}
            }
            for port_name, connection in instance.get("connections", {}).items():
                if port_name in outputs:
                    assigned.add(str(connection).strip())

        outputs = {
            name for name, sig in self.fsm.signals.items()
            if sig.direction in {"output", "output_reg"}
        }

        return sorted(outputs - assigned)

    # =========================================================
    # SAFETY
    # =========================================================

    def find_unsafe_states(self):
        unsafe = []

        for state in self.fsm.states:
            transitions = self.fsm.get_transitions_from(state)
            coverage = self._coverage_status(transitions)
            if transitions and not coverage["complete"]:
                unsafe.append(state)

        return unsafe

    def describe_unsafe_states(self):
        details = []
        for state in self.find_unsafe_states():
            transitions = self.fsm.get_transitions_from(state)
            coverage = self._coverage_status(transitions)
            details.append(
                {
                    "state": state,
                    "message": f"У состояния `{state}` условия переходов не образуют полный набор ветвей.",
                    "location": f"Исходящие переходы состояния `{state}`.",
                    "method": coverage["method"],
                    "reason": coverage["reason"],
                    "quick_fix": {
                        "type": "unsafe",
                        "title": "Добавить переход по умолчанию",
                        "description": (
                            f"Добавить переход `{state} -> {state}` с условием `1`, если автомат действительно должен иметь fallback-ветвь. "
                            f"Если ветви уже логически полны, проверь корректность импортированных условий переходов."
                        ),
                        "location": f"Список переходов состояния `{state}`.",
                    },
                }
            )
        return details

    def find_nondeterministic_formal(self):
        issues = []

        for state in self.fsm.states:
            transitions = self.fsm.get_transitions_from(state)

            for i in range(len(transitions)):
                for j in range(i + 1, len(transitions)):

                    t1 = transitions[i]
                    t2 = transitions[j]

                    expr1 = self._expr(t1.condition)
                    expr2 = self._expr(t2.condition)

                    supported, overlaps = expr1.overlaps_with(expr2)
                    if supported:
                        if not overlaps:
                            continue
                        issues.append({
                            "state": state,
                            "conflict": [t1.condition, t2.condition],
                            "type": "доказуемое пересечение",
                            "method": "формальный анализ",
                        })
                    elif expr1.variables() & expr2.variables():
                        issues.append({
                            "state": state,
                            "conflict": [t1.condition, t2.condition],
                            "type": "потенциальное пересечение",
                            "method": "эвристический режим",
                        })

        return issues

    def check_coverage_formal(self):
        issues = []

        for state in self.fsm.states:
            transitions = self.fsm.get_transitions_from(state)

            if not transitions:
                continue

            conditions = [t.condition for t in transitions]

            if not any(self._expr(condition).is_unconditional() for condition in conditions):
                expressions = [self._expr(condition) for condition in conditions]
                supported, covered = BooleanExpression.covers_all(expressions)
                if not (supported and covered):
                    reasons = [
                        summary["reason"]
                        for summary in [expression.formal_summary() for expression in expressions]
                        if not summary["supported"] and summary["reason"]
                    ]
                    issues.append({
                        "state": state,
                        "problem": "нет полного покрытия условий",
                        "conditions": conditions,
                        "method": "формальный анализ" if supported else "эвристический режим",
                        "reason": reasons[0] if reasons else None,
                    })

        return issues

    def extract_constraints(self):
        constraints = []

        for t in self.fsm.transitions:
            constraints.append({
                "from": t.from_state,
                "to": t.to_state,
                "condition": t.condition,
                "formal": self._expr(t.condition).formal_summary(),
            })

        return constraints

    def formal_summary(self):
        total = len(self.fsm.transitions)
        supported = 0
        unsatisfiable = 0
        unsupported_reasons = {}

        for transition in self.fsm.transitions:
            summary = self._expr(transition.condition).formal_summary()
            if summary["supported"]:
                supported += 1
            if summary["supported"] and not summary["satisfiable"]:
                unsatisfiable += 1
            if not summary["supported"] and summary["reason_code"]:
                unsupported_reasons[summary["reason_code"]] = (
                    unsupported_reasons.get(summary["reason_code"], 0) + 1
                )

        return {
            "supported_transitions": supported,
            "total_transitions": total,
            "unsupported_transitions": max(total - supported, 0),
            "unsatisfiable_transitions": unsatisfiable,
            "unsupported_reason_counts": unsupported_reasons,
            "unsupported_reasons": [
                {
                    "code": reason_code,
                    "label": self._formal_reason_label(reason_code),
                    "count": count,
                }
                for reason_code, count in sorted(unsupported_reasons.items())
            ],
        }

    def find_unsupported_formal_guards(self):
        issues = []

        for transition in self.fsm.transitions:
            summary = self._expr(transition.condition).formal_summary()
            if summary["supported"]:
                continue
            issues.append(
                {
                    "state": transition.from_state,
                    "message": (
                        f"Переход `{transition.from_state} -> {transition.to_state}` с условием "
                        f"`{transition.condition}` не поддерживается строгим формальным анализом."
                    ),
                    "location": (
                        f"Переход `{transition.from_state} -> {transition.to_state}` "
                        f"с условием `{transition.condition}`."
                    ),
                    "transition": {
                        "from": transition.from_state,
                        "to": transition.to_state,
                        "condition": transition.condition,
                    },
                    "reason": summary["reason"],
                    "reason_code": summary["reason_code"],
                    "reason_label": self._formal_reason_label(summary["reason_code"]),
                    "variables": summary["variables"],
                    "total_bits": summary["total_bits"],
                }
            )

        return issues
