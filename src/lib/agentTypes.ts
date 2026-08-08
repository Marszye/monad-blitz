export type AgentLogEvent =
  | { step: "request"; endpoint: string; message: string }
  | { step: "402"; endpoint: string; message: string }
  | { step: "paying"; endpoint: string; message: string }
  | { step: "200"; endpoint: string; message: string; txHash: string; body: unknown }
  | { step: "error"; endpoint: string; message: string }
  | { step: "done" };

export type BurstEvent =
  | {
      step: "call";
      index: number;
      ok: boolean;
      txHash?: string;
      message?: string;
      completed: number;
      total: number;
    }
  | { step: "done"; total: number; succeeded: number; failed: number };
