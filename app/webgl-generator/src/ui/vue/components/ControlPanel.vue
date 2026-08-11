<template>
  <UiTabs v-model="activeTab" :tabs="tabs" />

  <div class="control-panel-tab-panels">
    <div class="control-panel-section project-about-panel" data-control-panel="about" :hidden="activeTab !== 'about'">
      <section class="project-about-card" aria-labelledby="project-about-title">
        <h2 id="project-about-title">WebGL 地图生成器</h2>
        <p>
          本项目受 Azgaar/Fantasy Map Generator 启发，尝试用 WebGL 重新铺开一张
          可生成、可编辑、可导出的幻想世界地图。
        </p>
        <p>
          愿它保留原作那种“世界自己长出来”的惊喜，也成为一次面向现代浏览器的轻量重写实验。
        </p>
        <div class="project-link-row" aria-label="项目链接">
          <a href="https://github.com/mosuzi/fmg-gl" target="_blank" rel="noreferrer">查看此卷</a>
          <a href="https://github.com/Azgaar/Fantasy-Map-Generator" target="_blank" rel="noreferrer">拜访原作</a>
          <a href="https://azgaar.github.io/Fantasy-Map-Generator/" target="_blank" rel="noreferrer">体验原作</a>
        </div>
        <div class="project-laboratory-row" aria-label="独立实验室">
          <ElDropdown class="project-laboratory-dropdown" trigger="click" popper-class="ui-panel-io-dropdown project-laboratory-menu" @command="openLaboratory">
            <UiButton id="open-laboratory-menu" variant="secondary" aria-haspopup="menu">
              实验室
            </UiButton>
            <template #dropdown>
              <ElDropdownMenu aria-label="实验室列表">
                <ElDropdownItem v-for="laboratory in laboratories" :key="laboratory.id" :command="laboratory.id">
                  {{ laboratory.label }}
                </ElDropdownItem>
              </ElDropdownMenu>
            </template>
          </ElDropdown>
        </div>
        <div class="project-file-actions" aria-label="本地文件操作">
          <ElDropdown class="project-save-dropdown" trigger="click" popper-class="ui-panel-io-dropdown" @command="handleSaveCommand">
            <UiButton variant="secondary" aria-haspopup="menu">
              保存
            </UiButton>
            <template #dropdown>
              <ElDropdownMenu>
                <ElDropdownItem command="local-file">保存到本地</ElDropdownItem>
                <ElDropdownItem id="save-browser-storage" command="browser-storage">保存到浏览器</ElDropdownItem>
                <ElDropdownItem id="open-cloud-storage" command="cloud-storage">云端存储…</ElDropdownItem>
              </ElDropdownMenu>
            </template>
          </ElDropdown>
          <div ref="exportAnchorRef" class="project-action-anchor">
            <UiButton
              id="open-export-panel"
              variant="secondary"
              :active="exportPanelOpen"
              aria-haspopup="dialog"
              :aria-expanded="exportPanelOpen ? 'true' : 'false'"
              @click.stop="toggleExportPanel"
            >
              导出
            </UiButton>
          </div>
          <label class="file-import-action secondary-action">
            <span>导入</span>
            <input id="import-map-file" type="file" accept=".webfmg,.json,.gz,.webgl-map.json,.webgl-map.json.gz,application/json,application/gzip,application/x-gzip" />
          </label>
          <UiButton id="open-cloud-import" variant="secondary" @click="openCloudImport">从云端导入…</UiButton>
          <label class="file-import-action secondary-action">
            <span>导入 GEO 数据</span>
            <input id="import-geo-file" type="file" accept=".geojson,.json,application/geo+json,application/json" />
          </label>
        </div>
        <p id="file-operation-status" class="file-operation-status" aria-live="polite"></p>
        <pre id="file-operation-error-details" class="file-operation-error-details" hidden></pre>
        <UiButton id="file-operation-clear-error" class="file-operation-recovery" variant="secondary" @click="clearFileOperationFeedback">清除错误并重试</UiButton>
        <UiButton id="export-map-import-diagnostic" variant="secondary" hidden>导出诊断</UiButton>
      </section>

      <Teleport to="body">
        <section
          v-show="exportPanelOpen"
          ref="exportPanelRef"
          class="project-export-panel"
          :style="exportPanelStyle"
          tabindex="-1"
          role="dialog"
          aria-labelledby="project-export-panel-title"
          @click.stop
        >
          <div class="project-export-panel-header" :class="{dragging: exportPanelDragging}" @pointerdown="startExportPanelDrag">
            <strong id="project-export-panel-title">导出</strong>
            <button type="button" class="ui-close-button project-export-panel-close" aria-label="关闭导出面板" @pointerdown.stop @click="closeExportPanel">×</button>
          </div>
          <strong class="project-export-section-label">快速导出</strong>
          <div class="project-export-action-grid">
            <UiButton id="export-map-image" variant="secondary" @click="closeExportPanel">图片</UiButton>
            <UiButton id="export-map-data" variant="secondary" @click="closeExportPanel">完整地图数据</UiButton>
          </div>
          <p class="visual-theme-editor-note project-export-format-note">完整地图数据（JSON）与压缩完整地图数据（gzip）包含外交关系、战争和历史，可重新导入；GeoJSON 只含空间要素，图片只含当前画面。</p>
          <details class="panel-advanced-section project-export-advanced-section">
            <summary>高级导出选项</summary>
            <div class="panel-advanced-section-body">
              <div class="project-export-action-grid project-export-advanced-actions">
                <UiButton id="export-heightmap-image" variant="secondary" @click="closeExportPanel">高度灰度图</UiButton>
                <UiButton id="export-map-data-compressed" variant="secondary" @click="closeExportPanel">压缩完整地图数据</UiButton>
                <UiButton id="export-map-geojson" variant="secondary" @click="closeExportPanel">GeoJSON</UiButton>
                <UiButton id="export-map-features-geojson" variant="secondary" @click="closeExportPanel">要素 GeoJSON</UiButton>
              </div>
          <label class="project-export-scale-control" for="export-png-scale">
            <span>PNG 倍率</span>
            <select id="export-png-scale">
              <option value="1">1x</option>
              <option value="2">2x</option>
              <option value="3">3x</option>
              <option value="4">4x</option>
            </select>
          </label>
          <label class="project-export-scale-control" for="export-png-crop-mode">
            <span>PNG 裁剪</span>
            <select id="export-png-crop-mode">
              <option value="viewport">当前视口</option>
              <option value="map">地图全幅</option>
              <option value="pixel">像素矩形</option>
              <option value="world">世界坐标矩形</option>
            </select>
          </label>
          <div class="png-crop-rect-grid" aria-label="PNG 裁剪矩形坐标">
            <label><span>X</span><input id="export-png-crop-x" type="number" value="0" step="any" /></label>
            <label><span>Y</span><input id="export-png-crop-y" type="number" value="0" step="any" /></label>
            <label><span>宽</span><input id="export-png-crop-width" type="number" value="800" min="0" step="any" /></label>
            <label><span>高</span><input id="export-png-crop-height" type="number" value="600" min="0" step="any" /></label>
          </div>
          <section class="feature-export-layers" aria-label="PNG 导出选项">
            <UiSwitchField label="包含地图标注" input-id="export-png-overlays" field-class="feature-export-layer-switch" :checked="true" />
            <UiSwitchField label="图外透明背景" input-id="export-png-transparent" field-class="feature-export-layer-switch" />
            <div class="feature-export-layer-grid png-overlay-grid" aria-label="PNG overlay 类别">
              <UiSwitchField label="标签" input-id="export-png-overlay-labels" field-class="feature-export-layer-switch" :checked="true" />
              <UiSwitchField label="城市图标" input-id="export-png-overlay-city-icons" field-class="feature-export-layer-switch" :checked="true" />
              <UiSwitchField label="标记" input-id="export-png-overlay-markers" field-class="feature-export-layer-switch" :checked="true" />
              <UiSwitchField label="军事" input-id="export-png-overlay-military" field-class="feature-export-layer-switch" :checked="true" />
              <UiSwitchField label="测量标注" input-id="export-png-overlay-measurements" field-class="feature-export-layer-switch" />
              <UiSwitchField label="图例" input-id="export-png-overlay-legend" field-class="feature-export-layer-switch" :checked="true" />
              <UiSwitchField label="比例尺" input-id="export-png-overlay-scale-bar" field-class="feature-export-layer-switch" :checked="true" />
            </div>
          </section>
          <section class="feature-export-layers geojson-range-export" aria-labelledby="geojson-export-range-title">
            <h3 id="geojson-export-range-title">GeoJSON 导出范围</h3>
            <label class="project-export-scale-control" for="geojson-export-range-mode">
              <span>范围</span>
              <select id="geojson-export-range-mode">
                <option value="full">地图全幅</option>
                <option value="viewport">当前视口</option>
                <option value="bbox">世界坐标 bbox</option>
              </select>
            </label>
            <div class="png-crop-rect-grid geojson-range-bbox-grid" aria-label="GeoJSON 世界坐标 bbox">
              <label><span>最小 X</span><input id="geojson-export-bbox-min-x" type="number" value="0" step="any" /></label>
              <label><span>最小 Y</span><input id="geojson-export-bbox-min-y" type="number" value="0" step="any" /></label>
              <label><span>最大 X</span><input id="geojson-export-bbox-max-x" type="number" value="1440" step="any" /></label>
              <label><span>最大 Y</span><input id="geojson-export-bbox-max-y" type="number" value="960" step="any" /></label>
            </div>
            <p class="visual-theme-editor-note">范围导出保留与 bbox 相交的完整要素，不裁切几何。</p>
          </section>
          <section class="feature-export-layers" aria-labelledby="feature-export-layers-title">
            <h3 id="feature-export-layers-title">要素 GeoJSON 图层</h3>
            <div class="feature-export-layer-grid">
              <UiSwitchField label="国家面" input-id="feature-export-layer-state" field-class="feature-export-layer-switch" />
              <UiSwitchField label="省份面" input-id="feature-export-layer-province" field-class="feature-export-layer-switch" />
              <UiSwitchField label="城市" input-id="feature-export-layer-city" field-class="feature-export-layer-switch" :checked="true" />
              <UiSwitchField label="路线" input-id="feature-export-layer-route" field-class="feature-export-layer-switch" :checked="true" />
              <UiSwitchField label="河流" input-id="feature-export-layer-river" field-class="feature-export-layer-switch" :checked="true" />
              <UiSwitchField label="标记" input-id="feature-export-layer-marker" field-class="feature-export-layer-switch" :checked="true" />
              <UiSwitchField label="区域" input-id="feature-export-layer-zone" field-class="feature-export-layer-switch" :checked="true" />
            </div>
            <UiSwitchField label="合并政治面边界" input-id="feature-export-dissolve-political" field-class="feature-export-dissolve-switch" />
          </section>
            </div>
          </details>
        </section>
      </Teleport>
    </div>

    <div class="generation-panel-form" data-control-panel="generation" :hidden="activeTab !== 'generation'">
      <div class="generation-map-name-control">
        <UiField label="地图名称" input-id="map-name-input" model-value="未命名地图" :input-attrs="{autocomplete: 'off', maxlength: 120}" />
        <ElButton
          id="toggle-map-filename-template"
          class="ui-icon-action generation-save-template-toggle"
          :class="{active: saveFilenameSettingsOpen}"
          circle
          title="设置存档名称格式"
          aria-label="设置存档名称格式"
          :aria-expanded="saveFilenameSettingsOpen ? 'true' : 'false'"
          aria-controls="map-filename-template-settings"
          @click="saveFilenameSettingsOpen = !saveFilenameSettingsOpen"
        ><ElIcon><Setting /></ElIcon></ElButton>
      </div>
      <div v-show="saveFilenameSettingsOpen" id="map-filename-template-settings" class="generation-save-template-settings">
        <UiField
          label="存档名称格式"
          input-id="map-filename-template-input"
          model-value="{name}-{date}-{time}.{ext}"
          :input-attrs="{autocomplete: 'off', spellcheck: false, maxlength: 180, 'aria-describedby': 'map-filename-template-help map-filename-template-preview'}"
        />
        <div class="generation-save-template-meta">
          <small id="map-filename-template-help">支持 {name}、{date}、{time}、{seed}、{checksum}、{ext}</small>
          <code id="map-filename-template-preview"></code>
        </div>
      </div>
      <UiField label="地图种子" input-id="seed-input" model-value="stage-2-1" :input-attrs="{autocomplete: 'off'}" />
      <UiField label="地图规模" input-id="cells-input" type="number" :model-value="10000" :input-attrs="{min: 1000, max: 100000, step: 1000}" />
      <UiField label="宽度" input-id="width-input" type="number" :model-value="1440" :input-attrs="{min: 640, max: 4096, step: 80}" />
      <UiField label="高度" input-id="height-input" type="number" :model-value="960" :input-attrs="{min: 480, max: 4096, step: 80}" />
      <UiField label="地形" input-id="heightmap-template" type="select" model-value="continents" :options="terrainTemplates" />
      <details class="generation-climate-section">
        <summary id="generation-climate-title">高级气候</summary>
        <input id="climate-latitude-mode" type="hidden" :value="climateLatitudeMode" />
        <input id="climate-latitude-center" type="hidden" :value="climateLatitudeCenter" />
        <input id="climate-latitude-span" type="hidden" :value="climateLatitudeSpanDegrees" />
        <input id="climate-map-size-percent" type="hidden" :value="climateLatitudeRangePercent" />
        <input id="climate-latitude-range-percent" type="hidden" :value="climateLatitudeRangePercent" />
        <input id="climate-longitude-range-percent" type="hidden" :value="climateLongitudeRangePercent" />
        <input id="atmosphere-direction" type="hidden" :value="atmosphereDirection" />
        <input id="atmosphere-winds" type="hidden" :value="windProfileValue" />

        <div class="earth-climate-grid">
          <div class="earth-projection" :class="{manual: climateLatitudeMode === 'custom'}">
            <div class="earth-projection-map">
              <svg class="earth-globe-svg" viewBox="0 0 120 120" aria-hidden="true">
                <circle class="earth-globe-fill" cx="60" cy="60" r="51" />
                <line
                  v-for="line in latitudeGuideLines"
                  :key="line.key"
                  class="earth-latitude-guide"
                  :class="{equator: line.lat === 0}"
                  :x1="line.x1"
                  :x2="line.x2"
                  :y1="line.y"
                  :y2="line.y"
                />
                <polygon class="earth-canvas-footprint" :points="canvasFootprintPoints" />
              </svg>
              <div class="wind-band-column" role="group" aria-label="大气风带">
                <ElButton
                  v-for="(band, index) in windBandOptions"
                  :key="band.value"
                  class="wind-band-button"
                  :data-wind-band="index"
                  :data-wind-angle="windBands[index]"
                  :aria-label="`${band.label} ${band.range}：${windDirectionLabel(windBands[index])}`"
                  :title="`${band.label} ${band.range}：${windDirectionLabel(windBands[index])}`"
                  @click="cycleWindBand(index)"
                >
                  <span class="wind-band-arrow" aria-hidden="true">{{ windDirectionArrow(windBands[index]) }}</span>
                </ElButton>
              </div>
            </div>
            <div class="earth-projection-controls">
              <ElButton
                id="climate-latitude-toggle"
                class="climate-mode-toggle"
                :aria-pressed="climateLatitudeMode === 'custom' ? 'true' : 'false'"
                @click="toggleLatitudeMode"
              >
                {{ climateLatitudeMode === "custom" ? "手动纬度" : "自动纬度" }}
              </ElButton>
              <div class="earth-latitude-readout">{{ latitudeBandLabel }}</div>
            </div>
          </div>

          <div class="climate-temperature-fields">
            <UiSliderField
              label="赤道"
              input-id="temperature-equator"
              output-id="temperature-equator-value"
              field-class="climate-slider-field"
              value-tag="output"
              :model-value="temperatureEquator"
              unit-label="°C"
              :min="temperatureRange.min"
              :max="temperatureRange.max"
              :step="1"
              @input="value => temperatureEquator = value"
            />
            <UiSliderField
              label="北极"
              input-id="temperature-north-pole"
              output-id="temperature-north-pole-value"
              field-class="climate-slider-field"
              value-tag="output"
              :model-value="temperatureNorthPole"
              unit-label="°C"
              :min="temperatureRange.min"
              :max="temperatureRange.max"
              :step="1"
              @input="value => temperatureNorthPole = value"
            />
            <UiSliderField
              label="南极"
              input-id="temperature-south-pole"
              output-id="temperature-south-pole-value"
              field-class="climate-slider-field"
              value-tag="output"
              :model-value="temperatureSouthPole"
              unit-label="°C"
              :min="temperatureRange.min"
              :max="temperatureRange.max"
              :step="1"
              @input="value => temperatureSouthPole = value"
            />
            <div class="climate-range-control-group" :class="{locked: climateRangeRatioLocked}">
              <UiSliderField
                label="纬度范围"
                input-id="climate-latitude-range-percent-slider"
                output-id="climate-latitude-range-percent-value"
                field-class="climate-slider-field"
                value-tag="output"
                :model-value="climateLatitudeRangePercent"
                unit-label="%"
                :min="climateMapSizeRange.min"
                :max="climateMapSizeRange.max"
                :step="1"
                @input="setLatitudeRangePercent"
              />
              <UiSliderField
                label="经度范围"
                input-id="climate-longitude-range-percent-slider"
                output-id="climate-longitude-range-percent-value"
                field-class="climate-slider-field"
                value-tag="output"
                :model-value="climateLongitudeRangePercent"
                unit-label="%"
                :min="climateMapSizeRange.min"
                :max="climateMapSizeRange.max"
                :step="1"
                @input="setLongitudeRangePercent"
              />
              <ElButton
                class="climate-range-lock-button"
                :class="{active: climateRangeRatioLocked}"
                :icon="climateRangeRatioLocked ? Lock : Unlock"
                :aria-pressed="climateRangeRatioLocked ? 'true' : 'false'"
                :aria-label="climateRangeRatioLocked ? '解除经纬范围比例锁定' : '按当前经纬范围比例锁定'"
                :title="climateRangeRatioLocked ? '解除经纬范围比例锁定' : '按当前经纬范围比例锁定'"
                @click="toggleClimateRangeRatioLock"
              />
            </div>
            <UiSliderField
              label="画布纬度"
              input-id="climate-latitude-center-slider"
              output-id="climate-latitude-center-value"
              field-class="climate-slider-field"
              value-tag="output"
              :model-value="climateLatitudeCenter"
              unit-label="°"
              :min="-75"
              :max="75"
              :step="1"
              @input="setLatitudeCenter"
            />
          </div>
        </div>
      </details>
      <UiSwitchField label="生成时自动随机种子" input-id="auto-random-seed" />

      <div class="generation-button-row">
        <UiButton id="generate-map" variant="primary">生成地图</UiButton>
        <UiButton id="random-seed" variant="secondary">换种子</UiButton>
      </div>
    </div>

    <div class="control-panel-section" data-control-panel="themes" :hidden="activeTab !== 'themes'">
      <UiSelectField label="视觉主题" input-id="visual-theme-preset" :model-value="preferences.visualTheme" :options="visualThemePresetOptions" />
      <section class="visual-theme-editor" aria-labelledby="visual-theme-editor-title">
        <div class="visual-theme-editor-header">
          <strong id="visual-theme-editor-title">用户主题</strong>
          <span>{{ activeUserThemeDocument ? "可编辑" : "内置只读" }}</span>
        </div>
        <div class="visual-theme-action-row">
          <UiButton id="create-user-visual-theme" class="visual-theme-action-button" variant="secondary">复制为用户主题</UiButton>
          <UiButton id="export-visual-theme" class="visual-theme-action-button" variant="secondary">导出主题</UiButton>
          <label class="file-import-action secondary-action visual-theme-import-action visual-theme-action-button">
            <span>导入主题</span>
            <input id="import-visual-theme-file" type="file" accept=".json,.webgl-theme.json,application/json" />
          </label>
        </div>
        <div v-if="activeUserThemeDocument" class="visual-theme-edit-actions">
          <UiActionDock host-id="ControlPanel" v-model:active="activeThemeAction" :actions="visualThemeActions">
            <template #color>
              <UiSelectField
                label="颜色 token"
                input-id="visual-theme-color-token"
                :model-value="selectedThemeColorKey"
                :options="visualThemeColorFields"
                @update:model-value="value => selectedThemeColorKey = value"
              />
              <UiColorActionPanel
                class-name="visual-theme-shared-color-field"
                :model-value="activeUserThemeDocument.colors[selectedThemeColorKey]"
                @apply="applyVisualThemeColor"
              />
            </template>
          </UiActionDock>
          <UiButton id="delete-user-visual-theme" variant="danger" @click="requestDeleteVisualTheme">删除用户主题</UiButton>
        </div>
        <p class="visual-theme-editor-note">颜色修改进入编辑历史，可用撤销 / 重做恢复；纹理、字体和高级滤镜不在本轮范围。</p>
      </section>
      <UiSegmented class="view-mode-segmented" label="视图" :options="themes" :model-value="preferences.colorMode" data-mode />
      <div class="preference-toggle-grid">
        <UiSwitchField label="显示海底" input-id="show-ocean-height" :checked="preferences.showOceanHeight" button-style />
        <UiSwitchField label="平滑边界" input-id="smooth-cell-borders" :checked="preferences.smoothCellBorders" button-style />
      </div>
    </div>

    <div class="control-panel-section label-style-panel" data-control-panel="styles" :hidden="activeTab !== 'styles'">
      <UiSelectField
        label="标签类型"
        input-id="label-style-type"
        :model-value="selectedLabelStyleType"
        :options="labelStyleTypeOptions"
        @update:model-value="value => selectedLabelStyleType = value"
      />
      <div class="label-style-preview" :style="labelStylePreviewCss" aria-live="polite">山河有名 · {{ activeLabelStyleLabel }}</div>
      <p class="label-style-inheritance">{{ labelStyleInheritanceHint }}</p>
      <div class="label-font-source-row">
        <UiSelectField label="字体" input-id="label-style-font" :model-value="activeLabelFontValue" :options="labelFontOptions" @update:model-value="commitLabelFont" />
        <UiButton id="load-local-label-fonts" variant="secondary" :disabled="localFontsLoading" @click="loadLocalLabelFonts">
          {{ localFontsLoading ? "读取中" : "读取本机字体" }}
        </UiButton>
      </div>
      <p class="label-font-status" role="status">{{ labelFontStatus }}</p>
      <UiSelectField label="字重" input-id="label-style-weight" :model-value="String(activeLabelStyle.fontWeight)" :options="labelWeightOptions" @update:model-value="value => commitLabelStyle('fontWeight', Number(value))" />
      <UiSwitchField label="斜体" input-id="label-style-italic" field-class="generation-check-row label-style-italic-switch" compact-hit-area :checked="activeLabelStyle.italic" @change="value => commitLabelStyle('italic', value)" />
      <UiSliderField label="字号" input-id="label-style-font-size" :model-value="activeLabelStyle.fontSize" :min="8" :max="72" :step="1" unit-label="px" @change="value => commitLabelStyle('fontSize', value)" />
      <UiSliderField label="字距" input-id="label-style-letter-spacing" :model-value="activeLabelStyle.letterSpacing" :min="-2" :max="12" :step="0.1" unit-label="px" @change="value => commitLabelStyle('letterSpacing', value)" />
      <UiSliderField label="不透明度" input-id="label-style-opacity" :model-value="activeLabelStyle.opacity" :min="0" :max="1" :step="0.05" @change="value => commitLabelStyle('opacity', value)" />
      <div class="label-style-color-grid">
        <label>文字色<input id="label-style-color" type="color" :value="activeLabelStyle.color" @change="event => commitLabelStyle('color', event.target.value)" /></label>
        <label>描边色<input id="label-style-stroke-color" type="color" :value="activeLabelStyle.strokeColor" @change="event => commitLabelStyle('strokeColor', event.target.value)" /></label>
        <label>阴影色<input id="label-style-shadow-color" type="color" :value="activeLabelStyle.shadowColor" @change="event => commitLabelStyle('shadowColor', event.target.value)" /></label>
      </div>
      <UiSliderField label="描边" input-id="label-style-stroke-width" :model-value="activeLabelStyle.strokeWidth" :min="0" :max="8" :step="0.01" unit-label="px" @change="value => commitLabelStyle('strokeWidth', value)" />
      <UiSliderField label="阴影横移" input-id="label-style-shadow-x" :model-value="activeLabelStyle.shadowOffsetX" :min="-20" :max="20" :step="0.1" unit-label="px" @change="value => commitLabelStyle('shadowOffsetX', value)" />
      <UiSliderField label="阴影纵移" input-id="label-style-shadow-y" :model-value="activeLabelStyle.shadowOffsetY" :min="-20" :max="20" :step="0.1" unit-label="px" @change="value => commitLabelStyle('shadowOffsetY', value)" />
      <UiSliderField label="阴影模糊" input-id="label-style-shadow-blur" :model-value="activeLabelStyle.shadowBlur" :min="0" :max="30" :step="0.1" unit-label="px" @change="value => commitLabelStyle('shadowBlur', value)" />
      <div class="visual-theme-action-row">
        <UiButton id="reset-current-label-style" variant="secondary" @click="resetCurrentLabelStyle">重置当前类型</UiButton>
        <UiButton id="reset-all-label-styles" variant="danger" @click="resetAllLabelStyles">重置全部</UiButton>
      </div>
    </div>

    <div class="control-panel-section unit-control-panel" data-control-panel="units" :hidden="activeTab !== 'units'">
      <section class="unit-settings unit-settings-standalone" aria-labelledby="unit-settings-title">
        <h2 id="unit-settings-title">显示单位</h2>
        <input id="area-unit" type="hidden" :value="unitPreferences.areaUnit" />
        <div class="unit-config-list">
          <UiSelectField
            class-name="unit-select-field unit-config-row"
            label="数字缩写"
            input-id="number-abbreviation"
            :model-value="unitPreferences.numberAbbreviation"
            :options="numberAbbreviationOptions"
            @update:model-value="value => patchUnitPreference({numberAbbreviation: value})"
          />
          <UiSelectField
            label="距离单位"
            input-id="distance-unit"
            class-name="unit-select-field unit-config-row"
            :model-value="unitPreferences.distanceUnit"
            :options="distanceUnitOptions"
            @update:model-value="value => patchUnitPreference({distanceUnit: value})"
          />
          <div class="unit-derived-row">
            <span>面积单位</span>
            <strong>{{ areaUnitLabel }}</strong>
          </div>
          <div class="unit-custom-actions">
            <UiButton variant="secondary" @click="openCreateCustomUnit">新增自定义单位</UiButton>
            <UiButton v-if="activeCustomUnit" variant="secondary" @click="openEditCustomUnit">编辑当前单位</UiButton>
            <UiButton v-if="activeCustomUnit" variant="danger" @click="deleteActiveCustomUnit">删除当前单位</UiButton>
            <UiButton v-if="customUnitCanRestore" variant="secondary" @click="restoreLastDeletedCustomUnit">恢复上次删除单位</UiButton>
          </div>
          <form v-if="customUnitEditorOpen" class="unit-custom-editor" @submit.prevent="saveCustomUnit">
            <h3>{{ editingCustomUnitId ? "编辑自定义单位" : "新增自定义单位" }}</h3>
            <label><span>单位名称</span><input v-model="customUnitDraft.name" maxlength="32" required /></label>
            <label><span>单位符号</span><input v-model="customUnitDraft.symbol" maxlength="12" required /></label>
            <label><span>1 单位等于</span><input v-model="customUnitDraft.kmPerUnit" type="number" min="0.000000000001" max="1000000000000" step="any" required /><em>km</em></label>
            <p>面积信息留空时，会按距离单位自动生成平方名称、符号和换算系数。</p>
            <label><span>面积名称</span><input v-model="customUnitDraft.areaName" maxlength="40" placeholder="自动派生" /></label>
            <label><span>面积符号</span><input v-model="customUnitDraft.areaSymbol" maxlength="16" placeholder="自动派生" /></label>
            <label><span>1 面积单位等于</span><input v-model="customUnitDraft.squareKmPerUnit" type="number" min="0.000000000001" max="1000000000000" step="any" placeholder="自动平方" /><em>km²</em></label>
            <p v-if="customUnitError" class="unit-custom-error" role="alert">{{ customUnitError }}</p>
            <div class="unit-custom-editor-actions">
              <UiButton button-type="submit">保存并使用</UiButton>
              <UiButton variant="secondary" @click="closeCustomUnitEditor">取消</UiButton>
            </div>
          </form>
          <UiSliderField
            label="比例尺"
            input-id="map-scale-km-per-cm"
            output-id="map-scale-km-per-cm-value"
            field-class="unit-scale-field"
            value-tag="output"
            :model-value="unitPreferences.mapScaleKmPerCm"
            unit-label="km/cm"
            :min="unitScaleLimits.mapScaleKmPerCm.min"
            :max="unitScaleLimits.mapScaleKmPerCm.max"
            :step="unitScaleLimits.mapScaleKmPerCm.step"
            @change="value => patchUnitPreference({mapScaleKmPerCm: value})"
          />
          <UiSliderField
            label="人口倍率"
            input-id="population-scale"
            output-id="population-scale-value"
            field-class="unit-scale-field"
            value-tag="output"
            :model-value="unitPreferences.populationScale"
            unit-label="x"
            :min="unitScaleLimits.populationScale.min"
            :max="unitScaleLimits.populationScale.max"
            :step="unitScaleLimits.populationScale.step"
            @change="value => patchUnitPreference({populationScale: value})"
          />
          <UiSliderField
            label="军力比例"
            input-id="military-scale"
            output-id="military-scale-value"
            field-class="unit-scale-field"
            value-tag="output"
            :model-value="unitPreferences.militaryScale"
            unit-label="x"
            :min="unitScaleLimits.militaryScale.min"
            :max="unitScaleLimits.militaryScale.max"
            :step="unitScaleLimits.militaryScale.step"
            @change="value => patchUnitPreference({militaryScale: value})"
          />
          <UiSliderField
            label="降水倍率"
            input-id="precipitation-scale"
            output-id="precipitation-scale-value"
            field-class="unit-scale-field"
            value-tag="output"
            :model-value="unitPreferences.precipitationScale"
            unit-label="x"
            :min="unitScaleLimits.precipitationScale.min"
            :max="unitScaleLimits.precipitationScale.max"
            :step="unitScaleLimits.precipitationScale.step"
            @change="value => patchUnitPreference({precipitationScale: value})"
          />
        </div>
      </section>
    </div>

    <div class="control-panel-section" data-control-panel="layers" :hidden="activeTab !== 'layers'">
      <section
        v-for="group in layerGroups"
        :key="group.id"
        class="layer-control-group"
        :data-layer-control-group="group.id"
        :aria-labelledby="`layer-control-group-${group.id}`"
      >
        <h2 :id="`layer-control-group-${group.id}`">{{ group.label }}</h2>
        <div class="layer-toggle-grid">
          <UiLayerToggleButton
            v-for="layer in group.layers"
            :key="layer.id"
            :layer="layer.id"
            :layers="layer.layers || []"
            :label="layer.label"
            :pressed="layerToggleState(layer)"
          />
          <ElButton
            v-if="group.id === 'annotation'"
            id="show-hover-info"
            class="layer-toggle-button"
            :class="{active: preferences.showHoverInfo !== false}"
            :aria-pressed="preferences.showHoverInfo !== false ? 'true' : 'false'"
          >
            <span class="layer-toggle-indicator"></span>
            <span>悬停信息</span>
          </ElButton>
        </div>
      </section>

      <UiSliderField
        label="城市标签上限"
        input-id="max-city-labels"
        output-id="max-city-labels-value"
        field-class="label-limit-field"
        value-tag="output"
        :model-value="preferences.maxCityLabels"
        :min="8"
        :max="5000"
      />
    </div>

    <div class="control-panel-section management-panel" data-control-panel="management" :hidden="activeTab !== 'management'">
      <section
        v-for="group in managementGroups"
        :key="group.id"
        class="management-panel-group"
        :data-management-group="group.id"
        :aria-labelledby="`management-group-${group.id}`"
      >
        <h2 :id="`management-group-${group.id}`">{{ group.label }}</h2>
        <div class="management-panel-actions">
          <UiButton v-for="action in group.actions" :id="action.id" :key="action.id" variant="secondary">
            {{ action.label }}
          </UiButton>
        </div>
      </section>

      <div class="management-panel-divider" aria-hidden="true"></div>

      <section class="regeneration-section" aria-labelledby="regeneration-section-title">
        <div class="regeneration-section-header">
          <h2 id="regeneration-section-title">重新生成</h2>
          <span id="regeneration-status">{{ regenerationFeedback }}</span>
        </div>

        <div class="regeneration-control">
          <UiSelectField
            label="目标领域"
            input-id="regeneration-kind"
            :model-value="selectedRegenerationKind"
            :options="regenerationActions"
            @update:model-value="selectedRegenerationKind = $event"
          />
          <UiSelectField
            v-if="regenerationScopeOptions.length > 1"
            label="重设范围"
            input-id="regeneration-scope"
            :model-value="selectedRegenerationScope"
            :options="regenerationScopeOptions"
            @update:model-value="selectedRegenerationScope = $event"
          />
          <UiSelectField
            v-if="selectedRegenerationScope === 'state'"
            label="目标国家"
            input-id="regeneration-state"
            :model-value="selectedRegenerationStateId"
            :options="regenerationStateOptions"
            @update:model-value="selectedRegenerationStateId = $event"
          />
          <UiSelectField
            v-if="selectedRegenerationScope === 'province'"
            label="目标省份"
            input-id="regeneration-province"
            :model-value="selectedRegenerationProvinceId"
            :options="regenerationProvinceOptions"
            @update:model-value="selectedRegenerationProvinceId = $event"
          />
          <UiButton
            variant="danger"
            :data-regenerate-kind="selectedRegenerationKind"
            :data-regeneration-scope="selectedRegenerationScope"
            :data-regeneration-state-id="selectedRegenerationScope === 'state' ? selectedRegenerationStateId : undefined"
            :data-regeneration-province-id="selectedRegenerationScope === 'province' ? selectedRegenerationProvinceId : undefined"
            :disabled="regenerationTargetMissing"
            @click="requestRegeneration"
          >
            重新生成{{ selectedRegenerationAction.label }}
          </UiButton>
        </div>

        <p
          id="regeneration-constraint"
          class="regeneration-status-note"
          :data-default-constraint="selectedRegenerationAction.impact"
        >
          {{ selectedRegenerationAction.impact }}
        </p>
      </section>
    </div>
  </div>
