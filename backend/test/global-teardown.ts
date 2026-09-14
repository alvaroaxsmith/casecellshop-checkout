import { ChildProcess } from "child_process";

export default async function globalTeardown(): Promise<void> {
  const child = (globalThis as Record<string, unknown>).__ERP_MOCK_PROCESS__ as ChildProcess | undefined;
  child?.kill();
}
