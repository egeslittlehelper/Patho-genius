/**
 * ANALYSIS SERVICE — Dual-Engine Edition
 * ═══════════════════════════════════════════════════════════════════════════════
 * Electron bridge: copies FASTQ into Patho-genius, runs Snakemake which
 * dispatches classification via one of two engines:
 *   CPU  →  CLARK-l via Docker (local)
 *   GPU  →  CU-CLARK-L on Jetson Nano via Tailscale SSH (edge-computing)
 *
 * The engine is selected in the Electron UI and passed to Snakemake via
 * --config engine=cpu|gpu.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const yaml = require('js-yaml');

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');

const ANALYSIS_CONFIG = {
    WORKFLOW_DIR: process.env.SNAKEMAKE_WORKFLOW_DIR || path.join(REPO_ROOT, 'Patho-genius'),
    RESULTS_DIR: process.env.RESULTS_DIR || path.join(REPO_ROOT, 'frontend', 'results'),
    DEFAULT_THREADS: 4,
    USE_MOCK: process.env.PATHOGENIUS_MOCK_ANALYSIS === '1',
};

const activeAnalyses = new Map();
const analysisHistory = [];

// Lazy-load db-settings (avoids circular require issues)
let _dbSettings = null;
function getDbSettings() {
    if (!_dbSettings) _dbSettings = require('./db-settings');
    return _dbSettings;
}

function workflowFastqDir() {
    return path.join(ANALYSIS_CONFIG.WORKFLOW_DIR, 'fastQ_reads');
}

function workflowClarkResultsDir() {
    return path.join(ANALYSIS_CONFIG.WORKFLOW_DIR, 'results', 'clark');
}

/**
 * Basename for Snakemake sample= (must match fastQ_reads/{sample}.fastq)
 */
function sampleBaseFromPath(filePath) {
    let base = path.basename(filePath);
    base = base.replace(/\.(fastq|fq)(\.gz)?$/i, '');
    base = base.replace(/[^a-zA-Z0-9_-]+/g, '_');
    return base || 'sample';
}

function prepareFastqForWorkflow(sourcePath, sampleBase) {
    const destDir = workflowFastqDir();
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, `${sampleBase}.fastq`);

    return new Promise((resolve, reject) => {
        const lower = sourcePath.toLowerCase();
        if (lower.endsWith('.gz')) {
            const src = fs.createReadStream(sourcePath);
            const out = fs.createWriteStream(dest);
            const gunzip = zlib.createGunzip();
            src.on('error', reject);
            out.on('error', reject);
            out.on('finish', () => resolve(dest));
            src.pipe(gunzip).pipe(out);
        } else {
            try {
                fs.copyFileSync(sourcePath, dest);
                resolve(dest);
            } catch (e) {
                reject(e);
            }
        }
    });
}



function mergeFrontendMetadata(clarkJson, userConfig) {
    const out = { ...clarkJson };
    if (userConfig.analysis_name) {
        out.analysis_name = userConfig.analysis_name;
    }
    if (userConfig.sample_type) {
        out.sample_type = userConfig.sample_type;
    }
    if (!out.completed_at && out.processed_date) {
        try {
            out.completed_at = new Date(out.processed_date.replace(' ', 'T')).toISOString();
        } catch {
            out.completed_at = new Date().toISOString();
        }
    }
    if (!Array.isArray(out.pathogens) && Array.isArray(out.pathogens_detected)) {
        out.pathogens = out.pathogens_detected.map((p) => ({
            name: p.name,
            strain: '—',
            tax_id: p.tax_id,
            abundance: typeof p.abundance === 'number' ? Math.round(p.abundance * 100) / 100 : p.abundance,
            reads: p.reads,
            confidence: 75,
            amr_genes: 0,
            virulence_genes: 0,
            risk_level: 'low',
        }));
    }
    if (!out.quality || out.quality.average_quality == null) {
        out.quality = {
            average_quality: out.quality?.average_quality ?? null,
            high_quality_rate: out.quality?.high_quality_rate ?? null,
            mean_coverage: out.quality?.mean_coverage ?? null,
            note: out.quality?.note || 'Not computed by pipeline',
        };
    }
    return out;
}

