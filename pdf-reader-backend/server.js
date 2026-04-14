const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const pdf = require('pdf-parse');

const app = express();
const PORT = process.env.PORT || 3000;
const historyFilePath = path.join(__dirname, 'history.json');
const uploadsDirectory = path.join(__dirname, 'uploads');

function normalizeDocumentRecord(item = {}) {
  return {
    timestamp: item.timestamp || new Date().toISOString(),
    originalName: item.originalName || 'Untitled PDF',
    storedName: item.storedName || '',
    category: item.category || 'Uncategorized',
    summary: item.summary || '',
    annotation: item.annotation || '',
    fullText: item.fullText || ''
  };
}

function loadHistory() {
  if (!fs.existsSync(historyFilePath)) return [];
  try {
    const raw = fs.readFileSync(historyFilePath, 'utf8');
    const parsed = JSON.parse(raw) || [];
    return parsed.map(normalizeDocumentRecord);
  } catch (error) {
    console.error('Failed to load history:', error);
    return [];
  }
}

function saveHistory(history) {
  try {
    const normalized = history.map(normalizeDocumentRecord);
    fs.writeFileSync(historyFilePath, JSON.stringify(normalized, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save history:', error);
  }
}

if (!fs.existsSync(uploadsDirectory)) {
  fs.mkdirSync(uploadsDirectory, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

const storage = multer.diskStorage({
  destination: uploadsDirectory,
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

function findDocumentIndex(history, storedName) {
  return history.findIndex(item => item.storedName === storedName);
}

function buildDocumentResponse(item) {
  const normalized = normalizeDocumentRecord(item);
  return {
    timestamp: normalized.timestamp,
    originalName: normalized.originalName,
    storedName: normalized.storedName,
    category: normalized.category,
    summary: normalized.summary,
    annotation: normalized.annotation
  };
}

function getExtractiveSummary(fullText, maxSentences = 8, maxChars = 900) {
  const stopwords = new Set(['a','about','above','after','again','against','all','am','an','and','any','are','as','at','be','because','been','before','being','below','between','both','but','by','could','did','do','does','doing','down','during','each','few','for','from','further','had','has','have','having','he','her','here','hers','herself','him','himself','his','how','i','if','in','into','is','it','its','itself','just','me','more','most','my','myself','no','nor','not','now','of','off','on','once','only','or','other','our','ours','ourselves','out','over','own','same','she','should','so','some','such','than','that','the','their','theirs','them','themselves','then','there','these','they','this','those','through','to','too','under','until','up','very','was','we','were','what','when','where','which','while','who','whom','why','with','would','you','your','yours','yourself','yourselves']);

  const clean = fullText.replace(/\r/g, ' ').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  const rawSentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  const excludedPat = /submitted by|submitted to|table of contents|technological institute|college of computer studies|submitted in partial fulfillment|fairshare:/i;
  const sentences = rawSentences
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length > 30 && !excludedPat.test(sentence));

  if (sentences.length === 0) return '';

  const words = clean
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopwords.has(word));

  const freq = words.reduce((acc, word) => {
    acc[word] = (acc[word] || 0) + 1;
    return acc;
  }, {});

  const sentenceScores = sentences.map(sentence => {
    const sentenceWords = sentence
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);

    const score = sentenceWords.reduce((sum, word) => sum + (freq[word] || 0), 0);
    return { sentence, score };
  });

  const top = sentenceScores
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .map(item => item.sentence);

  const topSet = new Set(top);
  const ordered = sentences.filter(sentence => topSet.has(sentence)).slice(0, maxSentences);
  let result = ordered.join(' ').trim();

  if (!result) result = sentences.slice(0, maxSentences).join(' ');
  if (result.length > maxChars) result = result.substring(0, maxChars).trim() + '...';

  return result;
}

function extractTitle(fullText) {
  const lines = fullText
    .replace(/\r/g, '')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 20)) {
    const lower = line.toLowerCase();
    if (lower.includes('submitted by') || lower.includes('submitted to') || lower.includes('table of contents')) continue;
    if (lower.length < 8 || lower.length > 120) continue;
    if (line.split(' ').length > 20) continue;
    if (/[A-Z]{2,}/.test(line) && !/[A-Za-z]/.test(line)) continue;
    if (line.includes('http://') || line.includes('https://')) continue;
    return line;
  }

  return '';
}

function extractSection(fullText, sectionNames, reserveChars = 800) {
  const lines = fullText.replace(/\r/g, '').split(/\n+/).map(line => line.trim());
  const keep = [];
  const lower = sectionNames.map(section => section.toLowerCase());

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;

    const normalized = line.toLowerCase();
    if (lower.some(name => normalized.includes(name))) {
      let collected = line;
      for (let j = i + 1; j < lines.length && collected.length < reserveChars; j += 1) {
        const next = lines[j];
        if (!next) break;
        if (/^(table of contents|references?|bibliography|acknowledg)/i.test(next)) break;
        collected += ' ' + next;
      }
      keep.push(collected);
      if (keep.join(' ').length >= reserveChars) break;
    }
  }

  const text = keep.join(' ');
  return text ? (text.length > reserveChars ? text.slice(0, reserveChars).trim() + '...' : text) : '';
}

