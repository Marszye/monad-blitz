import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import solc from "solc";

export interface CompiledContract {
  abi: unknown[];
  bytecode: `0x${string}`;
}

export function compileApiRegistry(): CompiledContract {
  const contractPath = resolve(process.cwd(), "contracts/ApiRegistry.sol");
  const source = readFileSync(contractPath, "utf8");

  const input = {
    language: "Solidity",
    sources: {
      "ApiRegistry.sol": { content: source },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  const errors = (output.errors ?? []).filter(
    (e: { severity: string }) => e.severity === "error",
  );
  if (errors.length > 0) {
    const messages = errors.map((e: { formattedMessage: string }) => e.formattedMessage).join("\n");
    throw new Error(`Solidity compilation failed:\n${messages}`);
  }

  const contract = output.contracts["ApiRegistry.sol"]["ApiRegistry"];

  return {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
  };
}
