# Project TODO

## Current Status
- Basic upload, summary extraction, and PDF preview are working
- Frontend is served from `index.html`
- Backend upload and parsing flow is working through `/upload`

## Next Tasks
1. Replace the iframe preview with a PDF.js viewer
2. Add a `/files` endpoint and show uploaded PDFs in the UI
3. Add delete support for uploaded files
4. Add search and highlight for extracted text or summary content
5. Improve mobile responsiveness for the preview area
6. Add a dark mode toggle with saved preference
7. Add validation and clearer error states for failed uploads

## Suggested Priority
1. PDF.js viewer
2. File list and delete flow
3. Search in extracted text
4. Mobile polish

## Run Reminder
- Start the backend from `pdf-reader-backend` with `npm start`
- Open `http://localhost:3000`
