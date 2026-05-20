function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

const SUPPORTED_EXPRESSION_OPERATORS = new Set([
  "&",
  "|",
  "^",
  "+",
  "-",
  "*",
  "/",
  "%",
  "<<",
  ">>",
  "&&",
  "||",
  "==",
  "!=",
  "<",
  "<=",
  ">",
  ">=",
]);

export function zeroLiteral(width = 1) {
  return width > 1 ? `${width}'d0` : "1'b0";
}

export function oneLiteral(width = 1) {
  if (width > 1) {
    return `${width}'b${"1".repeat(width)}`;
  }

  return "1'b1";
}

export function maxUnsignedValue(width = 1) {
  return (2 ** Math.max(1, width)) - 1;
}

function padBinary(value, width) {
  return value.toString(2).padStart(Math.max(1, width), "0");
}

export function formatConstValue(value, width = 1, numberDisplayMode = "decimal") {
  const numericValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  if (numberDisplayMode === "binary") {
    return `${Math.max(1, width)}'b${padBinary(numericValue, width)}`;
  }
  return `${Math.max(1, width)}'d${numericValue}`;
}

export function formatConstInputValue(value, width = 1, numberDisplayMode = "decimal") {
  const numericValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  if (numberDisplayMode === "binary") {
    return padBinary(numericValue, width);
  }
  return String(numericValue);
}

export function validateConstInput(input, width = 1, numberDisplayMode = "decimal") {
  const normalized = normalizeText(input).replaceAll("_", "");
  if (!normalized) {
    return { ok: false, error: "Введите константу." };
  }

  const maxValue = maxUnsignedValue(width);

  if (numberDisplayMode === "binary") {
    if (!/^[01]+$/.test(normalized)) {
      return { ok: false, error: "Для двоичного режима допустимы только символы 0 и 1." };
    }

    if (normalized.length > Math.max(1, width)) {
      return {
        ok: false,
        error: `Для разрядности ${width} допустимо не более ${Math.max(1, width)} двоичных разрядов.`,
      };
    }

    const value = Number.parseInt(normalized, 2);
    if (value > maxValue) {
      return {
        ok: false,
        error: `Значение выходит за диапазон 0..${maxValue}.`,
      };
    }

    return { ok: true, value };
  }

  if (!/^\d+$/.test(normalized)) {
    return { ok: false, error: "Для десятичного режима допустимы только цифры 0-9." };
  }

  const value = Number.parseInt(normalized, 10);
  if (value > maxValue) {
    return {
      ok: false,
      error: `Для разрядности ${width} допустим диапазон 0..${maxValue}.`,
    };
  }

  return { ok: true, value };
}

export function getSignalWidth(signals, signalName) {
  const signal = signals.find((item) => item.name === signalName);
  return signal?.width ?? 1;
}

export function getReadableSignals(signals) {
  return signals.map((signal) => signal.name);
}

export function getAssignableSignals(signals) {
  return signals
    .filter((signal) => ["output", "output_reg", "reg"].includes(signal.direction))
    .map((signal) => signal.name);
}

export function getInstanceOutputBindableSignals(signals) {
  return signals
    .filter((signal) => signal.direction === "wire" || signal.direction === "output")
    .map((signal) => signal.name);
}

export function getDirectionDescription(direction) {
  if (direction === "input") {
    return "Входной порт. Настраиваются только имя и разрядность шины.";
  }

  if (direction === "output") {
    return "Выходной порт. Его можно использовать в действиях состояний и переходов; при процедурном присваивании генератор выпустит такой сигнал как `output reg`.";
  }

  if (direction === "output_reg") {
    return "Выходной порт-регистр. Может изменяться в действиях состояний, переходов и в reset-логике.";
  }

  if (direction === "reg") {
    return "Внутренний регистр хранения. Может изменяться в действиях состояния и перехода.";
  }

  return "Внутренний комбинационный сигнал. Задается как выражение от других сигналов.";
}

