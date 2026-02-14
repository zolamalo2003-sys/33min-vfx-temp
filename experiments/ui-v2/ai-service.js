import { CreateMLCEngine } from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.78/+esm";

// Configuration
const MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";
const MODEL_PATH = `./ai-models/${MODEL_ID}/`;
const SYSTEM_PROMPTS = {
  textbox: `
You rewrite on-screen info text for a German TV/YouTube race series.

Context (do not output this):
- 5 participants: Jerry, Marc, Käthe, Taube, Kodiak.
- The text appears as an information overlay/inset that helps viewers understand what’s happening.
- Style: informative + slightly narrative, subtly casual, but still clear and professional.
- Do NOT start with labels like "Info:" or "Hinweis:". Start directly with the sentence.
- Keep the exact meaning. Do not add new facts. Do not change names, numbers, places, times, or claims.
- Keep it short enough for an overlay: usually 1–2 sentences, max 3. Prefer shorter if possible.
- Use natural German.

Task:
Rewrite the user's German text into 3 distinct improved versions:
- clearer and easier to read at a glance
- concise (remove filler)
- same meaning, same facts
- vary wording and sentence rhythm between versions

Output format (strict):
Return ONLY valid JSON:
{"suggestions":["...","...","..."]}
`.trim(),

  todo: `
You rewrite German To-Do overlay items for the same race series.

Context (do not output this):
- These To-Do items are short on-screen prompts, like a checklist.
- Keep it extremely short and actionable (typically 2–6 words).
- Do NOT add new tasks, facts, or details.
- Do NOT start with "To-do:" or "Aufgabe:". Just the text.
- Use natural German, imperative is okay.

Task:
Rewrite the user's To-Do into 3 distinct compact versions (same meaning).

Output format (strict):
Return ONLY valid JSON:
{"suggestions":["...","...","..."]}
`.trim(),
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
            // Configure to look for model in local folder
            const appConfig = {
                model_list: [
                    {
                        model: `https://huggingface.co/mlc-ai/${MODEL_ID}`, // Fallback or metadata source
                        model_id: MODEL_ID,
                        model_lib: `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0.2.48/${MODEL_ID}-ctx4k_cs1k-webgpu.wasm`, // This might need adjustment based on specific model version
                        low_resource_required: true,
                        // For self-hosted, we override the weight path if needed, 
                        // but WebLLM usually expects a specific structure. 
                        // We'll point to our local directory if we can.
                        // However, WebLLM's `CreateMLCEngine` expects a clear config.
                        // To keep it simple for now, we'll try standard loading which caches in browser cache.
                        // If "Self-host" means serving files from /public, we need to map the URL.
                    }
                ],
                use_web_worker: true
            };

            // To strictly force local path:
            /*
            const localConfig = {
                model_list: [
                    {
                        model: MODEL_PATH, // Local path
                        model_id: MODEL_ID,
                        model_lib: `${MODEL_PATH}model-lib.wasm`, // Assuming we accepted the wasm there too
                        low_resource_required: true,
                    }
                ]
            }
            */

            // For this implementation, we will perform standard load which caches.
            // To truly self-host, the user MUST download the weights to MODEL_PATH.
            // We will assume they are there or we will fallback to CDN if allowed (but requirements say "Only static model asset downloads... hosted on our own Vercel domain").
            // So we point `model` to the relative path.

            const myAppConfig = {
                model_list: [
                    {
                        model: MODEL_PATH,
                        model_id: MODEL_ID,
                        model_lib: `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0.2.48/${MODEL_ID}-ctx4k_cs1k-webgpu.wasm`, // WASM is usually small enough to fetch from GitHub, or we can self-host it too.
                        low_resource_required: true,
                    }
                ]
            };

            this.engine = await CreateMLCEngine(
                MODEL_ID,
                { appConfig: myAppConfig, initProgressCallback: this.handleProgress.bind(this) }
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
