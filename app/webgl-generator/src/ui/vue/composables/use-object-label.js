import {useDebugMode} from "./use-debug-mode.js";

export function useObjectLabel() {
  const debugEnabled = useDebugMode();
  return (name, id, fallback = "未命名") => {
    const label = name || fallback;
    return debugEnabled.value ? `${label}（#${id}）` : label;
  };
}
