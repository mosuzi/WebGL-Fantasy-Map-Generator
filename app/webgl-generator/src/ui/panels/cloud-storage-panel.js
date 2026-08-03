import {shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";

const CLOUD_STORAGE_PANEL_ID = "cloud-storage-panel";

export function canSelectCloudStorageProvider(state) {
  return state?.busy !== true;
}

export function reconcileCloudStorageFileList(state, files, options = {}) {
  if (options.isCurrent?.() === false) return false;
  const nextFiles = Array.isArray(files) ? files : [];
  state.files = nextFiles;
  const preferredId = String(options.selectId || state.selectedFileId || "");
  state.selectedFileId = nextFiles.some(file => file.id === preferredId) ? preferredId : "";
  return true;
}

export function createCloudStoragePanel(documentRef, manager, registry, component, callbacks = {}) {
  const panelState = shallowReactive({
    open: false,
    providers: registry.listProviderStates(),
    selectedProviderId: "dropbox",
    files: [],
    selectedFileId: "",
    busy: false,
    status: "",
    error: "",
    liveVerified: false,
    version: 0
  });
  let operationEpoch = 0;
  const panelCallbacks = {
    onSelectProvider: id => {
      if (!canSelectCloudStorageProvider(panelState)) return;
      panelState.selectedProviderId = id;
      panelState.files = [];
      panelState.selectedFileId = "";
      clearFeedback();
    },
    onSelectFile: id => {
      panelState.selectedFileId = String(id || "");
    },
    onConnect: () => run("正在打开账号授权…", async (provider, operation) => {
      const result = await provider.connect();
      if (!operation.isCurrent()) return result;
      if (result.connected === true) {
        panelState.status = `已连接 ${provider.getState().label}。`;
        await refreshFilesForProvider(provider, {quiet: true, operation});
      } else {
        panelState.status = result.popup ? "授权窗口已打开。完成授权后请回到这里。" : "正在前往账号授权页面。";
      }
      return result;
    }),
    onDisconnect: () => run("正在断开连接…", async (provider, operation) => {
      await provider.disconnect();
      if (!operation.isCurrent()) return;
      panelState.files = [];
      panelState.selectedFileId = "";
      panelState.status = "已断开连接，访问令牌已从内存清除。";
    }),
    onRefresh: () => refreshFiles(),
    onCreate: () => run("正在创建云端地图…", async (provider, operation) => {
      const payload = await callbacks.onCreatePayload?.();
      if (!payload?.blob) throw new Error("未能生成完整地图存档");
      const created = await provider.createFile(payload);
      if (!operation.isCurrent()) return;
      panelState.status = `已创建“${created.name}”。`;
      await refreshFilesForProvider(provider, {quiet: true, selectId: created.id, operation});
    }),
    onOverwrite: () => {
      const file = selectedFile();
      if (!file) return;
      const confirmed = documentRef.defaultView?.confirm?.(`将用当前地图覆盖“${file.name}”。云端旧版本可能无法恢复，是否继续？`) ?? false;
      if (!confirmed) return;
      return run("正在覆盖云端地图…", async (provider, operation) => {
        const payload = await callbacks.onCreatePayload?.();
        if (!payload?.blob) throw new Error("未能生成完整地图存档");
        const updated = await provider.overwriteFile(file, payload);
        if (!operation.isCurrent()) return;
        panelState.status = `已覆盖“${updated.name || file.name}”。`;
        await refreshFilesForProvider(provider, {quiet: true, selectId: updated.id || file.id, operation});
      });
    },
    onLoad: () => {
      const file = selectedFile();
      if (!file) return;
      const confirmed = documentRef.defaultView?.confirm?.(`载入“${file.name}”会替换当前地图并清空编辑历史，是否继续？`) ?? false;
      if (!confirmed) return;
      return run("正在下载并载入地图…", async (provider, operation) => {
        const blob = await provider.downloadFile(file);
        const result = await callbacks.onLoadPayload?.(blob, file);
        if (!result) throw new Error("地图载入未完成");
        if (operation.isCurrent()) panelState.status = `已载入“${file.name}”。`;
      });
    }
  };

  const record = manager.registerPanel(CLOUD_STORAGE_PANEL_ID, {
    title: "云端存储",
    left: 486,
    top: 116,
    width: 620,
    minWidth: 340,
    maxWidth: 760,
    persistOpen: false,
    onClose: () => {
      panelState.open = false;
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-cloud-storage-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => component,
    {state: panelState, callbacks: panelCallbacks},
    {
      id: CLOUD_STORAGE_PANEL_ID,
      initial: "云端存储将在首次打开时加载。",
      loading: "正在加载云端存储…",
      failure: "云端存储加载失败，请检查开发模式日志。"
    }
  );
  const unsubscribe = registry.subscribe(states => {
    const previous = panelState.providers.find(provider => provider.id === panelState.selectedProviderId);
    panelState.providers = states;
    panelState.version++;
    const provider = currentProvider();
    const providerState = provider?.getState();
    if (providerState?.authorizationError) {
      panelState.error = providerState.authorizationError;
      panelState.status = "";
    } else if (!previous?.connected && providerState?.connected) {
      panelState.error = "";
      panelState.status = `已连接 ${providerState.label}。`;
    }
    if (!panelState.busy && panelState.open && providerState?.connected) void refreshFiles({quiet: true});
  });

  return {
    open() {
      panelState.providers = registry.listProviderStates();
      panelState.open = true;
      panelState.version++;
      manager.open(CLOUD_STORAGE_PANEL_ID);
      lazyPanel.load();
      if (currentProvider()?.getState().connected) void refreshFiles({quiet: true});
    },
    unmount() {
      unsubscribe();
      lazyPanel.unmount();
      registry.dispose();
    }
  };

  async function refreshFiles(options = {}) {
    return run(options.quiet ? "" : "正在读取云端文件…", (provider, operation) => refreshFilesForProvider(provider, {...options, operation}));
  }

  async function refreshFilesForProvider(provider, options = {}) {
    const files = await provider.listFiles();
    if (!options.operation?.isCurrent()) return null;
    reconcileCloudStorageFileList(panelState, files, {selectId: options.selectId, isCurrent: options.operation.isCurrent});
    if (!options.quiet) panelState.status = files.length ? `已找到 ${files.length} 份地图。` : "云端还没有由本应用保存的地图。";
    return files;
  }

  async function run(progress, action) {
    if (panelState.busy) return null;
    const provider = currentProvider();
    if (!provider) return null;
    const providerId = panelState.selectedProviderId;
    const epoch = ++operationEpoch;
    const operation = {
      providerId,
      epoch,
      isCurrent: () => operationEpoch === epoch && panelState.selectedProviderId === providerId
    };
    panelState.busy = true;
    panelState.error = "";
    if (progress) panelState.status = progress;
    try {
      return await action(provider, operation);
    } catch (error) {
      if (operation.isCurrent()) {
        panelState.error = String(error?.message || error || "云存储操作失败");
        panelState.status = "";
      }
      return null;
    } finally {
      if (operationEpoch === epoch) {
        panelState.providers = registry.listProviderStates();
        panelState.busy = false;
        panelState.version++;
      }
    }
  }

  function currentProvider() {
    return registry.provider(panelState.selectedProviderId);
  }

  function selectedFile() {
    return panelState.files.find(file => file.id === panelState.selectedFileId) || null;
  }

  function clearFeedback() {
    panelState.status = "";
    panelState.error = "";
  }
}
