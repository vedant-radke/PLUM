import express from "express";
import multer from "multer";
import Tesseract from "tesseract.js";
import { processReportWithGemini } from "../services/aiService.js";

const router = express.Router();

// Multer Config
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

async function extractTextFromImage(imageBuffer) {
  try {
    console.log("Running Tesseract OCR...");
    const {
      data: { text, confidence },
    } = await Tesseract.recognize(imageBuffer, "eng");
    console.log("OCR successful. Extracted text length:", text.length);
    console.log("OCR successful. Confidence:", confidence);
    // console.log("OCR output -----------------------------------",text);

    return text;
  } catch (error) {
    console.error("Tesseract OCR Error:", error.message);
    throw new Error("Failed to extract text from the image file.");
  }
}

router.post(
  "/simplify-report",
  upload.fields([
    { name: "report_file", maxCount: 1 },
    { name: "report_text", maxCount: 1 },
  ]),
  async (req, res) => {
    let rawText = "";

    const file =
      req.files && req.files["report_file"]
        ? req.files["report_file"][0]
        : null;

    if (file) {
      try {
        rawText = await extractTextFromImage(file.buffer);
        console.log("Source: File via OCR.");
      } catch (e) {
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
      return res
        .status(400)
        .json({
          status: "error",
          message: "Extracted text was empty or invalid.",
        });
    }

    console.log("Sending raw text to Gemini for processing...");

    const finalOutput = await processReportWithGemini(rawText);
    if (finalOutput.status === "error") {
      return res.status(500).json(finalOutput);
    }

    res.json(finalOutput);
  }
);

export default router;
