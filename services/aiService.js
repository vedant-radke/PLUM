import { GoogleGenAI } from "@google/genai";
import "dotenv/config";


const medicalReportSchema = {
  type: "object",
  properties: {
    tests: {
      type: "array",
      description: "Normalized medical test results",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Test name" },
          value: { type: "number", description: "Test value" },
          unit: { type: "string", description: "Unit of measurement" },
          status: { type: "string", enum: ["low", "high", "normal"] },
          ref_range: {
            type: "object",
            properties: {
              low: { type: "number" },
              high: { type: "number" },
            },
            required: ["low", "high"],
          },
        },
        required: ["name", "value", "unit", "status", "ref_range"],
      },
    },
    summary: { type: "string" },
    status: { type: "string", enum: ["ok", "unprocessed"] },
  },
  required: ["tests", "summary", "status"],
};



const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/**
 * @param {string} reportText 
 * @returns {Promise<object>} 
 */
export async function processReportWithGemini(reportText) {
  if (!reportText) {
    return { status: "error", reason: "Input text is empty." };
  }


const prompt = `
You are a highly accurate and safety-focused medical report extraction and simplification assistant.
Analyze the following raw text.

INSTRUCTIONS:
1. Correct minor spelling or OCR errors (e.g., 'Hemglobin' to 'Hemoglobin').
2. Extract and normalize ONLY the test names, values, and units that are explicitly present in the input text.
3. **Missing Data Policy:** Only include a test in the final 'tests' array if both the **test name** AND a valid **numeric value** can be clearly and confidently extracted. **OMIT the entry completely** from the 'tests' array if the value is missing, unreadable, or ambiguous. DO NOT use 'null' or '0' for missing values.
4. Provide plausible reference ranges and status (low, high, normal) only for the tests successfully extracted.
5. STRICTLY DO NOT add, infer, or hallucinate any tests not present in the input.
6. Generate a concise, patient-friendly summary explaining only the tests successfully extracted.
7. **Exit Condition:** If after processing, the 'tests' array is empty (meaning no tests could be confidently extracted), respond with the following JSON object ONLY:
    {
      "status": "unprocessed",
      "reason": "No tests or values could be confidently extracted from the input text."
    }
8. If tests were successfully extracted, return output in the JSON schema provided.

RAW MEDICAL REPORT TEXT:
---
${reportText}
---
`;


  try {
    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: medicalReportSchema,
      },
    });

    // console.log(result.text);
  
    
    const responseText = result.text?.trim();
    if (!responseText) {
      return {
        status: "error",
        reason: "No text returned from Gemini.",
      };
    }

    try {
      return JSON.parse(responseText);
    } catch (parseError) {
      console.error(
        "Gemini JSON Parsing Error. Raw Text:",
        responseText.substring(0, 100) + "..."
      );
      return {
        status: "error",
        reason: "Invalid JSON returned by Gemini.",
      };
    }
  } catch (error) {
    console.error("Gemini API Error:", error.message);
    return {
      status: "error",
      reason: `AI processing failed (API Error: ${error.message})`,
    };
  }
}
