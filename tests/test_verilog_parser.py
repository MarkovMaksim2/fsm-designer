from parser.fsm_extractor import FSMExtractor
from parser.verilog_parser import VerilogParser
from core.fsm import FSM
from pyverilog.ast_code_generator.codegen import ASTCodeGenerator
from pyverilog.vparser.ast import (
    Block,
    BlockingSubstitution,
    Case,
    CaseStatement,
    Identifier,
    IfStatement,
    IntConst,
    Lvalue,
    NonblockingSubstitution,
    Rvalue,
    Ulnot,
)


def build_case_style_fsm_ast():
    return Block(
        [
            NonblockingSubstitution(
                Lvalue(Identifier("state")),
                Rvalue(Identifier("next_state")),
            ),
            NonblockingSubstitution(
                Lvalue(Identifier("state")),
                Rvalue(Identifier("IDLE")),
            ),
            CaseStatement(
                Identifier("state"),
                [
                    Case(
                        [Identifier("IDLE")],
                        IfStatement(
                            Identifier("go"),
                            Block(
                                [
                                    BlockingSubstitution(
                                        Lvalue(Identifier("next_state")),
                                        Rvalue(Identifier("RUN")),
                                    ),
                                    BlockingSubstitution(
                                        Lvalue(Identifier("done")),
                                        Rvalue(IntConst("1'b1")),
                                    ),
                                ]
                            ),
                            Block(
                                [
                                    BlockingSubstitution(
                                        Lvalue(Identifier("next_state")),
                                        Rvalue(Identifier("IDLE")),
                                    ),
                                ]
                            ),
                        ),
                    ),
                    Case(
                        [Identifier("RUN")],
                        Block(
                            [
                                BlockingSubstitution(
                                    Lvalue(Identifier("busy")),
                                    Rvalue(IntConst("1'b1")),
                                ),
                                IfStatement(
                                    Ulnot(Identifier("go")),
                                    Block(
                                        [
                                            BlockingSubstitution(
                                                Lvalue(Identifier("next_state")),
                                                Rvalue(Identifier("IDLE")),
                                            ),
                                        ]
                                    ),
                                    Block(
                                        [
                                            BlockingSubstitution(
                                                Lvalue(Identifier("next_state")),
                                                Rvalue(Identifier("RUN")),
                                            ),
                                        ]
                                    ),
                                ),
                            ]
                        ),
                    ),
                ],
            ),
        ]
    )


def build_single_process_fsm_ast():
    return Block(
        [
            NonblockingSubstitution(
                Lvalue(Identifier("state")),
                Rvalue(Identifier("IDLE")),
            ),
            CaseStatement(
                Identifier("state"),
                [
                    Case(
                        [Identifier("IDLE")],
                        IfStatement(
                            Identifier("start_i"),
                            Block(
                                [
                                    NonblockingSubstitution(
                                        Lvalue(Identifier("state")),
                                        Rvalue(Identifier("WORK")),
                                    ),
                                    NonblockingSubstitution(
                                        Lvalue(Identifier("ready")),
                                        Rvalue(IntConst("1'b0")),
                                    ),
                                ]
                            ),
                            None,
                        ),
                    ),
                    Case(
                        [Identifier("WORK")],
                        IfStatement(
                            Identifier("end_step"),
                            Block(
                                [
                                    NonblockingSubstitution(
                                        Lvalue(Identifier("state")),
                                        Rvalue(Identifier("IDLE")),
                                    ),
                                    NonblockingSubstitution(
                                        Lvalue(Identifier("ready")),
                                        Rvalue(IntConst("1'b1")),
                                    ),
                                ]
                            ),
                            None,
                        ),
                    ),
                ],
            ),
        ]
    )


