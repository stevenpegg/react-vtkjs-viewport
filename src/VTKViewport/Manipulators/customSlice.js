// NOTE: This currently relies on the slice methods set up in the inherited vtkInteractorStyleMPRSlice.
import { InteractionOperations } from './customBase';

/**
 * Start the window level operation.
 */
function onStart(publicAPI, model, callData) {
  model.interactionOperation = InteractionOperations.SLICE;

  // Get the current mouse position.
  model.previousPosition = callData.position;
}

/**
 * Adjust the window level based on the mouse movement.
 */
function onMove(publicAPI, model, callData) {
  const position = callData.position;
  if (!position) {
    return;
  }

  // Get the change in mouse Y position.
  const dy = position.y - model.previousPosition.y;

  // Get the slice range.
  const range = publicAPI.getSliceRange();
  // Get the current slice.
  let slice = publicAPI.getSlice();

  // Adjust this constant to adjust how much the slice changes per pixel of mouse movement.
  const scrollSpeed = 0.0005;

  // Adjust the slice and limit the range.
  slice += dy * scrollSpeed * (range[1] - range[0]);
  if (slice < range[0]) slice = range[0];
  if (slice > range[1]) slice = range[1];

  // Actually adjust the slice.
  publicAPI.scrollToSlice(slice);

  // Remember this mouse position.
  model.previousPosition = position;
}

/**
 * Initialize any additional publicAPI functions we may need.
 */
function initialize(publicAPI, model) {}

const DEFAULT_VALUES = {};

const defaults = {
  onStart,
  onMove,
  initialize,
  DEFAULT_VALUES,
};
export default defaults;
