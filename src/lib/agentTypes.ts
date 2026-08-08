export type AgentLogEvent =
  | { step: "request"; endpoint: string; message: string }
  | { step: "402"; endpoint: string; message: string }
  | { step: "paying"; endpoint: string; message: string }
  | { step: "200"; endpoint: string; message: string; txHash: string; body: unknown }
  | { step: "error"; endpoint: string; message: string }
  | { step: "done" };
