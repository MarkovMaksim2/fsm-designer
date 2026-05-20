from analysis.advanced_analyzer import AdvancedFSMAnalyzer
from core.fsm import FSM
from core.serializer import fsm_from_json, fsm_to_json
from generator.verilog_generator import VerilogGenerator


def build_sample_fsm():
    fsm = FSM()
    fsm.add_signal("clk", "input")
    fsm.add_signal("reset", "input")
    fsm.add_signal("req", "input")
    fsm.add_signal("ready", "input")
    fsm.add_signal("gate", "wire")
    fsm.signals["gate"].set_expression("req & ready")
    fsm.add_signal("grant", "output")
    fsm.signals["grant"].set_default("1'b0")

    fsm.add_state("IDLE", is_initial=True)
    fsm.add_state("BUSY")
    fsm.add_state_action("BUSY", "grant = 1'b1;")

    fsm.add_transition("IDLE", "BUSY", "req")
    fsm.add_transition("IDLE", "IDLE", "1")
    fsm.add_transition("BUSY", "IDLE", "!req")
    fsm.add_transition("BUSY", "BUSY", "1")
    return fsm


def test_serializer_roundtrip_preserves_actions_and_signals():
    fsm = build_sample_fsm()

    restored = fsm_from_json(fsm_to_json(fsm))

    assert restored.initial_state == "IDLE"
    assert restored.signals["grant"].default == "1'b0"
    assert restored.signals["gate"].expression == "req & ready"
    assert restored.states["BUSY"].actions == ["grant = 1'b1;"]
    assert len(restored.transitions) == 4


def test_generator_produces_safe_module_with_state_defaults():
    fsm = build_sample_fsm()
    fsm.module_name = "arbiter_fsm"
    fsm.module_ports = ["clk", "reset", "req", "ready", "grant"]
    fsm.preserved_items = ["assign sticky = grant;"]
    fsm.state_signal_name = "state_q"
    fsm.next_state_signal_name = "state_d"

    verilog = VerilogGenerator(fsm, encoding="binary").generate()

    assert "module arbiter_fsm" in verilog
    assert "state_q" in verilog
    assert "state_d = IDLE;" in verilog
    assert "assign gate = req & ready;" in verilog
    assert "assign sticky = grant;" in verilog
    assert "grant = 1'b0;" in verilog
    assert "localparam IDLE" in verilog


def test_generator_keeps_nonblocking_assignments_in_sequential_action_logic():
    fsm = FSM()
    fsm.add_signal("clk", "input")
    fsm.add_signal("reset", "input")
    fsm.add_signal("start", "input")
    fsm.add_signal("done", "output_reg")
    fsm.add_state("IDLE", is_initial=True, action_domain="seq")
    fsm.add_state("WORK")
    fsm.add_state_action("IDLE", "done <= 1'b0;")
    transition = fsm.add_transition("IDLE", "WORK", "start", action_domain="seq")
    transition.add_action("done <= 1'b1;")

    verilog = VerilogGenerator(fsm, use_sv=False).generate()

    assert "always @(posedge clk or posedge reset)" in verilog
    assert "done <= 1'b0;" in verilog
    assert "done <= 1'b1;" in verilog


def test_generator_rejects_nonblocking_assignment_in_combinational_domain():
    fsm = FSM()
    fsm.add_signal("clk", "input")
    fsm.add_signal("reset", "input")
    fsm.add_signal("go", "input")
    fsm.add_signal("grant", "output_reg")
    fsm.add_state("IDLE", is_initial=True, action_domain="comb")
    fsm.add_state_action("IDLE", "grant <= 1'b1;")

    try:
        VerilogGenerator(fsm, use_sv=False).generate()
        assert False, "Ожидалась ошибка для <= в combinational domain"
    except ValueError as exc:
        assert "Неблокирующее присваивание" in str(exc)


