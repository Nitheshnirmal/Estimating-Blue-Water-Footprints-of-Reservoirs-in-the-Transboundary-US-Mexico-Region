// This code  is an analysis script to process Landsat 5, 8 and 9 data
// The script mainly performs operations to filter the images, 
// calculate indices (NDVI and MNDWI), and Calculate for clouds, water and vegetation extent.
 
// Define a ROI
var roi_rect = [ee.Feature(ee.Geometry.Rectangle(-107.253411, 33.129099, -107.113401, 33.346617), {name: 'Elephant'}),];
var roi = ee.FeatureCollection(roi_rect);
 
// Define date range and NDVI and MNDWI Thresholds.
var startdate = '1990-01-01'; 
var enddate = '2023-12-31';

// Define thresholds for creating vegetation and water masks
var VegThreshold = 0.2;
var WaterThreshold = 0;

// Center map to the ROI
Map.addLayer(roi)
Map.centerObject(roi);
 
// Define Landsat collections with their specific spectral band names
var collections = [
  // Landsat 5 bands
  {name: 'LANDSAT/LT05/C02/T1_L2', version: 'Landsat 5', greenBand: 'SR_B2', mirBand: 'SR_B5', redBand: 'SR_B3', NIRBand: 'SR_B4'},
  // Landsat 8 bands
  {name: 'LANDSAT/LC08/C02/T1_L2', version: 'Landsat 8', greenBand: 'SR_B3', mirBand: 'SR_B6', redBand: 'SR_B4', NIRBand: 'SR_B5'},
   // Landsat 9 bands
  {name: 'LANDSAT/LC09/C02/T1_L2', version: 'Landsat 9', greenBand: 'SR_B3', mirBand: 'SR_B6', redBand: 'SR_B4', NIRBand: 'SR_B5'}
];

// The processCollection function filters images according to row, path and date.
// It applies cloud masking, calculates NDVI and MNDWI, creates water and vegetation masks,
// and retrieves cloud cover and area data for water and vegetation. 

function processCollection(collectionInfo, roi) {
  
  // create image collection
  var collection = ee.ImageCollection(collectionInfo.name)
    .filterDate(startdate, enddate)
    .filterBounds(roi);
  
  // Get Pixel quality attributes to compute cloud cover
  var calculatePixels = function(image) {
     var totalPixelsROI = ee.Number(image.unmask().reduceRegion({
    reducer: ee.Reducer.count(),
    geometry: roi,
    scale: 30,
    maxPixels: 1e9
  }).get('QA_PIXEL'));
 
 // Select the QA band. 
  var qaROI = image.select('QA_PIXEL').clip(roi);
 
// Create cloud mask: Bits 1, 3  and 4 are dilated cloud. cloud, and Cloud Shadow Respectively. 
  var dilatedCloudBitMask = 1 << 1;
  var cloudBitMask = 1 << 3;
  var cloudShadowBitMask = 1 << 4

  var cloudROI = qaROI.bitwiseAnd(dilatedCloudBitMask).neq(0).or(qaROI.bitwiseAnd(cloudBitMask).neq(0)).or(qaROI.bitwiseAnd(cloudShadowBitMask).neq(0));

  // Add a line to invert the cloud mask (1 for clear, 0 for cloud)
  var clearROI = cloudROI.not();

  var cloudPixelsROI = ee.Number(cloudROI.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: roi,
    scale: 30,
    maxPixels: 1e9
  }).get('QA_PIXEL'));

  // Get the CLOUD_COVER metadata
  var cloudCover = image.get('CLOUD_COVER');

  // Define Landsat version based on the image's system:id
  var landsatVersion = image.get('landsat_version');
  
  // Before calculating MNDWI, mask out the clouds
  image = image.updateMask(clearROI); 
 
    // Calculate NDVI and MNDWI
  var red = image.select(collectionInfo.redBand); 
  var green = image.select(collectionInfo.greenBand); 
  var NIR = image.select(collectionInfo.NIRBand);
  var MIR = image.select(collectionInfo.mirBand); 
  
    
  var ndvi = NIR.subtract(red).divide(NIR.add(red)).rename('ndvi');
  var mndwi = green.subtract(MIR).divide(green.add(MIR)).rename('mndwi');
  
  // Threshold the MNDWI image to define water pixels
  var water = mndwi.gt(WaterThreshold).rename('water');  // water pixels have MNDWI > 0
  
  // Calculate the water extent area in acres
  var waterPixels = water.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: roi, 
    scale: 30,
    maxPixels: 1e9 
  }).get('water');
  
// Convert pixel count to area in km2
 var waterArea = ee.Number(waterPixels).multiply(0.0009);
 
   // Threshold the MNDWI image to define water pixels
  var vegetation = ndvi.gt(VegThreshold).rename('vegetation');  // water pixels have MNDWI > 0
  
  // Calculate the water extent area in acres
  var vegPixels = vegetation.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: roi, 
    scale: 30,
    maxPixels: 1e9 
  }).get('vegetation');
  
// Convert pixel count to area in km2
 var vegArea = ee.Number(vegPixels).multiply(0.0009);
  
  return image.set('Date', image.date().format('YYYY-MM-dd')) 
              .set('Landsat_version', collectionInfo.version)
              .set('Cloud_cover_Tile', cloudCover)
              .set('Cloud_percent_ROI', cloudPixelsROI.divide(totalPixelsROI).multiply(100))
              .set('Water_extent_km2', waterArea)
              .set('Vegetation_extent_km2', vegArea);
           
};
 

  var collectionPixels = collection.map(calculatePixels);
  
  var featureCollection = ee.FeatureCollection(collectionPixels.map(function (image) {
    return ee.Feature(null, image.toDictionary(['Date','Landsat_version', 'Cloud_cover_Tile','Cloud_percent_ROI', 'Water_extent_km2',  'Vegetation_extent_km2']));
  }));

  return featureCollection;
}

function processROI(feature) {
  var roi = ee.Feature(feature).geometry();
  
  var features = collections.map(function(collectionInfo) {
    return processCollection(collectionInfo, roi);
  });

  return ee.FeatureCollection(features).flatten();
}

var results = roi.map(processROI);

var mergedFeatures = results.flatten();

// Export the results.
Export.table.toDrive({
  collection: mergedFeatures.sort('system:time_start'),
  description: 'Landsat_cloud_MNDWI_ARB',
  folder: 'GEE',
  fileNamePrefix: 'Landsat_cloud_MNDWI_ARB_'+roi.aggregate_array('Name').getInfo(),
  fileFormat: 'CSV',
  selectors: ['Date','Landsat_version', 'Cloud_cover_Tile','Cloud_percent_ROI', 'Water_extent_km2', 'Vegetation_extent_km2']
});
