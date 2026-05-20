from core.fsm import FSM
from generator.verilog_generator import VerilogGenerator


fsm = FSM()

fsm.add_signal("clk", "input")
fsm.add_signal("reset", "input")
fsm.add_signal("in_sig", "input")
fsm.add_signal("out_sig", "output")

fsm.add_state("IDLE", is_initial=True)
fsm.add_state("WORK")

fsm.add_state_action("IDLE", "out_sig = 0;")
fsm.add_state_action("WORK", "out_sig = 1;")

t1 = fsm.add_transition("IDLE", "WORK", "in_sig")
t2 = fsm.add_transition("WORK", "IDLE", "!in_sig")

fsm.validate()

gen = VerilogGenerator(fsm)
print(gen.generate())