/**
 * @typedef {{ x: number, y: number }} FSMPosition
 * @typedef {{ name: string, direction: "input"|"output"|"output_reg"|"reg"|"wire", width: number, default?: string, expression?: string }} FSMSignal
 * @typedef {{ name: string, is_initial: boolean, actions: string[], action_domain?: "comb"|"seq", position: FSMPosition }} FSMState
 * @typedef {{ from_state: string, to_state: string, condition: string, actions: string[], action_domain?: "comb"|"seq" }} FSMTransition
 * @typedef {{ name: string, direction: "input"|"output"|"output_reg", width: number }} FSMExternalPort
 * @typedef {{ name: string, ports: FSMExternalPort[] }} FSMExternalModule
 * @typedef {{ name: string, module_name: string, connections: Record<string, string> }} FSMModuleInstance
 * @typedef {{
 *   signals: FSMSignal[],
 *   external_modules?: FSMExternalModule[],
 *   module_instances?: FSMModuleInstance[],
 *   states: FSMState[],
 *   transitions: FSMTransition[],
 *   reset_actions?: string[],
 *   module_name?: string,
 *   module_ports?: string[],
 *   preserved_items?: string[],
 *   generation_style?: "auto"|"single_process"|"two_process",
 *   reset_mode?: "async"|"sync"|"none",
 *   state_signal_name?: string,
 *   next_state_signal_name?: string,
 *   clock_signal_name?: string,
 *   reset_signal_name?: string,
 *   original_source?: string,
 *   import_fingerprint?: string,
 *   imported_from_verilog?: boolean,
 *   safe_to_regenerate?: boolean,
 *   regeneration_warning?: string,
 *   import_style?: string,
 *   import_has_mixed_datapath?: boolean,
 *   import_fsm_blocks?: number,
 * }} FSMDefinition
 */

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const ASSIGN_TARGET_RE = /^\s*([A-Za-z_][A-Za-z0-9_$]*)\s*(<=|=)/;
const NUMERIC_LITERAL_RE = /^\s*(\d+|\d+'[bdhoBDHO][0-9a-fA-F_xXzZ]+)\s*$/;

function normalizeActions(actions) {
  if (!Array.isArray(actions)) {
    return [];
  }

  return actions
    .map((action) => trimString(action))
    .filter(Boolean);
}

export function createSignal(signal = {}) {
  const direction = signal.direction ?? "input";
  return {
    name: trimString(signal.name),
    direction,
    width: Math.max(1, Number(signal.width) || 1),
    default: direction === "output" || direction === "output_reg"
      ? trimString(signal.default) || undefined
      : undefined,
    expression: direction === "wire" ? trimString(signal.expression) || undefined : undefined,
  };
}

export function createExternalModulePort(port = {}) {
  return {
    name: trimString(port.name),
    direction: port.direction ?? "input",
    width: Math.max(1, Number(port.width) || 1),
  };
}

export function createExternalModule(module = {}) {
  return {
    name: trimString(module.name),
    ports: Array.isArray(module.ports) ? module.ports.map(createExternalModulePort) : [],
  };
}

export function createModuleInstance(instance = {}) {
  return {
    name: trimString(instance.name),
    module_name: trimString(instance.module_name),
    connections: Object.fromEntries(
      Object.entries(instance.connections ?? {})
        .map(([portName, signalName]) => [trimString(portName), trimString(signalName)])
        .filter(([portName, signalName]) => portName && signalName),
    ),
  };
}

function collectAssignedTargets(actions = []) {
  const targets = new Set();
  for (const action of actions) {
    for (const line of String(action).split("\n")) {
      const match = line.match(ASSIGN_TARGET_RE);
      if (match) {
        targets.add(match[1]);
      }
    }
  }
  return targets;
}

export function createState(state = {}, index = 0) {
  return {
    name: trimString(state.name),
    is_initial: Boolean(state.is_initial),
    actions: normalizeActions(state.actions),
    action_domain: state.action_domain === "seq" ? "seq" : "comb",
    position: state.position ?? {
      x: 80 + (index % 3) * 180,
      y: 80 + Math.floor(index / 3) * 140,
    },
  };
}

export function createTransition(transition = {}) {
  return {
    from_state: trimString(transition.from_state),
    to_state: trimString(transition.to_state),
    condition: trimString(transition.condition) || "1",
    actions: normalizeActions(transition.actions),
    action_domain: transition.action_domain === "seq" ? "seq" : "comb",
  };
}

export function createFSM(fsm = {}) {
  const assignedTargets = new Set([
    ...collectAssignedTargets(fsm.reset_actions),
    ...(Array.isArray(fsm.states)
      ? fsm.states.flatMap((state) => [...collectAssignedTargets(state.actions)])
      : []),
    ...(Array.isArray(fsm.transitions)
      ? fsm.transitions.flatMap((transition) => [...collectAssignedTargets(transition.actions)])
      : []),
  ]);

  const states = Array.isArray(fsm.states)
    ? fsm.states.map((state, index) => createState(state, index))
    : [];

  const normalizedStates = states.some((state) => state.is_initial)
    ? states
    : states.map((state, index) => ({
        ...state,
        is_initial: index === 0,
      }));

  return {
    signals: Array.isArray(fsm.signals)
      ? fsm.signals.map((signal) => {
        const normalized = createSignal(signal);
        if (
          normalized.direction === "output"
          && (normalized.default !== undefined || assignedTargets.has(normalized.name))
        ) {
          return {
            ...normalized,
            direction: "output_reg",
          };
        }
        return normalized;
      })
      : [],
    external_modules: Array.isArray(fsm.external_modules)
      ? fsm.external_modules.map(createExternalModule)
      : [],
    module_instances: Array.isArray(fsm.module_instances)
      ? fsm.module_instances.map(createModuleInstance)
      : [],
    states: normalizedStates,
    transitions: Array.isArray(fsm.transitions) ? fsm.transitions.map(createTransition) : [],
    reset_actions: Array.isArray(fsm.reset_actions)
      ? fsm.reset_actions.map(trimString).filter(Boolean)
      : [],
    module_name: trimString(fsm.module_name) || "fsm_module",
    module_ports: Array.isArray(fsm.module_ports) ? fsm.module_ports.map(trimString).filter(Boolean) : [],
    preserved_items: Array.isArray(fsm.preserved_items)
      ? fsm.preserved_items.map(trimString).filter(Boolean)
      : [],
    generation_style: ["single_process", "two_process"].includes(fsm.generation_style)
      ? fsm.generation_style
      : "auto",
    reset_mode: ["sync", "none"].includes(fsm.reset_mode) ? fsm.reset_mode : "async",
    state_signal_name: trimString(fsm.state_signal_name) || "state",
    next_state_signal_name: trimString(fsm.next_state_signal_name) || "next_state",
    clock_signal_name: trimString(fsm.clock_signal_name) || "clk",
    reset_signal_name: trimString(fsm.reset_signal_name) || "reset",
    original_source: trimString(fsm.original_source) || undefined,
    import_fingerprint: trimString(fsm.import_fingerprint) || undefined,
    imported_from_verilog: Boolean(fsm.imported_from_verilog),
    safe_to_regenerate: fsm.safe_to_regenerate ?? true,
    regeneration_warning: trimString(fsm.regeneration_warning) || undefined,
    import_style: trimString(fsm.import_style) || "native",
    import_has_mixed_datapath: Boolean(fsm.import_has_mixed_datapath),
    import_fsm_blocks: Number(fsm.import_fsm_blocks) || 0,
  };
}

export function serializeFSM(fsm) {
  const normalized = createFSM(fsm);

  return {
    signals: normalized.signals.map((signal) => ({
      name: signal.name,
      direction: signal.direction,
      width: signal.width,
      default: signal.default,
      expression: signal.expression,
    })),
    external_modules: normalized.external_modules.map((module) => ({
      name: module.name,
      ports: module.ports.map((port) => ({
        name: port.name,
        direction: port.direction,
        width: port.width,
      })),
    })),
    module_instances: normalized.module_instances.map((instance) => ({
      name: instance.name,
      module_name: instance.module_name,
      connections: instance.connections,
    })),
    states: normalized.states.map((state) => ({
      name: state.name,
      is_initial: state.is_initial,
      actions: state.actions,
      action_domain: state.action_domain,
    })),
    transitions: normalized.transitions.map((transition) => ({
      from_state: transition.from_state,
      to_state: transition.to_state,
      condition: transition.condition,
      actions: transition.actions,
      action_domain: transition.action_domain,
    })),
    reset_actions: normalized.reset_actions,
    module_name: normalized.module_name,
    module_ports: normalized.module_ports,
    preserved_items: normalized.preserved_items,
    generation_style: normalized.generation_style,
    reset_mode: normalized.reset_mode,
    state_signal_name: normalized.state_signal_name,
    next_state_signal_name: normalized.next_state_signal_name,
    clock_signal_name: normalized.clock_signal_name,
    reset_signal_name: normalized.reset_signal_name,
    original_source: normalized.original_source,
    import_fingerprint: normalized.import_fingerprint,
    imported_from_verilog: normalized.imported_from_verilog,
    safe_to_regenerate: normalized.safe_to_regenerate,
    regeneration_warning: normalized.regeneration_warning,
    import_style: normalized.import_style,
    import_has_mixed_datapath: normalized.import_has_mixed_datapath,
    import_fsm_blocks: normalized.import_fsm_blocks,
  };
}

/**
 * @param {Partial<FSMSignal>} signal
 * @param {FSMSignal[]} existingSignals
 * @param {string | null} currentName
 */
export function validateSignalDraft(signal, existingSignals, currentName = null) {
  const normalized = createSignal(signal);

  if (!normalized.name) {
    return "Имя сигнала обязательно.";
  }

  if (
    existingSignals.some(
      (item) => item.name === normalized.name && item.name !== currentName,
    )
  ) {
    return `Сигнал ${normalized.name} уже существует.`;
  }

  if (normalized.width < 1) {
    return "Разрядность сигнала должна быть не меньше 1.";
  }

  if (normalized.direction === "wire" && !normalized.expression) {
    return "Для wire обязательно задать выражение.";
  }

  if (normalized.direction !== "wire" && normalized.expression) {
    return "Выражение допускается только для wire.";
  }

  return "";
}

export function validateExternalModuleDraft(module, existingModules, currentName = null) {
  const normalized = createExternalModule(module);

  if (!normalized.name) {
    return "Имя внешнего модуля обязательно.";
  }
  if (!IDENTIFIER_RE.test(normalized.name)) {
    return "Имя внешнего модуля должно быть корректным идентификатором Verilog.";
  }
  if (existingModules.some((item) => item.name === normalized.name && item.name !== currentName)) {
    return `Внешний модуль ${normalized.name} уже существует.`;
  }
  if (normalized.ports.length === 0) {
    return "Нужно добавить хотя бы один порт внешнего модуля.";
  }

  const seen = new Set();
  for (const port of normalized.ports) {
    if (!port.name) {
      return "У каждого порта внешнего модуля должно быть имя.";
    }
    if (!IDENTIFIER_RE.test(port.name)) {
      return `Имя порта ${port.name} не является корректным идентификатором Verilog.`;
    }
    if (seen.has(port.name)) {
      return `Порт ${port.name} описан более одного раза.`;
    }
    seen.add(port.name);
  }

  return "";
}

export function validateModuleInstanceDraft(
  instance,
  externalModules,
  signals,
  existingInstances = [],
  currentName = null,
) {
  const normalized = createModuleInstance(instance);

  if (!normalized.name) {
    return "Имя экземпляра обязательно.";
  }
  if (!IDENTIFIER_RE.test(normalized.name)) {
    return "Имя экземпляра должно быть корректным идентификатором Verilog.";
  }
  if (existingInstances.some((item) => item.name === normalized.name && item.name !== currentName)) {
    return `Экземпляр ${normalized.name} уже существует.`;
  }

  if (!normalized.module_name) {
    return "Нужно выбрать внешний модуль для экземпляра.";
  }

  const module = externalModules.find((item) => item.name === normalized.module_name);
  if (!module) {
    return `Неизвестный внешний модуль ${normalized.module_name}.`;
  }

  const signalNames = new Set(signals.map((signal) => signal.name));
  for (const port of module.ports) {
    const connection = normalized.connections[port.name];
    if (!connection) {
      return `Для порта ${port.name} нужно выбрать подключение.`;
    }
    const isConst = NUMERIC_LITERAL_RE.test(connection);
    if (!signalNames.has(connection) && !isConst) {
      return `Подключение ${connection} для порта ${port.name} не является известным сигналом или числовой константой.`;
    }
    if (port.direction !== "input" && isConst) {
      return `Константу можно подключать только ко входному порту ${port.name}.`;
    }
  }

  return "";
}

/**
 * @param {string} name
 * @param {FSMState[]} existingStates
 * @param {string | null} currentName
 */
export function validateStateDraft(name, existingStates, currentName = null) {
  const normalizedName = trimString(name);

  if (!normalizedName) {
    return "Имя состояния обязательно.";
  }

  if (!IDENTIFIER_RE.test(normalizedName)) {
    return "Имя состояния должно быть корректным идентификатором Verilog: буква или _, затем буквы, цифры, _ или $.";
  }

  if (
    existingStates.some(
      (item) => item.name === normalizedName && item.name !== currentName,
    )
  ) {
    return `Состояние ${normalizedName} уже существует.`;
  }

  return "";
}

export function validateFSM(fsm) {
  const normalized = createFSM(fsm);
  const issues = [];

  if (normalized.states.length === 0) {
    issues.push("Требуется хотя бы одно состояние.");
  }

  if (normalized.states.filter((state) => state.is_initial).length !== 1) {
    issues.push("Должно быть ровно одно начальное состояние.");
  }

  for (const signal of normalized.signals) {
    if (!signal.name) {
      issues.push("У всех сигналов должны быть непустые имена.");
      break;
    }
  }

  for (const transition of normalized.transitions) {
    if (!transition.from_state || !transition.to_state) {
      issues.push("Переходы должны ссылаться и на исходное, и на целевое состояние.");
      break;
    }
  }

  return {
    normalized,
    issues,
    isValid: issues.length === 0,
  };
}

export function formatActions(text) {
  return normalizeActions(text.split("\n"));
}

/**
 * @param {Partial<FSMTransition>} transition
 * @param {FSMState[]} existingStates
 */
export function validateTransitionDraft(transition, existingStates) {
  const normalized = createTransition(transition);
  const stateNames = new Set(existingStates.map((state) => state.name));

  if (!normalized.from_state) {
    return "Для перехода обязательно указать исходное состояние.";
  }

  if (!normalized.to_state) {
    return "Для перехода обязательно указать целевое состояние.";
  }

  if (!stateNames.has(normalized.from_state)) {
    return `Неизвестное исходное состояние ${normalized.from_state}.`;
  }

  if (!stateNames.has(normalized.to_state)) {
    return `Неизвестное целевое состояние ${normalized.to_state}.`;
  }

  if (!normalized.condition) {
    return "Условие перехода обязательно.";
  }

  return "";
}