function copyOptionalArtifacts(sampleBase, outputDir) {
    const srcDir = workflowClarkResultsDir();
    const files = [`${sampleBase}.clark.csv`, `${sampleBase}.abundance.csv`];
    const names = {};
    for (const f of files) {
        const from = path.join(srcDir, f);
        if (fs.existsSync(from)) {
            const to = path.join(outputDir, f);
            fs.copyFileSync(from, to);
            names[f.endsWith('clark.csv') ? 'clark_csv' : 'abundance_csv'] = f;
        }
    }
    return names;
}

function killProcessTree(child) {
    if (!child || !child.pid) return;
    if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
        try {
            child.kill('SIGTERM');
        } catch {
            /* ignore */
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Progress parser — handles both CPU (Docker) and GPU (SSH) engine patterns
// ═════════════════════════════════════════════════════════════════════════════
/**
 * Parse Snakemake stdout/stderr chunks and update the analysis state.
 * Recognizes patterns from both engines:
 *   CPU: Docker/CLARK-l/estimate_abundance logs
 *   GPU: [EDGE] markers, scp/ssh patterns
 */
function parseSnakemakeProgress(chunk, analysis) {
    const s = chunk.toString();
    const isGpu = analysis.config?.engine === 'gpu';

    if (isGpu) {
        // ── GPU engine stages ─────────────────────────────────────────
        if (/\[EDGE\] Preparing remote|clark_lite_classify|Running job/.test(s)) {
            analysis.progress = Math.max(analysis.progress, 12);
            analysis.status = 'connecting';
            analysis.message = 'Connecting to Jetson Nano...';
        }
        if (/\[EDGE\] ERROR/.test(s)) {
            analysis.status = 'error';
            analysis.message = 'Cannot reach Jetson Nano — check Tailscale VPN';
        }
        if (/\[EDGE\] FASTQ already present/.test(s)) {
            analysis.progress = Math.max(analysis.progress, 22);
            analysis.status = 'uploading';
            analysis.message = 'FASTQ already on Jetson Nano — skipping upload';
        } else if (/\[EDGE\] Uploading FASTQ|scp.*\.fastq/.test(s)) {
            analysis.progress = Math.max(analysis.progress, 18);
            analysis.status = 'uploading';
            analysis.message = 'Uploading FASTQ to Jetson Nano...';
        }
        if (/\[EDGE\] Freeing GPU memory/.test(s)) {
            analysis.progress = Math.max(analysis.progress, 28);
            analysis.status = 'preparing';
            analysis.message = 'Freeing GPU memory on Jetson Nano...';
        }
        if (/\[EDGE\] Running CU-CLARK|CU-CLARK-L|GPU classification/.test(s)) {
            analysis.progress = Math.max(analysis.progress, 35);
            analysis.status = 'classifying';
            analysis.message = 'Running CU-CLARK-L GPU classification on Jetson Nano...';
        }
        if (/\[EDGE\] Downloading classification|scp.*clark\.csv/.test(s)) {
            analysis.progress = Math.max(analysis.progress, 52);
            analysis.status = 'downloading';
            analysis.message = 'Downloading classification results from Jetson Nano...';
        }
        if (/\[EDGE\] Cleaning up/.test(s)) {
            analysis.progress = Math.max(analysis.progress, 58);
            analysis.status = 'processing';
            analysis.message = 'Cleaning up remote files...';
        }
        if (/\[EDGE\] Downloading taxonomy|clark_abundance/.test(s)) {
            analysis.progress = Math.max(analysis.progress, 65);
            analysis.status = 'processing';
            analysis.message = 'Computing abundance (local)...';
        }
        if (/\[LOCAL\] Abundance report complete/.test(s)) {
            analysis.progress = Math.max(analysis.progress, 80);
            analysis.status = 'processing';
            analysis.message = 'Abundance estimation complete...';
        }
    } else {
        // ── CPU engine stages ─────────────────────────────────────────
        if (/clark_lite_classify|CLARK-l|Running job/.test(s)) {
            analysis.progress = Math.max(analysis.progress, 35);
            analysis.status = 'classifying';
            analysis.message = 'Running CLARK-l classification (Docker)...';
        }
        if (/clark_abundance|estimate_abundance/.test(s)) {
            analysis.progress = Math.max(analysis.progress, 70);
            analysis.status = 'processing';
            analysis.message = 'Estimating abundance...';
        }
    }

    // ── Shared: JSON conversion / completion ──────────────────────────
    if (/clark_to_json|Finished job/.test(s)) {
        analysis.progress = Math.max(analysis.progress, 92);
        analysis.status = 'finalizing';
        analysis.message = 'Converting results to JSON...';
    }
}

async function startAnalysis(config) {
    try {
        const analysisId = generateAnalysisId();
        const inputFiles = config.input_files || [];
        if (inputFiles.length === 0) {
            return { success: false, error: 'No input files provided' };
        }

        for (const file of inputFiles) {
            if (!fs.existsSync(file)) {
                return { success: false, error: `Input file not found: ${file}` };
            }
        }

        const outputDir = path.join(ANALYSIS_CONFIG.RESULTS_DIR, analysisId);
        fs.mkdirSync(outputDir, { recursive: true });

        const primaryFastq = inputFiles[0];
        const sampleBase = sampleBaseFromPath(primaryFastq);

        // Capture engine selection from UI (default: cpu)
        const engine = config.engine || 'cpu';

        const snakemakeConfig = {
            analysis_id: analysisId,
            analysis_name: config.analysis_name,
            sample_type: config.sample_type || 'clinical',
            input_files: inputFiles,
            sample_base: sampleBase,
            output_dir: outputDir,
            confidence_threshold: config.confidence_threshold || 0.7,
            threads: config.threads || ANALYSIS_CONFIG.DEFAULT_THREADS,
            timestamp: config.timestamp || new Date().toISOString(),
            engine: engine,
        };

        fs.writeFileSync(
            path.join(outputDir, 'config.json'),
            JSON.stringify(snakemakeConfig, null, 2)
        );

        if (!ANALYSIS_CONFIG.USE_MOCK) {
            if (!fs.existsSync(ANALYSIS_CONFIG.WORKFLOW_DIR)) {
                return {
                    success: false,
                    error: `Workflow directory not found: ${ANALYSIS_CONFIG.WORKFLOW_DIR}`,
                };
            }
            await prepareFastqForWorkflow(primaryFastq, sampleBase);

            // We no longer build the custom DB here; it is built automatically on import
            // via the Database Management page (which guarantees reads_mapping is respected).
            const dbType = config.database || 'default';
            if (dbType === 'custom') {
                const dbSettings = getDbSettings();
                const settings = dbSettings.loadSettings();
                if (!settings.isBuilt) {
                    return { success: false, error: 'Custom database has not been successfully built yet. Please build it in Database Management first.' };
                }
            }
        }

        const analysisState = {
            id: analysisId,
            config: snakemakeConfig,
            status: 'starting',
            progress: 5,
            startTime: Date.now(),
            outputDir,
            sampleBase,
            snakemakeProc: null,
            mockTimer: null,
        };
        activeAnalyses.set(analysisId, analysisState);

        runSnakemakeWorkflow(analysisId, snakemakeConfig);

        return { success: true, analysisId, outputDir };
    } catch (error) {
        console.error('Failed to start analysis:', error);
        return { success: false, error: error.message };
    }
}

function runSnakemakeWorkflow(analysisId, config) {
    const analysis = activeAnalyses.get(analysisId);
    if (!analysis) return;

    const engine = config.engine || 'cpu';
    const engineLabel = engine === 'gpu' ? 'GPU (Jetson Nano)' : 'CPU (Docker)';

    analysis.status = 'running';
    analysis.progress = 10;
    analysis.message = `Starting ${engineLabel} workflow...`;
    emitProgress(analysisId, {
        progress: analysis.progress,
        status: analysis.status,
        message: analysis.message,
    });

    if (ANALYSIS_CONFIG.USE_MOCK) {
        simulateWorkflow(analysisId);
        return;
    }

    const wf = ANALYSIS_CONFIG.WORKFLOW_DIR;
    const threads = String(config.threads || ANALYSIS_CONFIG.DEFAULT_THREADS);
    const sampleArg = `sample=${analysis.sampleBase}`;
    const engineArg = `engine=${engine}`;
    const snakemakeArgs = [
        '-m',
        'snakemake',
        '-d',
        wf,
        '--cores',
        threads,
        '--nolock',
        '--config',
        sampleArg,
        engineArg,
    ];
    const candidates = [
        ['python', []],
        ['py', ['-3']],
        ['python3', []],
    ];

    const launch = (idx) => {
        if (idx >= candidates.length) {
            const engineMsg = engine === 'gpu'
                ? 'Ensure Tailscale is connected and SSH to the Jetson Nano is configured.'
                : 'Ensure Docker Desktop is running.';
            completeAnalysis(
                analysisId,
                false,
                `Could not start Snakemake. Install Python 3, run \`pip install snakemake\`. ${engineMsg}`
            );
            return;
        }
        const [cmd, prefix] = candidates[idx];
        const proc = spawn(cmd, [...prefix, ...snakemakeArgs], {
            cwd: wf,
            env: { ...process.env },
        });
        proc.once('error', () => launch(idx + 1));
        proc.once('spawn', () => attachSnakemakeHandlers(proc, analysisId, analysis));
    };
    launch(0);
}

function attachSnakemakeHandlers(proc, analysisId, analysis) {
    analysis.snakemakeProc = proc;

    let stderrBuf = '';
    proc.stdout.on('data', (d) => {
        console.log(`[Snakemake ${analysisId}]`, d.toString());
        parseSnakemakeProgress(d, analysis);
        emitProgress(analysisId, {
            progress: analysis.progress,
            status: analysis.status,
            message: analysis.message,
        });
    });
    proc.stderr.on('data', (d) => {
        stderrBuf += d.toString();
        console.error(`[Snakemake ${analysisId}]`, d.toString());
        parseSnakemakeProgress(d, analysis);
        emitProgress(analysisId, {
            progress: analysis.progress,
            status: analysis.status,
            message: analysis.message,
        });
    });
    proc.on('error', (err) => {
        console.error(err);
        completeAnalysis(analysisId, false, err.message);
    });
    proc.on('close', (code) => {
        analysis.snakemakeProc = null;
        if (code === 0) {
            finishFromClarkJson(analysisId);
        } else {
            completeAnalysis(
                analysisId,
                false,
                `Snakemake exited with code ${code}. ${stderrBuf.slice(-2000)}`
            );
        }
    });
}

function finishFromClarkJson(analysisId) {
    const analysis = activeAnalyses.get(analysisId);
    if (!analysis) return;

    const clarkPath = path.join(
        workflowClarkResultsDir(),
        `${analysis.sampleBase}.json`
    );
    if (!fs.existsSync(clarkPath)) {
        completeAnalysis(
            analysisId,
            false,
            `Expected CLARK output missing: ${clarkPath}`
        );
        return;
    }

    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(clarkPath, 'utf-8'));
    } catch (e) {
        completeAnalysis(analysisId, false, `Invalid JSON from workflow: ${e.message}`);
        return;
    }

    const merged = mergeFrontendMetadata(raw, analysis.config);
    const artifacts = copyOptionalArtifacts(analysis.sampleBase, analysis.outputDir);
    merged.artifacts = artifacts;

    analysis.results = merged;
    const resultsPath = path.join(analysis.outputDir, 'results.json');
    fs.writeFileSync(resultsPath, JSON.stringify(merged, null, 2));

    completeAnalysis(analysisId, true);
}

