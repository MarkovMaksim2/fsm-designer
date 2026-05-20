from pyverilog.ast_code_generator.codegen import ASTCodeGenerator
from pyverilog.vparser.ast import *

from core.fsm import FSM
from parser.ast_utils import find_nodes


class FSMExtractor:
    def __init__(self, ast):
        self.ast = ast
        self.fsm = FSM()
        self.codegen = ASTCodeGenerator()

        self.state_var = None
        self.next_state_var = None

    def extract(self):
        self._find_state_variables()
        self._extract_signals()
        self._extract_states()
        self._detect_reset_state()
        self._extract_transitions_and_actions()
        self._extract_wire_expressions()
        self._extract_module_context()
        self._extract_reset_actions()
        self._assess_regeneration_safety()
        self._assign_action_domains()
        return self.fsm

    def _find_state_variables(self):
        assigns = find_nodes(self.ast, (NonblockingSubstitution, BlockingSubstitution))
        pairs = []
        case_candidates = self._case_state_candidates()

        for a in assigns:
            left = self._name(a.left)
            right = self._name(a.right)

            if left and right:
                pairs.append((left, right))

        for left, right in pairs:
            if left != right and "next" in right.lower():
                self.state_var = left
                self.next_state_var = right
                return

        for left, right in pairs:
            if left in case_candidates and right in case_candidates:
                self.state_var = left
                return

        for candidate in case_candidates:
            if any(left == candidate for left, _ in pairs):
                self.state_var = candidate
                return

        for left, right in pairs:
            if left != right:
                self.state_var = left
                self.next_state_var = right
                return

    def _extract_states(self):
        case_nodes = find_nodes(self.ast, CaseStatement)

        for case in case_nodes:
            if self._name(case.comp) != self.state_var:
                continue

            for item in case.caselist:
                for state_name in self._case_labels(item):
                    if state_name and state_name not in self.fsm.states:
                        self.fsm.add_state(state_name)

    def _extract_signals(self):
        output_names = {self._name(decl) for decl in find_nodes(self.ast, Output)}
        reg_names = {self._name(decl) for decl in find_nodes(self.ast, Reg)}

        for node_type, direction in (
            (Input, "input"),
            (Output, "output"),
            (Wire, "wire"),
            (Reg, "reg"),
        ):
            for decl in find_nodes(self.ast, node_type):
                name = self._name(decl)
                if not name or name in {self.state_var, self.next_state_var}:
                    continue
                if name in self.fsm.signals:
                    continue
                actual_direction = direction
                if direction == "output" and name in reg_names:
                    actual_direction = "output_reg"
                if direction == "reg" and name in output_names:
                    continue
                self.fsm.add_signal(name, actual_direction, self._width(decl))

    def _detect_reset_state(self):
        assigns = find_nodes(self.ast, NonblockingSubstitution)

        for a in assigns:
            if self._name(a.left) == self.state_var:
                init = self._name(a.right)
                if init and init in self.fsm.states:
                    self.fsm.initial_state = init
                    self.fsm.states[init].is_initial = True
                    return

    def _extract_transitions_and_actions(self):
        case_nodes = find_nodes(self.ast, CaseStatement)

        for case in case_nodes:
            if self._name(case.comp) != self.state_var:
                continue

            for item in case.caselist:
                for from_state in self._case_labels(item):
                    if self.next_state_var is None and self._contains_transition_assignment(item.statement):
                        self._extract_transition_paths(from_state, item.statement)
                    else:
                        self._parse_statement(from_state, item.statement)

    def _extract_transition_paths(self, from_state, stmt):
        paths = self._process_paths(
            [
                {
                    "condition": "1",
                    "actions": [],
                    "target": None,
                }
            ],
            stmt,
            from_state,
        )

        for path in paths:
            target = path["target"]
            if target is None and self.next_state_var is None:
                target = from_state

            if target is None:
                continue

            transition = self.fsm.add_transition(from_state, target, path["condition"] or "1")
            for action in path["actions"]:
                transition.add_action(action)

    def _process_paths(self, paths, stmt, from_state):
        if stmt is None:
            return paths

        if isinstance(stmt, Block):
            active_paths = paths
            for child in stmt.statements or []:
                active_paths = self._process_paths(active_paths, child, from_state)
            return active_paths

        if isinstance(stmt, IfStatement):
            next_paths = []
            cond = self._expr(stmt.cond)
            for path in paths:
                true_path = self._clone_path(path, self._combine_conditions(path["condition"], cond))
                next_paths.extend(self._process_paths([true_path], stmt.true_statement, from_state))

                false_condition = self._combine_conditions(path["condition"], self._negate_condition(cond))
                false_path = self._clone_path(path, false_condition)
                if stmt.false_statement is not None:
                    next_paths.extend(self._process_paths([false_path], stmt.false_statement, from_state))
                else:
                    next_paths.append(false_path)
            return next_paths

        if isinstance(stmt, (BlockingSubstitution, NonblockingSubstitution)):
            left = self._name(stmt.left)
            right = self._expr(stmt.right)
            updated = []
            for path in paths:
                next_path = self._clone_path(path, path["condition"])
                if left in {self.state_var, self.next_state_var}:
                    next_path["target"] = self._resolve_transition_target(stmt.right, from_state)
                elif left:
                    next_path["actions"].append(self._format_assignment(stmt, left, right))
                updated.append(next_path)
            return updated

        return paths

    def _clone_path(self, path, condition):
        return {
            "condition": condition,
            "actions": list(path["actions"]),
            "target": path["target"],
        }

    def _combine_conditions(self, left, right):
        left = (left or "1").strip()
        right = (right or "1").strip()

        if left == "1":
            return self._simplify_condition(right)
        if right == "1":
            return self._simplify_condition(left)
        return self._simplify_condition(f"({left}) && ({right})")

    def _negate_condition(self, cond):
        cond = (cond or "1").strip()
        if cond == "1":
            return "1'b0"
        return self._simplify_condition(f"!({cond})")

    def _simplify_condition(self, expr):
        expr = (expr or "1").strip()
        previous = None
        while expr != previous:
            previous = expr
            if expr.startswith("!"):
                inner = self._unwrap_outer_parentheses(expr[1:].strip())
                if inner.startswith("!"):
                    expr = self._unwrap_outer_parentheses(inner[1:].strip())
        return expr

    def _unwrap_outer_parentheses(self, expr):
        expr = (expr or "").strip()
        while self._is_wrapped_by_parentheses(expr):
            expr = expr[1:-1].strip()
        return expr

    def _is_wrapped_by_parentheses(self, expr):
        if len(expr) < 2 or expr[0] != "(" or expr[-1] != ")":
            return False

        depth = 0
        for index, char in enumerate(expr):
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0 and index != len(expr) - 1:
                    return False
        return depth == 0

    def _contains_transition_assignment(self, stmt):
        for assign in find_nodes(stmt, (BlockingSubstitution, NonblockingSubstitution)):
            left = self._name(assign.left)
            if left in {self.state_var, self.next_state_var}:
                return True
        return False

    def _extract_wire_expressions(self):
        for assign in find_nodes(self.ast, Assign):
            left = self._name(assign.left)
            if not left or left not in self.fsm.signals:
                continue
            signal = self.fsm.signals[left]
            if signal.direction != "wire":
                continue
            signal.set_expression(self._expr(assign.right))

    def _parse_statement(self, from_state, stmt, condition_prefix="1"):
        if isinstance(stmt, IfStatement):
            self._parse_if(from_state, stmt, condition_prefix)

        elif isinstance(stmt, Block):
            direct_transition = self._find_direct_transition(stmt, from_state)
            if direct_transition:
                target_state, source_stmt = direct_transition
                transition = self.fsm.add_transition(from_state, target_state, condition_prefix or "1")
                self._collect_direct_actions(source_stmt, transition)
                return

            for s in stmt.statements:
                self._parse_statement(from_state, s, condition_prefix)

        else:
            self._parse_action(from_state, stmt)

    def _parse_if(self, from_state, stmt, condition_prefix="1"):
        raw_cond = self._expr(stmt.cond)
        cond = self._combine_conditions(condition_prefix, raw_cond)

        # TRUE branch
        to_state = self._find_next_state(stmt.true_statement, from_state)
        transition = None

        if to_state:
            transition = self.fsm.add_transition(from_state, to_state, cond)
            self._collect_actions(stmt.true_statement, transition)

        # FALSE branch
        if stmt.false_statement:
            false_cond = self._combine_conditions(condition_prefix, self._negate_condition(raw_cond))

            if isinstance(stmt.false_statement, IfStatement):
                self._parse_statement(from_state, stmt.false_statement, false_cond)
                return

            to_state_false = self._find_next_state(stmt.false_statement, from_state)

            if to_state_false:
                transition = self.fsm.add_transition(from_state, to_state_false, false_cond)
                self._collect_actions(stmt.false_statement, transition)

            else:
                self._parse_statement(from_state, stmt.false_statement, false_cond)
        elif self.next_state_var is None:
            self.fsm.add_transition(
                from_state,
                from_state,
                self._combine_conditions(condition_prefix, self._negate_condition(raw_cond)),
            )

    def _collect_actions(self, stmt, transition):
        for assign in find_nodes(stmt, (BlockingSubstitution, NonblockingSubstitution)):
            left = self._name(assign.left)
            right = self._expr(assign.right)

            if left and left not in {self.state_var, self.next_state_var}:
                transition.add_action(self._format_assignment(assign, left, right))

    def _parse_action(self, state, stmt):
        if isinstance(stmt, (BlockingSubstitution, NonblockingSubstitution)):
            left = self._name(stmt.left)

            if left and left not in {self.state_var, self.next_state_var}:
                expr = self._format_assignment(stmt, left, self._expr(stmt.right))
                self.fsm.add_state_action(state, expr)

    def _find_next_state(self, stmt, from_state):
        for assign in find_nodes(stmt, (BlockingSubstitution, NonblockingSubstitution)):
            left = self._name(assign.left)
            if self.next_state_var and left == self.next_state_var:
                return self._resolve_transition_target(assign.right, from_state)
            if left == self.state_var:
                return self._resolve_transition_target(assign.right, from_state)
        return None

    def _find_direct_transition(self, stmt, from_state):
        if not isinstance(stmt, Block):
            return None

        for child in stmt.statements or []:
            if not isinstance(child, (BlockingSubstitution, NonblockingSubstitution)):
                continue

            left = self._name(child.left)
            if self.next_state_var and left == self.next_state_var:
                return self._resolve_transition_target(child.right, from_state), stmt
            if left == self.state_var:
                return self._resolve_transition_target(child.right, from_state), stmt

        return None

    def _resolve_transition_target(self, node, from_state):
        target_name = self._name(node)
        if target_name in {self.state_var, self.next_state_var}:
            return from_state
        return target_name

    def _collect_direct_actions(self, stmt, transition):
        if not isinstance(stmt, Block):
            return

        for child in stmt.statements or []:
            if not isinstance(child, (BlockingSubstitution, NonblockingSubstitution)):
                continue

            left = self._name(child.left)
            right = self._expr(child.right)

            if left and left not in {self.state_var, self.next_state_var}:
                transition.add_action(self._format_assignment(child, left, right))

    def _case_state_candidates(self):
        candidates = set()
        for case in find_nodes(self.ast, CaseStatement):
            comp_name = self._name(case.comp)
            if not comp_name:
                continue

            labels = []
            for item in case.caselist:
                labels.extend(self._case_labels(item))

            if len([label for label in labels if label]) >= 2:
                candidates.add(comp_name)

        return candidates

    def _name(self, node):
        if isinstance(node, (Lvalue, Rvalue)):
            return self._name(node.var)
        if isinstance(node, Identifier):
            return node.name
        if isinstance(node, (Input, Output, Wire, Reg)):
            return node.name
        if isinstance(node, Pointer):
            return self._name(node.var)
        if isinstance(node, Partselect):
            return self._name(node.var)
        if isinstance(node, IntConst):
            return node.value
        if isinstance(node, str):
            return node
        if isinstance(node, (list, tuple)) and len(node) == 1:
            return self._name(node[0])
        return None

    def _assignment_operator(self, node):
        return "<=" if isinstance(node, NonblockingSubstitution) else "="

    def _format_assignment(self, node, left, right):
        return f"{left} {self._assignment_operator(node)} {right};"

    def _width(self, node):
        width = getattr(node, "width", None)
        if width is None:
            return 1

        msb = getattr(width, "msb", None)
        lsb = getattr(width, "lsb", None)
        if isinstance(msb, IntConst) and isinstance(lsb, IntConst):
            try:
                return abs(int(msb.value, 0) - int(lsb.value, 0)) + 1
            except ValueError:
                return 1
        return 1

    def _extract_module_context(self):
        modules = find_nodes(self.ast, ModuleDef)
        if not modules:
            return

        module = modules[0]
        self.fsm.module_name = module.name
        self.fsm.module_ports = self._module_ports(module)
        self.fsm.state_signal_name = self.state_var or self.fsm.state_signal_name
        self.fsm.next_state_signal_name = self.next_state_var or self.fsm.next_state_signal_name
        self._extract_clock_reset_names(module)
        self._extract_external_modules(module)

        preserved = []
        state_names = set(self.fsm.states.keys())

        for item in module.items or []:
            if self._is_fsm_item(item, state_names):
                continue
            preserved.append(self.codegen.visit(item))

        self.fsm.preserved_items = preserved

    def _extract_external_modules(self, module):
        extracted_modules = {}
        extracted_instances = []

        for item in module.items or []:
            if not isinstance(item, InstanceList):
                continue

            module_name = getattr(item, "module", None)
            if not module_name or module_name == self.fsm.module_name:
                continue

            ports = extracted_modules.setdefault(module_name, {})

            for instance in getattr(item, "instances", []) or []:
                instance_name = getattr(instance, "name", None)
                if not instance_name:
                    continue

                connections = {}
                for port_arg in getattr(instance, "portlist", []) or []:
                    port_name = getattr(port_arg, "portname", None)
                    arg_node = getattr(port_arg, "argname", None)
                    if not port_name or arg_node is None:
                        continue

                    connection = self._expr(arg_node)
                    connections[port_name] = connection
                    ports[port_name] = {
                        "name": port_name,
                        "direction": self._infer_external_port_direction(arg_node),
                        "width": self._infer_external_port_width(arg_node),
                    }

                extracted_instances.append(
                    {
                        "name": instance_name,
                        "module_name": module_name,
                        "connections": connections,
                    }
                )

        self.fsm.external_modules = [
            {
                "name": module_name,
                "ports": list(ports.values()),
            }
            for module_name, ports in extracted_modules.items()
        ]
        self.fsm.module_instances = extracted_instances

    def _infer_external_port_direction(self, arg_node):
        signal_name = self._name(arg_node)
        signal = self.fsm.signals.get(signal_name)

        if signal is None:
            return "input"
        if signal.direction in {"wire", "output"}:
            return "output"
        return "input"

    def _infer_external_port_width(self, arg_node):
        signal_name = self._name(arg_node)
        signal = self.fsm.signals.get(signal_name)
        if signal is not None:
            return signal.width

        if isinstance(arg_node, IntConst):
            width_match = str(arg_node.value).split("'")[0]
            try:
                return max(1, int(width_match))
            except ValueError:
                return 1

        return 1

    def _extract_reset_actions(self):
        modules = find_nodes(self.ast, ModuleDef)
        if not modules:
            return

        seen_actions = set(self.fsm.reset_actions)

        for item in modules[0].items or []:
            if not isinstance(item, Always):
                continue
            if not self._always_contains_fsm_logic(item):
                continue

            root_if = self._root_if_statement(item)
            if root_if is None:
                continue

            true_statement = root_if.true_statement
            if true_statement is None:
                continue

            target_state = self._find_assignment_target(true_statement, self.state_var)
            if target_state not in {self.fsm.initial_state, None}:
                continue

            for assign in find_nodes(true_statement, (BlockingSubstitution, NonblockingSubstitution)):
                left = self._name(assign.left)
                if left and left not in {self.state_var, self.next_state_var}:
                    action = self._format_assignment(assign, left, self._expr(assign.right))
                    if action not in seen_actions:
                        self.fsm.add_reset_action(action)
                        seen_actions.add(action)

    def _find_assignment_target(self, stmt, signal_name):
        for assign in find_nodes(stmt, (BlockingSubstitution, NonblockingSubstitution)):
            if self._name(assign.left) == signal_name:
                return self._name(assign.right)
        return None

    def _extract_clock_reset_names(self, module):
        inferred_clock, inferred_reset = self._infer_clock_reset_from_inputs()

        for item in module.items or []:
            if not isinstance(item, Always):
                continue
            if not self._always_contains_fsm_logic(item):
                continue

            sens_list = getattr(item, "sens_list", None)
            signals = getattr(sens_list, "list", None) if sens_list else None
            if not signals:
                continue

            names = [self._name(getattr(sens, "sig", None)) for sens in signals]
            names = [name for name in names if name]
            if not names:
                break

            self.fsm.clock_signal_name = names[0]
            if len(names) > 1:
                self.fsm.reset_signal_name = names[1]
                self.fsm.reset_mode = "async"
            else:
                if inferred_reset:
                    self.fsm.reset_signal_name = inferred_reset
                    self.fsm.reset_mode = "sync" if self._always_uses_reset_condition(item, inferred_reset) else "none"
                else:
                    self.fsm.reset_mode = "none"
            return

        if inferred_clock:
            self.fsm.clock_signal_name = inferred_clock
        if inferred_reset:
            self.fsm.reset_signal_name = inferred_reset
            self.fsm.reset_mode = "sync"
        else:
            self.fsm.reset_mode = "none"

    def _always_uses_reset_condition(self, always_item, reset_name):
        root_if = self._root_if_statement(always_item)
        if root_if is None:
            return False
        identifiers = {self._name(node) for node in find_nodes(root_if.cond, Identifier)}
        return reset_name in identifiers

    def _root_if_statement(self, always_item):
        statement = getattr(always_item, "statement", None)
        if isinstance(statement, IfStatement):
            return statement
        if isinstance(statement, Block):
            for child in statement.statements or []:
                if isinstance(child, IfStatement):
                    return child
        return None

    def _infer_clock_reset_from_inputs(self):
        inputs = [signal.name for signal in self.fsm.signals.values() if signal.direction == "input"]
        clock_name = next((name for name in inputs if "clk" in name.lower()), None)
        reset_name = next(
            (name for name in inputs if "rst" in name.lower() or "reset" in name.lower()),
            None,
        )
        return clock_name, reset_name

    def _module_ports(self, module):
        portlist = getattr(module, "portlist", None)
        if not portlist or not getattr(portlist, "ports", None):
            return []

        names = []
        for port in portlist.ports:
            if isinstance(port, Ioport):
                name = self._name(getattr(port, "first", None))
                if name:
                    names.append(name)
                continue

            name = self._name(getattr(port, "name", None)) or self._name(port)
            if name:
                names.append(name)

        return names

    def _is_fsm_item(self, item, state_names):
        if isinstance(item, Always):
            return self._always_contains_fsm_logic(item)

        if isinstance(item, InstanceList):
            return True

        if isinstance(item, Decl):
            declared = {self._name(child) for child in item.list if self._name(child)}
            signal_names = set(self.fsm.signals.keys())
            fsm_names = set(state_names) | {self.state_var, self.next_state_var} | signal_names
            return bool(declared & {name for name in fsm_names if name})

        if isinstance(item, Localparam):
            return self._name(item.name) in state_names

        if isinstance(item, Assign):
            left = self._name(item.left)
            return left in self.fsm.signals and self.fsm.signals[left].direction == "wire"

        return False

    def _always_contains_fsm_logic(self, item):
        assignments = find_nodes(item, (BlockingSubstitution, NonblockingSubstitution))
        for assign in assignments:
            left = self._name(assign.left)
            if left in {self.state_var, self.next_state_var}:
                return True

        cases = find_nodes(item, CaseStatement)
        return any(self._name(case.comp) == self.state_var for case in cases)

    def _assess_regeneration_safety(self):
        self.fsm.imported_from_verilog = True
        self.fsm.import_fsm_blocks = self._count_fsm_always_blocks()
        self.fsm.import_block_roles = self._collect_fsm_block_roles()
        self.fsm.import_internal_action_targets = self._collect_internal_action_targets()

        if self.next_state_var is None:
            self.fsm.import_style = "single_process"
            self.fsm.regeneration_warning = (
                "Импортированный автомат использует однопроцессный стиль. Повторная генерация "
                "выполняется в нормализованной однопроцессной форме на основе извлеченных reset-действий, "
                "действий состояний и переходов."
            )
            return

        self.fsm.import_style = "two_process" if self.fsm.import_fsm_blocks >= 2 else "hybrid"

        modules = find_nodes(self.ast, ModuleDef)
        if not modules:
            return

        module = modules[0]
        for item in module.items or []:
            if not isinstance(item, Always):
                continue
            if not self._always_contains_fsm_logic(item):
                continue
            role = self._classify_fsm_block(item)
            if role == "mixed_fsm_datapath":
                self.fsm.import_has_mixed_datapath = True
                self.fsm.safe_to_regenerate = False
                self.fsm.regeneration_warning = (
                    "Импортированный автомат смешивает логику переходов состояний и datapath-присваивания "
                    "в одном procedural-блоке. Возврат исходного HDL без изменений поддерживается, "
                    "но безопасная повторная генерация после редактирования FSM отключена."
                )
                return

        if self.fsm.import_internal_action_targets:
            targets = ", ".join(self.fsm.import_internal_action_targets)
            if self._supports_sequential_datapath_regeneration():
                self.fsm.safe_to_regenerate = True
                self.fsm.regeneration_warning = (
                    "Логика действий импортированного автомата записывает внутренние сигналы или регистры "
                    f"({targets}). Безопасная повторная генерация включена в нормализованной форме, "
                    "поскольку модуль использует раздельные блоки регистра состояния, логики следующего состояния "
                    "и операционной логики."
                )
            else:
                self.fsm.safe_to_regenerate = False
                self.fsm.regeneration_warning = (
                    "Логика действий импортированного автомата записывает внутренние сигналы или регистры "
                    f"({targets}). Возврат исходного HDL без изменений поддерживается, "
                    "но безопасная повторная генерация после редактирования FSM отключена, "
                    "поскольку восстановление семантики datapath только по действиям автомата недостаточно надежно."
                )

    def _supports_sequential_datapath_regeneration(self):
        roles = set(self.fsm.import_block_roles)
        if self.fsm.import_has_mixed_datapath:
            return False
        if self.fsm.import_style == "single_process":
            return False
        return (
            "state_register" in roles
            and "next_state_logic" in roles
            and ("datapath_logic" in roles or "single_process_output_logic" in roles or "output_logic" in roles)
        )

    def _assign_action_domains(self):
        if self.fsm.import_style == "single_process":
            for state in self.fsm.states.values():
                state.action_domain = "seq"
            for transition in self.fsm.transitions:
                transition.action_domain = "seq"
            return

        sequential_domains = self._supports_sequential_datapath_regeneration()
        action_domain = "seq" if sequential_domains else "comb"

        for state in self.fsm.states.values():
            if state.actions:
                state.action_domain = action_domain

        for transition in self.fsm.transitions:
            if transition.actions:
                transition.action_domain = action_domain

    def _count_fsm_always_blocks(self):
        modules = find_nodes(self.ast, ModuleDef)
        if not modules:
            return 0

        module = modules[0]
        return sum(
            1
            for item in module.items or []
            if isinstance(item, Always) and self._always_contains_fsm_logic(item)
        )

    def _collect_internal_action_targets(self):
        targets = set()

        def extract_target(action: str):
            if "<=" in action:
                return action.split("<=", maxsplit=1)[0].strip()
            if "=" in action:
                return action.split("=", maxsplit=1)[0].strip()
            return ""

        for state in self.fsm.states.values():
            for action in state.actions:
                target = extract_target(action)
                signal = self.fsm.signals.get(target)
                if signal and signal.direction != "output":
                    targets.add(target)

        for transition in self.fsm.transitions:
            for action in transition.actions:
                target = extract_target(action)
                signal = self.fsm.signals.get(target)
                if signal and signal.direction != "output":
                    targets.add(target)

        return sorted(targets)

    def _always_mixes_fsm_and_datapath(self, item):
        return self._classify_fsm_block(item) == "mixed_fsm_datapath"

    def _is_internal_datapath_target(self, signal_name):
        signal = self.fsm.signals.get(signal_name)
        if signal is None:
            return True
        return signal.direction != "output"

    def _collect_fsm_block_roles(self):
        modules = find_nodes(self.ast, ModuleDef)
        if not modules:
            return []

        module = modules[0]
        roles = []
        for item in module.items or []:
            if not isinstance(item, Always):
                continue
            if not self._always_contains_fsm_logic(item):
                continue
            roles.append(self._classify_fsm_block(item))
        return roles

    def _classify_fsm_block(self, item):
        writes_state = False
        writes_next_state = False
        internal_targets = set()
        output_targets = set()

        for assign in find_nodes(item, (BlockingSubstitution, NonblockingSubstitution)):
            left = self._name(assign.left)
            if not left:
                continue
            if left == self.state_var:
                writes_state = True
                continue
            if self.next_state_var and left == self.next_state_var:
                writes_next_state = True
                continue
            if self._is_internal_datapath_target(left):
                internal_targets.add(left)
            else:
                output_targets.add(left)

        if writes_state and internal_targets:
            return "mixed_fsm_datapath"
        if writes_next_state and not writes_state and not internal_targets:
            return "next_state_logic"
        if writes_state and not writes_next_state and not internal_targets:
            return "state_register" if not output_targets else "single_process_output_logic"
        if output_targets and not writes_state and not writes_next_state and not internal_targets:
            return "output_logic"
        if internal_targets and not writes_state and not writes_next_state:
            return "datapath_logic"
        return "fsm_aux"

    def _expr(self, node):
        if isinstance(node, Rvalue):
            return self._expr(node.var)
        return self.codegen.visit(node)

    def _case_labels(self, item):
        labels = getattr(item, "cond", None)
        if labels is None:
            labels = getattr(item, "label", None)

        if labels is None:
            return []
        if not isinstance(labels, (list, tuple)):
            labels = [labels]

        return [self._name(label) for label in labels if self._name(label)]