def test_generator_supports_resetless_two_process_style_with_initial_block():
    fsm = FSM()
    fsm.reset_mode = "none"
    fsm.add_signal("clk", "input")
    fsm.add_signal("go", "input")
    fsm.add_signal("grant", "output_reg")
    fsm.add_state("IDLE", is_initial=True, action_domain="seq")
    fsm.add_state("WORK")
    fsm.add_reset_action("grant <= 1'b0;")
    fsm.add_transition("IDLE", "WORK", "go", action_domain="seq")
    fsm.add_transition("WORK", "IDLE", "1", action_domain="seq")

    verilog = VerilogGenerator(fsm, use_sv=False).generate()

    assert "initial begin" in verilog
    assert "state = IDLE;" in verilog
    assert "grant = 1'b0;" in verilog
    assert "always @(posedge clk) begin" in verilog


def test_advanced_analyzer_reports_clean_fsm():
    report = AdvancedFSMAnalyzer(build_sample_fsm()).full_analysis()

    assert report["summary"]["states"] == 2
    assert report["structure"]["unreachable_states"] == []
    assert sorted(report["signals"]["unused_signals"]) == ["gate", "ready"]
    assert report["signals"]["unassigned_outputs"] == []


def test_advanced_analyzer_proves_simple_complements_and_overlap():
    fsm = FSM()
    fsm.add_signal("clk", "input")
    fsm.add_signal("reset", "input")
    fsm.add_signal("go", "input")
    fsm.add_state("IDLE", is_initial=True)
    fsm.add_state("RUN")
    fsm.add_transition("IDLE", "RUN", "go")
    fsm.add_transition("IDLE", "IDLE", "!go")
    fsm.add_transition("RUN", "RUN", "go")
    fsm.add_transition("RUN", "IDLE", "go == 1'b1")

    report = AdvancedFSMAnalyzer(fsm).full_analysis()

    assert report["formal"]["coverage_issues"][0]["state"] == "RUN"
    assert report["formal"]["coverage_issues"][0]["method"] == "формальный анализ"
    assert report["formal"]["summary"]["supported_transitions"] == 4
    assert report["formal"]["summary"]["unsupported_transitions"] == 0
    assert report["formal"]["nondeterministic"][0]["state"] == "RUN"
    assert report["formal"]["nondeterministic"][0]["method"] == "формальный анализ"


def test_advanced_analyzer_treats_complementary_branches_as_complete_without_default():
    fsm = FSM()
    fsm.add_signal("clk", "input")
    fsm.add_signal("reset", "input")
    fsm.add_signal("start_i", "input")
    fsm.add_state("IDLE", is_initial=True)
    fsm.add_state("WORK")
    fsm.add_transition("IDLE", "WORK", "start_i")
    fsm.add_transition("IDLE", "IDLE", "!(start_i)")

    report = AdvancedFSMAnalyzer(fsm).full_analysis()

    assert report["behavior"]["missing_coverage"] == []
    assert report["safety"]["unsafe_states"] == []


def test_advanced_analyzer_proves_multi_branch_formal_coverage():
    fsm = FSM()
    fsm.add_signal("clk", "input")
    fsm.add_signal("reset", "input")
    fsm.add_signal("a", "input")
    fsm.add_signal("b", "input")
    fsm.add_state("IDLE", is_initial=True)
    fsm.add_state("S1")
    fsm.add_state("S2")
    fsm.add_state("S3")
    fsm.add_transition("IDLE", "S1", "a && b")
    fsm.add_transition("IDLE", "S2", "a && !b")
    fsm.add_transition("IDLE", "S3", "!a")

    report = AdvancedFSMAnalyzer(fsm).full_analysis()

    assert report["formal"]["coverage_issues"] == []
    assert report["formal"]["summary"]["supported_transitions"] == 3
    assert report["formal"]["summary"]["unsupported_transitions"] == 0


def test_advanced_analyzer_flags_unsupported_complex_guard_as_heuristic_fallback():
    fsm = FSM()
    fsm.add_signal("clk", "input")
    fsm.add_signal("reset", "input")
    fsm.add_signal("data", "input", width=13)
    fsm.add_state("IDLE", is_initial=True)
    fsm.add_state("RUN")
    fsm.add_transition("IDLE", "RUN", "data > 3")
    fsm.add_transition("IDLE", "IDLE", "data <= 3")

    report = AdvancedFSMAnalyzer(fsm).full_analysis()

    assert report["formal"]["summary"]["supported_transitions"] == 0
    assert report["formal"]["summary"]["unsupported_transitions"] == 2
    assert report["formal"]["summary"]["unsupported_reason_counts"]["domain_too_wide"] == 2
    assert report["formal"]["coverage_issues"][0]["state"] == "IDLE"
    assert report["formal"]["coverage_issues"][0]["method"] == "эвристический режим"
    assert "12 суммарных битов" in report["formal"]["unsupported_guards"][0]["reason"]


