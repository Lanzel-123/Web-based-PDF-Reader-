# Web-based PDF Reader

## Overview
This project is a simple full-stack PDF reader built with a static frontend and a Node.js/Express backend. Users can upload a PDF, extract its text, generate a lightweight summary, and preview the uploaded file in the browser.

## Features
- Drag-and-drop PDF upload
- PDF text extraction with `pdf-parse`
- Automatic summary generation from key sentences
- In-browser PDF preview
- Responsive card-based layout
- Upload progress bar

## Project Structure
```text
.
|-- index.html
|-- README.md
|-- TODO.md
|-- uploads/
`-- pdf-reader-backend/
    |-- package.json
    |-- package-lock.json
    |-- server.js
    |-- uploads/
    `-- node_modules/
```

## How It Works

### Frontend
The frontend lives in `index.html` and is served by the backend from the project root.

It provides:
- A drag-and-drop upload area
- A hidden file input for manual file selection
- A progress bar during upload
- A summary panel for extracted text highlights
- An iframe-based PDF preview

### Backend
The backend lives in `pdf-reader-backend/server.js`.

It handles:
- Serving the frontend from the project root
- Accepting PDF uploads with `multer`
- Reading uploaded files from disk
- Extracting PDF text with `pdf-parse`
- Building a short summary from the longest sentences
- Returning JSON for the frontend
- Serving uploaded PDFs through `/pdfs`

## API

### `GET /`
Serves `index.html`.

### `POST /upload`
Accepts one uploaded PDF under the `pdf` form field.

Response shape:
```json
{
  "message": "PDF uploaded successfully!",
  "file": {},
  "text": "full extracted text",
  "summary": "generated summary"
}
```

### `GET /pdfs/:filename`
Serves uploaded PDF files for browser preview.

## Dependencies

### Runtime
- `express` for the HTTP server
- `multer` for file uploads
- `cors` for cross-origin requests
- `pdf-parse` for text extraction
- `helmet` for basic security headers
- `dotenv` for environment variable support

### Development
- `nodemon` for local development

## Setup
1. Open a terminal in `pdf-reader-backend`
2. Run `npm install`
3. Run `npm start`
4. Open `http://localhost:3000`

## Notes
- The backend currently runs on port `3000`
- Uploaded files are stored in `pdf-reader-backend/uploads/`
- The summary logic is heuristic-based and not AI-generated

## Next Improvements
- Replace the iframe preview with a PDF.js viewer
- Add a file history list with delete support
- Add search and highlight for extracted text
- Improve mobile layout and accessibility
