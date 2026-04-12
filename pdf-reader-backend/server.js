const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const pdf = require('pdf-parse');
const app = express();
const PORT = 3000;
const historyFilePath = path.join(__dirname, 'history.json');

function loadHistory() {
  if (!fs.existsSync(historyFilePath)) return [];
  try {
    const raw = fs.readFileSync(historyFilePath, 'utf8');
    return JSON.parse(raw) || [];
  } catch (error) {
    console.error('Failed to load history:', error);
    return [];
  }
}

function saveHistory(history) {
  try {
    fs.writeFileSync(historyFilePath, JSON.stringify(history, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save history:', error);
  }
}

// Ensure persistent upload storage directory exists
const uploadsDirectory = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDirectory)) {
  fs.mkdirSync(uploadsDirectory, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// Serve root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Storage setup
const storage = multer.diskStorage({
  destination: uploadsDirectory,
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

function getExtractiveSummary(fullText, maxSentences = 8, maxChars = 900) {
  const stopwords = new Set(["a","about","above","after","again","against","all","am","an","and","any","are","as","at","be","because","been","before","being","below","between","both","but","by","could","did","do","does","doing","down","during","each","few","for","from","further","had","has","have","having","he","her","here","hers","herself","him","himself","his","how","i","if","in","into","is","it","its","itself","just","me","more","most","my","myself","no","nor","not","now","of","off","on","once","only","or","other","our","ours","ourselves","out","over","own","same","she","should","so","some","such","than","that","the","their","theirs","them","themselves","then","there","these","they","this","those","through","to","too","under","until","up","very","was","we","were","what","when","where","which","while","who","whom","why","with","would","you","your","yours","yourself","yourselves"]);

  const clean = fullText.replace(/\r/g, ' ').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  const rawSentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  const excludedPat = /submitted by|submitted to|table of contents|technological institute|college of computer studies|submitted in partial fulfillment|fairshare:/i;
  const sentences = rawSentences
    .map(s => s.trim())
    .filter(s => s.length > 30 && !excludedPat.test(s));
  if (sentences.length === 0) return '';

  const words = clean
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w));

  const freq = words.reduce((acc, w) => { acc[w] = (acc[w] || 0) + 1; return acc; }, {});

  const sentenceScores = sentences.map(sentence => {
    const sentenceWords = sentence
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
    const score = sentenceWords.reduce((sum, w) => sum + (freq[w] || 0), 0);
    return { sentence, score };
  });

  const top = sentenceScores
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .map(item => item.sentence);

  // Keep original order from the text
  const topSet = new Set(top);
  const ordered = sentences.filter(s => topSet.has(s)).slice(0, maxSentences);
  let result = ordered.join(' ').trim();

  if (!result) result = sentences.slice(0, maxSentences).join(' ');
  if (result.length > maxChars) result = result.substring(0, maxChars).trim() + '...';

  return result;
}

function extractTitle(fullText) {
  const lines = fullText
    .replace(/\r/g, '')
    .split(/\n+/)
    .map(l => l.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 20)) {
    const lower = line.toLowerCase();
    if (lower.includes('submitted by') || lower.includes('submitted to') || lower.includes('table of contents')) continue;
    if (lower.length < 8 || lower.length > 120) continue;
    if (lower.split(' ').length > 20) continue;
    if (/[A-Z]{2,}/.test(line) && !/[A-Za-z]/.test(line)) continue;
    if (line.includes('http://') || line.includes('https://')) continue;
    return line;
  }
  return '';
}

function extractSection(fullText, sectionNames, reserveChars = 800) {
  const lines = fullText.replace(/\r/g, '').split(/\n+/).map(l => l.trim());
  const keep = [];
  const lower = sectionNames.map(s => s.toLowerCase());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const normalized = line.toLowerCase();
    if (lower.some(name => normalized.includes(name))) {
      let collected = line;
      for (let j = i + 1; j < lines.length && collected.length < reserveChars; j++) {
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
  const lines = fullText.replace(/\r/g, '').split(/\n+/).map(l => l.trim());
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

// Upload route with text extraction
app.post('/upload', upload.single('pdf'), async (req, res) => {
  try {
    const filePath = req.file.path;
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    
    const fullText = data.text.trim();
    const wordCount = fullText.split(/\s+/).length;

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
      const sentences = fullText.split(/[.!?]+/).filter(s => s.trim().length > 20);
      sentences.sort((a, b) => b.trim().split(/\s+/).length - a.trim().split(/\s+/).length);
      const keySentences = sentences.slice(0, 8).join('. ').trim();
      summary = keySentences;
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
      summary: `${summary} ${summaryStats}`
    });
    saveHistory(history.slice(0, 100));

    res.json({ 
      message: 'PDF uploaded successfully!', 
      file: req.file,
      text: fullText,
      summary: `${summary} ${summaryStats}`
    });
  } catch (error) {
    console.error('PDF processing error:', error);
    res.status(500).json({ error: 'Failed to process PDF' });
  }
});

// History endpoints
app.get('/history', (req, res) => {
  res.json(loadHistory());
});

app.post('/history/clear', (req, res) => {
  saveHistory([]);
  res.json({ status: 'ok' });
});

// Serve PDFs
app.use('/pdfs', express.static('uploads'));

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
