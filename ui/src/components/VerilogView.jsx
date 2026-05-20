import { useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import MonacoCodeEditor from "./MonacoCodeEditor";

function RequestMetaCard({ meta }) {
  if (!meta) {
    return null;
  }

  return (
    <div className="request-meta-card">
      <div className="issue-header">
        <h3>Запрос генерации</h3>
        <Badge variant={meta.ok ? "default" : "destructive"}>{meta.ok ? "ок" : "ошибка"}</Badge>
      </div>
      <p>ID запроса: {meta.requestId}</p>
      <p>Статус: {meta.status ?? "сеть"}</p>
      <p>Задержка: {meta.durationMs} мс</p>
    </div>
  );
}

export default function VerilogView({ code, error, loading, onImport, onRefresh, requestMeta }) {
  const fileInputRef = useRef(null);

  return (
    <section className="panel verilog-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Сгенерированный HDL</p>
          <h2>Предпросмотр Verilog</h2>
        </div>
        <div className="panel-actions">
          {loading ? <Badge>Генерация</Badge> : null}
          {onImport ? (
            <>
              <input
                accept=".v,.sv"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    return;
                  }

                  const source = await file.text();
                  onImport(source);
                  event.target.value = "";
                }}
                ref={fileInputRef}
                type="file"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                size="sm"
                type="button"
                variant="outline"
              >
                Загрузить Verilog
              </Button>
            </>
          ) : null}
          {onRefresh ? (
            <Button onClick={onRefresh} size="sm" type="button" variant="outline">
              {error ? "Повторить" : "Обновить"}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      <RequestMetaCard meta={requestMeta} />

      <MonacoCodeEditor
        height="26rem"
        language="verilog"
        readOnly
        value={code || "// Представление Verilog обновится, когда FSM станет валидной."}
      />
    </section>
  );
}