def build_unconditional_next_state_ast():
    return Block(
        [
            NonblockingSubstitution(
                Lvalue(Identifier("state")),
                Rvalue(Identifier("next_state")),
            ),
            NonblockingSubstitution(
                Lvalue(Identifier("state")),
                Rvalue(Identifier("IDLE")),
            ),
            CaseStatement(
                Identifier("state"),
                [
                    Case(
                        [Identifier("IDLE")],
                        Block(
                            [
                                BlockingSubstitution(
                                    Lvalue(Identifier("next_state")),
                                    Rvalue(Identifier("INIT")),
                                ),
                            ]
                        ),
                    ),
                    Case(
                        [Identifier("INIT")],
                        Block(
                            [
                                BlockingSubstitution(
                                    Lvalue(Identifier("next_state")),
                                    Rvalue(Identifier("ITER")),
                                ),
                            ]
                        ),
                    ),
                    Case(
                        [Identifier("ITER")],
                        IfStatement(
                            Identifier("done_i"),
                            Block(
                                [
                                    BlockingSubstitution(
                                        Lvalue(Identifier("next_state")),
                                        Rvalue(Identifier("DONE")),
                                    ),
                                ]
                            ),
                            Block(
                                [
                                    BlockingSubstitution(
                                        Lvalue(Identifier("next_state")),
                                        Rvalue(Identifier("ITER")),
                                    ),
                                ]
                            ),
                        ),
                    ),
                    Case(
                        [Identifier("DONE")],
                        Block(
                            [
                                BlockingSubstitution(
                                    Lvalue(Identifier("next_state")),
                                    Rvalue(Identifier("IDLE")),
                                ),
                            ]
                        ),
                    ),
                ],
            ),
        ]
    )


def build_two_process_else_if_ast():
    return Block(
        [
            NonblockingSubstitution(
                Lvalue(Identifier("state")),
                Rvalue(Identifier("next_state")),
            ),
            NonblockingSubstitution(
                Lvalue(Identifier("state")),
                Rvalue(Identifier("IDLE")),
            ),
            CaseStatement(
                Identifier("state"),
                [
                    Case(
                        [Identifier("IDLE")],
                        IfStatement(
                            Identifier("rxf_n_low"),
                            Block(
                                [
                                    BlockingSubstitution(
                                        Lvalue(Identifier("next_state")),
                                        Rvalue(Identifier("CHECK_RXF")),
                                    ),
                                ]
                            ),
                            IfStatement(
                                Identifier("txe_n_low"),
                                Block(
                                    [
                                        BlockingSubstitution(
                                            Lvalue(Identifier("next_state")),
                                            Rvalue(Identifier("CHECK_TXE")),
                                        ),
                                    ]
                                ),
                                Block(
                                    [
                                        BlockingSubstitution(
                                            Lvalue(Identifier("next_state")),
                                            Rvalue(Identifier("IDLE")),
                                        ),
                                    ]
                                ),
                            ),
                        ),
                    ),
                    Case(
                        [Identifier("CHECK_RXF")],
                        Block(
                            [
                                BlockingSubstitution(
                                    Lvalue(Identifier("next_state")),
                                    Rvalue(Identifier("IDLE")),
                                ),
                            ]
                        ),
                    ),
                    Case(
                        [Identifier("CHECK_TXE")],
                        Block(
                            [
                                BlockingSubstitution(
                                    Lvalue(Identifier("next_state")),
                                    Rvalue(Identifier("IDLE")),
                                ),
                            ]
                        ),
                    ),
                ],
            ),
        ]
    )


def build_self_loop_via_state_reference_ast():
    return Block(
        [
            NonblockingSubstitution(
                Lvalue(Identifier("state")),
                Rvalue(Identifier("next_state")),
            ),
            NonblockingSubstitution(
                Lvalue(Identifier("state")),
                Rvalue(Identifier("IDLE")),
            ),
            CaseStatement(
                Identifier("state"),
                [
                    Case(
                        [Identifier("END")],
                        Block(
                            [
                                BlockingSubstitution(
                                    Lvalue(Identifier("next_state")),
                                    Rvalue(Identifier("state")),
                                ),
                            ]
                        ),
                    ),
                ],
            ),
        ]
    )


def build_nested_single_process_branching_ast():
    return Block(
        [
            NonblockingSubstitution(
                Lvalue(Identifier("state")),
                Rvalue(Identifier("IDLE")),
            ),
            CaseStatement(
                Identifier("state"),
                [
                    Case(
                        [Identifier("CHECK")],
                        IfStatement(
                            Ulnot(Identifier("busy")),
                            Block(
                                [
                                    IfStatement(
                                        Identifier("lt"),
                                        Block(
                                            [
                                                NonblockingSubstitution(
                                                    Lvalue(Identifier("x")),
                                                    Rvalue(IntConst("4'd1")),
                                                ),
                                                NonblockingSubstitution(
                                                    Lvalue(Identifier("state")),
                                                    Rvalue(Identifier("LOOP")),
                                                ),
                                            ]
                                        ),
                                        Block(
                                            [
                                                IfStatement(
                                                    Identifier("eq"),
                                                    Block(
                                                        [
                                                            NonblockingSubstitution(
                                                                Lvalue(Identifier("acc")),
                                                                Rvalue(Identifier("x")),
                                                            ),
                                                            NonblockingSubstitution(
                                                                Lvalue(Identifier("state")),
                                                                Rvalue(Identifier("DONE")),
                                                            ),
                                                        ]
                                                    ),
                                                    Block(
                                                        [
                                                            NonblockingSubstitution(
                                                                Lvalue(Identifier("acc")),
                                                                Rvalue(IntConst("4'd0")),
                                                            ),
                                                            NonblockingSubstitution(
                                                                Lvalue(Identifier("state")),
                                                                Rvalue(Identifier("DONE")),
                                                            ),
                                                        ]
                                                    ),
                                                ),
                                            ]
                                        ),
                                    ),
                                ]
                            ),
                            None,
                        ),
                    ),
                ],
            ),
        ]
    )


