import macro from 'vtk.js/Sources/macro';
import vtkInteractorStyleMPRSlice from './vtkInteractorStyleMPRSlice.js';
import Constants from 'vtk.js/Sources/Rendering/Core/InteractorStyle/Constants';
import vtkCoordinate from 'vtk.js/Sources/Rendering/Core/Coordinate';
import vtkMatrixBuilder from 'vtk.js/Sources/Common/Core/MatrixBuilder';
import { vec2, vec3, quat } from 'gl-matrix';
import vtkMath from 'vtk.js/Sources/Common/Core/Math';
import CustomBase from './Manipulators/customBase';
import CustomZoom from './Manipulators/customZoom';
import CustomPan from './Manipulators/customPan';
import CustomWindowLevel from './Manipulators/customWindowLevel';
import CustomSlice from './Manipulators/customSlice';

const { States } = Constants;

export const InteractionOperations = {
  NONE: 0,
  MOVE_CROSSHAIRS: 1,
  PAN: 2,
  ZOOM: 3,
  WINDOW_LEVEL: 4,
  SLICE: 5,
};

const operations = {
  ROTATE_CROSSHAIRS: 0,
  MOVE_CROSSHAIRS: 1,
  MOVE_REFERENCE_LINE: 2,
  PAN: 3,
};

// ----------------------------------------------------------------------------
// Global methods
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// vtkInteractorStyleRotatableMPRCrosshairs methods
// ----------------------------------------------------------------------------

function addCustomInteractor(publicAPI, model) {
  // Inherit from the slice interactor to enable the scroll wheel to change the slice value.
  vtkInteractorStyleMPRSlice.extend(publicAPI, model, {
    addMouseTrackballManipulator: false,
    addMousePanManipulator: false,
    addMouseZoomManipulator: false,
    addMouseScrollManipulator: true,
  });

  /**
   * Our custom handler for mouse interactions. This is called when a button is first pressed
   * with the button number (or 0 when the mouse is being moved). Examine the button states
   * in the model to identify which buttons are currently pressed. isDoubleClick is true if
   * the same mouse button is being clicked a second time in quick succession.
   */
  publicAPI.customHandleMouse = (callData, button, isDoubleClick) => {
    // Fire the onDoubleClick callback?
    if (isDoubleClick && model.onDoubleClick) {
      model.onDoubleClick(button, model.apiIndex);
      return;
    }

    // Start zoom when both left and right are down.
    if (
      (button === 1 && model.rightMouse) ||
      (button === 3 && model.leftMouse)
    ) {
      // Block the switch to ZOOM if we are in the middle of an OBLIQUE crosshairs manipulation.
      if (
        model.interactionOperation !== InteractionOperations.MOVE_CROSSHAIRS
      ) {
        CustomZoom.onStart(publicAPI, model, callData);
      }
    }
    // Start window level change.
    else if (button === 2) {
      CustomWindowLevel.onStart(publicAPI, model, callData);
    }
    // Start pan.
    else if (button === 3 && !model.leftMouse) {
      CustomPan.onStart(publicAPI, model, callData);
    }
    // Start move crosshairs or slice change.
    else if (button === 1 && !model.rightMouse) {
      // Start slice change.
      if (model.interactionOperation === InteractionOperations.NONE) {
        CustomSlice.onStart(publicAPI, model, callData);
      }
    }

    // Perform the current interaction operation (if not InteractionOperations.NONE).
    switch (model.interactionOperation) {
      case InteractionOperations.ZOOM:
        CustomZoom.onMove(publicAPI, model, callData);
        break;
      case InteractionOperations.PAN:
        CustomPan.onMove(publicAPI, model, callData);
        break;
      case InteractionOperations.WINDOW_LEVEL:
        CustomWindowLevel.onMove(publicAPI, model, callData);
        break;
      case InteractionOperations.SLICE:
        CustomSlice.onMove(publicAPI, model, callData);
        break;
      default:
        break;
    }
  };

  // Initialize the manipulators.
  CustomBase.initialize(publicAPI, model);
  CustomZoom.initialize(publicAPI, model);
  CustomPan.initialize(publicAPI, model);
  CustomWindowLevel.initialize(publicAPI, model);
  CustomSlice.initialize(publicAPI, model);
}