def test_advanced_analyzer_supports_multibit_constant_comparisons():
    fsm = FSM()
    fsm.add_signal("clk", "input")
    fsm.add_signal("reset", "input")
    fsm.add_signal("ctr", "reg", width=3)
    fsm.add_state("WORK", is_initial=True)
    fsm.add_state("LAST")
    fsm.add_transition("WORK", "LAST", "ctr == 3'h7")
    fsm.add_transition("WORK", "WORK", "ctr != 3'h7")

    report = AdvancedFSMAnalyzer(fsm).full_analysis()

    assert report["formal"]["coverage_issues"] == []
    assert report["formal"]["summary"]["supported_transitions"] == 2
    assert report["formal"]["summary"]["unsupported_transitions"] == 0


def test_advanced_analyzer_reports_parse_reason_for_unsupported_guard():
    fsm = FSM()
    fsm.add_signal("clk", "input")
    fsm.add_signal("reset", "input")
    fsm.add_signal("a", "input")
    fsm.add_state("IDLE", is_initial=True)
    fsm.add_state("RUN")
    fsm.add_transition("IDLE", "RUN", "{a, a}")
    fsm.add_transition("IDLE", "IDLE", "1")

    report = AdvancedFSMAnalyzer(fsm).full_analysis()

    unsupported = report["formal"]["unsupported_guards"][0]
    assert unsupported["reason_code"] == "parse_error"
    assert "Неподдерживаемый токен рядом" in unsupported["reason"]


def test_advanced_analyzer_supports_relational_multibit_guards():
    fsm = FSM()
    fsm.add_signal("clk", "input")
    fsm.add_signal("reset", "input")
    fsm.add_signal("ctr", "reg", width=2)
    fsm.add_state("IDLE", is_initial=True)
    fsm.add_state("LOW")
    fsm.add_state("HIGH")
    fsm.add_transition("IDLE", "LOW", "ctr < 2")
    fsm.add_transition("IDLE", "HIGH", "ctr >= 2")

    report = AdvancedFSMAnalyzer(fsm).full_analysis()

    assert report["formal"]["coverage_issues"] == []
    assert report["formal"]["summary"]["supported_transitions"] == 2
    assert report["formal"]["summary"]["unsupported_transitions"] == 0


def test_advanced_analyzer_supports_indexed_bit_select_guards():
    fsm = FSM()
    fsm.add_signal("clk", "input")
    fsm.add_signal("reset", "input")
    fsm.add_signal("ctr", "reg", width=3)
    fsm.add_signal("b", "reg", width=8)
    fsm.add_state("WORK", is_initial=True)
    fsm.add_state("SHIFT")
    fsm.add_transition("WORK", "SHIFT", "b[ctr]")
    fsm.add_transition("WORK", "WORK", "!b[ctr]")

    report = AdvancedFSMAnalyzer(fsm).full_analysis()

    assert report["formal"]["coverage_issues"] == []
    assert report["formal"]["summary"]["supported_transitions"] == 2
    assert report["formal"]["summary"]["unsupported_transitions"] == 0


def test_advanced_analyzer_supports_fixed_bit_select_in_composed_guard():
    fsm = FSM()
    fsm.add_signal("clk", "input")
    fsm.add_signal("reset", "input")
    fsm.add_signal("flags", "reg", width=4)
    fsm.add_signal("start", "input")
    fsm.add_state("IDLE", is_initial=True)
    fsm.add_state("RUN")
    fsm.add_state("WAIT")
    fsm.add_transition("IDLE", "RUN", "flags[0] && start")
    fsm.add_transition("IDLE", "WAIT", "!(flags[0] && start)")

    report = AdvancedFSMAnalyzer(fsm).full_analysis()

    assert report["formal"]["coverage_issues"] == []
    assert report["formal"]["summary"]["supported_transitions"] == 2
    assert report["formal"]["summary"]["unsupported_transitions"] == 0


