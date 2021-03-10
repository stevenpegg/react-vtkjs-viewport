import { vec3 } from 'gl-matrix';

/**
 *
 * @param {*} scanAxisNormal - [x, y, z] array or gl-matrix vec3
 * @param {*} imageMetaDataMap - one of the results from BuildMetadata()
 */
export default function sortDatasetsByImagePosition(
  scanAxisNormal,
  imageMetaDataMap
) {
  // See https://github.com/dcmjs-org/dcmjs/blob/4849ed50db8788741c2773b3d9c75cc52441dbcb/src/normalizers.js#L167
  // TODO: Find a way to make this code generic?

  const datasets = Array.from(imageMetaDataMap.values());
  const referenceDataset = datasets[0];

  const distanceDatasetPairs = datasets.map(function(dataset) {
    const positionVector = vec3.sub(
      [],
      referenceDataset.imagePositionPatient,
      dataset.imagePositionPatient
    );
    const distance = vec3.dot(positionVector, scanAxisNormal);

    return {
      distance,
      dataset,
    };
  });

  distanceDatasetPairs.sort(function(a, b) {
    return b.distance - a.distance;
  });

  const sortedDatasets = distanceDatasetPairs.map(a => a.dataset);
  const distances = distanceDatasetPairs.map(a => a.distance);

  // Remove any slices with duplicate positional information.
  for (let i = distances.length - 1; i > 0; i--) {
    const distance = Math.abs(distances[i] - distances[i - 1]);
    if (distance === 0.0) {
      // console.log(`Slice ${i} and ${i - 1} have the same location, removing slice ${i}`);
      sortedDatasets.splice(i, 1);
      distances.splice(i, 1);
    }
  }

  let spacing = 0;
  if (distances.length > 1) {
    // TODO: The way we calculate spacing determines how the volume shows up if
    // we have missing slices.
    // - Should we just bail out for now if missing slices are present?
    // spacing = Math.abs(distances[1] - distances[0]);

    // Improved the above calculation to use the average distance / slice over the distance range.
    // This solved an issue where the first two slices had the same distance and hence made the spacing 0: drawing every slice on top of one another!
    let minDistance = distances[0];
    let maxDistance = distances[0];
    for (let i = 1; i < distances.length; i++) {
      minDistance = Math.min(minDistance, distances[i]);
      maxDistance = Math.max(maxDistance, distances[i]);
    }
    spacing = (maxDistance - minDistance) / (distances.length - 1);
  }

  return {
    spacing,
    origin: distanceDatasetPairs[0].dataset.imagePositionPatient,
    sortedDatasets,
  };
}
