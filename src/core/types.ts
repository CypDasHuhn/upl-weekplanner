export interface UplTask {
  id: string;
  [field: string]: unknown;
}

export interface UplDocument {
  id: string;
  kind?: string;
  tasks?: UplTask[];
  [field: string]: unknown;
}

export interface UplMutation {
  field: string;
  value: unknown;
  target?: string;
}

export interface UplRequest {
  requester: string;
  mutations: UplMutation[];
  createTasks?: UplTask[];
  removeTasks?: string[];
}

export interface UplChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  target?: string;
}

export type UplResult = { ok: true; document: UplDocument; changes: UplChange[] } | { ok: false; reason: string };
