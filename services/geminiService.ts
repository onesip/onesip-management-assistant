
import { GoogleGenAI, Chat } from "@google/genai";
import { SopItem, TrainingLevel } from "../types";
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

let chatSession: Chat | null = null;

export const getChatResponse = async (userMessage: string, sopList: SopItem[], trainingLevels: TrainingLevel[]): Promise<string> => {
    try {
        if (!process.env.API_KEY) {
            return "Error: API Key is missing. Please contact IT.";
        }

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        // Re-create session if context might have changed (simple approach for now)
        // or if it doesn't exist.
        chatSession = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: getSystemContext(sopList, trainingLevels),
            },
        });

        const response = await chatSession.sendMessage({ message: userMessage });
        return response.text;

    } catch (error) {
        console.error("Gemini Error:", error);
        return "Sorry, I'm having trouble connecting to the brain. Please check your connection.";
    }
};
