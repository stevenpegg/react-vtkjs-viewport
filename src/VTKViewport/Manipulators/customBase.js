// This expects the publicAPI function customHandleMouse(callData, button)

import Constants from 'vtk.js/Sources/Rendering/Core/InteractorStyle/Constants';
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
  function handleMouseButton(callData, button) {
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
  }

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

  /**
   * Clear all mouse state information and stop the current interaction operation.
   */
  function clearMouseInteractionOperation(model) {
    // Clear the interaction operation NONE.
    model.interactionOperation = InteractionOperations.NONE;
    // Release all buttons.
    model.leftMouse = false;
    model.middleMouse = false;
    model.rightMouse = false;
  }

  const superHandleLeftButtonPress = publicAPI.handleLeftButtonPress;
  publicAPI.handleLeftButtonPress = callData => {
    model.leftMouse = true;
    // console.log("handleLeftMousePress", callData);
    // Move the crosshairs (no modifier keys down)
    if (!callData.shiftKey && !callData.controlKey && !callData.altKey) {
      publicAPI.startWindowLevel();
      handleMouseButton(callData, 1);
    } else if (superHandleLeftButtonPress) {
      superHandleLeftButtonPress(callData);
    }
  };

  publicAPI.superHandleLeftButtonRelease = publicAPI.handleLeftButtonRelease;
  publicAPI.handleLeftButtonRelease = () => {
    // Release all buttons and stop the current interaction operation.
    clearMouseInteractionOperation(model);
    // console.log("handleLeftMousRelease");
    switch (model.state) {
      case States.IS_WINDOW_LEVEL:
        publicAPI.endWindowLevel();
        break;

      default:
        publicAPI.superHandleLeftButtonRelease();
        break;
    }
  };

  const superHandleMiddleButtonPress = publicAPI.handleMiddleButtonPress;
  publicAPI.handleMiddleButtonPress = callData => {
    model.middleMouse = true;
    // console.log("handleMiddleButtonPress", callData);
    if (!callData.shiftKey && !callData.controlKey && !callData.altKey) {
      publicAPI.startWindowLevel();
      handleMouseButton(callData, 2);
    } else if (superHandleMiddleButtonPress) {
      superHandleMiddleButtonPress(callData);
    }
  };

  publicAPI.superHandleMiddleButtonRelease =
    publicAPI.handleMiddleButtonRelease;
  publicAPI.handleMiddleButtonRelease = () => {
    // Release all buttons and stop the current interaction operation.
    clearMouseInteractionOperation(model);
    // console.log("handleMiddleButtonRelease");
    switch (model.state) {
      case States.IS_WINDOW_LEVEL:
        publicAPI.endWindowLevel();
        break;

      default:
        publicAPI.superHandleMiddleButtonRelease();
        break;
    }
  };

  const superHandleRightButtonPress = publicAPI.handleRightButtonPress;
  publicAPI.handleRightButtonPress = callData => {
    model.rightMouse = true;
    // console.log("handleRightButtonPress", callData);
    if (!callData.shiftKey && !callData.controlKey && !callData.altKey) {
      publicAPI.startWindowLevel();
      handleMouseButton(callData, 3);
    } else if (superHandleRightButtonPress) {
      superHandleRightButtonPress(callData);
    }
  };

  publicAPI.superHandleRightButtonRelease = publicAPI.handleRightButtonRelease;
  publicAPI.handleRightButtonRelease = () => {
    // Release all buttons and stop the current interaction operation.
    clearMouseInteractionOperation(model);
    // console.log("handleRightButtonRelease");
    switch (model.state) {
      case States.IS_WINDOW_LEVEL:
        publicAPI.endWindowLevel();
        break;

      default:
        publicAPI.superHandleRightButtonRelease();
        break;
    }
  };

  /**
   * After a pan or zoom the crosshairs on that view need to be updated, this will re-render them in the correct spot.
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
  DEFAULT_VALUES,
};
export default defaults;
