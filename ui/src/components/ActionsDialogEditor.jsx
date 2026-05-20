import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import StructuredActionsEditor from "./StructuredActionsEditor";

function summarizeActions(actions) {
  if (!actions?.length) {
    return "Действия не заданы.";
  }

  if (actions.length === 1) {
    return actions[0];
  }

  return `${actions.length} действий. Первое: ${actions[0]}`;
}

export default function ActionsDialogEditor({
  actions,
  actionDomain = "comb",
  fsm,
  onChange,
  title,
  description,
  triggerLabel,
}) {
  const [open, setOpen] = useState(false);
  const summary = useMemo(() => summarizeActions(actions), [actions]);

  return (
    <div className="editor-subsection">
      <div className="editor-subsection-header">
        <h4>{title}</h4>
        <Button onClick={() => setOpen(true)} size="sm" type="button">
          {triggerLabel}
        </Button>
      </div>
      <p className="field-hint">{summary}</p>

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="max-h-[88vh] overflow-y-auto !w-[min(94vw,62rem)]">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <StructuredActionsEditor
            actions={actions}
            actionDomain={actionDomain}
            fsm={fsm}
            onChange={onChange}
            title={title}
          />

          <DialogFooter>
            <Button onClick={() => setOpen(false)} type="button" variant="outline">
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
