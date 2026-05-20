import { useMemo, useState } from "react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import EdgeEditor from "./EdgeEditor";
import ExpressionBuilder from "./ExpressionBuilder";
import NodeEditor from "./NodeEditor";
import {
  buildSignalDefaultValue,
  createEmptyExpressionDraft,
  formatConstInputValue,
  formatConstValue,
  getDirectionDescription,
  getInstanceOutputBindableSignals,
  getReadableSignals,
  parseExpressionString,
  parseDefaultMode,
  serializeExpressionDraft,
  validateConstInput,
} from "../lib/editorModel";
import {
  createExternalModule,
  createModuleInstance,
  validateExternalModuleDraft,
  validateModuleInstanceDraft,
  validateSignalDraft,
  validateStateDraft,
} from "../lib/fsmModel";
import { useFSMStore } from "../store/fsmStore";

const EMPTY_SIGNAL = {
  name: "",
  direction: "input",
  width: 1,
  defaultMode: "auto",
  expressionDraft: null,
};

const EMPTY_EXTERNAL_MODULE = {
  name: "",
  ports: [
    {
      name: "",
      direction: "input",
      width: 1,
    },
  ],
};

const EMPTY_MODULE_INSTANCE = {
  name: "",
  module_name: "",
  connections: {},
};