def test_fsm_extractor_recovers_case_style_fsm():
    fsm = FSMExtractor(build_case_style_fsm_ast()).extract()

    assert sorted(fsm.states) == ["IDLE", "RUN"]
    assert fsm.initial_state == "IDLE"
    assert fsm.states["IDLE"].is_initial is True
    assert fsm.states["RUN"].actions == ["busy = 1'b1;"]

    transitions = {
        (transition.from_state, transition.to_state): (transition.condition, transition.actions)
        for transition in fsm.transitions
    }
    assert transitions[("IDLE", "RUN")] == ("go", ["done = 1'b1;"])
    assert transitions[("IDLE", "IDLE")] == ("!(go)", [])
    assert transitions[("RUN", "IDLE")][0].replace("(", "").replace(")", "") == "!go"
    assert transitions[("RUN", "RUN")][1] == []


def test_verilog_parser_extract_fsm_uses_pyverilog_parse(monkeypatch, tmp_path):
    ast = build_case_style_fsm_ast()
    verilog_file = tmp_path / "fsm.v"
    verilog_file.write_text("module fsm; endmodule", encoding="utf-8")
    seen = {}

    def fake_parse(paths):
        seen["paths"] = paths
        return ast, ()

    monkeypatch.setattr("parser.verilog_parser.parse", fake_parse)

    fsm = VerilogParser(str(verilog_file)).extract_fsm()

    assert seen["paths"] == [str(verilog_file)]
    assert sorted(fsm.states) == ["IDLE", "RUN"]
    assert fsm.initial_state == "IDLE"


def test_fsm_extractor_recovers_single_process_case_style_fsm():
    fsm = FSMExtractor(build_single_process_fsm_ast()).extract()

    assert sorted(fsm.states) == ["IDLE", "WORK"]
    assert fsm.initial_state == "IDLE"
    transitions = {
        (transition.from_state, transition.to_state): (transition.condition, transition.actions)
        for transition in fsm.transitions
    }
    assert transitions[("IDLE", "WORK")] == ("start_i", ["ready <= 1'b0;"])
    assert transitions[("IDLE", "IDLE")] == ("!(start_i)", [])
    assert transitions[("WORK", "IDLE")] == ("end_step", ["ready <= 1'b1;"])
    assert transitions[("WORK", "WORK")] == ("!(end_step)", [])


def test_fsm_extractor_treats_next_state_equals_state_as_self_loop():
    fsm = FSMExtractor(build_self_loop_via_state_reference_ast()).extract()

    assert "END" in fsm.states
    transitions = [
        (transition.from_state, transition.to_state, transition.condition)
        for transition in fsm.transitions
    ]
    assert ("END", "END", "1") in transitions


def test_fsm_extractor_recovers_unconditional_next_state_case_branches():
    fsm = FSMExtractor(build_unconditional_next_state_ast()).extract()

    transitions = {
        (transition.from_state, transition.to_state): transition.condition
        for transition in fsm.transitions
    }

    assert transitions[("IDLE", "INIT")] == "1"
    assert transitions[("INIT", "ITER")] == "1"
    assert transitions[("ITER", "DONE")] == "done_i"
    assert transitions[("ITER", "ITER")] == "!(done_i)"
    assert transitions[("DONE", "IDLE")] == "1"


def test_fsm_extractor_preserves_else_if_conditions_in_two_process_fsm():
    fsm = FSMExtractor(build_two_process_else_if_ast()).extract()

    transitions = {
        (transition.from_state, transition.to_state): transition.condition
        for transition in fsm.transitions
    }

    assert transitions[("IDLE", "CHECK_RXF")] == "rxf_n_low"
    assert transitions[("IDLE", "CHECK_TXE")] == "(!(rxf_n_low)) && (txe_n_low)"
    assert transitions[("IDLE", "IDLE")] == "(!(rxf_n_low)) && (!(txe_n_low))"