</template>

<script setup>
import {computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch} from "vue";
import {storeToRefs} from "pinia";
import {regenerationFeedbackMessage, regenerationKindLabel, regenerationLoadingMessage} from "../../regeneration-user-copy.js";
import UiButton from "./base/UiButton.vue";
import UiActionDock from "./base/UiActionDock.vue";
import UiColorActionPanel from "./base/UiColorActionPanel.vue";
import UiField from "./base/UiField.vue";
import UiLayerToggleButton from "./base/UiLayerToggleButton.vue";
import UiSegmented from "./base/UiSegmented.vue";
import UiSelectField from "./base/UiSelectField.vue";
import UiSliderField from "./base/UiSliderField.vue";
import UiSwitchField from "./base/UiSwitchField.vue";
import UiTabs from "./base/UiTabs.vue";
import {Lock, Setting, Unlock} from "@element-plus/icons-vue";
import {useDraggableFloatingPanel} from "../composables/use-draggable-floating-panel.js";
import {useManagedOverlay} from "../composables/use-managed-overlay.js";
import {visualThemeOptions} from "../../../renderer/themes.js";
import {LABEL_FONT_FAMILIES, LABEL_STYLE_TYPES, LOCAL_LABEL_FONT_ID, hasVisibleLabelShadow, normalizeLocalFontFamilyName, resolveLabelStyle} from "../../../runtime/label-style-registry.js";
import {DEFAULT_LAYER_VISIBILITY} from "../../../runtime/display-defaults.js";
import {createLocalFontFamilyOptions} from "../../../runtime/local-font-catalog.js";
import {
  NUMBER_ABBREVIATION_OPTIONS,
  UNIT_SCALE_LIMITS,
  areaUnitForDistanceUnit,
  areaUnitLabelForDistanceUnit,
  customUnitDefinitionForDistanceUnit,
  deleteCustomUnitDefinition,
  distanceUnitOptionsForPreferences,
  normalizeUnitPreferences,
  upsertCustomUnitDefinition
} from "../../display-units.js";
import {
  WIND_BAND_OPTIONS,
  WIND_DIRECTION_OPTIONS,
  defaultWindProfile,
  normalizeAtmosphereDirection,
  normalizeClimateLatitudeMode,
  normalizeWindProfile,
  windDirectionLabelFromAngle,
  windDirectionValueFromAngle
} from "../../../generator/climate-options.js";
import {CLIMATE_MAP_SIZE_RANGE, TEMPERATURE_RANGE} from "../../../generator/options.js";
import {useGlobalConfigStore} from "../stores/global-config-store.js";

