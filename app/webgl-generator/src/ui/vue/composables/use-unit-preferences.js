import {computed} from "vue";
import {normalizeUnitPreferences} from "../../display-units.js";
import {useGlobalConfigStore} from "../stores/global-config-store.js";

export function useUnitPreferences() {
  const config = useGlobalConfigStore();
  return computed(() => normalizeUnitPreferences(config.preferences.units));
}
