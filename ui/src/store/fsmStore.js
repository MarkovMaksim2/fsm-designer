import { create } from "zustand";

import {
  createExternalModule,
  createFSM,
  createModuleInstance,
  createSignal,
  createState,
  createTransition,
  formatActions,
  validateExternalModuleDraft,
  validateModuleInstanceDraft,
  validateSignalDraft,
  validateStateDraft,
  validateTransitionDraft,
} from "../lib/fsmModel";

/** @typedef {import("../lib/fsmModel").FSMDefinition} FSMDefinition */

export const useFSMStore = create((set, get) => ({
  fsm: createFSM(),
  selectedState: null,
  selectedEdgeIndex: null,
  numberDisplayMode: "decimal",

  setFSM: (fsm) =>
    set({
      fsm: createFSM(fsm),
      selectedState: null,
      selectedEdgeIndex: null,
    }),
  setNumberDisplayMode: (numberDisplayMode) => set({ numberDisplayMode }),
  updateFSMOptions: (patch) =>
    set((state) => ({
      fsm: {
        ...state.fsm,
        ...patch,
      },
    })),

  addSignal: (draft) => {
    const { fsm } = get();
    const error = validateSignalDraft(draft, fsm.signals);
    if (error) {
      return { ok: false, error };
    }

    set({
      fsm: {
        ...fsm,
        signals: [...fsm.signals, createSignal(draft)],
      },
    });
    return { ok: true, error: "" };
  },

  updateSignal: (name, data) => {
    const { fsm } = get();
    const currentSignal = fsm.signals.find((signal) => signal.name === name);
    if (!currentSignal) {
      return { ok: false, error: `Неизвестный сигнал ${name}.` };
    }

    const nextSignal = createSignal({ ...currentSignal, ...data });
    const error = validateSignalDraft(nextSignal, fsm.signals, name);
    if (error) {
      return { ok: false, error };
    }

    set({
      fsm: {
        ...fsm,
        signals: fsm.signals.map((signal) => (signal.name === name ? nextSignal : signal)),
      },
    });

    return { ok: true, error: "" };
  },

  addExternalModule: (draft) => {
    const { fsm } = get();
    const error = validateExternalModuleDraft(draft, fsm.external_modules);
    if (error) {
      return { ok: false, error };
    }

    set({
      fsm: {
        ...fsm,
        external_modules: [...fsm.external_modules, createExternalModule(draft)],
      },
    });
    return { ok: true, error: "" };
  },

  updateExternalModule: (name, data) => {
    const { fsm } = get();
    const currentModule = fsm.external_modules.find((module) => module.name === name);
    if (!currentModule) {
      return { ok: false, error: `Неизвестный внешний модуль ${name}.` };
    }

    const nextModule = createExternalModule({ ...currentModule, ...data });
    const error = validateExternalModuleDraft(nextModule, fsm.external_modules, name);
    if (error) {
      return { ok: false, error };
    }

    set({
      fsm: {
        ...fsm,
        external_modules: fsm.external_modules.map((module) =>
          module.name === name ? nextModule : module),
        module_instances: fsm.module_instances.map((instance) =>
          instance.module_name === name
            ? createModuleInstance({
              ...instance,
              module_name: nextModule.name,
              connections: Object.fromEntries(
                Object.entries(instance.connections ?? {}).filter(([portName]) =>
                  nextModule.ports.some((port) => port.name === portName),
                ),
              ),
            })
            : instance,
        ),
      },
    });

    return { ok: true, error: "" };
  },

  removeExternalModule: (name) =>
    set((state) => ({
      fsm: {
        ...state.fsm,
        external_modules: state.fsm.external_modules.filter((module) => module.name !== name),
        module_instances: state.fsm.module_instances.filter((instance) => instance.module_name !== name),
      },
    })),

  addModuleInstance: (draft) => {
    const { fsm } = get();
    const error = validateModuleInstanceDraft(
      draft,
      fsm.external_modules,
      fsm.signals,
      fsm.module_instances,
    );
    if (error) {
      return { ok: false, error };
    }

    set({
      fsm: {
        ...fsm,
        module_instances: [...fsm.module_instances, createModuleInstance(draft)],
      },
    });

    return { ok: true, error: "" };
  },

  updateModuleInstance: (name, data) => {
    const { fsm } = get();
    const currentInstance = fsm.module_instances.find((instance) => instance.name === name);
    if (!currentInstance) {
      return { ok: false, error: `Неизвестный экземпляр ${name}.` };
    }

    const nextInstance = createModuleInstance({ ...currentInstance, ...data });
    const error = validateModuleInstanceDraft(
      nextInstance,
      fsm.external_modules,
      fsm.signals,
      fsm.module_instances,
      name,
    );
    if (error) {
      return { ok: false, error };
    }

    set({
      fsm: {
        ...fsm,
        module_instances: fsm.module_instances.map((instance) =>
          instance.name === name ? nextInstance : instance),
      },
    });

    return { ok: true, error: "" };
  },

  removeModuleInstance: (name) =>
    set((state) => ({
      fsm: {
        ...state.fsm,
        module_instances: state.fsm.module_instances.filter((instance) => instance.name !== name),
      },
    })),

  removeSignal: (name) =>
    set((state) => ({
      fsm: {
        ...state.fsm,
        signals: state.fsm.signals.filter((signal) => signal.name !== name),
      },
    })),

  addState: (name, position = null) => {
    const { fsm } = get();
    const error = validateStateDraft(name, fsm.states);
    if (error) {
      return { ok: false, error };
    }

    const nextState = createState(
      {
        name,
        is_initial: fsm.states.length === 0,
        actions: [],
        position,
      },
      fsm.states.length,
    );

    set({
      fsm: {
        ...fsm,
        states: [...fsm.states, nextState],
      },
      selectedState: nextState.name,
      selectedEdgeIndex: null,
    });
    return { ok: true, error: "" };
  },

  updateState: (name, data) => {
    const { fsm, selectedState } = get();
    const currentState = fsm.states.find((item) => item.name === name);
    if (!currentState) {
      return { ok: false, error: `Неизвестное состояние ${name}.` };
    }

    const nextState = createState({ ...currentState, ...data });
    const error = validateStateDraft(nextState.name, fsm.states, name);
    if (error) {
      return { ok: false, error };
    }

    set({
      fsm: {
        ...fsm,
        states: fsm.states.map((item, index) =>
          item.name === name ? createState({ ...nextState, position: item.position }, index) : item,
        ),
        transitions: fsm.transitions.map((transition) =>
          createTransition({
            ...transition,
            from_state: transition.from_state === name ? nextState.name : transition.from_state,
            to_state: transition.to_state === name ? nextState.name : transition.to_state,
          }),
        ),
      },
      selectedState: selectedState === name ? nextState.name : selectedState,
    });

    return { ok: true, error: "" };
  },

  updateStatePosition: (name, position) =>
    set((state) => ({
      fsm: {
        ...state.fsm,
        states: state.fsm.states.map((item, index) =>
          item.name === name ? createState({ ...item, position }, index) : item,
        ),
      },
    })),

  setInitialState: (name) =>
    set((state) => ({
      fsm: {
        ...state.fsm,
        states: state.fsm.states.map((item, index) =>
          createState(
            {
              ...item,
              is_initial: item.name === name,
            },
            index,
          ),
        ),
      },
    })),

  removeState: (name) =>
    set((state) => {
      const remainingStates = state.fsm.states.filter((item) => item.name !== name);
      const normalizedStates = remainingStates.map((item, index) =>
        createState(
          {
            ...item,
            is_initial: remainingStates.some((stateItem) => stateItem.is_initial)
              ? item.is_initial
              : index === 0,
          },
          index,
        ),
      );

      return {
        fsm: {
          ...state.fsm,
          states: normalizedStates,
          transitions: state.fsm.transitions.filter(
            (transition) => transition.from_state !== name && transition.to_state !== name,
          ),
        },
        selectedState: state.selectedState === name ? null : state.selectedState,
      };
    }),

  addTransition: (fromState, toState, data = {}) => {
    if (!fromState || !toState) {
      return { ok: false, error: "Нужно указать и исходное, и целевое состояние перехода." };
    }

    const { fsm } = get();
    const draft = createTransition({
      from_state: fromState,
      to_state: toState,
      ...data,
    });
    const error = validateTransitionDraft(draft, fsm.states);
    if (error) {
      return { ok: false, error };
    }

    set((state) => ({
      fsm: {
        ...state.fsm,
        transitions: [
          ...state.fsm.transitions,
          draft,
        ],
      },
      selectedState: null,
      selectedEdgeIndex: state.fsm.transitions.length,
    }));

    return { ok: true, error: "" };
  },

  updateTransition: (index, data) => {
    const { fsm } = get();
    const currentTransition = fsm.transitions[index];
    if (!currentTransition) {
      return { ok: false, error: `Неизвестный переход с индексом ${index}.` };
    }

    const nextTransition = createTransition({
      ...currentTransition,
      ...data,
    });
    const error = validateTransitionDraft(nextTransition, fsm.states);
    if (error) {
      return { ok: false, error };
    }

    set({
      fsm: {
        ...fsm,
        transitions: fsm.transitions.map((transition, transitionIndex) =>
          transitionIndex === index ? nextTransition : transition,
        ),
      },
    });

    return { ok: true, error: "" };
  },

  removeTransition: (index) =>
    set((state) => ({
      fsm: {
        ...state.fsm,
        transitions: state.fsm.transitions.filter((_, itemIndex) => itemIndex !== index),
      },
      selectedEdgeIndex: state.selectedEdgeIndex === index ? null : state.selectedEdgeIndex,
    })),

  selectState: (name) => set({ selectedState: name, selectedEdgeIndex: null }),
  selectEdge: (index) => set({ selectedEdgeIndex: index, selectedState: null }),
  clearSelection: () => set({ selectedState: null, selectedEdgeIndex: null }),

  setStateActions: (name, text) =>
    get().updateState(name, {
      actions: formatActions(text),
    }),

  setTransitionActions: (index, text) =>
    get().updateTransition(index, {
      actions: formatActions(text),
    }),
}));
