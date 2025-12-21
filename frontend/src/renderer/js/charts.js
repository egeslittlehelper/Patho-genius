/**
 * CHARTS.JS - Interactive Visualization Components
 * Purpose: Render interactive charts for analysis results
 * Charts: Sunburst, Sankey, Treemap with tooltips and hover effects
 */

const Charts = {
    // Tooltip element (shared across charts)
    tooltip: null,

    /**
     * Initialize charts module
     */
    init() {
        this.createTooltip();
        console.log('Charts module initialized');
    },

    /**
     * Create shared tooltip element
     */
    createTooltip() {
        if (this.tooltip) return;
        
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'chart-tooltip';
        this.tooltip.innerHTML = `
            <div class="tooltip-title"></div>
            <div class="tooltip-content"></div>
        `;
        document.body.appendChild(this.tooltip);
    },

    /**
     * Show tooltip at position
     */
    showTooltip(x, y, title, content) {
        if (!this.tooltip) this.createTooltip();
        
        const titleEl = this.tooltip.querySelector('.tooltip-title');
        const contentEl = this.tooltip.querySelector('.tooltip-content');
        
        titleEl.textContent = title;
        contentEl.innerHTML = content;
        
        // Position tooltip
        const rect = this.tooltip.getBoundingClientRect();
        const offsetX = 15;
        const offsetY = 15;
        
        let left = x + offsetX;
        let top = y + offsetY;
        
        // Keep tooltip in viewport
        if (left + rect.width > window.innerWidth) {
            left = x - rect.width - offsetX;
        }
        if (top + rect.height > window.innerHeight) {
            top = y - rect.height - offsetY;
        }
        
        this.tooltip.style.left = `${left}px`;
        this.tooltip.style.top = `${top}px`;
        this.tooltip.classList.add('visible');
    },

    /**
     * Hide tooltip
     */
    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.classList.remove('visible');
        }
    },

    // ============================================
    // SUNBURST CHART
    // Hierarchical taxonomy visualization
    // ============================================

    /**
     * Render sunburst chart
     * @param {string} containerId - Container element ID
     * @param {object} data - Hierarchical taxonomy data
     */
    renderSunburst(containerId, data = null) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Use mock data if not provided
        const chartData = data || this.getMockSunburstData();
        
        // Calculate dimensions
        const width = container.clientWidth || 400;
        const height = 400;
        const centerX = width / 2;
        const centerY = height / 2;
        const maxRadius = Math.min(width, height) / 2 - 20;

        // Create SVG
        container.innerHTML = `
            <svg width="${width}" height="${height}" class="sunburst-chart">
                <g transform="translate(${centerX}, ${centerY})">
                    ${this.generateSunburstSegments(chartData, maxRadius)}
                </g>
            </svg>
            <div class="chart-legend sunburst-legend">
                ${this.generateSunburstLegend(chartData)}
            </div>
        `;

        // Add event listeners
        this.attachSunburstEvents(container);
    },

    /**
     * Generate sunburst segments recursively
     */
    generateSunburstSegments(data, maxRadius, startAngle = 0, endAngle = 360, level = 0, parentColor = null) {
        const segments = [];
        const innerRadius = level * (maxRadius / 3);
        const outerRadius = (level + 1) * (maxRadius / 3);
        
        let currentAngle = startAngle;
        const totalValue = data.children ? data.children.reduce((sum, c) => sum + c.value, 0) : data.value;

        const items = data.children || [data];
        
        items.forEach((item, idx) => {
            const angleSpan = (item.value / totalValue) * (endAngle - startAngle);
            const itemEndAngle = currentAngle + angleSpan;
            
            // Generate color
            const color = item.color || parentColor || this.getColorForIndex(idx, items.length);
            const lighterColor = this.lightenColor(color, level * 15);
            
            // Create arc path
            const path = this.describeArc(0, 0, innerRadius, outerRadius, currentAngle, itemEndAngle);
            
            segments.push(`
                <path 
                    d="${path}" 
                    fill="${lighterColor}"
                    stroke="white"
                    stroke-width="2"
                    class="sunburst-segment"
                    data-name="${item.name}"
                    data-value="${item.value}"
                    data-percentage="${((item.value / totalValue) * 100).toFixed(1)}"
                    data-level="${level}"
                    data-reads="${item.reads || 'N/A'}"
                    data-confidence="${item.confidence || 'N/A'}"
                />
            `);

            // Add label for larger segments
            if (angleSpan > 20 && level < 2) {
                const midAngle = (currentAngle + itemEndAngle) / 2;
                const labelRadius = (innerRadius + outerRadius) / 2;
                const labelX = labelRadius * Math.cos((midAngle - 90) * Math.PI / 180);
                const labelY = labelRadius * Math.sin((midAngle - 90) * Math.PI / 180);
                
                segments.push(`
                    <text 
                        x="${labelX}" 
                        y="${labelY}" 
                        class="sunburst-label"
                        text-anchor="middle"
                        dominant-baseline="middle"
                        fill="${level === 0 ? 'white' : '#374151'}"
                        font-size="${level === 0 ? '12' : '10'}"
                    >${item.name}</text>
                `);
            }

            // Recurse for children
            if (item.children && item.children.length > 0) {
                segments.push(this.generateSunburstSegments(
                    item, maxRadius, currentAngle, itemEndAngle, level + 1, color
                ));
            }

            currentAngle = itemEndAngle;
        });

        return segments.join('');
    },

    /**
     * Generate legend for sunburst
     */
    generateSunburstLegend(data) {
        const items = data.children || [];
        return items.map((item, idx) => `
            <span class="legend-item">
                <span class="legend-dot" style="background: ${item.color || this.getColorForIndex(idx, items.length)}"></span>
                ${item.name} (${item.value}%)
            </span>
        `).join('');
    },

    /**
     * Attach event listeners to sunburst
     */
    attachSunburstEvents(container) {
        const segments = container.querySelectorAll('.sunburst-segment');
        
        segments.forEach(segment => {
            segment.addEventListener('mouseenter', (e) => {
                const name = segment.dataset.name;
                const value = segment.dataset.percentage;
                const reads = segment.dataset.reads;
                const confidence = segment.dataset.confidence;
                
                segment.style.opacity = '0.8';
                segment.style.transform = 'scale(1.02)';
                
                this.showTooltip(e.pageX, e.pageY, name, `
                    <div><strong>Abundance:</strong> ${value}%</div>
                    ${reads !== 'N/A' ? `<div><strong>Reads:</strong> ${reads}</div>` : ''}
                    ${confidence !== 'N/A' ? `<div><strong>Confidence:</strong> ${confidence}%</div>` : ''}
                `);
            });
            
            segment.addEventListener('mousemove', (e) => {
                this.showTooltip(e.pageX, e.pageY, 
                    segment.dataset.name, 
                    this.tooltip.querySelector('.tooltip-content').innerHTML
                );
            });
            
            segment.addEventListener('mouseleave', () => {
                segment.style.opacity = '1';
                segment.style.transform = 'scale(1)';
                this.hideTooltip();
            });
        });
    },

    // ============================================
    // SANKEY DIAGRAM
    // Flow visualization for read classification
    // ============================================

    /**
     * Render sankey diagram
     * @param {string} containerId - Container element ID
     * @param {object} data - Flow data with nodes and links
     */
    renderSankey(containerId, data = null) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const chartData = data || this.getMockSankeyData();
        
        const width = container.clientWidth || 600;
        const height = 400;
        const nodeWidth = 20;
        const nodePadding = 15;

        // Calculate node positions
        const { nodes, links } = this.calculateSankeyLayout(chartData, width, height, nodeWidth, nodePadding);

        container.innerHTML = `
            <svg width="${width}" height="${height}" class="sankey-chart">
                <defs>
                    ${this.generateSankeyGradients(links)}
                </defs>
                <g class="sankey-links">
                    ${this.generateSankeyLinks(links)}
                </g>
                <g class="sankey-nodes">
                    ${this.generateSankeyNodes(nodes, nodeWidth)}
                </g>
            </svg>
        `;

        this.attachSankeyEvents(container);
    },

    /**
     * Calculate sankey layout positions
     */
    calculateSankeyLayout(data, width, height, nodeWidth, nodePadding) {
        const columns = {};
        
        // Group nodes by column
        data.nodes.forEach(node => {
            if (!columns[node.column]) columns[node.column] = [];
            columns[node.column].push(node);
        });

        const columnCount = Object.keys(columns).length;
        const columnWidth = (width - nodeWidth) / (columnCount - 1);

        // Position nodes
        Object.entries(columns).forEach(([col, nodes]) => {
            const colIdx = parseInt(col);
            const totalValue = nodes.reduce((sum, n) => sum + n.value, 0);
            const availableHeight = height - (nodes.length - 1) * nodePadding;
            
            let y = 0;
            nodes.forEach(node => {
                node.x = colIdx * columnWidth;
                node.height = (node.value / totalValue) * availableHeight;
                node.y = y;
                y += node.height + nodePadding;
            });
        });

        // Create node map for quick lookup
        const nodeMap = {};
        data.nodes.forEach(n => nodeMap[n.id] = n);

        // Calculate link paths
        const links = data.links.map(link => {
            const source = nodeMap[link.source];
            const target = nodeMap[link.target];
            
            return {
                ...link,
                sourceX: source.x + nodeWidth,
                sourceY: source.y + source.height / 2,
                targetX: target.x,
                targetY: target.y + target.height / 2,
                sourceNode: source,
                targetNode: target,
                thickness: Math.max(2, (link.value / source.value) * source.height)
            };
        });

        return { nodes: data.nodes, links };
    },

    /**
     * Generate sankey link gradients
     */
    generateSankeyGradients(links) {
        return links.map((link, idx) => `
            <linearGradient id="link-gradient-${idx}" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="${link.sourceNode.color}" stop-opacity="0.5"/>
                <stop offset="100%" stop-color="${link.targetNode.color}" stop-opacity="0.5"/>
            </linearGradient>
        `).join('');
    },

    /**
     * Generate sankey link paths
     */
    generateSankeyLinks(links) {
        return links.map((link, idx) => {
            const curvature = 0.5;
            const x0 = link.sourceX;
            const x1 = link.targetX;
            const xi = (x0 + x1) * curvature;
            const x2 = xi;
            const x3 = xi;
            
            const path = `M${x0},${link.sourceY} C${x2},${link.sourceY} ${x3},${link.targetY} ${x1},${link.targetY}`;
            
            return `
                <path 
                    d="${path}"
                    fill="none"
                    stroke="url(#link-gradient-${idx})"
                    stroke-width="${link.thickness}"
                    class="sankey-link"
                    data-source="${link.sourceNode.name}"
                    data-target="${link.targetNode.name}"
                    data-value="${link.value}"
                    data-label="${link.label || ''}"
                />
            `;
        }).join('');
    },

    /**
     * Generate sankey nodes
     */
    generateSankeyNodes(nodes, nodeWidth) {
        return nodes.map(node => `
            <g class="sankey-node" data-name="${node.name}" data-value="${node.value}" data-info="${node.info || ''}">
                <rect 
                    x="${node.x}" 
                    y="${node.y}" 
                    width="${nodeWidth}" 
                    height="${node.height}"
                    fill="${node.color}"
                    rx="2"
                />
                <text 
                    x="${node.column === 0 ? node.x - 5 : node.x + nodeWidth + 5}" 
                    y="${node.y + node.height / 2}"
                    text-anchor="${node.column === 0 ? 'end' : 'start'}"
                    dominant-baseline="middle"
                    class="sankey-label"
                    fill="#374151"
                    font-size="11"
                >${node.name}</text>
            </g>
        `).join('');
    },

    /**
     * Attach sankey event listeners
     */
    attachSankeyEvents(container) {
        // Node events
        container.querySelectorAll('.sankey-node').forEach(node => {
            node.addEventListener('mouseenter', (e) => {
                const name = node.dataset.name;
                const value = node.dataset.value;
                const info = node.dataset.info;
                
                this.showTooltip(e.pageX, e.pageY, name, `
                    <div><strong>Value:</strong> ${this.formatNumber(value)}</div>
                    ${info ? `<div>${info}</div>` : ''}
                `);
            });
            
            node.addEventListener('mouseleave', () => this.hideTooltip());
        });

        // Link events
        container.querySelectorAll('.sankey-link').forEach(link => {
            link.addEventListener('mouseenter', (e) => {
                link.style.strokeOpacity = '0.8';
                const source = link.dataset.source;
                const target = link.dataset.target;
                const value = link.dataset.value;
                const label = link.dataset.label;
                
                this.showTooltip(e.pageX, e.pageY, `${source} → ${target}`, `
                    <div><strong>Flow:</strong> ${this.formatNumber(value)} reads</div>
                    ${label ? `<div>${label}</div>` : ''}
                `);
            });
            
            link.addEventListener('mouseleave', () => {
                link.style.strokeOpacity = '0.5';
                this.hideTooltip();
            });
        });
    },

    // ============================================
    // ABUNDANCE TREEMAP
    // Proportional species visualization
    // ============================================

    /**
     * Render treemap
     * @param {string} containerId - Container element ID
     * @param {object} data - Treemap data array
     */
    renderTreemap(containerId, data = null) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const chartData = data || this.getMockTreemapData();
        const width = container.clientWidth || 600;
        const height = 400;

        // Calculate treemap layout
        const layout = this.calculateTreemapLayout(chartData, 0, 0, width, height);

        container.innerHTML = `
            <div class="treemap-chart" style="width: ${width}px; height: ${height}px; position: relative;">
                ${this.generateTreemapCells(layout)}
            </div>
        `;

        this.attachTreemapEvents(container);
    },

    /**
     * Calculate treemap layout using squarified algorithm
     */
    calculateTreemapLayout(data, x, y, width, height) {
        const total = data.reduce((sum, d) => sum + d.value, 0);
        const cells = [];
        
        let currentX = x;
        let currentY = y;
        let remainingWidth = width;
        let remainingHeight = height;
        let isHorizontal = width >= height;

        // Sort by value descending
        const sorted = [...data].sort((a, b) => b.value - a.value);

        sorted.forEach((item, idx) => {
            const ratio = item.value / total;
            let cellWidth, cellHeight;

            if (isHorizontal) {
                cellWidth = remainingWidth * ratio * (width / remainingWidth);
                cellHeight = remainingHeight;
                
                if (idx === sorted.length - 1) {
                    cellWidth = remainingWidth;
                }
            } else {
                cellWidth = remainingWidth;
                cellHeight = remainingHeight * ratio * (height / remainingHeight);
                
                if (idx === sorted.length - 1) {
                    cellHeight = remainingHeight;
                }
            }

            cells.push({
                ...item,
                x: currentX,
                y: currentY,
                width: Math.max(cellWidth, 0),
                height: Math.max(cellHeight, 0),
                color: item.color || this.getColorForIndex(idx, sorted.length)
            });

            if (isHorizontal) {
                currentX += cellWidth;
                remainingWidth -= cellWidth;
            } else {
                currentY += cellHeight;
                remainingHeight -= cellHeight;
            }

            // Alternate direction for better squarification
            if (idx % 2 === 0) {
                isHorizontal = !isHorizontal;
            }
        });

        return cells;
    },

    /**
     * Generate treemap cells HTML
     */
    generateTreemapCells(cells) {
        return cells.map(cell => {
            const showLabel = cell.width > 60 && cell.height > 40;
            const showValue = cell.width > 80 && cell.height > 60;
            const showConfidence = cell.width > 100 && cell.height > 80 && cell.confidence;
            
            return `
                <div 
                    class="treemap-cell"
                    style="
                        left: ${cell.x}px;
                        top: ${cell.y}px;
                        width: ${cell.width}px;
                        height: ${cell.height}px;
                        background-color: ${cell.color};
                    "
                    data-name="${cell.name}"
                    data-value="${cell.value}"
                    data-reads="${cell.reads || 'N/A'}"
                    data-confidence="${cell.confidence || 'N/A'}"
                    data-risk="${cell.risk || 'N/A'}"
                    data-amr="${cell.amrGenes ?? 'N/A'}"
                    data-virulence="${cell.virulenceFactors ?? 'N/A'}"
                >
                    ${showLabel ? `<span class="treemap-cell-label">${cell.name}</span>` : ''}
                    ${showValue ? `<span class="treemap-cell-value">${cell.value}%</span>` : ''}
                    ${showConfidence ? `<span class="treemap-cell-confidence">${cell.confidence}% conf.</span>` : ''}
                </div>
            `;
        }).join('');
    },

    /**
     * Attach treemap event listeners
     */
    attachTreemapEvents(container) {
        container.querySelectorAll('.treemap-cell').forEach(cell => {
            cell.addEventListener('mouseenter', (e) => {
                cell.style.transform = 'scale(1.02)';
                cell.style.zIndex = '10';
                cell.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
                
                const name = cell.dataset.name;
                const value = cell.dataset.value;
                const reads = cell.dataset.reads;
                const confidence = cell.dataset.confidence;
                const risk = cell.dataset.risk;
                const amr = cell.dataset.amr;
                const virulence = cell.dataset.virulence;
                
                let riskClass = 'low';
                if (risk === 'High') riskClass = 'high';
                else if (risk === 'Medium') riskClass = 'medium';
                
                this.showTooltip(e.pageX, e.pageY, name, `
                    <div class="tooltip-row"><strong>Relative Abundance:</strong> ${value}%</div>
                    ${reads !== 'N/A' ? `<div class="tooltip-row"><strong>Read Count:</strong> ${this.formatNumber(reads)}</div>` : ''}
                    ${confidence !== 'N/A' ? `<div class="tooltip-row"><strong>Confidence Score:</strong> <span class="confidence-highlight">${confidence}%</span></div>` : ''}
                    ${risk !== 'N/A' && risk !== 'Unknown' ? `<div class="tooltip-row"><strong>Risk Level:</strong> <span class="risk-badge-sm risk-${riskClass}">${risk}</span></div>` : ''}
                    ${amr !== 'N/A' && amr !== 'null' ? `<div class="tooltip-row"><strong>AMR Genes:</strong> ${amr}</div>` : ''}
                    ${virulence !== 'N/A' && virulence !== 'null' ? `<div class="tooltip-row"><strong>Virulence Factors:</strong> ${virulence}</div>` : ''}
                `);
            });
            
            cell.addEventListener('mousemove', (e) => {
                this.showTooltip(e.pageX, e.pageY, 
                    cell.dataset.name, 
                    this.tooltip.querySelector('.tooltip-content').innerHTML
                );
            });
            
            cell.addEventListener('mouseleave', () => {
                cell.style.transform = 'scale(1)';
                cell.style.zIndex = '1';
                cell.style.boxShadow = 'none';
                this.hideTooltip();
            });
        });
    },

    // ============================================
    // HELPER FUNCTIONS
    // ============================================

    /**
     * Describe SVG arc path
     */
    describeArc(x, y, innerRadius, outerRadius, startAngle, endAngle) {
        const start1 = this.polarToCartesian(x, y, outerRadius, endAngle);
        const end1 = this.polarToCartesian(x, y, outerRadius, startAngle);
        const start2 = this.polarToCartesian(x, y, innerRadius, endAngle);
        const end2 = this.polarToCartesian(x, y, innerRadius, startAngle);
        
        const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
        
        return [
            'M', start1.x, start1.y,
            'A', outerRadius, outerRadius, 0, largeArcFlag, 0, end1.x, end1.y,
            'L', end2.x, end2.y,
            'A', innerRadius, innerRadius, 0, largeArcFlag, 1, start2.x, start2.y,
            'Z'
        ].join(' ');
    },

    /**
     * Convert polar to cartesian coordinates
     */
    polarToCartesian(centerX, centerY, radius, angleInDegrees) {
        const angleInRadians = (angleInDegrees - 90) * Math.PI / 180;
        return {
            x: centerX + radius * Math.cos(angleInRadians),
            y: centerY + radius * Math.sin(angleInRadians)
        };
    },

    /**
     * Get color for index
     */
    getColorForIndex(index, total) {
        const colors = [
            '#008080', '#006666', '#10B981', '#059669', '#0EA5E9',
            '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#EF4444'
        ];
        return colors[index % colors.length];
    },

    /**
     * Lighten a color
     */
    lightenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.min(255, (num >> 16) + amt);
        const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
        const B = Math.min(255, (num & 0x0000FF) + amt);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    },

    /**
     * Format large numbers
     */
    formatNumber(num) {
        const n = parseFloat(num);
        if (isNaN(n)) return num;
        if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
        return n.toLocaleString();
    },

    // ============================================
    // MOCK DATA
    // ============================================

    /**
     * Mock sunburst data - taxonomic hierarchy
     * Shows Domain → Phylum → Class → Species breakdown
     */
    getMockSunburstData() {
        return {
            name: 'All Reads',
            value: 100,
            children: [
                {
                    name: 'Bacteria',
                    value: 71,
                    color: '#008080',
                    reads: 5350000,
                    confidence: 96,
                    children: [
                        { 
                            name: 'Proteobacteria', 
                            value: 48, 
                            reads: 3620000, 
                            confidence: 94,
                            children: [
                                { name: 'Gammaproteobacteria', value: 35, reads: 2640000, confidence: 92 },
                                { name: 'Alphaproteobacteria', value: 8, reads: 600000, confidence: 88 },
                                { name: 'Betaproteobacteria', value: 5, reads: 380000, confidence: 85 }
                            ]
                        },
                        { 
                            name: 'Firmicutes', 
                            value: 18, 
                            reads: 1360000, 
                            confidence: 89,
                            children: [
                                { name: 'Bacilli', value: 12, reads: 910000, confidence: 87 },
                                { name: 'Clostridia', value: 6, reads: 450000, confidence: 82 }
                            ]
                        },
                        { name: 'Bacteroidetes', value: 5, reads: 370000, confidence: 82 }
                    ]
                },
                {
                    name: 'Viruses',
                    value: 4.8,
                    color: '#10B981',
                    reads: 362000,
                    confidence: 81,
                    children: [
                        { name: 'dsDNA viruses', value: 3.2, reads: 241000, confidence: 78 },
                        { name: 'RNA viruses', value: 1.6, reads: 121000, confidence: 72 }
                    ]
                },
                {
                    name: 'Archaea',
                    value: 1.2,
                    color: '#6366F1',
                    reads: 90000,
                    confidence: 65
                },
                {
                    name: 'Unclassified',
                    value: 23,
                    color: '#9CA3AF',
                    reads: 1730000,
                    confidence: null
                }
            ]
        };
    },

    /**
     * Mock sankey data - read classification pipeline flow
     * Shows: Raw → Quality Filter → Classification → Taxonomy
     */
    getMockSankeyData() {
        return {
            nodes: [
                { id: 'raw', name: 'Raw Reads (11.89M)', value: 11890000, column: 0, color: '#6B7280', info: 'Total sequenced reads from FASTQ' },
                { id: 'hq', name: 'High Quality (11.2M)', value: 11200000, column: 1, color: '#10B981', info: 'Q≥30 phred score, passed filters' },
                { id: 'lq', name: 'Low Quality (690K)', value: 690000, column: 1, color: '#EF4444', info: 'Below quality threshold - discarded' },
                { id: 'classified', name: 'Classified (7.56M)', value: 7560000, column: 2, color: '#008080', info: '67.5% of HQ reads matched database' },
                { id: 'unclassified', name: 'Unclassified (3.64M)', value: 3640000, column: 2, color: '#9CA3AF', info: 'No confident taxonomic match' },
                { id: 'bacteria', name: 'Bacteria (5.35M)', value: 5350000, column: 3, color: '#008080', info: '70.8% of classified reads' },
                { id: 'virus', name: 'Viruses (362K)', value: 362000, column: 3, color: '#10B981', info: '4.8% of classified reads' },
                { id: 'archaea', name: 'Archaea (90K)', value: 90000, column: 3, color: '#6366F1', info: '1.2% of classified reads' },
                { id: 'other', name: 'Other Eukaryota (1.76M)', value: 1758000, column: 3, color: '#F59E0B', info: 'Fungi, protozoa, host DNA' }
            ],
            links: [
                { source: 'raw', target: 'hq', value: 11200000, label: '94.2% passed quality control' },
                { source: 'raw', target: 'lq', value: 690000, label: '5.8% failed quality control' },
                { source: 'hq', target: 'classified', value: 7560000, label: 'Kraken2 + Bracken classified' },
                { source: 'hq', target: 'unclassified', value: 3640000, label: 'No database hit above threshold' },
                { source: 'classified', target: 'bacteria', value: 5350000, label: 'Bacterial genomes matched' },
                { source: 'classified', target: 'virus', value: 362000, label: 'Viral genomes matched' },
                { source: 'classified', target: 'archaea', value: 90000, label: 'Archaeal genomes matched' },
                { source: 'classified', target: 'other', value: 1758000, label: 'Other organisms detected' }
            ]
        };
    },

    /**
     * Mock treemap data - species abundance with clinical relevance
     * Each species includes reads, confidence, and risk assessment
     */
    getMockTreemapData() {
        return [
            { 
                name: 'Escherichia coli O157:H7', 
                value: 45.2, 
                reads: 3420000, 
                confidence: 95, 
                risk: 'High', 
                color: '#EF4444',
                amrGenes: 5,
                virulenceFactors: 12
            },
            { 
                name: 'Staphylococcus aureus (MRSA)', 
                value: 18.6, 
                reads: 1410000, 
                confidence: 87, 
                risk: 'High', 
                color: '#F97316',
                amrGenes: 7,
                virulenceFactors: 8
            },
            { 
                name: 'Pseudomonas aeruginosa', 
                value: 8.3, 
                reads: 630000, 
                confidence: 82, 
                risk: 'Medium', 
                color: '#F59E0B',
                amrGenes: 4,
                virulenceFactors: 6
            },
            { 
                name: 'Klebsiella pneumoniae (KPC+)', 
                value: 5.1, 
                reads: 390000, 
                confidence: 78, 
                risk: 'High', 
                color: '#EAB308',
                amrGenes: 3,
                virulenceFactors: 4
            },
            { 
                name: 'Enterococcus faecium', 
                value: 4.2, 
                reads: 318000, 
                confidence: 75, 
                risk: 'Medium', 
                color: '#84CC16',
                amrGenes: 2,
                virulenceFactors: 3
            },
            { 
                name: 'Commensal bacteria', 
                value: 12.4, 
                reads: 940000, 
                confidence: 70, 
                risk: 'Low', 
                color: '#10B981',
                amrGenes: 0,
                virulenceFactors: 0
            },
            { 
                name: 'Unclassified reads', 
                value: 6.2, 
                reads: 470000, 
                confidence: null, 
                risk: 'Unknown', 
                color: '#9CA3AF',
                amrGenes: null,
                virulenceFactors: null
            }
        ];
    },

    /**
     * Transform backend API response to chart-ready format
     * @param {object} apiResponse - Raw API response
     * @param {string} chartType - 'sunburst' | 'sankey' | 'treemap'
     * @returns {object} Chart-ready data
     */
    transformApiData(apiResponse, chartType) {
        // This method will transform real API responses when backend is integrated
        // For now, returns mock data
        switch (chartType) {
            case 'sunburst':
                return this.getMockSunburstData();
            case 'sankey':
                return this.getMockSankeyData();
            case 'treemap':
                return this.getMockTreemapData();
            default:
                return null;
        }
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => Charts.init());

// Export for global access
window.Charts = Charts;

