// =============================================================================
// Cornerstone3D Initialisation
// =============================================================================

import {
  init as coreInit,
  RenderingEngine,
  Enums,
} from '@cornerstonejs/core'

import {
  init as toolsInit,
  addTool,
  ToolGroupManager,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  StackScrollTool,
  LengthTool,
  RectangleROITool,
  EllipticalROITool,
  PlanarFreehandROITool,
  Enums as ToolEnums,
  type Types as ToolTypes,
} from '@cornerstonejs/tools'

import * as dicomLoader from '@cornerstonejs/dicom-image-loader'

export const ENGINE_ID    = 'hackathonEngine'
export const VIEWPORT_ID  = 'mainViewport'
export const TOOLGROUP_ID = 'hackathonToolGroup'

let renderingEngine: RenderingEngine
let toolGroup: ToolTypes.IToolGroup

export function getRenderingEngine() { return renderingEngine }
export function getToolGroup()       { return toolGroup }

// ─── Initialise all three Cornerstone3D packages ─────────────────────────────
export async function initCornerstone() {
  await coreInit()
  await dicomLoader.init()
  await toolsInit()
}

// ─── Create the Stack viewport ───────────────────────────────────────────────
export function initViewport(element: HTMLDivElement) {
  renderingEngine = new RenderingEngine(ENGINE_ID)
  renderingEngine.enableElement({
    viewportId: VIEWPORT_ID,
    element,
    type: Enums.ViewportType.STACK,
  })
}

// ─── Register tools and configure defaults ───────────────────────────────────
export function initTools() {
  addTool(WindowLevelTool)
  addTool(PanTool)
  addTool(ZoomTool)
  addTool(StackScrollTool)
  addTool(LengthTool)
  addTool(RectangleROITool)
  addTool(EllipticalROITool)
  addTool(PlanarFreehandROITool)

  toolGroup = ToolGroupManager.createToolGroup(TOOLGROUP_ID)!

  toolGroup.addTool(WindowLevelTool.toolName)
  toolGroup.addTool(PanTool.toolName)
  toolGroup.addTool(ZoomTool.toolName)
  toolGroup.addTool(StackScrollTool.toolName)
  toolGroup.addTool(LengthTool.toolName)
  toolGroup.addTool(RectangleROITool.toolName)
  toolGroup.addTool(EllipticalROITool.toolName)
  toolGroup.addTool(PlanarFreehandROITool.toolName)

  toolGroup.addViewport(VIEWPORT_ID, ENGINE_ID)

  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
  })
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: ToolEnums.MouseBindings.Wheel }],
  })
}

// ─── Switch the active tool ───────────────────────────────────────────────────
export function setActiveTool(toolName: string) {
  // Passivate all tools EXCEPT StackScrollTool — it must keep its Wheel binding
  const switchableTools = [
    WindowLevelTool.toolName,
    PanTool.toolName,
    ZoomTool.toolName,
    LengthTool.toolName,
    RectangleROITool.toolName,
    EllipticalROITool.toolName,
    PlanarFreehandROITool.toolName,
  ]
  switchableTools.forEach(t => { try { toolGroup.setToolPassive(t) } catch { /* ok */ } })
  toolGroup.setToolActive(toolName, {
    bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
  })
}
