import { useMemo, useState } from "react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import ConditionBuilder from "./ConditionBuilder";
import ExpressionBuilder from "./ExpressionBuilder";
import {
  createEmptyActionDraft,
  createEmptyConditionalActionDraft,
  getAssignableSignals,
  getReadableSignals,
  getSignalWidth,
  parseActionString,
  serializeActionDraft,
} from "../lib/editorModel";
import { useFSMStore } from "../store/fsmStore";

function ActionListEditor({
  actionDomain,
  assignableSignals,
  drafts,
  fsm,
  numberDisplayMode,
  onChange,
  readableSignals,
  title,
}) {
  const getItemLabel = (draft, index) => {
    if (draft.kind === "conditional") {
      return `Условный блок ${index + 1}`;
    }

    return draft.target ? `Действие ${index + 1}: ${draft.target}` : `Действие ${index + 1}`;
  };

  const updateDraft = (index, nextDraft) => {
    onChange(drafts.map((draft, draftIndex) => (draftIndex === index ? nextDraft : draft)));
  };

  const removeDraft = (index) => {
    const nextDrafts = drafts.filter((_, draftIndex) => draftIndex !== index);
    onChange(nextDrafts);
  };

  const addAssignment = () => {
    onChange([...drafts, createEmptyActionDraft(assignableSignals, readableSignals)]);
  };

  const addConditional = () => {
    onChange([...drafts, createEmptyConditionalActionDraft(readableSignals, assignableSignals)]);
  };

  return (
    <div className="editor-subsection">
      <div className="editor-subsection-header">
        <h4>{title}</h4>
        <div className="inline-actions">
          <Button onClick={addAssignment} size="sm" type="button" variant="outline">
            Добавить действие
          </Button>
          <Button onClick={addConditional} size="sm" type="button" variant="outline">
            Добавить if/else
          </Button>
        </div>
      </div>

      <Accordion className="builder-stack w-full" collapsible defaultValue="item-0" type="single">
        {drafts.map((draft, index) => (
          <AccordionItem className="builder-card" key={`${draft.kind}-${index}`} value={`item-${index}`}>
            <AccordionTrigger className="py-0">
              <div className="flex min-w-0 flex-1 flex-col gap-1 pr-3 text-left">
                <span className="font-medium text-foreground">{getItemLabel(draft, index)}</span>
                <span className="text-sm text-muted-foreground">
                  {serializeActionDraft(draft, fsm.signals, numberDisplayMode) || "Действие еще не заполнено"}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <ActionDraftEditor
                actionDomain={actionDomain}
                assignableSignals={assignableSignals}
                draft={draft}
                fsm={fsm}
                numberDisplayMode={numberDisplayMode}
                onChange={(nextDraft) => updateDraft(index, nextDraft)}
                onRemove={() => removeDraft(index)}
                readableSignals={readableSignals}
              />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {drafts.length === 0 ? (
        <div className="builder-card">
          <p className="empty-copy">Действия пока не заданы.</p>
        </div>
      ) : null}
    </div>
  );
}

function ActionDraftEditor({
  actionDomain,
  assignableSignals,
  draft,
  fsm,
  numberDisplayMode,
  onChange,
  onRemove,
  readableSignals,
}) {
  if (draft.kind === "conditional") {
    return (
      <div className="builder-stack">
        <div className="editor-subsection-header">
          <h4>Условный блок</h4>
          <Button onClick={onRemove} size="sm" type="button" variant="outline">
            Удалить
          </Button>
        </div>

        <ConditionBuilder
          condition=""
          fsm={fsm}
          key={serializeActionDraft(draft, fsm.signals, numberDisplayMode) || "conditional"}
          onChangeDraft={(condition) => onChange({ ...draft, condition })}
          valueDraft={draft.condition}
        />

        <ActionListEditor
          actionDomain={actionDomain}
          assignableSignals={assignableSignals}
          drafts={draft.thenActions}
          fsm={fsm}
          numberDisplayMode={numberDisplayMode}
          onChange={(thenActions) =>
            onChange({
              ...draft,
              thenActions,
            })
          }
          readableSignals={readableSignals}
          title="Ветка then"
        />

        <ActionListEditor
          actionDomain={actionDomain}
          assignableSignals={assignableSignals}
          drafts={draft.elseActions.length > 0 ? draft.elseActions : [createEmptyActionDraft(assignableSignals, readableSignals)]}
          fsm={fsm}
          numberDisplayMode={numberDisplayMode}
          onChange={(elseActions) =>
            onChange({
              ...draft,
              elseActions,
            })
          }
          readableSignals={readableSignals}
          title="Ветка else"
        />

        <code className="inline-code whitespace-pre-wrap">{serializeActionDraft(draft, fsm.signals, numberDisplayMode) || "Условный блок не задан"}</code>
      </div>
    );
  }

  const assignmentValue = actionDomain === "comb" && (draft.assignment ?? "=") === "<="
    ? "="
    : (draft.assignment ?? "=");

  return (
    <div className="builder-stack">
      <label className="field">
        <span>Цель</span>
        <Select value={draft.target} onValueChange={(value) => onChange({ ...draft, target: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Выбери цель" />
          </SelectTrigger>
          <SelectContent>
            {assignableSignals.map((signalName) => (
              <SelectItem key={signalName} value={signalName}>
                {signalName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="field">
        <span>Оператор присваивания</span>
        <Select
          value={assignmentValue}
          onValueChange={(value) => onChange({ ...draft, assignment: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="=">=</SelectItem>
            {actionDomain === "seq" ? <SelectItem value="<=">{"<="}</SelectItem> : null}
          </SelectContent>
        </Select>
      </label>

      {actionDomain === "comb" ? (
        <p className="field-hint">
          Для combinational-действий разрешен только оператор `=`. Если нужен {"`<="}` , переведи блок в sequential domain.
        </p>
      ) : null}

      <ExpressionBuilder
        expression={draft.expression ? serializeActionDraft({
          ...draft,
          assignment: "=",
        }, fsm.signals, numberDisplayMode).replace(/^[^=]+=\s*/, "").replace(/;$/, "") : ""}
        fsm={fsm}
        onChange={(expression) =>
          onChange({
            ...draft,
            expression: parseActionString(
              `${draft.target} ${draft.assignment ?? "="} ${expression};`,
              fsm.signals,
            )?.expression ?? draft.expression,
          })
        }
        title="Присваиваемое выражение"
        width={getSignalWidth(fsm.signals, draft.target)}
      />

      <div className="inline-actions">
        <code className="inline-code">{serializeActionDraft(draft, fsm.signals, numberDisplayMode) || "Действие не задано"}</code>
        <Button onClick={onRemove} size="sm" type="button" variant="outline">
          Удалить
        </Button>
      </div>
    </div>
  );
}

function draftUsesNonblocking(draft) {
  if (!draft) {
    return false;
  }
  if (draft.kind === "conditional") {
    return draft.thenActions.some(draftUsesNonblocking) || draft.elseActions.some(draftUsesNonblocking);
  }
  return (draft.assignment ?? "=") === "<=";
}

export default function StructuredActionsEditor({ actions, actionDomain = "comb", fsm, onChange, title }) {
  const numberDisplayMode = useFSMStore((state) => state.numberDisplayMode);
  const readableSignals = useMemo(() => getReadableSignals(fsm.signals), [fsm.signals]);
  const assignableSignals = useMemo(() => getAssignableSignals(fsm.signals), [fsm.signals]);
  const parsedActions = useMemo(
    () => actions.map((action) => parseActionString(action, fsm.signals)),
    [actions, fsm.signals],
  );
  const unsupportedActions = useMemo(
    () => actions.filter((action, index) => parsedActions[index] === null),
    [actions, parsedActions],
  );
  const [drafts, setDrafts] = useState(() => {
    const supported = parsedActions.filter(Boolean);
    if (supported.length > 0) {
      return supported;
    }
    return actions.length > 0 ? [createEmptyActionDraft(assignableSignals, readableSignals)] : [];
  });

  const updateDrafts = (nextDrafts) => {
    setDrafts(nextDrafts);
    onChange(nextDrafts.map((draft) => serializeActionDraft(draft, fsm.signals, numberDisplayMode)).filter(Boolean));
  };

  const hasCombDomainViolation = actionDomain === "comb" && drafts.some(draftUsesNonblocking);

  if (assignableSignals.length === 0) {
    return (
      <div className="editor-subsection">
        <div className="editor-subsection-header">
          <h4>{title}</h4>
        </div>
        <p className="field-hint">
          Добавить хотя бы один сигнал типа `output`, `output reg` или `reg`, прежде чем создавать действия.
        </p>
      </div>
    );
  }

  return (
    <div className="editor-subsection">
      {unsupportedActions.length > 0 ? (
        <p className="field-hint">
          Неподдержанные унаследованные действия скрыты из редактора: {unsupportedActions.join(" | ")}
        </p>
      ) : null}
      {hasCombDomainViolation ? (
        <p className="form-error">
          В combinational-домене обнаружено неблокирующее присваивание {"`<="}`. Замени его на `=` или переведи действия в sequential domain.
        </p>
      ) : null}

      <ActionListEditor
        actionDomain={actionDomain}
        assignableSignals={assignableSignals}
        drafts={drafts}
        fsm={fsm}
        numberDisplayMode={numberDisplayMode}
        onChange={updateDrafts}
        readableSignals={readableSignals}
        title={title}
      />
    </div>
  );
}