def test_advanced_analyzer_supports_partselect_guards():
    fsm = FSM()
    fsm.add_signal("clk", "input")
    fsm.add_signal("reset", "input")
    fsm.add_signal("flags", "reg", width=4)
    fsm.add_state("IDLE", is_initial=True)
    fsm.add_state("MATCH")
    fsm.add_state("MISS")
    fsm.add_transition("IDLE", "MATCH", "flags[3:2] == 2'b10")
    fsm.add_transition("IDLE", "MISS", "flags[3:2] != 2'b10")

    report = AdvancedFSMAnalyzer(fsm).full_analysis()

    assert report["formal"]["coverage_issues"] == []
    assert report["formal"]["summary"]["supported_transitions"] == 2
    assert report["formal"]["summary"]["unsupported_transitions"] == 0


def test_advanced_analyzer_supports_single_bit_partselect_as_boolean_guard():
    fsm = FSM()
    fsm.add_signal("clk", "input")
    fsm.add_signal("reset", "input")
    fsm.add_signal("flags", "reg", width=4)
    fsm.add_state("IDLE", is_initial=True)
    fsm.add_state("RUN")
    fsm.add_state("WAIT")
    fsm.add_transition("IDLE", "RUN", "flags[1:1]")
    fsm.add_transition("IDLE", "WAIT", "!flags[1:1]")

    report = AdvancedFSMAnalyzer(fsm).full_analysis()

    assert report["formal"]["coverage_issues"] == []
    assert report["formal"]["summary"]["supported_transitions"] == 2
    assert report["formal"]["summary"]["unsupported_transitions"] == 0


def test_advanced_analyzer_supports_bitmask_guards():
    fsm = FSM()
    fsm.add_signal("clk", "input")
    fsm.add_signal("reset", "input")
    fsm.add_signal("flags", "reg", width=4)
    fsm.add_state("IDLE", is_initial=True)
    fsm.add_state("MATCH")
    fsm.add_state("MISS")
    fsm.add_transition("IDLE", "MATCH", "(flags & 4'b0011) != 0")
    fsm.add_transition("IDLE", "MISS", "(flags & 4'b0011) == 0")

    report = AdvancedFSMAnalyzer(fsm).full_analysis()

    assert report["formal"]["coverage_issues"] == []
    assert report["formal"]["summary"]["supported_transitions"] == 2
    assert report["formal"]["summary"]["unsupported_transitions"] == 0


def test_advanced_analyzer_supports_shifted_index_mask_guards():
    fsm = FSM()
    fsm.add_signal("clk", "input")
    fsm.add_signal("reset", "input")
    fsm.add_signal("mask", "reg", width=4)
    fsm.add_signal("ctr", "reg", width=2)
    fsm.add_state("WORK", is_initial=True)
    fsm.add_state("HIT")
    fsm.add_state("MISS")
    fsm.add_transition("WORK", "HIT", "((mask >> ctr) & 1) == 1")
    fsm.add_transition("WORK", "MISS", "((mask >> ctr) & 1) == 0")

    report = AdvancedFSMAnalyzer(fsm).full_analysis()

    assert report["formal"]["coverage_issues"] == []
    assert report["formal"]["summary"]["supported_transitions"] == 2
    assert report["formal"]["summary"]["unsupported_transitions"] == 0


def test_advanced_analyzer_supports_simple_arithmetic_guards():
    fsm = FSM()
    fsm.add_signal("clk", "input")
    fsm.add_signal("reset", "input")
    fsm.add_signal("ctr", "reg", width=2)
    fsm.add_state("IDLE", is_initial=True)
    fsm.add_state("NEXT")
    fsm.add_state("STAY")
    fsm.add_transition("IDLE", "NEXT", "(ctr + 1) == 3")
    fsm.add_transition("IDLE", "STAY", "(ctr + 1) != 3")

    report = AdvancedFSMAnalyzer(fsm).full_analysis()

    assert report["formal"]["coverage_issues"] == []
    assert report["formal"]["summary"]["supported_transitions"] == 2
    assert report["formal"]["summary"]["unsupported_transitions"] == 0


