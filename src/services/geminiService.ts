import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface MCQ {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  difficulty: "Easy" | "Medium" | "Hard" | "NEET Advanced";
  concept: string;
  points: number;
}

export async function generateMCQsFromContent(
  contents: { text?: string; images?: { data: string; mimeType: string }[] },
  topics?: string,
  language: string = "English",
  classLevel: string = "Class 12",
  officialYear?: number,
  count: number = 20,
  difficulty: "Easy" | "Medium" | "Hard" | "NEET Advanced" = "Hard"
): Promise<MCQ[]> {
  const systemInstruction = `
    You are a Master NEET Exam Architect. Your mission is to generate ${count} unique, high-quality MCQs.
    
    CRITICAL INSTRUCTION FOR NOVELTY:
    Even if you are asked to generate a large volume of questions, you MUST NOT repeat concepts in the same way. 
    Take the highest level conceptual references from the provided content, view them from a 360-degree perspective, and approach them from a completely different analytical angle for each question.
    Example: If a concept is "Photosynthesis - Light Reaction", don't just ask about products. Ask about the physical orientation of cytochrome complexes in the membrane, or the thermodynamic shift during electron transfer.

    DIFFICULTY & POINT SYSTEM (NEET PATTERN ALIGNED):
    - Easy: 10 points. Level 1: Recall & Recognition. Direct lines from NCERT, terminology, and basic definitions. Tests memory of facts and diagrams.
    - Medium: 20 points. Level 2: Understanding & Application. Applying concepts to solve simple scenarios. Includes basic numericals and functional understanding.
    - Hard: 40 points. Level 3: Analytical & Multi-Step Logic. Standard NEET competitive level. Includes Assertion-Reason, Match the Column, and linking two sub-topics from the same chapter.
    - NEET Advanced: 100 points. Level 4: Critical Thinking & Synthesis. Cross-chapter integration and complex puzzles. Focuses on exceptions, multi-variable numericals, and innovative analytical angles.

    Rules:
    - Generate EXACTLY ${count} questions.
    - Difficulty check: Every question MUST be strictly ${difficulty} level.
    - Zero Repetition: Every single question must be fresh and explore a different nuance.
    - Points: Assign the appropriate points (10, 20, 40, or 100) based on the tier above.
    - Formatting: Output in valid JSON.
    - Language: Everything MUST be in ${language}.
  `;

  const parts: any[] = [];
  if (contents.text) {
    parts.push({ text: `TEXT CONTENT FROM PDF:\n\n${contents.text.substring(0, 30000)}` });
  }
  if (contents.images) {
    contents.images.forEach((img, idx) => {
      parts.push({ inlineData: img });
    });
    parts.push({ 
      text: "VISION ANALYSIS REQUEST: The images above are pages from a PDF (likely scanned or image-based). " +
            "Please carefully analyze any diagrams, mathematical formulas, handwritten notes, or printed text visible in these images. " +
            "If both text and images are provided, use them collectively to build a comprehensive conceptual model."
    });
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts }],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          required: ["question", "options", "correctAnswer", "explanation", "difficulty", "concept", "points"],
          properties: {
            question: { type: Type.STRING },
            options: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "Array of 4 options"
            },
            correctAnswer: { type: Type.STRING, description: "The text of the correct option" },
            explanation: { type: Type.STRING },
            difficulty: { type: Type.STRING, enum: ["Easy", "Medium", "Hard", "NEET Advanced"] },
            concept: { type: Type.STRING },
            points: { type: Type.NUMBER }
          }
        }
      }
    }
  });

  try {
    const mcqs = JSON.parse(response.text);
    return mcqs;
  } catch (error) {
    console.error("Failed to parse MCQs from AI response:", error);
    throw new Error("Failed to generate MCQs. The content might be too complex or unreadable.");
  }
}