export function parseDefaultMode(signal) {
  const width = signal?.width ?? 1;
  const normalized = normalizeText(signal?.default);

  if (!normalized) {
    return "auto";
  }

  if (normalized === zeroLiteral(width) || normalized === "0") {
    return "zero";
  }

  if (normalized === oneLiteral(width) || normalized === "1") {
    return "one";
  }

  return "auto";
}

export function buildSignalDefaultValue(direction, width, defaultMode) {
  if (direction !== "output_reg") {
    return "";
  }

  if (defaultMode === "one") {
    return oneLiteral(width);
  }

  if (defaultMode === "zero") {
    return zeroLiteral(width);
  }

  return "";
}

export function createEmptyExpressionDraft(readableSignals) {
  return {
    mode: "structured",
    raw: "",
    terms: [
      {
        kind: "signal",
        signal: readableSignals[0] ?? "",
        constValue: 0,
        unary: "none",
      },
    ],
    operators: [],
  };
}

export function createExpressionTerm(readableSignals) {
  return {
    kind: "signal",
    signal: readableSignals[0] ?? "",
    constValue: 0,
    unary: "none",
  };
}

function normalizeConstValue(value, width) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return 0;
  }

  if (/^\d+$/.test(normalized)) {
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const decimalMatch = normalized.match(/^(\d+)?'d(\d+)$/i);
  if (decimalMatch) {
    return Number.parseInt(decimalMatch[2], 10);
  }

  const binaryMatch = normalized.match(/^(\d+)?'b([01_]+)$/i);
  if (binaryMatch) {
    return Number.parseInt(binaryMatch[2].replaceAll("_", ""), 2);
  }

  const hexMatch = normalized.match(/^(\d+)?'h([0-9a-fA-F_]+)$/i);
  if (hexMatch) {
    return Number.parseInt(hexMatch[2].replaceAll("_", ""), 16);
  }

  if (normalized === "'0") {
    return 0;
  }

  if (normalized === "'1") {
    return maxUnsignedValue(width);
  }

  if (normalized === zeroLiteral(width)) {
    return 0;
  }

  if (normalized === oneLiteral(width)) {
    return maxUnsignedValue(width);
  }

  return 0;
}

function serializeExpressionTerm(term, width, numberDisplayMode = "decimal") {
  const baseValue = term.kind === "signal"
    ? term.signal
    : formatConstValue(term.constValue ?? 0, width, numberDisplayMode);

  if (!baseValue) {
    return "";
  }

  if (!term.unary || term.unary === "none") {
    return baseValue;
  }

  return `${term.unary}${baseValue}`;
}

export function serializeExpressionDraft(draft, signals, width = 1, numberDisplayMode = "decimal") {
  if (draft?.mode === "raw") {
    return normalizeText(draft.raw);
  }

  if (!draft?.terms?.length) {
    return "";
  }

  const parts = [];
  for (let index = 0; index < draft.terms.length; index += 1) {
    const term = draft.terms[index];
    const renderedTerm = serializeExpressionTerm(term, width, numberDisplayMode);
    if (!renderedTerm) {
      return "";
    }

    if (index > 0) {
      const operator = draft.operators[index - 1];
      if (!operator) {
        return "";
      }
      parts.push(operator);
    }

    parts.push(renderedTerm);
  }

  return parts.join(" ");
}

function parseExpressionToken(token, readableSignals, width) {
  const normalized = normalizeText(token);
  if (!normalized) {
    return null;
  }

  const unary = normalized.startsWith("~")
    ? "~"
    : normalized.startsWith("!")
      ? "!"
      : "none";
  const baseToken = unary === "none" ? normalized : normalized.slice(1);

  if (readableSignals.includes(baseToken)) {
      return {
        kind: "signal",
        signal: baseToken,
        constValue: 0,
        unary,
      };
  }

  if (/^\d+$/.test(baseToken) || /^(\d+)?'[bdh][0-9A-Fa-f_xzXZ]+$/i.test(baseToken) || ["'0", "'1"].includes(baseToken)) {
    return {
      kind: "const",
      signal: readableSignals[0] ?? "",
      constValue: normalizeConstValue(baseToken, width),
      unary,
    };
  }

  return null;
}

export function parseExpressionString(expression, signals, width = 1) {
  let normalized = normalizeText(expression);
  const readableSignals = getReadableSignals(signals);

  if (!normalized) {
    return createEmptyExpressionDraft(readableSignals);
  }

  while (hasWrappingParentheses(normalized)) {
    normalized = normalizeText(normalized.slice(1, -1));
  }

  const tokens = normalized.match(
    /[!~]?[A-Za-z_][A-Za-z0-9_$]*|[!~]?(?:\d+'[bdh][0-9A-Fa-f_xzXZ]+|'0|'1|0|1)|<<|>>|<=|>=|==|!=|&&|\|\||[&|^+\-*/%<>]/g,
  );
  if (!tokens || tokens.join("").replace(/\s+/g, "") !== normalized.replace(/\s+/g, "")) {
    return {
      mode: "raw",
      raw: normalized,
      terms: [createExpressionTerm(readableSignals)],
      operators: [],
    };
  }

  const draft = {
    mode: "structured",
    raw: "",
    terms: [],
    operators: [],
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (index % 2 === 0) {
      const term = parseExpressionToken(token, readableSignals, width);
      if (!term) {
        return {
          mode: "raw",
          raw: normalized,
          terms: [createExpressionTerm(readableSignals)],
          operators: [],
        };
      }
      draft.terms.push(term);
    } else if (SUPPORTED_EXPRESSION_OPERATORS.has(token)) {
      draft.operators.push(token);
    } else {
      return {
        mode: "raw",
        raw: normalized,
        terms: [createExpressionTerm(readableSignals)],
        operators: [],
      };
    }
  }

  if (draft.terms.length !== draft.operators.length + 1) {
    return {
      mode: "raw",
      raw: normalized,
      terms: [createExpressionTerm(readableSignals)],
      operators: [],
    };
  }

  return draft;
}

export function createEmptyActionDraft(assignableSignals, readableSignals) {
  return {
    kind: "assignment",
    target: assignableSignals[0] ?? "",
    assignment: "=",
    expression: createEmptyExpressionDraft(readableSignals),
  };
}

export function createEmptyConditionalActionDraft(readableSignals, assignableSignals) {
  return {
    kind: "conditional",
    condition: createEmptyConditionDraft(readableSignals),
    thenActions: [createEmptyActionDraft(assignableSignals, readableSignals)],
    elseActions: [],
  };
}

export function serializeActionDraft(draft, signals, numberDisplayMode = "decimal") {
  if (draft?.kind === "conditional") {
    const condition = serializeConditionDraft(draft.condition, signals);
    const thenBranch = serializeActionBranch(draft.thenActions, signals, 1, numberDisplayMode);
    const elseBranch = serializeActionBranch(draft.elseActions, signals, 1, numberDisplayMode);
    const body = [
      `if (${condition}) begin`,
      thenBranch || "  ;",
      "}__END__",
    ];

    if (elseBranch) {
      body.push("else begin", elseBranch, "}__END__");
    }

    return body.join("\n").replaceAll("}__END__", "end");
  }

  if (!draft?.target) {
    return "";
  }

  const rhs = serializeExpressionDraft(
    draft.expression,
    signals,
    getSignalWidth(signals, draft.target),
    numberDisplayMode,
  );

  return rhs ? `${draft.target} ${draft.assignment ?? "="} ${rhs};` : "";
}

function serializeActionBranch(actions, signals, indentLevel, numberDisplayMode = "decimal") {
  const indent = "  ".repeat(indentLevel);
  return actions
    .map((action) => serializeActionDraft(action, signals, numberDisplayMode))
    .filter(Boolean)
    .map((action) =>
      action
        .split("\n")
        .map((line) => `${indent}${line}`)
        .join("\n"))
    .join("\n");
}

export function parseActionString(action, signals) {
  const normalized = normalizeText(action).replace(/;$/, "");
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("if")) {
    return parseConditionalActionString(normalized, signals);
  }

  const assignment = normalized.match(/^([A-Za-z_][A-Za-z0-9_$]*)\s*(<=|=)\s*(.+)$/);
  if (!assignment) {
    return null;
  }

  const [, target, operator, rhs] = assignment;
  const expression = parseExpressionString(rhs, signals, getSignalWidth(signals, target));
  if (!expression) {
    return null;
  }

  return {
    kind: "assignment",
    target,
    assignment: operator,
    expression,
  };
}

function parseConditionalActionString(text, signals) {
  const conditionMatch = text.match(/^if\s*\(([\s\S]+?)\)\s*begin\b/);
  if (!conditionMatch) {
    return null;
  }

  const condition = parseConditionString(conditionMatch[1], signals);
  if (!condition) {
    return null;
  }

  const beginIndex = text.indexOf("begin", conditionMatch[0].length - "begin".length);
  const thenBlock = extractBeginEndBlock(text, beginIndex);
  if (!thenBlock) {
    return null;
  }

  const thenActions = parseActionBranch(thenBlock.body, signals);
  if (thenActions === null) {
    return null;
  }

  const remaining = normalizeText(text.slice(thenBlock.nextIndex));
  if (!remaining) {
    return {
      kind: "conditional",
      condition,
      thenActions,
      elseActions: [],
    };
  }

  if (!remaining.startsWith("else")) {
    return null;
  }

  const elseBegin = remaining.indexOf("begin");
  if (elseBegin === -1) {
    return null;
  }

  const elseBlock = extractBeginEndBlock(remaining, elseBegin);
  if (!elseBlock || normalizeText(remaining.slice(elseBlock.nextIndex))) {
    return null;
  }

  const elseActions = parseActionBranch(elseBlock.body, signals);
  if (elseActions === null) {
    return null;
  }

  return {
    kind: "conditional",
    condition,
    thenActions,
    elseActions,
  };
}

function extractBeginEndBlock(text, beginWordIndex) {
  const blockStart = beginWordIndex + "begin".length;
  const matcher = /\bbegin\b|\bend\b/g;
  matcher.lastIndex = blockStart;
  let depth = 1;
  let match;

  while ((match = matcher.exec(text))) {
    if (match[0] === "begin") {
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0) {
        return {
          body: text.slice(blockStart, match.index),
          nextIndex: matcher.lastIndex,
        };
      }
    }
  }

  return null;
}

function parseActionBranch(text, signals) {
  const actions = [];
  let cursor = 0;

  while (cursor < text.length) {
    while (cursor < text.length && /\s/.test(text[cursor])) {
      cursor += 1;
    }

    if (cursor >= text.length) {
      break;
    }

    if (text.slice(cursor).startsWith("if")) {
      const conditional = parseConditionalActionWithLength(text.slice(cursor), signals);
      if (!conditional) {
        return null;
      }
      actions.push(conditional.action);
      cursor += conditional.length;
      continue;
    }

    const semicolonIndex = text.indexOf(";", cursor);
    if (semicolonIndex === -1) {
      return null;
    }

    const rawAction = text.slice(cursor, semicolonIndex + 1);
    const parsed = parseActionString(rawAction, signals);
    if (!parsed) {
      return null;
    }
    actions.push(parsed);
    cursor = semicolonIndex + 1;
  }

  return actions;
}

function parseConditionalActionWithLength(text, signals) {
  const conditionMatch = text.match(/^if\s*\(([\s\S]+?)\)\s*begin\b/);
  if (!conditionMatch) {
    return null;
  }
  const beginIndex = text.indexOf("begin", conditionMatch[0].length - "begin".length);
  const thenBlock = extractBeginEndBlock(text, beginIndex);
  if (!thenBlock) {
    return null;
  }

  let consumed = thenBlock.nextIndex;
  let tail = text.slice(consumed);
  const trimmedTail = tail.trimStart();
  const leadingWhitespace = tail.length - trimmedTail.length;
  tail = trimmedTail;

  if (tail.startsWith("else")) {
    const elseBegin = tail.indexOf("begin");
    if (elseBegin === -1) {
      return null;
    }
    const elseBlock = extractBeginEndBlock(tail, elseBegin);
    if (!elseBlock) {
      return null;
    }
    consumed += leadingWhitespace + elseBlock.nextIndex;
  }

  return {
    action: parseConditionalActionString(text.slice(0, consumed), signals),
    length: consumed,
  };
}

export function createEmptyConditionDraft(readableSignals) {
  return {
    mode: "always",
    joiner: "&&",
    raw: "",
    clauses: [createConditionLeaf(readableSignals)],
  };
}

export function serializeConditionDraft(draft, signals) {
  if (!draft || draft.mode === "always") {
    return "1";
  }

  if (draft.mode === "raw") {
    return normalizeText(draft.raw) || "1";
  }

  const rendered = draft.clauses
    .map((clause) => serializeConditionNode(clause, signals, false))
    .filter(Boolean);

  if (rendered.length === 0) {
    return "1";
  }

  return rendered.join(` ${draft.joiner} `);
}

export function createConditionLeaf(readableSignals) {
  return {
    type: "leaf",
    mode: "simple",
    left: readableSignals[0] ?? "",
    comparator: "is1",
    rightType: "const",
    rightSignal: readableSignals[0] ?? "",
    rightConst: "zero",
    expressionDraft: createEmptyExpressionDraft(readableSignals),
  };
}

export function createConditionGroup(readableSignals) {
  return {
    type: "group",
    joiner: "&&",
    clauses: [createConditionLeaf(readableSignals)],
  };
}

function serializeConditionNode(node, signals, nested = false) {
  if (!node) {
    return "";
  }

  if (node.type === "group") {
    const rendered = (node.clauses ?? [])
      .map((clause) => serializeConditionNode(clause, signals, true))
      .filter(Boolean);

    if (rendered.length === 0) {
      return "";
    }

    const joined = rendered.join(` ${node.joiner ?? "&&"} `);
    return nested && rendered.length > 1 ? `(${joined})` : joined;
  }

  return serializeConditionClause(node, signals);
}

function serializeConditionClause(clause, signals) {
  if (clause.mode === "expression") {
    return serializeExpressionDraft(clause.expressionDraft, signals, 1);
  }

  if (!clause.left) {
    return "";
  }

  if (clause.comparator === "is1") {
    return clause.left;
  }

  if (clause.comparator === "is0") {
    return `!${clause.left}`;
  }

  const right = clause.rightType === "signal"
    ? clause.rightSignal
    : clause.rightConst === "one"
      ? oneLiteral(getSignalWidth(signals, clause.left))
      : zeroLiteral(getSignalWidth(signals, clause.left));

  if (!right) {
    return "";
  }

  return `${clause.left} ${clause.comparator} ${right}`;
}

function hasWrappingParentheses(text) {
  if (!text.startsWith("(") || !text.endsWith(")")) {
    return false;
  }

  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0 && index !== text.length - 1) {
        return false;
      }
    }
  }

  return depth === 0;
}

