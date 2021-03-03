import { InteractionOperations } from './customBase';

/**
 * Start the zoom operation.
 */
function onStart(publicAPI, model, callData) {
  model.interactionOperation = InteractionOperations.ZOOM;

  // From vtkMouseCameraTrackballZoomManipulator
  const interactor = model.interactor;
  const renderer = interactor.getCurrentRenderer();
  const camera = renderer.getActiveCamera();

  model.previousPosition = callData.position;
  const size = interactor.getView().getSize();

  const direction = model.flipDirection ? -1 : 1;
  if (camera.getParallelProjection()) {
    model.zoomScale = (1.5 / size[1]) * direction;
  } else {
    const range = camera.getClippingRange();
    model.zoomScale = 1.5 * (range[1] / size[1]) * direction;
  }
}

/**
 * Adjust the zoom based on the mouse movement.
 */
function onMove(publicAPI, model, callData) {
  const position = callData.position;
  const interactor = model.interactor;
  const renderer = interactor.getCurrentRenderer();
  const camera = renderer.getActiveCamera();

  // From vtkMouseCameraTrackballZoomManipulator
  if (!position) {
    return;
  }

  const dy = model.previousPosition.y - position.y;

  if (camera.getParallelProjection()) {
    const k = dy * model.zoomScale;
    camera.setParallelScale((1.0 - k) * camera.getParallelScale());
  } else {
    const cameraPos = camera.getPosition();
    const cameraFp = camera.getFocalPoint();
    const norm = camera.getDirectionOfProjection();
    const k = dy * model.zoomScale;

    let tmp = k * norm[0];
    cameraPos[0] += tmp;
    cameraFp[0] += tmp;

    tmp = k * norm[1];
    cameraPos[1] += tmp;
    cameraFp[1] += tmp;

    tmp = k * norm[2];
    cameraPos[2] += tmp;
    cameraFp[2] += tmp;

    if (!camera.getFreezeFocalPoint()) {
      camera.setFocalPoint(cameraFp[0], cameraFp[1], cameraFp[2]);
    }

    camera.setPosition(cameraPos[0], cameraPos[1], cameraPos[2]);
    renderer.resetCameraClippingRange();
  }

  if (interactor.getLightFollowCamera()) {
    renderer.updateLightsGeometryToFollowCamera();
  }

  model.previousPosition = position;

  // Fix the crosshairs position.
  publicAPI.updateCrosshairs(model);
}

/**
 * Initialize any additional publicAPI functions we may need.
 */
function initialize(publicAPI, model) {}

const DEFAULT_VALUES = {
  zoomScale: 0.0,
  flipDirection: true, // True for up = zoom in, down = zoom out, false for the opposite.
};

const defaults = {
  onStart,
  onMove,
  initialize,
  DEFAULT_VALUES,
};
export default defaults;
