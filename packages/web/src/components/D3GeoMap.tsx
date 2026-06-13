import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { X, Activity, Server, Factory, Store, Wifi, Zap } from 'lucide-react';
import DemoBadge from './DemoBadge';

const D3GeoMap = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [hoverNode, setHoverNode] = useState<{data: any, x: number, y: number} | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    
    const width = 800; // Increase width for better aspect ratio inside container
    const height = 500;
    const svg = d3.select(svgRef.current);
    
    svg.selectAll('*').remove();

    // Set up projection (abstract map pattern for demo)
    const projection = d3.geoMercator()
      .center([104, 34]) // China center shifted
      .scale(600)
      .translate([width / 2, height / 2]);

    // Mock data for nodes
    const nodes = [
      { id: 1, name: '大理种植基地', type: 'farm', coordinates: [100.22, 25.58], value: 100, status: 'online', activeBatches: 124, temp: 24.5, humidity: 68, manager: '李建国', lastOperation: '追施芍药专用缓释肥', progress: '85%' },
      { id: 2, name: '昆明加工中心', type: 'factory', coordinates: [102.71, 25.04], value: 80, status: 'busy', processedToday: 4500, lineEfficiency: '92%' },
      { id: 3, name: '上海分销仓', type: 'terminal', coordinates: [121.47, 31.23], value: 150, status: 'online', inventoryLevel: '85%', todayDispatch: 1240 },
      { id: 4, name: '北京集散网点', type: 'terminal', coordinates: [116.40, 39.90], value: 120, status: 'online', inventoryLevel: '62%', todayDispatch: 980 },
      { id: 5, name: '广州终端', type: 'terminal', coordinates: [113.26, 23.12], value: 90, status: 'warning', inventoryLevel: '15%', todayDispatch: 850 },
      { id: 6, name: '成都加工分部', type: 'factory', coordinates: [104.06, 30.65], value: 70, status: 'online', processedToday: 2100, lineEfficiency: '88%' },
      { id: 7, name: '西安周转站', type: 'terminal', coordinates: [108.93, 34.26], value: 50, status: 'online', inventoryLevel: '45%', todayDispatch: 320 },
      { id: 8, name: '高山温室示范区', type: 'farm', coordinates: [101.55, 26.24], value: 90, status: 'online', activeBatches: 85, temp: 26.2, humidity: 72, manager: '王建树', lastOperation: '叶面微量元素喷洒', progress: '42%' },
    ];

    // Glow filter
    const defs = svg.append('defs');
    const filter = defs.append('filter')
      .attr('id', 'glow')
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
      .attr('stroke', 'rgba(16, 185, 129, 0.4)') // emerald-500
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '6, 6')
      .style('animation', 'dash 20s linear infinite');

    // Draw nodes
    const nodeGroups = svg.append('g')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('transform', d => {
        const c = projection(d.coordinates as [number, number]);
        return c ? `translate(${c[0]},${c[1]})` : '';
      })
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        setSelectedNode(d);
      })
      .on('mouseover', function(event, d) {
        d3.select(this).select('circle.main-node').attr('stroke', '#1e293b').attr('stroke-width', 2);
        
        const bounds = svgRef.current?.getBoundingClientRect();
        if (bounds) {
          setHoverNode({
            data: d,
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top
          });
        }
      })
      .on('mousemove', function(event, d) {
        const bounds = svgRef.current?.getBoundingClientRect();
        if (bounds) {
          setHoverNode({
            data: d,
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top
          });
        }
      })
      .on('mouseout', function() {
        d3.select(this).select('circle.main-node').attr('stroke', 'none');
        setHoverNode(null);
      });

    nodeGroups.append('circle')
      .attr('class', 'main-node')
      .attr('r', d => Math.sqrt(d.value) * 1.8)
      .attr('fill', d => {
        if (d.type === 'farm') return '#10b981'; // emerald-500
        if (d.type === 'factory') return '#f59e0b'; // amber-500
        return '#3b82f6'; // blue-500
      })
      .attr('opacity', 0.85)
      .style('filter', 'url(#glow)')
      .style('transition', 'all 0.3s');

    nodeGroups.append('circle')
      .attr('r', 4)
      .attr('fill', '#ffffff');

    // Tooltips
    nodeGroups.append('text')
      .attr('dx', 18)
      .attr('dy', 5)
      .text(d => d.name)
      .attr('fill', '#334155')
      .attr('font-size', '13px')
      .attr('font-weight', 'bold')
      .style('text-shadow', '1px 1px 3px rgba(255,255,255,0.9)');

  }, []);

  return (
    <div className="w-full h-full relative overflow-hidden rounded-xl bg-[#f8fafc]">
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10">
        <DemoBadge />
      </div>
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 bg-white/80 p-3 rounded-lg shadow-sm border border-slate-200 backdrop-blur-md">
         <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span> 所有种植基地
         </div>
         <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <span className="w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"></span> 各级加工中心
         </div>
         <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <span className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></span> 流通与销售终端
         </div>
      </div>

      {selectedNode && (
        <div className="absolute top-4 right-4 z-20 w-72 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-right-4">
           <div className={`p-4 border-b flex justify-between items-start
              ${selectedNode.type === 'farm' ? 'bg-emerald-50 border-emerald-100' : 
                selectedNode.type === 'factory' ? 'bg-amber-50 border-amber-100' : 
                'bg-blue-50 border-blue-100'}`}>
              <div>
                 <div className="flex items-center gap-2 mb-1">
                    {selectedNode.type === 'farm' && <Server className="w-4 h-4 text-emerald-600" />}
                    {selectedNode.type === 'factory' && <Factory className="w-4 h-4 text-amber-600" />}
                    {selectedNode.type === 'terminal' && <Store className="w-4 h-4 text-blue-600" />}
                    <h3 className="font-bold text-slate-800">{selectedNode.name}</h3>
                 </div>
                 <div className="flex items-center gap-2 text-[10px] font-bold tracking-wider uppercase">
                   <span className={`px-1.5 py-0.5 rounded text-white ${selectedNode.status === 'online' ? 'bg-emerald-500' : selectedNode.status === 'busy' ? 'bg-indigo-500' : 'bg-rose-500'}`}>
                     {selectedNode.status}
                   </span>
                   <span className="text-slate-500 flex items-center gap-1"><Wifi className="w-3 h-3" /> 实时链路正常</span>
                 </div>
              </div>
              <button onClick={() => setSelectedNode(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
           </div>
           <div className="p-4 space-y-4 bg-white text-sm">
              {selectedNode.type === 'farm' && (
                 <>
                   <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                     <span className="text-slate-500 font-medium">当前负责人</span>
                     <span className="font-bold text-slate-700">{selectedNode.manager}</span>
                   </div>
                   <div className="flex flex-col gap-1 border-b border-slate-50 pb-2">
                     <div className="flex justify-between items-center">
                        <span className="text-slate-500 font-medium">生态种植周期</span>
                        <span className="font-bold text-indigo-600">{selectedNode.progress}</span>
                     </div>
                     <div className="w-full bg-slate-100 rounded-full h-1.5 mt-0.5">
                        <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: selectedNode.progress }}></div>
                     </div>
                   </div>
                   <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                     <span className="text-slate-500 font-medium">最新农事操作</span>
                     <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-sm">{selectedNode.lastOperation}</span>
                   </div>
                   <div className="flex justify-between items-center border-b border-slate-50 pb-2 mt-2">
                     <span className="text-slate-500 font-medium">当前活跃批次</span>
                     <span className="font-bold text-slate-700">{selectedNode.activeBatches} 个</span>
                   </div>
                   <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                     <span className="text-slate-500 font-medium">实时环境温湿</span>
                     <span className="font-bold text-emerald-600">{selectedNode.temp}°C / {selectedNode.humidity}%</span>
                   </div>
                   <div className="mt-2 text-xs text-slate-400 flex items-center gap-1"><Activity className="w-3 h-3" /> 数据刷新于刚刚</div>
                 </>
              )}
              {selectedNode.type === 'factory' && (
                 <>
                   <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                     <span className="text-slate-500 font-medium">今日加工量</span>
                     <span className="font-bold text-amber-600">{selectedNode.processedToday} 件</span>
                   </div>
                   <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                     <span className="text-slate-500 font-medium">流水线综合效能</span>
                     <span className="font-bold text-slate-700">{selectedNode.lineEfficiency}</span>
                   </div>
                 </>
              )}
              {selectedNode.type === 'terminal' && (
                 <>
                   <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                     <span className="text-slate-500 font-medium">当前库存水位</span>
                     <span className={`font-bold ${selectedNode.inventoryLevel === '15%' ? 'text-rose-600 font-black' : 'text-blue-600'}`}>{selectedNode.inventoryLevel}</span>
                   </div>
                   <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                     <span className="text-slate-500 font-medium">今日已发货栈</span>
                     <span className="font-bold text-slate-700">{selectedNode.todayDispatch} 单</span>
                   </div>
                   {selectedNode.inventoryLevel === '15%' && (
                     <div className="mt-2 text-xs text-rose-600 bg-rose-50 p-2 rounded flex items-start gap-1">
                        <Zap className="w-3 h-3 mt-0.5 shrink-0" />
                        库存告警：建议立刻从【昆明加工中心】调拨至少1000件填仓。
                     </div>
                   )}
                 </>
              )}
           </div>
        </div>
      )}
      <svg ref={svgRef} className="w-full h-full" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice"></svg>

      {/* Tooltip Overlay */}
      {hoverNode && hoverNode.data && (
        <div 
          className="absolute z-30 pointer-events-none bg-slate-900/95 text-white rounded-xl shadow-2xl border border-slate-700/50 backdrop-blur min-w-[220px] overflow-hidden"
          style={{ 
            left: hoverNode.x + 15, 
            top: hoverNode.y + 15 
          }}
        >
          <div className="px-3 py-2 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/50">
             <span className="font-bold text-sm text-slate-100">{hoverNode.data.name}</span>
             <span className="text-[10px] font-mono bg-slate-700 px-1.5 py-0.5 rounded text-slate-300">{hoverNode.data.type.toUpperCase()}</span>
          </div>
          <div className="p-3 space-y-2 text-xs">
             {hoverNode.data.type === 'farm' ? (
                <>
                  <div className="flex justify-between items-center opacity-80">
                    <span className="text-slate-400">大棚负责人</span>
                    <span className="font-medium">{hoverNode.data.manager || '系统指派'}</span>
                  </div>
                  <div className="flex justify-between items-center opacity-80 mt-1">
                    <span className="text-slate-400">实时进度</span>
                    <span className="font-bold text-emerald-400">{hoverNode.data.progress || 'N/A'}</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-700/50">
                    <span className="text-slate-400 block mb-1">最新农事操作</span>
                    <span className="text-emerald-300 font-medium bg-emerald-900/30 px-2 py-0.5 rounded inline-block">{hoverNode.data.lastOperation || '日常巡检'}</span>
                  </div>
                </>
             ) : (
                <>
                  <div className="flex justify-between items-center opacity-80">
                    <span className="text-slate-400">状态</span>
                    <span className={hoverNode.data.status === 'online' ? 'text-emerald-400' : 'text-amber-400'}>{hoverNode.data.status}</span>
                  </div>
                  <div className="pt-1 mt-1 border-t border-slate-700/50 text-[10px] text-slate-400">
                    点击节点查看详情面板
                  </div>
                </>
             )}
          </div>
        </div>
      )}
    </div>
  );
};

export default D3GeoMap;
