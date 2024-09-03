
// Define a ROI
var roi_rect = [ee.Feature(ee.Geometry.Rectangle(-107.253411, 33.129099, -107.113401, 33.346617), {name: 'Elephant'}),];
var roi = ee.FeatureCollection(roi_rect);

Map.centerObject(roi);
Map.addLayer(roi, {color: 'red'}, 'Elephant Reservoir');
var CHIRPS = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
      .select('precipitation')
      .filterBounds(roi)
      .filterDate('2021-01-01', '2024-06-30');
//1990-01-01, 2000-12-31
//2001-01-01, 2010-12-31
//2011-01-01, 2020-12-31
//2021-01-01, 2024-06-31
//spliting of time is because of 5000 elements limitation in GEE for non-commercial usage

var CHIRPSGraph = ui.Chart.image.seriesByRegion({
  imageCollection: CHIRPS, 
  regions: roi, 
  band: 'precipitation',
  reducer: ee.Reducer.max(),
  scale: 5000, // ~5km resolution
}).setOptions({
        title: 'Max precipitation',
        hAxis: {title: 'Date'},
        vAxis: {title: 'Precipitation [mm/day]'}});

// Display graphs
print(CHIRPSGraph);
