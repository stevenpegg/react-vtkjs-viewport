import * as vtkMath from 'vtk.js/Sources/Common/Core/Math';
import { InteractionOperations } from './customBase';

/**
 * Start the zoom operation.
 */
function onStart(publicAPI, model, callData) {
  model.interactionOperation = InteractionOperations.PAN;

  model.previousPosition = callData.position;
}

/**
 * Adjust the zoom based on the mouse movement.
 */
function onMove(publicAPI, model, callData) {
  const position = callData.position;
  const interactor = model.interactor;
  const renderer = interactor.getCurrentRenderer();
  const camera = renderer.getActiveCamera();
  if (!position) {
    return;
  }

  // From vtkMouseCameraTrackballManipulator
  const pos = position;
  const lastPos = model.previousPosition;
  model.previousPosition = position;

  const camPos = camera.getPosition();
  const fp = camera.getFocalPoint();

  if (camera.getParallelProjection()) {
    camera.orthogonalizeViewUp();

    const up = camera.getViewUp();
    const vpn = camera.getViewPlaneNormal();

    const right = [0, 0, 0];

    vtkMath.cross(vpn, up, right);

    // These are different because y is flipped.
    const height = interactor.getView().getSize()[1];
    let dx = (pos.x - lastPos.x) / height;
    let dy = (lastPos.y - pos.y) / height;

    const scale = camera.getParallelScale();
    dx *= scale * 2.0;
    dy *= scale * 2.0;

    let tmp = right[0] * dx + up[0] * dy;
    camPos[0] += tmp;
    fp[0] += tmp;
    tmp = right[1] * dx + up[1] * dy;
    camPos[1] += tmp;
    fp[1] += tmp;
    tmp = right[2] * dx + up[2] * dy;
    camPos[2] += tmp;
    fp[2] += tmp;
    camera.setPosition(camPos[0], camPos[1], camPos[2]);
    camera.setFocalPoint(fp[0], fp[1], fp[2]);
  } else {
    const { center } = model;
    const style = interactor.getInteractorStyle();
    const focalDepth = style.computeWorldToDisplay(
      renderer,
      center[0],
      center[1],
      center[2]
    )[2];
    const worldPoint = style.computeDisplayToWorld(
      renderer,
      pos.x,
      pos.y,
      focalDepth
    );
    const lastWorldPoint = style.computeDisplayToWorld(
      renderer,
      lastPos.x,
      lastPos.y,
      focalDepth
    );

    const newCamPos = [
      camPos[0] + (lastWorldPoint[0] - worldPoint[0]),
      camPos[1] + (lastWorldPoint[1] - worldPoint[1]),
      camPos[2] + (lastWorldPoint[2] - worldPoint[2]),
    ];

    const newFp = [
      fp[0] + (lastWorldPoint[0] - worldPoint[0]),
      fp[1] + (lastWorldPoint[1] - worldPoint[1]),
      fp[2] + (lastWorldPoint[2] - worldPoint[2]),
    ];

    camera.setPosition(newCamPos[0], newCamPos[1], newCamPos[2]);
    camera.setFocalPoint(newFp[0], newFp[1], newFp[2]);
  }

  renderer.resetCameraClippingRange();

  if (interactor.getLightFollowCamera()) {
    renderer.updateLightsGeometryToFollowCamera();
  }

  // Fix the crosshairs position.
  publicAPI.updateCrosshairs(model);
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