// ═════════════════════════════════════════════════════════════════════════════
// Mock workflow — stages adapt to engine selection
// ═════════════════════════════════════════════════════════════════════════════
function simulateWorkflow(analysisId) {
    const analysis = activeAnalyses.get(analysisId);
    if (!analysis) return;

    const isGpu = analysis.config?.engine === 'gpu';

    const stages = isGpu
        ? [
            { progress: 15, status: 'connecting', message: 'Connecting to Jetson Nano...' },
            { progress: 20, status: 'uploading', message: 'Uploading FASTQ to Jetson Nano...' },
            { progress: 45, status: 'classifying', message: 'Running CU-CLARK-L GPU classification on Jetson Nano...' },
            { progress: 55, status: 'downloading', message: 'Downloading classification results...' },
            { progress: 70, status: 'processing', message: 'Computing abundance (local)...' },
            { progress: 85, status: 'processing', message: 'Abundance estimation complete...' },
            { progress: 95, status: 'finalizing', message: 'Converting results to JSON...' },
        ]
        : [
            { progress: 25, status: 'preprocessing', message: 'Preparing FASTQ...' },
            { progress: 45, status: 'classifying', message: 'Running CLARK-l classification (Docker)...' },
            { progress: 75, status: 'processing', message: 'Estimating abundance...' },
            { progress: 95, status: 'finalizing', message: 'Converting results to JSON...' },
        ];

    let stageIndex = 0;
    analysis.mockTimer = setInterval(() => {
        if (stageIndex >= stages.length) {
            clearInterval(analysis.mockTimer);
            analysis.mockTimer = null;
            analysis.results = generateMockResults(analysis.config);
            fs.writeFileSync(
                path.join(analysis.outputDir, 'results.json'),
                JSON.stringify(analysis.results, null, 2)
            );
            completeAnalysis(analysisId, true);
            return;
        }
        const stage = stages[stageIndex];
        analysis.progress = stage.progress;
        analysis.status = stage.status;
        analysis.message = stage.message;
        emitProgress(analysisId, stage);
        stageIndex++;
    }, 1500);
}

