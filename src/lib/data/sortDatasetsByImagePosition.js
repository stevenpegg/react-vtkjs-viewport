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
  // console.log('imageMetaDataMap');
  // console.log(imageMetaDataMap);

  const datasets = Array.from(imageMetaDataMap.values());
  const referenceDataset = datasets[0];

  // console.log('datasets');
  // console.log(datasets);

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

  // console.log('sortDatasetsByImagePosition distances');
  // console.log(distances[0]);
  // console.log(distances[0]);
  // console.log('all distances', distances);
  // for (let i = 0; i < distances.length - 1; i++) {
  //  console.log('distance', i, Math.abs(distances[i + 1] - distances[i]));
  // }

  // Remove any slices that share the same position as the next slice.
  /*
  for (let i = distances.length - 1; i > 0; i--) {
    if (Math.abs(distances[i - 1] - distances[i]) <= 0.0001) {
      console.log('Removing slice', i);
      sortedDatasets.splice(i, 1);
      distances.splice(i, 1);
    }
  }
  */
  // console.log('There are now', distances.length, 'slices');

  // TODO: The way we calculate spacing determines how the volume shows up if
  // we have missing slices.
  // - Should we just bail out for now if missing slices are present?
  // const spacing = mean(diff(distances));
  let spacing = Math.abs(distances[1] - distances[0]);
  console.log('sortDatasetsByImagePosition spacing', spacing);
  spacing = mean(diff(distances));
  console.log('sortDatasetsByImagePosition spacing NOW', spacing);

  return {
    spacing,
    origin: distanceDatasetPairs[0].dataset.imagePositionPatient,
    sortedDatasets,
  };
}
