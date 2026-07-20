const yourPhoto = document.getElementById('yourPhoto');
const inspirationPhoto = document.getElementById('inspirationPhoto');
const yourPreview = document.getElementById('yourPreview');
const inspirationPreview = document.getElementById('inspirationPreview');
const analyzeBtn = document.getElementById('analyzeBtn');
const results = document.getElementById('results');
const priorityPanel = document.getElementById('priorityPanel');
const priorityTotal = document.getElementById('priorityTotal');
const priorityError = document.getElementById('priorityError');
const scoreText = document.getElementById('scoreText');
const scoreTier = document.getElementById('scoreTier');
const scoreTierSub = document.getElementById('scoreTierSub');
const overallMatchRate = document.getElementById('overallMatchRate');
const priorityRanking = document.getElementById('priorityRanking');
const referenceStyle = document.getElementById('referenceStyle');
const referenceStyleCaption = document.getElementById('referenceStyleCaption');
const barberRequests = document.getElementById('barberRequests');
const dimensionRows = document.getElementById('dimensionRows');
const pdfBtn = document.getElementById('pdfBtn');
const resetBtn = document.getElementById('resetBtn');
const toast = document.getElementById('toast');
const nonNegotiableInput = document.getElementById('nonNegotiable');
const nonNegotiableReport = document.getElementById('nonNegotiableReport');
const nonNegotiableRequest = document.getElementById('nonNegotiableRequest');
const nonNegotiableInstruction = document.getElementById('nonNegotiableInstruction');
const nonNegotiableConsultation = document.getElementById('nonNegotiableConsultation');
const nonNegotiableNote = document.getElementById('nonNegotiableNote');
const weightInputs = [...document.querySelectorAll('[data-dimension]')];
const weightOutputs = Object.fromEntries(weightInputs.map((input) => [input.dataset.dimension, document.getElementById(`${input.dataset.dimension}Weight`)]));
const dimensions = [
  { key: 'volume', name: 'Volume Match' },
  { key: 'length', name: 'Length Match' },
  { key: 'texture', name: 'Texture Match' },
  { key: 'silhouette', name: 'Silhouette Match' },
];
const spatialZoneKeys = ['fringe_front', 'top', 'crown', 'temples_sides', 'around_ears', 'back_nape', 'perimeter', 'top_to_side_transition'];
const weightStorageKey = 'snipmatch-analysis-weights';
const normalizedMaxEdge = 1280;
const normalizedJpegQuality = 0.86;

let currentReport = null;
let nonNegotiable = '';

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 3200);
}

function setPreview(input, image) {
  const file = input.files?.[0];
  if (!file) return;
  image.src = URL.createObjectURL(file);
  image.hidden = false;
  input.closest('.upload-card').classList.add('has-file');
}

async function decodeOrientedImage(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      return createImageBitmap(file);
    }
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unable to decode image.'));
    };
    image.src = url;
  });
}

async function normalizeImage(file) {
  const source = await decodeOrientedImage(file);
  const sourceWidth = source.width || source.naturalWidth;
  const sourceHeight = source.height || source.naturalHeight;
  const scale = Math.min(1, normalizedMaxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
  if (typeof source.close === 'function') source.close();
  return canvas.toDataURL('image/jpeg', normalizedJpegQuality);
}

function photosReady() {
  return Boolean(yourPhoto.files?.[0] && inspirationPhoto.files?.[0]);
}

function totalWeight() {
  return weightInputs.reduce((total, input) => total + Number(input.value), 0);
}

function currentWeights() {
  return Object.fromEntries(weightInputs.map((input) => [input.dataset.dimension, Number(input.value)]));
}

function persistWeights() {
  sessionStorage.setItem(weightStorageKey, JSON.stringify(currentWeights()));
}

function restoreWeights() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(weightStorageKey));
    if (!saved) return;
    weightInputs.forEach((input) => {
      if (Number.isFinite(saved[input.dataset.dimension])) input.value = saved[input.dataset.dimension];
    });
  } catch {
    sessionStorage.removeItem(weightStorageKey);
  }
}

function updateAnalysisAvailability() {
  const total = totalWeight();
  const ready = photosReady();
  const valid = total === 100;
  priorityPanel.classList.toggle('hidden', !ready);
  priorityTotal.textContent = `Total priority: ${total}%`;
  priorityError.classList.toggle('hidden', !ready || valid);
  analyzeBtn.disabled = !ready || !valid;
}

function getDimensionScore(key) {
  return currentReport?.analysis?.[key]?.score || 0;
}

