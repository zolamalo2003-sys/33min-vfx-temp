import { CreateMLCEngine } from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.78/+esm";

// Configuration
const MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";
const MODEL_PATH = `./ai-models/${MODEL_ID}/`;
const SYSTEM_PROMPTS = {
    textbox: `Du bist ein strenger Text-Editor.
Aufgabe: Schreibe den Input in korrektem Deutsch um.
Ziel: 3 bessere Varianten.
Format: NUR eine nummerierte Liste. KEINE Einleitung. KEIN "Hier sind...". KEIN Gelaber.

Beispiel Input: "Der Text ist irgendwie blöd geschrieben und lang"
Beispiel Output:
1. Der Text ist ungünstig formuliert und zu lang.
2. Dieser Text wirkt unprofessionell und weitschweifig.
3. Eine kürzere, präzisere Formulierung wäre besser.`.trim(),

    todo: `Du bist ein To-Do Bot.
Aufgabe: Formuliere To-Dos als kurze Befehle (Imperativ).
Ziel: 3 Varianten, max 6 Wörter.
Format: NUR eine nummerierte Liste. KEINE Einleitung.

Beispiel Input: "Wir müssen unbedingt noch die Musik schneiden"
Beispiel Output:
1. Musik schneiden
2. Audio-Schnitt erledigen
3. Soundtrack finalisieren`.trim(),
};

/**
 * Service to handle Local AI operations via WebLLM/WebGPU
 */
export class AiService {
    constructor() {
        this.engine = null;
        this.modelId = MODEL_ID;
        this.isLoading = false;
        this.progressCallback = null;
    }

    /**
     * Check if WebGPU is available in this browser
     */
    async checkCompatibility() {
        if (!navigator.gpu) {
            return {
                compatible: false,
                reason: "WebGPU is not supported in this browser."
            };
        }
        try {
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                return {
                    compatible: false,
                    reason: "No appropriate GPU adapter found."
                };
            }
            return { compatible: true };
        } catch (e) {
            return {
                compatible: false,
                reason: e.message
            };
        }
    }

    /**
     * Start loading the model
     * @param {Function} onProgress - Callback(progressObj)
     */
    async loadModel(onProgress) {
        if (this.engine) return; // Already loaded

        this.isLoading = true;
        this.progressCallback = onProgress;

        try {
            // Use built-in WebLLM model registry (simpler, more reliable)
            this.engine = await CreateMLCEngine(
                MODEL_ID,
                {
                    initProgressCallback: (report) => {
                        console.log("AI Progress:", report);
                        this.handleProgress(report);
                    }
                }
            );

            this.isLoading = false;
            console.log("AI Model Loaded");
        } catch (error) {
            console.error("AI Load Error:", error);
            this.isLoading = false;
            this.engine = null;
            throw error;
        }
    }

    handleProgress(report) {
        if (this.progressCallback) {
            this.progressCallback(report);
        }
    }

    /**
     * Generate rewrites for text
     * @param {string} text - User text
     * @param {string} type - Entry type (textbox, todo)
     * @returns {Promise<string[]>} - Array of 3 suggestions
     */
    async generateRewrites(text, type = 'textbox') {
        if (!this.engine) throw new Error("Model not loaded");

        const systemPrompt = SYSTEM_PROMPTS[type] || SYSTEM_PROMPTS.textbox;
        const prompt = `Input: "${text}"\nOutput:\n`;

        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
        ];

        try {
            const reply = await this.engine.chat.completions.create({
                messages,
                temperature: 0.3,
                max_tokens: 256,
            });


            const content = reply.choices[0].message.content;
            console.log("AI Raw Output:", content);

            // Parse numbered list (1. ... 2. ... 3. ...)
            const lines = content.split('\n');
            const strictSuggestions = [];
            const fallbackSuggestions = [];

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.length < 5) continue; // Skip very short lines

                // strict check: starts with "1.", "1)", "- ", "* "
                if (/^(\d+[\.)]|-|\*)\s+/.test(trimmed)) {
                    strictSuggestions.push(trimmed.replace(/^(\d+[\.)]|-|\*)\s+/, ''));
                }
                // loose check: if it looks like a sentence but has no number
                else if (!trimmed.startsWith('Output') && !trimmed.startsWith('Input') && !trimmed.startsWith('{') && !trimmed.startsWith('}')) {
                    fallbackSuggestions.push(trimmed);
                }
            }

            // DECISION LOGIC:
            // If we found strict numbered items, ONLY use those. This filters out "Sure, here are suggestions:" conversational filler.
            // If we found nothing strict, we use the fallback lines as a last resort.

            let finalSuggestions = strictSuggestions.length > 0 ? strictSuggestions : fallbackSuggestions;

            // Clean up
            finalSuggestions = [...new Set(finalSuggestions)] // Remove duplicates
                .filter(s => !s.match(/^(Here are|Sure|I hope|Let me know|Input|Output)/i)) // Extra filter for conversational starts
                .slice(0, 3);

            if (finalSuggestions.length > 0) {
                return finalSuggestions;
            }

            // Absolute Fallback
            return lines.filter(l => l.length > 15).slice(0, 3);

        } catch (error) {
            console.error("Generation failed:", error);
            throw error;
        }
    }

    async unload() {
        if (this.engine) {
            await this.engine.unload();
            this.engine = null;
        }
    }
}

export const aiService = new AiService();
