import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Gemini API Initialization
  let ai: GoogleGenAI | null = null;
  try {
    if (process.env.GEMINI_API_KEY) {
      ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
  } catch (err) {
    console.error("Failed to initialize Google Gen AI:", err);
  }

  // API routes
  app.post("/api/analyze-crops", async (req, res) => {
    try {
      if (!ai) {
        return res.status(500).json({ error: "Gemini API key is not configured." });
      }

      const { data } = req.body;
      
      const prompt = `You are an expert AI agriculture analyst. 
Please analyze the following historical planting cycle and yield data and provide a brief optimization suggestion report.
Respond in Chinese. The report should be concise, focusing on finding key insights.

Data:
${JSON.stringify(data, null, 2)}
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });

      res.json({ result: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze data" });
    }
  });

  app.post("/api/predict-cycle", async (req, res) => {
    try {
      if (!ai) {
        return res.status(500).json({ error: "Gemini API key is not configured." });
      }

      const { data } = req.body;
      
      const prompt = `You are an expert AI agriculture analyst. 
Please analyze the following historical planting cycle data and predict the best time/date for the next irrigation or fertilization.
Respond in Chinese. The report should be concise, focusing on outputting a schedule reminder format.

Data:
${JSON.stringify(data, null, 2)}
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });

      res.json({ result: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "Failed to predict cycle" });
    }
  });

  app.post("/api/parse-voice-record", async (req, res) => {
    try {
      if (!ai) {
        return res.status(500).json({ error: "Gemini API key is not configured." });
      }

      const { text } = req.body;
      
      const prompt = `You are an expert agriculture assistant. 
Please parse the following voice transcript from a farmer into a concise, professional structured farming record (e.g., [Date/Time], Action, Details) regarding peony care.
Respond in Chinese. Return the result as a single concise string.

Transcript: "${text}"
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });

      res.json({ result: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "Failed to parse data" });
    }
  });

  app.post("/api/analyze-disease", async (req, res) => {
    try {
      if (!ai) {
        return res.status(500).json({ error: "Gemini API key is not configured." });
      }

      const { imageBase64 } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "No image provided" });
      }

      const base64Data = imageBase64.split(',')[1] || imageBase64;

      const prompt = `你是一个专业的植保AI专家。请分析图片中芍药可能存在的病害问题，并给出专业的、可执行的治疗建议。如果图片中不是芍药或者没发现病害，请如实说明。
要求回答简明扼要，包含诊断结果和处理方案。`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: 'image/jpeg',
                }
              },
              { text: prompt }
            ]
          }
        ],
      });

      res.json({ result: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze disease" });
    }
  });

  app.post("/api/search-disease", async (req, res) => {
    try {
      if (!ai) {
        return res.status(500).json({ error: "Gemini API key is not configured." });
      }

      const { diseaseName } = req.body;
      
      const prompt = `你是一个农业植保专家。请针对芍药【${diseaseName}】的常见病虫害，提供一份综合防治方案。请确切有效、分点详述，包含病症表现、发生条件、农业防治及化学防治方法。`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });

      res.json({ result: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "Failed to search disease" });
    }
  });

  app.post("/api/push-notification", async (req, res) => {
    try {
      const { message } = req.body;
      console.log(`Mock Push Notification Sent: ${message}`);
      res.json({ success: true, message: "推送成功" });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to send push notification" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