const REFERENCE_SECTIONS = [
  {
    id: "quick-start",
    title: "Быстрый старт",
    content: [
      "Создать состояния и выбрать начальное состояние.",
      "Добавить сигналы: input, output, output_reg, reg или wire.",
      "Соединить состояния переходами на графе.",
      "При необходимости описать сторонние модули и создать их экземпляры с привязкой портов к локальным сигналам.",
      "Открыть инспектор выделения и задать условия переходов и действия.",
      "Проверить панель диагностики, затем открыть панель сгенерированного HDL и моделирование.",
    ],
  },
  {
    id: "diagnostics",
    title: "Диагностика",
    content: [
      "Панель диагностики агрегирует результаты нескольких независимых слоев анализа: структурного, поведенческого, сигнального, формального и импортного.",
      "Каждая карточка показывает не только саму проблему, но и ее локализацию, тип предлагаемого исправления и область модели, которую это исправление затронет.",
      "Для части типовых ошибок доступны быстрые исправления и подсветка затрагиваемого узла или перехода на графе.",
      "Из карточки сообщения можно сразу открыть тематический раздел справочника с объяснением того, как именно выполняется соответствующая проверка.",
    ],
  },
  {
    id: "analysis-overview",
    title: "Виды анализа",
    content: [
      "Структурный анализ: обход графа состояний от начального узла, поиск недостижимых вершин, состояний без исходящих переходов и простых циклов без выхода.",
      "Поведенческий анализ: сравнение условий исходящих переходов одного состояния, поиск дублирующихся ветвей, конфликтов и неполного набора условий.",
      "Анализ сигналов: проверка того, какие сигналы реально читаются и записываются в условиях, действиях и reset-логике, а также выявление выходов без присваивания.",
      "Анализ безопасности: оценка того, является ли поведение автомата полностью определенным для всех входных комбинаций, или остаются непокрытые случаи.",
      "Формальный анализ условных переходов: строгая проверка overlap и coverage через разбор выражений и полный перебор допустимого домена на поддерживаемом подмножестве Verilog.",
      "Анализ импорта: классификация procedural-блоков импортированного HDL, выделение ролей FSM-блоков, оценка смешения control/datapath и возможности безопасной повторной генерации.",
    ],
  },
  {
    id: "diagnostics-unreachable",
    title: "Недостижимые состояния",
    content: [
      "Проверка выполняется как обход ориентированного графа состояний, начиная с начального состояния.",
      "Если до некоторого узла нельзя добраться ни по одному пути, состояние помечается как недостижимое.",
      "Это означает, что при текущем наборе переходов автомат никогда не попадет в данное состояние.",
      "Типовые причины: забытый входящий переход, ошибка в целевом состоянии перехода или остаточное состояние после редактирования модели.",
      "Типовое исправление: удалить состояние или добавить корректный путь до него.",
    ],
  },
  {
    id: "diagnostics-dead",
    title: "Тупиковые состояния",
    content: [
      "Проверка выполняется по списку исходящих ребер для каждого состояния.",
      "Если у состояния нет ни одного исходящего перехода, оно считается тупиковым.",
      "При попадании в такое состояние автомат перестает изменять состояние, если только это не было задумано явно.",
      "Типовое исправление: добавить выход из состояния или самопереход по умолчанию.",
    ],
  },
  {
    id: "diagnostics-nondet",
    title: "Недетерминированные ветви",
    content: [
      "Проверка анализирует все исходящие переходы каждого состояния как упорядоченный набор условий переходов.",
      "Сначала выявляются точные дубли условий и несколько безусловных ветвей.",
      "Для поддерживаемого подмножества условий переходов дополнительно выполняется строгая проверка пересечения условий; для остальных случаев используется эвристическая оценка.",
      "Особенно опасны несколько fallback-ветвей, одинаковые условия переходов и ситуации, где две ветви могут сработать одновременно.",
      "Типовое исправление: удалить дубли, оставить один fallback-переход и поместить его в конец списка.",
    ],
  },
  {
    id: "diagnostics-unsafe",
    title: "Небезопасные состояния",
    content: [
      "Проверка оценивает, покрывает ли набор условий исходящих переходов все допустимые входные комбинации для состояния.",
      "Отсутствие явного `else` или перехода `1` само по себе не считается ошибкой.",
      "Если набор условий формально полон, например `cond` и `!cond`, состояние не помечается как небезопасное.",
      "Если формальное доказательство недоступно, система показывает, что вывод получен эвристически, а не строго.",
      "Типовое исправление нужно только тогда, когда покрытие действительно неполное или не может быть обосновано на поддерживаемом подмножестве условий.",
    ],
  },
  {
    id: "diagnostics-formal",
    title: "Формальный анализ условий",
    content: [
      "Формальный слой сначала разбирает выражение условия перехода во внутреннее AST-представление.",
      "Далее он определяет набор переменных, их разрядности и оценивает размер полного домена перебора.",
      "Если выражение входит в поддерживаемое подмножество, строится полная таблица истинности или таблица значений для ограниченного домена, после чего доказываются overlap, satisfiable и coverage.",
      "Поддерживаются булевы операции, сравнения, многобитные константы, bit-select, part-select, маски, сдвиги, простая арифметика и reduction-операторы.",
      "Если условие не поддерживается или домен слишком велик, система явно сообщает код и причину fallback, а дальше использует эвристический режим.",
      "Это защищает пользователя от ложного ощущения, что все условия уже строго доказаны.",
    ],
  },
  {
    id: "generation-overview",
    title: "Генерация HDL",
    content: [
      "Система генерирует обычный Verilog-совместимый код: `reg`, `wire`, `output reg`, `always @(*)`, `always @(posedge ...)`, `case`, `localparam`.",
      "Генератор строит заголовок модуля, объявления портов и внутренних сигналов, кодировку состояний и procedural-блоки автомата.",
      "Поддерживаются стили `Автоопределение`, `Разделенный FSM` и `Однопроцессный FSM`.",
      "В разделенном стиле отдельно генерируются регистр состояния, логика переходов, combinational-действия и sequential-действия. В однопроцессном стиле все действия должны быть sequential.",
      "Для каждого состояния и перехода задается домен действий: `comb` или `seq`. От него зависит, в какой always-блок попадут присваивания.",
      "В combinational domain разрешены только blocking-присваивания `=`, а в sequential domain можно использовать `=` и `<=`.",
      "Режим сброса задается отдельно: `async`, `sync` или `none`. В режиме `none` генератор использует `initial` для начальной инициализации.",
      "Для `wire`-сигналов генерируются `assign`-выражения. Сигналы `output`, `output reg` и `reg` можно использовать в действиях состояний и переходов; если обычный `output` присваивается процедурно, генератор выпустит его как `output reg`. Сторонние модули инстанцируются как отдельные экземпляры с именованными подключениями.",
      "При импорте HDL генератор может вернуть исходный код без изменений, если FSM не редактировалась, либо выполнить нормализованную повторную генерацию, если импорт признан безопасным.",
      "Из результата пользователь получает текст модуля, пригодный для просмотра, сохранения, симуляции и повторного импорта в рамках поддерживаемого подмножества Verilog.",
    ],
  },
  {
    id: "quick-fixes",
    title: "Быстрые исправления",
    content: [
      "Кнопка `Применить исправление` изменяет модель автоматически для типовых проблем.",
      "При наведении на исправление на графе подсвечивается место, которое будет затронуто.",
      "Перед применением проверить строки `Исправление`, `Изменение` и `Применяется к` в панели диагностики.",
    ],
  },
  {
    id: "import",
    title: "Импорт и безопасность",
    content: [
      "Импорт используется для извлечения автомата из существующего Verilog-модуля и построения внутренней FSM-модели.",
      "Сначала исходный HDL нормализуется к поддерживаемому подмножеству синтаксиса, затем строится AST, после чего extractor выделяет состояния, переходы, сигналы и procedural-контекст.",
      "Панель `Безопасность импорта` показывает, какие роли обнаружены у always-блоков: state register, next-state logic, output logic, datapath logic и смешанные варианты.",
      "Если модуль содержит тесно смешанную control- и datapath-логику, повторная генерация после правок ограничивается или запрещается.",
      "Если импортированный модуль не изменялся, система старается вернуть исходный HDL без искажений в режиме lossless unchanged export.",
    ],
  },
  {
    id: "external-modules",
    title: "Сторонние модули",
    content: [
      "Во вкладке `Сторонние модули` можно описать интерфейс внешнего HDL-модуля: имя, порты, направления и разрядности.",
      "После описания интерфейса можно создать экземпляр такого модуля внутри текущего проекта и привязать его порты к локальным сигналам.",
      "Для входных портов экземпляра поддерживаются два режима подключения: локальный сигнал или числовая константа.",
      "Для выходных портов экземпляра разрешены подключения только к `wire` или обычному `output`, чтобы сохранить корректную net-семантику Verilog.",
      "Система генерирует только инстанцирование стороннего модуля. Его реализация должна поставляться отдельно вместе с проектом или библиотекой.",
    ],
  },
  {
    id: "simulation",
    title: "Моделирование",
    content: [
      "Панель моделирования запускает `iverilog` и `vvp` для текущего HDL и testbench.",
      "Автоматический testbench строится по реальным портам модуля.",
      "Если моделирование не запускается, сначала проверь наличие `iverilog` и `vvp` в PATH.",
      "Стандартный вывод и сообщения об ошибках показываются отдельно.",
    ],
  },
  {
    id: "common-errors",
    title: "Типовые ошибки",
    content: [
      "Лишнее поле во входных данных: в модель попал параметр, которого не ожидает backend.",
      "Неизвестное состояние или сигнал: ссылка в переходе или действии указывает на несуществующий объект.",
      "Для wire обязательно задать выражение: сигнал wire не может быть пустым.",
      "Некорректная константа: введенное значение не входит в допустимый диапазон для разрядности сигнала.",
      "Ограничение повторной генерации после импорта: модуль содержит структуру, которую нельзя безопасно перестроить только по модели FSM.",
    ],
  },
];

function normalizeSignalDraft(signal) {
  const normalized = {
    ...signal,
    expressionDraft: signal.expressionDraft ?? createEmptyExpressionDraft([]),
  };

  if (signal.direction !== "output_reg") {
    normalized.defaultMode = "auto";
  }

  if (signal.direction !== "wire") {
    normalized.expressionDraft = createEmptyExpressionDraft([]);
  }

  return normalized;
}