function calculateWeightedMatch() {
  if (!currentReport) return 0;
  const weights = currentWeights();
  const denominator = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  if (!denominator) return 0;
  const numerator = dimensions.reduce((sum, dimension) => sum + getDimensionScore(dimension.key) * weights[dimension.key], 0);
  return Math.round(numerator / denominator);
}

function getMatchTier(score) {
  if (score >= 85) return { label: 'Spot-On Match', sub: 'Your CURRENT uploaded haircut is nearly identical to the reference.' };
  if (score >= 65) return { label: 'Close Match', sub: 'Minor tweaks will get you there.' };
  if (score >= 40) return { label: 'Moderate Gap', sub: 'Some dimensions need work to reach the reference.' };
  return { label: 'Major Transformation', sub: 'Significant changes needed to match the reference.' };
}

function updatePriorityRanking() {
  const ranking = dimensions
    .map((dimension) => ({ name: dimension.name.replace(' Match', ''), weight: Number(weightInputs.find((input) => input.dataset.dimension === dimension.key).value) }))
    .sort((left, right) => right.weight - left.weight || left.name.localeCompare(right.name));
  priorityRanking.textContent = `Priority ranking: ${ranking.map((item) => `${item.name} ${item.weight}%`).join(' · ')}`;
}

function updateWeightedScore() {
  weightInputs.forEach((input) => {
    weightOutputs[input.dataset.dimension].textContent = `${input.value}%`;
  });
  updateAnalysisAvailability();
  updatePriorityRanking();
  if (!currentReport) return;

  const matchRate = calculateWeightedMatch();
  scoreText.textContent = `${matchRate}%`;
  overallMatchRate.textContent = `${matchRate}%`;
  const tier = getMatchTier(matchRate);
  scoreTier.textContent = tier.label;
  scoreTierSub.textContent = tier.sub;
  const isModerateGap = matchRate >= 40 && matchRate <= 64;
  scoreTier.classList.toggle('moderate-gap-emphasis', isModerateGap);
  scoreTierSub.classList.toggle('moderate-gap-emphasis', isModerateGap);
}

function renderDimensionAnalysis(analysis) {
  dimensionRows.replaceChildren();
  dimensions.forEach(({ key, name }) => {
    const dimension = analysis[key];
    const row = document.createElement('tr');
    const label = document.createElement('th');
    const score = document.createElement('td');
    const detail = document.createElement('td');
    const evidence = document.createElement('p');
    const confidence = document.createElement('small');
    const observations = document.createElement('ul');

    label.scope = 'row';
    label.textContent = name;
    score.textContent = `${dimension.score}%`;
    evidence.textContent = dimension.evidence;
    confidence.textContent = `Confidence: ${dimension.confidence}%`;
    dimension.observations.forEach((observation) => {
      const item = document.createElement('li');
      item.textContent = observation;
      observations.appendChild(item);
    });
    detail.append(evidence, confidence, observations);
    row.append(label, score, detail);
    dimensionRows.appendChild(row);
  });
}

function isValidNonNegotiable(value) {
  return value == null || (
    typeof value.clientRequest === 'string'
    && value.clientRequest.length <= 200
    && typeof value.barberInstruction === 'string'
    && value.barberInstruction.trim()
    && (value.consultationNote === null || typeof value.consultationNote === 'string')
  );
}
function isCompleteHairReport(report) {
  const analysis = report?.analysis;
  const staticReport = report?.staticReport;
  return dimensions.every(({ key }) => {
    const dimension = analysis?.[key];
    return Number.isInteger(dimension?.score)
      && Number.isInteger(dimension?.confidence)
      && typeof dimension?.evidence === 'string'
      && Array.isArray(dimension?.observations);
  })
    && typeof report?.referenceStyle?.name === 'string'
    && Number.isInteger(report?.referenceStyle?.confidence)
    && report.referenceStyle.confidence >= 0
    && report.referenceStyle.confidence <= 100
    && spatialZoneKeys.every((key) => {
      const zone = analysis?.spatialZones?.[key];
      return ['clear', 'partial', 'not_visible'].includes(zone?.currentVisibility)
        && ['clear', 'partial', 'not_visible'].includes(zone?.referenceVisibility)
        && (zone.currentObservation === null || typeof zone.currentObservation === 'string')
        && (zone.referenceObservation === null || typeof zone.referenceObservation === 'string')
        && (zone.comparison === null || typeof zone.comparison === 'string');
    })
    && Array.isArray(staticReport?.whatToAskYourBarber)
    && Array.isArray(staticReport?.barberBrief?.observedFacts)
    && Array.isArray(staticReport.barberBrief.confirmationRequests)
    && Array.isArray(staticReport.barberBrief.regionSpecificGuidance)
    && Array.isArray(staticReport.barberBrief.industryTerminology)
    && isValidNonNegotiable(report.nonNegotiable);
}

