import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  createEmptyExpressionDraft,
  createExpressionTerm,
  formatConstInputValue,
  getReadableSignals,
  parseExpressionString,
  serializeExpressionDraft,
  validateConstInput,
  maxUnsignedValue,
} from "../lib/editorModel";
import { useFSMStore } from "../store/fsmStore";

const OPERATORS = ["&", "|", "^", "+", "-", "*", "/", "%", "<<", ">>", "&&", "||", "==", "!=", "<", "<=", ">", ">="];

export default function ExpressionBuilder({
  expression,
  fsm,
  onChange,
  width = 1,
  title,
  emptyHint,
}) {
  const numberDisplayMode = useFSMStore((state) => state.numberDisplayMode);
  const readableSignals = useMemo(() => getReadableSignals(fsm.signals), [fsm.signals]);
  const parsedExpression = useMemo(
    () => parseExpressionString(expression, fsm.signals, width),
    [expression, fsm.signals, width],
  );
  const [constEditors, setConstEditors] = useState({});
  const draft = parsedExpression ?? createEmptyExpressionDraft(readableSignals);

  const commitDraft = (nextDraft) => {
    setConstEditors({});
    onChange(serializeExpressionDraft(nextDraft, fsm.signals, width, numberDisplayMode));
  };

  const patchTerm = (index, patch) => {
    commitDraft({
      ...draft,
      terms: draft.terms.map((term, termIndex) =>
        termIndex === index
          ? {
              ...term,
              ...patch,
            }
          : term,
      ),
    });
  };

  const patchOperator = (index, operator) => {
    commitDraft({
      ...draft,
      operators: draft.operators.map((item, operatorIndex) =>
        operatorIndex === index ? operator : item,
      ),
    });
  };

  const addTerm = () => {
    setConstEditors({});
    commitDraft({
      ...draft,
      terms: [...draft.terms, createExpressionTerm(readableSignals)],
      operators: [...draft.operators, "&"],
    });
  };

  const removeTerm = (index) => {
    const nextTerms = draft.terms.filter((_, termIndex) => termIndex !== index);
    const nextOperators = draft.operators.filter(
      (_, operatorIndex) => operatorIndex !== Math.max(0, index - 1),
    );

    setConstEditors({});
    commitDraft({
      ...draft,
      terms: nextTerms.length > 0 ? nextTerms : [createExpressionTerm(readableSignals)],
      operators: nextTerms.length > 1 ? nextOperators : [],
    });
  };

  const handleConstInput = (index, rawValue) => {
    setConstEditors((current) => ({
      ...current,
      [index]: {
        text: rawValue,
        error: current[index]?.error ?? "",
      },
    }));

    const validation = validateConstInput(rawValue, width, numberDisplayMode);
    if (!validation.ok) {
      setConstEditors((current) => ({
        ...current,
        [index]: {
          text: rawValue,
          error: validation.error,
        },
      }));
      return;
    }

    setConstEditors((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });

    patchTerm(index, {
      constValue: validation.value,
    });
  };

  if (readableSignals.length === 0) {
    return (
      <div className="editor-subsection">
        <div className="editor-subsection-header">
          <h4>{title}</h4>
        </div>
        <p className="field-hint">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="editor-subsection">
      <div className="editor-subsection-header">
        <h4>{title}</h4>
      </div>

      <Tabs
        onValueChange={(value) => {
          if (value === "raw") {
            commitDraft({
              mode: "raw",
              raw: serializeExpressionDraft(draft, fsm.signals, width, numberDisplayMode),
              terms: draft.terms,
              operators: draft.operators,
            });
            return;
          }

          commitDraft(createEmptyExpressionDraft(readableSignals));
        }}
        value={draft.mode ?? "structured"}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="structured">Конструктор</TabsTrigger>
          <TabsTrigger value="raw">Выражение</TabsTrigger>
        </TabsList>

        <TabsContent value="structured">
          {draft.mode === "raw" ? (
            <p className="field-hint">
              Унаследованное выражение сейчас открыто как raw-text. При переходе в конструктор будет создана новая структурированная версия.
            </p>
          ) : null}

          <div className="editor-subsection-header">
            <div />
            <Button onClick={addTerm} size="sm" type="button" variant="outline">
              Добавить термин
            </Button>
          </div>

          <div className="builder-stack">
            {draft.terms.map((term, index) => (
              <div className="builder-card" key={`term-${index}`}>
                <div className="builder-grid">
                  {index > 0 ? (
                    <label className="field">
                      <span>Оператор</span>
                      <Select
                        value={draft.operators[index - 1] ?? "&"}
                        onValueChange={(value) => patchOperator(index - 1, value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OPERATORS.map((operator) => (
                            <SelectItem key={operator} value={operator}>
                              {operator}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  ) : null}

                  <label className="field">
                    <span>Тип термина</span>
                    <Select
                      value={term.kind}
                      onValueChange={(value) =>
                        patchTerm(index, {
                          kind: value,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="signal">Сигнал</SelectItem>
                        <SelectItem value="const">Константа</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>

                  <label className="field">
                    <span>Унарный оператор</span>
                    <Select
                      value={term.unary ?? "none"}
                      onValueChange={(value) =>
                        patchTerm(index, {
                          unary: value,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Нет</SelectItem>
                        <SelectItem value="~">Побитовое НЕ `~`</SelectItem>
                        <SelectItem value="!">Логическое НЕ `!`</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>

                  {term.kind === "signal" ? (
                    <label className="field">
                      <span>Сигнал</span>
                      <Select
                        value={term.signal}
                        onValueChange={(value) =>
                          patchTerm(index, {
                            signal: value,
                          })
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
                  ) : (
                    <div className="field">
                      <span>Константа</span>
                      <Input
                        onChange={(event) => handleConstInput(index, event.target.value)}
                        placeholder={numberDisplayMode === "binary" ? "например 00001111" : "например 15"}
                        value={constEditors[index]?.text ?? formatConstInputValue(term.constValue ?? 0, width, numberDisplayMode)}
                      />
                      <p className="field-hint">
                        Допустимый диапазон: 0..{maxUnsignedValue(width)}.
                        {numberDisplayMode === "binary"
                          ? ` Введите двоичное значение шириной до ${Math.max(1, width)} бит.`
                          : " Введите десятичное значение."}
                      </p>
                      {constEditors[index]?.error ? <p className="form-error">{constEditors[index].error}</p> : null}
                    </div>
                  )}
                </div>

                <div className="inline-actions">
                  <code className="inline-code">{serializeExpressionDraft({ terms: [term], operators: [] }, fsm.signals, width, numberDisplayMode) || "Термин не задан"}</code>
                  <Button
                    onClick={() => removeTerm(index)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Удалить
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="raw">
          <div className="builder-stack">
            <label className="field">
              <span>Произвольное Verilog-выражение</span>
              <Textarea
                onChange={(event) =>
                  commitDraft({
                    mode: "raw",
                    raw: event.target.value,
                    terms: draft.terms,
                    operators: draft.operators,
                  })
                }
                placeholder="(part_res + shifted_part_sum)"
                value={draft.mode === "raw" ? draft.raw ?? "" : serializeExpressionDraft(draft, fsm.signals, width, numberDisplayMode)}
              />
            </label>
            <p className="field-hint">
              В этом режиме выражение сохраняется как есть. Используй его для сложных RHS, которые не раскладываются конструктором.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <code className="inline-code">
        {serializeExpressionDraft(draft, fsm.signals, width, numberDisplayMode) || "Выражение не задано"}
      </code>
    </div>
  );
}