defineOptions({
  name: "ControlPanel"
});

const config = useGlobalConfigStore();
const {preferences} = storeToRefs(config);
const CUSTOM_UNIT_RECYCLE_STORAGE_KEY = "webgl-generator-custom-unit-recycle-v1";
const customUnitCanRestore = ref(Boolean(readCustomUnitRecycleRecord()));
const CONTROL_PANEL_TAB_IDS = Object.freeze(["about", "generation", "themes", "styles", "layers", "management", "units"]);
const activeTab = ref(normalizeControlPanelTab(preferences.value.controlPanelTab));
const exportPanelOpen = ref(false);
const saveFilenameSettingsOpen = ref(false);
const exportAnchorRef = ref(null);
const exportPanelRef = ref(null);
const {
  dragging: exportPanelDragging,
  panelStyle: exportPanelStyle,
  position: exportPanelPosition,
  positionNear: positionExportPanelNear,
  constrainPanel: constrainExportPanel,
  startDrag: startExportPanelDrag,
  stopDrag: stopExportPanelDrag
} = useDraggableFloatingPanel(exportPanelRef, {
  defaultWidth: 320,
  defaultHeight: 300,
  margin: 12,
  storageKey: "webgl-generator-panel:project-export"
});
useManagedOverlay(exportPanelRef, exportPanelOpen, {
  id: "project-export",
  onClose: () => {
    exportPanelOpen.value = false;
  }
});
watch(exportPanelOpen, open => {
  if (!open) stopExportPanelDrag();
});
const climateLatitudeMode = ref("auto");
const climateLatitudeCenter = ref(0);
const climateLatitudeSpan = ref(45);
const climateLatitudeRangePercent = ref(25);
const climateLongitudeRangePercent = ref(25);
const climateRangeRatioLocked = ref(preferences.value.climateRangeRatioLocked !== false);
const climateRangeLockRatio = ref(1);
const atmosphereDirection = ref("customBands");
const windBands = ref(defaultWindProfile());
const temperatureEquator = ref(25);
const temperatureNorthPole = ref(-25);
const temperatureSouthPole = ref(-15);
const temperatureRange = TEMPERATURE_RANGE;
const climateMapSizeRange = CLIMATE_MAP_SIZE_RANGE;
const unitPreferences = computed(() => normalizeUnitPreferences(preferences.value.units));
const areaUnitLabel = computed(() => areaUnitLabelForDistanceUnit(unitPreferences.value.distanceUnit, unitPreferences.value));
const distanceUnitOptions = computed(() => distanceUnitOptionsForPreferences(unitPreferences.value));
const activeCustomUnit = computed(() => customUnitDefinitionForDistanceUnit(unitPreferences.value.distanceUnit, unitPreferences.value));
const customUnitEditorOpen = ref(false);
const editingCustomUnitId = ref("");
const customUnitError = ref("");
const customUnitDraft = reactive(emptyCustomUnitDraft());
const numberAbbreviationOptions = NUMBER_ABBREVIATION_OPTIONS;
const unitScaleLimits = UNIT_SCALE_LIMITS;
const windBandOptions = WIND_BAND_OPTIONS;
const windProfileValue = computed(() => windBands.value.join(","));
const canvasFootprintPoints = computed(() => {
  const span = climateLatitudeSpanDegrees.value;
  const center = Number(climateLatitudeCenter.value) || 0;
  const north = Math.min(90, center + span / 2);
  const south = Math.max(-90, center - span / 2);
  const northPair = latitudeCanvasPair(north, climateLongitudeRangeFraction.value);
  const southPair = latitudeCanvasPair(south, climateLongitudeRangeFraction.value);
  return [
    northPair.left,
    northPair.right,
    southPair.right,
    southPair.left
  ].map(point => point.map(roundSvg).join(",")).join(" ");
});
const climateLatitudeSpanDegrees = computed(() => {
  const percent = clampNumber(climateLatitudeRangePercent.value, climateMapSizeRange.min, climateMapSizeRange.max, 25);
  return Math.round(percent * 1.8 * 10) / 10;
});
const climateLongitudeRangeFraction = computed(() => clampNumber(climateLongitudeRangePercent.value, climateMapSizeRange.min, climateMapSizeRange.max, 25) / 100);
const latitudeGuideLines = computed(() => [-60, -30, 0, 30, 60].map(lat => ({
  key: `lat-${lat}`,
  lat,
  ...latitudeLine(lat)
})));
const latitudeBandLabel = computed(() => {
  const span = climateLatitudeSpanDegrees.value;
  const center = Number(climateLatitudeCenter.value) || 0;
  const north = Math.min(90, center + span / 2);
  const south = Math.max(-90, center - span / 2);
  return climateLatitudeMode.value === "custom"
    ? `纬 ${climateLatitudeRangePercent.value}% / 经 ${climateLongitudeRangePercent.value}% / ${formatLatitudeCenter(center)} / ${formatLatitudeCenter(south)} 至 ${formatLatitudeCenter(north)}`
    : `纬 ${climateLatitudeRangePercent.value}% / 经 ${climateLongitudeRangePercent.value}% / 自动按地形选择纬度`;
});