def test_fsm_extractor_keeps_nested_one_process_branches_separate():
    fsm = FSM()
    fsm.add_signal("busy", "input")
    fsm.add_signal("lt", "input")
    fsm.add_signal("eq", "input")
    fsm.add_signal("x", "reg", width=4)
    fsm.add_signal("acc", "reg", width=4)

    extractor = FSMExtractor.__new__(FSMExtractor)
    extractor.ast = build_nested_single_process_branching_ast()
    extractor.fsm = fsm
    extractor.codegen = ASTCodeGenerator()
    extractor.state_var = "state"
    extractor.next_state_var = None

    extractor._extract_states()
    if "LOOP" not in extractor.fsm.states:
        extractor.fsm.add_state("LOOP")
    if "DONE" not in extractor.fsm.states:
        extractor.fsm.add_state("DONE")
    extractor._extract_transitions_and_actions()

    transitions = {
        (transition.from_state, transition.to_state, transition.condition): transition.actions
        for transition in extractor.fsm.transitions
    }

    assert transitions[("CHECK", "LOOP", "((!busy)) && (lt)")] == ["x <= 4'd1;"]
    assert transitions[("CHECK", "DONE", "(((!busy)) && (!(lt))) && (eq)")] == ["acc <= x;"]
    assert transitions[("CHECK", "DONE", "(((!busy)) && (!(lt))) && (!(eq))")] == ["acc <= 4'd0;"]
    assert ("CHECK", "CHECK", "busy") in transitions


def test_verilog_parser_normalizes_supported_systemverilog_subset():
    source = """
module fsm_module (
    clk,
    reset,
    res_o,
    check
);

logic [7:0] r1;
input clk;
input reset;
output logic [7:0] res_o;
input check;

logic [3:0] state, next_state;
localparam INIT = 4'b0001;
localparam IDLE = 4'b0010;
localparam ITER = 4'b0100;
localparam END = 4'b1000;

always_ff @(posedge clk or posedge reset) begin
    if (reset)
        state <= IDLE;
    else
        state <= next_state;
end

always_comb begin
    next_state = state;
    unique case (state)
        INIT: begin
            if (1'b1) begin
                next_state = ITER;
            end
        end
        IDLE: begin
            if (1'b1) begin
                next_state = INIT;
            end
        end
        ITER: begin
            if (check) begin
                next_state = END;
            end
            else begin
                next_state = ITER;
            end
        end
        END: begin
            next_state = state;
        end
        default: begin
            next_state = IDLE;
        end
    endcase
end

always_comb begin
    res_o = '0;
    case (state)
        INIT: begin
            r1 = 8'd0;
            res_o = 8'd0;
        end
        IDLE: begin
        end
        ITER: begin
            if (1'b1) begin
                r1 = r1 + 8'd1;
            end
        end
        END: begin
            res_o = r1;
        end
        default: begin
        end
    endcase
end

endmodule
"""
    normalized = VerilogParser.normalize_source_for_parser(source)

    assert "always_ff" not in normalized
    assert "always_comb" not in normalized
    assert "unique case" not in normalized
    assert "logic" not in normalized
    assert "'0" not in normalized
    assert "output reg [7:0] res_o;" in normalized
    assert "always @(*) begin" in normalized
    assert "case (state)" in normalized


def test_fsm_extractor_extracts_external_module_instances_from_source():
    source = """
module top(
    input clk_i,
    input rst_i,
    input [7:0] a_bi,
    output busy_o
);
reg start_mult1;
reg [7:0] mult1_reg1, mult1_reg2;
wire [15:0] mult1_res;
wire busy_mult1;
reg state;

localparam IDLE = 1'b0;
localparam RUN = 1'b1;

mult multiplier1 (
    .clk_i(clk_i),
    .rst_i(rst_i),
    .start_i(start_mult1),
    .a_bi(mult1_reg1),
    .b_bi(mult1_reg2),
    .y_bo(mult1_res),
    .busy_o(busy_mult1)
);

assign busy_o = busy_mult1;

always @(posedge clk_i or posedge rst_i) begin
    if (rst_i) begin
        state <= IDLE;
    end else begin
        case (state)
            IDLE: begin
                state <= RUN;
            end
            RUN: begin
                state <= IDLE;
            end
        endcase
    end
end
endmodule
"""
    fsm = VerilogParser.extract_fsm_from_source(source)

    assert fsm.external_modules == [
        {
            "name": "mult",
            "ports": [
                {"name": "clk_i", "direction": "input", "width": 1},
                {"name": "rst_i", "direction": "input", "width": 1},
                {"name": "start_i", "direction": "input", "width": 1},
                {"name": "a_bi", "direction": "input", "width": 8},
                {"name": "b_bi", "direction": "input", "width": 8},
                {"name": "y_bo", "direction": "output", "width": 16},
                {"name": "busy_o", "direction": "output", "width": 1},
            ],
        }
    ]
    assert fsm.module_instances == [
        {
            "name": "multiplier1",
            "module_name": "mult",
            "connections": {
                "clk_i": "clk_i",
                "rst_i": "rst_i",
                "start_i": "start_mult1",
                "a_bi": "mult1_reg1",
                "b_bi": "mult1_reg2",
                "y_bo": "mult1_res",
                "busy_o": "busy_mult1",
            },
        }
    ]
    assert all("multiplier1" not in item for item in fsm.preserved_items)


