# AI-Powered Medical Report Simplifier

**Problem Statement 7**  
Focus Area: OCR → Test Extraction → Plain-Language Explanation

This project is a backend service that accepts typed or scanned medical reports, extracts medical test values using OCR, normalizes test names and ranges, and produces patient-friendly explanations.  
 

---

## Features
- OCR/Text Extraction: Extracts raw text from uploaded images/PDFs using [Tesseract.js](https://tesseract.projectnaptha.com/).  
- Normalization: Standardizes test names, values, units, ranges, and statuses.  
- Patient-Friendly Summary: Generates simplified explanations without diagnosing.  
- Guardrails: Prevents hallucinated test results.  
- API + UI: REST API endpoints and a minimal HTML UI for testing.  

---

## Project Architecture

