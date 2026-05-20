import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import ActionsDialogEditor from "./ActionsDialogEditor";
import { useFSMStore } from "../store/fsmStore";

export default function NodeEditor({ stateName }) {
  const { addTransition, fsm, removeState, selectEdge, setInitialState, updateState } = useFSMStore();
  const state = fsm.states.find((item) => item.name === stateName);
  const [draftName, setDraftName] = useState(stateName);
  const [nameError, setNameError] = useState("");
  const [outgoingTarget, setOutgoingTarget] = useState(
    fsm.states.find((item) => item.name !== stateName)?.name ?? stateName,
  );
  const [incomingSource, setIncomingSource] = useState(
    fsm.states.find((item) => item.name !== stateName)?.name ?? stateName,
  );
  const [edgeError, setEdgeError] = useState("");

  if (!state) {
    return null;
  }

  const outgoingTransitions = fsm.transitions
    .map((transition, index) => ({ transition, index }))
    .filter(({ transition }) => transition.from_state === stateName);
  const incomingTransitions = fsm.transitions
    .map((transition, index) => ({ transition, index }))
    .filter(({ transition }) => transition.to_state === stateName);

  const handleRename = () => {
    const result = updateState(stateName, { name: draftName });
    if (!result.ok) {
      setNameError(result.error);
      return;
    }
    setNameError("");
  };

  const handleCreateOutgoing = () => {
    const result = addTransition(stateName, outgoingTarget);
    if (!result.ok) {
      setEdgeError(result.error);
      return;
    }
    setEdgeError("");
  };

  const handleCreateIncoming = () => {
    const result = addTransition(incomingSource, stateName);
    if (!result.ok) {
      setEdgeError(result.error);
      return;
    }
    setEdgeError("");
  };

  return (
    <div className="editor-card">
      <div className="editor-title-row">
        <h3>{stateName}</h3>
        <Button onClick={() => removeState(stateName)} size="sm" type="button" variant="outline">
          Удалить состояние
        </Button>
      </div>

      <label className="field">
        <span>Имя состояния</span>
        <Input
          value={draftName}
          onBlur={handleRename}
          onChange={(event) => {
            setDraftName(event.target.value);
            if (nameError) {
              setNameError("");
            }
          }}
          placeholder="FETCH"
        />
      </label>
      {nameError ? <p className="form-error">{nameError}</p> : null}

      <label className="checkbox-field">
        <input
          checked={state.is_initial}
          onChange={() => setInitialState(stateName)}
          type="checkbox"
        />
        <span>Начальное состояние</span>
      </label>

      <label className="field">
        <span>Домен действий состояния</span>
        <Select
          value={state.action_domain ?? "comb"}
          onValueChange={(value) => updateState(stateName, { action_domain: value })}
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

      <ActionsDialogEditor
        actionDomain={state.action_domain ?? "comb"}
        actions={state.actions}
        description={
          state.action_domain === "seq"
            ? "Sequential-действия будут сгенерированы в тактируемом always-блоке и могут использовать <=."
            : "Combinational-действия будут сгенерированы в always @(*) и должны использовать blocking-присваивания =."
        }
        fsm={fsm}
        onChange={(actions) => updateState(stateName, { actions })}
        title="Действия состояния"
        triggerLabel="Открыть действия"
      />

      <div className="editor-subsection">
        <div className="editor-subsection-header">
          <h4>Связанные переходы</h4>
        </div>

        <div className="builder-stack">
          <div className="builder-card">
            <p className="field-hint">Создать переход без графа</p>

            <label className="field">
              <span>Исходящий переход в состояние</span>
              <Select
                onValueChange={(value) => {
                  setOutgoingTarget(value);
                  if (edgeError) {
                    setEdgeError("");
                  }
                }}
                value={outgoingTarget}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выбери целевое состояние" />
                </SelectTrigger>
                <SelectContent>
                  {fsm.states.map((item) => (
                    <SelectItem key={`out-${item.name}`} value={item.name}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <Button onClick={handleCreateOutgoing} size="sm" type="button">
              Добавить исходящий переход
            </Button>

            <label className="field">
              <span>Входящий переход из состояния</span>
              <Select
                onValueChange={(value) => {
                  setIncomingSource(value);
                  if (edgeError) {
                    setEdgeError("");
                  }
                }}
                value={incomingSource}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выбери исходное состояние" />
                </SelectTrigger>
                <SelectContent>
                  {fsm.states.map((item) => (
                    <SelectItem key={`in-${item.name}`} value={item.name}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <Button onClick={handleCreateIncoming} size="sm" type="button" variant="outline">
              Добавить входящий переход
            </Button>

            {edgeError ? <p className="form-error">{edgeError}</p> : null}
          </div>

          <div className="builder-card">
            <p className="field-hint">Исходящие переходы</p>
            {outgoingTransitions.length === 0 ? (
              <p className="empty-copy">Исходящих переходов пока нет.</p>
            ) : (
              <div className="list-stack">
                {outgoingTransitions.map(({ transition, index }) => (
                  <div className="list-item" key={`out-${index}`}>
                    <div>
                      <strong>{transition.from_state} → {transition.to_state}</strong>
                      <p>{transition.condition}</p>
                    </div>
                    <Button onClick={() => selectEdge(index)} size="sm" type="button" variant="outline">
                      Открыть
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="builder-card">
            <p className="field-hint">Входящие переходы</p>
            {incomingTransitions.length === 0 ? (
              <p className="empty-copy">Входящих переходов пока нет.</p>
            ) : (
              <div className="list-stack">
                {incomingTransitions.map(({ transition, index }) => (
                  <div className="list-item" key={`in-${index}`}>
                    <div>
                      <strong>{transition.from_state} → {transition.to_state}</strong>
                      <p>{transition.condition}</p>
                    </div>
                    <Button onClick={() => selectEdge(index)} size="sm" type="button" variant="outline">
                      Открыть
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