function SignalDraftForm({ draft, error, fsm, numberDisplayMode, onChange }) {
  return (
    <div className="form-grid">
      <div className="signal-type-picker">
        <span className="field-label">Тип сигнала</span>
        <Tabs
          onValueChange={(direction) =>
            onChange((current) =>
              normalizeSignalDraft({
                ...current,
                direction,
              }),
            )
          }
          value={draft.direction}
        >
          <TabsList className="grid w-full grid-cols-2 xl:grid-cols-5">
            <TabsTrigger value="input">input</TabsTrigger>
            <TabsTrigger value="output">output</TabsTrigger>
            <TabsTrigger value="output_reg">output reg</TabsTrigger>
            <TabsTrigger value="reg">reg</TabsTrigger>
            <TabsTrigger value="wire">wire</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <label className="field">
        <span>Имя</span>
        <Input
          onChange={(event) => onChange((current) => ({ ...current, name: event.target.value }))}
          placeholder="req"
          value={draft.name}
        />
      </label>

      <div className="field-row field-row-tight">
        <label className="field">
          <span>Разрядность</span>
          <Input
            min="1"
            onChange={(event) => onChange((current) => ({ ...current, width: event.target.value }))}
            type="number"
            value={draft.width}
          />
        </label>
      </div>

      <p className="field-hint">{getDirectionDescription(draft.direction)}</p>

      {draft.direction === "output_reg" ? (
        <label className="field">
          <span>Значение при reset</span>
          <Select
            onValueChange={(value) =>
              onChange((current) => ({
                ...current,
                defaultMode: value,
              }))
            }
            value={draft.defaultMode}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Автоматический ноль</SelectItem>
              <SelectItem value="zero">Принудительный ноль</SelectItem>
              <SelectItem value="one">Принудительная единица</SelectItem>
            </SelectContent>
          </Select>
        </label>
      ) : null}

      {draft.direction === "wire" ? (
        <ExpressionBuilder
          emptyHint="Добавить исходные сигналы перед определением этого wire."
          expression={serializeExpressionDraft(
            draft.expressionDraft,
            fsm.signals,
            Number(draft.width) || 1,
            numberDisplayMode,
          )}
          fsm={fsm}
          onChange={(expression) =>
            onChange((current) => ({
              ...current,
              expressionDraft:
                parseExpressionString(
                  expression,
                  fsm.signals,
                  Number(current.width) || 1,
                ) ?? current.expressionDraft,
            }))
          }
          title="Выражение wire"
          width={Number(draft.width) || 1}
        />
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}

function ExternalModuleDraftForm({ draft, error, onChange }) {
  const updatePort = (index, data) => {
    onChange((current) => ({
      ...current,
      ports: current.ports.map((port, portIndex) =>
        portIndex === index ? { ...port, ...data } : port),
    }));
  };

  const addPort = () => {
    onChange((current) => ({
      ...current,
      ports: [
        ...current.ports,
        { name: "", direction: "input", width: 1 },
      ],
    }));
  };

  const removePort = (index) => {
    onChange((current) => ({
      ...current,
      ports: current.ports.filter((_, portIndex) => portIndex !== index),
    }));
  };

  return (
    <div className="form-grid">
      <label className="field">
        <span>Имя внешнего модуля</span>
        <Input
          onChange={(event) => onChange((current) => ({ ...current, name: event.target.value }))}
          placeholder="alu_core"
          value={draft.name}
        />
      </label>

      <div className="field">
        <div className="inline-actions">
          <span className="field-label">Порты интерфейса</span>
          <Button onClick={addPort} size="sm" type="button" variant="outline">
            Добавить порт
          </Button>
        </div>
        <div className="list-stack">
          {draft.ports.map((port, index) => (
            <div className="list-item" key={`${port.name || "port"}-${index}`}>
              <div className="form-grid">
                <label className="field">
                  <span>Имя порта</span>
                  <Input
                    onChange={(event) => updatePort(index, { name: event.target.value })}
                    placeholder="data_i"
                    value={port.name}
                  />
                </label>
                <label className="field">
                  <span>Направление</span>
                  <Select
                    onValueChange={(value) => updatePort(index, { direction: value })}
                    value={port.direction}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="input">input</SelectItem>
                      <SelectItem value="output">output</SelectItem>
                      <SelectItem value="output_reg">output reg</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="field">
                  <span>Разрядность</span>
                  <Input
                    min="1"
                    onChange={(event) => updatePort(index, { width: event.target.value })}
                    type="number"
                    value={port.width}
                  />
                </label>
                <div className="inline-actions">
                  <Button onClick={() => removePort(index)} size="sm" type="button" variant="outline">
                    Удалить порт
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}

function ModuleInstanceDraftForm({
  draft,
  error,
  externalModules,
  numberDisplayMode,
  signals,
  onChange,
}) {
  const selectedModule = useMemo(
    () => externalModules.find((module) => module.name === draft.module_name) ?? null,
    [draft.module_name, externalModules],
  );
  const readableSignals = useMemo(() => getReadableSignals(signals), [signals]);
  const outputBindableSignals = useMemo(() => getInstanceOutputBindableSignals(signals), [signals]);
  const [constEditors, setConstEditors] = useState({});
  const [constErrors, setConstErrors] = useState({});

  const updateConnection = (portName, value) => {
    onChange((current) => ({
      ...current,
      connections: {
        ...current.connections,
        [portName]: value,
      },
    }));
  };

  const getConnectionMode = (port) => {
    const value = draft.connections?.[port.name] ?? "";
    if (port.direction !== "input") {
      return "signal";
    }
    return readableSignals.includes(value) ? "signal" : "const";
  };

  const setConnectionMode = (port, mode) => {
    if (mode === "signal") {
      updateConnection(port.name, readableSignals[0] ?? "");
      setConstErrors((current) => ({ ...current, [port.name]: "" }));
      return;
    }

    const nextValue = formatConstValue(0, port.width, numberDisplayMode);
    updateConnection(port.name, nextValue);
    setConstEditors((current) => ({
      ...current,
      [port.name]: formatConstInputValue(0, port.width, numberDisplayMode),
    }));
    setConstErrors((current) => ({ ...current, [port.name]: "" }));
  };

  const handleConstChange = (port, rawValue) => {
    setConstEditors((current) => ({
      ...current,
      [port.name]: rawValue,
    }));
    const validation = validateConstInput(rawValue, port.width, numberDisplayMode);
    if (!validation.ok) {
      setConstErrors((current) => ({
        ...current,
        [port.name]: validation.error,
      }));
      return;
    }
    setConstErrors((current) => ({
      ...current,
      [port.name]: "",
    }));
    updateConnection(port.name, formatConstValue(validation.value, port.width, numberDisplayMode));
  };

  return (
    <div className="form-grid">
      <label className="field">
        <span>Имя экземпляра</span>
        <Input
          onChange={(event) => onChange((current) => ({ ...current, name: event.target.value }))}
          placeholder="alu0"
          value={draft.name}
        />
      </label>

      <label className="field">
        <span>Внешний модуль</span>
        <Select
          onValueChange={(value) =>
            onChange((current) => ({
              ...current,
              module_name: value,
              connections: {},
            }))
          }
          value={draft.module_name || undefined}
        >
          <SelectTrigger>
            <SelectValue placeholder="Выбери внешний модуль" />
          </SelectTrigger>
          <SelectContent>
            {externalModules.map((module) => (
              <SelectItem key={module.name} value={module.name}>
                {module.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      {selectedModule ? (
        <div className="field">
          <span className="field-label">Подключения портов</span>
          <div className="list-stack">
            {selectedModule.ports.map((port) => {
              const candidateSignals = port.direction === "input" ? readableSignals : outputBindableSignals;
              const connectionMode = getConnectionMode(port);
              return (
                <label className="field" key={port.name}>
                  <span>
                    {port.name} ({port.direction}, width {port.width})
                  </span>
                  {port.direction === "input" ? (
                    <>
                      <Select
                        onValueChange={(value) => setConnectionMode(port, value)}
                        value={connectionMode}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="signal">Локальный сигнал</SelectItem>
                          <SelectItem value="const">Константа</SelectItem>
                        </SelectContent>
                      </Select>

                      {connectionMode === "signal" ? (
                        <Select
                          onValueChange={(value) => updateConnection(port.name, value)}
                          value={draft.connections?.[port.name] || undefined}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Выбери сигнал" />
                          </SelectTrigger>
                          <SelectContent>
                            {candidateSignals.map((signalName) => (
                              <SelectItem key={`${port.name}-${signalName}`} value={signalName}>
                                {signalName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <>
                          <Input
                            onChange={(event) => handleConstChange(port, event.target.value)}
                            placeholder={numberDisplayMode === "binary" ? "например 0001" : "например 5"}
                            value={
                              constEditors[port.name]
                              ?? formatConstInputValue(0, port.width, numberDisplayMode)
                            }
                          />
                          <span className="field-hint">
                            {numberDisplayMode === "binary"
                              ? `Допустимо до ${port.width} двоичных разрядов. В HDL будет сохранено как ${draft.connections?.[port.name] || formatConstValue(0, port.width, numberDisplayMode)}.`
                              : `Допустимый диапазон: 0..${(2 ** Math.max(1, port.width)) - 1}. В HDL будет сохранено как ${draft.connections?.[port.name] || formatConstValue(0, port.width, numberDisplayMode)}.`}
                          </span>
                          {constErrors[port.name] ? <span className="form-error">{constErrors[port.name]}</span> : null}
                        </>
                      )}
                    </>
                  ) : (
                    <Select
                      onValueChange={(value) => updateConnection(port.name, value)}
                      value={draft.connections?.[port.name] || undefined}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Выбери сигнал" />
                      </SelectTrigger>
                      <SelectContent>
                        {candidateSignals.map((signalName) => (
                          <SelectItem key={`${port.name}-${signalName}`} value={signalName}>
                            {signalName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="field-hint">Сначала выбери описанный внешний модуль.</p>
      )}

      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}

export default function Sidebar({
  onReferenceDialogOpenChange,
  onReferenceOpen,
  referenceDialogOpen = false,
  referenceDialogVersion = 0,
  referenceSection = "quick-start",
}) {
  const {
    addSignal,
    addExternalModule,
    addModuleInstance,
    addState,
    clearSelection,
    fsm,
    removeExternalModule,
    removeModuleInstance,
    numberDisplayMode,
    removeSignal,
    setNumberDisplayMode,
    updateFSMOptions,
    updateExternalModule,
    updateModuleInstance,
    updateSignal,
    selectState,
    selectedEdgeIndex,
    selectedState,
  } = useFSMStore();
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [signalsDialogOpen, setSignalsDialogOpen] = useState(false);
  const [integrationDialogOpen, setIntegrationDialogOpen] = useState(false);
  const [stateDialogOpen, setStateDialogOpen] = useState(false);
  const [signalDialogOpen, setSignalDialogOpen] = useState(false);
  const [editSignalDialogOpen, setEditSignalDialogOpen] = useState(false);
  const [externalModuleDialogOpen, setExternalModuleDialogOpen] = useState(false);
  const [editExternalModuleDialogOpen, setEditExternalModuleDialogOpen] = useState(false);
  const [moduleInstanceDialogOpen, setModuleInstanceDialogOpen] = useState(false);
  const [editModuleInstanceDialogOpen, setEditModuleInstanceDialogOpen] = useState(false);
  const [newSignal, setNewSignal] = useState(EMPTY_SIGNAL);
  const [newStateName, setNewStateName] = useState("");
  const [signalError, setSignalError] = useState("");
  const [stateError, setStateError] = useState("");
  const [editingSignalName, setEditingSignalName] = useState(null);
  const [editingSignal, setEditingSignal] = useState(EMPTY_SIGNAL);
  const [editingSignalError, setEditingSignalError] = useState("");
  const [newExternalModule, setNewExternalModule] = useState(EMPTY_EXTERNAL_MODULE);
  const [newExternalModuleError, setNewExternalModuleError] = useState("");
  const [editingExternalModuleName, setEditingExternalModuleName] = useState(null);
  const [editingExternalModule, setEditingExternalModule] = useState(EMPTY_EXTERNAL_MODULE);
  const [editingExternalModuleError, setEditingExternalModuleError] = useState("");
  const [newModuleInstance, setNewModuleInstance] = useState(EMPTY_MODULE_INSTANCE);
  const [newModuleInstanceError, setNewModuleInstanceError] = useState("");
  const [editingModuleInstanceName, setEditingModuleInstanceName] = useState(null);
  const [editingModuleInstance, setEditingModuleInstance] = useState(EMPTY_MODULE_INSTANCE);
  const [editingModuleInstanceError, setEditingModuleInstanceError] = useState("");

  const buildPersistedSignal = (signalDraft) => ({
    name: signalDraft.name,
    direction: signalDraft.direction,
    width: signalDraft.width,
    default: buildSignalDefaultValue(
      signalDraft.direction,
      Number(signalDraft.width) || 1,
      signalDraft.defaultMode,
    ),
    expression: signalDraft.direction === "wire"
      ? serializeExpressionDraft(
          signalDraft.expressionDraft,
          fsm.signals,
          Number(signalDraft.width) || 1,
          numberDisplayMode,
        )
      : "",
  });

  const nextSignalError = validateSignalDraft(buildPersistedSignal(newSignal), fsm.signals);
  const nextStateError = validateStateDraft(newStateName, fsm.states);
  const nextExternalModuleError = validateExternalModuleDraft(newExternalModule, fsm.external_modules);
  const nextModuleInstanceError = validateModuleInstanceDraft(
    newModuleInstance,
    fsm.external_modules,
    fsm.signals,
    fsm.module_instances,
  );

  const handleSignalSubmit = (event) => {
    event.preventDefault();
    const result = addSignal(buildPersistedSignal(newSignal));
    if (!result.ok) {
      setSignalError(result.error);
      return;
    }
    setNewSignal(EMPTY_SIGNAL);
    setSignalError("");
    setSignalDialogOpen(false);
  };

  const handleStateSubmit = (event) => {
    event.preventDefault();
    const result = addState(newStateName);
    if (!result.ok) {
      setStateError(result.error);
      return;
    }
    setNewStateName("");
    setStateError("");
    setStateDialogOpen(false);
  };

  const startSignalEdit = (signal) => {
    setEditingSignalName(signal.name);
    setEditingSignal(
      normalizeSignalDraft({
        name: signal.name,
        direction: signal.direction,
        width: signal.width,
        defaultMode: parseDefaultMode(signal),
        expressionDraft: parseExpressionString(signal.expression ?? "", fsm.signals, signal.width)
          ?? createEmptyExpressionDraft(fsm.signals.map((item) => item.name)),
      }),
    );
    setEditingSignalError("");
    setEditSignalDialogOpen(true);
  };

  const cancelSignalEdit = () => {
    setEditingSignalName(null);
    setEditingSignal(EMPTY_SIGNAL);
    setEditingSignalError("");
    setEditSignalDialogOpen(false);
  };

  const handleSignalUpdate = (event) => {
    event.preventDefault();
    const result = updateSignal(editingSignalName, buildPersistedSignal(editingSignal));
    if (!result.ok) {
      setEditingSignalError(result.error);
      return;
    }
    cancelSignalEdit();
  };

  const handleExternalModuleSubmit = (event) => {
    event.preventDefault();
    const result = addExternalModule(createExternalModule(newExternalModule));
    if (!result.ok) {
      setNewExternalModuleError(result.error);
      return;
    }
    setNewExternalModule(EMPTY_EXTERNAL_MODULE);
    setNewExternalModuleError("");
    setExternalModuleDialogOpen(false);
  };

  const startExternalModuleEdit = (module) => {
    setEditingExternalModuleName(module.name);
    setEditingExternalModule(createExternalModule(module));
    setEditingExternalModuleError("");
    setEditExternalModuleDialogOpen(true);
  };

  const cancelExternalModuleEdit = () => {
    setEditingExternalModuleName(null);
    setEditingExternalModule(EMPTY_EXTERNAL_MODULE);
    setEditingExternalModuleError("");
    setEditExternalModuleDialogOpen(false);
  };

  const handleExternalModuleUpdate = (event) => {
    event.preventDefault();
    const result = updateExternalModule(editingExternalModuleName, createExternalModule(editingExternalModule));
    if (!result.ok) {
      setEditingExternalModuleError(result.error);
      return;
    }
    cancelExternalModuleEdit();
  };

  const handleModuleInstanceSubmit = (event) => {
    event.preventDefault();
    const result = addModuleInstance(createModuleInstance(newModuleInstance));
    if (!result.ok) {
      setNewModuleInstanceError(result.error);
      return;
    }
    setNewModuleInstance(EMPTY_MODULE_INSTANCE);
    setNewModuleInstanceError("");
    setModuleInstanceDialogOpen(false);
  };

  const startModuleInstanceEdit = (instance) => {
    setEditingModuleInstanceName(instance.name);
    setEditingModuleInstance(createModuleInstance(instance));
    setEditingModuleInstanceError("");
    setEditModuleInstanceDialogOpen(true);
  };

  const cancelModuleInstanceEdit = () => {
    setEditingModuleInstanceName(null);
    setEditingModuleInstance(EMPTY_MODULE_INSTANCE);
    setEditingModuleInstanceError("");
    setEditModuleInstanceDialogOpen(false);
  };

  const handleModuleInstanceUpdate = (event) => {
    event.preventDefault();
    const result = updateModuleInstance(editingModuleInstanceName, createModuleInstance(editingModuleInstance));
    if (!result.ok) {
      setEditingModuleInstanceError(result.error);
      return;
    }
    cancelModuleInstanceEdit();
  };

  return (
    <aside className="sidebar">
      <section className="panel sidebar-section">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Рабочая область</p>
            <h2>Модель FSM</h2>
            <p className="field-hint">
              Режим чисел: {numberDisplayMode === "binary" ? "двоичный" : "десятичный"}
            </p>
          </div>
          <div className="panel-actions">
            <Button onClick={() => setStateDialogOpen(true)} size="sm" type="button">
              Новое состояние
            </Button>
            <Button onClick={() => setSignalsDialogOpen(true)} size="sm" type="button" variant="outline">
              Сигналы
            </Button>
            <Button onClick={() => setIntegrationDialogOpen(true)} size="sm" type="button" variant="outline">
              Сторонние модули
            </Button>
            <Button onClick={clearSelection} size="sm" type="button" variant="outline">
              Снять выделение
            </Button>
            <Button onClick={() => setSettingsDialogOpen(true)} size="sm" type="button" variant="outline">
              Настройки
            </Button>
            <Button
              onClick={() => (onReferenceOpen ? onReferenceOpen("quick-start") : onReferenceDialogOpenChange?.(true))}
              size="sm"
              type="button"
              variant="outline"
            >
              Справочник
            </Button>
          </div>
        </div>

        <Accordion className="w-full" defaultValue={["states", "signals", "integration", "inspector"]} type="multiple">
          <AccordionItem value="states">
            <AccordionTrigger>Состояния</AccordionTrigger>
            <AccordionContent>
              <div className="state-list">
                {fsm.states.length === 0 ? (
                  <p className="empty-copy">Добавить первое состояние, чтобы начать редактирование графа FSM.</p>
                ) : (
                  fsm.states.map((state) => (
                    <button
                      className={`state-chip ${selectedState === state.name ? "is-selected" : ""}`}
                      key={state.name}
                      onClick={() => selectState(state.name)}
                      type="button"
                    >
                      <span>{state.name}</span>
                      {state.is_initial ? <small>начальное</small> : null}
                    </button>
                  ))
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="signals">
            <AccordionTrigger>Сигналы</AccordionTrigger>
            <AccordionContent>
              <div className="builder-stack">
                <div className="builder-card">
                  <p className="field-hint">
                    Просмотр и редактирование сигналов вынесены в отдельное окно, чтобы не перегружать боковую панель.
                  </p>
                  <div className="inline-actions">
                    <Button onClick={() => setSignalsDialogOpen(true)} size="sm" type="button" variant="outline">
                      Открыть список сигналов
                    </Button>
                    <Button onClick={() => setSignalDialogOpen(true)} size="sm" type="button">
                      Добавить сигнал
                    </Button>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="integration">
            <AccordionTrigger>Сторонние модули</AccordionTrigger>
            <AccordionContent>
              <div className="builder-stack">
                <div className="builder-card">
                  <p className="field-hint">
                    Здесь настраиваются интерфейсы внешних модулей и их экземпляры внутри текущего HDL-модуля.
                  </p>
                  <div className="inline-actions">
                    <Button onClick={() => setIntegrationDialogOpen(true)} size="sm" type="button" variant="outline">
                      Открыть интеграцию
                    </Button>
                    <Button onClick={() => setExternalModuleDialogOpen(true)} size="sm" type="button">
                      Описать модуль
                    </Button>
                  </div>
                  <p className="field-hint">
                    Описывай только интерфейс стороннего модуля. Его реализация должна поставляться отдельно вместе с проектом или библиотекой.
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="inspector">
            <AccordionTrigger>Инспектор выделения</AccordionTrigger>
            <AccordionContent>
              {selectedState ? <NodeEditor key={selectedState} stateName={selectedState} /> : null}
              {selectedEdgeIndex !== null ? <EdgeEditor key={selectedEdgeIndex} edgeIndex={selectedEdgeIndex} /> : null}
              {!selectedState && selectedEdgeIndex === null ? (
                <p className="empty-copy">
                  Выдели состояние или переход на графе, чтобы редактировать действия, условия и флаги жизненного цикла.
                </p>
              ) : null}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      <Dialog onOpenChange={setSettingsDialogOpen} open={settingsDialogOpen}>
        <DialogContent>
          <div className="form-grid">
            <DialogHeader>
              <DialogTitle>Общие настройки</DialogTitle>
              <DialogDescription>
                Эти параметры влияют на отображение чисел и на стиль генерации HDL.
              </DialogDescription>
            </DialogHeader>

            <label className="field">
              <span>Режим отображения чисел</span>
              <Select onValueChange={setNumberDisplayMode} value={numberDisplayMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="decimal">Десятичный</SelectItem>
                  <SelectItem value="binary">Двоичный</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <p className="field-hint">
              В десятичном режиме константы показываются как `8'd15`, а в двоичном как `8'b00001111`.
            </p>

            <label className="field">
              <span>Стиль генерации FSM</span>
              <Select
                onValueChange={(value) => updateFSMOptions({ generation_style: value })}
                value={fsm.generation_style ?? "auto"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Автоопределение</SelectItem>
                  <SelectItem value="two_process">Разделенный FSM</SelectItem>
                  <SelectItem value="single_process">Однопроцессный FSM</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <p className="field-hint">
              `Разделенный FSM` использует отдельные блоки для регистра состояния, логики переходов и действий. `Однопроцессный FSM` подходит только для sequential-действий.
            </p>

            <label className="field">
              <span>Режим сброса</span>
              <Select
                onValueChange={(value) => updateFSMOptions({ reset_mode: value })}
                value={fsm.reset_mode ?? "async"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="async">Асинхронный</SelectItem>
                  <SelectItem value="sync">Синхронный</SelectItem>
                  <SelectItem value="none">Без сброса</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <p className="field-hint">
              В режиме `Без сброса` генератор использует `initial` для начальной инициализации состояния и sequential-регистров.
            </p>

            <DialogFooter>
              <Button onClick={() => setSettingsDialogOpen(false)} type="button">
                Готово
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setSignalsDialogOpen} open={signalsDialogOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto !w-[min(94vw,62rem)]">
          <div className="form-grid">
            <DialogHeader>
              <DialogTitle>Сигналы модуля</DialogTitle>
              <DialogDescription>
                Отдельное окно для просмотра, создания и редактирования сигналов.
              </DialogDescription>
            </DialogHeader>

            <div className="inline-actions">
              <Button onClick={() => setSignalDialogOpen(true)} type="button">
                Новый сигнал
              </Button>
            </div>

            <div className="list-stack">
              {fsm.signals.length === 0 ? (
                <p className="empty-copy">Сигналы еще не добавлены.</p>
              ) : (
                fsm.signals.map((signal) => (
                  <div className="list-item" key={signal.name}>
                    <div>
                      <strong>{signal.name}</strong>
                      <p>
                        {signal.direction} · width {signal.width}
                        {signal.default ? ` · default ${signal.default}` : ""}
                        {signal.expression ? ` · expr ${signal.expression}` : ""}
                      </p>
                    </div>
                    <div className="inline-actions">
                      <Button onClick={() => startSignalEdit(signal)} size="sm" type="button" variant="outline">
                        Изменить
                      </Button>
                      <Button onClick={() => removeSignal(signal.name)} size="sm" type="button" variant="outline">
                        Удалить
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <DialogFooter>
              <Button onClick={() => setSignalsDialogOpen(false)} type="button">
                Закрыть
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setIntegrationDialogOpen} open={integrationDialogOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto !w-[min(94vw,72rem)]">
          <div className="form-grid">
            <DialogHeader>
              <DialogTitle>Сторонние модули и экземпляры</DialogTitle>
              <DialogDescription>
                Опиши интерфейс внешнего модуля, затем создай его экземпляры и привяжи порты к сигналам текущего модуля.
              </DialogDescription>
            </DialogHeader>

            <div className="inline-actions">
              <Button onClick={() => setExternalModuleDialogOpen(true)} type="button">
                Новый внешний модуль
              </Button>
              <Button
                onClick={() => setModuleInstanceDialogOpen(true)}
                type="button"
                variant="outline"
              >
                Новый экземпляр
              </Button>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <section className="list-stack">
                <div>
                  <p className="eyebrow">Интерфейсы</p>
                  <h3>Описания внешних модулей</h3>
                </div>
                {fsm.external_modules.length === 0 ? (
                  <p className="empty-copy">Интерфейсы внешних модулей еще не описаны.</p>
                ) : (
                  fsm.external_modules.map((module) => (
                    <div className="list-item" key={module.name}>
                      <div>
                        <strong>{module.name}</strong>
                        <p>
                          {module.ports.length} порт(ов): {module.ports.map((port) => `${port.direction} ${port.name}[${port.width}]`).join(", ")}
                        </p>
                      </div>
                      <div className="inline-actions">
                        <Button onClick={() => startExternalModuleEdit(module)} size="sm" type="button" variant="outline">
                          Изменить
                        </Button>
                        <Button onClick={() => removeExternalModule(module.name)} size="sm" type="button" variant="outline">
                          Удалить
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </section>

              <section className="list-stack">
                <div>
                  <p className="eyebrow">Инстанцирование</p>
                  <h3>Экземпляры в текущем модуле</h3>
                </div>
                {fsm.module_instances.length === 0 ? (
                  <p className="empty-copy">Экземпляры внешних модулей еще не добавлены.</p>
                ) : (
                  fsm.module_instances.map((instance) => (
                    <div className="list-item" key={instance.name}>
                      <div>
                        <strong>{instance.name}</strong>
                        <p>{instance.module_name}</p>
                        <p>
                          {Object.entries(instance.connections ?? {}).map(([portName, signalName]) => `.${portName}(${signalName})`).join(", ")}
                        </p>
                      </div>
                      <div className="inline-actions">
                        <Button onClick={() => startModuleInstanceEdit(instance)} size="sm" type="button" variant="outline">
                          Изменить
                        </Button>
                        <Button onClick={() => removeModuleInstance(instance.name)} size="sm" type="button" variant="outline">
                          Удалить
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </section>
            </div>

            <DialogFooter>
              <Button onClick={() => setIntegrationDialogOpen(false)} type="button">
                Закрыть
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={onReferenceDialogOpenChange} open={referenceDialogOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto !w-[min(94vw,64rem)]">
          <div className="form-grid">
            <DialogHeader>
              <DialogTitle>Справочник по использованию приложения</DialogTitle>
              <DialogDescription>
                Краткое руководство по работе с редактором, диагностикой, импортом и моделированием.
              </DialogDescription>
            </DialogHeader>

            <Accordion
              className="w-full"
              defaultValue={[referenceSection, "diagnostics"]}
              key={`${referenceDialogVersion}-${referenceSection}`}
              type="multiple"
            >
              {REFERENCE_SECTIONS.map((section) => (
                <AccordionItem key={section.id} value={section.id}>
                  <AccordionTrigger>{section.title}</AccordionTrigger>
                  <AccordionContent>
                    <div className="list-stack">
                      {section.content.map((item, index) => (
                        <p key={`${section.id}-${index}`}>{item}</p>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
            <DialogFooter>
              <Button onClick={() => onReferenceDialogOpenChange?.(false)} type="button">
                Закрыть
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setStateDialogOpen} open={stateDialogOpen}>
        <DialogContent>
          <form className="form-grid" onSubmit={handleStateSubmit}>
            <DialogHeader>
              <DialogTitle>Новое состояние</DialogTitle>
              <DialogDescription>Создай состояние без прокрутки sidebar.</DialogDescription>
            </DialogHeader>
            <label className="field">
              <span>Имя состояния</span>
              <Input
                onChange={(event) => {
                  setNewStateName(event.target.value);
                  if (stateError) {
                    setStateError("");
                  }
                }}
                placeholder="FETCH"
                value={newStateName}
              />
            </label>
            {stateError ? <p className="form-error">{stateError}</p> : null}
            {!stateError && newStateName.trim() && nextStateError ? (
              <p className="field-hint">{nextStateError}</p>
            ) : null}
            <DialogFooter>
              <Button onClick={() => setStateDialogOpen(false)} type="button" variant="outline">
                Отменить
              </Button>
              <Button type="submit">Добавить состояние</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setSignalDialogOpen} open={signalDialogOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto">
          <form className="form-grid" onSubmit={handleSignalSubmit}>
            <DialogHeader>
              <DialogTitle>Новый сигнал</DialogTitle>
              <DialogDescription>Порт или внутренняя линия настраиваются в отдельном окне.</DialogDescription>
            </DialogHeader>
            <SignalDraftForm
              draft={newSignal}
              error={signalError}
              fsm={fsm}
              numberDisplayMode={numberDisplayMode}
              onChange={(updater) => {
                setNewSignal(updater);
                if (signalError) {
                  setSignalError("");
                }
              }}
            />
            {!signalError && newSignal.name.trim() && nextSignalError ? (
              <p className="field-hint">{nextSignalError}</p>
            ) : null}
            <DialogFooter>
              <Button onClick={() => setSignalDialogOpen(false)} type="button" variant="outline">
                Отменить
              </Button>
              <Button type="submit">Добавить сигнал</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setExternalModuleDialogOpen} open={externalModuleDialogOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto !w-[min(94vw,60rem)]">
          <form className="form-grid" onSubmit={handleExternalModuleSubmit}>
            <DialogHeader>
              <DialogTitle>Новый внешний модуль</DialogTitle>
              <DialogDescription>
                Опиши только интерфейс: имена портов, направления и разрядности.
              </DialogDescription>
            </DialogHeader>
            <ExternalModuleDraftForm
              draft={newExternalModule}
              error={newExternalModuleError}
              onChange={(updater) => {
                setNewExternalModule((current) => (typeof updater === "function" ? updater(current) : updater));
                if (newExternalModuleError) {
                  setNewExternalModuleError("");
                }
              }}
            />
            {!newExternalModuleError && newExternalModule.name.trim() && nextExternalModuleError ? (
              <p className="field-hint">{nextExternalModuleError}</p>
            ) : null}
            <DialogFooter>
              <Button onClick={() => setExternalModuleDialogOpen(false)} type="button" variant="outline">
                Отменить
              </Button>
              <Button type="submit">Добавить внешний модуль</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => !open && cancelExternalModuleEdit()} open={editExternalModuleDialogOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto !w-[min(94vw,60rem)]">
          <form className="form-grid" onSubmit={handleExternalModuleUpdate}>
            <DialogHeader>
              <DialogTitle>Редактирование внешнего модуля</DialogTitle>
              <DialogDescription>
                Изменения интерфейса автоматически повлияют на доступные подключения его экземпляров.
              </DialogDescription>
            </DialogHeader>
            <ExternalModuleDraftForm
              draft={editingExternalModule}
              error={editingExternalModuleError}
              onChange={(updater) => {
                setEditingExternalModule((current) => (typeof updater === "function" ? updater(current) : updater));
                if (editingExternalModuleError) {
                  setEditingExternalModuleError("");
                }
              }}
            />
            <DialogFooter>
              <Button onClick={cancelExternalModuleEdit} type="button" variant="outline">
                Отменить
              </Button>
              <Button type="submit">Сохранить интерфейс</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setModuleInstanceDialogOpen} open={moduleInstanceDialogOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto !w-[min(94vw,60rem)]">
          <form className="form-grid" onSubmit={handleModuleInstanceSubmit}>
            <DialogHeader>
              <DialogTitle>Новый экземпляр модуля</DialogTitle>
              <DialogDescription>
                Выбери внешний модуль и привяжи его порты к локальным сигналам текущего проекта.
              </DialogDescription>
            </DialogHeader>
            <ModuleInstanceDraftForm
              draft={newModuleInstance}
              error={newModuleInstanceError}
              externalModules={fsm.external_modules}
              numberDisplayMode={numberDisplayMode}
              onChange={(updater) => {
                setNewModuleInstance((current) => (typeof updater === "function" ? updater(current) : updater));
                if (newModuleInstanceError) {
                  setNewModuleInstanceError("");
                }
              }}
              signals={fsm.signals}
            />
            {!newModuleInstanceError && newModuleInstance.name.trim() && nextModuleInstanceError ? (
              <p className="field-hint">{nextModuleInstanceError}</p>
            ) : null}
            <DialogFooter>
              <Button onClick={() => setModuleInstanceDialogOpen(false)} type="button" variant="outline">
                Отменить
              </Button>
              <Button type="submit">Добавить экземпляр</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => !open && cancelModuleInstanceEdit()} open={editModuleInstanceDialogOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto !w-[min(94vw,60rem)]">
          <form className="form-grid" onSubmit={handleModuleInstanceUpdate}>
            <DialogHeader>
              <DialogTitle>Редактирование экземпляра</DialogTitle>
              <DialogDescription>
                Измени имя экземпляра, выбранный внешний модуль и его подключения.
              </DialogDescription>
            </DialogHeader>
            <ModuleInstanceDraftForm
              draft={editingModuleInstance}
              error={editingModuleInstanceError}
              externalModules={fsm.external_modules}
              numberDisplayMode={numberDisplayMode}
              onChange={(updater) => {
                setEditingModuleInstance((current) => (typeof updater === "function" ? updater(current) : updater));
                if (editingModuleInstanceError) {
                  setEditingModuleInstanceError("");
                }
              }}
              signals={fsm.signals}
            />
            <DialogFooter>
              <Button onClick={cancelModuleInstanceEdit} type="button" variant="outline">
                Отменить
              </Button>
              <Button type="submit">Сохранить экземпляр</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => !open && cancelSignalEdit()} open={editSignalDialogOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto">
          <form className="form-grid" onSubmit={handleSignalUpdate}>
            <DialogHeader>
              <DialogTitle>Редактирование сигнала</DialogTitle>
              <DialogDescription>Измени тип, разрядность и выражение без длинной прокрутки.</DialogDescription>
            </DialogHeader>
            <SignalDraftForm
              draft={editingSignal}
              error={editingSignalError}
              fsm={fsm}
              numberDisplayMode={numberDisplayMode}
              onChange={(updater) => {
                setEditingSignal(updater);
                if (editingSignalError) {
                  setEditingSignalError("");
                }
              }}
            />
            <DialogFooter>
              <Button onClick={cancelSignalEdit} type="button" variant="outline">
                Отменить
              </Button>
              <Button type="submit">Сохранить</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
