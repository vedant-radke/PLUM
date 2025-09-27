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
          name: { 
            type: "string", 
            description: "Test name (required)" 
          },
          value: { 
            oneOf: [
              { type: "number", description: "Numeric test value" },
              { type: "string", enum: ["NA"], description: "Missing or unreadable value" }
            ]
          },
          unit: { 
            oneOf: [
              { type: "string", description: "Unit of measurement" },
              { type: "string", enum: ["NA"], description: "Missing or invalid unit" }
            ]
          },
          status: { 
            oneOf: [
              { type: "string", enum: ["low", "high", "normal"] },
              { type: "string", enum: ["NA"], description: "Missing or undetermined status" }
            ]
          },
          ref_range: {
            oneOf: [
              {
                type: "object",
                properties: {
                  low: { type: "number" },
                  high: { type: "number" },
                },
                required: ["low", "high"],
              },
              { 
                type: "string", 
                enum: ["NA"], 
                description: "Missing or unavailable reference range" 
              }
            ]
          },
        },
        required: ["name", "value", "unit", "status", "ref_range"],
      },
    },
    summary: { 
      type: "string",
      description: "Patient-friendly summary of extracted tests"
    },
    status: { 
      type: "string", 
      enum: ["ok", "unprocessed"],
      description: "Processing status"
    },
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
Analyze the following raw text and extract medical test information.

STRICT INSTRUCTIONS:
1. Correct minor spelling or OCR errors (e.g., 'Hemglobin' to 'Hemoglobin').
2. Extract and normalize ONLY the test names, values, and units that are explicitly present in the input text.

3. MISSING VALUE POLICY: 
   - Only include a test if the test name can be clearly identified
   - For ANY missing, unreadable, or ambiguous data, use exactly "NA" (not null, not 0, not empty string)
   - Missing numeric value → set "value": "NA"
   - Missing unit → set "unit": "NA" 
   - Missing reference range → set "ref_range": "NA"

4. UNIT VALIDATION POLICY: 
   - If a unit is clearly invalid for the test (e.g., Hemoglobin in 'ohm' or 'inches'), set "unit": "NA"
   - If this makes the test medically nonsensical, trigger the exit condition below

5. DO NOT add, infer, or hallucinate any tests not present in the input text.

6. Generate a concise, patient-friendly summary explaining the successfully extracted tests.
7. based on range mark status as normal, high, low

GLOBAL EXIT CONDITION: If you encounter units that are so invalid they make the medical data dangerous or nonsensical, respond with ONLY this JSON:
{
  "status": "unprocessed",
  "reason": "invalid unit for test"
}

OTHERWISE, return the extracted data following the schema exactly, using "NA" for any missing information.

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

    console.log("Raw Gemini Response:", result.text);
  
    const responseText = result.text?.trim();
    if (!responseText) {
      return {
        status: "error",
        reason: "No text returned from Gemini.",
      };
    }

    try {
      const parsedResponse = JSON.parse(responseText);
   
      if (!parsedResponse.status) {
        return {
          status: "error",
          reason: "Invalid response: missing status field.",
        };
      }


      if (parsedResponse.status === "unprocessed") {
        return parsedResponse;
      }

      if (parsedResponse.status === "ok") {
        if (!parsedResponse.tests || !Array.isArray(parsedResponse.tests)) {
          return {
            status: "error",
            reason: "Invalid response: tests array missing or invalid.",
          };
        }

      }
      
      return parsedResponse;
      
    } catch (parseError) {
      console.error(
        "Gemini JSON Parsing Error. Raw Text:",
        responseText.substring(0, 200) + "..."
      );
      return {
        status: "error",
        reason: "Invalid JSON returned by Gemini.",
        debug: responseText.substring(0, 200)
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

