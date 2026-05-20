import json

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.fsm_builder import build_fsm
from api.schemas import (
    FSMSchema,
    GenerateResponse,
    GraphResponse,
    ImportVerilogRequest,
    ImportVerilogResponse,
    SimulateRequest,
    SimulateResponse,
)
from api.simulator import simulate_verilog
from analysis.advanced_analyzer import AdvancedFSMAnalyzer
from parser.verilog_parser import VerilogParser
from generator.verilog_generator import VerilogGenerator
from visualization.graph_builder import GraphBuilder


app = FastAPI(
    title="API системы проектирования FSM-Verilog",
    version="0.2.0",
    description="API для проверки, анализа, визуализации, импорта и генерации HDL по модели конечного автомата.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


def _translate_validation_error(error):
    error_type = error.get("type")
    location = " -> ".join(str(part) for part in error.get("loc", []) if part != "body")

    if error_type == "extra_forbidden":
        return f"Обнаружено лишнее поле{f' в {location}' if location else ''}: входные данные содержат параметр, который не поддерживается."
    if error_type == "missing":
        return f"Отсутствует обязательное поле{f' в {location}' if location else ''}."
    if error_type == "literal_error":
        return f"Недопустимое значение{f' в {location}' if location else ''}: ожидалось одно из допустимых фиксированных значений."
    if error_type == "string_type":
        return f"Ожидалась строка{f' в {location}' if location else ''}."
    if error_type == "int_type":
        return f"Ожидалось целое число{f' в {location}' if location else ''}."
    if error_type == "list_type":
        return f"Ожидался список{f' в {location}' if location else ''}."

    original = error.get("msg", "Ошибка валидации входных данных.")
    return f"{location}: {original}" if location else original


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_, exc: RequestValidationError):
    details = [_translate_validation_error(error) for error in exc.errors()]
    message = " ".join(details) if details else "Ошибка валидации входных данных."
    return JSONResponse(status_code=422, content={"detail": message})


def _fsm_to_schema(fsm):
    return FSMSchema(
        signals=[
            {
                "name": signal.name,
                "direction": signal.direction,
                "width": signal.width,
                "default": signal.default,
                "expression": signal.expression,
            }
            for signal in fsm.signals.values()
        ],
        states=[
            {
                "name": state.name,
                "is_initial": state.is_initial,
                "actions": state.actions,
                "action_domain": state.action_domain,
            }
            for state in fsm.states.values()
        ],
        transitions=[
            {
                "from_state": transition.from_state,
                "to_state": transition.to_state,
                "condition": transition.condition,
                "actions": transition.actions,
                "action_domain": transition.action_domain,
            }
            for transition in fsm.transitions
        ],
        reset_actions=fsm.reset_actions,
        module_name=fsm.module_name,
        module_ports=fsm.module_ports,
        preserved_items=fsm.preserved_items,
        generation_style=fsm.generation_style,
        reset_mode=fsm.reset_mode,
        state_signal_name=fsm.state_signal_name,
        next_state_signal_name=fsm.next_state_signal_name,
        clock_signal_name=fsm.clock_signal_name,
        reset_signal_name=fsm.reset_signal_name,
        original_source=fsm.original_source,
        import_fingerprint=fsm.import_fingerprint,
        imported_from_verilog=fsm.imported_from_verilog,
        safe_to_regenerate=fsm.safe_to_regenerate,
        regeneration_warning=fsm.regeneration_warning,
        import_style=fsm.import_style,
        import_has_mixed_datapath=fsm.import_has_mixed_datapath,
        import_fsm_blocks=fsm.import_fsm_blocks,
        import_block_roles=fsm.import_block_roles,
        import_internal_action_targets=fsm.import_internal_action_targets,
        external_modules=fsm.external_modules,
        module_instances=fsm.module_instances,
    )


def _fingerprint_schema(schema: FSMSchema) -> str:
    payload = {
        "signals": [signal.model_dump() for signal in schema.signals],
        "states": [state.model_dump() for state in schema.states],
        "transitions": [transition.model_dump() for transition in schema.transitions],
        "reset_actions": schema.reset_actions,
        "module_name": schema.module_name,
        "module_ports": schema.module_ports,
        "preserved_items": schema.preserved_items,
        "generation_style": schema.generation_style,
        "reset_mode": schema.reset_mode,
        "state_signal_name": schema.state_signal_name,
        "next_state_signal_name": schema.next_state_signal_name,
        "clock_signal_name": schema.clock_signal_name,
        "reset_signal_name": schema.reset_signal_name,
        "imported_from_verilog": schema.imported_from_verilog,
        "safe_to_regenerate": schema.safe_to_regenerate,
        "regeneration_warning": schema.regeneration_warning,
        "import_style": schema.import_style,
        "import_has_mixed_datapath": schema.import_has_mixed_datapath,
        "import_fsm_blocks": schema.import_fsm_blocks,
        "import_block_roles": schema.import_block_roles,
        "import_internal_action_targets": schema.import_internal_action_targets,
        "external_modules": [module.model_dump() for module in schema.external_modules],
        "module_instances": [instance.model_dump() for instance in schema.module_instances],
    }
    return json.dumps(payload, sort_keys=True)


@app.post("/import-verilog", response_model=ImportVerilogResponse)
def import_verilog(payload: ImportVerilogRequest):
    try:
        fsm = VerilogParser.extract_fsm_from_source(payload.source)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    fsm.original_source = payload.source
    schema = _fsm_to_schema(fsm)
    schema.import_fingerprint = _fingerprint_schema(schema)
    return {"fsm": schema}


@app.post("/generate", response_model=GenerateResponse)
def generate(fsm_data: FSMSchema):
    try:
        if (
            fsm_data.original_source
            and fsm_data.import_fingerprint
            and fsm_data.import_fingerprint == _fingerprint_schema(fsm_data)
        ):
            return {"verilog": fsm_data.original_source}

        if fsm_data.imported_from_verilog and not fsm_data.safe_to_regenerate:
            raise HTTPException(
                status_code=422,
                detail=(
                    fsm_data.regeneration_warning
                    or "Этот импортированный Verilog-модуль нельзя безопасно пересобрать после изменения FSM."
                ),
            )

        fsm = build_fsm(fsm_data)
        generator = VerilogGenerator(fsm, use_sv=False)
        verilog = generator.generate()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {"verilog": verilog}


@app.post("/analyze")
def analyze(fsm_data: FSMSchema):
    try:
        fsm = build_fsm(fsm_data)
        analyzer = AdvancedFSMAnalyzer(fsm)
        report = analyzer.full_analysis()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return report


@app.post("/simulate", response_model=SimulateResponse)
def simulate(payload: SimulateRequest):
    try:
        return simulate_verilog(payload.source, payload.testbench)
    except FileNotFoundError as exc:
        missing_tool = exc.filename or "внешний инструмент"
        raise HTTPException(
            status_code=422,
            detail=f"Для моделирования требуется установленный `{missing_tool}`, доступный в PATH.",
        ) from exc


@app.post("/graph", response_model=GraphResponse)
def get_graph(fsm_data: FSMSchema):
    try:
        fsm = build_fsm(fsm_data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    graph = GraphBuilder(fsm)
    return graph.to_json()
