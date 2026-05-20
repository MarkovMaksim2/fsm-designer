import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function renderIssueSummary(item) {
  if (typeof item === "string") {
    return item;
  }

  return item.message ?? item.problem ?? item.reason ?? JSON.stringify(item);
}

function resolveFixPayload(type, item) {
  if (!item || typeof item === "string") {
    return item;
  }

  if (item.quick_fix) {
    return {
      ...item,
      fixType: item.quick_fix.type ?? type,
    };
  }

  return item;
}
const REFERENCE_SECTION_BY_TYPE = {
  unreachable: "diagnostics-unreachable",
  dead: "diagnostics-dead",
  nondet: "diagnostics-nondet",
  unsafe: "diagnostics-unsafe",
  "formal-unsupported": "diagnostics-formal",
};

function IssueSection({ items, onFix, onOpenReference, onPreviewFix, title, type }) {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <section className="issue-section">
      <div className="issue-header">
        <h3>{title}</h3>
        <span>{items.length}</span>
      </div>

      <div className="issue-list">
        {items.map((item, index) => (
          <div className="issue-card" key={`${type}-${index}`}>
            <p>{renderIssueSummary(item)}</p>
            {typeof item === "object" && item.location ? (
              <p className="issue-meta">
                Место: {item.location}
              </p>
            ) : null}
            {typeof item === "object" && item.quick_fix ? (
              <>
                <p className="issue-meta">
                  Исправление: {item.quick_fix.title}
                </p>
                <p className="issue-meta">
                  Изменение: {item.quick_fix.description}
                </p>
                <p className="issue-meta">
                  Применяется к: {item.quick_fix.location}
                </p>
              </>
            ) : null}
            {onFix ? (
              <div className="inline-actions">
                <Button
                  onClick={() => onFix(type, resolveFixPayload(type, item))}
                  onMouseEnter={() => onPreviewFix?.(type, resolveFixPayload(type, item))}
                  onMouseLeave={() => onPreviewFix?.(null, null)}
                  title="Наведите, чтобы увидеть область применения исправления на графе"
                  type="button"
                  variant="outline"
                >
                  Применить исправление
                </Button>
                {onOpenReference ? (
                  <Button
                    onClick={() => onOpenReference(REFERENCE_SECTION_BY_TYPE[type] ?? "common-errors")}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Что это значит?
                  </Button>
                ) : null}
              </div>
            ) : onOpenReference ? (
              <Button
                onClick={() => onOpenReference(REFERENCE_SECTION_BY_TYPE[type] ?? "common-errors")}
                size="sm"
                type="button"
                variant="outline"
              >
                Что это значит?
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function RequestMetaCard({ meta, title }) {
  if (!meta) {
    return null;
  }

  return (
    <div className="request-meta-card">
      <div className="issue-header">
        <h3>{title}</h3>
        <Badge variant={meta.ok ? "default" : "destructive"}>{meta.ok ? "ок" : "ошибка"}</Badge>
      </div>
      <p>ID запроса: {meta.requestId}</p>
      <p>Статус: {meta.status ?? "сеть"}</p>
      <p>Задержка: {meta.durationMs} мс</p>
      <p>Запущен: {meta.startedAt}</p>
    </div>
  );
}

export default function ErrorsPanel({
  analysis,
  clientIssues = [],
  error,
  loading,
  onFix,
  onOpenReference,
  onPreviewFix,
  onRefresh,
  requestMeta,
}) {
  return (
    <section className="panel panel-contrast">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Анализ</p>
          <h2>Диагностика автомата</h2>
        </div>
        <div className="panel-actions">
          {loading ? <Badge>Обновление</Badge> : null}
          {onRefresh ? (
            <Button onClick={onRefresh} size="sm" type="button" variant="outline">
              {error ? "Повторить" : "Обновить"}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {clientIssues.length > 0 ? (
        <section className="issue-section">
          <div className="issue-header">
            <h3>Локальная валидация</h3>
            <span>{clientIssues.length}</span>
          </div>
          <div className="issue-list">
            {clientIssues.map((issue, index) => (
              <div className="issue-card" key={`client-issue-${index}`}>
                <p>{issue}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <RequestMetaCard meta={requestMeta} title="Запрос анализа" />

      {!analysis && !error ? (
        <p className="empty-copy">Результаты анализа появятся, когда в FSM будет хотя бы одно состояние.</p>
      ) : null}

      {analysis ? (
        <>
          {analysis.import?.regeneration_warning ? (
            <section className="issue-section">
              <div className="issue-header">
                <h3>Безопасность импорта</h3>
                <Badge variant={analysis.import.safe_to_regenerate ? "default" : "destructive"}>
                  {analysis.import.safety_status_label ?? (analysis.import.safe_to_regenerate ? "безопасно" : "ограничено")}
                </Badge>
              </div>
              <div className="issue-list">
                <div className="issue-card">
                  <p>{analysis.import.regeneration_warning}</p>
                  <p>
                    Стиль: {analysis.import.style_label ?? analysis.import.style ?? "неизвестно"} · FSM-блоков: {analysis.import.fsm_blocks ?? 0}
                    {" · "}
                    Смешанная операционная логика: {analysis.import.mixed_datapath ? "да" : "нет"}
                  </p>
                  {analysis.import.block_role_labels?.length ? (
                    <p>
                      Роли FSM-блоков: {analysis.import.block_role_labels.join(", ")}
                    </p>
                  ) : null}
                  {analysis.import.internal_action_targets?.length ? (
                    <p>
                      Внутренние цели действий: {analysis.import.internal_action_targets.join(", ")}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          <div className="summary-grid">
            <div className="summary-card">
              <span>Состояния</span>
              <strong>{analysis.summary?.states ?? 0}</strong>
            </div>
            <div className="summary-card">
              <span>Переходы</span>
              <strong>{analysis.summary?.transitions ?? 0}</strong>
            </div>
            <div className="summary-card">
              <span>Сигналы</span>
              <strong>{analysis.summary?.signals ?? 0}</strong>
            </div>
          </div>

          <IssueSection
            items={analysis.structure?.unreachable_details ?? analysis.structure?.unreachable_states}
            onFix={onFix}
            onOpenReference={onOpenReference}
            onPreviewFix={onPreviewFix}
            title="Недостижимые состояния"
            type="unreachable"
          />
          <IssueSection
            items={analysis.structure?.dead_state_details ?? analysis.structure?.dead_states}
            onFix={onFix}
            onOpenReference={onOpenReference}
            onPreviewFix={onPreviewFix}
            title="Тупиковые состояния"
            type="dead"
          />
          <IssueSection
            items={analysis.behavior?.nondeterministic}
            onFix={onFix}
            onOpenReference={onOpenReference}
            onPreviewFix={onPreviewFix}
            title="Недетерминированные ветви"
            type="nondet"
          />
          <IssueSection
            items={analysis.safety?.unsafe_state_details ?? analysis.safety?.unsafe_states}
            onFix={onFix}
            onOpenReference={onOpenReference}
            onPreviewFix={onPreviewFix}
            title="Небезопасные состояния"
            type="unsafe"
          />

          {analysis.formal ? (
            <section className="issue-section">
              <div className="issue-header">
                <h3>Формальное покрытие условий переходов</h3>
                <Badge variant="outline">
                  {analysis.formal.summary?.supported_transitions ?? 0}/
                  {analysis.formal.summary?.total_transitions ?? 0}
                </Badge>
              </div>
              <div className="issue-list">
                <div className="issue-card">
                  <p>
                    Формальный анализ сейчас поддерживает {analysis.formal.summary?.supported_transitions ?? 0} из{" "}
                    {analysis.formal.summary?.total_transitions ?? 0} условий переходов.
                  </p>
                  <p className="issue-meta">
                    Неподдержанные условия: {analysis.formal.summary?.unsupported_transitions ?? 0}
                  </p>
                  <p className="issue-meta">
                    Противоречивые условия: {analysis.formal.summary?.unsatisfiable_transitions ?? 0}
                  </p>
                  {(analysis.formal.summary?.unsupported_reasons ?? []).map((item) => (
                    <p className="issue-meta" key={item.code}>
                      {item.label}: {item.count}
                    </p>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          <IssueSection
            items={analysis.formal?.unsupported_guards}
            onOpenReference={onOpenReference}
            title="Неподдержанные формальные условия"
            type="formal-unsupported"
          />
        </>
      ) : null}
    </section>
  );
}