const tabs = Object.freeze([
  {id: "about", label: "简介"},
  {id: "generation", label: "生成"},
  {id: "themes", label: "视图"},
  {id: "styles", label: "样式"},
  {id: "layers", label: "图层"},
  {id: "management", label: "管理"},
  {id: "units", label: "单位"}
]);

const laboratories = Object.freeze([
  {id: "web-cells", label: "WebGL 单元格实验室", url: "https://fmg.mosuzi.top/prototype/web-cells/"},
  {id: "boundary-topology", label: "共享边界拓扑实验室", url: "https://fmg.mosuzi.top/prototype/boundary-topology-lab/"},
  {id: "loading-scroll", label: "画卷加载页概念实验室", url: "https://fmg.mosuzi.top/prototype/loading-scroll-showcase/"},
  {id: "river-network", label: "河流网络算法实验室", url: "https://fmg.mosuzi.top/prototype/river-network-lab/"}
]);

const terrainTemplates = Object.freeze([
  {value: "continents", label: "大陆"},
  {value: "mediterranean", label: "地中海"},
  {value: "highIsland", label: "高山岛屿"},
  {value: "lowIsland", label: "平原岛屿"},
  {value: "peninsula", label: "一侧大陆"},
  {value: "pangea", label: "盘古大陆"},
  {value: "archipelago", label: "群岛"}
]);

