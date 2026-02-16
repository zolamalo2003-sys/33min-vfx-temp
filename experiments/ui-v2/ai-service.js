import { CreateMLCEngine } from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.78/+esm";

// Configuration
const MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";
const MODEL_PATH = `./ai-models/${MODEL_ID}/`;
const SYSTEM_PROMPTS = {
    textbox: `Du bist ein professioneller deutscher Redakteur. Deine Aufgabe ist es, den gegebenen Text in korrektem Deutsch umzuschreiben.

WICHTIGE REGELN:
1. KORRIGIERE Grammatik- und Rechtschreibfehler.
2. Formuliere den Satz KÜRZER und PRÄGNANTER.
3. Behalte den ursprünglichen SINN bei. Erfinde nichts dazu.
4. Ändere NICHT die Namen oder Fakten.
5. Das Ergebnis muss grammatikalisch korrektes Deutsch sein.

BEISPIELE:

Input: "Jerry und Marc haben quasi zusammen an der Strecke gearbeitet und dabei eigentlich ziemlich viel Zeit gebraucht"
Output: {"suggestions":["Jerry und Marc arbeiteten lange gemeinsam an der Strecke","Zeitaufwendige Streckenarbeit von Jerry und Marc","Jerry und Marc brauchten viel Zeit für den Streckenbau"]}

Input: "Marc fährt gefährliches Verkehr in einer Kneipe an ihre Passanten ab"
Output: {"suggestions":["Marc gefährdet Passanten mit seinem Fahrstil vor der Kneipe","Vor der Kneipe: Marc fährt gefährlich nah an Passanten vorbei","Marc fährt rücksichtslos an Passanten bei der Kneipe vorbei"]}

Antworte NUR mit diesem JSON Format: {"suggestions":["Satz 1", "Satz 2", "Satz 3"]}`.trim(),

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
Return strictly valid JSON: { "suggestions": ["Variation 1 here", "Variation 2 here", "Variation 3 here"] }
        `;

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
            const suggestions = [];

            for (const line of lines) {
                const trimmed = line.trim();
                // Match "1.", "1)", "- ", or just text if it looks like a sentence
                if (/^(\d+[\.)]|-|\*)\s+/.test(trimmed)) {
                    suggestions.push(trimmed.replace(/^(\d+[\.)]|-|\*)\s+/, ''));
                } else if (trimmed.length > 5 && !trimmed.startsWith('Output') && !trimmed.startsWith('Input') && !trimmed.startsWith('{') && !trimmed.startsWith('}')) {
                    // Fallback for lines that look like content but miss enumeration
                    suggestions.push(trimmed);
                }
            }

            // Clean up suggestions
            const uniqueSuggestions = [...new Set(suggestions)] // Remove duplicates
                .filter(s => !s.includes('Input:') && !s.includes('Output:'))
                .slice(0, 3);

            if (uniqueSuggestions.length > 0) {
                return uniqueSuggestions;
            }

            // Fallback: If list parsing failed completely, return raw lines
            return lines.filter(l => l.length > 10).slice(0, 3);

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
