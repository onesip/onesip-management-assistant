
import { GoogleGenAI } from "@google/genai";
import { SopItem, TrainingLevel, LogEntry } from "../types";
import { DRINK_RECIPES } from "../constants";

// Helper to format data for the AI context
const getSystemContext = (sopList: SopItem[], trainingLevels: TrainingLevel[]) => {
    const sops = sopList.map(s => `[SOP: ${s.title.en}]\n${s.content.en}`).join('\n\n');
    const training = trainingLevels.map(t => `[Training Module: ${t.title.en}]\n${t.content.map(c => `${c.title.en}: ${c.body.en}`).join('\n')}`).join('\n\n');
    const recipes = DRINK_RECIPES.map(r => `${r.name.en} (${r.cat}): ${r.toppings.en}`).join('\n');
    
    return `You are the expert Store Manager AI for "ONESIP". 
    
    Your knowledge base is dynamic and specific to this store:
    
    --- SOPS & PROCEDURES ---
    ${sops}

    --- TRAINING MATERIALS ---
    ${training}
    
    --- RECIPES ---
    ${recipes}

    Rules:
    1. Answer concisely. Staff are busy.
    2. If asked about safety or alarms, emphasize priority (e.g., Code 0117).
    3. Use formatting (bullet points) for steps.
    4. If the user asks in Chinese, answer in Chinese.
    5. Always refer to the specific machinery guidelines (e.g., Smart Machine cleaning, P3 mode for Dishwasher) provided in the knowledge base.
    `;
};

export const getChatResponse = async (userMessage: string, sopList: SopItem[], trainingLevels: TrainingLevel[]): Promise<string> => {
    try {
        if (!process.env.API_KEY) {
            console.warn("AI API Key is missing. Check environment variables.");
            return "AI Service Unavailable (Missing Key). Please contact manager.";
        }

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: userMessage,
            config: {
                systemInstruction: getSystemContext(sopList, trainingLevels),
            },
        });
        
        return response.text ?? "Sorry, I'm having trouble understanding. Please try again.";

    } catch (error) {
        console.error("Gemini Error:", error);
        return "Sorry, I'm having trouble connecting to the brain. Please check your connection.";
    }
};

export const getManagerInsights = async (logs: LogEntry[]): Promise<string> => {
    try {
        if (!process.env.API_KEY) return "AI Key Missing.";

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        // Filter last 50 logs for context
        const recentLogs = logs.slice(0, 50).map(l => `${l.time}: ${l.name} - ${l.type} (${l.reason || ''})`).join('\n');

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Analyze these recent store logs and provide a brief, bulleted executive summary for the manager. 
            Focus on:
            1. Attendance anomalies (late/early).
            2. Operational issues (inventory notes).
            3. Any pattern that needs attention.
            
            Logs:
            ${recentLogs}`,
        });
        
        return response.text ?? "No insights available.";
    } catch (error) {
        console.error("Gemini Insight Error:", error);
        return "Unable to generate insights at this time.";
    }
}