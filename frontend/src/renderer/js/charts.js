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

        this.tooltip.classList.add('visible');
        this.tooltip.style.left = '0px';
        this.tooltip.style.top = '0px';

        const rect = this.tooltip.getBoundingClientRect();
        const offsetX = 15;
        const offsetY = 15;

        let left = x + offsetX;
        let top = y + offsetY;

        if (left + rect.width > window.innerWidth) {
            left = x - rect.width - offsetX;
        }

        if (top + rect.height > window.innerHeight) {
            top = y - rect.height - offsetY;
        }

        this.tooltip.style.left = `${Math.max(8, left)}px`;
        this.tooltip.style.top = `${Math.max(8, top)}px`;
    },

    /**
     * Hide tooltip
     */
    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.classList.remove('visible');
        }
    },

    renderEmptyState(container, message = 'No data available') {
        container.innerHTML = `
            <div class="chart-empty-state" style="
                display:flex;
                align-items:center;
                justify-content:center;
                min-height:240px;
                color:#6B7280;
                font-size:14px;
                border:1px dashed #D1D5DB;
                border-radius:12px;
                background:#F9FAFB;
            ">
                ${message}
            </div>
        `;
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

        const chartData = data;

        if (!chartData || !chartData.children || chartData.children.length === 0) {
            this.renderEmptyState(container, 'No taxonomy data available');
            return;
        }

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
        const maxLevels = data.children?.some(c => Array.isArray(c.children) && c.children.length) ? 3 : 1;
        const innerRadius = level * (maxRadius / maxLevels);
        const outerRadius = (level + 1) * (maxRadius / maxLevels);
        
        const items = data.children || [data];
        const totalValue = Math.max(
            0.0001,
            items.reduce((sum, item) => sum + Number(item.value || 0), 0)
        );

        let currentAngle = startAngle;
        
        items.forEach((item, idx) => {
            const itemValue = Number(item.value || 0);
            if (itemValue <= 0) return;

            const angleSpan = (itemValue / totalValue) * (endAngle - startAngle);
            const itemEndAngle = currentAngle + angleSpan;

            const color = item.color || parentColor || this.getColorForIndex(idx, items.length);
            const lighterColor = this.lightenColor(color, level * 12);

            const path = this.describeArc(0, 0, innerRadius, outerRadius, currentAngle, itemEndAngle);

            const tooltipContent = `
                <div><strong>Value:</strong> ${this.formatPercent(itemValue)}</div>
                ${item.reads != null ? `<div><strong>Reads:</strong> ${this.formatNumber(item.reads)}</div>` : ''}
                ${item.confidence != null ? `<div><strong>Confidence:</strong> ${this.formatPercent(item.confidence)}</div>` : ''}
            `.trim();
            
            segments.push(`
                <path
                    d="${path}"
                    fill="${lighterColor}"
                    stroke="white"
                    stroke-width="2"
                    class="sunburst-segment"
                    data-name="${this.escapeAttr(item.name)}"
                    data-value="${itemValue}"
                    data-tooltip="${this.escapeAttr(tooltipContent)}"
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
                    >${this.truncateLabel(item.name, 16)}</text>
                `);
            }

            // Recurse for children
            if (item.children && item.children.length > 0 && level < 2) {
                segments.push(
                    this.generateSunburstSegments(item, maxRadius, currentAngle, itemEndAngle, level + 1, color)
                );
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
                ${item.name} (${this.formatPercent(item.value)})
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
                segment.style.opacity = '0.85';
                segment.style.strokeWidth = '3';

                this.showTooltip(
                    e.pageX,
                    e.pageY,
                    segment.dataset.name || 'Taxonomy',
                    this.unescapeAttr(segment.dataset.tooltip || '')
                );
            });
            
            segment.addEventListener('mousemove', (e) => {
                this.showTooltip(
                    e.pageX,
                    e.pageY,
                    segment.dataset.name || 'Taxonomy',
                    this.unescapeAttr(segment.dataset.tooltip || '')
                );
            });
            
            segment.addEventListener('mouseleave', () => {
                segment.style.opacity = '1';
                segment.style.strokeWidth = '2';
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

        if (!data) {
            container.innerHTML = '<div class="chart-empty-state">No read classification data available</div>';
            return;
        }

        const parentCard = container.closest('.chart-container') || container.parentElement;
        const measuredWidth =
            container.getBoundingClientRect().width ||
            parentCard?.getBoundingClientRect().width ||
            container.clientWidth ||
            900;

        const width = Math.max(900, Math.floor(measuredWidth));
        const height = 400;
        const nodeWidth = 20;
        const nodePadding = 15;

        const { nodes, links } = this.calculateSankeyLayout(data, width, height, nodeWidth, nodePadding);

        container.innerHTML = `
            <svg
                width="100%"
                height="${height}"
                viewBox="0 0 ${width} ${height}"
                preserveAspectRatio="xMidYMid meet"
                class="sankey-chart"
            >
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
            columns[node.column].push({ ...node });
        });

        const columnKeys = Object.keys(columns).map(Number).sort((a, b) => a - b);
        const columnCount = Math.max(1, columnKeys.length);
        const columnWidth = columnCount > 1 ? (width - nodeWidth) / (columnCount - 1) : 0;

        columnKeys.forEach(col => {
            const nodes = columns[col];
            const totalValue = Math.max(1, nodes.reduce((sum, n) => sum + Number(n.value || 0), 0));
            const availableHeight = height - (nodes.length - 1) * nodePadding;

            let y = 0;
            nodes.forEach(node => {
                node.x = col * columnWidth;
                node.height = Math.max(16, (Number(node.value || 0) / totalValue) * availableHeight);
                node.y = y;
                y += node.height + nodePadding;
            });
        });

        const flatNodes = columnKeys.flatMap(col => columns[col]);
        const nodeMap = {};
        flatNodes.forEach(n => { nodeMap[n.id] = n; });

        // Calculate link paths
        const links = (data.links || [])
            .map(link => {
                const source = nodeMap[link.source];
                const target = nodeMap[link.target];
                if (!source || !target) return null;

                const value = Number(link.value || 0);

                const sourceThickness = Math.max(
                    2,
                    (value / Math.max(1, Number(source.value || 0))) * source.height
                );

                const targetThickness = Math.max(
                    2,
                    (value / Math.max(1, Number(target.value || 0))) * target.height
                );

                return {
                    ...link,
                    sourceX: source.x + nodeWidth,
                    sourceY: source.y + source.height / 2,
                    targetX: target.x,
                    targetY: target.y + target.height / 2,
                    sourceNode: source,
                    targetNode: target,
                    sourceThickness,
                    targetThickness
                };
            })
            .filter(Boolean);

        return { nodes: flatNodes, links };
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
            const x0 = link.sourceX;
            const x1 = link.targetX;
            const y0 = link.sourceY;
            const y1 = link.targetY;
            const xi = x0 + (x1 - x0) * 0.5;

            const s = (link.sourceThickness || 2) / 2;
            const t = (link.targetThickness || 2) / 2;

            const path = `
                M ${x0},${y0 - s}
                C ${xi},${y0 - s} ${xi},${y1 - t} ${x1},${y1 - t}
                L ${x1},${y1 + t}
                C ${xi},${y1 + t} ${xi},${y0 + s} ${x0},${y0 + s}
                Z
            `;

            const tooltipContent = `
                <div><strong>Flow:</strong> ${this.formatNumber(link.value)} reads</div>
                ${link.label ? `<div>${link.label}</div>` : ''}
            `.trim();

            return `
                <path
                    d="${path}"
                    fill="url(#link-gradient-${idx})"
                    fill-opacity="0.55"
                    class="sankey-link"
                    data-title="${this.escapeAttr(`${link.sourceNode.name} → ${link.targetNode.name}`)}"
                    data-tooltip="${this.escapeAttr(tooltipContent)}"
                />
            `;
        }).join('');
    },

    /**
     * Generate sankey nodes
     */
    generateSankeyNodes(nodes, nodeWidth) {
        return nodes.map(node => {
            const tooltipContent = `
                <div><strong>Value:</strong> ${this.formatNumber(node.value)}</div>
                ${node.info ? `<div>${node.info}</div>` : ''}
            `.trim();

            return `
                <g class="sankey-node"
                data-name="${this.escapeAttr(node.name)}"
                data-tooltip="${this.escapeAttr(tooltipContent)}">
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
                    >${this.truncateLabel(node.name, 28)}</text>
                </g>
            `;
        }).join('');
    },

    /**
     * Attach sankey event listeners
     */
    attachSankeyEvents(container) {
        container.querySelectorAll('.sankey-node').forEach(node => {
            node.addEventListener('mouseenter', (e) => {
                this.showTooltip(
                    e.pageX,
                    e.pageY,
                    node.dataset.name || 'Node',
                    this.unescapeAttr(node.dataset.tooltip || '')
                );
            });

            node.addEventListener('mousemove', (e) => {
                this.showTooltip(
                    e.pageX,
                    e.pageY,
                    node.dataset.name || 'Node',
                    this.unescapeAttr(node.dataset.tooltip || '')
                );
            });

            node.addEventListener('mouseleave', () => this.hideTooltip());
        });

        container.querySelectorAll('.sankey-link').forEach(link => {
            link.addEventListener('mouseenter', (e) => {
                link.style.strokeOpacity = '0.75';
                this.showTooltip(
                    e.pageX,
                    e.pageY,
                    this.unescapeAttr(link.dataset.title || 'Flow'),
                    this.unescapeAttr(link.dataset.tooltip || '')
                );
            });

            link.addEventListener('mousemove', (e) => {
                this.showTooltip(
                    e.pageX,
                    e.pageY,
                    this.unescapeAttr(link.dataset.title || 'Flow'),
                    this.unescapeAttr(link.dataset.tooltip || '')
                );
            });

            link.addEventListener('mouseleave', () => {
                link.style.strokeOpacity = '0.55';
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

        const chartData = data;
        if (!Array.isArray(chartData) || chartData.length === 0) {
            this.renderEmptyState(container, 'No pathogen abundance data available');
            return;
        }

        const width = Math.min(container.clientWidth || 1000, 900);
        const height = 400;
        const layout = this.calculateTreemapLayout(chartData, 0, 0, width, height);

        container.innerHTML = `
            <div style="display:flex; justify-content:center; width:100%;">
                <div class="treemap-chart" style="width:${width}px; height:${height}px; position:relative;">
                    ${this.generateTreemapCells(layout)}
                </div>
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
        const sorted = [...data].sort((a, b) => Number(b.value || 0) - Number(a.value || 0));

        sorted.forEach((item, idx) => {
            const ratio = Number(item.value || 0) / total;
            let cellWidth;
            let cellHeight;

            if (isHorizontal) {
                cellWidth = idx === sorted.length - 1
                    ? remainingWidth
                    : remainingWidth * ratio * (width / Math.max(1, remainingWidth));
                cellHeight = remainingHeight;
            } else {
                cellWidth = remainingWidth;
                cellHeight = idx === sorted.length - 1
                    ? remainingHeight
                    : remainingHeight * ratio * (height / Math.max(1, remainingHeight));
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
            const showLabel = cell.width > 90 && cell.height > 50;
            const showValue = cell.width > 110 && cell.height > 65;
            const showConfidence = cell.width > 130 && cell.height > 85 && cell.confidence != null;
            
            const tooltipContent = `
                <div class="tooltip-row">
                    <strong>Abundance (Classified):</strong>
                    ${this.formatPercent(cell.value)}
                </div>
                ${cell.reads != null ? `<div class="tooltip-row"><strong>Read Count:</strong> ${this.formatNumber(cell.reads)}</div>` : ''}
                ${cell.confidence != null ? `<div class="tooltip-row"><strong>Confidence Score:</strong> <span class="confidence-highlight">${this.formatPercent(cell.confidence)}</span></div>` : ''}
                ${cell.risk && cell.risk !== 'Unknown' ? `
                    <div class="tooltip-row">
                        <strong>Risk Level:</strong>
                        <span style="
                            font-weight:600;
                            color:${
                                cell.risk.toLowerCase() === 'high'
                                    ? '#dc2626'
                                    : cell.risk.toLowerCase() === 'medium'
                                    ? '#f59e0b'
                                    : '#16a34a'
                            };
                        ">
                            ${cell.risk}
                        </span>
                    </div>` : ''}
                ${cell.virulenceFactors != null ? `<div class="tooltip-row"><strong>Virulence Factors:</strong> ${cell.virulenceFactors}</div>` : ''}
            `.trim();

            return `
                <div
                    class="treemap-cell"
                    style="
                        left:${cell.x}px;
                        top:${cell.y}px;
                        width:${cell.width}px;
                        height:${cell.height}px;
                        background-color:${cell.color};
                    "
                    data-name="${this.escapeAttr(cell.name)}"
                    data-tooltip="${this.escapeAttr(tooltipContent)}"
                >
                    ${showLabel ? `<span class="treemap-cell-label">${this.truncateLabel(cell.name, 28)}</span>` : ''}
                    ${showValue ? `<span class="treemap-cell-value">${this.formatPercent(cell.value)}</span>` : ''}
                    ${showConfidence ? `<span class="treemap-cell-confidence">${this.formatPercent(cell.confidence)} conf.</span>` : ''}
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
                
                this.showTooltip(
                    e.pageX,
                    e.pageY,
                    this.unescapeAttr(cell.dataset.name || 'Pathogen'),
                    this.unescapeAttr(cell.dataset.tooltip || '')
                );
            });
            
            cell.addEventListener('mousemove', (e) => {
                this.showTooltip(
                    e.pageX,
                    e.pageY,
                    this.unescapeAttr(cell.dataset.name || 'Pathogen'),
                    this.unescapeAttr(cell.dataset.tooltip || '')
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
    // RADAR CHART
    // Multi-dimensional pathogen comparison
    // ============================================

    /**
     * Render radar chart for pathogen comparison
     * @param {string} containerId - Container element ID
     * @param {object} data - Radar chart data with pathogens and metrics
     */
    renderRadar(containerId, data = null) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!data || !data.pathogens?.length) {
            container.innerHTML = '<div class="chart-empty-state">No pathogen comparison data available</div>';
            return;
        }
        const chartData = data;
        const width = container.clientWidth || 400;
        const height = 400;
        const centerX = width / 2;
        const centerY = height / 2;
        const maxRadius = Math.min(width, height) / 2 - 40;

        // Calculate radar axes
        const axes = chartData.axes || ['Confidence', 'Abundance', 'Risk', 'Virulence'];

        container.innerHTML = `
            <svg width="${width}" height="${height}" class="radar-chart">
                <g transform="translate(${centerX}, ${centerY})">
                    ${this.generateQuadrantAxes(maxRadius)}
                    ${this.generateQuadrantData(chartData.pathogens, maxRadius, chartData.maxValues)}
                </g>
            </svg>
            <div class="chart-legend radar-legend">
                ${this.generateRadarLegend(chartData.pathogens)}
            </div>
        `;

        this.attachRadarEvents(container);
    },

    generateQuadrantAxes(maxRadius) {
        let html = '';

        // Circular guide rings
        for (let i = 1; i <= 4; i++) {
            const r = (maxRadius * i) / 4;
            html += `<circle cx="0" cy="0" r="${r}" fill="none" stroke="#F3F4F6" stroke-width="1"/>`;
        }

        // Main x/y axes
        html += `
            <line x1="${-maxRadius}" y1="0" x2="${maxRadius}" y2="0" stroke="#D1D5DB" stroke-width="1.5"/>
            <line x1="0" y1="${-maxRadius}" x2="0" y2="${maxRadius}" stroke="#D1D5DB" stroke-width="1.5"/>

            <text x="${maxRadius + 22}" y="4"
                text-anchor="start"
                class="radar-axis-label"
                fill="#374151"
                font-size="12">Confidence</text>

            <text x="0" y="${-maxRadius - 18}"
                text-anchor="middle"
                class="radar-axis-label"
                fill="#374151"
                font-size="12">Abundance</text>

            <text x="${-maxRadius - 22}" y="4"
                text-anchor="end"
                class="radar-axis-label"
                fill="#374151"
                font-size="12">Risk</text>

            <text x="0" y="${maxRadius + 28}"
                text-anchor="middle"
                class="radar-axis-label"
                fill="#374151"
                font-size="12">Virulence</text>

            <circle cx="0" cy="0" r="3" fill="#9CA3AF"/>
        `;

        return html;
    },

    generateQuadrantData(pathogens, maxRadius, maxValues = {}) {
        let html = '';

        pathogens.forEach((pathogen) => {
            const metrics = pathogen.metrics || {};

            const confidence = this.normalizeQuadrantValue(metrics.Confidence, 'Confidence', maxValues) * maxRadius;
            const abundance = this.normalizeQuadrantValue(metrics.Abundance, 'Abundance', maxValues) * maxRadius;
            const risk = this.normalizeQuadrantValue(metrics.Risk, 'Risk', maxValues) * maxRadius;
            const virulence = this.normalizeQuadrantValue(metrics.Virulence, 'Virulence', maxValues) * maxRadius;

            // Four directional points:
            // +x Confidence, +y Abundance, -x Risk, -y Virulence.
            // SVG y-axis is inverted, so abundance uses negative y.
            const points = [
                `${confidence},0`,
                `0,${-abundance}`,
                `${-risk},0`,
                `0,${virulence}`
            ].join(' ');

            const tooltipContent = `
                <div><strong>Abundance (Classified):</strong> ${metrics.Abundance ?? 0}</div>
                <div><strong>Confidence:</strong> ${metrics.Confidence ?? 0}</div>
                <div><strong>Virulence:</strong> ${metrics.Virulence ?? 0}</div>
                <div><strong>Risk:</strong> ${metrics.RiskLabel || (metrics.Risk ?? 0)}</div>
            `.trim();

            html += `
                <polygon points="${points}"
                        fill="${pathogen.color}"
                        fill-opacity="0.12"
                        stroke="${pathogen.color}"
                        stroke-width="2"
                        class="radar-polygon"
                        data-name="${this.escapeAttr(pathogen.name)}"
                        data-tooltip="${this.escapeAttr(tooltipContent)}"/>

                <circle cx="${confidence}" cy="0" r="3" fill="${pathogen.color}" opacity="0.85"/>
                <circle cx="0" cy="${-abundance}" r="3" fill="${pathogen.color}" opacity="0.85"/>
                <circle cx="${-risk}" cy="0" r="3" fill="${pathogen.color}" opacity="0.85"/>
                <circle cx="0" cy="${virulence}" r="3" fill="${pathogen.color}" opacity="0.85"/>
            `;
        });

        return html;
    },

    normalizeQuadrantValue(value, axis, maxValues = {}) {
        const defaults = {
            Confidence: 100,
            Abundance: 5,
            Virulence: 5,
            Risk: 3
        };

        const max = Math.max(1, Number(maxValues[axis] ?? defaults[axis] ?? 100));
        return Math.min(Number(value || 0) / max, 1);
    },

    /**
     * Generate radar chart axes
     */
    generateRadarAxes(axes, maxRadius) {
        const numAxes = axes.length;
        const angleStep = (Math.PI * 2) / numAxes;
        let axesHtml = '';

        for (let i = 1; i <= 4; i++) {
            const radius = (maxRadius * i) / 4;
            axesHtml += `<circle cx="0" cy="0" r="${radius}" fill="none" stroke="#F3F4F6" stroke-width="1" opacity="0.5"/>`;
        }

        // Draw axes lines and labels
        axes.forEach((axis, index) => {
            const angle = index * angleStep - Math.PI / 2;
            const x2 = Math.cos(angle) * maxRadius;
            const y2 = Math.sin(angle) * maxRadius;

            // Axis line
            axesHtml += `<line x1="0" y1="0" x2="${x2}" y2="${y2}" class="radar-axis" stroke="#E5E7EB" stroke-width="1"/>`;

            // Axis label
            const labelRadius = maxRadius + 20;
            const labelX = Math.cos(angle) * labelRadius;
            const labelY = Math.sin(angle) * labelRadius;
            const textAnchor = labelX > 8 ? 'start' : (labelX < -8 ? 'end' : 'middle');
            const dominantBaseline = labelY > 8 ? 'hanging' : (labelY < -8 ? 'baseline' : 'middle');

            axesHtml += `
                <text x="${labelX}" y="${labelY}"
                    text-anchor="${textAnchor}"
                    dominant-baseline="${dominantBaseline}"
                    class="radar-axis-label"
                    fill="#374151"
                    font-size="12">${axis}</text>
            `;
        });

        return axesHtml;
    },

    /**
     * Generate radar data polygons
     */
    generateRadarData(pathogens, axes, maxRadius) {
        let dataHtml = '';

        pathogens.forEach((pathogen, index) => {
            const points = axes.map((axis, axisIndex) => {
                const value = Number(pathogen.metrics?.[axis] || 0);
                const normalizedValue = this.normalizeRadarValue(value, axis);
                const angle = axisIndex * (Math.PI * 2) / axes.length - Math.PI / 2;
                const radius = normalizedValue * maxRadius;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                return `${x},${y}`;
            }).join(' ');

            const tooltipContent = Object.entries(pathogen.metrics || {})
                .map(([key, value]) => `<div><strong>${key}:</strong> ${value}</div>`)
                .join('');

            dataHtml += `
                <polygon points="${points}"
                        fill="${pathogen.color}"
                        fill-opacity="0.1"
                        stroke="${pathogen.color}"
                        stroke-width="2"
                        class="radar-polygon"
                        data-name="${this.escapeAttr(pathogen.name)}"
                        data-tooltip="${this.escapeAttr(tooltipContent)}"/>
            `;
        });

        return dataHtml;
    },

    /**
     * Generate radar chart legend
     */
    generateRadarLegend(pathogens) {
        return pathogens.map(pathogen => `
            <span class="legend-item">
                <span class="legend-dot" style="background: ${pathogen.color}"></span>
                ${this.escapeAttr(pathogen.name)}
            </span>
        `).join('');
    },

    /**
     * Attach radar chart event listeners
     */
    attachRadarEvents(container) {
        container.querySelectorAll('.radar-polygon').forEach(polygon => {
            polygon.addEventListener('mouseenter', (e) => {
                polygon.style.strokeWidth = '3';
                polygon.style.fillOpacity = '0.2';

                this.showTooltip(
                    e.pageX,
                    e.pageY,
                    this.unescapeAttr(polygon.dataset.name || 'Pathogen'),
                    this.unescapeAttr(polygon.dataset.tooltip || '')
                );
            });

            polygon.addEventListener('mousemove', (e) => {
                this.showTooltip(
                    e.pageX,
                    e.pageY,
                    this.unescapeAttr(polygon.dataset.name || 'Pathogen'),
                    this.unescapeAttr(polygon.dataset.tooltip || '')
                );
            });

            polygon.addEventListener('mouseleave', () => {
                polygon.style.strokeWidth = '2';
                polygon.style.fillOpacity = '0.1';
                this.hideTooltip();
            });
        });
    },

    /**
     * Normalize radar values to 0-1 scale
     */
    normalizeRadarValue(value, axis) {
        // Define max values for each axis
        const maxValues = {
            'Abundance': 100,
            'Confidence': 100,
            'Virulence': 20,
            // 'AMR': 10,
            'Risk': 10
        };

        const max = maxValues[axis] || 100;
        return Math.min(Number(value || 0) / max, 1);
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
        if (isNaN(n)) return String(num);
        if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
        return n.toLocaleString();
    },

    /**
     * Format percentage values
     */
    formatPercent(value) {
        const n = Number(value);
        if (Number.isNaN(n)) return 'N/A';
        return `${n}%`;
    },

    /**
     * Normalize risk level string
     */
    normalizeRiskLevel(risk) {
        const value = String(risk || '').toLowerCase();
        if (value === 'high') return 'High';
        if (value === 'medium') return 'Medium';
        if (value === 'low') return 'Low';
        return 'Unknown';
    },

    /**
     * Convert risk level to numerical score
     * riskToScore(risk) {
        const normalized = this.normalizeRiskLevel(risk);
        switch (normalized) {
            case 'High': return 9;
            case 'Medium': return 6;
            case 'Low': return 3;
            default: return 0;
        }
    },
     */
    riskToScore(risk) {
        const normalized = this.normalizeRiskLevel(risk);
        switch (normalized) {
            case 'High': return 3;
            case 'Medium': return 2;
            case 'Low': return 1;
            default: return 0;
        }
    },

    /**
     * Convert text to title case
     */
    toTitleCase(text) {
        return String(text || '')
            .replace(/[_-]/g, ' ')
            .replace(/\b\w/g, ch => ch.toUpperCase());
    },

    /**
     * Truncate label with ellipsis
     */
    truncateLabel(text, maxLength = 20) {
        const value = String(text || '');
        return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
    },

    /**
     * Escape HTML attributes
     */
    escapeAttr(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    },

    unescapeAttr(value) {
        return String(value ?? '')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');
    },

    // ============================================
    // REAL DATA TRANSFORMERS
    // ============================================

    /**
     * Transform backend API response to chart-ready format
     * @param {object} apiResponse - Raw API response (results.json)
     * @param {string} chartType - 'sunburst' | 'sankey' | 'treemap' | 'radar'
     * @returns {object} Chart-ready data
     */
    transformApiData(apiResponse, chartType) {
        if (!apiResponse) {
            return this.getFallbackChartData(chartType);
        }

        switch (chartType) {
            case 'sunburst':
                return this.transformSunburstData(apiResponse);
            case 'sankey':
                return this.transformSankeyData(apiResponse);
            case 'treemap':
                return this.transformTreemapData(apiResponse);
            case 'radar':
                return this.transformRadarData(apiResponse);
            default:
                return null;
        }
    },

    getFallbackChartData(_chartType) {
        return null;
    },

    transformTreemapData(apiResponse) {
        const pathogens = apiResponse?.pathogens || [];
        const summary = apiResponse?.summary || {};
        const classifiedReads = Number(summary.classified_reads || 0);

        if (!Array.isArray(pathogens) || pathogens.length === 0) {
            return null;
        }

        return pathogens.map((p, idx, arr) => {
            const reads = Number(p.reads || 0);

            return {
                name: p.name || 'Unknown',

                // Use percentage among classified reads for visualization
                value: classifiedReads > 0
                    ? Number(((reads / classifiedReads) * 100).toFixed(2))
                    : Number(p.abundance || 0),

                reads,
                originalAbundance: Number(p.abundance || 0), // total-read abundance from backend
                confidence: p.confidence ?? null,
                risk: this.normalizeRiskLevel(p.risk_level),
                color: this.getColorForIndex(idx, arr.length),
                virulenceFactors: p.virulence_genes ?? 0
            };
        });
    },

    transformRadarData(apiResponse) {
        const summary = apiResponse?.summary || {};
        const classifiedReads = Number(summary.classified_reads || 0);

        const pathogens = (apiResponse?.pathogens || [])
            .slice()
            .sort((a, b) => {
                const aClassifiedAbundance = classifiedReads > 0
                    ? Number(a.reads || 0) / classifiedReads
                    : Number(a.abundance || 0);

                const bClassifiedAbundance = classifiedReads > 0
                    ? Number(b.reads || 0) / classifiedReads
                    : Number(b.abundance || 0);

                return bClassifiedAbundance - aClassifiedAbundance;
            })
            .slice(0, 5);

        if (!pathogens.length) return null;

        const mapped = pathogens.map((p, idx) => {
            const reads = Number(p.reads || 0);

            const classifiedAbundance = classifiedReads > 0
                ? Number(((reads / classifiedReads) * 100).toFixed(2))
                : Number(p.abundance || 0);

            return {
                name: p.name || 'Unknown',
                color: this.getColorForIndex(idx, pathogens.length),
                metrics: {
                    Abundance: classifiedAbundance,
                    Confidence: Number(p.confidence || 0),
                    Virulence: Number(p.virulence_genes || 0),
                    Risk: this.riskToScore(p.risk_level),
                    RiskLabel: this.normalizeRiskLevel(p.risk_level)
                }
            };
        });

        return {
            axes: ['Confidence', 'Abundance', 'Risk', 'Virulence'],
            maxValues: {
                Confidence: 100,
                Abundance: Math.max(1, ...mapped.map(p => p.metrics.Abundance)),
                Virulence: Math.max(1, ...mapped.map(p => p.metrics.Virulence)),
                Risk: 3
            },
            pathogens: mapped
        };
    },

    transformSunburstData(apiResponse) {
        if (
            apiResponse?.taxonomy_hierarchy &&
            Array.isArray(apiResponse.taxonomy_hierarchy.children) &&
            apiResponse.taxonomy_hierarchy.children.length
        ) {
            return apiResponse.taxonomy_hierarchy;
        }

        const taxonomy = apiResponse?.taxonomy;
        if (!taxonomy || typeof taxonomy !== 'object') {
            return null;
        }

        const entries = Object.entries(taxonomy)
            .filter(([, value]) => Number(value || 0) > 0);

        if (!entries.length) {
            return null;
        }

        return {
            name: 'Taxonomy',
            value: 100,
            children: entries.map(([key, value], idx) => ({
                name: this.toTitleCase(key),
                value: Number(value || 0),
                color: this.getColorForIndex(idx, entries.length)
            }))
        };
    },

    transformSankeyData(apiResponse) {
        const summary = apiResponse?.summary || {};
        const taxonomy = apiResponse?.taxonomy || {};

        const totalReads = Number(summary.total_reads || 0);
        const classifiedReads = Number(summary.classified_reads || 0);
        const unclassifiedReads = Math.max(totalReads - classifiedReads, 0);

        if (!totalReads) {
            return null;
        }

        const bacteriaReads = Math.round((Number(taxonomy.bacteria || 0) / 100) * classifiedReads);
        const virusReads = Math.round((Number(taxonomy.viruses || 0) / 100) * classifiedReads);
        const otherReads = Math.max(classifiedReads - bacteriaReads - virusReads, 0);

        return {
            nodes: [
                {
                    id: 'raw',
                    name: `Raw Reads (${this.formatNumber(totalReads)})`,
                    value: totalReads,
                    column: 0,
                    color: '#6B7280',
                    info: 'Total reads from analysis'
                },
                {
                    id: 'classified',
                    name: `Classified (${this.formatNumber(classifiedReads)})`,
                    value: classifiedReads,
                    column: 1,
                    color: '#008080',
                    info: 'Reads classified by CLARK'
                },
                {
                    id: 'unclassified',
                    name: `Unclassified (${this.formatNumber(unclassifiedReads)})`,
                    value: unclassifiedReads,
                    column: 1,
                    color: '#9CA3AF',
                    info: 'Reads without confident assignment'
                },
                {
                    id: 'bacteria',
                    name: `Bacteria (${this.formatNumber(bacteriaReads)})`,
                    value: bacteriaReads,
                    column: 2,
                    color: '#008080',
                    info: 'Bacterial assignments'
                },
                {
                    id: 'viruses',
                    name: `Viruses (${this.formatNumber(virusReads)})`,
                    value: virusReads,
                    column: 2,
                    color: '#10B981',
                    info: 'Viral assignments'
                },
                {
                    id: 'other',
                    name: `Other (${this.formatNumber(otherReads)})`,
                    value: otherReads,
                    column: 2,
                    color: '#F59E0B',
                    info: 'Other classified reads'
                }
            ],
            links: [
                { source: 'raw', target: 'classified', value: classifiedReads, label: 'Classified reads' },
                { source: 'raw', target: 'unclassified', value: unclassifiedReads, label: 'Unclassified reads' },
                { source: 'classified', target: 'bacteria', value: bacteriaReads, label: 'Bacterial reads' },
                { source: 'classified', target: 'viruses', value: virusReads, label: 'Viral reads' },
                { source: 'classified', target: 'other', value: otherReads, label: 'Other reads' }
            ]
        };
    },

    // ============================================
    // MOCK DATA (fallbacks when no real data)
    // ============================================

    /**
     * Mock sunburst data - taxonomic hierarchy
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
                    confidence: 96
                },
                {
                    name: 'Viruses',
                    value: 4.8,
                    color: '#10B981',
                    reads: 362000,
                    confidence: 81
                },
                {
                    name: 'Proteobacteria',
                    value: 48,
                    color: '#0EA5E9',
                    reads: 3620000,
                    confidence: 94
                },
                {
                    name: 'Firmicutes',
                    value: 18,
                    color: '#6366F1',
                    reads: 1360000,
                    confidence: 89
                }
            ]
        };
    },

    /**
     * Mock sankey data - read classification pipeline flow
     */
    getMockSankeyData() {
        return {
            nodes: [
                { id: 'raw', name: 'Raw Reads (11.89M)', value: 11890000, column: 0, color: '#6B7280', info: 'Total sequenced reads from FASTQ' },
                { id: 'classified', name: 'Classified (7.56M)', value: 7560000, column: 1, color: '#008080', info: 'Reads matched database' },
                { id: 'unclassified', name: 'Unclassified (4.33M)', value: 4330000, column: 1, color: '#9CA3AF', info: 'No confident taxonomic match' },
                { id: 'bacteria', name: 'Bacteria (5.35M)', value: 5350000, column: 2, color: '#008080', info: 'Bacterial assignments' },
                { id: 'virus', name: 'Viruses (362K)', value: 362000, column: 2, color: '#10B981', info: 'Viral assignments' },
                { id: 'other', name: 'Other (1.85M)', value: 1848000, column: 2, color: '#F59E0B', info: 'Other reads' }
            ],
            links: [
                { source: 'raw', target: 'classified', value: 7560000, label: 'Reads classified' },
                { source: 'raw', target: 'unclassified', value: 4330000, label: 'Reads unclassified' },
                { source: 'classified', target: 'bacteria', value: 5350000, label: 'Bacterial reads' },
                { source: 'classified', target: 'virus', value: 362000, label: 'Viral reads' },
                { source: 'classified', target: 'other', value: 1848000, label: 'Other reads' }
            ]
        };
    },

    /**
     * Mock treemap data - species abundance with clinical relevance
     */
    getMockTreemapData() {
        return [
            {
                name: 'Escherichia coli',
                value: 45.2,
                reads: 3420000,
                confidence: 95,
                risk: 'High',
                color: '#EF4444',
                // amrGenes: 5,
                virulenceFactors: 12
            },
            {
                name: 'Staphylococcus aureus',
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
                // amrGenes: 4,
                virulenceFactors: 6
            },
            {
                name: 'Klebsiella pneumoniae',
                value: 5.1,
                reads: 390000,
                confidence: 78,
                risk: 'High',
                color: '#EAB308',
                // amrGenes: 3,
                virulenceFactors: 4
            }
        ];
    },

    /**
     * Mock radar data - pathogen comparison across multiple dimensions
     */
    getMockRadarData() {
        return {
            axes: ['Abundance', 'Confidence', 'Virulence', 'Risk'],
            pathogens: [
                {
                    name: 'Escherichia coli',
                    color: '#EF4444',
                    metrics: {
                        Abundance: 45.2,
                        Confidence: 95,
                        Virulence: 12,
                        // AMR: 5,
                        Risk: 9
                    }
                },
                {
                    name: 'Staphylococcus aureus',
                    color: '#F97316',
                    metrics: {
                        Abundance: 18.6,
                        Confidence: 87,
                        Virulence: 8,
                        // AMR: 7,
                        Risk: 8
                    }
                },
                {
                    name: 'Pseudomonas aeruginosa',
                    color: '#F59E0B',
                    metrics: {
                        Abundance: 8.3,
                        Confidence: 82,
                        Virulence: 6,
                        //AMR: 4,
                        Risk: 6
                    }
                }
            ]
        };
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => Charts.init());

// Export for global access
window.Charts = Charts;