def test_advanced_analyzer_supports_reduction_or_guards():
    fsm = FSM()
    fsm.add_signal("clk", "input")
    fsm.add_signal("reset", "input")
    fsm.add_signal("flags", "reg", width=4)
    fsm.add_state("IDLE", is_initial=True)
    fsm.add_state("SET")
    fsm.add_state("CLEAR")
    fsm.add_transition("IDLE", "SET", "|flags")
    fsm.add_transition("IDLE", "CLEAR", "~|flags")

    report = AdvancedFSMAnalyzer(fsm).full_analysis()

    assert report["formal"]["coverage_issues"] == []
    assert report["formal"]["summary"]["supported_transitions"] == 2
    assert report["formal"]["summary"]["unsupported_transitions"] == 0


def test_advanced_analyzer_supports_reduction_and_guards():
    fsm = FSM()
    fsm.add_signal("clk", "input")
    fsm.add_signal("reset", "input")
    fsm.add_signal("mask", "reg", width=3)
    fsm.add_state("IDLE", is_initial=True)
    fsm.add_state("FULL")
    fsm.add_state("PARTIAL")
    fsm.add_transition("IDLE", "FULL", "&mask")
    fsm.add_transition("IDLE", "PARTIAL", "~&mask")

    report = AdvancedFSMAnalyzer(fsm).full_analysis()

    assert report["formal"]["coverage_issues"] == []
    assert report["formal"]["summary"]["supported_transitions"] == 2
    assert report["formal"]["summary"]["unsupported_transitions"] == 0


def test_advanced_analyzer_supports_reduction_xor_guards():
    fsm = FSM()
    fsm.add_signal("clk", "input")
    fsm.add_signal("reset", "input")
    fsm.add_signal("bits", "reg", width=3)
    fsm.add_state("IDLE", is_initial=True)
    fsm.add_state("ODD")
    fsm.add_state("EVEN")
    fsm.add_transition("IDLE", "ODD", "^bits")
    fsm.add_transition("IDLE", "EVEN", "^~bits")

    report = AdvancedFSMAnalyzer(fsm).full_analysis()

    assert report["formal"]["coverage_issues"] == []
    assert report["formal"]["summary"]["supported_transitions"] == 2
    assert report["formal"]["summary"]["unsupported_transitions"] == 0


def test_advanced_analyzer_emits_explained_quick_fix_details():
    fsm = FSM()
    fsm.add_state("IDLE", is_initial=True)
    fsm.add_state("ORPHAN")

    report = AdvancedFSMAnalyzer(fsm).full_analysis()

    unreachable = report["structure"]["unreachable_details"][0]
    dead = report["structure"]["dead_state_details"][0]

    assert unreachable["state"] == "ORPHAN"
    assert unreachable["quick_fix"]["type"] == "unreachable"
    assert "Удалить состояние `ORPHAN`" in unreachable["quick_fix"]["description"]
    assert dead["state"] == "IDLE"
    assert dead["quick_fix"]["type"] == "dead"


def test_generator_filters_duplicate_state_localparams_from_preserved_items():
    fsm = build_sample_fsm()
    fsm.preserved_items = [
        "localparam IDLE = 1'b0;",
        "localparam BUSY = 1'b1;",
        "assign sticky = grant;",
    ]

    verilog = VerilogGenerator(fsm, encoding="binary").generate()

    assert verilog.count("localparam IDLE") == 1
    assert verilog.count("localparam BUSY") == 1
    assert "assign sticky = grant;" in verilog


