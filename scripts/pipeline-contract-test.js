const os = require('node:os');

const realFetch = global.fetch;
process.chdir(os.tmpdir());
process.env.CRAZYROUTER_API_KEY = 'sk-test-pipeline';
process.env.CRAZYROUTER_BASE_URL = 'https://crazyrouter.com/v1';
process.env.VISION_MODEL = 'gpt-5.6-sol';
process.env.REPORT_MODEL = 'gpt-5.6-luna';
process.env.PORT = '3110';
process.env.NODE_ENV = 'production';

const zones = {
  fringe_front: zone('clear', 'Current fringe/front sits above the brow line.', 'clear', 'Reference fringe/front extends lower.', 'Reference fringe/front is visibly longer.'),
  top: zone('clear', 'Current top lies close to the head.', 'clear', 'Reference top shows greater lift.', 'Reference top has more visible lift.'),
  crown: zone('partial', 'Current crown is partly visible with compact volume.', 'partial', 'Reference crown is partly visible with a fuller outline.', 'Visible crown area appears fuller in the reference.'),
  temples_sides: zone('clear', 'Current temples/sides retain a rounded outline.', 'clear', 'Reference temples/sides sit closer to the head.', 'Reference temples/sides have less outward bulk.'),
  around_ears: zone('partial', 'Current hair partly covers the area around ears.', 'partial', 'Reference exposes more of the area around ears.', 'Reference has a cleaner visible outline around ears.'),
  back_nape: zone('not_visible', null, 'not_visible', null, null),
  perimeter: zone('partial', 'Current visible perimeter is softly rounded.', 'partial', 'Reference visible perimeter is more compact.', 'Reference visible perimeter is tighter.'),
  top_to_side_transition: zone('clear', 'Current top-to-side transition is gradual and full.', 'clear', 'Reference transition is sharper with less side bulk.', 'Reference transition is more defined.'),
};

function zone(currentVisibility, currentObservation, referenceVisibility, referenceObservation, comparison) {
  return { currentVisibility, referenceVisibility, currentObservation, referenceObservation, comparison };
}

function dimension(score, name) {
  return {
    score,
    confidence: 90,
    evidence: `${name} differs at the top and temples/sides.`,
    observations: ['Top: Current lies flatter than the reference.', 'Temples/sides: Current retains more outward bulk.'],
  };
}

const features = {
  volume: dimension(70, 'Volume'),
  length: dimension(74, 'Length'),
  texture: dimension(68, 'Texture'),
  silhouette: dimension(72, 'Silhouette'),
  spatialZones: zones,
};

const goodReport = {
  whatToAskYourBarber: [
    'Fringe/front: Confirm how much of the visible length difference should be retained.',
    'Top: Confirm the target amount of visible lift.',
    'Temples/sides: Discuss reducing the observed outward bulk.',
    'Back/nape: Confirm the shape in person because neither image shows it.',
  ],
  barberBrief: {
    observedFacts: [
      'Observed — The CURRENT fringe/front sits higher than the REFERENCE fringe/front.',
      'Observed — The CURRENT top lies flatter than the REFERENCE top.',
      'Observed — The CURRENT temples/sides show more outward bulk than the REFERENCE.',
      'Observed — The back/nape is not visible in either image.',
    ],
    confirmationRequests: [
      'Confirm — Check the back/nape shape in person before making changes.',
      'Confirm — Verify the crown transition because both views are partial.',
    ],
    regionSpecificGuidance: [
      '[Fringe/front] Discuss preserving enough visible length to address the observed difference.',
      '[Top] Confirm the intended lift before changing the CURRENT top.',
      '[Temples/sides] Address the visible excess side bulk relative to the REFERENCE.',
      '[Back/nape] Inspect this zone in person because it is not visible.',
    ],
    industryTerminology: ['Weight distribution', 'Perimeter', 'Silhouette'],
  },
};

let reportCalls = 0;
global.fetch = async (_url, options) => {
  const request = JSON.parse(options.body);
  const system = request.messages[0].content;
  if (request.reasoning_effort !== 'none') throw new Error('Expected GPT-5.6 reasoning_effort none');
  let content;
  if (system.includes('Stage 1 of SnipMatch')) {
    if (request.model !== 'gpt-5.6-sol') throw new Error('Stage 1 must use GPT-5.6 Sol');
    content = features;
  } else if (system.includes('Stage 2 of SnipMatch')) {
    if (request.model !== 'gpt-5.6-luna') throw new Error('Stage 2 must use GPT-5.6 Luna');
    reportCalls += 1;
    content = reportCalls === 1
      ? goodReport
      : { ...goodReport, whatToAskYourBarber: ['Fringe/front: reference-guided comparison', ...goodReport.whatToAskYourBarber.slice(1)] };
  } else {
    if (request.model !== 'gpt-5.6-sol') throw new Error('Reference naming must use GPT-5.6 Sol');
    content = { referenceStyle: { name: 'Textured Crop', confidence: 92 } };
  }
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'req_mock' },
    json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }),
  };
};

const { server } = require('../server.js');

const testImage = `data:image/jpeg;base64,${Buffer.from(`pipeline-contract-${process.pid}`).toString('base64')}`;

async function analyze(disableCache = false) {
  const response = await realFetch('http://localhost:3110/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ currentImage: testImage, referenceImage: testImage, disableCache }),
  });
  return { status: response.status, payload: await response.json() };
}

setTimeout(async () => {
  let exitCode = 0;
  try {
    const valid = await analyze();
    if (valid.status !== 200) throw new Error(`Valid pipeline returned ${valid.status}: ${JSON.stringify(valid.payload)}`);
    if (Object.keys(valid.payload.analysis.spatialZones).length !== 8) throw new Error('Expected eight spatial zones');
    if (valid.payload.meta.model !== 'gpt-5.6-sol' || valid.payload.meta.reportModel !== 'gpt-5.6-luna') throw new Error('Expected GPT-5.6 Sol analysis and GPT-5.6 Luna reporting');
    const cached = await analyze();
    if (cached.status !== 200 || cached.payload.cacheHit.analysis !== true || cached.payload.cacheHit.professionalReport !== true) throw new Error('Expected analysis and report cache hits');
    const originalConsoleError = console.error;
    console.error = () => {};
    let invalid;
    try { invalid = await analyze(true); } finally { console.error = originalConsoleError; }    if (invalid.status !== 500) throw new Error(`Banned filler was not rejected: ${invalid.status}`);
    console.log(JSON.stringify({ validStatus: valid.status, zoneCount: 8, reportFields: Object.keys(valid.payload.staticReport.barberBrief).sort(), cacheHit: cached.payload.cacheHit, bannedFillerStatus: invalid.status }, null, 2));
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    server.close(() => { process.exitCode = exitCode; });
  }
}, 200);