function completeAnalysis(analysisId, success, error = null) {
    const analysis = activeAnalyses.get(analysisId);
    if (!analysis) return;

    analysis.status = success ? 'completed' : 'failed';
    analysis.progress = success ? 100 : analysis.progress;
    analysis.endTime = Date.now();
    analysis.error = error;

    if (analysis.mockTimer) {
        clearInterval(analysis.mockTimer);
        analysis.mockTimer = null;
    }

    const record = {
        id: analysis.id,
        analysis_name: analysis.config.analysis_name,
        sample_type: analysis.config.sample_type,
        status: analysis.status,
        progress: analysis.progress,
        startTime: analysis.startTime,
        endTime: analysis.endTime,
        completed_at: analysis.results?.completed_at,
        error: analysis.error,
        config: analysis.config,
        results: analysis.results,
        outputDir: analysis.outputDir,
    };

    analysisHistory.push(record);
    activeAnalyses.delete(analysisId);

    emitProgress(analysisId, {
        progress: analysis.progress,
        status: analysis.status,
        message: success ? 'Analysis complete' : (error || 'Failed'),
        results: analysis.results,
        analysis_name: analysis.config.analysis_name,
        sample_type: analysis.config.sample_type,
        completed_at: analysis.results?.completed_at,
    });

    if (global.mainWindow) {
        global.mainWindow.webContents.send('analysis:complete', {
            analysisId,
            success,
            error,
        });
    }

    console.log(`Analysis ${analysisId} ${success ? 'completed' : 'failed'} [engine=${analysis.config?.engine}]`);
}