def test_generator_supports_normalized_single_process_import():
    fsm = FSM()
    fsm.imported_from_verilog = True
    fsm.import_style = "single_process"
    fsm.module_name = "mult"
    fsm.module_ports = ["clk_i", "rst_i", "start_i", "busy_o"]
    fsm.clock_signal_name = "clk_i"
    fsm.reset_signal_name = "rst_i"
    fsm.add_signal("clk_i", "input")
    fsm.add_signal("rst_i", "input")
    fsm.add_signal("start_i", "input")
    fsm.add_signal("busy_o", "output")
    fsm.add_signal("ready", "reg")
    fsm.add_state("IDLE", is_initial=True)
    fsm.add_state("WORK")
    fsm.add_reset_action("ready <= 1'b1;")
    fsm.add_state_action("WORK", "ready <= 1'b0;")
    fsm.add_transition("IDLE", "WORK", "start_i")
    fsm.add_transition("IDLE", "IDLE", "!(start_i)")
    fsm.add_transition("WORK", "IDLE", "1")

    verilog = VerilogGenerator(fsm).generate()

    assert "always @(posedge clk_i or posedge rst_i)" in verilog
    assert "ready <= 1'b1;" in verilog
    assert "state <= IDLE;" in verilog
    assert "if (start_i) begin" in verilog
    assert "state <= WORK;" in verilog


def test_generator_rejects_nonblocking_assignments_in_output_logic_even_if_action_uses_nonblocking():
    fsm = FSM()
    fsm.module_ports = ["clk_i", "rst_i", "start_i", "a_bi", "b_bi", "y_bo"]
    fsm.clock_signal_name = "clk_i"
    fsm.reset_signal_name = "rst_i"
    fsm.add_signal("clk_i", "input")
    fsm.add_signal("rst_i", "input")
    fsm.add_signal("start_i", "input")
    fsm.add_signal("a_bi", "input", 8)
    fsm.add_signal("b_bi", "input", 8)
    fsm.add_signal("y_bo", "output", 9)
    fsm.add_state("IDLE", is_initial=True)
    fsm.add_state("DONE")
    fsm.add_transition("IDLE", "DONE", "start_i")
    fsm.add_transition("DONE", "IDLE", "1")
    fsm.add_state_action("DONE", "y_bo <= a_bi + b_bi;")

    try:
        VerilogGenerator(fsm, encoding="binary").generate()
        assert False, "Ожидалась ошибка для неблокирующего присваивания в combinational output logic."
    except ValueError as exc:
        assert "Неблокирующее присваивание" in str(exc)


def test_generator_supports_sequential_datapath_regeneration_for_imported_two_process_fsm():
    fsm = FSM()
    fsm.imported_from_verilog = True
    fsm.safe_to_regenerate = True
    fsm.import_style = "two_process"
    fsm.import_block_roles = ["state_register", "next_state_logic", "datapath_logic"]
    fsm.import_internal_action_targets = ["mid_r", "mid3_r"]
    fsm.module_ports = ["clk_i", "rst_i", "start_i", "ready_o", "y_o"]
    fsm.clock_signal_name = "clk_i"
    fsm.reset_signal_name = "rst_i"
    fsm.add_signal("clk_i", "input")
    fsm.add_signal("rst_i", "input")
    fsm.add_signal("start_i", "input")
    fsm.add_signal("ready_o", "output")
    fsm.add_signal("y_o", "output", 8)
    fsm.add_signal("mid_r", "reg", 8)
    fsm.add_signal("mid3_r", "reg", 24)
    fsm.add_state("IDLE", is_initial=True)
    fsm.add_state("DONE")
    fsm.add_reset_action("mid_r <= 8'd0;")
    fsm.add_reset_action("mid3_r <= 24'd0;")
    fsm.add_reset_action("ready_o <= 1'b1;")
    fsm.add_state_action("DONE", "y_o <= mid_r;")
    fsm.add_state_action("DONE", "ready_o <= 1'b1;")
    fsm.add_transition("IDLE", "DONE", "start_i")
    fsm.add_transition("DONE", "IDLE", "1")
    fsm.transitions[0].add_action("mid_r <= 8'd3;")
    fsm.transitions[0].add_action("mid3_r <= 24'd27;")

    verilog = VerilogGenerator(fsm, encoding="binary").generate()

    assert verilog.count("always @(") == 3
    assert "mid_r <= 8'd0;" in verilog
    assert "mid3_r <= 24'd0;" in verilog
    assert "mid_r <= 8'd3;" in verilog
    assert "mid3_r <= 24'd27;" in verilog
    assert "y_o <= mid_r;" in verilog
    assert "always @(*) begin\n    ready_o = 1'd0;" not in verilog
