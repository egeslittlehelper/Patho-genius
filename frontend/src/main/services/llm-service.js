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
let contextInstance = null;  // persistent LlamaContext (reused per request to avoid native crash on dispose)
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

        // ── GPU / CUDA setup ───────────────────────────────────────────────────
        // Attempt CUDA first; fall back to 'auto' (best available) on failure.
        try {
            llamaInstance = await getLlama({ gpu: 'cuda' });
        } catch (cudaErr) {
            console.warn('LLM: CUDA init failed, falling back to auto —', cudaErr.message);
            llamaInstance = await getLlama({ gpu: 'auto' });
        }

        // ── Diagnostics: log which compute backend is active ──────────────────
        const activeGpu = llamaInstance.gpu;
        console.log(
            'LLM: Compute backend →',
            activeGpu === false ? 'CPU (no GPU detected)' : String(activeGpu).toUpperCase()
        );

        // ── Load model — offload every transformer layer to the GPU ───────────
        // gpuLayers: 9999 acts as "all layers"; llama.cpp clamps it to the
        // actual layer count, so this is safe for any model size.
        modelInstance = await llamaInstance.loadModel({
            modelPath,
            gpuLayers: 9999,
        });
        contextInstance = await modelInstance.createContext({
            contextSize: LLM_CONFIG.contextSize,
        });

        isLoaded  = true;
        isLoading = false;
        console.log(`LLM: Model ready (GPU: ${activeGpu === false ? 'CPU' : String(activeGpu).toUpperCase()}).`);
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

    // Reuse the persistent context created at load time.
    // Creating a new context per request and calling context.dispose() after
    // session.prompt() returns causes a native crash (segfault in llama.cpp)
    // because the LlamaChatSession still holds a live reference to the
    // context's C++ sequence object at the point of disposal.
    // Each new LlamaChatSession starts a fresh conversation and overwrites
    // the KV cache, so there is no history leakage between requests.
    //
    // The sequence slot must be explicitly disposed after each request so it
    // is returned to the context pool. Without this, every call consumes one
    // slot and retries throw "No sequences left".
    const sequence = contextInstance.getSequence();
    try {
        const session = new LlamaChatSession({ contextSequence: sequence });

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

        return response;
    } finally {
        // Always release the sequence slot back to the context pool so the
        // next call (e.g. Retry) can acquire it successfully.
        sequence.dispose();
    }
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

    const hasVirulence = pathogens.some(p => p.virulence_genes && p.virulence_genes > 0);

    const pathogenLines = pathogens.length > 0
        ? pathogens.map(p => {
            let line =
                `- ${p.name}${p.strain ? ` (${p.strain})` : ''}: ` +
                `${p.abundance ?? '?'}% abundance, ` +
                `${p.confidence ?? '?'}% confidence, ` +
                `risk: ${p.risk_level ?? 'unknown'}`;
            if (p.virulence_genes && p.virulence_genes > 0) {
                line += `, virulence genes: ${p.virulence_genes}`;
            }
            return line;
          }).join('\n')
        : 'No pathogens detected.';

    let coverageNum = 1;
    const coverageLines = [];
    coverageLines.push(`${coverageNum++}. Main findings and the most clinically significant pathogens.`);
    if (hasVirulence) {
        coverageLines.push(`${coverageNum++}. Virulence factors detected and their clinical significance.`);
    }
    coverageLines.push(`${coverageNum++}. Suggested clinical action or recommendation.`);
    coverageLines.push(`${coverageNum++}. A safety assessment paragraph stating whether this water sample appears safe for drinking, washing hands, and washing face, based on the detected pathogens and their risk levels. Be specific about each use case. CRITICAL RULE: If any pathogen with a high or severe risk level is detected, regardless of how low its abundance percentage is, you MUST explicitly state that the sample cannot be considered completely safe and include a clear warning about the risk posed by that pathogen.`);
    const coverageText = coverageLines.join('\n');

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
        `Average read quality: Q${quality.average_quality ?? 'N/A'}\n\n` +
        `Detected pathogens:\n${pathogenLines}\n\n` +
        `Provide a clinical summary of at least 3 paragraphs covering:\n` +
        `${coverageText}\n` +
        `Each point above must be its own paragraph. Do not combine points into a single paragraph. Keep the tone professional and concise.`
    );
}

/** Return current load state for the renderer to query. */
function getStatus() {
    return { isLoaded, isLoading, loadError };
}

module.exports = { loadModel, generateSummary, chat, getStatus };
