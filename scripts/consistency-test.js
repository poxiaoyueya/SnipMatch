const fs = require('node:fs');
const path = require('node:path');

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function help() {
  console.log('Usage: npm run test:consistency -- --current <image> --reference <image> [--runs 5] [--url http://localhost:3000]');
  console.log('The endpoint is called with disableCache=true so the report measures model-only variance.');
}

function dataUrl(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mimeTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
  const mimeType = mimeTypes[extension];
  if (!mimeType) throw new Error(`Unsupported image type: ${extension}`);
  return `data:${mimeType};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function statistics(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return {
    values,
    mean: Number(mean.toFixed(2)),
    variance: Number(variance.toFixed(2)),
    standardDeviation: Number(Math.sqrt(variance).toFixed(2)),
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    range: Math.max(...values) - Math.min(...values),
  };
}

async function main() {
  if (process.argv.includes('--help')) {
    help();
    return;
  }

  const currentPath = argument('current');
  const referencePath = argument('reference');
  const runs = Number(argument('runs', '5'));
  const baseUrl = argument('url', 'http://localhost:3000').replace(/\/$/, '');
  if (!currentPath || !referencePath || !Number.isInteger(runs) || runs < 2) {
    help();
    process.exitCode = 1;
    return;
  }

  const currentImage = dataUrl(path.resolve(currentPath));
  const referenceImage = dataUrl(path.resolve(referencePath));
  const scores = { volume: [], length: [], texture: [], silhouette: [] };

  for (let run = 1; run <= runs; run += 1) {
    const response = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentImage, referenceImage, disableCache: true, skipReferenceStyle: true, skipProfessionalReport: true }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.analysis) throw new Error(payload.error || `Run ${run} failed`);
    Object.keys(scores).forEach((dimension) => scores[dimension].push(payload.analysis[dimension].score));
    console.error(`Completed uncached run ${run}/${runs}`);
  }

  const report = Object.fromEntries(Object.entries(scores).map(([dimension, values]) => [dimension, statistics(values)]));
  console.log(JSON.stringify({ runs, cacheDisabled: true, dimensions: report }, null, 2));
}

main().catch((error) => {
  console.error(`Consistency test failed: ${error.message}`);
  process.exitCode = 1;
});


