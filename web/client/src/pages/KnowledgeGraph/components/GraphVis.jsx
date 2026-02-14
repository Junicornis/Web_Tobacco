import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { Spin, Empty } from 'antd';

const GraphVis = ({ 
    data, 
    onNodeClick, 
    height = '100%',
    hiddenEdgeTypes = [],
    onEdgeTypesLoaded 
}) => {
    const containerRef = useRef(null);
    const svgRef = useRef(null);
    const [loading, setLoading] = useState(true);
    
    // Extract unique edge types and notify parent
    useEffect(() => {
        if (!data.edges) return;
        const types = Array.from(new Set(data.edges.map(e => e.type || e.label))).filter(Boolean);
        if (onEdgeTypesLoaded) {
            onEdgeTypesLoaded(types);
        }
    }, [data.edges, onEdgeTypesLoaded]);

    useEffect(() => {
        if (!data.nodes.length) {
            setLoading(false);
            return;
        }

        const container = containerRef.current;
        if (!container) return;

        // 渲染图表的函数
        const renderGraph = (width, h) => {
            setLoading(true);
            
            // Clear previous svg content
            d3.select(svgRef.current).selectAll("*").remove();

            const svg = d3.select(svgRef.current)
                .attr('width', width)
                .attr('height', h)
                .attr('viewBox', [0, 0, width, h])
                .style('max-width', '100%')
                .style('background', 'transparent'); // Let parent control background

            // Filter edges
            const filteredEdges = data.edges
                .filter(e => !hiddenEdgeTypes.includes(e.type || e.label))
                .map(d => ({ ...d }));
                
            const nodes = data.nodes.map(d => ({ ...d }));

            // Force Simulation
            const simulation = d3.forceSimulation(nodes)
                .force("link", d3.forceLink(filteredEdges).id(d => d.id).distance(150))
                .force("charge", d3.forceManyBody().strength(-400))
                .force("center", d3.forceCenter(width / 2, h / 2))
                .force("collide", d3.forceCollide().radius(40).strength(0.7));

            // Define gradients and markers
            const defs = svg.append("defs");
            
            // Arrowhead marker
            defs.append("marker")
                .attr("id", "arrowhead")
                .attr("viewBox", "0 -5 10 10")
                .attr("refX", 28) // Offset to not overlap with node
                .attr("refY", 0)
                .attr("markerWidth", 6)
                .attr("markerHeight", 6)
                .attr("orient", "auto")
                .append("path")
                .attr("d", "M0,-5L10,0L0,5")
                .attr("fill", "#bbb");

            // Container for zoom
            const g = svg.append("g");

            // Zoom behavior
            const zoom = d3.zoom()
                .scaleExtent([0.1, 4])
                .on("zoom", (event) => {
                    g.attr("transform", event.transform);
                });
            svg.call(zoom);

            // Render Edges
            const link = g.append("g")
                .selectAll(".link")
                .data(filteredEdges)
                .join("g")
                .attr("class", "link");

            const linkPath = link.append("path")
                .attr("stroke", "#e0e0e0")
                .attr("stroke-opacity", 1)
                .attr("stroke-width", 1.5)
                .attr("fill", "none")
                .attr("marker-end", "url(#arrowhead)");

            const linkText = link.append("text")
                .attr("dy", -4)
                .attr("font-size", 10)
                .attr("fill", "#999")
                .attr("text-anchor", "middle")
                .style("pointer-events", "none") // Let clicks pass through to path/canvas
                .text(d => d.label || d.type);

            // Render Nodes
            const node = g.append("g")
                .selectAll(".node")
                .data(nodes)
                .join("g")
                .attr("class", "node")
                .style("cursor", "pointer")
                .call(d3.drag()
                    .on("start", dragstarted)
                    .on("drag", dragged)
                    .on("end", dragended));

            // Node Circle
            node.append("circle")
                .attr("r", 24)
                .attr("fill", d => d.color || '#1890ff')
                .attr("stroke", "#fff")
                .attr("stroke-width", 3)
                .style("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.1))")
                .style("transition", "all 0.3s ease");

            // Node Label (Icon/Short)
            node.append("text")
                .attr("dy", 5)
                .attr("text-anchor", "middle")
                .attr("fill", "#fff")
                .attr("font-size", 12)
                .attr("font-weight", "bold")
                .style("pointer-events", "none")
                .text(d => d.label ? d.label.substring(0, 2) : '');

            // Node Label (Full Name)
            node.append("text")
                .attr("dy", 40)
                .attr("text-anchor", "middle")
                .attr("fill", "#333")
                .attr("font-size", 12)
                .attr("font-weight", "500")
                .style("text-shadow", "0 1px 2px rgba(255,255,255,0.8)")
                .text(d => d.label);

            // Interactions
            node.on("click", (event, d) => {
                event.stopPropagation(); // Prevent canvas click
                if (onNodeClick) onNodeClick(d);
            });

            // Hover Effects
            node.on("mouseover", function(event, d) {
                // Highlight Node
                d3.select(this).select("circle")
                    .attr("stroke", "#333")
                    .style("filter", "drop-shadow(0 4px 8px rgba(0,0,0,0.2))")
                    .attr("transform", "scale(1.1)");
                
                // Highlight Connected Links
                const connectedLinks = link.filter(l => l.source.id === d.id || l.target.id === d.id);
                
                connectedLinks.select("path")
                    .attr("stroke", "#1890ff")
                    .attr("stroke-width", 2.5)
                    .attr("stroke-opacity", 1)
                    .attr("marker-end", "url(#arrowhead-active)"); // Need to define active marker if we want color change
                
                connectedLinks.select("text")
                    .attr("fill", "#1890ff")
                    .attr("font-weight", "bold");

                // Fade others
                link.filter(l => l.source.id !== d.id && l.target.id !== d.id)
                    .style("opacity", 0.1);
                node.filter(n => n.id !== d.id && !isConnected(d, n))
                    .style("opacity", 0.3);
            })
            .on("mouseout", function() {
                // Reset Node
                d3.select(this).select("circle")
                    .attr("stroke", "#fff")
                    .style("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.1))")
                    .attr("transform", "scale(1)");
                
                // Reset Links
                link.select("path")
                    .attr("stroke", "#e0e0e0")
                    .attr("stroke-width", 1.5)
                    .attr("stroke-opacity", 1)
                    .attr("marker-end", "url(#arrowhead)");
                
                link.select("text")
                    .attr("fill", "#999")
                    .attr("font-weight", "normal");

                // Reset Opacity
                link.style("opacity", 1);
                node.style("opacity", 1);
            });

            // Helper to check connection
            function isConnected(a, b) {
                return filteredEdges.some(l => 
                    (l.source.id === a.id && l.target.id === b.id) || 
                    (l.source.id === b.id && l.target.id === a.id)
                );
            }

            // Simulation tick
            simulation.on("tick", () => {
                linkPath.attr("d", d => {
                    // Curved lines (Bezier)
                    const dx = d.target.x - d.source.x;
                    const dy = d.target.y - d.source.y;
                    const dr = Math.sqrt(dx * dx + dy * dy);
                    // Less curvature for cleaner look
                    return `M${d.source.x},${d.source.y}A${dr * 1.5},${dr * 1.5} 0 0,1 ${d.target.x},${d.target.y}`;
                });
                
                linkText
                    .attr("x", d => (d.source.x + d.target.x) / 2)
                    .attr("y", d => (d.source.y + d.target.y) / 2);

                node.attr("transform", d => `translate(${d.x},${d.y})`);
            });

            function dragstarted(event, d) {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            }

            function dragged(event, d) {
                d.fx = event.x;
                d.fy = event.y;
            }

            function dragended(event, d) {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            }

            setLoading(false);
            return simulation;
        };

        // 使用 ResizeObserver 监听容器大小变化
        let simulation = null;
        const resizeObserver = new ResizeObserver(entries => {
            if (!entries || entries.length === 0) return;
            
            const { width, height: contentHeight } = entries[0].contentRect;
            
            // 计算高度
            let h;
            if (typeof height === 'number') {
                h = height;
            } else if (typeof height === 'string' && height.endsWith('px')) {
                h = parseInt(height, 10);
            } else {
                h = contentHeight;
            }

            // 只有当有有效宽高时才渲染
            if (width > 0 && h > 0) {
                if (simulation) simulation.stop();
                simulation = renderGraph(width, h);
            }
        });
        
        resizeObserver.observe(container);

        return () => {
            resizeObserver.disconnect();
            if (simulation) simulation.stop();
        };
    }, [data, height, onNodeClick, hiddenEdgeTypes]);

    if (!data.nodes.length) {
        return <Empty description="暂无图谱数据" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: '20%' }} />;
    }

    return (
        <div 
            ref={containerRef} 
            style={{ 
                width: '100%', 
                height: height,
                position: 'relative',
                overflow: 'hidden',
                // background handled by parent
            }}
        >
            <svg ref={svgRef} style={{ display: 'block' }} />
            
            {loading && (
                <div style={{ 
                    position: 'absolute', 
                    top: '50%', 
                    left: '50%', 
                    transform: 'translate(-50%, -50%)',
                    background: 'rgba(255,255,255,0.8)',
                    padding: '20px',
                    borderRadius: '8px'
                }}>
                    <Spin tip="图谱渲染中..." size="large" />
                </div>
            )}
        </div>
    );
};

export default GraphVis;