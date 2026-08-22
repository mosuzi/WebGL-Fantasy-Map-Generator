import {normalizeRenderResourceBinding, sameRenderResourceBinding} from "../renderer/render-resource-binding.js";

type PreparedRenderBindingContract = Readonly<{
  path: string;
  schemaCode: string;
  invalidCode: string;
  staleCode: string;
  label: string;
}>;

export function validatePreparedWorkerRenderBinding(
  value: unknown,
  expectedValue: unknown,
  contract: PreparedRenderBindingContract
): void {
  if (value === undefined || value === null) return;
  const prepared = record(value, contract.path, contract.invalidCode);
  if (prepared.schemaVersion !== 1) {
    throw protocolError(contract.schemaCode, `${contract.label} renderer source schema 无效`);
  }
  if (expectedValue === undefined || expectedValue === null || prepared.binding === undefined || prepared.binding === null) {
    throw protocolError(contract.invalidCode, `${contract.label} renderer resource binding 不完整`);
  }
  let actual;
  let expected;
  try {
    actual = normalizeRenderResourceBinding(prepared.binding, `${contract.path}.binding`);
    expected = normalizeRenderResourceBinding(expectedValue, `${contract.path}.expectedBinding`);
  } catch {
    throw protocolError(contract.invalidCode, `${contract.label} renderer resource binding 不完整`);
  }
  if (!sameRenderResourceBinding(actual, expected)) {
    throw protocolError(contract.staleCode, `${contract.label} renderer resource binding 与请求不一致`);
  }
}

function record(value: unknown, path: string, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ArrayBuffer.isView(value)) {
    throw protocolError(code, `${path} 必须是普通对象`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw protocolError(code, `${path} 必须是普通对象`);
  return value as Record<string, unknown>;
}

function protocolError(code: string, message: string): Error & {code: string} {
  return Object.assign(new Error(message), {code});
}