const visualThemePresetOptions = ref(visualThemeOptions());
const activeUserThemeDocument = ref(null);
const activeThemeAction = ref(null);
const selectedThemeColorKey = ref("land");
const visualThemeColorFields = Object.freeze([
  {value: "land", label: "陆地"},
  {value: "water", label: "水域"},
  {value: "stateBorder", label: "国界"},
  {value: "provinceBorder", label: "省界"},
  {value: "roads", label: "道路"},
  {value: "primaryLabel", label: "主要标签"},
  {value: "scaleBarForeground", label: "比例尺前景"},
  {value: "scaleBarBackground", label: "比例尺背景"}
]);
const visualThemeActions = Object.freeze([{key: "color", resultClass: "open-secondary", label: "编辑主题颜色", icon: "◐", panelWidth: 360, panelHeight: 420}]);

const labelStyleTypeOptions = Object.freeze([
  {value: "state", label: "国家名称"},
  {value: "province", label: "省份名称"},
  {value: "capital", label: "首都名称"},
  {value: "city", label: "城市名称"},
  {value: "custom", label: "手工标签"},
  {value: "zone", label: "地区名称"}
]);
const localFontCatalog = ref([]);
const localFontsLoaded = ref(false);
const localFontsLoading = ref(false);
const localFontsMessage = ref("");
const builtInLabelFontOptions = Object.freeze(Object.keys(LABEL_FONT_FAMILIES).map(value => ({value, label: labelFontLabel(value)})));
const labelWeightOptions = Object.freeze([300, 400, 500, 600, 650, 700, 800, 900].map(value => ({value: String(value), label: String(value)})));
const selectedLabelStyleType = ref(LABEL_STYLE_TYPES[0]);
const labelStyleSnapshot = ref(createDefaultLabelStyleSnapshot());
const activeLabelStyleEntry = computed(() => labelStyleSnapshot.value.styles?.[selectedLabelStyleType.value] || createDefaultLabelStyleEntry(selectedLabelStyleType.value));
const activeLabelStyle = computed(() => activeLabelStyleEntry.value.resolved);
const activeLabelStyleLabel = computed(() => labelStyleTypeOptions.find(option => option.value === selectedLabelStyleType.value)?.label || "标签");
const activeLabelFontValue = computed(() => activeLabelStyle.value.fontFamilyId === LOCAL_LABEL_FONT_ID
  ? localFontOptionValue(activeLabelStyle.value.fontFamilyName)
  : activeLabelStyle.value.fontFamilyId);
const labelFontOptions = computed(() => {
  const options = [...builtInLabelFontOptions];
  for (const font of localFontCatalog.value) options.push({value: localFontOptionValue(font.family), label: `本机 · ${font.displayName}`});
  const activeFamily = normalizeLocalFontFamilyName(activeLabelStyle.value.fontFamilyName);
  if (activeLabelStyle.value.fontFamilyId === LOCAL_LABEL_FONT_ID && activeFamily && !findLocalFont(activeFamily)) {
    options.push({
      value: localFontOptionValue(activeFamily),
      label: localFontsLoaded.value ? `缺失 · ${activeFamily}（系统回退）` : `存档 · ${activeFamily}`
    });
  }
  return options;
});
const labelFontStatus = computed(() => {
  const family = normalizeLocalFontFamilyName(activeLabelStyle.value.fontFamilyName);
  if (activeLabelStyle.value.fontFamilyId === LOCAL_LABEL_FONT_ID && localFontsLoaded.value) {
    const localFont = findLocalFont(family);
    return localFont
      ? `本机已检测到“${localFont.displayName}”。`
      : `本机未检测到“${family}”，当前自动使用系统字体。`;
  }
  if (localFontsMessage.value) return localFontsMessage.value;
  if (activeLabelStyle.value.fontFamilyId !== LOCAL_LABEL_FONT_ID) return "可读取浏览器获准访问的本机字体；存档不会嵌入字体文件。";
  return `存档字体“${family}”；若本机不可用，将自动使用系统字体。`;
});
const labelStyleInheritanceHint = computed(() => {
  const fields = Object.keys(activeLabelStyleEntry.value.override || {});
  return fields.length ? `当前有 ${fields.length} 个地图级覆盖字段；其余沿用默认与主题。` : "当前未设地图级覆盖，沿用默认与主题。";
});
const labelStylePreviewCss = computed(() => ({
  color: activeLabelStyle.value.color,
  opacity: activeLabelStyle.value.opacity,
  fontFamily: activeLabelStyle.value.fontFamily,
  fontSize: `${activeLabelStyle.value.fontSize}px`,
  fontWeight: activeLabelStyle.value.fontWeight,
  fontStyle: activeLabelStyle.value.italic ? "italic" : "normal",
  letterSpacing: `${activeLabelStyle.value.letterSpacing}px`,
  WebkitTextStroke: `${activeLabelStyle.value.strokeWidth}px ${activeLabelStyle.value.strokeColor}`,
  textShadow: hasVisibleLabelShadow(activeLabelStyle.value)
    ? `${activeLabelStyle.value.shadowOffsetX}px ${activeLabelStyle.value.shadowOffsetY}px ${activeLabelStyle.value.shadowBlur}px ${activeLabelStyle.value.shadowColor}`
    : "none"
}));

