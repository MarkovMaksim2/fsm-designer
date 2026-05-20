import { useMemo } from "react";
import ReactFlow, { Background, Controls, MiniMap } from "reactflow";
import "reactflow/dist/style.css";

import { useFSMStore } from "../store/fsmStore";

const NODE_TYPES = {};
const EDGE_TYPES = {};

function normalizePosition(position, index) {
  const fallback = {
    x: 80 + (index % 3) * 180,
    y: 80 + Math.floor(index / 3) * 140,
  };

  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    return fallback;
  }

  return position;
}

function getNodeStyle(stateName, analysis, isSelected, isPreviewed) {
  const unreachable = analysis?.structure?.unreachable_states ?? [];
  const dead = analysis?.structure?.dead_states ?? [];
  const unsafe = analysis?.safety?.unsafe_states ?? [];

  let borderColor = "rgba(18, 53, 36, 0.18)";
  let glow = "0 16px 32px rgba(31, 70, 52, 0.12)";

  if (unreachable.includes(stateName)) {
    borderColor = "#d84f43";
    glow = "0 16px 32px rgba(216, 79, 67, 0.18)";
  } else if (dead.includes(stateName)) {
    borderColor = "#e39a2d";
    glow = "0 16px 32px rgba(227, 154, 45, 0.18)";
  } else if (unsafe.includes(stateName)) {
    borderColor = "#f1c84a";
    glow = "0 16px 32px rgba(241, 200, 74, 0.22)";
  }

  if (isPreviewed) {
    borderColor = "#2f7cf6";
    glow = "0 18px 36px rgba(47, 124, 246, 0.28)";
  }

  return {
    borderRadius: 18,
    border: `2px solid ${borderColor}`,
    padding: 10,
    minWidth: 116,
    background: isSelected ? "#143329" : "#fcfbf4",
    color: isSelected ? "#f4f1e8" : "#132218",
    boxShadow: glow,
    fontWeight: 700,
  };
}

function getEdgeStyle(transition, analysis, isSelected, isPreviewed) {
  const nondeterministic = analysis?.behavior?.nondeterministic ?? [];
  const highlighted = nondeterministic.some((item) => item.state === transition.from_state);

  return {
    stroke: isPreviewed ? "#2f7cf6" : highlighted ? "#d84f43" : isSelected ? "#123524" : "#61856f",
    strokeWidth: highlighted || isSelected || isPreviewed ? 3 : 2,
  };
}

export default function GraphEditor({ analysis, preview }) {
  const {
    fsm,
    addTransition,
    clearSelection,
    selectEdge,
    selectState,
    selectedEdgeIndex,
    selectedState,
    updateStatePosition,
  } = useFSMStore();

  const previewStates = useMemo(() => new Set(preview?.states ?? []), [preview]);
  const nodes = useMemo(() => {
    const seenNodeIds = new Set();
    const nextNodes = [];

    fsm.states.forEach((state, index) => {
      if (!state?.name || seenNodeIds.has(state.name)) {
        return;
      }

      seenNodeIds.add(state.name);
      nextNodes.push({
        id: state.name,
        position: normalizePosition(state.position, index),
        data: { label: state.name },
        style: getNodeStyle(
          state.name,
          analysis,
          selectedState === state.name,
          previewStates.has(state.name),
        ),
      });
    });

    return nextNodes;
  }, [analysis, fsm.states, previewStates, selectedState]);

  const edges = useMemo(() => {
    const validNodeIds = new Set(nodes.map((node) => node.id));

    return fsm.transitions
      .map((transition, index) => ({ transition, index }))
      .filter(
        ({ transition }) =>
          transition?.from_state
          && transition?.to_state
          && validNodeIds.has(transition.from_state)
          && validNodeIds.has(transition.to_state),
      )
      .map(({ transition, index }) => ({
        id: `e${index}`,
        source: transition.from_state,
        target: transition.to_state,
        label: transition.condition,
        style: getEdgeStyle(
          transition,
          analysis,
          selectedEdgeIndex === index,
          previewStates.has(transition.from_state),
        ),
        animated: selectedEdgeIndex === index,
      }));
  }, [analysis, fsm.transitions, nodes, previewStates, selectedEdgeIndex]);

  return (
    <section className="panel graph-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Граф автомата</p>
          <h2>Редактор графа состояний</h2>
        </div>
        <p className="panel-note">
          Добавить состояния на левой панели и соединить узлы прямо на холсте.
        </p>
      </div>

      <div className="graph-canvas">
        <ReactFlow
          edgeTypes={EDGE_TYPES}
          nodes={nodes}
          nodeTypes={NODE_TYPES}
          edges={edges}
          onConnect={(params) => addTransition(params.source, params.target)}
          onPaneClick={clearSelection}
          onNodeClick={(_, node) => selectState(node.id)}
          onEdgeClick={(_, edge) => selectEdge(Number(edge.id.slice(1)))}
          onNodeDragStop={(_, node) => updateStatePosition(node.id, node.position)}
          fitView
        >
          <MiniMap
            pannable
            zoomable
            nodeColor={(node) => (selectedState === node.id ? "#143329" : "#4f7b60")}
          />
          <Controls />
          <Background color="#b6cbbd" gap={20} size={1.1} />
        </ReactFlow>
      </div>
    </section>
  );
}