function extractProblemObjectives(fullText) {
  const lines = fullText.replace(/\r/g, '').split(/\n+/).map(line => line.trim());
  const found = [];

  for (const line of lines) {
    if (/\b(problem|objective|goal|need)\b/i.test(line) && line.length > 30) {
      if (/table of contents|[0-9]+\./i.test(line)) continue;
      found.push(line);
      if (found.length >= 8) break;
    }
  }

  return found.join(' ');
}

app.post('/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file was uploaded.' });
    }

    const filePath = req.file.path;
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    const category = (req.body.category || 'Uncategorized').trim() || 'Uncategorized';

    const fullText = data.text.trim();
    const wordCount = fullText ? fullText.split(/\s+/).length : 0;

    const title = extractTitle(fullText);
    let summary = getExtractiveSummary(fullText, 8, 900);

    if (!summary) {
      summary = extractSection(fullText, ['Introduction', 'Problem Statement', 'Needs/Problems', 'Goals/Objectives', 'Objectives']);
    }

    if (!summary) {
      const problemObjectives = extractProblemObjectives(fullText);
      if (problemObjectives) {
        summary = problemObjectives;
      }
    }

    if (!summary) {
      const sentences = fullText.split(/[.!?]+/).filter(sentence => sentence.trim().length > 20);
      sentences.sort((a, b) => b.trim().split(/\s+/).length - a.trim().split(/\s+/).length);
      summary = sentences.slice(0, 8).join('. ').trim();
    }

    if (!summary) {
      summary = 'No summary could be generated.';
    }

    if (title) {
      summary = `${title}. ${summary}`;
    }

    if (summary.length > 900) summary = summary.substring(0, 900).trim() + '...';

    const summaryStats = `(Full: ${wordCount} words | Sample section length: ${summary.split(/\s+/).length} words)`;
    const history = loadHistory();

    history.unshift({
      timestamp: new Date().toISOString(),
      originalName: req.file.originalname,
      storedName: req.file.filename,
      category,
      summary: `${summary} ${summaryStats}`,
      annotation: '',
      fullText
    });

    saveHistory(history.slice(0, 100));

    return res.json({
      message: 'PDF uploaded successfully!',
      file: {
        ...req.file,
        category
      },
      text: fullText,
      summary: `${summary} ${summaryStats}`,
      category
    });
  } catch (error) {
    console.error('PDF processing error:', error);
    return res.status(500).json({ error: 'Failed to process PDF' });
  }
});

app.get('/documents', (req, res) => {
  const query = (req.query.q || '').toString().trim().toLowerCase();
  const category = (req.query.category || '').toString().trim().toLowerCase();

  const documents = loadHistory().filter(item => {
    const matchesCategory = !category || category === 'all' || item.category.toLowerCase() === category;
    const haystack = [
      item.originalName,
      item.category,
      item.summary,
      item.annotation,
      item.fullText
    ].join(' ').toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    return matchesCategory && matchesQuery;
  });

  return res.json(documents.map(buildDocumentResponse));
});

app.get('/documents/:storedName', (req, res) => {
  const history = loadHistory();
  const item = history.find(entry => entry.storedName === req.params.storedName);

  if (!item) {
    return res.status(404).json({ error: 'Document not found' });
  }

  return res.json(buildDocumentResponse(item));
});

app.post('/documents/:storedName/annotation', (req, res) => {
  const annotation = (req.body.annotation || '').toString().trim();
  const history = loadHistory();
  const index = findDocumentIndex(history, req.params.storedName);

  if (index === -1) {
    return res.status(404).json({ error: 'Document not found' });
  }

  history[index].annotation = annotation;
  saveHistory(history);

  return res.json({
    message: 'Annotation saved successfully.',
    document: buildDocumentResponse(history[index])
  });
});

app.get('/history', (req, res) => {
  res.json(loadHistory().map(buildDocumentResponse));
});

app.post('/history/clear', (req, res) => {
  saveHistory([]);
  res.json({ status: 'ok' });
});

app.use('/pdfs', express.static(uploadsDirectory));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
