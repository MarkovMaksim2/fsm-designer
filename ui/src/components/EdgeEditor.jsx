import { useState } from "react";

import ActionsDialogEditor from "./ActionsDialogEditor";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import ConditionBuilder from "./ConditionBuilder";
import { useFSMStore } from "../store/fsmStore";

export default function EdgeEditor({ edgeIndex }) {
  const { fsm, removeTransition, updateTransition } = useFSMStore();
  const transition = fsm.transitions[edgeIndex];
  const [transitionError, setTransitionError] = useState("");

  if (!transition) {
    return null;
  }

  const handleTransitionPatch = (patch) => {
    const result = updateTransition(edgeIndex, patch);
    if (!result.ok) {
      setTransitionError(result.error);
      return;
    }
    setTransitionError("");
  };

  return (
    <div className="editor-card">
      <div className="editor-title-row">
        <h3>
          {transition.from_state} → {transition.to_state}
        </h3>
        <Button
          onClick={() => removeTransition(edgeIndex)}
          size="sm"
          type="button"
          variant="outline"
        >
          Удалить переход
        </Button>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Из состояния</span>
          <select
            value={transition.from_state}
            onChange={(event) => handleTransitionPatch({ from_state: event.target.value })}
          >
            {fsm.states.map((state) => (
              <option key={state.name} value={state.name}>
                {state.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>В состояние</span>
          <select
            value={transition.to_state}
            onChange={(event) => handleTransitionPatch({ to_state: event.target.value })}
          >
            {fsm.states.map((state) => (
              <option key={state.name} value={state.name}>
                {state.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ConditionBuilder
        condition={transition.condition}
        fsm={fsm}
        key={`${edgeIndex}:${transition.condition}`}
        onChange={(condition) => handleTransitionPatch({ condition })}
      />

      <label className="field">
        <span>Домен действий перехода</span>
        <Select
          value={transition.action_domain ?? "comb"}
          onValueChange={(value) => handleTransitionPatch({ action_domain: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="comb">Combinational</SelectItem>
            <SelectItem value="seq">Sequential</SelectItem>
          </SelectContent>
        </Select>
      </label>

      {transitionError ? <p className="form-error">{transitionError}</p> : null}

      <ActionsDialogEditor
        actionDomain={transition.action_domain ?? "comb"}
        actions={transition.actions}
        description={
          transition.action_domain === "seq"
            ? "Sequential-действия перехода будут выполняться в тактируемом always-блоке и могут использовать <=."
            : "Combinational-действия перехода будут сгенерированы в always @(*) и должны использовать blocking-присваивания =."
        }
        fsm={fsm}
        onChange={(actions) => {
          const result = updateTransition(edgeIndex, { actions });
          if (!result?.ok) {
            setTransitionError(result.error);
            return;
          }
          setTransitionError("");
        }}
        title="Действия перехода"
        triggerLabel="Открыть действия"
      />
    </div>
  );
}
