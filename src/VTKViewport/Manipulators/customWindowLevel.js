import {
  toWindowLevel,
  toLowHighRange,
} from '../../lib/windowLevelRangeConverter';
import { InteractionOperations } from './customBase';

/**
 * Start the window level operation.
 */
function onStart(publicAPI, model, callData) {
  model.interactionOperation = InteractionOperations.WINDOW_LEVEL;

  model.wlStartPos[0] = callData.position.x;
  model.wlStartPos[1] = callData.position.y;

  if (model.volumeActor) {
    const property = model.volumeActor.getProperty();
    if (property) {
      model.initialMRange = property
        .getRGBTransferFunction(0)
        .getMappingRange()
        .slice();
      model.levels = toWindowLevel(
        model.initialMRange[0],
        model.initialMRange[1]
      );
      publicAPI.startWindowLevel();
    }
  }

  // Fire the onChange callback.
  if (model.onWindowLevelsChanged) {
    model.onWindowLevelsChanged();
  }
}

/**
 * Adjust the window level based on the mouse movement.
 */
function onMove(publicAPI, model, callData) {
  const pos = [callData.position.x, callData.position.y];
  publicAPI.windowLevelFromMouse(pos);

  // Force each view to redraw.
  const { apis, apiIndex } = model;
  if (apis && apis[apiIndex] && apis[apiIndex].type === 'VIEW2D') {
    apis.forEach((api, viewportIndex) => {
      const renderWindow = api.genericRenderWindow.getRenderWindow();
      renderWindow.render();
    });
  }

  // Fire the onChange callback.
  if (model.onWindowLevelsChanged) {
    model.onWindowLevelsChanged();
  }
}

/**
 * Initialize any additional publicAPI functions we may need.
 */
function initialize(publicAPI, model) {
  // Directly from vtkInteractorStyleMPRWindowLevel
  publicAPI.windowLevelFromMouse = pos => {
    const range = model.volumeActor
      .getMapper()
      .getInputData()
      .getPointData()
      .getScalars()
      .getRange();
    const imageDynamicRange = range[1] - range[0];
    const multiplier =
      Math.round(imageDynamicRange / 1024) * publicAPI.getLevelScale();
    const dx = Math.round((pos[0] - model.wlStartPos[0]) * multiplier);
    const dy = Math.round((pos[1] - model.wlStartPos[1]) * multiplier);

    let windowWidth = model.levels.windowWidth + dx;
    let windowCenter = model.levels.windowCenter - dy;

    windowWidth = Math.max(0.01, windowWidth);

    if (
      model.windowWidth === windowWidth &&
      model.windowCenter === windowCenter
    ) {
      return;
    }

    publicAPI.setWindowLevel(windowWidth, windowCenter);

    model.wlStartPos[0] = Math.round(pos[0]);
    model.wlStartPos[1] = Math.round(pos[1]);

    const onLevelsChanged = publicAPI.getOnLevelsChanged();
    if (onLevelsChanged) {
      onLevelsChanged({ windowCenter, windowWidth });
    }
  };

  // Directly from vtkInteractorStyleMPRWindowLevel
  publicAPI.getWindowLevel = () => {
    const range = model.volumeActor
      .getProperty()
      .getRGBTransferFunction(0)
      .getMappingRange()
      .slice();
    return toWindowLevel(...range);
  };

  // Directly from vtkInteractorStyleMPRWindowLevel
  publicAPI.setWindowLevel = (windowWidth, windowCenter) => {
    const lowHigh = toLowHighRange(windowWidth, windowCenter);

    model.levels.windowWidth = windowWidth;
    model.levels.windowCenter = windowCenter;

    model.volumeActor
      .getProperty()
      .getRGBTransferFunction(0)
      .setMappingRange(lowHigh.lower, lowHigh.upper);
  };
}

const DEFAULT_VALUES = {
  wlStartPos: [0, 0],
  levelScale: 1,
};

const defaults = {
  onStart,
  onMove,
  initialize,
  DEFAULT_VALUES,
};
export default defaults;