function generateMockResults(cfg) {
    const classifier = cfg.engine === 'gpu' ? 'CU-CLARK-L (GPU)' : 'CLARK-l';
    return {
        analysis_name: cfg.analysis_name || 'Mock analysis',
        sample_type: cfg.sample_type || 'clinical',
        completed_at: new Date().toISOString(),
        sample_id: 'mock',
        processed_date: new Date().toISOString().slice(0, 19).replace('T', ' '),
        classifier: classifier,
        summary: {
            total_reads: 11890000,
            classified_reads: 7560000,
            classification_rate: 63.6,
            species_detected: 342,
            pathogens_detected: 4,
            amr_genes: 19,
        },
        quality: {
            average_quality: 38,
            high_quality_rate: 94.2,
            mean_coverage: 145,
        },
        pathogens: [
            {
                name: 'Escherichia coli',
                strain: 'O157:H7',
                tax_id: 83334,
                abundance: 45.2,
                reads: 3420000,
                confidence: 95,
                amr_genes: 5,
                virulence_genes: 12,
                risk_level: 'high',
            },
            {
                name: 'Staphylococcus aureus',
                strain: 'MRSA USA300',
                tax_id: 46170,
                abundance: 18.6,
                reads: 1410000,
                confidence: 87,
                amr_genes: 7,
                virulence_genes: 8,
                risk_level: 'high',
            },
            {
                name: 'Pseudomonas aeruginosa',
                strain: 'PAO1',
                tax_id: 208964,
                abundance: 8.3,
                reads: 630000,
                confidence: 82,
                amr_genes: 4,
                virulence_genes: 6,
                risk_level: 'medium',
            },
            {
                name: 'Klebsiella pneumoniae',
                strain: 'KPC+',
                tax_id: 573,
                abundance: 5.1,
                reads: 390000,
                confidence: 78,
                amr_genes: 3,
                virulence_genes: 4,
                risk_level: 'high',
            },
        ],
        pathogens_detected: [],
        taxonomy: {
            bacteria: 71,
            viruses: 4.8,
            proteobacteria: 48,
            firmicutes: 18,
        },
    };
}

