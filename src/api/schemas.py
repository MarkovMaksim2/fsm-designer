from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class SignalSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    direction: Literal["input", "output", "output_reg", "reg", "wire"]
    width: int = 1
    default: Optional[str] = None
    expression: Optional[str] = None


class ExternalModulePortSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    direction: Literal["input", "output", "output_reg"]
    width: int = 1


class ExternalModuleSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    ports: List[ExternalModulePortSchema] = Field(default_factory=list)


class ModuleInstanceSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    module_name: str
    connections: Dict[str, str] = Field(default_factory=dict)


class TransitionSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_state: str
    to_state: str
    condition: str = "1"
    actions: List[str] = Field(default_factory=list)
    action_domain: Literal["comb", "seq"] = "comb"


class StateSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    is_initial: bool = False
    actions: List[str] = Field(default_factory=list)
    action_domain: Literal["comb", "seq"] = "comb"


class FSMSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    signals: List[SignalSchema] = Field(default_factory=list)
    states: List[StateSchema] = Field(default_factory=list)
    transitions: List[TransitionSchema] = Field(default_factory=list)
    reset_actions: List[str] = Field(default_factory=list)
    module_name: str = "fsm_module"
    module_ports: List[str] = Field(default_factory=list)
    preserved_items: List[str] = Field(default_factory=list)
    generation_style: Literal["auto", "single_process", "two_process"] = "auto"
    reset_mode: Literal["async", "sync", "none"] = "async"
    state_signal_name: str = "state"
    next_state_signal_name: str = "next_state"
    clock_signal_name: str = "clk"
    reset_signal_name: str = "reset"
    original_source: Optional[str] = None
    import_fingerprint: Optional[str] = None
    imported_from_verilog: bool = False
    safe_to_regenerate: bool = True
    regeneration_warning: Optional[str] = None
    import_style: str = "native"
    import_has_mixed_datapath: bool = False
    import_fsm_blocks: int = 0
    import_block_roles: List[str] = Field(default_factory=list)
    import_internal_action_targets: List[str] = Field(default_factory=list)
    external_modules: List[ExternalModuleSchema] = Field(default_factory=list)
    module_instances: List[ModuleInstanceSchema] = Field(default_factory=list)


class ImportVerilogRequest(BaseModel):
    source: str


class ImportVerilogResponse(BaseModel):
    fsm: FSMSchema


class GenerateResponse(BaseModel):
    verilog: str


class SimulateRequest(BaseModel):
    source: str
    testbench: str


class SimulateResponse(BaseModel):
    success: bool
    stdout: str
    stderr: str


class GraphNodeSchema(BaseModel):
    id: str
    label: str
    initial: bool


class GraphEdgeSchema(BaseModel):
    source: str
    target: str
    label: str


class GraphResponse(BaseModel):
    nodes: List[GraphNodeSchema]
    edges: List[GraphEdgeSchema]
