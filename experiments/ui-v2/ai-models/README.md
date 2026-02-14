# Local AI Models

This directory is used to host the local LLM weights for the AI Rewrite feature.
To enable the feature to work offline (or without CDN), you must download the model files manually.

## Instructions

1.  **Download the Model:**
    Go to the Hugging Face repository for `Llama-3.2-1B-Instruct-q4f16_1-MLC`:
    [https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC/tree/main](https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC/tree/main)

2.  **Clone or Download Files:**
    You need all the files in the repository (especially `.wasm`, `.json`, and `params_shard_*.bin`).
    
    You can use git lfs:
    ```bash
    git lfs install
    git clone https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC
    ```

3.  **Place Files:**
    Move the downloaded folder `Llama-3.2-1B-Instruct-q4f16_1-MLC` into this directory.
    
    Structure should be:
    ```
    experiments/ui-v2/ai-models/
    └── Llama-3.2-1B-Instruct-q4f16_1-MLC/
        ├── mlc-chat-config.json
        ├── ndarray-cache.json
        ├── params_shard_0.bin
        └── ...
    ```

4.  **Verify:**
    The application is configured to look for the model at `./ai-models/Llama-3.2-1B-Instruct-q4f16_1-MLC`.