function emitProgress(analysisId, progress) {
    if (global.mainWindow) {
        global.mainWindow.webContents.send('analysis:progress', {
            analysisId,
            ...progress,
        });
    }
}

function getAnalysisStatus(analysisId) {
    const active = activeAnalyses.get(analysisId);
    if (active) return { ...active };
    const completed = analysisHistory.find((a) => a.id === analysisId);
    if (completed) return { ...completed };
    return null;
}

function getAnalysisResults(analysisId) {
    const active = activeAnalyses.get(analysisId);
    if (active?.results) return active.results;
    const completed = analysisHistory.find((a) => a.id === analysisId);
    if (completed?.results) return completed.results;
    const resultsPath = path.join(ANALYSIS_CONFIG.RESULTS_DIR, analysisId, 'results.json');
    if (fs.existsSync(resultsPath)) {
        return JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
    }
    return null;
}

function getAllAnalyses() {
    const active = Array.from(activeAnalyses.values()).map((a) => ({
        id: a.id,
        analysis_name: a.config?.analysis_name,
        sample_type: a.config?.sample_type,
        status: a.status,
        progress: a.progress,
        startTime: a.startTime,
        message: a.message,
        config: a.config,
        results: a.results,
    }));
    return [...active, ...analysisHistory].sort((a, b) => b.startTime - a.startTime);
}

function cancelAnalysis(analysisId) {
    const analysis = activeAnalyses.get(analysisId);
    if (!analysis) return { success: false, error: 'Analysis not found' };

    if (analysis.snakemakeProc) {
        killProcessTree(analysis.snakemakeProc);
        analysis.snakemakeProc = null;
    }
    if (analysis.mockTimer) {
        clearInterval(analysis.mockTimer);
        analysis.mockTimer = null;
    }

    analysis.status = 'cancelled';
    analysisHistory.push({
        id: analysis.id,
        analysis_name: analysis.config.analysis_name,
        sample_type: analysis.config.sample_type,
        status: 'cancelled',
        startTime: analysis.startTime,
        endTime: Date.now(),
        config: analysis.config,
        outputDir: analysis.outputDir,
    });
    activeAnalyses.delete(analysisId);
    return { success: true };
}

function pauseAnalysis(analysisId) {
    const analysis = activeAnalyses.get(analysisId);
    if (!analysis) return { success: false, error: 'Analysis not found' };
    if (analysis.snakemakeProc) {
        return { success: false, error: 'Pause is not supported while classification is running' };
    }
    analysis.status = 'paused';
    analysis.pausedAt = Date.now();
    emitProgress(analysisId, {
        status: 'paused',
        progress: analysis.progress,
        message: 'Analysis paused',
    });
    return { success: true };
}

function resumeAnalysis(analysisId) {
    const analysis = activeAnalyses.get(analysisId);
    if (!analysis) return { success: false, error: 'Analysis not found' };
    if (analysis.status !== 'paused') {
        return { success: false, error: 'Analysis is not paused' };
    }
    analysis.status = 'running';
    delete analysis.pausedAt;
    emitProgress(analysisId, {
        status: 'running',
        progress: analysis.progress,
        message: 'Analysis resumed',
    });
    return { success: true };
}

function deleteAnalysis(analysisId, deleteFiles = true) {
    const historyIndex = analysisHistory.findIndex((a) => a.id === analysisId);
    if (historyIndex === -1) {
        return { success: false, error: 'Analysis not found' };
    }
    const analysis = analysisHistory[historyIndex];
    analysisHistory.splice(historyIndex, 1);
    if (deleteFiles && analysis.outputDir && fs.existsSync(analysis.outputDir)) {
        try {
            fs.rmSync(analysis.outputDir, { recursive: true, force: true });
        } catch (error) {
            console.error(`Failed to delete analysis files: ${error.message}`);
        }
    }
    return { success: true };
}

function generateAnalysisId() {
    return `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = {
    startAnalysis,
    getAnalysisStatus,
    getAnalysisResults,
    getAllAnalyses,
    cancelAnalysis,
    pauseAnalysis,
    resumeAnalysis,
    deleteAnalysis,
    ANALYSIS_CONFIG,
};