const themes = Object.freeze([
  {value: "height", label: "高度"},
  {value: "temperature", label: "温度"},
  {value: "precipitation", label: "降水"},
  {value: "biomes", label: "生物群系"},
  {value: "cultures", label: "文化"},
  {value: "religions", label: "宗教"},
  {value: "diplomacy", label: "外交"},
  {value: "governments", label: "政体"},
  {value: "states", label: "国家"},
  {value: "provinces", label: "省份"},
  {value: "regions", label: "区域"},
  {value: "population", label: "人口"}
]);

const layerGroups = Object.freeze([
  layerGroup("terrain", "地形水文", [
    {id: "coastline", label: "水陆线"},
    {id: "rivers", label: "河流"},
    {id: "oceanCurrents", label: "洋流"}
  ]),
  layerGroup("politics", "政治边界", [
    {id: "stateBorders", label: "国界"},
    {id: "provinceBorders", label: "省界"}
  ]),
  layerGroup("objects", "地图对象", [
    {id: "routes", label: "道路"},
    {id: "cities", label: "城市"},
    {id: "mapMarkers", label: "资源与标记", layers: ["resources", "markers"]},
    {id: "military", label: "军事"},
    {id: "warFronts", label: "战线"}
  ]),
  layerGroup("zones", "地区", [
    {id: "zoneComposite", label: "全部地区", layers: ["zones", "zoneEvents", "zoneNatural", "zoneWilderness", "zoneLabels"]},
    {id: "zoneEvents", label: "事件地区"},
    {id: "zoneNatural", label: "自然地区"},
    {id: "zoneWilderness", label: "自动无人区"},
    {id: "zoneLabels", label: "地区名称"}
  ]),
  layerGroup("annotation", "标注辅助", [
    {id: "labels", label: "城市标签"},
    {id: "stateLabels", label: "国家名称"},
    {id: "provinceLabels", label: "省份名称"},
    {id: "measurements", label: "测量对象"},
    {id: "scaleBar", label: "比例尺"},
    {id: "mapBadge", label: "地图总尺寸"},
    {id: "gridCells", label: "网格单元", defaultVisible: false}
  ])
]);

const layers = Object.freeze(layerGroups.flatMap(group => group.layers.flatMap(layer => layer.layers?.map(id => ({id})) || [layer])));

function layerGroup(id, label, groupLayers) {
  return Object.freeze({id, label, layers: Object.freeze(groupLayers.map(layer => Object.freeze(layer)))});
}

const managementGroups = Object.freeze([
  managementGroup("terrain", "地形环境", [
    ["open-height-panel", "高度编辑"],
    ["open-climate-panel", "气候统计"],
    ["open-biome-panel", "生物群系"],
    ["open-feature-panel", "水体与地貌"],
    ["open-river-panel", "河流管理"],
    ["open-ocean-current-panel", "洋流管理"],
    ["open-lake-panel", "湖泊管理"]
  ]),
  managementGroup("politics", "政治社会", [
    ["open-state-panel", "国家编辑"],
    ["open-government-panel", "政体管理"],
    ["open-province-panel", "省份管理"],
    ["open-city-panel", "城市管理"],
    ["open-population-panel", "人口统计"],
    ["open-culture-panel", "文化管理"],
    ["open-religion-panel", "宗教管理"],
    ["open-diplomacy-panel", "外交管理"]
  ]),
  managementGroup("network", "网络经济", [
    ["open-economy-panel", "经济总览"],
    ["open-military-panel", "军事管理"],
    ["open-route-panel", "路线管理"]
  ]),
  managementGroup("annotation", "标注对象", [
    ["open-zone-panel", "地区管理"],
    ["open-marker-panel", "资源点与通用标记"],
    ["open-label-naming-panel", "标签管理"],
    ["open-notes-panel", "备注总览"],
    ["open-measurement-panel", "测量对象"]
  ]),
  managementGroup("system", "系统工具", [["open-namebase-panel", "名称库"]])
]);

function managementGroup(id, label, actions) {
  return Object.freeze({
    id,
    label,
    actions: Object.freeze(actions.map(([actionId, actionLabel]) => Object.freeze({id: actionId, label: actionLabel})))
  });
}

const regenerationActions = Object.freeze([
  {value: "features", kind: "features", label: regenerationKindLabel("features"), impact: "会重新整理水陆、岸线与相关地理归属，并标记后续内容待更新。"},
  {value: "routes", kind: "routes", label: regenerationKindLabel("routes"), impact: "会替换路线网络，不改写国家、省份或城镇。"},
  {value: "rivers", kind: "rivers", label: regenerationKindLabel("rivers"), impact: "会替换河流与水文引用，并标记相关下游内容待更新。"},
  {value: "cities", kind: "cities", label: regenerationKindLabel("cities"), impact: "会替换城镇与港口，并重建路线及相关下游内容。"},
  {value: "states", kind: "states", label: regenerationKindLabel("states"), impact: "会替换国家与省份归属，并重建城镇、路线及相关下游内容。"},
  {value: "provinces", kind: "provinces", label: regenerationKindLabel("provinces"), impact: "会在现有国家内替换省份归属，并重建路线及相关下游内容。"},
  {value: "markers", kind: "markers", label: regenerationKindLabel("markers"), impact: "会替换地图标记，并刷新相关摘要。"},
  {value: "diplomacy", kind: "diplomacy", label: regenerationKindLabel("diplomacy"), impact: "会替换国家关系、战争与贸易关系摘要。"},
  {value: "religions", kind: "religions", label: regenerationKindLabel("religions"), impact: "会替换宗教分布，并刷新相关归属与摘要。"},
  {value: "military", kind: "military", label: regenerationKindLabel("military"), impact: "会替换全部军团、兵力、舰队、战线和战役摘要。"},
  {value: "zones", kind: "zones", label: regenerationKindLabel("zones"), impact: "会按当前战争、宗教、军事与地形关系重新生成未锁定地区，并保留锁定地区。"}
]);
const selectedRegenerationKind = ref(regenerationActions[0].kind);
const selectedRegenerationAction = computed(() => regenerationActions.find(action => action.kind === selectedRegenerationKind.value) || regenerationActions[0]);
const selectedRegenerationScope = ref("all");
const selectedRegenerationStateId = ref("");
const selectedRegenerationProvinceId = ref("");
const regenerationStateOptions = ref([]);
const regenerationProvinceOptions = ref([]);
const regenerationScopeOptions = computed(() => {
  if (selectedRegenerationKind.value === "provinces") {
    return [{value: "all", label: "全图"}, {value: "state", label: "指定国家"}];
  }
  if (selectedRegenerationKind.value === "cities") {
    return [{value: "all", label: "全图"}, {value: "state", label: "指定国家"}, {value: "province", label: "指定省份"}];
  }
  return [{value: "all", label: "全图"}];
});
const regenerationTargetMissing = computed(() => (selectedRegenerationScope.value === "state" && !selectedRegenerationStateId.value)
  || (selectedRegenerationScope.value === "province" && !selectedRegenerationProvinceId.value));
const regenerationFeedback = ref("");

function isLayerVisible(layer) {
  const preferred = preferences.value.layers?.[layer];
  if (typeof preferred === "boolean") return preferred;
  return DEFAULT_LAYER_VISIBILITY[layer] !== false;
}

function layerToggleState(layer) {
  const members = layer.layers || [layer.id];
  const visible = members.filter(isLayerVisible).length;
  if (visible === 0) return false;
  if (visible === members.length) return true;
  return "mixed";
}

function patchUnitPreference(patch) {
  const next = normalizeUnitPreferences({...unitPreferences.value, ...patch});
  if (patch.distanceUnit) next.areaUnit = areaUnitForDistanceUnit(patch.distanceUnit, next.areaUnit, next);
  config.patchPreferences({units: next});
}

function openCreateCustomUnit() {
  editingCustomUnitId.value = "";
  Object.assign(customUnitDraft, emptyCustomUnitDraft());
  customUnitError.value = "";
  customUnitEditorOpen.value = true;
}

function openEditCustomUnit() {
  const unit = activeCustomUnit.value;
  if (!unit) return;
  editingCustomUnitId.value = unit.id;
  Object.assign(customUnitDraft, {
    name: unit.name,
    symbol: unit.symbol,
    kmPerUnit: String(unit.kmPerUnit),
    areaName: unit.areaMode === "custom" ? unit.areaName : "",
    areaSymbol: unit.areaMode === "custom" ? unit.areaSymbol : "",
    squareKmPerUnit: unit.areaMode === "custom" ? String(unit.squareKmPerUnit) : ""
  });
  customUnitError.value = "";
  customUnitEditorOpen.value = true;
}

