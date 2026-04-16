/**
 * LLM-SERVICE.JS - Local LLM Integration via node-llama-cpp
 * Runs a GGUF model fully offline in the Electron main process.
 *
 * ─── HOW TO CHANGE THE MODEL ─────────────────────────────────────────────────
 *  1. Place your new .gguf file inside the  models/  directory.
 *  2. Update MODEL_FILENAME below to match the new filename.
 *  3. Restart the app — the model is auto-loaded on startup.
 *
 *  The service also auto-discovers any single .gguf file in the models
 *  directory, so if only one model file is present it will be used
 *  automatically regardless of MODEL_FILENAME.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const path = require('path');
const fs   = require('fs');

// ── Model configuration (edit here to change model) ──────────────────────────
const MODEL_FILENAME = 'google_medgemma-4b-it-Q4_K_L.gguf';

const LLM_CONFIG = {
    // Resolved at runtime; falls back to auto-discovery if file not found
    modelPath: path.join(__dirname, '../../../models', MODEL_FILENAME),

    // Context window size (tokens). Reduce if you run out of RAM.
    contextSize: 2048,

    // Maximum tokens the model will generate per response
    maxTokens: 600,

    // Sampling parameters
    temperature: 0.65,
    topP: 0.90,
};
// ─────────────────────────────────────────────────────────────────────────────

// node-llama-cpp v3 — loaded once via dynamic import()
let llamaInstance  = null;   // getLlama() result
let modelInstance  = null;   // llama.loadModel() result
let isLoaded       = false;
let isLoading      = false;
let loadError      = null;

/**
 * Resolve model path: use LLM_CONFIG.modelPath if it exists,
 * otherwise scan models/ for the first .gguf file.
 */
function resolveModelPath() {
    if (fs.existsSync(LLM_CONFIG.modelPath)) {
        return LLM_CONFIG.modelPath;
    }

    const modelsDir = path.join(__dirname, '../../../models');
    if (!fs.existsSync(modelsDir)) return null;

    const ggufFiles = fs.readdirSync(modelsDir).filter(f => f.endsWith('.gguf'));
    if (ggufFiles.length === 0) return null;

    if (ggufFiles.length > 1) {
        console.warn(`LLM: Multiple .gguf files found; using first: ${ggufFiles[0]}`);
    }

    return path.join(modelsDir, ggufFiles[0]);
}

/**
 * Load the model into memory. Called once at app startup.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
async function loadModel() {
    if (isLoaded || isLoading) return getStatus();

    isLoading = true;
    loadError = null;

    try {
        const modelPath = resolveModelPath();
        if (!modelPath) {
            throw new Error(
                'No .gguf model file found in the models/ directory.\n' +
                'Place a GGUF model there and restart the app.'
            );
        }

        console.log(`LLM: Loading model from ${modelPath} …`);

        // node-llama-cpp v3 is ESM — use dynamic import()
        const { getLlama, LlamaChatSession } = await import('node-llama-cpp');
        llamaInstance = await getLlama();
        modelInstance = await llamaInstance.loadModel({ modelPath });

        isLoaded  = true;
        isLoading = false;
        console.log('LLM: Model ready.');
        return getStatus();
    } catch (err) {
        isLoading = false;
        loadError = err.message;
        console.error('LLM: Failed to load model —', err.message);
        return getStatus();
    }
}

/**
 * Send a free-form prompt to the model and get a response.
 *
 * @param {string}   prompt   — the text prompt to send
 * @param {function} [onToken] — optional streaming callback(chunk: string)
 * @returns {Promise<string>}  — complete generated text
 */
async function chat(prompt, onToken) {
    if (!isLoaded) {
        if (loadError) throw new Error(`LLM model failed to load: ${loadError}`);
        throw new Error('LLM model is still loading — please try again in a moment.');
    }

    const { LlamaChatSession } = await import('node-llama-cpp');

    // Fresh context + session per request to avoid state leakage
    const context = await modelInstance.createContext({
        contextSize: LLM_CONFIG.contextSize,
    });

    const session = new LlamaChatSession({
        contextSequence: context.getSequence(),
    });

    const response = await session.prompt(prompt, {
        maxTokens:   LLM_CONFIG.maxTokens,
        temperature: LLM_CONFIG.temperature,
        topP:        LLM_CONFIG.topP,
        onTextChunk(chunk) {
            if (onToken) {
                onToken(chunk);
            }
        },
    });

    // Dispose context to free memory
    await context.dispose();

    return response;
}

/**
 * Generate a clinical summary for an analysis result.
 *
 * @param {object}   resultData  — the analysis result object from results.json
 * @param {function} [onToken]   — optional streaming callback(chunk: string)
 * @returns {Promise<string>}    — complete generated text
 */
async function generateSummary(resultData, onToken) {
    const prompt = buildPrompt(resultData);
    return chat(prompt, onToken);
}

/**
 * Build a structured prompt from analysis result data.
 */
function buildPrompt(result) {
    const summary   = result.summary  || {};
    const quality   = result.quality  || {};
    const pathogens = result.pathogens || [];

    const pathogenLines = pathogens.length > 0
        ? pathogens.map(p =>
            `- ${p.name}${p.strain ? ` (${p.strain})` : ''}: ` +
            `${p.abundance ?? '?'}% abundance, ` +
            `${p.confidence ?? '?'}% confidence, ` +
            `risk: ${p.risk_level ?? 'unknown'}, ` +
            `AMR genes: ${p.amr_genes ?? 0}, ` +
            `virulence genes: ${p.virulence_genes ?? 0}`
          ).join('\n')
        : 'No pathogens detected.';

    return (
        'You are an expert clinical microbiologist AI assistant. ' +
        'Analyze the following metagenomic detection results and provide a professional clinical summary. ' +
        'IMPORTANT: Use only plain text in your response. Do NOT use markdown formatting such as **, *, ##, bullet points, or any other markup. Write in plain sentences and paragraphs only.\n\n' +
        `Analysis name: ${result.analysis_name || 'Unknown'}\n` +
        `Sample type: ${result.sample_type || 'Unknown'}\n` +
        `Total reads: ${summary.total_reads ? summary.total_reads.toLocaleString() : 'N/A'}\n` +
        `Classification rate: ${summary.classification_rate ?? 'N/A'}%\n` +
        `Species detected: ${summary.species_detected ?? 'N/A'}\n` +
        `Pathogens detected: ${summary.pathogens_detected ?? pathogens.length}\n` +
        `Total AMR genes: ${summary.amr_genes ?? 0}\n` +
        `Average read quality: Q${quality.average_quality ?? 'N/A'}\n\n` +
        `Detected pathogens:\n${pathogenLines}\n\n` +
        `Provide a 2–3 paragraph clinical summary covering:\n` +
        `1. Main findings and the most clinically significant pathogens.\n` +
        `2. Antimicrobial resistance (AMR) concerns based on detected genes.\n` +
        `3. Suggested clinical action or recommendation.\n` +
        `Keep the tone professional and concise.`
    );
}

/** Return current load state for the renderer to query. */
function getStatus() {
    return { isLoaded, isLoading, loadError };
}

module.exports = { loadModel, generateSummary, chat, getStatus };
