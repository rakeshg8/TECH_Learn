import express from "express";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import cors from "cors";
dotenv.config();
const app = express();
const allowedOrigins = [
  "http://localhost:5173",
   "http://localhost:5174",
  "https://smart-study-buddy.vercel.app",
  "https://tech-learn-fsn6.vercel.app",
  "https://smart-study-buddy-yt58.vercel.app",
  "https://tech-learn-sandy.vercel.app"
];


app.use(
  cors({
    origin: function (origin, callback) {
      // Allow server-to-server and local tools (like curl, Postman)
      if (!origin) return callback(null, true);

      // ✅ Allow all Vercel preview URLs dynamically
      if (
        allowedOrigins.includes(origin) ||
        /\.vercel\.app$/.test(origin)
      ) {
        return callback(null, true);
      }

      console.error("❌ CORS blocked for origin:", origin);
      return callback(new Error("CORS not allowed for this origin"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ✅ Handle preflight requests
app.options("*", cors());

app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const COHERE_API_KEY = process.env.COHERE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.get("/", (req, res) => res.send("Smart Study Buddy API running ✅"));

app.post("/api/embeddings", async (req, res) => {
  const {workspace_id,
    quick_study_id,
    document_id,
    page_number,
    chunk_text } = req.body;
  if (!chunk_text) return res.status(400).json({ error: "Missing chunk_text" });

  try {
    // ✅ 1. Get embeddings from Cohere (v2 API)
    const embResp = await fetch("https://api.cohere.ai/v2/embed", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${COHERE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "embed-english-v3.0", // ✅ correct model
        texts: [chunk_text],
        input_type: "search_document", // ✅ required for v3.0
      }),
    });

    console.log("Cohere response status:", embResp.status);
    const embJson = await embResp.json();
    console.log("Cohere response JSON:", embJson);

   const embedding = embJson.embeddings?.float?.[0];


    if (!embedding) {
      console.error("Cohere embedding error:", embJson);
      return res.status(500).json({ error: "Failed to generate embedding" });
    }
 // 2️⃣ Determine target table
    let tableName, parentIdField;
    if (workspace_id) {
      tableName = "embeddings";
      parentIdField = "workspace_id";
    } else if (quick_study_id) {
      tableName = "quick_embeddings";
      parentIdField = "quick_study_id";
    } else {
      return res.status(400).json({ error: "No workspace_id or quick_study_id provided" });
    }
    // ✅ 2. Store in Supabase
       const { error } = await supabase.from(tableName).insert({
      [parentIdField]: workspace_id || quick_study_id,
      document_id,
      chunk_text,
      page_number,
      embedding,
    });

    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Embedding handler failed:", err);
    res.status(500).json({ error: err.message });
  }
});
console.log("GEMINI_API_KEY present:", !!process.env.GEMINI_API_KEY);

// ============ Query API ============
app.post("/api/query", async (req, res) => {
  const { workspace_id, quick_study_id, question, mode } = req.body;

  try {
    // 1️⃣ Create embedding for the question using Cohere
    const embResp = await fetch("https://api.cohere.ai/v1/embed", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${COHERE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "embed-english-v3.0",
        texts: [question],
        input_type: "search_query",
      }),
    });

    const embJson = await embResp.json();
    const qVec = embJson.embeddings?.float?.[0] || embJson.embeddings?.[0];
    if (!qVec) throw new Error("Failed to generate question embedding");
        // 2️⃣ Select correct embedding table
// 2️⃣ Determine correct table, column, and parent ID
const parentIdValue = workspace_id || quick_study_id;
if (!parentIdValue) {
  return res.status(400).json({ error: "No workspace_id or quick_study_id provided" });
}

const tableName = workspace_id ? "embeddings" : "quick_embeddings";
const parentIdField = workspace_id ? "workspace_id" : "quick_study_id";

// 2️⃣ Fetch embeddings from Supabase
const { data: rows, error: fetchErr } = await supabase
  .from(tableName)
  .select("id, chunk_text, page_number, embedding")
  .eq(parentIdField, parentIdValue);

if (fetchErr) throw new Error(fetchErr.message);
if (!rows?.length) throw new Error("No embeddings found for this workspace/study");


    // 3️⃣ Compute cosine similarity
    const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
    const norm = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0));
    const cosine = (a, b) => dot(a, b) / (norm(a) * norm(b) + 1e-10);

   // 3️⃣ Compute similarity
const scored = rows.map((r) => {
  // Parse the embedding (string or object) into an array
  let emb = r.embedding;
  if (typeof emb === "string") {
    try {
      emb = JSON.parse(emb);
    } catch {
      // Supabase can return as {float: [...]} if inserted that way
      emb = emb.replace(/[{}]/g, "").split(",").map(Number);
    }
  } else if (emb?.float) {
    emb = emb.float; // Cohere’s structure
  }

  return { ...r, score: cosine(qVec, emb) };
});

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 6);

// 4️⃣ Build RAG prompt (adjusted for quiz mode)
const contextText = top
  .map((t) => `Page ${t.page_number}: ${t.chunk_text}`)
  .join("\n---\n");

let prompt;

if (mode === "quiz") {
  prompt = `
You are a professional quiz generator.

Generate a quiz based strictly on the core concepts and topics covered in the uploaded workspace material.
    Avoid administrative or irrelevant questions (e.g., about submission dates, file names, or formatting instructions).

    The quiz should include a balanced mix of:
    - Easy questions that test key definitions and basic understanding
    - Medium questions that require short reasoning or explanations
    - Hard questions that require analysis, comparison, or application of concepts

    Randomly decide the total number of questions (between 8 and 12) 
    and adjust the difficulty mix dynamically depending on the document content.


Each question MUST be followed by its correct answer.
Follow this exact format strictly:

Q1: [Question text]
A1: [Answer text]
Q2: [Question text]
A2: [Answer text]
...

Keep questions clear, concise, and based only on the provided content.

Context:
${contextText}
`;
} else {
   prompt = `You are an intelligent study assistant. Use the context below to answer the question accurately and cite relevant pages.\n\nContext:\n${contextText}\n\nQuestion: ${question}\n\nAnswer:`;


}

    // 5️⃣ Call LLM via Google Gemini
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not set" });
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const llmResp = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: { maxOutputTokens: 700 },
      }),
    });

    const llmJson = await llmResp.json();
    console.log("Gemini LLM response:", llmJson);

    // 🧩 Handle Gemini errors cleanly
    if (!llmResp.ok) {
      const msg = llmJson?.error?.message || "Gemini API call failed";
      return res.status(llmResp.status || 500).json({ error: msg });
    }

    const answer = (llmJson.candidates?.[0]?.content?.parts || [])
      .map((p) => (typeof p.text === "string" ? p.text : ""))
      .join("\n")
      .trim();
