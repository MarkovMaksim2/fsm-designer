from pathlib import Path
import os
import re
import shutil
from tempfile import NamedTemporaryFile

from pyverilog.vparser.parser import parse
from parser.fsm_extractor import FSMExtractor


class VerilogParser:
    SYSTEMVERILOG_NORMALIZATIONS = (
        (re.compile(r"\balways_ff\b"), "always"),
        (re.compile(r"\balways_comb\b"), "always @(*)"),
        (re.compile(r"\balways_latch\b"), "always @(*)"),
        (re.compile(r"\bunique\s+case\b"), "case"),
        (re.compile(r"\binput\s+logic\b"), "input"),
        (re.compile(r"\boutput\s+logic\b"), "output reg"),
        (re.compile(r"\binout\s+logic\b"), "inout"),
        (re.compile(r"\blogic\b"), "reg"),
        (re.compile(r"(?<![\w'])'0\b"), "0"),
        (re.compile(r"(?<![\w'])'1\b"), "1"),
    )

    def __init__(self, filepath: str):
        self.filepath = filepath

    @staticmethod
    def _ensure_iverilog_on_path():
        if shutil.which("iverilog") is not None:
            return

        candidates = []
        if os.name == "nt":
            candidates.extend(
                [
                    Path("C:/iverilog/bin"),
                    Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Icarus Verilog" / "bin",
                    Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "iverilog" / "bin",
                    Path(os.environ.get("ProgramFiles(x86)", "C:/Program Files (x86)"))
                    / "Icarus Verilog"
                    / "bin",
                    Path(os.environ.get("ProgramFiles(x86)", "C:/Program Files (x86)"))
                    / "iverilog"
                    / "bin",
                ]
            )

        for candidate in candidates:
            executable = "iverilog.exe" if os.name == "nt" else "iverilog"
            if (candidate / executable).exists():
                os.environ["PATH"] = f"{candidate}{os.pathsep}{os.environ.get('PATH', '')}"
                return

    def parse(self):
        self._ensure_iverilog_on_path()
        try:
            ast, _ = parse([self.filepath])
        except FileNotFoundError as exc:
            if exc.filename in {None, "iverilog", "iverilog.exe"}:
                raise RuntimeError(
                    "Для импорта Verilog требуется внешний бинарный файл `iverilog`, "
                    "но он не установлен или недоступен в PATH. Установите Icarus Verilog "
                    "или добавьте папку с `iverilog.exe` и `vvp.exe` в PATH."
                ) from exc
            raise
        return ast

    def extract_fsm(self):
        ast = self.parse()
        extractor = FSMExtractor(ast)
        return extractor.extract()

    @classmethod
    def normalize_source_for_parser(cls, source: str) -> str:
        normalized = source
        for pattern, replacement in cls.SYSTEMVERILOG_NORMALIZATIONS:
            normalized = pattern.sub(replacement, normalized)
        return normalized

    @classmethod
    def extract_fsm_from_source(cls, source: str):
        normalized_source = cls.normalize_source_for_parser(source)
        with NamedTemporaryFile("w", suffix=".v", delete=False, encoding="utf-8") as handle:
            handle.write(normalized_source)
            temp_path = Path(handle.name)

        try:
            return cls(str(temp_path)).extract_fsm()
        finally:
            temp_path.unlink(missing_ok=True)