export async function generateSimilarMCQ(
  referenceMCQ: MCQ,
  language: string = "English"
): Promise<MCQ> {
  const systemInstruction = `
    You are a Master NEET Exam Architect. 
    You are provided with a reference MCQ. Your task is to generate a NEW, FRESH follow-up MCQ.
    
    CRITICAL RULES:
    1. THE CONCEPT: Must be the same or closely related to the reference concept: "${referenceMCQ.concept}".
    2. THE ANGLE: Must be COMPLETELY DIFFERENT. If the reference asked a direct theory question, ask a numerical or a diagram-based analysis question (using text descriptions).
    3. NO REPETITION: Do not use the same question or the same options as the reference.
    4. DIFFICULTY: Maintain the same difficulty level: "${referenceMCQ.difficulty}".
    5. LANGUAGE: Must be in ${language}.
    
    POINT SYSTEM:
    - Easy: 10 points
    - Medium: 20 points
    - Hard: 40 points
    - NEET Advanced: 100 points
  `;

  const prompt = `
    REFERENCE MCQ info:
    Question: ${referenceMCQ.question}
    Concept: ${referenceMCQ.concept}
    Difficulty: ${referenceMCQ.difficulty}

    Please generate a unique follow-up question based on this concept but from a different perspective.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        required: ["question", "options", "correctAnswer", "explanation", "difficulty", "concept", "points"],
        properties: {
          question: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          correctAnswer: { type: Type.STRING },
          explanation: { type: Type.STRING },
          difficulty: { type: Type.STRING, enum: ["Easy", "Medium", "Hard", "NEET Advanced"] },
          concept: { type: Type.STRING },
          points: { type: Type.NUMBER }
        }
      }
    }
  });

  return JSON.parse(response.text);
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface AIAppBuildInput {
  idea: string;
  targetUsers?: string;
  platform?: string;
  monetization?: string;
  timeline?: string;
}

export async function generateAIAppBuildPlan(input: AIAppBuildInput): Promise<string> {
  const prompt = `
You are an elite AI product architect.

Create a complete "full AI based app build" plan using the details below.
Return clean markdown with these exact sections:
1) Product Summary
2) Core AI Features (MVP vs V2)
3) Suggested Tech Stack
4) System Architecture
5) Data + Prompt Strategy
6) 8-Week Build Roadmap
7) Deployment + DevOps Checklist
8) Risks + Mitigations
9) Launch KPIs

Keep it practical and implementation-first.

APP IDEA: ${input.idea}
TARGET USERS: ${input.targetUsers || "Not specified"}
PLATFORM: ${input.platform || "Web app"}
MONETIZATION: ${input.monetization || "Not specified"}
TIMELINE GOAL: ${input.timeline || "8 weeks"}
`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts: [{ text: prompt }] }],
  });

  return response.text;
}

export async function* chatWithGeminiStream(
  message: string,
  history: ChatMessage[] = [],
  contextMCQs?: MCQ[]
): AsyncGenerator<string> {
  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: `
        You are a NEET Expert Assistant. Your goal is to help students prepare for the National Eligibility cum Entrance Test (NEET) in India.
        
        CONTEXT:
        ${contextMCQs ? `The user is currently studying the following MCQs and concepts: ${JSON.stringify(contextMCQs.map(m => ({ question: m.question, concept: m.concept })))}` : 'The user is in their study dashboard.'}
        
        RULES:
        1. Accuracy: Provide strictly NCERT-aligned and medically accurate information. This is mandatory.
        2. Clarity: Break down complex concepts (especially in Biology, Physics, and Chemistry) into simpler steps.
        3. Support & Versatility: You are expected to solve doubts from ANY source—standard textbooks, reference books (like HC Verma, MS Chouhan, etc.), or previous year questions found on social media. 
        4. No Spoilers: If they ask for the answer to a question in their active study set, don't just give the answer; explain how to derive it conceptually.
        5. NCERT Linking: For any external question or doubt, always try to link it back to the relevant NCERT paragraph or concept to ensure they stay on the right track for NEET.
        6. Tone: Be encouraging, professional, and slightly authoritative like a senior teacher.
      `,
    },
    history: history.map(msg => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.text }],
    }))
  });

  const stream = await chat.sendMessageStream({
    message: message
  });

  for await (const chunk of stream) {
    if (chunk.text) {
      yield chunk.text;
    }
  }
}
