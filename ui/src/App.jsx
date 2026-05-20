import { lazy, startTransition, Suspense, useEffect, useMemo, useState } from "react";

import { analyzeFSM, generateVerilog, importVerilogModule, simulateModule } from "./api";
import { serializeFSM, validateFSM } from "./lib/fsmModel";
import { useFSMStore } from "./store/fsmStore";
import "./App.css";

const GraphEditor = lazy(() => import("./components/GraphEditor"));
const Sidebar = lazy(() => import("./components/Sidebar"));
const VerilogView = lazy(() => import("./components/VerilogView"));
const ErrorsPanel = lazy(() => import("./components/ErrorsPanel"));
const SimulationPanel = lazy(() => import("./components/SimulationPanel"));

/** @typedef {import("./lib/fsmModel").FSMDefinition} FSMDefinition */
/**
 * @typedef {{
 *   requestId: string,
 *   path: string,
 *   startedAt: string,
 *   durationMs: number,
 *   ok: boolean,
 *   status: number | null,
 * }} RequestMeta
 */

function PanelFallback({ label }) {
  return (
    <section className="panel sidebar-section">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Загрузка</p>
          <h2>{label}</h2>
        </div>
      </div>
      <p className="empty-copy">Компонент загружается...</p>
    </section>
  );
}

