import Tesseract from "tesseract.js";
import { processReportWithGemini } from "../services/aiService.js";

// OCR function
async function extractTextFromImage(imageBuffer) {
  try {
    console.log("Running Tesseract OCR...");
    const {
      data: { text, confidence },
    } = await Tesseract.recognize(imageBuffer, "eng");

    // throw error for confidence lower than 60
    if (confidence < 60) {
      const err = new Error(
        "Low OCR confidence. Please upload a clearer file/image."
      );
      err.type = "low_confidence"; // flag
      throw err;
    }

    // console.log(data);
    console.log("OCR successful. Extracted text length:", text.length);
    console.log("OCR successful. Confidence:", confidence);
    console.log(text);

    return text;
  } catch (error) {
    console.error("Tesseract OCR Error:", error.message);
    throw error;
  }
}

// --- Guardrail Function ---
function detectHallucinations(rawText, aiOutput) {
  if (!aiOutput?.tests || !Array.isArray(aiOutput.tests)) {
    return { status: "error", reason: "invalid AI output" };
  }

  const textLower = rawText.toLowerCase();
  const foundTests = aiOutput.tests.filter((t) =>
    textLower.includes(t.name.toLowerCase())
  );

  if (foundTests.length !== aiOutput.tests.length) {
    return {
      status: "unprocessed",
      reason: "hallucinated tests not present in input",
    };
  }

  // Check if AI invented ranges
  for (const test of aiOutput.tests) {
    if (
      test.referenceRange &&
      !textLower.includes(test.referenceRange.toLowerCase())
    ) {
      return {
        status: "unprocessed",
        reason: "hallucinated data not present in input",
      };
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
      return res.status(500).json({ status: "error", message: e.message });
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

    // --- Apply Guardrail ---
    const guardrailCheck = detectHallucinations(rawText, finalOutput);
    if (guardrailCheck.status !== "ok") {
      return res.json(guardrailCheck); // Exit early if hallucination found
    }

    res.json(finalOutput);
  } catch (error) {
    console.error("Gemini Processing Error:", error.message);
    res.status(500).json({ status: "error", message: error.message });
  }
}