def test_fsm_extractor_does_not_treat_output_only_writes_as_mixed_datapath():
    fsm = FSM()
    fsm.add_signal("done", "output")
    fsm.add_signal("part_res", "reg")

    extractor = FSMExtractor.__new__(FSMExtractor)
    extractor.fsm = fsm
    extractor.state_var = "state"
    extractor.next_state_var = "next_state"

    output_only_block = Block(
        [
            NonblockingSubstitution(
                Lvalue(Identifier("state")),
                Rvalue(Identifier("RUN")),
            ),
            NonblockingSubstitution(
                Lvalue(Identifier("done")),
                Rvalue(IntConst("1'b1")),
            ),
        ]
    )
    internal_write_block = Block(
        [
            NonblockingSubstitution(
                Lvalue(Identifier("state")),
                Rvalue(Identifier("RUN")),
            ),
            NonblockingSubstitution(
                Lvalue(Identifier("part_res")),
                Rvalue(IntConst("4'd3")),
            ),
        ]
    )

    assert extractor._always_mixes_fsm_and_datapath(output_only_block) is False
    assert extractor._always_mixes_fsm_and_datapath(internal_write_block) is True


def test_fsm_extractor_classifies_fsm_block_roles():
    fsm = FSM()
    fsm.add_signal("done", "output")
    fsm.add_signal("part_res", "reg")

    extractor = FSMExtractor.__new__(FSMExtractor)
    extractor.fsm = fsm
    extractor.state_var = "state"
    extractor.next_state_var = "next_state"

    next_state_block = Block(
        [
            BlockingSubstitution(
                Lvalue(Identifier("next_state")),
                Rvalue(Identifier("RUN")),
            ),
            BlockingSubstitution(
                Lvalue(Identifier("done")),
                Rvalue(IntConst("1'b1")),
            ),
        ]
    )
    output_only_block = Block(
        [
            BlockingSubstitution(
                Lvalue(Identifier("done")),
                Rvalue(IntConst("1'b1")),
            ),
        ]
    )
    mixed_block = Block(
        [
            NonblockingSubstitution(
                Lvalue(Identifier("state")),
                Rvalue(Identifier("RUN")),
            ),
            NonblockingSubstitution(
                Lvalue(Identifier("part_res")),
                Rvalue(IntConst("4'd3")),
            ),
        ]
    )

    assert extractor._classify_fsm_block(next_state_block) == "next_state_logic"
    assert extractor._classify_fsm_block(output_only_block) == "output_logic"
    assert extractor._classify_fsm_block(mixed_block) == "mixed_fsm_datapath"


def test_single_process_sync_reset_import_sets_seq_domains_and_sync_reset():
    source = """
module mult (
    input clk_i,
    input rst_i,
    input start_i,
    output busy_o,
    output reg [15:0] y_bo
);
    localparam IDLE = 1'b0;
    localparam WORK = 1'b1;

    reg [2:0] ctr;
    reg state;
    reg ready;
    assign busy_o = !ready;

    always @(posedge clk_i)
        if (rst_i) begin
            ctr <= 0;
            y_bo <= 0;
            state <= IDLE;
            ready <= 1;
        end else begin
            case (state)
                IDLE:
                    if (start_i) begin
                        state <= WORK;
                        ready <= 0;
                    end
                WORK:
                    begin
                        state <= IDLE;
                        ready <= 1;
                    end
            endcase
        end
endmodule
"""

    fsm = VerilogParser.extract_fsm_from_source(source)

    assert fsm.import_style == "single_process"
    assert fsm.reset_mode == "sync"
    assert all(state.action_domain == "seq" for state in fsm.states.values())
    assert all(transition.action_domain == "seq" for transition in fsm.transitions)
