import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { createStarterTestbench } from "../lib/testbenchModel";
import MonacoCodeEditor from "./MonacoCodeEditor";

function RequestMetaCard({ meta }) {
  if (!meta) {
    return null;
  }

  return (
    <div className="request-meta-card">
      <div className="issue-header">
        <h3>Запрос моделирования</h3>
        <Badge variant={meta.ok ? "default" : "destructive"}>{meta.ok ? "ок" : "ошибка"}</Badge>
      </div>
      <p>ID запроса: {meta.requestId}</p>
      <p>Статус: {meta.status ?? "сеть"}</p>
      <p>Задержка: {meta.durationMs} мс</p>
    </div>
  );
}

export default function SimulationPanel({
  fsm,
  generatedVerilog,
  loading,
  onRun,
  requestMeta,
  result,
  error,
}) {
  const [testbench, setTestbench] = useState(() => createStarterTestbench(fsm));

  return (
    <section className="panel verilog-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Моделирование</p>
          <h2>Запуск testbench</h2>
        </div>
        <div className="panel-actions">
          {loading ? <Badge>Выполнение</Badge> : null}
          <Button onClick={() => setTestbench(createStarterTestbench(fsm))} size="sm" type="button" variant="outline">
            Сбросить testbench
          </Button>
          <Button
            disabled={!generatedVerilog}
            onClick={() => onRun(testbench)}
            size="sm"
            type="button"
          >
            Запустить моделирование
          </Button>
        </div>
      </div>

      <p className="field-hint">
        Сгенерированный или импортированный модуль компилируется через `iverilog -g2012` и запускается через `vvp`.
      </p>

      <div className="field">
        <span>Testbench</span>
        <MonacoCodeEditor
          className="simulation-editor"
          height="24rem"
          language="verilog"
          onChange={setTestbench}
          value={testbench}
        />
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      <RequestMetaCard meta={requestMeta} />

      {result ? (
        <div className="builder-stack">
          <div className="builder-card">
            <div className="issue-header">
              <h3>Стандартный вывод</h3>
              <Badge variant={result.success ? "default" : "destructive"}>
                {result.success ? "успех" : "ошибка"}
              </Badge>
            </div>
            <MonacoCodeEditor
              className="simulation-output"
              height="12rem"
              language="plaintext"
              readOnly
              value={result.stdout || "// Стандартный вывод отсутствует"}
            />
          </div>

          <div className="builder-card">
            <div className="issue-header">
              <h3>Ошибки и диагностика</h3>
            </div>
            <MonacoCodeEditor
              className="simulation-output"
              height="12rem"
              language="plaintext"
              readOnly
              value={result.stderr || "// Сообщения об ошибках отсутствуют"}
            />
          </div>
        </div>
      ) : (
        <p className="empty-copy">Добавить или скорректировать testbench, затем запустить моделирование.</p>
      )}
    </section>
  );
}