function renderNonNegotiable(value) {
  const visible = Boolean(value);
  nonNegotiableReport.classList.toggle('hidden', !visible);
  if (!visible) {
    nonNegotiableRequest.textContent = '';
    nonNegotiableInstruction.textContent = '';
    nonNegotiableNote.textContent = '';
    nonNegotiableConsultation.classList.add('hidden');
    return;
  }

  nonNegotiableRequest.textContent = value.clientRequest;
  nonNegotiableInstruction.textContent = value.barberInstruction;
  nonNegotiableNote.textContent = value.consultationNote || '';
  nonNegotiableConsultation.classList.toggle('hidden', !value.consultationNote);
}
function applyHairReport(report) {
  currentReport = report;
  renderNonNegotiable(report.nonNegotiable);
  referenceStyle.textContent = report.referenceStyle.confidence >= 80 ? report.referenceStyle.name : 'Custom Reference';
  referenceStyleCaption.textContent = 'AI-estimated style name';
  barberRequests.replaceChildren();
  report.staticReport.whatToAskYourBarber.forEach((request) => {
    const item = document.createElement('li');
    item.textContent = request;
    barberRequests.appendChild(item);
  });
  renderDimensionAnalysis(report.analysis);
  updateWeightedScore();
}

function pdfLine(doc, text, x, y, width, options = {}) {
  doc.setFont('courier', options.bold ? 'bold' : 'normal');
  doc.setFontSize(options.size || 9);
  const lines = doc.splitTextToSize(String(text), width);
  doc.text(lines, x, y);
  return y + lines.length * (options.leading || 5);
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('AI processing failed. Please check server logs for details.');
  }
  if (!response.ok) throw new Error(body?.error || 'AI processing failed. Please check server logs for details.');
  return body;
}
function downloadBrief() {
  if (!currentReport || !window.jspdf?.jsPDF) {
    notify('Your report is not ready for export yet.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = 18;
  const nextPage = (required = 15) => {
    if (y + required <= 279) return;
    doc.addPage();
    y = 18;
  };

  doc.setFont('courier', 'bold'); doc.setFontSize(18); doc.text('SNIPMATCH BARBER BRIEF', margin, y); y += 7;
  doc.setFont('courier', 'normal'); doc.setFontSize(9); doc.text(`DATE: ${new Date().toLocaleDateString()}`, margin, y); y += 8;
  doc.setDrawColor(0); doc.line(margin, y, pageWidth - margin, y); y += 10;

  const nonNegotiableOverlay = currentReport.nonNegotiable;
  if (nonNegotiableOverlay) {
    const requestLines = doc.splitTextToSize(`CLIENT'S REQUEST: "${nonNegotiableOverlay.clientRequest}"`, contentWidth - 12);
    const instructionLines = doc.splitTextToSize(`BARBER'S INSTRUCTION: "${nonNegotiableOverlay.barberInstruction}"`, contentWidth - 12);
    const noteLines = nonNegotiableOverlay.consultationNote
      ? doc.splitTextToSize(`CONSULTATION NOTE: ${nonNegotiableOverlay.consultationNote}`, contentWidth - 12)
      : [];
    const boxHeight = 15 + (requestLines.length + instructionLines.length + noteLines.length) * 5 + (noteLines.length ? 4 : 0);
    doc.setDrawColor(174, 45, 39);
    doc.setFillColor(255, 240, 239);
    doc.rect(margin, y, contentWidth, boxHeight, 'FD');
    let boxY = y + 7;
    doc.setTextColor(150, 38, 33);
    doc.setFont('courier', 'bold');
    doc.setFontSize(10);
    doc.text('CLIENT NON-NEGOTIABLE — CONFIRM BEFORE CUTTING', margin + 6, boxY);
    boxY += 7;
    doc.setTextColor(28, 32, 27);
    doc.setFontSize(9);
    doc.text(requestLines, margin + 6, boxY);
    boxY += requestLines.length * 5;
    doc.text(instructionLines, margin + 6, boxY);
    boxY += instructionLines.length * 5;
    if (noteLines.length) {
      boxY += 4;
      doc.setTextColor(150, 38, 33);
      doc.text(noteLines, margin + 6, boxY);
    }
    doc.setTextColor(28, 32, 27);
    y += boxHeight + 9;
  }

  const brief = currentReport.staticReport.barberBrief;
  const pdfSection = (title, items, options = {}) => {
    y += options.gap || 4;
    nextPage(22);
    doc.setFont('courier', 'bold');
    doc.setFontSize(11);
    doc.text(title, margin, y);
    y += 8;
    items.forEach((item, index) => {
      nextPage(14);
      const prefix = options.numbered ? `${index + 1}. ` : '• ';
      y = pdfLine(doc, `${prefix}${item}`, margin, y, contentWidth, { bold: options.bold, size: 9 });
      y += 2;
    });
  };

  pdfSection('OBSERVED FACTS', brief.observedFacts, { numbered: true });
  pdfSection('BARBER CONFIRMATION REQUESTS', brief.confirmationRequests, { numbered: true });
  pdfSection('REGION-SPECIFIC GUIDANCE', brief.regionSpecificGuidance, { numbered: true });
  pdfSection('SUPPORTED TERMINOLOGY', brief.industryTerminology, { bold: true });
  doc.setFont('courier', 'normal'); doc.setFontSize(8); doc.text('Generated by SnipMatch. Present this to your barber.', margin, 289);
  doc.save('SnipMatch-Barber-Brief.pdf');
}

function resetSession() {
  currentReport = null;
  sessionStorage.removeItem(weightStorageKey);
  yourPhoto.value = '';
  inspirationPhoto.value = '';
  nonNegotiable = '';
  nonNegotiableInput.value = '';
  renderNonNegotiable(null);
  [yourPreview, inspirationPreview].forEach((image) => { image.removeAttribute('src'); image.hidden = true; });
  document.querySelectorAll('.upload-card').forEach((card) => card.classList.remove('has-file'));
  weightInputs.forEach((input) => { input.value = 25; });
  scoreText.textContent = '--';
  overallMatchRate.textContent = '--';
  scoreTier.textContent = 'Awaiting analysis';
  scoreTierSub.textContent = 'Your match details will appear here.';
  referenceStyle.textContent = 'Waiting for analysis';
  referenceStyleCaption.textContent = 'AI-estimated style name';
  barberRequests.replaceChildren();
  const item = document.createElement('li');
  item.textContent = 'Your barber-ready requests will appear here.';
  barberRequests.appendChild(item);
  dimensionRows.innerHTML = '<tr><td colspan="3">Your analysis will appear here.</td></tr>';
  results.classList.add('hidden');
  updateWeightedScore();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

nonNegotiableInput.addEventListener('input', () => { nonNegotiable = nonNegotiableInput.value; });
yourPhoto.addEventListener('change', () => { setPreview(yourPhoto, yourPreview); updateAnalysisAvailability(); });
inspirationPhoto.addEventListener('change', () => { setPreview(inspirationPhoto, inspirationPreview); updateAnalysisAvailability(); });
weightInputs.forEach((input) => input.addEventListener('input', () => { persistWeights(); updateWeightedScore(); }));
pdfBtn.addEventListener('click', downloadBrief);
resetBtn.addEventListener('click', resetSession);
restoreWeights();
updateWeightedScore();

analyzeBtn.addEventListener('click', async () => {
  const currentFile = yourPhoto.files?.[0];
  const referenceFile = inspirationPhoto.files?.[0];
  if (!currentFile || !referenceFile || totalWeight() !== 100) {
    updateAnalysisAvailability();
    return;
  }

  const originalLabel = analyzeBtn.textContent;
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = 'NORMALIZING & ANALYZING...';
  try {
    const [currentImage, referenceImage] = await Promise.all([normalizeImage(currentFile), normalizeImage(referenceFile)]);
    const submittedNonNegotiable = nonNegotiable;
    const analysisRequest = postJson('/api/analyze', { currentImage, referenceImage });
    const overlayRequest = submittedNonNegotiable.trim()
      ? postJson('/api/generate-report', { nonNegotiable: submittedNonNegotiable, referenceImage })
      : Promise.resolve({ nonNegotiable: null });
    const [report, overlay] = await Promise.all([analysisRequest, overlayRequest]);
    report.nonNegotiable = overlay.nonNegotiable;
    if (!isCompleteHairReport(report)) {
      console.error('[report] Invalid response shape:', report);
      throw new Error('AI processing failed. Please check server logs for details.');
    }
    applyHairReport(report);
    results.classList.remove('hidden');
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    console.error('[analysis] Failed:', error);
    notify(error.message || 'AI processing failed. Please check server logs for details.');
  } finally {
    analyzeBtn.textContent = originalLabel;
    updateAnalysisAvailability();
  }
});