function closeCustomUnitEditor() {
  customUnitEditorOpen.value = false;
  editingCustomUnitId.value = "";
  customUnitError.value = "";
}

function saveCustomUnit() {
  const id = editingCustomUnitId.value || `unit-${Date.now().toString(36)}`;
  try {
    const next = upsertCustomUnitDefinition(unitPreferences.value, {
      id,
      name: customUnitDraft.name,
      symbol: customUnitDraft.symbol,
      kmPerUnit: customUnitDraft.kmPerUnit,
      areaMode: customUnitDraft.areaName || customUnitDraft.areaSymbol || customUnitDraft.squareKmPerUnit ? "custom" : "derived",
      areaName: customUnitDraft.areaName,
      areaSymbol: customUnitDraft.areaSymbol,
      squareKmPerUnit: customUnitDraft.squareKmPerUnit
    });
    commitCustomUnitPreferences(next);
    closeCustomUnitEditor();
  } catch (error) {
    customUnitError.value = error instanceof Error ? error.message : String(error);
  }
}

function deleteActiveCustomUnit() {
  const unit = activeCustomUnit.value;
  if (!unit) return;
  if (typeof window.confirm === "function" && !window.confirm(`确定删除自定义单位“${unit.name}（${unit.symbol}）”？删除后可恢复上次删除。`)) return;
  const storage = window.localStorage;
  const previousRecycle = storage?.getItem(CUSTOM_UNIT_RECYCLE_STORAGE_KEY) ?? null;
  try {
    storage?.setItem(CUSTOM_UNIT_RECYCLE_STORAGE_KEY, JSON.stringify({
      version: 1,
      deletedAt: new Date().toISOString(),
      unit
    }));
    commitCustomUnitPreferences(deleteCustomUnitDefinition(unitPreferences.value, unit.id));
    customUnitCanRestore.value = true;
    closeCustomUnitEditor();
  } catch (error) {
    if (previousRecycle === null) storage?.removeItem(CUSTOM_UNIT_RECYCLE_STORAGE_KEY);
    else storage?.setItem(CUSTOM_UNIT_RECYCLE_STORAGE_KEY, previousRecycle);
    customUnitError.value = error instanceof Error ? error.message : String(error);
  }
}

function restoreLastDeletedCustomUnit() {
  const record = readCustomUnitRecycleRecord();
  if (!record?.unit) {
    customUnitCanRestore.value = false;
    return;
  }
  try {
    commitCustomUnitPreferences(upsertCustomUnitDefinition(unitPreferences.value, record.unit));
    window.localStorage?.removeItem(CUSTOM_UNIT_RECYCLE_STORAGE_KEY);
    customUnitCanRestore.value = false;
  } catch (error) {
    customUnitError.value = error instanceof Error ? error.message : String(error);
  }
}

function readCustomUnitRecycleRecord() {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage?.getItem(CUSTOM_UNIT_RECYCLE_STORAGE_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw);
    return record?.version === 1 && record.unit ? record : null;
  } catch {
    return null;
  }
}

function commitCustomUnitPreferences(units) {
  config.patchPreferences({units});
  nextTick(() => document.getElementById("distance-unit")?.dispatchEvent(new Event("change", {bubbles: true})));
}

function emptyCustomUnitDraft() {
  return {name: "", symbol: "", kmPerUnit: "", areaName: "", areaSymbol: "", squareKmPerUnit: ""};
}

function toggleLatitudeMode() {
  climateLatitudeMode.value = climateLatitudeMode.value === "custom" ? "auto" : "custom";
  emitClimateControlsChange();
}

function setLatitudeCenter(value) {
  climateLatitudeMode.value = "custom";
  climateLatitudeCenter.value = value;
}

function setLatitudeRangePercent(value) {
  const next = normalizeClimateRangePercent(value, climateLatitudeRangePercent.value);
  climateLatitudeRangePercent.value = next;
  if (climateRangeRatioLocked.value) {
    climateLongitudeRangePercent.value = normalizeClimateRangePercent(next * climateRangeLockRatio.value, climateLongitudeRangePercent.value);
  }
}

function setLongitudeRangePercent(value) {
  const next = normalizeClimateRangePercent(value, climateLongitudeRangePercent.value);
  climateLongitudeRangePercent.value = next;
  if (climateRangeRatioLocked.value) {
    climateLatitudeRangePercent.value = normalizeClimateRangePercent(next / Math.max(0.01, climateRangeLockRatio.value), climateLatitudeRangePercent.value);
  }
}

function toggleClimateRangeRatioLock() {
  climateRangeRatioLocked.value = !climateRangeRatioLocked.value;
  if (climateRangeRatioLocked.value) {
    climateRangeLockRatio.value = Math.max(0.01, climateLongitudeRangePercent.value / Math.max(1, climateLatitudeRangePercent.value));
  }
  config.patchPreferences({climateRangeRatioLocked: climateRangeRatioLocked.value});
}

function cycleWindBand(index) {
  const currentValue = windDirectionValueFromAngle(windBands.value[index]);
  const currentIndex = Math.max(0, WIND_DIRECTION_OPTIONS.findIndex(option => option.value === currentValue));
  const next = WIND_DIRECTION_OPTIONS[(currentIndex + 1) % WIND_DIRECTION_OPTIONS.length];
  windBands.value = windBands.value.map((angle, bandIndex) => bandIndex === index ? next.angle : angle);
  atmosphereDirection.value = "customBands";
  emitClimateControlsChange();
}

function toggleExportPanel() {
  exportPanelOpen.value = !exportPanelOpen.value;
  if (exportPanelOpen.value) nextTick(openExportPanelAtUsablePosition);
}

function closeExportPanel() {
  exportPanelOpen.value = false;
}

function clearFileOperationFeedback() {
  const status = document.getElementById("file-operation-status");
  if (status) {
    status.textContent = "";
    delete status.dataset.state;
  }
  const details = document.getElementById("file-operation-error-details");
  if (details) {
    details.textContent = "";
    details.hidden = true;
  }
  const diagnostic = document.getElementById("export-map-import-diagnostic");
  if (diagnostic) diagnostic.hidden = true;
}

function positionExportPanel() {
  const anchor = exportAnchorRef.value;
  if (!anchor) return;
  const width = Math.min(360, Math.max(280, window.innerWidth - 24));
  positionExportPanelNear(anchor, {width, minWidth: 280, estimatedHeight: 300, topOffset: 8});
}

function openExportPanelAtUsablePosition() {
  if (exportPanelPosition.value) constrainExportPanel();
  else positionExportPanel();
}

function handleExportPanelOutsideClick(event) {
  if (!exportPanelOpen.value) return;
  const target = event.target;
  if (exportPanelRef.value?.contains(target) || exportAnchorRef.value?.contains(target)) return;
  closeExportPanel();
}

function handleExportPanelReposition() {
  if (exportPanelOpen.value) constrainExportPanel();
}

function windDirectionLabel(angle) {
  return windDirectionLabelFromAngle(angle);
}

function windDirectionArrow(angle) {
  const value = windDirectionValueFromAngle(angle);
  return WIND_DIRECTION_OPTIONS.find(option => option.value === value)?.arrow || "→";
}

function formatLatitudeCenter(value) {
  const numeric = Number(value) || 0;
  if (numeric > 0) return `北纬 ${numeric}°`;
  if (numeric < 0) return `南纬 ${Math.abs(numeric)}°`;
  return "赤道 0°";
}

function latitudeCanvasPair(latitude, longitudeFraction = 1) {
  const line = latitudeLine(latitude);
  const halfWidth = Math.max(3, line.halfWidth * Math.min(1, Math.max(0.01, longitudeFraction)));
  return {
    left: [60 - halfWidth, line.y],
    right: [60 + halfWidth, line.y]
  };
}

function latitudeLine(latitude) {
  const lat = Math.max(-89.5, Math.min(89.5, Number(latitude) || 0));
  const radians = Math.abs(lat) * Math.PI / 180;
  const halfWidth = Math.max(2.4, 47 * Math.cos(radians));
  const y = 60 - (lat / 90) * 47;
  return {
    y: roundSvg(y),
    x1: roundSvg(60 - halfWidth),
    x2: roundSvg(60 + halfWidth),
    halfWidth: roundSvg(halfWidth)
  };
}

function roundSvg(value) {
  return Math.round(value * 10) / 10;
}

function emitClimateControlsChange() {
  nextTick(() => {
    const target = document.getElementById("climate-latitude-mode") || document.getElementById("atmosphere-winds");
    target?.dispatchEvent(new CustomEvent("climate-controls-change", {bubbles: true}));
    target?.dispatchEvent(new Event("change", {bubbles: true}));
  });
}

function handleSaveCommand(target) {
  const detail = target === "cloud-storage" ? {target, mode: "save"} : {target};
  document.dispatchEvent(new CustomEvent("project-map-save", {detail}));
}

function openLaboratory(id) {
  const laboratory = laboratories.find(item => item.id === id);
  if (!laboratory) return;
  window.open(laboratory.url, "_blank", "noopener,noreferrer");
}

function openCloudImport() {
  document.dispatchEvent(new CustomEvent("project-map-save", {detail: {target: "cloud-storage", mode: "import"}}));
}