function stripWrappingParentheses(text) {
  let current = normalizeText(text);
  while (hasWrappingParentheses(current)) {
    current = normalizeText(current.slice(1, -1));
  }
  return current;
}

function splitTopLevelClauses(text, operator) {
  const delimiter = operator === "||" ? "||" : "&&";
  const parts = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (depth === 0 && text.slice(index, index + delimiter.length) === delimiter) {
      parts.push(normalizeText(text.slice(start, index)));
      start = index + delimiter.length;
      index += delimiter.length - 1;
    }
  }

  parts.push(normalizeText(text.slice(start)));
  return parts.filter(Boolean);
}

function detectTopLevelJoiner(text) {
  let depth = 0;
  for (let index = 0; index < text.length - 1; index += 1) {
    const char = text[index];
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0) {
      const pair = text.slice(index, index + 2);
      if (pair === "||") {
        return "||";
      }
      if (pair === "&&") {
        return "&&";
      }
    }
  }
  return null;
}

function invertComparator(comparator) {
  const mapping = {
    "==": "!=",
    "!=": "==",
    "<": ">=",
    "<=": ">",
    ">": "<=",
    ">=": "<",
  };
  return mapping[comparator] ?? null;
}

export function parseConditionString(condition, signals) {
  const normalized = normalizeText(condition);
  if (!normalized || ["1", "1'b1", "true", "True"].includes(normalized)) {
    return createEmptyConditionDraft(getReadableSignals(signals));
  }

  const parsed = parseConditionNode(normalized, signals);
  if (parsed === null) {
    return {
      mode: "raw",
      joiner: "&&",
      raw: normalized,
      clauses: [createConditionLeaf(getReadableSignals(signals))],
    };
  }

  if (parsed.type === "group") {
    return {
      mode: "clauses",
      joiner: parsed.joiner ?? "&&",
      raw: "",
      clauses: parsed.clauses ?? [createConditionLeaf(getReadableSignals(signals))],
    };
  }

  return {
    mode: "clauses",
    joiner: "&&",
    raw: "",
    clauses: [parsed],
  };
}