function App() {
  const { fsm, setFSM } = useFSMStore();
  const validation = validateFSM(fsm);
  const normalizedFSM = validation.normalized;
  const requestKey = useMemo(() => JSON.stringify(serializeFSM(normalizedFSM)), [normalizedFSM]);
  const requestPayload = useMemo(() => JSON.parse(requestKey), [requestKey]);
  const hasFSM = requestPayload.states.length > 0;
  const [analysis, setAnalysis] = useState(null);
  const [analysisError, setAnalysisError] = useState("");
  const [verilog, setVerilog] = useState("");
  const [verilogError, setVerilogError] = useState("");
  /** @type {[RequestMeta | null, import("react").Dispatch<import("react").SetStateAction<RequestMeta | null>>]} */
  const [analysisMeta, setAnalysisMeta] = useState(null);
  /** @type {[RequestMeta | null, import("react").Dispatch<import("react").SetStateAction<RequestMeta | null>>]} */
  const [verilogMeta, setVerilogMeta] = useState(null);
  const [simulationMeta, setSimulationMeta] = useState(null);
  const [simulationResult, setSimulationResult] = useState(null);
  const [simulationError, setSimulationError] = useState("");
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [referenceDialogOpen, setReferenceDialogOpen] = useState(false);
  const [referenceDialogVersion, setReferenceDialogVersion] = useState(0);
  const [referenceSection, setReferenceSection] = useState("quick-start");
  const [fixPreview, setFixPreview] = useState(null);
  const [analysisRefreshKey, setAnalysisRefreshKey] = useState(0);
  const [verilogRefreshKey, setVerilogRefreshKey] = useState(0);
  const analysisLoading = validation.isValid && hasFSM && !analysis && !analysisError;
  const verilogLoading = validation.isValid && hasFSM && !verilog && !verilogError;
  const displayedAnalysis = validation.isValid && hasFSM ? analysis : null;
  const displayedAnalysisError = validation.isValid && hasFSM ? analysisError : "";
  const displayedVerilog = validation.isValid && hasFSM ? verilog : "";
  const displayedVerilogError = validation.isValid
    ? hasFSM
      ? verilogError
      : ""
    : validation.issues[0] ?? "";

  useEffect(() => {
    if (!hasFSM || !validation.isValid) {
      return undefined;
    }

    const analysisController = new AbortController();

    analyzeFSM(requestPayload, analysisController.signal)
      .then((response) => {
        startTransition(() => setAnalysis(response.data));
        setAnalysisMeta(response.meta);
        if (!analysisController.signal.aborted) {
          setAnalysisError("");
        }
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setAnalysis(null);
          setAnalysisError(error.message);
          setAnalysisMeta(error.meta ?? null);
        }
      });

    return () => {
      analysisController.abort();
    };
  }, [analysisRefreshKey, hasFSM, requestKey, requestPayload, validation.isValid]);

  useEffect(() => {
    if (!hasFSM || !validation.isValid) {
      return undefined;
    }

    const generateController = new AbortController();

    generateVerilog(requestPayload, generateController.signal)
      .then((response) => {
        startTransition(() => setVerilog(response.data.verilog));
        setVerilogMeta(response.meta);
        if (!generateController.signal.aborted) {
          setVerilogError("");
        }
        setSimulationResult(null);
        setSimulationError("");
        setSimulationMeta(null);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setVerilog("");
          setVerilogError(error.message);
          setVerilogMeta(error.meta ?? null);
        }
      });

    return () => {
      generateController.abort();
    };
  }, [hasFSM, requestKey, requestPayload, validation.isValid, verilogRefreshKey]);

  /**
   * @param {"unreachable"|"dead"|"unsafe"|"nondet"} type
   * @param {string | { state: string }} item
   */
  const handleFix = (type, item) => {
    /** @type {FSMDefinition} */
    const nextFSM = structuredClone(normalizedFSM);
    const fixType = item?.fixType ?? type;
    const targetState =
      typeof item === "string" ? item : item?.state;

    if (fixType === "unreachable" && targetState) {
      nextFSM.states = nextFSM.states.filter((state) => state.name !== targetState);
      nextFSM.transitions = nextFSM.transitions.filter(
        (transition) => transition.from_state !== targetState && transition.to_state !== targetState,
      );
    }

    if ((fixType === "dead" || fixType === "unsafe") && targetState) {
      nextFSM.transitions.push({
        from_state: targetState,
        to_state: targetState,
        condition: "1",
        actions: [],
      });
    }

    if (fixType === "nondet" && targetState) {
      const stateTransitions = [];
      const otherTransitions = [];

      nextFSM.transitions.forEach((transition) => {
        if (transition.from_state === targetState) {
          stateTransitions.push(transition);
        } else {
          otherTransitions.push(transition);
        }
      });

      const seenConditions = new Set();
      const deduped = [];
      const ordered = [];
      stateTransitions.forEach((transition) => {
        const normalizedCondition = transition.condition.replace(/\s+/g, "");
        if (seenConditions.has(normalizedCondition)) {
          return;
        }
        seenConditions.add(normalizedCondition);
        deduped.push(transition);
      });

      const fallbackTransitions = [];
      deduped.forEach((transition) => {
        const normalizedCondition = transition.condition.replace(/\s+/g, "").toLowerCase();
        const isFallback = normalizedCondition === "1" || normalizedCondition === "1'b1";
        if (isFallback) {
          fallbackTransitions.push(transition);
          return;
        }
        ordered.push(transition);
      });

      const lastFallback = fallbackTransitions.at(-1);
      if (lastFallback) {
        ordered.push(lastFallback);
      }

      nextFSM.transitions = [...otherTransitions, ...ordered];
    }

    setFSM(nextFSM);
    setFixPreview(null);
  };

  const refreshAnalysis = () => {
    setAnalysis(null);
    setAnalysisError("");
    setAnalysisMeta(null);
    setAnalysisRefreshKey((value) => value + 1);
    setFixPreview(null);
  };

  const refreshVerilog = () => {
    setVerilog("");
    setVerilogError("");
    setVerilogMeta(null);
    setVerilogRefreshKey((value) => value + 1);
  };

  const previewFix = (type, item) => {
    if (!item) {
      setFixPreview(null);
      return;
    }

    const stateName = typeof item === "string" ? item : item?.state;

    if (stateName) {
      setFixPreview({ states: [stateName] });
      return;
    }

    setFixPreview(null);
  };

  const importVerilog = (source) => {
    const controller = new AbortController();

    importVerilogModule(source, controller.signal)
      .then((response) => {
        setFSM(response.data.fsm);
        setAnalysis(null);
        setAnalysisError("");
        setAnalysisMeta(null);
        setVerilog("");
        setVerilogError("");
        setVerilogMeta(response.meta);
        setSimulationResult(null);
        setSimulationError("");
        setSimulationMeta(null);
      })
      .catch((error) => {
        setVerilog("");
        setVerilogError(error.message);
        setVerilogMeta(error.meta ?? null);
      });
  };

  const openReference = (section = "quick-start") => {
    setReferenceSection(section);
    setReferenceDialogVersion((value) => value + 1);
    setReferenceDialogOpen(true);
  };

  const runSimulation = (testbench) => {
    const controller = new AbortController();
    setSimulationLoading(true);

    simulateModule(displayedVerilog, testbench, controller.signal)
      .then((response) => {
        setSimulationResult(response.data);
        setSimulationMeta(response.meta);
        setSimulationError("");
      })
      .catch((error) => {
        setSimulationResult(null);
        setSimulationMeta(error.meta ?? null);
        setSimulationError(error.message);
      })
      .finally(() => {
        setSimulationLoading(false);
      });
  };

  return (
    <div className="app-shell">
      <Suspense fallback={<PanelFallback label="Боковая панель" />}>
        <Sidebar
          onReferenceDialogOpenChange={setReferenceDialogOpen}
          onReferenceOpen={openReference}
          referenceDialogOpen={referenceDialogOpen}
          referenceDialogVersion={referenceDialogVersion}
          referenceSection={referenceSection}
        />
      </Suspense>

      <main className="workspace">
        <section className="workspace-header panel panel-hero">
          <div>
            <h1>Интерактивная среда для проектирования автоматов, анализа и генерации HDL.</h1>
          </div>
          <div className="hero-metrics">
            <div className="metric-card">
              <span className="metric-label">Состояния</span>
              <strong>{fsm.states.length}</strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">Переходы</span>
              <strong>{fsm.transitions.length}</strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">Сигналы</span>
              <strong>{fsm.signals.length}</strong>
            </div>
          </div>
        </section>

        <section className="workspace-main">
          <div className="editor-column">
            <Suspense fallback={<PanelFallback label="Редактор графа" />}>
              <GraphEditor analysis={displayedAnalysis} preview={fixPreview} />
            </Suspense>
          </div>

          <div className="inspector-column">
            <Suspense fallback={<PanelFallback label="Диагностика автомата" />}>
              <ErrorsPanel
                analysis={displayedAnalysis}
                requestMeta={analysisMeta}
                clientIssues={validation.issues}
                error={displayedAnalysisError}
                loading={hasFSM ? analysisLoading : false}
                onFix={handleFix}
                onOpenReference={openReference}
                onPreviewFix={previewFix}
                onRefresh={refreshAnalysis}
              />
            </Suspense>
            <Suspense fallback={<PanelFallback label="Предпросмотр Verilog" />}>
              <VerilogView
                code={displayedVerilog}
                error={displayedVerilogError}
                loading={hasFSM ? verilogLoading : false}
                onImport={importVerilog}
                onRefresh={refreshVerilog}
                requestMeta={verilogMeta}
              />
            </Suspense>
            <Suspense fallback={<PanelFallback label="Моделирование" />}>
              <SimulationPanel
                key={`sim-${requestKey}`}
                error={simulationError}
                fsm={normalizedFSM}
                generatedVerilog={displayedVerilog}
                loading={simulationLoading}
                onRun={runSimulation}
                requestMeta={simulationMeta}
                result={simulationResult}
              />
            </Suspense>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