function handleClimateOptionsSync(event) {
  const detail = event.detail || {};
  climateLatitudeMode.value = normalizeClimateLatitudeMode(detail.climateLatitudeMode);
  climateLatitudeCenter.value = clampNumber(detail.climateLatitudeCenter, -75, 75, climateLatitudeCenter.value);
  climateLatitudeSpan.value = clampNumber(detail.climateLatitudeSpan, 20, 80, climateLatitudeSpan.value);
  climateLatitudeRangePercent.value = normalizeClimateRangePercent(detail.climateLatitudeRangePercent ?? detail.climateMapSizePercent, climateLatitudeRangePercent.value);
  climateLongitudeRangePercent.value = normalizeClimateRangePercent(detail.climateLongitudeRangePercent ?? detail.climateMapSizePercent ?? detail.climateLatitudeRangePercent, climateLongitudeRangePercent.value);
  if (climateRangeRatioLocked.value) {
    climateRangeLockRatio.value = Math.max(0.01, climateLongitudeRangePercent.value / Math.max(1, climateLatitudeRangePercent.value));
  }
  atmosphereDirection.value = normalizeAtmosphereDirection(detail.atmosphereDirection);
  windBands.value = normalizeWindProfile(detail.winds);
  temperatureEquator.value = clampNumber(detail.temperatureEquator, temperatureRange.min, temperatureRange.max, temperatureEquator.value);
  temperatureNorthPole.value = clampNumber(detail.temperatureNorthPole, temperatureRange.min, temperatureRange.max, temperatureNorthPole.value);
  temperatureSouthPole.value = clampNumber(detail.temperatureSouthPole, temperatureRange.min, temperatureRange.max, temperatureSouthPole.value);
}

function handleVisualThemesChanged(event) {
  visualThemePresetOptions.value = Array.isArray(event.detail?.options) ? event.detail.options.map(option => ({...option})) : visualThemeOptions();
  activeUserThemeDocument.value = event.detail?.userTheme
    ? {...event.detail.userTheme, colors: {...event.detail.userTheme.colors}}
    : null;
  if (!activeUserThemeDocument.value) activeThemeAction.value = null;
}

function handleLabelStylesChanged(event) {
  if (!event.detail?.styles) return;
  labelStyleSnapshot.value = {
    version: Number(event.detail.version) || 1,
    overrides: {...(event.detail.overrides || {})},
    styles: Object.fromEntries(Object.entries(event.detail.styles).map(([styleType, entry]) => [styleType, {
      styleType,
      override: {...(entry.override || {})},
      resolved: {...(entry.resolved || {})}
    }]))
  };
}

function handleRegenerationTargetsChanged(event) {
  regenerationStateOptions.value = Array.isArray(event.detail?.states) ? event.detail.states.map(option => ({...option})) : [];
  regenerationProvinceOptions.value = Array.isArray(event.detail?.provinces) ? event.detail.provinces.map(option => ({...option})) : [];
  if (!regenerationStateOptions.value.some(option => option.value === selectedRegenerationStateId.value)) {
    selectedRegenerationStateId.value = regenerationStateOptions.value[0]?.value || "";
  }
  if (!regenerationProvinceOptions.value.some(option => option.value === selectedRegenerationProvinceId.value)) {
    selectedRegenerationProvinceId.value = regenerationProvinceOptions.value[0]?.value || "";
  }
}

async function requestRegeneration() {
  const regenerate = globalThis.window?.webglGeneratorApi?.generate?.regenerate;
  if (typeof regenerate !== "function") {
    regenerationFeedback.value = "重设服务尚未就绪";
    return;
  }
  regenerationFeedback.value = regenerationLoadingMessage(selectedRegenerationKind.value, "initial");
  const response = await regenerate(selectedRegenerationKind.value, {
    confirm: true,
    scope: selectedRegenerationScope.value,
    stateId: selectedRegenerationScope.value === "state" ? Number(selectedRegenerationStateId.value) : undefined,
    provinceId: selectedRegenerationScope.value === "province" ? Number(selectedRegenerationProvinceId.value) : undefined
  });
  regenerationFeedback.value = regenerationFeedbackMessage(selectedRegenerationKind.value, response, {
    debug: Boolean(globalThis.window?.__webglGeneratorDebug?.enabled)
  });
}

function commitLabelStyle(field, value) {
  document.dispatchEvent(new CustomEvent("webgl-generator-label-style-patch", {
    detail: {styleType: selectedLabelStyleType.value, patch: {[field]: value}}
  }));
}

function commitLabelFont(value) {
  const token = String(value || "");
  if (token.startsWith("local:")) {
    const family = normalizeLocalFontFamilyName(token.slice(6));
    if (!family) return;
    commitLabelStylePatch({fontFamilyId: LOCAL_LABEL_FONT_ID, fontFamilyName: family});
    return;
  }
  commitLabelStylePatch({fontFamilyId: token, fontFamilyName: null});
}

function commitLabelStylePatch(patch) {
  document.dispatchEvent(new CustomEvent("webgl-generator-label-style-patch", {
    detail: {styleType: selectedLabelStyleType.value, patch}
  }));
}

async function loadLocalLabelFonts() {
  localFontsMessage.value = "";
  if (typeof window.queryLocalFonts !== "function") {
    localFontsMessage.value = "当前浏览器不支持读取本机字体；仍可使用内置字体，存档中的缺失字体会自动回退。";
    return;
  }
  localFontsLoading.value = true;
  try {
    const fonts = await window.queryLocalFonts();
    localFontCatalog.value = createLocalFontFamilyOptions(fonts);
    localFontsLoaded.value = true;
    localFontsMessage.value = localFontCatalog.value.length
      ? `已读取 ${localFontCatalog.value.length} 个本机字体族。`
      : "浏览器没有返回可用的本机字体；仍可使用内置字体。";
  } catch (error) {
    localFontsLoaded.value = false;
    localFontsMessage.value = error?.name === "NotAllowedError"
      ? "未获得本机字体访问权限；仍可使用内置字体。"
      : "读取本机字体失败；仍可使用内置字体。";
  } finally {
    localFontsLoading.value = false;
  }
}

function resetCurrentLabelStyle() {
  document.dispatchEvent(new CustomEvent("webgl-generator-label-style-reset", {detail: {styleType: selectedLabelStyleType.value}}));
}

function resetAllLabelStyles() {
  if (typeof window.confirm === "function" && !window.confirm("确定重置全部标签样式？确认后可通过一次撤销恢复。")) return;
  document.dispatchEvent(new CustomEvent("webgl-generator-label-styles-reset-all"));
}

function createDefaultLabelStyleSnapshot() {
  return {
    version: 1,
    overrides: {},
    styles: Object.fromEntries(LABEL_STYLE_TYPES.map(styleType => [styleType, createDefaultLabelStyleEntry(styleType)]))
  };
}

function createDefaultLabelStyleEntry(styleType) {
  return {styleType, override: {}, resolved: {...resolveLabelStyle({version: 1, overrides: {}}, styleType)}};
}

function labelFontLabel(fontFamilyId) {
  return {system: "系统界面", historical: "历史图册宋体", historicalDisplay: "历史图册黑体", cartographic: "舆图楷体", serif: "衬线", sans: "无衬线", condensed: "窄体", mono: "等宽"}[fontFamilyId] || fontFamilyId;
}

function localFontOptionValue(family) {
  return `local:${normalizeLocalFontFamilyName(family)}`;
}

function findLocalFont(family) {
  const normalized = normalizeLocalFontFamilyName(family).toLocaleLowerCase("en-US");
  return localFontCatalog.value.find(font => font.family.toLocaleLowerCase("en-US") === normalized) || null;
}

function applyVisualThemeColor(color) {
  document.dispatchEvent(new CustomEvent("webgl-generator-visual-theme-color", {
    detail: {token: selectedThemeColorKey.value, color}
  }));
}

function requestDeleteVisualTheme() {
  document.dispatchEvent(new CustomEvent("webgl-generator-delete-visual-theme"));
}

function normalizeClimateRangePercent(value, fallback = 25) {
  return clampNumber(value, climateMapSizeRange.min, climateMapSizeRange.max, fallback);
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function normalizeControlPanelTab(value) {
  return CONTROL_PANEL_TAB_IDS.includes(value) ? value : "generation";
}

watch(activeTab, tab => {
  const normalized = normalizeControlPanelTab(tab);
  if (normalized !== tab) {
    activeTab.value = normalized;
    return;
  }
  if (preferences.value.controlPanelTab !== normalized) config.patchPreferences({controlPanelTab: normalized});
});

watch(selectedRegenerationKind, () => {
  selectedRegenerationScope.value = "all";
  regenerationFeedback.value = "";
});

watch(regenerationScopeOptions, options => {
  if (!options.some(option => option.value === selectedRegenerationScope.value)) selectedRegenerationScope.value = "all";
});

onMounted(() => {
  document.addEventListener("click", handleExportPanelOutsideClick, true);
  document.addEventListener("webgl-generator-sync-climate-options", handleClimateOptionsSync);
  document.addEventListener("webgl-generator-visual-themes-changed", handleVisualThemesChanged);
  document.addEventListener("webgl-generator-label-styles-changed", handleLabelStylesChanged);
  document.addEventListener("webgl-generator-regeneration-targets", handleRegenerationTargetsChanged);
  window.addEventListener("resize", handleExportPanelReposition);
  window.addEventListener("scroll", handleExportPanelReposition, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", handleExportPanelOutsideClick, true);
  document.removeEventListener("webgl-generator-sync-climate-options", handleClimateOptionsSync);
  document.removeEventListener("webgl-generator-visual-themes-changed", handleVisualThemesChanged);
  document.removeEventListener("webgl-generator-label-styles-changed", handleLabelStylesChanged);
  document.removeEventListener("webgl-generator-regeneration-targets", handleRegenerationTargetsChanged);
  window.removeEventListener("resize", handleExportPanelReposition);
  window.removeEventListener("scroll", handleExportPanelReposition, true);
});
</script>