// 🧹 Clean up markdown-style formatting for a professional look
let cleanAnswer = answer
  ?.replace(/\*\*/g, "")        // remove **bold**
  ?.replace(/__|_/g, "")        // remove _italic_
  ?.replace(/```[\s\S]*?```/g, "") // remove code blocks
  ?.replace(/`/g, "")           // remove inline code backticks
  ?.replace(/\/\/.*/g, "")      // remove comment-like lines
  ?.replace(/#+\s?/g, "")       // remove markdown headers
  ?.replace(/\n{3,}/g, "\n\n")  // limit multiple newlines
  ?.trim();

    // 6️⃣ Save chat history
   const chatTable = workspace_id ? "chats" : "quick_chats";
    await supabase.from(chatTable).insert({
      [parentIdField]: parentIdValue,
      question,
      answer: cleanAnswer,
      sources: top.map((t) => ({
        page: t.page_number,
        excerpt: t.chunk_text.slice(0, 200),
      })),
    });

    res.json({
       answer: cleanAnswer,
      sources: top.map((t) => ({
        page: t.page_number,
        excerpt: t.chunk_text.slice(0, 200),
        score: t.score,
      })),
    });
  } catch (err) {
    console.error("Query error:", err);
    res.status(500).json({ error: err.message });
  }
});
// 🧘 Stress Mode - using free APIs
app.post("/api/stress-mode", async (req, res) => {
  try {
    const { mood } = req.body;
    let apiUrl = "";
    let key = "message";

    if (mood === "funny") {
      apiUrl = "https://v2.jokeapi.dev/joke/Any?type=single";
    } else if (mood === "motivational") {
      apiUrl = "https://zenquotes.io/api/random";
    } else if (mood === "silly") {
      apiUrl = "https://uselessfacts.jsph.pl/random.json?language=en";
    }

    const response = await fetch(apiUrl);
    const data = await response.json();

    let message = "";
    if (mood === "funny") message = data.joke;
    else if (mood === "motivational") message = data[0]?.q + " — " + data[0]?.a;
    else if (mood === "silly") message = data.text;

    res.json({ message });
  } catch (error) {
    console.error("Error fetching stress mode message:", error);
    res.status(500).json({ message: "Failed to fetch stress mode message." });
  }
});
// ✅ Vercel export (no app.listen)
export default app;
