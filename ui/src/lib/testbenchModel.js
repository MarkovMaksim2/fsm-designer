function busRange(width) {
  return width > 1 ? `[${width - 1}:0] ` : "";
}

function buildDeclaration(signal) {
  const range = busRange(signal.width);
  if (signal.direction === "input") {
    return `  logic ${range}${signal.name};`;
  }

  return `  wire ${range}${signal.name};`;
}

function buildPortConnection(signal) {
  return `    .${signal.name}(${signal.name})`;
}

function getPortSignals(fsm) {
  const signals = fsm.signals ?? [];
  const byName = new Map(signals.map((signal) => [signal.name, signal]));
  const portNames = Array.isArray(fsm.module_ports) && fsm.module_ports.length > 0
    ? fsm.module_ports
    : signals
      .filter((signal) => signal.direction === "input" || signal.direction === "output" || signal.direction === "output_reg")
      .map((signal) => signal.name);

  return portNames
    .map((portName) => byName.get(portName))
    .filter(Boolean);
}

function isClockSignal(signalName, fallbackClockName) {
  const normalized = signalName.toLowerCase();
  return signalName === fallbackClockName || normalized.includes("clk") || normalized.endsWith("_clk");
}

function isResetSignal(signalName, fallbackResetName) {
  const normalized = signalName.toLowerCase();
  return signalName === fallbackResetName || normalized.includes("rst") || normalized.includes("reset");
}

function isStartSignal(signalName) {
  const normalized = signalName.toLowerCase();
  return normalized.includes("start") || normalized.includes("valid") || normalized.includes("go");
}

function buildStimulus(signals, clockName, resetName) {
  const lines = [];
  const startSignals = [];

  for (const signal of signals) {
    if (signal.direction !== "input") {
      continue;
    }
    if (isClockSignal(signal.name, clockName) || isResetSignal(signal.name, resetName)) {
      continue;
    }

    lines.push(`    ${signal.name} = ${signal.width > 1 ? `'0` : "1'b0"};`);
    if (isStartSignal(signal.name)) {
      startSignals.push(signal);
    }
  }

  lines.push("    #20;");

  if (signals.some((signal) => isResetSignal(signal.name, resetName))) {
    lines.push(`    ${resetName} = 1'b0;`);
    lines.push("    #10;");
  }

  for (const signal of startSignals) {
    lines.push(`    ${signal.name} = 1'b1;`);
  }

  if (startSignals.length > 0) {
    lines.push("    #10;");
    for (const signal of startSignals) {
      lines.push(`    ${signal.name} = 1'b0;`);
    }
  }

  return lines;
}

function buildMonitorSignals(signals) {
  return signals.map((signal) => signal.name).join(", ");
}

export function createStarterTestbench(fsm) {
  const moduleName = fsm.module_name || "fsm_module";
  const clockName = fsm.clock_signal_name || "clk";
  const resetName = fsm.reset_signal_name || "reset";
  const portSignals = getPortSignals(fsm);
  const declarations = portSignals.map(buildDeclaration).join("\n");
  const portConnections = portSignals.map(buildPortConnection).join(",\n");
  const hasClock = portSignals.some((signal) => signal.name === clockName && signal.direction === "input");
  const hasReset = portSignals.some((signal) => signal.name === resetName && signal.direction === "input");
  const monitorSignals = buildMonitorSignals(portSignals);
  const stimulusLines = buildStimulus(portSignals, clockName, resetName);

  return [
    "`timescale 1ns/1ps",
    "",
    "module tb;",
    declarations,
    "",
    `  ${moduleName} dut (`,
    portConnections,
    "  );",
    "",
    hasClock ? `  always #5 ${clockName} = ~${clockName};` : "",
    "",
    "  initial begin",
    '    $dumpfile("wave.vcd");',
    "    $dumpvars(0, tb);",
    monitorSignals ? `    $monitor("%0t ${monitorSignals.replaceAll(", ", "=%h ")}=%h", $time, ${monitorSignals});` : "",
    hasClock ? `    ${clockName} = 1'b0;` : "",
    hasReset ? `    ${resetName} = 1'b1;` : "",
    ...stimulusLines,
    "    // TODO: расширить последовательность стимулов под свой сценарий",
    "    #100;",
    "    $finish;",
    "  end",
    "endmodule",
  ]
    .filter(Boolean)
    .join("\n");
}
