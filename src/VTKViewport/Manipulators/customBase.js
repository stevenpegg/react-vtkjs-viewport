// This expects the publicAPI function customHandleMouse(callData, button)

import Constants from 'vtk.js/Sources/Rendering/Core/InteractorStyle/Constants';
import { operations } from '../vtkInteractorStyleRotatableMPRCrosshairs';
const { States } = Constants;

export const InteractionOperations = {
  NONE: 0,
  MOVE_CROSSHAIRS: 1,
  PAN: 2,
  ZOOM: 3,
  WINDOW_LEVEL: 4,
  SLICE: 5,
};

/**
 * Initialize any additional publicAPI functions we may need.
 */
function initialize(publicAPI, model) {
  /**
   * Perform so additional procession on the mouse event to detect double clicks.
   */
  publicAPI.handleMouseButton = (callData, button) => {
    let isDoubleClick = false;

    // Double click detection.
    if (button > 0) {
      const time = new Date().getTime();
      // Check if this is a double click.
      if (
        model.lastClickButton === button &&
        model.lastClickTime !== null &&
        time - model.lastClickTime < 400
      ) {
        isDoubleClick = true;
        // Reset the click button and time.
        model.lastClickButton = 0;
        model.lastClickTime = null;
      }
      // Otherwise rememeber the click button and time.
      else {
        model.lastClickButton = button;
        model.lastClickTime = time;
      }
    }

    // Process as a normal mouse down event.
    publicAPI.customHandleMouse(callData, button, isDoubleClick);
  };

  /**
   * Clear all mouse state information and stop the current interaction operation.
   */
  publicAPI.clearMouseInteractionOperation = model => {
    // console.log('clearMouseInteractionOperation: all buttons released');
    // Clear the interaction operation NONE.
    model.interactionOperation = InteractionOperations.NONE;
    // Release all buttons.
    model.leftMouse = false;
    model.middleMouse = false;
    model.rightMouse = false;
    // End the hold on the window.
    if (model.state == States.IS_WINDOW_LEVEL) {
      publicAPI.endWindowLevel();
    }
  };

  /**
   * After a pan or zoom the crosshairs on that view need to be updated, call this is re-render them in the correct spot.
   */
  publicAPI.updateCrosshairs = model => {
    const { apis, apiIndex } = model;
    const thisApi = apis[apiIndex];
    const worldPos = thisApi.get('cachedCrosshairWorldPosition');
    if (thisApi.svgWidgets && thisApi.svgWidgets.crosshairsWidget) {
      thisApi.svgWidgets.crosshairsWidget.moveCrosshairs(
        worldPos,
        apis,
        apiIndex
      );
    }
    if (thisApi.svgWidgets && thisApi.svgWidgets.rotatableCrosshairsWidget) {
      thisApi.svgWidgets.rotatableCrosshairsWidget.moveCrosshairs(
        worldPos,
        apis,
        apiIndex
      );
    }
  };
}

/**
 * Initialize any additional publicAPI functions we may need AFTER applying
 * and standard interactor adjustments. In particular apply any mouse handler
 * changes here that should happen AFTER the interactor has had a chance to
 * apply the interaction.
 */
