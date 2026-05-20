import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  createConditionGroup,
  createConditionLeaf,
  createEmptyConditionDraft,
  getReadableSignals,
  parseExpressionString,
  parseConditionString,
  serializeConditionDraft,
} from "../lib/editorModel";
import ExpressionBuilder from "./ExpressionBuilder";

const COMPARATOR_OPTIONS = [
  { value: "is1", label: "равно 1" },
  { value: "is0", label: "равно 0" },
  { value: "==", label: "равно" },
  { value: "!=", label: "не равно" },
  { value: "<", label: "меньше" },
  { value: "<=", label: "меньше либо равно" },
  { value: ">", label: "больше" },
  { value: ">=", label: "больше либо равно" },
];

function needsRightOperand(comparator) {
  return !["is1", "is0"].includes(comparator);
}

export default function ConditionBuilder({ condition, fsm, onChange, onChangeDraft, valueDraft }) {
  const readableSignals = useMemo(() => getReadableSignals(fsm.signals), [fsm.signals]);
  const parsedCondition = useMemo(
    () => valueDraft ?? parseConditionString(condition, fsm.signals),
    [condition, fsm.signals, valueDraft],
  );
  const [draft, setDraft] = useState(
    () => parsedCondition ?? createEmptyConditionDraft(readableSignals),
  );

  const commitDraft = (nextDraft) => {
    setDraft(nextDraft);
    onChangeDraft?.(nextDraft);
    onChange?.(serializeConditionDraft(nextDraft, fsm.signals));
  };

  const updateNodeAtPath = (path, updater) => {
    const updateList = (nodes, depth = 0) =>
      nodes.map((node, index) => {
        if (index !== path[depth]) {
          return node;
        }
        if (depth === path.length - 1) {
          return updater(node);
        }
        if (node.type !== "group") {
          return node;
        }
        return {
          ...node,
          clauses: updateList(node.clauses ?? [], depth + 1),
        };
      });

    commitDraft({
      ...draft,
      clauses: updateList(draft.clauses),
    });
  };

  const addLeafAtPath = (path) => {
    if (path.length === 0) {
      commitDraft({
        ...draft,
        clauses: [...draft.clauses, createConditionLeaf(readableSignals)],
      });
      return;
    }

    updateNodeAtPath(path, (node) => ({
      ...node,
      clauses: [...(node.clauses ?? []), createConditionLeaf(readableSignals)],
    }));
  };

  const addGroupAtPath = (path) => {
    if (path.length === 0) {
      commitDraft({
        ...draft,
        clauses: [...draft.clauses, createConditionGroup(readableSignals)],
      });
      return;
    }

    updateNodeAtPath(path, (node) => ({
      ...node,
      clauses: [...(node.clauses ?? []), createConditionGroup(readableSignals)],
    }));
  };

  const removeNodeAtPath = (path) => {
    if (path.length === 1) {
      const nextClauses = draft.clauses.filter((_, clauseIndex) => clauseIndex !== path[0]);
      commitDraft({
        ...draft,
        clauses: nextClauses.length > 0 ? nextClauses : [createConditionLeaf(readableSignals)],
      });
      return;
    }

    const removeFromGroup = (nodes, depth = 0) =>
      nodes.map((node, index) => {
        if (index !== path[depth]) {
          return node;
        }
        if (node.type !== "group") {
          return node;
        }
        if (depth === path.length - 2) {
          const nextClauses = (node.clauses ?? []).filter((_, clauseIndex) => clauseIndex !== path[path.length - 1]);
          return {
            ...node,
            clauses: nextClauses.length > 0 ? nextClauses : [createConditionLeaf(readableSignals)],
          };
        }
        return {
          ...node,
          clauses: removeFromGroup(node.clauses ?? [], depth + 1),
        };
      });

    commitDraft({
      ...draft,
      clauses: removeFromGroup(draft.clauses),
    });
  };

  if (readableSignals.length === 0) {
    return (
      <div className="editor-subsection">
        <div className="editor-subsection-header">
          <h4>Условие перехода</h4>
        </div>
        <p className="field-hint">Добавить сигналы перед построением условий перехода.</p>
      </div>
    );
  }

  const renderNode = (node, path = []) => {
    if (node.type === "group") {
      return (
        <div className="builder-card" key={`group-${path.join("-") || "root"}`}>
          <div className="editor-subsection-header">
            <label className="field">
              <span>Связь внутри группы</span>
              <Select
                value={node.joiner ?? "&&"}
                onValueChange={(value) =>
                  updateNodeAtPath(path, (current) => ({
                    ...current,
                    joiner: value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="&&">И</SelectItem>
                  <SelectItem value="||">ИЛИ</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <div className="inline-actions">
              <Button onClick={() => addLeafAtPath(path)} size="sm" type="button" variant="outline">
                Добавить условие
              </Button>
              <Button onClick={() => addGroupAtPath(path)} size="sm" type="button" variant="outline">
                Добавить группу
              </Button>
              {path.length > 0 ? (
                <Button onClick={() => removeNodeAtPath(path)} size="sm" type="button" variant="outline">
                  Удалить группу
                </Button>
              ) : null}
            </div>
          </div>

          <div className="builder-stack">
            {(node.clauses ?? []).map((child, index) => renderNode(child, [...path, index]))}
          </div>
        </div>
      );
    }

    return (
      <div className="builder-card" key={`leaf-${path.join("-")}`}>
        <div className="builder-stack">
          <label className="field">
            <span>Тип условия</span>
            <Select
              value={node.mode ?? "simple"}
              onValueChange={(value) =>
                updateNodeAtPath(path, (current) => ({
                  ...current,
                  mode: value,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simple">Простое сравнение</SelectItem>
                <SelectItem value="expression">Выражение</SelectItem>
              </SelectContent>
            </Select>
          </label>

          {node.mode === "expression" ? (
            <ExpressionBuilder
              emptyHint="Добавить сигналы для построения выражения."
              expression={serializeConditionDraft({ mode: "clauses", joiner: "&&", clauses: [node] }, fsm.signals)}
              fsm={fsm}
              onChange={(expression) =>
                updateNodeAtPath(path, (current) => ({
                  ...current,
                  mode: "expression",
                  expressionDraft: parseExpressionString(expression, fsm.signals, 1),
                }))
              }
              title="Условное выражение"
              width={1}
            />
          ) : (
            <div className="builder-grid">
              <label className="field">
                <span>Сигнал</span>
                <Select
                  value={node.left}
                  onValueChange={(value) => updateNodeAtPath(path, (current) => ({ ...current, left: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {readableSignals.map((signalName) => (
                      <SelectItem key={signalName} value={signalName}>
                        {signalName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <label className="field">
                <span>Проверка</span>
                <Select
                  value={node.comparator}
                  onValueChange={(value) =>
                    updateNodeAtPath(path, (current) => ({
                      ...current,
                      comparator: value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPARATOR_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              {needsRightOperand(node.comparator) ? (
                <label className="field">
                  <span>Сравнить с</span>
                  <Select
                    value={node.rightType}
                    onValueChange={(value) =>
                      updateNodeAtPath(path, (current) => ({
                        ...current,
                        rightType: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="const">Константой</SelectItem>
                      <SelectItem value="signal">Сигналом</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              ) : null}

              {needsRightOperand(node.comparator) && node.rightType === "const" ? (
                <label className="field">
                  <span>Константа</span>
                  <Select
                    value={node.rightConst}
                    onValueChange={(value) =>
                      updateNodeAtPath(path, (current) => ({
                        ...current,
                        rightConst: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zero">0</SelectItem>
                      <SelectItem value="one">1</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              ) : null}

              {needsRightOperand(node.comparator) && node.rightType === "signal" ? (
                <label className="field">
                  <span>Другой сигнал</span>
                  <Select
                    value={node.rightSignal}
                    onValueChange={(value) =>
                      updateNodeAtPath(path, (current) => ({
                        ...current,
                        rightSignal: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {readableSignals.map((signalName) => (
                        <SelectItem key={signalName} value={signalName}>
                          {signalName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              ) : null}
            </div>
          )}
        </div>

        <div className="inline-actions">
          <code className="inline-code">{serializeConditionDraft({ ...draft, clauses: [node], joiner: "&&", mode: "clauses" }, fsm.signals)}</code>
          <Button
            onClick={() => removeNodeAtPath(path)}
            size="sm"
            type="button"
            variant="outline"
          >
            Удалить
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="editor-subsection">
      <div className="editor-subsection-header">
        <h4>Условие перехода</h4>
      </div>

      <Tabs
        onValueChange={(value) =>
          commitDraft({
            ...draft,
            mode: value,
          })
        }
        value={draft.mode}
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="always">Всегда</TabsTrigger>
          <TabsTrigger value="clauses">По условию</TabsTrigger>
          <TabsTrigger value="raw">Выражение</TabsTrigger>
        </TabsList>

        <TabsContent value="clauses">
          <div className="editor-subsection-header">
            <label className="field">
              <span>Связать условия через</span>
              <Select
                value={draft.joiner}
                onValueChange={(value) =>
                  commitDraft({
                    ...draft,
                    joiner: value,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="&&">И</SelectItem>
                  <SelectItem value="||">ИЛИ</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <div className="inline-actions">
              <Button onClick={() => addLeafAtPath([])} size="sm" type="button" variant="outline">
                Добавить условие
              </Button>
              <Button onClick={() => addGroupAtPath([])} size="sm" type="button" variant="outline">
                Добавить группу
              </Button>
            </div>
          </div>

          <div className="builder-stack">
            {draft.clauses.map((clause, index) => renderNode(clause, [index]))}
          </div>

          <div className="inline-actions">
            <code className="inline-code whitespace-pre-wrap">{serializeConditionDraft(draft, fsm.signals)}</code>
          </div>
        </TabsContent>

        <TabsContent value="always">
          <div className="builder-stack">
            <p className="field-hint">
              Переход будет безусловным. В HDL это соответствует условию перехода `1`.
            </p>
            <code className="inline-code">1</code>
          </div>
        </TabsContent>

        <TabsContent value="raw">
          <div className="builder-stack">
            <label className="field">
              <span>Произвольное Verilog-условие</span>
              <Textarea
                onChange={(event) =>
                  commitDraft({
                    ...draft,
                    mode: "raw",
                    raw: event.target.value,
                  })
                }
                placeholder="((!busy_mult1) && !(mult1_res < b_reg)) && !(mult1_res == b_reg)"
                value={draft.raw ?? condition ?? ""}
              />
            </label>
            <p className="field-hint">
              В этом режиме можно использовать скобки, вложенные отрицания, сочетание `&&`, `||`,
              сравнений и других Verilog-операторов. Выражение будет сохранено как есть.
            </p>
            <code className="inline-code whitespace-pre-wrap">
              {serializeConditionDraft(draft, fsm.signals)}
            </code>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