function addCustomRotatableCrosshair(publicAPI, model) {
  // Remember our original mouse handlers.
  const originalHandleLeftButtonPress = publicAPI.handleLeftButtonPress;
  const originalHandleLeftButtonRelease = publicAPI.handleLeftButtonRelease;
  const originalHandleMiddleButtonPress = publicAPI.handleMiddleButtonPress;
  const originalHandleMiddleButtonRelease = publicAPI.handleMiddleButtonRelease;
  const originalHandleRightButtonPress = publicAPI.handleRightButtonPress;
  const originalHandleRightButtonRelease = publicAPI.handleRightButtonRelease;
  const originalHandleMouseMove = publicAPI.handleMouseMove;
  const originalScrollToSlice = publicAPI.scrollToSlice;

  // Clear handlers so we don't chain them twice (once when this interactor calls it's super handler
  // and once when we call the original handler).
  publicAPI.handleLeftButtonPress = null;
  publicAPI.handleLeftButtonRelease = null;
  publicAPI.handleMouseMove = null;

  // Object specific methods
  vtkInteractorStyleRotatableMPRCrosshairs(publicAPI, model);

  // Get the newly set mouse handlers.
  const newHandleLeftButtonPress = publicAPI.handleLeftButtonPress;
  const newHandleLeftButtonRelease = publicAPI.handleLeftButtonRelease;
  const newHandleMouseMove = publicAPI.handleMouseMove;

  // Restore the original handlers for the methods we don't want to customize.
  publicAPI.handleMiddleButtonPress = originalHandleMiddleButtonPress;
  publicAPI.handleMiddleButtonRelease = originalHandleMiddleButtonRelease;
  publicAPI.handleRightButtonPress = originalHandleRightButtonPress;
  publicAPI.handleRightButtonRelease = originalHandleRightButtonRelease;

  /**
   * Get if the crosshair position is being changed; note rotating the crosshairs doesn't actually change it's position.
   */
  const movingCrosshairs = () => {
    return (
      model.operation &&
      (model.operation.type === operations.MOVE_CROSSHAIRS ||
        model.operation.type === operations.MOVE_REFERENCE_LINE)
    );
  };

  /**
   * Get the HU value of the volume at the current crosshair position and the crosshair position.
   * { huValue: number, crosshairPos: [X, Y, Z] }
   */
  publicAPI.getCrosshairValues = () => {
    try {
      const { apis, apiIndex } = model;
      const thisApi = apis[apiIndex];
      const worldPos = thisApi.get('cachedCrosshairWorldPosition');
      if (thisApi.volumes && worldPos) {
        const mapper = thisApi.volumes[0].getVolumes().getMapper();
        const inputData = mapper.getInputData();
        const pointData = inputData.getPointData();
        const scalarData = pointData.getScalars().getData();
        const volumeDimensions = inputData.getDimensions();

        // A simple function to round the number and clamp it to the min-max range.
        const roundAndClamp = (num, min, max) => {
          return num <= min ? min : num >= max ? max : Math.round(num);
        };

        // Convert the position from world space to the volume space.
        let indexPos = [0, 0, 0];
        inputData.worldToIndex(worldPos, indexPos);

        // Round and clamp the position.
        indexPos[0] = roundAndClamp(indexPos[0], 0, volumeDimensions[0]);
        indexPos[1] = roundAndClamp(indexPos[1], 0, volumeDimensions[1]);
        indexPos[2] = roundAndClamp(indexPos[2], 0, volumeDimensions[2]);

        // Convert the volume position to a volume index.
        const index =
          indexPos[0] +
          indexPos[1] * volumeDimensions[0] +
          indexPos[2] * volumeDimensions[0] * volumeDimensions[1];
        return {
          huValue: scalarData[index],
          crosshairPos: indexPos,
        };
      }
    } catch (error) {
      console.log('Error reading crosshairs value', error);
      return 0;
    }
  };

  // Set a custom handler for this method.
  publicAPI.handleLeftButtonPress = callData => {
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
      newHandleMouseMove(callData);
    }
    // Otherwise do the default handling of the click.
    else {
      newHandleLeftButtonPress(callData);
    }

    // If the user is adjusting the crosshairs block set it as an interaction operation.
    if (model.operation && model.operation.type !== null) {
      model.interactionOperation = InteractionOperations.MOVE_CROSSHAIRS;
      // Fire the callback if the crosshairs were moved.
      if (movingCrosshairs() && model.onCrosshairsMoved) {
        model.onCrosshairsMoved();
      }
    } else {
      originalHandleLeftButtonPress(callData);
    }
  };

  // Set a custom handler for this method.
  publicAPI.handleLeftButtonRelease = callData => {
    const isMovingCrosshairs = movingCrosshairs();
    newHandleLeftButtonRelease(callData);
    originalHandleLeftButtonRelease(callData);
    // Fire the callback if the crosshairs were moved.
    if (isMovingCrosshairs && model.onCrosshairsMoved) {
      model.onCrosshairsMoved();
    }
  };

  // Set a custom handler for this method.
  publicAPI.handleMouseMove = callData => {
    const isMovingCrosshairs = movingCrosshairs();
    newHandleMouseMove(callData);
    originalHandleMouseMove(callData);
    // Fire the callback if the crosshairs were moved.
    if (isMovingCrosshairs && model.onCrosshairsMoved) {
      model.onCrosshairsMoved();
    }
  };

  // Override the scrollToSlice method so we can fire our callback after the change.
  publicAPI.scrollToSlice = slice => {
    originalScrollToSlice(slice);
    // Fire the callback after the crosshairs are moved.
    if (model.onCrosshairsMoved) {
      model.onCrosshairsMoved();
    }
  };
}

