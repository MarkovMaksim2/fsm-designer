from pathlib import Path
from subprocess import run
from tempfile import TemporaryDirectory


def simulate_verilog(source: str, testbench: str):
    with TemporaryDirectory(prefix="fsm-sim-") as temp_dir:
        root = Path(temp_dir)
        design_path = root / "design.sv"
        testbench_path = root / "tb.sv"
        output_path = root / "sim.out"

        design_path.write_text(source, encoding="utf-8")
        testbench_path.write_text(testbench, encoding="utf-8")

        compile_result = run(
            [
                "iverilog",
                "-g2012",
                "-o",
                str(output_path),
                str(design_path),
                str(testbench_path),
            ],
            capture_output=True,
            text=True,
            cwd=root,
            check=False,
        )

        if compile_result.returncode != 0:
            return {
                "success": False,
                "stdout": compile_result.stdout,
                "stderr": compile_result.stderr,
            }

        run_result = run(
            ["vvp", str(output_path)],
            capture_output=True,
            text=True,
            cwd=root,
            check=False,
        )

        return {
            "success": run_result.returncode == 0,
            "stdout": run_result.stdout,
            "stderr": compile_result.stderr + run_result.stderr,
        }
