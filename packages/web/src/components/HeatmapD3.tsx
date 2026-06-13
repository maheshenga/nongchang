import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import DemoBadge from './DemoBadge';

export default function HeatmapD3() {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    
    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 400;
    
    // Clear previous
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    // Set up projection (abstract China map pattern)
    // Center around central China
    const projection = d3.geoMercator()
      .center([104, 35]) 
      .scale(width * 0.8)
      .translate([width / 2, height / 2]);

    // Mock data for nodes
    const nodes = [
      { name: '大理农场 (基地)', type: 'farm', coordinates: [100.22, 25.58], value: 120 },
      { name: '昆明加工 (工厂)', type: 'factory', coordinates: [102.71, 25.04], value: 90 },
      { name: '上海 (流通)', type: 'terminal', coordinates: [121.47, 31.23], value: 180 },
      { name: '北京 (流通)', type: 'terminal', coordinates: [116.40, 39.90], value: 150 },
      { name: '广州 (流通)', type: 'terminal', coordinates: [113.26, 23.12], value: 130 },
      { name: '成都 (加工)', type: 'factory', coordinates: [104.06, 30.65], value: 80 },
      { name: '西安 (流通)', type: 'terminal', coordinates: [108.93, 34.26], value: 60 },
    ];

    // Glow filter
    const defs = svg.append('defs');
    const filter = defs.append('filter')
      .attr('id', 'mapGlow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
      
    filter.append('feGaussianBlur')
      .attr('stdDeviation', '4')
      .attr('result', 'coloredBlur');
      
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Draw grid map mock background points for aesthetic
    const gridPoints = [];
    for (let x = 75; x < 135; x += 3) {
      for (let y = 20; y < 55; y += 3) {
         const p = projection([x, y]);
         if (p && p[0] > 0 && p[0] < width && p[1] > 0 && p[1] < height) {
            gridPoints.push(p);
         }
      }
    }
    
    svg.append('g')
      .selectAll('circle')
      .data(gridPoints)
      .enter()
      .append('circle')
      .attr('cx', d => d[0])
      .attr('cy', d => d[1])
      .attr('r', 1)
      .attr('fill', '#cbd5e1')
      .attr('opacity', 0.5);

    // Draw some abstract connections
    svg.append('g')
      .selectAll('line')
      .data([
        [nodes[0], nodes[1]], // farm to factory
        [nodes[1], nodes[2]], // factory to terminal
        [nodes[1], nodes[3]], 
        [nodes[1], nodes[4]],
        [nodes[1], nodes[5]],
        [nodes[5], nodes[6]],
      ])
      .enter()
      .append('path')
      .attr('d', d => {
        const [p1, p2] = d;
        const c1 = projection(p1.coordinates as [number, number]);
        const c2 = projection(p2.coordinates as [number, number]);
        if (!c1 || !c2) return '';
        // curved path
        const dx = c2[0] - c1[0], dy = c2[1] - c1[1];
        const dr = Math.sqrt(dx * dx + dy * dy) * 1.5;
        return `M${c1[0]},${c1[1]}A${dr},${dr} 0 0,1 ${c2[0]},${c2[1]}`;
      })
      .attr('fill', 'none')
      .attr('stroke', 'rgba(16, 185, 129, 0.4)')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5, 5')
      .style('animation', 'dash 20s linear infinite');

    // Draw nodes
    const nodeGroups = svg.append('g')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('className', 'cursor-pointer')
      .attr('transform', d => {
        const c = projection(d.coordinates as [number, number]);
        return c ? `translate(${c[0]},${c[1]})` : '';
      })
      .on('mouseover', function(e, d) {
         d3.select(this).select('.base-circle').attr('r', Math.sqrt(d.value) * 2).attr('opacity', 0.9);
      })
      .on('mouseout', function(e, d) {
         d3.select(this).select('.base-circle').attr('r', Math.sqrt(d.value) * 1.5).attr('opacity', 0.7);
      });

    nodeGroups.append('circle')
      .attr('class', 'base-circle')
      .attr('r', d => Math.sqrt(d.value) * 1.5)
      .attr('fill', d => {
        if (d.type === 'farm') return '#10b981'; // emerald
        if (d.type === 'factory') return '#f59e0b'; // amber
        return '#3b82f6'; // blue
      })
      .attr('opacity', 0.7)
      .style('filter', 'url(#mapGlow)')
      .style('transition', 'all 0.3s');

    nodeGroups.append('circle')
      .attr('r', 4)
      .attr('fill', '#ffffff')
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 1);

    // Tooltips
    nodeGroups.append('text')
      .attr('dx', 15)
      .attr('dy', 5)
      .text(d => d.name)
      .attr('fill', '#334155')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .style('text-shadow', '2px 2px 4px rgba(255,255,255,0.9), -2px -2px 4px rgba(255,255,255,0.9)');
      
  }, []);

  return (
    <div className="w-full h-full relative cursor-crosshair overflow-hidden rounded-xl bg-slate-50 border border-slate-100 shadow-inner">
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10">
        <DemoBadge />
      </div>
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 bg-white/90 p-3 rounded-lg shadow-sm border border-slate-200 backdrop-blur-sm">
         <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span> 农产品基地
         </div>
         <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <span className="w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"></span> 加工中心
         </div>
         <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <span className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></span> 流通终端
         </div>
      </div>
      <svg ref={svgRef} className="w-full h-full" preserveAspectRatio="xMidYMid slice"></svg>
    </div>
  );
}