function vtkInteractorStyleRotatableMPRCrosshairs(publicAPI, model) {
  // Set our className
  model.classHierarchy.push('vtkInteractorStyleRotatableMPRCrosshairs');

  function selectOpperation(callData) {
    const { apis, apiIndex, lineGrabDistance } = model;
    const thisApi = apis[apiIndex];
    let { position } = callData;

    setOtherApisInactive();

    const { rotatableCrosshairsWidget } = thisApi.svgWidgets;

    if (!rotatableCrosshairsWidget) {
      throw new Error(
        'Must use rotatable crosshair svg widget with this istyle.'
      );
    }

    const lines = rotatableCrosshairsWidget.getReferenceLines();
    const point = rotatableCrosshairsWidget.getPoint();
    const centerRadius = rotatableCrosshairsWidget.getCenterRadius();

    const distanceFromCenter = vec2.distance(point, [position.x, position.y]);

    if (distanceFromCenter < centerRadius) {
      // Click on center -> move the crosshairs.
      model.operation = { type: operations.MOVE_CROSSHAIRS };

      lines.forEach(line => {
        line.selected = true;
      });

      return;
    }

    const { svgWidgetManager } = thisApi;
    const size = svgWidgetManager.getSize();
    const scale = svgWidgetManager.getScale();
    const height = size[1];

    // Map to the click point to the same coords as the SVG.
    const p = { x: position.x * scale, y: height - position.y * scale };

    // Check each rotation handle
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineRotateHandles = line.rotateHandles;
      const { points } = lineRotateHandles;

      for (let i = 0; i < points.length; i++) {
        const distance = vec2.distance([points[i].x, points[i].y], [p.x, p.y]);

        if (distance < lineGrabDistance) {
          model.operation = {
            type: operations.ROTATE_CROSSHAIRS,
            prevPosition: position,
          };

          lineRotateHandles.selected = true;

          // Set this line active.
          if (lineIndex === 0) {
            lines[0].active = true;
            lines[1].active = false;
          } else {
            lines[0].active = false;
            lines[1].active = true;
          }

          return;
        }
      }
    }

    const distanceFromFirstLine = distanceFromLine(lines[0], p); //position);
    const distanceFromSecondLine = distanceFromLine(lines[1], p); //;

    if (
      distanceFromFirstLine <= lineGrabDistance ||
      distanceFromSecondLine <= lineGrabDistance
    ) {
      // Click on line -> start a rotate of the other planes.

      const selectedLineIndex =
        distanceFromFirstLine < distanceFromSecondLine ? 0 : 1;

      lines[selectedLineIndex].selected = true;
      lines[selectedLineIndex].active = true;

      // Deactivate other line if active
      const otherLineIndex = selectedLineIndex === 0 ? 1 : 0;

      lines[otherLineIndex].active = false;

      // Set operation data.

      model.operation = {
        type: operations.MOVE_REFERENCE_LINE,
        snapToLineIndex: selectedLineIndex === 0 ? 1 : 0,
      };

      return;
    }

    lines.forEach(line => {
      line.active = false;
    });

    setOtherApisInactive();

    // What is the fallback? Pan? Do nothing for now.
    model.operation = { type: null };
  }

  function setOtherApisInactive() {
    // Set other apis inactive

    const { apis, apiIndex } = model;

    apis.forEach((api, index) => {
      if (index !== apiIndex) {
        const { rotatableCrosshairsWidget } = api.svgWidgets;

        if (!rotatableCrosshairsWidget) {
          throw new Error(
            'Must use rotatable crosshair svg widget with this istyle.'
          );
        }

        const lines = rotatableCrosshairsWidget.getReferenceLines();

        lines[0].active = false;
        lines[1].active = false;
      }
    });
  }

  function distanceFromLine(line, point) {
    const [a, b] = line.points;
    const c = point;

    // Get area from all 3 points...
    const areaOfTriangle = Math.abs(
      (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) / 2
    );

    // And area also equals 1/2 base * height, where height is the distance!
    // So:
    const base = vec2.distance([a.x, a.y], [b.x, b.y]);
    const height = (2.0 * areaOfTriangle) / base;

    // Note we don't have to worry about finite line length
    // As the lines go across the whole canvas.

    return height;
  }

  function performOperation(callData) {
    const { operation } = model;
    const { type } = operation;

    let snapToLineIndex;
    let pos;

    switch (type) {
      case operations.MOVE_CROSSHAIRS:
        moveCrosshairs(callData.position, callData.pokedRenderer);
        break;
      case operations.MOVE_REFERENCE_LINE:
        snapToLineIndex = operation.snapToLineIndex;
        pos = snapPosToLine(callData.position, snapToLineIndex);

        moveCrosshairs(pos, callData.pokedRenderer);
        break;
      case operations.ROTATE_CROSSHAIRS:
        rotateCrosshairs(callData);
        break;
    }
  }

  function rotateCrosshairs(callData) {
    const { operation } = model;
    const { prevPosition } = operation;

    const newPosition = callData.position;

    if (newPosition.x === prevPosition.x && newPosition.y === prevPosition.y) {
      // No change, exit early.
      return;
    }

    const { apis, apiIndex } = model;
    const thisApi = apis[apiIndex];

    const { rotatableCrosshairsWidget } = thisApi.svgWidgets;

    const point = rotatableCrosshairsWidget.getPoint();

    let pointToPreviousPosition = [];
    let pointToNewPosition = [];

    // Get vector from center of crosshairs to previous position.
    vec2.subtract(
      pointToPreviousPosition,
      [prevPosition.x, prevPosition.y],
      point
    );

    // Get vector from center of crosshairs to new position.
    vec2.subtract(pointToNewPosition, [newPosition.x, newPosition.y], point);

    // Get angle of rotation from previous reference line position to the new position.
    let angle = vec2.angle(pointToPreviousPosition, pointToNewPosition);

    // Use the determinant to find the sign of the angle.
    const determinant =
      pointToNewPosition[0] * pointToPreviousPosition[1] -
      pointToNewPosition[1] * pointToPreviousPosition[0];

    if (determinant > 0) {
      angle *= -1;
    }

    // Axis is the opposite direction of the plane normal for this API.
    const sliceNormal = thisApi.getSliceNormal();
    const axis = [-sliceNormal[0], -sliceNormal[1], -sliceNormal[2]];

    // Rotate other apis
    apis.forEach((api, index) => {
      if (index !== apiIndex) {
        const cameraForApi = api.genericRenderWindow
          .getRenderWindow()
          .getInteractor()
          .getCurrentRenderer()
          .getActiveCamera();

        const crosshairPointForApi = api.get('cachedCrosshairWorldPosition');
        const initialCrosshairPointForApi = api.get(
          'initialCachedCrosshairWorldPosition'
        );

        const center = [];
        vtkMath.subtract(
          crosshairPointForApi,
          initialCrosshairPointForApi,
          center
        );
        const translate = [];
        vtkMath.add(crosshairPointForApi, center, translate);

        const { matrix } = vtkMatrixBuilder
          .buildFromRadian()
          .translate(translate[0], translate[1], translate[2])
          .rotate(angle, axis)
          .translate(-translate[0], -translate[1], -translate[2]);

        cameraForApi.applyTransform(matrix);

        const sliceNormalForApi = api.getSliceNormal();
        const viewUpForApi = api.getViewUp();
        api.setOrientation(sliceNormalForApi, viewUpForApi);
      }
    });

    updateCrosshairs(callData);

    /*
    After the rotations and update of the crosshairs, the focal point of the
    camera has a shift along the line of sight coordinate respect to the
    crosshair (i.e., the focal point is not on the same slice of the crosshair).
    We calculate the new focal point coordinates as the nearest point between
    the line of sight of the camera and the crosshair coordinates:

      p1 = cameraPositionForApi
      p2 = cameraFocalPointForApi
      q = crosshairPointForApi

      Vector3 u = p2 - p1;
      Vector3 pq = q - p1;
      Vector3 w2 = pq - vtkMath.multiplyScalar(u, vtkMath.dot(pq, u) / u2);

      Vector3 newFocalPoint = q - w2;
    */

    apis.forEach(api => {
      const cameraForApi = api.genericRenderWindow
        .getRenderWindow()
        .getInteractor()
        .getCurrentRenderer()
        .getActiveCamera();

      const crosshairPointForApi = api.get('cachedCrosshairWorldPosition');
      const cameraFocalPointForApi = cameraForApi.getFocalPoint();
      const cameraPositionForApi = cameraForApi.getPosition();

      const u = [];
      vtkMath.subtract(cameraFocalPointForApi, cameraPositionForApi, u);
      const pq = [];
      vtkMath.subtract(crosshairPointForApi, cameraPositionForApi, pq);
      const uLength2 = u[0] * u[0] + u[1] * u[1] + u[2] * u[2];
      vtkMath.multiplyScalar(u, vtkMath.dot(pq, u) / uLength2);
      const w2 = [];
      vtkMath.subtract(pq, u, w2);
      const newFocalPointForApi = [];
      vtkMath.subtract(crosshairPointForApi, w2, newFocalPointForApi);

      cameraForApi.setFocalPoint(
        newFocalPointForApi[0],
        newFocalPointForApi[1],
        newFocalPointForApi[2]
      );
    });

    operation.prevPosition = newPosition;
  }

  function updateCrosshairs(callData) {
    const { apis, apiIndex } = model;
    const thisApi = apis[apiIndex];

    const { rotatableCrosshairsWidget } = thisApi.svgWidgets;

    const worldPos = thisApi.get('cachedCrosshairWorldPosition');

    rotatableCrosshairsWidget.moveCrosshairs(worldPos, apis, apiIndex);
  }

  function snapPosToLine(position, lineIndex) {
    const { apis, apiIndex } = model;
    const thisApi = apis[apiIndex];
    const { svgWidgetManager } = thisApi;
    const size = svgWidgetManager.getSize();
    const scale = svgWidgetManager.getScale();
    const height = size[1];

    // Map to the click point to the same coords as the SVG.
    const p = { x: position.x * scale, y: height - position.y * scale };

    const { rotatableCrosshairsWidget } = thisApi.svgWidgets;
    const lines = rotatableCrosshairsWidget.getReferenceLines();
    const line = lines[lineIndex];
    const points = line.points;

    // Project p onto line to get new crosshair position
    let line0toP = [];
    let line0toline1 = [];

    vec2.sub(line0toP, [p.x, p.y], [points[0].x, points[0].y]);
    vec2.sub(
      line0toline1,
      [points[1].x, points[1].y],
      [points[0].x, points[0].y]
    );

    const magnitudeOfLine = vec2.distance(
      [points[0].x, points[0].y],
      [points[1].x, points[1].y]
    );

    const unitVectorAlongLine = [
      line0toline1[0] / magnitudeOfLine,
      line0toline1[1] / magnitudeOfLine,
    ];

    const dotProduct = vec2.dot(line0toP, line0toline1);

    const distanceAlongLine = dotProduct / magnitudeOfLine;

    const newCenterSVG = [
      points[0].x + unitVectorAlongLine[0] * distanceAlongLine,
      points[0].y + unitVectorAlongLine[1] * distanceAlongLine,
    ];

    // Convert back to display coords.
    return {
      x: newCenterSVG[0] / scale,
      y: (height - newCenterSVG[1]) / scale,
    };
  }

  function moveCrosshairs(pos, renderer) {
    const { apis, apiIndex } = model;
    const thisApi = apis[apiIndex];

    const dPos = vtkCoordinate.newInstance();
    dPos.setCoordinateSystemToDisplay();

    dPos.setValue(pos.x, pos.y, 0);
    let worldPos = dPos.getComputedWorldValue(renderer);

    const camera = renderer.getActiveCamera();
    const directionOfProjection = camera.getDirectionOfProjection();

    const halfSlabThickness = thisApi.getSlabThickness() / 2;

    // Add half of the slab thickness to the world position, such that we select
    // The center of the slice.

    for (let i = 0; i < worldPos.length; i++) {
      worldPos[i] += halfSlabThickness * directionOfProjection[i];
    }

    thisApi.svgWidgets.rotatableCrosshairsWidget.moveCrosshairs(
      worldPos,
      apis,
      apiIndex
    );

    publicAPI.invokeInteractionEvent({ type: 'InteractionEvent' });
  }

  function scrollCrosshairs(lineIndex, direction) {
    const { apis, apiIndex } = model;
    const thisApi = apis[apiIndex];
    const { svgWidgetManager, volumes } = thisApi;
    const volume = volumes[0];
    const size = svgWidgetManager.getSize();
    const scale = svgWidgetManager.getScale();
    const height = size[1];
    const renderer = thisApi.genericRenderWindow.getRenderer();

    const { rotatableCrosshairsWidget } = thisApi.svgWidgets;

    if (!rotatableCrosshairsWidget) {
      throw new Error(
        'Must use rotatable crosshair svg widget with this istyle.'
      );
    }

    const lines = rotatableCrosshairsWidget.getReferenceLines();
    const otherLineIndex = lineIndex === 0 ? 1 : 0;

    const point = rotatableCrosshairsWidget.getPoint();
    // Transform point to SVG coordinates
    const p = [point[0] * scale, height - point[1] * scale];

    // Get the unit vector to move the line in.

    const linePoints = lines[otherLineIndex].points;
    let lowToHighPoints;

    // If line is horizontal (<1 pix difference in height), move right when scroll forward.
    if (Math.abs(linePoints[0].y - linePoints[1].y) < 1.0) {
      if (linePoints[0].x < linePoints[1].x) {
        lowToHighPoints = [linePoints[0], linePoints[1]];
      } else {
        lowToHighPoints = [linePoints[1], linePoints[0]];
      }
    }
    // If end is higher on screen, scroll moves crosshairs that way.
    else if (linePoints[0].y < linePoints[1].y) {
      lowToHighPoints = [linePoints[0], linePoints[1]];
    } else {
      lowToHighPoints = [linePoints[1], linePoints[0]];
    }

    const unitVector = [];
    vec2.subtract(
      unitVector,
      [lowToHighPoints[1].x, lowToHighPoints[1].y],
      [lowToHighPoints[0].x, lowToHighPoints[0].y]
    );
    vec2.normalize(unitVector, unitVector);

    if (direction === 'forwards') {
      unitVector[0] *= -1;
      unitVector[1] *= -1;
    }

    const displayCoordintateScrollIncrement = getDisplayCoordinateScrollIncrement(
      point
    );

    const newCenterPointSVG = [
      p[0] + unitVector[0] * displayCoordintateScrollIncrement,
      p[1] + unitVector[1] * displayCoordintateScrollIncrement,
    ];

    // Clip to box defined by the crosshairs extent

    let lowX;
    let highX;
    let lowY;
    let highY;

    if (lowToHighPoints[0].x < lowToHighPoints[1].x) {
      lowX = lowToHighPoints[0].x;
      highX = lowToHighPoints[1].x;
    } else {
      lowX = lowToHighPoints[1].x;
      highX = lowToHighPoints[0].x;
    }

    if (lowToHighPoints[0].y < lowToHighPoints[1].y) {
      lowY = lowToHighPoints[0].y;
      highY = lowToHighPoints[1].y;
    } else {
      lowY = lowToHighPoints[1].y;
      highY = lowToHighPoints[0].y;
    }

    newCenterPointSVG[0] = Math.min(
      Math.max(newCenterPointSVG[0], lowX),
      highX
    );

    newCenterPointSVG[1] = Math.min(
      Math.max(newCenterPointSVG[1], lowY),
      highY
    );

    // translate to the display coordinates.
    const displayCoordinate = {
      x: newCenterPointSVG[0] / scale,
      y: (height - newCenterPointSVG[1]) / scale,
    };

    // Move point.
    moveCrosshairs(displayCoordinate, renderer);
  }

  function getDisplayCoordinateScrollIncrement(point) {
    const { apis, apiIndex } = model;
    const thisApi = apis[apiIndex];
    const { volumes, genericRenderWindow } = thisApi;
    const renderer = genericRenderWindow.getRenderer();
    const volume = volumes[0];
    const diagonalWorldLength = volume
      .getMapper()
      .getInputData()
      .getSpacing()
      .map(v => v * v)
      .reduce((a, b) => a + b, 0);

    const dPos = vtkCoordinate.newInstance();
    dPos.setCoordinateSystemToDisplay();
    dPos.setValue(point[0], point[1], 0);

    let worldPosCenter = dPos.getComputedWorldValue(renderer);

    dPos.setValue(point[0] + 1, point[1], 0);

    let worldPosOnePixelOver = dPos.getComputedWorldValue(renderer);

    const distanceOfOnePixelInWorld = vec2.distance(
      worldPosCenter,
      worldPosOnePixelOver
    );

    return diagonalWorldLength / distanceOfOnePixelInWorld;
  }

  function handlePassiveMouseMove(callData) {
    const { apis, apiIndex, lineGrabDistance } = model;
    const thisApi = apis[apiIndex];
    let { position } = callData;

    // Note: If rotate selected, don't select line.
    const selectedRotateHandles = [false, false];

    const selectedLines = [false, false];

    const { rotatableCrosshairsWidget } = thisApi.svgWidgets;

    if (!rotatableCrosshairsWidget) {
      throw new Error(
        'Must use rotatable crosshair svg widget with this istyle.'
      );
    }

    let shouldUpdate;

    const lines = rotatableCrosshairsWidget.getReferenceLines();
    const point = rotatableCrosshairsWidget.getPoint();
    const centerRadius = rotatableCrosshairsWidget.getCenterRadius();

    const distanceFromCenter = vec2.distance(point, [position.x, position.y]);

    if (distanceFromCenter > centerRadius) {
      const { svgWidgetManager } = thisApi;
      const size = svgWidgetManager.getSize();
      const scale = svgWidgetManager.getScale();
      const height = size[1];

      // Map to the click point to the same coords as the SVG.
      const p = { x: position.x * scale, y: height - position.y * scale };

      let selectedRotationHandle = false;

      // Check each rotation handle
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const lineRotateHandles = line.rotateHandles;
        const { points } = lineRotateHandles;

        for (let i = 0; i < points.length; i++) {
          const distance = vec2.distance(
            [points[i].x, points[i].y],
            [p.x, p.y]
          );

          if (distance < lineGrabDistance) {
            selectedRotateHandles[lineIndex] = true;
            selectedRotationHandle = true;
            // Don't need to check both points if one is found to be valid.
            break;
          }
        }
      }

      // If a rotation handle isn't selected, see if we should select lines.
      if (!selectedRotationHandle) {
        const distanceFromFirstLine = distanceFromLine(lines[0], p);
        const distanceFromSecondLine = distanceFromLine(lines[1], p);

        if (
          distanceFromFirstLine <= lineGrabDistance ||
          distanceFromSecondLine <= lineGrabDistance
        ) {
          const selectedLineIndex =
            distanceFromFirstLine < distanceFromSecondLine ? 0 : 1;

          selectedLines[selectedLineIndex] = true;
        }
      }
    } else {
      // Highlight both lines.
      selectedLines[0] = true;
      selectedLines[1] = true;
    }

    lines.forEach((line, index) => {
      const selected = selectedLines[index];
      const rotateSelected = selectedRotateHandles[index];
      const rotateHandles = line.rotateHandles;

      // If changed, update and flag should update.
      if (line.selected !== selected) {
        line.selected = selected;
        shouldUpdate = true;
      }

      if (rotateHandles.selected !== rotateSelected) {
        rotateHandles.selected = rotateSelected;
        shouldUpdate = true;
      }
    });

    if (shouldUpdate) {
      updateCrosshairs(callData);
    }
  }

  const superHandleMouseMove = publicAPI.handleMouseMove;
  publicAPI.handleMouseMove = callData => {
    if (model.state === States.IS_WINDOW_LEVEL) {
      performOperation(callData);
    } else {
      handlePassiveMouseMove(callData);
    }

    if (superHandleMouseMove) {
      superHandleMouseMove(callData);
    }
  };

  //const superHandleLeftButtonPress = publicAPI.handleLeftButtonPress;
  publicAPI.handleLeftButtonPress = callData => {
    if (model.volumeActor) {
      selectOpperation(callData);
      performOperation(callData);

      publicAPI.startWindowLevel();
    }
  };

  publicAPI.superHandleLeftButtonRelease = publicAPI.handleLeftButtonRelease;
  publicAPI.handleLeftButtonRelease = callData => {
    switch (model.state) {
      case States.IS_WINDOW_LEVEL:
        mouseUp(callData);
        break;

      default:
        publicAPI.superHandleLeftButtonRelease();
        break;
    }
  };

  function mouseUp(callData) {
    model.operation = { type: null };

    // Unselect lines
    const { apis, apiIndex } = model;
    const thisApi = apis[apiIndex];
    const { rotatableCrosshairsWidget } = thisApi.svgWidgets;

    if (!rotatableCrosshairsWidget) {
      throw new Error(
        'Must use rotatable crosshair svg widget with this istyle.'
      );
    }

    const lines = rotatableCrosshairsWidget.getReferenceLines();

    lines.forEach(line => {
      line.selected = false;
      line.rotateHandles.selected = false;
    });

    updateCrosshairs(callData);

    publicAPI.endWindowLevel();
  }

  const superScrollToSlice = publicAPI.scrollToSlice;
  publicAPI.scrollToSlice = slice => {
    const { apis, apiIndex, lineGrabDistance } = model;
    const thisApi = apis[apiIndex];

    const { rotatableCrosshairsWidget } = thisApi.svgWidgets;

    if (!rotatableCrosshairsWidget) {
      throw new Error(
        'Must use rotatable crosshair svg widget with this istyle.'
      );
    }

    const lines = rotatableCrosshairsWidget.getReferenceLines();

    let activeLineIndex;

    lines.forEach((line, lineIndex) => {
      if (line.active) {
        activeLineIndex = lineIndex;
      }
    });

    if (activeLineIndex === undefined) {
      if (!model.disableNormalMPRScroll) {
        superScrollToSlice(slice);
      }
    } else {
      const direction = publicAPI.getSlice() - slice;

      const scrollDirection = direction > 0 ? 'forwards' : 'backwards';

      scrollCrosshairs(activeLineIndex, scrollDirection);
    }
  };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  operation: { type: null },
  lineGrabDistance: 20,
  disableNormalMPRScroll: false,
  // Use the new customized controls?
  customControls: true,
  // The current interaction operation.
  interactionOperation: InteractionOperations.NONE,
  // Mouse button states.
  leftMouse: false, // Is the left mouse button currently down?
  middleMouse: false, // Is the middle mouse button currently down?
  rightMouse: false, // Is the right mouse button currently down?
  lastClickButton: 0, // The last mouse button pressed.
  lastClickTime: null, // The date the last button was pressed.
  // Optional callback for when the crosshairs are moved: () => void
  onCrosshairsMoved: undefined,
  // Optional callback for when the window levels have changed: () => void
  onWindowLevelsChanged: undefined,
  // Optional callback for when a double mouse click event occurs: (button: number, apiIndex: number) => void
  onDoubleClick: undefined,
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  macro.setGet(publicAPI, model, [
    'callback',
    'apis',
    'apiIndex',
    'onScroll',
    'operation',
    'lineGrabDistance',
    'disableNormalMPRScroll',
  ]);

  let customControls = true;

  if (customControls) {
    addCustomInteractor(publicAPI, model);
    addCustomRotatableCrosshair(publicAPI, model);
  } else {
    // Inheritance
    vtkInteractorStyleMPRSlice.extend(publicAPI, model, initialValues);

    // Object specific methods
    vtkInteractorStyleRotatableMPRCrosshairs(publicAPI, model);
  }
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(
  extend,
  'vtkInteractorStyleRotatableMPRCrosshairs'
);

// ----------------------------------------------------------------------------

export default Object.assign({ newInstance, extend });
