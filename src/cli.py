import argparse
import json

from api.fsm_builder import build_fsm
from api.schemas import FSMSchema
from generator.verilog_generator import VerilogGenerator


def main():
    parser = argparse.ArgumentParser(description="Generate Verilog from FSM JSON")
    parser.add_argument("input", help="Path to FSM JSON file")
    parser.add_argument("-o", "--output", help="Optional output .sv/.v file")
    parser.add_argument("--module-name", default="fsm_module", help="Generated Verilog module name")
    parser.add_argument("--encoding", choices=["onehot", "binary"], default="onehot")
    args = parser.parse_args()

    with open(args.input, encoding="utf-8") as f:
        data = json.load(f)

    schema = FSMSchema(**data)
    fsm = build_fsm(schema)

    gen = VerilogGenerator(fsm, module_name=args.module_name, encoding=args.encoding)
    verilog = gen.generate()

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(verilog)
        return

    print(verilog)


if __name__ == "__main__":
    main()
