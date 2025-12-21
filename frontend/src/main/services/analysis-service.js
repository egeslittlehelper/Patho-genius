/**
 * ANALYSIS SERVICE
 * Purpose: Interface between Electron frontend and Snakemake workflow
 * 
 * This service handles:
 * - Starting Snakemake workflows
 * - Monitoring analysis progress
 * - Reading results from output files
 * - Managing analysis history
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const ANALYSIS_CONFIG = {
    // Path to Snakemake workflow directory (configure based on installation)
    WORKFLOW_DIR: process.env.SNAKEMAKE_WORKFLOW_DIR || path.join(__dirname, '../../../workflow'),
    
    // Results output directory
    RESULTS_DIR: process.env.RESULTS_DIR || path.join(__dirname, '../../../results'),
    
    // Kraken2 database path
    KRAKEN2_DB: process.env.KRAKEN2_DB || path.join(__dirname, '../../../database/kraken2'),
    
    // Default thread count
    DEFAULT_THREADS: 4
};

// In-memory analysis tracking
const activeAnalyses = new Map();
const analysisHistory = [];

/**
 * Start a new analysis workflow
 * @param {object} config - Analysis configuration from frontend
 * @returns {Promise<{success: boolean, analysisId?: string, error?: string}>}
 */
async function startAnalysis(config) {
    try {
        const analysisId = generateAnalysisId();
        
        // Validate input files exist
        for (const file of config.input_files) {
            if (!fs.existsSync(file)) {
                return { success: false, error: `Input file not found: ${file}` };
            }
        }

        // Create output directory
        const outputDir = path.join(ANALYSIS_CONFIG.RESULTS_DIR, analysisId);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Prepare Snakemake config file
        const snakemakeConfig = {
            analysis_id: analysisId,
            analysis_name: config.analysis_name,
            sample_type: config.sample_type,
            input_files: config.input_files,
            output_dir: outputDir,
            database_path: ANALYSIS_CONFIG.KRAKEN2_DB,
            confidence_threshold: config.confidence_threshold || 0.7,
            threads: config.threads || ANALYSIS_CONFIG.DEFAULT_THREADS,
            timestamp: config.timestamp || new Date().toISOString()
        };

        // Write config file for Snakemake
        const configPath = path.join(outputDir, 'config.json');
        fs.writeFileSync(configPath, JSON.stringify(snakemakeConfig, null, 2));

        // Track analysis
        const analysisState = {
            id: analysisId,
            config: snakemakeConfig,
            status: 'starting',
            progress: 0,
            startTime: Date.now(),
            outputDir: outputDir
        };
        activeAnalyses.set(analysisId, analysisState);

        // Start Snakemake workflow (async)
        runSnakemakeWorkflow(analysisId, snakemakeConfig);

        return { 
            success: true, 
            analysisId,
            outputDir 
        };

    } catch (error) {
        console.error('Failed to start analysis:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Run Snakemake workflow as child process
 * @param {string} analysisId 
 * @param {object} config 
 */
function runSnakemakeWorkflow(analysisId, config) {
    const analysis = activeAnalyses.get(analysisId);
    if (!analysis) return;

    // Update status
    analysis.status = 'running';
    analysis.progress = 10;

    // TODO: Replace with actual Snakemake command when workflow is ready
    // Example Snakemake invocation:
    /*
    const snakemake = spawn('snakemake', [
        '--snakefile', path.join(ANALYSIS_CONFIG.WORKFLOW_DIR, 'Snakefile'),
        '--configfile', path.join(config.output_dir, 'config.json'),
        '--cores', config.threads.toString(),
        '--directory', config.output_dir,
        'all'  // Target rule
    ]);

    snakemake.stdout.on('data', (data) => {
        console.log(`[Snakemake ${analysisId}]: ${data}`);
        // Parse progress from output
        updateProgress(analysisId, data.toString());
    });

    snakemake.stderr.on('data', (data) => {
        console.error(`[Snakemake ${analysisId} Error]: ${data}`);
    });

    snakemake.on('close', (code) => {
        if (code === 0) {
            completeAnalysis(analysisId, true);
        } else {
            completeAnalysis(analysisId, false, `Snakemake exited with code ${code}`);
        }
    });
    */

    // MOCK: Simulate workflow progress for development
    simulateWorkflow(analysisId);
}

/**
 * Simulate workflow progress (for development without Snakemake)
 */
function simulateWorkflow(analysisId) {
    const analysis = activeAnalyses.get(analysisId);
    if (!analysis) return;

    const stages = [
        { progress: 20, status: 'preprocessing', message: 'Quality filtering reads...' },
        { progress: 40, status: 'classifying', message: 'Running Kraken2 classification...' },
        { progress: 70, status: 'processing', message: 'Processing classification results...' },
        { progress: 90, status: 'finalizing', message: 'Generating reports...' },
        { progress: 100, status: 'completed', message: 'Analysis complete' }
    ];

    let stageIndex = 0;
    const interval = setInterval(() => {
        if (stageIndex >= stages.length) {
            clearInterval(interval);
            completeAnalysis(analysisId, true);
            return;
        }

        const stage = stages[stageIndex];
        analysis.progress = stage.progress;
        analysis.status = stage.status;
        analysis.message = stage.message;

        // Emit progress event (will be sent to renderer via IPC)
        emitProgress(analysisId, stage);

        stageIndex++;
    }, 2000); // 2 second intervals
}

/**
 * Complete analysis and save results
 */
function completeAnalysis(analysisId, success, error = null) {
    const analysis = activeAnalyses.get(analysisId);
    if (!analysis) return;

    analysis.status = success ? 'completed' : 'failed';
    analysis.progress = success ? 100 : analysis.progress;
    analysis.endTime = Date.now();
    analysis.error = error;

    // Generate mock results (replace with actual result parsing)
    if (success) {
        analysis.results = generateMockResults(analysis.config);
        
        // Save results to file
        const resultsPath = path.join(analysis.outputDir, 'results.json');
        fs.writeFileSync(resultsPath, JSON.stringify(analysis.results, null, 2));
    }

    // Move to history
    analysisHistory.push({ ...analysis });
    activeAnalyses.delete(analysisId);

    console.log(`Analysis ${analysisId} ${success ? 'completed' : 'failed'}`);
}

/**
 * Generate mock results (replace with actual Kraken2 output parsing)
 */
function generateMockResults(config) {
    return {
        analysis_name: config.analysis_name,
        sample_type: config.sample_type,
        completed_at: new Date().toISOString(),
        
        summary: {
            total_reads: 11890000,
            classified_reads: 7560000,
            classification_rate: 63.6,
            species_detected: 342,
            pathogens_detected: 4,
            amr_genes: 19
        },
        
        quality: {
            average_quality: 38,
            high_quality_rate: 94.2,
            mean_coverage: 145
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
                risk_level: 'high'
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
                risk_level: 'high'
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
                risk_level: 'medium'
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
                risk_level: 'high'
            }
        ],
        
        taxonomy: {
            bacteria: 71,
            viruses: 4.8,
            proteobacteria: 48,
            firmicutes: 18
        }
    };
}

/**
 * Emit progress to renderer (called from main process)
 */
function emitProgress(analysisId, progress) {
    // This will be implemented in main.js to send to renderer
    if (global.mainWindow) {
        global.mainWindow.webContents.send('analysis:progress', {
            analysisId,
            ...progress
        });
    }
}

/**
 * Get analysis status
 */
function getAnalysisStatus(analysisId) {
    const active = activeAnalyses.get(analysisId);
    if (active) return { ...active };
    
    const completed = analysisHistory.find(a => a.id === analysisId);
    if (completed) return { ...completed };
    
    return null;
}

/**
 * Get analysis results
 */
function getAnalysisResults(analysisId) {
    // Check active first
    const active = activeAnalyses.get(analysisId);
    if (active?.results) return active.results;
    
    // Check history
    const completed = analysisHistory.find(a => a.id === analysisId);
    if (completed?.results) return completed.results;
    
    // Try to read from file
    const resultsPath = path.join(ANALYSIS_CONFIG.RESULTS_DIR, analysisId, 'results.json');
    if (fs.existsSync(resultsPath)) {
        return JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
    }
    
    return null;
}

/**
 * Get all analyses (for history/dashboard)
 */
function getAllAnalyses() {
    const active = Array.from(activeAnalyses.values());
    return [...active, ...analysisHistory].sort((a, b) => b.startTime - a.startTime);
}

/**
 * Cancel running analysis
 */
function cancelAnalysis(analysisId) {
    const analysis = activeAnalyses.get(analysisId);
    if (!analysis) return { success: false, error: 'Analysis not found' };
    
    // TODO: Kill Snakemake process
    analysis.status = 'cancelled';
    analysisHistory.push({ ...analysis, endTime: Date.now() });
    activeAnalyses.delete(analysisId);
    
    return { success: true };
}

/**
 * Pause running analysis
 */
function pauseAnalysis(analysisId) {
    const analysis = activeAnalyses.get(analysisId);
    if (!analysis) return { success: false, error: 'Analysis not found' };
    
    // TODO: Send SIGSTOP to Snakemake process
    analysis.status = 'paused';
    analysis.pausedAt = Date.now();
    
    emitProgress(analysisId, { status: 'paused', progress: analysis.progress, message: 'Analysis paused' });
    
    return { success: true };
}

/**
 * Resume paused analysis
 */
function resumeAnalysis(analysisId) {
    const analysis = activeAnalyses.get(analysisId);
    if (!analysis) return { success: false, error: 'Analysis not found' };
    
    if (analysis.status !== 'paused') {
        return { success: false, error: 'Analysis is not paused' };
    }
    
    // TODO: Send SIGCONT to Snakemake process
    analysis.status = 'running';
    delete analysis.pausedAt;
    
    emitProgress(analysisId, { status: 'running', progress: analysis.progress, message: 'Analysis resumed' });
    
    return { success: true };
}

/**
 * Delete analysis (removes from history and optionally from disk)
 */
function deleteAnalysis(analysisId, deleteFiles = false) {
    // Remove from history
    const historyIndex = analysisHistory.findIndex(a => a.id === analysisId);
    if (historyIndex !== -1) {
        const analysis = analysisHistory[historyIndex];
        analysisHistory.splice(historyIndex, 1);
        
        // Optionally delete files
        if (deleteFiles && analysis.outputDir && fs.existsSync(analysis.outputDir)) {
            try {
                fs.rmSync(analysis.outputDir, { recursive: true, force: true });
                console.log(`Deleted analysis files: ${analysis.outputDir}`);
            } catch (error) {
                console.error(`Failed to delete analysis files: ${error.message}`);
            }
        }
        
        return { success: true };
    }
    
    return { success: false, error: 'Analysis not found' };
}

/**
 * Generate unique analysis ID
 */
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
    ANALYSIS_CONFIG
};