function parseConditionNode(text, signals) {
  const clause = stripWrappingParentheses(text);
  const joiner = detectTopLevelJoiner(clause);
  if (joiner) {
    const parts = splitTopLevelClauses(clause, joiner);
    const children = parts.map((part) => parseConditionNode(part, signals));
    if (children.some((item) => item === null)) {
      return null;
    }
    return {
      type: "group",
      joiner,
      clauses: children,
    };
  }

  return parseConditionClause(clause, signals);
}

function parseConditionClause(text, signals) {
  const clause = stripWrappingParentheses(text);

  const negatedWrappedComparison = clause.match(
    /^!\((.+)\)$/,
  );
  if (negatedWrappedComparison) {
    const inner = stripWrappingParentheses(negatedWrappedComparison[1]);
    const parsedInner = parseConditionClause(inner, signals);
    if (parsedInner?.comparator === "is1") {
      return { ...parsedInner, comparator: "is0" };
    }
    if (parsedInner?.comparator === "is0") {
      return { ...parsedInner, comparator: "is1" };
    }
    if (parsedInner) {
      const inverted = invertComparator(parsedInner.comparator);
      if (inverted) {
        return {
          ...parsedInner,
          comparator: inverted,
        };
      }
    }
  }

  const negated = clause.match(/^!([A-Za-z_][A-Za-z0-9_$]*)$/);
  if (negated) {
    return {
      type: "leaf",
      mode: "simple",
      left: negated[1],
      comparator: "is0",
      rightType: "const",
      rightSignal: signals[0]?.name ?? "",
      rightConst: "zero",
      expressionDraft: createEmptyExpressionDraft(getReadableSignals(signals)),
    };
  }

  if (/^[A-Za-z_][A-Za-z0-9_$]*$/.test(clause)) {
    return {
      type: "leaf",
      mode: "simple",
      left: clause,
      comparator: "is1",
      rightType: "const",
      rightSignal: signals[0]?.name ?? "",
      rightConst: "zero",
      expressionDraft: createEmptyExpressionDraft(getReadableSignals(signals)),
    };
  }

  const comparison = clause.match(
    /^([A-Za-z_][A-Za-z0-9_$]*)\s*(==|!=|<|<=|>|>=)\s*([A-Za-z_][A-Za-z0-9_$]*|(?:\d+'[bdh][0-9A-Fa-f_xzXZ]+)|[01]|'0|'1)$/,
  );
  if (!comparison) {
    return {
      type: "leaf",
      mode: "expression",
      left: signals[0]?.name ?? "",
      comparator: "is1",
      rightType: "const",
      rightSignal: signals[0]?.name ?? "",
      rightConst: "zero",
      expressionDraft: parseExpressionString(clause, signals, 1),
    };
  }

  const [, left, comparator, right] = comparison;
  const signalNames = new Set(signals.map((signal) => signal.name));

  if (signalNames.has(right)) {
    return {
      type: "leaf",
      mode: "simple",
      left,
      comparator,
      rightType: "signal",
      rightSignal: right,
      rightConst: "zero",
      expressionDraft: createEmptyExpressionDraft(getReadableSignals(signals)),
    };
  }

  return {
    type: "leaf",
    mode: "simple",
    left,
    comparator,
    rightType: "const",
    rightSignal: signals[0]?.name ?? "",
    rightConst: normalizeConstValue(right, getSignalWidth(signals, left)),
    expressionDraft: createEmptyExpressionDraft(getReadableSignals(signals)),
  };
}