function finalize(publicAPI, model) {
  const superHandleMouseMove = publicAPI.handleMouseMove;
  publicAPI.handleMouseMove = callData => {
    // Clear the double click detection if the mouse has moved.
    model.lastClickButton = 0;
    model.lastClickTime = null;
    if (model.state === States.IS_WINDOW_LEVEL) {
      // Process the mouse move.
      publicAPI.customHandleMouse(callData, 0, false);
    }
    if (superHandleMouseMove) {
      superHandleMouseMove(callData);
    }
  };

  const superHandleLeftButtonPress = publicAPI.handleLeftButtonPress;
  publicAPI.handleLeftButtonPress = callData => {
    // console.log('handleLeftButtonPress', callData);
    // Record that the button is down.
    model.leftMouse = true;

    // A left click with the shift button down will initiate a move crosshair operation
    // ... even if the click is outside the crosshairs center.
    if (
      (!model.operation || model.operation.type === null) &&
      callData.shiftKey
    ) {
      // Manually start the MOVE_CROSSHAIRS operation.
      model.operation = { type: operations.MOVE_CROSSHAIRS };
      publicAPI.startWindowLevel();
      // Use the handleMouseMove function to move the crosshairs.
      publicAPI.handleMouseMove(callData);
    }
    // Otherwise; call the original handler.
    else if (superHandleLeftButtonPress) {
      superHandleLeftButtonPress(callData);
    }

    // If the user is adjusting the crosshairs set the interaction operation.
    if (model.operation && model.operation.type !== null) {
      model.interactionOperation = InteractionOperations.MOVE_CROSSHAIRS;
    } else if (!callData.shiftKey && !callData.controlKey && !callData.altKey) {
      publicAPI.startWindowLevel();
      publicAPI.handleMouseButton(callData, 1);
    }
  };

  const superHandleMiddleButtonPress = publicAPI.handleMiddleButtonPress;
  publicAPI.handleMiddleButtonPress = callData => {
    // console.log('handleMiddleButtonPress', callData);
    // Record that the button is down.
    model.middleMouse = true;

    if (!callData.shiftKey && !callData.controlKey && !callData.altKey) {
      publicAPI.startWindowLevel();
      publicAPI.handleMouseButton(callData, 2);
    }
    // Otherwise call the original handler.
    else if (superHandleMiddleButtonPress) {
      superHandleMiddleButtonPress(callData);
    }
  };

  const superHandleRightButtonPress = publicAPI.handleRightButtonPress;
  publicAPI.handleRightButtonPress = callData => {
    // console.log('handleRightButtonPress', callData);
    // Record that the button is down.
    model.rightMouse = true;

    if (!callData.shiftKey && !callData.controlKey && !callData.altKey) {
      publicAPI.startWindowLevel();
      publicAPI.handleMouseButton(callData, 3);
    }
    // Otherwise call the original handler.
    else if (superHandleRightButtonPress) {
      superHandleRightButtonPress(callData);
    }
  };

  const superHandleLeftButtonRelease = publicAPI.handleLeftButtonRelease;
  publicAPI.handleLeftButtonRelease = () => {
    // console.log('handleLeftButtonRelease');
    // Always let vtk perform its actions on the release first.
    if (superHandleLeftButtonRelease) {
      superHandleLeftButtonRelease();
    }
    // Release all buttons and stop the current interaction operation.
    publicAPI.clearMouseInteractionOperation(model);
  };

  const superHandleMiddleButtonRelease = publicAPI.handleMiddleButtonRelease;
  publicAPI.handleMiddleButtonRelease = () => {
    // console.log('handleMiddleButtonRelease');
    // Always let vtk perform its actions on the release first.
    if (superHandleMiddleButtonRelease) {
      superHandleMiddleButtonRelease();
    }
    // Release all buttons and stop the current interaction operation.
    publicAPI.clearMouseInteractionOperation(model);
  };

  const superHandleRightButtonRelease = publicAPI.handleRightButtonRelease;
  publicAPI.handleRightButtonRelease = () => {
    // console.log('handleRightButtonRelease');
    // Always let vtk perform its actions on the release first.
    if (superHandleRightButtonRelease) {
      superHandleRightButtonRelease();
    }
    // Release all buttons and stop the current interaction operation.
    publicAPI.clearMouseInteractionOperation(model);
  };
}

const DEFAULT_VALUES = {
  // The current interaction operation.
  interactionOperation: InteractionOperations.NONE,
  // Mouse button states.
  leftMouse: false, // Is the left mouse button currently down?
  middleMouse: false, // Is the middle mouse button currently down?
  rightMouse: false, // Is the right mouse button currently down?
  lastClickButton: 0, // The last mouse button pressed.
  lastClickTime: null, // The date the last button was pressed.
};

const defaults = {
  initialize,
  finalize,
  DEFAULT_VALUES,
};
export default defaults;
