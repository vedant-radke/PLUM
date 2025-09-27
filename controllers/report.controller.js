import Tesseract from "tesseract.js";
import { processReportWithGemini } from "../services/aiService.js";
import stringSimilarity from "string-similarity";


async function extractTextFromImage(imageBuffer) {
  try {
    console.log("Running Tesseract OCR...");
    const {
      data: { text, confidence },
    } = await Tesseract.recognize(imageBuffer, "eng");

    // Throw error if confidence too low
    if (confidence < 60) {
      const err = new Error(
        "Low OCR confidence. Please upload a clearer file/image."
      );
      err.type = "low_confidence";
      throw err;
    }

    console.log("OCR successful. Text length:", text.length);
    console.log("OCR confidence:", confidence);
 

    return text;
  } catch (error) {
    console.error("Tesseract OCR Error:", error.message);
    throw error;
  }
}


function detectHallucinations(rawText, aiOutput) {
  if (!aiOutput?.tests || !Array.isArray(aiOutput.tests)) {
    return { status: "error", reason: "invalid AI output" };
  }

  const ocrWords = rawText.toLowerCase().split(/\W+/).filter(word => word.length > 0);
  const ocrText = rawText.toLowerCase();
 

  for (const test of aiOutput.tests) {
    const testName = test.name.toLowerCase();
    console.log("Testing:", testName);

    // Method 1: Check if test name exists in OCR text
    if (ocrText.includes(testName)) {
      console.log(`Found exact match for: ${testName}`);
      continue;
    }

    // Method 2: check if all words in test name exist in OCR
    const testWords = testName.split(/\s+/).filter(word => word.length > 0);
    const allWordsFound = testWords.every(testWord => {
      // exact match
      if (ocrWords.includes(testWord)) {
        return true;
      }
      
      // fuzzy match 
      const { bestMatch } = stringSimilarity.findBestMatch(testWord, ocrWords);
      return bestMatch.rating >= 0.4; 
    });

    if (allWordsFound) {
      console.log(`All words found for: ${testName}`);
      continue;
    }
    

    // If no word matched -> hallucination
    console.log(`No match found for: ${testName}`);
    return {
      status: "unprocessed",
      reason: `hallucinated test or OCR too inaccurate: ${test.name}`,
    }
  }

  return { status: "ok" };
} 

export async function simplifyReport(req, res) {
  let rawText = "";

  const file =
    req.files && req.files["report_file"] ? req.files["report_file"][0] : null;

  if (file) {
    try {
      rawText = await extractTextFromImage(file.buffer);
      console.log("Source: File via OCR.");
    } catch (e) {
      if (e.type === "low_confidence") {
        return res.status(400).json({
          status: "error",
          message: e.message,
        });
      }
      return res.status(500).json({
        status: "error",
        message: e.message,
      });
    }
  } else if (req.body.report_text) {
    rawText = req.body.report_text;
    console.log("Source: Raw Text (form-data field).");
  } else {
    return res.status(400).json({
      status: "error",
      message:
        "Missing input. Please upload a file (key: 'report_file') or provide text (key: 'report_text').",
    });
  }

  if (!rawText.trim()) {
    return res.status(400).json({
      status: "error",
      message: "Extracted text was empty or invalid.",
    });
  }

  console.log("Sending raw text to Gemini for processing...");

  try {
    const finalOutput = await processReportWithGemini(rawText);

    if (finalOutput.status === "error") {
      return res.status(500).json(finalOutput);
    }

    // --- Guardrail Check ---
    const guardrailCheck = detectHallucinations(rawText, finalOutput);
    if (guardrailCheck.status !== "ok") {
      return res.json(guardrailCheck);
    }

    res.json(finalOutput);
  } catch (error) {
    console.error("Gemini Processing Error:", error.message);
    res.status(500).json({ status: "error", message: error.message });
  }
}
