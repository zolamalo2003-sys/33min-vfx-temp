import { CreateMLCEngine } from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.78/+esm";

// Configuration
const MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";
const MODEL_PATH = `./ai-models/${MODEL_ID}/`;
const SYSTEM_PROMPTS = {
    textbox: `Muster:
Input: "Das ist voll der Mist"
1. Das gefällt mir überhaupt nicht.
2. Die Qualität ist mangelhaft.
3. Das ist sehr schlecht gemacht.

Input: "Wir gehen später essen"
1. Später werden wir speisen.
2. Wir gehen nachher ins Restaurant.
3. Später gibt es Essen.

Input: "Der Typ ist betrunken"
1. Er hat zu viel getrunken.
2. Der Mann ist alkoholisiert.
3. Er ist nicht mehr nüchtern.`.trim(),

    todo: `Muster:
Input: "Musik schneiden"
1. Musik schneiden
2. Audio-Edit
3. Musik anpassen

Input: "Farbe machen"
1. Color Grading
2. Farben anpassen
3. Look erstellen`.trim(),
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
                // loose check: look for content that is NOT conversational
                // Exclude: "Oder:", "Here is:", "Sure:", lines ending in ":", lines that are just quotes
                else if (
                    !trimmed.startsWith('Output') &&
                    !trimmed.startsWith('Input') &&
                    !trimmed.includes('{') &&
                    !trimmed.endsWith(':') &&
                    !trimmed.match(/^(Hier|Da|That|This|Sure|Okay|I can)/i)
                ) {
                    // Remove wrapping quotes if present
                    const cleaned = trimmed.replace(/^["']|["']$/g, '');
                    fallbackSuggestions.push(cleaned);
                }
            }

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
