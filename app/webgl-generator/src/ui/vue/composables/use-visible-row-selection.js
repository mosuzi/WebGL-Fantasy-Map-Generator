import {computed, ref, watch} from "vue";
import {objectIdKey} from "../../object-id.js";

export function useVisibleRowSelection(visibleRows, {idKey = "id"} = {}) {
  const selectedRowIds = ref([]);
  const selectedIdSet = computed(() => new Set(selectedRowIds.value.map(objectIdKey)));
  const selectedRows = computed(() => visibleRows.value.filter(row => selectedIdSet.value.has(objectIdKey(row?.[idKey]))));

  watch(visibleRows, nextRows => {
    const visibleIds = new Set(nextRows.map(row => objectIdKey(row?.[idKey])));
    selectedRowIds.value = selectedRowIds.value.filter(id => visibleIds.has(objectIdKey(id)));
  });

  return {
    selectedRowIds,
    selectedRows
  };
}
