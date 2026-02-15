import { CreateMLCEngine } from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.78/+esm";

// Configuration
const MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";
const MODEL_PATH = `./ai-models/${MODEL_ID}/`;
const SYSTEM_PROMPTS = {
    textbox: `Du bist ein professioneller deutscher Texteditor. Schreibe den Text 3x neu - kürzer und klarer.

REGELN:
- Behalte ALLE Fakten/Namen/Zahlen exakt gleich
- Entferne Füllwörter (eigentlich, quasi, halt, irgendwie)
- Kurze Sätze, aktive Sprache
- Jede Version MUSS unterschiedlich sein

BEISPIELE:

Input: "Jerry und Marc haben quasi zusammen an der Strecke gearbeitet und dabei eigentlich ziemlich viel Zeit gebraucht"
Output: {"suggestions":["Jerry und Marc bauten gemeinsam die Strecke - das dauerte lange","Die Strecke: Jerry und Marc brauchten viel Zeit dafür","Jerry und Marc arbeiteten lange an der Strecke"]}

Input: "Die Aufgabe war irgendwie schwierig weil es ziemlich viele Regeln gab die man beachten musste"
Output: {"suggestions":["Schwierige Aufgabe: Viele Regeln zu beachten","Die Aufgabe war schwer - viele Regeln","Komplexe Aufgabe mit vielen Regeln"]}

Antworte NUR mit JSON: {"suggestions":["...","...","..."]}`.trim(),

    todo: `Du schreibst deutsche To-Do Einträge für Video-Overlays um. 3 Versionen - kurz und klar.

REGELN:
- Maximal 6 Wörter
- Imperativ (Befehlsform)
- Keine neuen Infos hinzufügen
- Jede Version unterschiedlich

BEISPIELE:

Input: "Die Musik muss noch für das Video bearbeitet werden"
Output: {"suggestions":["Musik bearbeiten","Audio fürs Video anpassen","Musik-Editing erledigen"]}

Input: "Noch schnell die Farben im Video korrigieren bevor es online geht"
Output: {"suggestions":["Farben korrigieren","Farbkorrektur durchführen","Color Grading machen"]}

Antworte NUR mit JSON: {"suggestions":["...","...","..."]}`.trim(),
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
        const prompt = `
Original Text: "${text}"

Rewrite the text above. 
Output exactly 3 variations.
Return strictly valid JSON: { "suggestions": ["var1", "var2", "var3"] }
        `;

        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
        ];

        try {
            const reply = await this.engine.chat.completions.create({
                messages,
                response_format: { type: "json_object" }, // WebLLM supports forcing JSON if model supports it
                temperature: 0.7,
                max_tokens: 500,
            });

            const content = reply.choices[0].message.content;
            console.log("AI Raw Output:", content);

            try {
                const parsed = JSON.parse(content);
                if (Array.isArray(parsed.suggestions)) {
                    return parsed.suggestions.slice(0, 3);
                }
                return [];
            } catch (e) {
                console.warn("JSON Parse failed, trying regex fallback");
                // Fallback regex to find list items if JSON fails
                return content.split('\n').filter(l => l.trim().length > 0).slice(0, 3);
            }

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
