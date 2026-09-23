'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabase';
import { Printer, Filter, BarChart3, X, CheckCircle2, Building2, HardHat, Layers, Clock, Wallet, Info, ChevronDown } from 'lucide-react';
import { Project, WorkReport } from '../../types';

interface CostsTabProps {
  allProjectsList: Project[];
  assumptions: { vdc_engineer_monthly_cost: number; standard_working_days: number };
}

const safeString = (val: any) => ((val !== null && val !== undefined) ? String(val).trim() : '');

const getReportMonth = (dateStr: string) => {
  if (!dateStr) return 'Unknown';
  const [yStr, mStr, dStr] = dateStr.split('-');
  const y = parseInt(yStr); const m = parseInt(mStr); const d = parseInt(dStr);
  if (dateStr < "2026-07-01") return `${yStr}-${mStr}`;
  if (dateStr >= "2026-07-01" && dateStr <= "2026-07-23") return "2026-07";
  if (d >= 24) {
    let nextM = m + 1; let nextY = y;
    if (nextM > 12) { nextM = 1; nextY++; }
    return `${nextY}-${nextM.toString().padStart(2, '0')}`;
  }
  return `${yStr}-${mStr}`;
};

const getProjectDisplayName = (projectObj: any, rawName: string, allProjectsList: Project[]) => {
  const pName = safeString(projectObj ? projectObj.project_name : rawName);
  if (!pName || pName === 'אחר (פירוט בהערות)') return pName;
  let p = projectObj || allProjectsList.find(x => safeString(x.project_name) === pName);
  if (p) {
    const finalName = safeString(p.project_name);
    const pCode = safeString(p.project_code || p.code || p.project_number);
    if (pCode && pCode !== 'null') if (!finalName.includes(pCode)) return `${finalName} (${pCode})`;
    return finalName;
  }
  return pName;
};

export default function CostsTab({ allProjectsList, assumptions }: CostsTabProps) {
  const today = new Date().toISOString().split('T')[0];
  const currentReportingMonth = getReportMonth(today);

  // States
  const [costSubTab, setCostSubTab] = useState<'monthly' | 'active' | 'inactive' | 'engineers'>('monthly');
  const [filterMonth, setFilterMonth] = useState(currentReportingMonth);
  const [reports, setReports] = useState<WorkReport[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [costSelectedProjects, setCostSelectedProjects] = useState<string[]>([]);
  const [showCostProjMenu, setShowCostProjMenu] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<string[]>([]);
  
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareGenMode, setCompareGenMode] = useState<'gen1' | 'gen2'>('gen2');
  const [compareSelected, setCompareSelected] = useState<string[]>([]);

  // Fetch Reports dynamically based on sub-tab
  useEffect(() => {
    const fetchCostReports = async () => {
      setLoading(true);
      let query = supabase.from('work_reports').select('*');
      
      // אם אנחנו בחתך חודשי - נביא רק את החודש, אחרת נביא את כל ההיסטוריה לחישוב מצטבר
      if (costSubTab === 'monthly') {
         const m = filterMonth || currentReportingMonth;
         const startStr = m < "2026-07" ? `${m}-01` : m === "2026-07" ? "2026-07-01" : `${m.split('-')[0]}-${String(Number(m.split('-')[1])-1).padStart(2,'0')}-24`;
         const endStr = m < "2026-07" ? `${m}-31` : m === "2026-07" ? "2026-07-23" : `${m}-23`;
         query = query.gte('report_date', startStr).lte('report_date', endStr);
      }
      
      let allFetched: WorkReport[] = [];
      let keepFetching = true; let startRow = 0; const step = 1000;
      
      while (keepFetching) {
        const { data, error } = await query.order('report_date', { ascending: false }).range(startRow, startRow + step - 1);
        if (error) break;
        if (data && data.length > 0) {
          allFetched = [...allFetched, ...data];
          if (data.length < step) keepFetching = false; else startRow += step;
        } else { keepFetching = false; }
      }
      
      setReports(allFetched);
      setLoading(false);
    };

    fetchCostReports();
  }, [costSubTab, filterMonth, currentReportingMonth]);

  // Core Data Calculation (useMemo prevents lagging)
  const costDataPayload = useMemo(() => {
    const globalProjectCosts: Record<string, { totalCost: number, baseDays: number, engineersMap: Record<string, any>, stagesMap: Record<string, any>, projectStats: any }> = {};
    const globalEngineerCosts: Record<string, { totalCost: number, baseDays: number, otherDays: number, projectsMap: Record<string, any> }> = {};
    const BASE_COST = assumptions.vdc_engineer_monthly_cost;

    allProjectsList.forEach(p => {
        const displayName = getProjectDisplayName(p, p.project_name, allProjectsList);
        if (!displayName) return;
        if (!globalProjectCosts[displayName]) {
            globalProjectCosts[displayName] = { 
              totalCost: 0, baseDays: 0, engineersMap: {}, stagesMap: {},
              projectStats: { has_sub_stages: p.has_sub_stages, buildings_count: p.buildings_count, apartments_count: p.apartments_count, typologies_count: p.typologies_count, parent_typologies_count: p.parent_typologies_count, sub_typologies_count: p.sub_typologies_count }
            };
        }
    });

    const reportsByMonth: Record<string, WorkReport[]> = {};
    reports.forEach(r => {
      const m = r.report_date ? getReportMonth(r.report_date) : 'Unknown';
      if (!reportsByMonth[m]) reportsByMonth[m] = [];
      reportsByMonth[m].push(r);
    });

    Object.keys(reportsByMonth).forEach(month => {
      const isCompletedMonth = month < currentReportingMonth;
      const mReports = reportsByMonth[month];
      const engData: Record<string, { totalDays: number, projects: Record<string, { totalDays: number, stages: Record<string, {days: number, stageName: string, subStageName: string}> }>, otherDays: number }> = {};
      
      mReports.forEach(r => {
         const cleanProjName = getProjectDisplayName(null, r.project_name, allProjectsList);
         if (!cleanProjName) return; 
         const engName = safeString(r.engineer_name) || 'לא ידוע';
         const stageName = safeString(r.stage) || 'כללי';
         const subStageName = safeString(r.sub_stage) || '';
         const days = r.scope === 'חצי יום' ? 0.5 : 1;
         
         if (!engData[engName]) engData[engName] = { totalDays: 0, projects: {}, otherDays: 0 };
         engData[engName].totalDays += days;
         
         if (cleanProjName === 'אחר (פירוט בהערות)') engData[engName].otherDays += days;
         else {
            if (!engData[engName].projects[cleanProjName]) engData[engName].projects[cleanProjName] = { totalDays: 0, stages: {} };
            engData[engName].projects[cleanProjName].totalDays += days;
            const stageKey = `${stageName}::${subStageName}`;
            if (!engData[engName].projects[cleanProjName].stages[stageKey]) engData[engName].projects[cleanProjName].stages[stageKey] = { days: 0, stageName, subStageName };
            engData[engName].projects[cleanProjName].stages[stageKey].days += days;
         }
      });

      Object.keys(engData).forEach(eng => {
         const data = engData[eng];
         if (data.totalDays === 0) return;
         const effectiveTotalDays = isCompletedMonth ? data.totalDays : assumptions.standard_working_days;
         const costPerDay = BASE_COST / effectiveTotalDays;
         const activeProjects = Object.keys(data.projects);
         const numProjects = activeProjects.length;
         const otherCost = data.otherDays * costPerDay;
         const distributedOtherCostPerProject = numProjects > 0 ? (otherCost / numProjects) : 0;

         if (!globalEngineerCosts[eng]) globalEngineerCosts[eng] = { totalCost: 0, baseDays: 0, otherDays: 0, projectsMap: {} };
         globalEngineerCosts[eng].otherDays += data.otherDays;
         if (numProjects === 0) globalEngineerCosts[eng].totalCost += otherCost;

         activeProjects.forEach(proj => {
            if (!globalProjectCosts[proj]) {
              const dbProject = allProjectsList.find(p => getProjectDisplayName(p, p.project_name, allProjectsList) === proj);
              globalProjectCosts[proj] = { 
                totalCost: 0, baseDays: 0, engineersMap: {}, stagesMap: {},
                projectStats: { has_sub_stages: dbProject?.has_sub_stages, buildings_count: dbProject?.buildings_count, apartments_count: dbProject?.apartments_count, typologies_count: dbProject?.typologies_count, parent_typologies_count: dbProject?.parent_typologies_count, sub_typologies_count: dbProject?.sub_typologies_count }
              };
            }
            const gProj = globalProjectCosts[proj];
            const projData = data.projects[proj];
            const directCost = projData.totalDays * costPerDay;
            const finalCost = directCost + distributedOtherCostPerProject;
            
            gProj.totalCost += finalCost;
            gProj.baseDays += projData.totalDays;

            if (!gProj.engineersMap[eng]) gProj.engineersMap[eng] = { cost: 0, directDays: 0 };
            gProj.engineersMap[eng].cost += finalCost;
            gProj.engineersMap[eng].directDays += projData.totalDays;

            if (!globalEngineerCosts[eng].projectsMap[proj]) globalEngineerCosts[eng].projectsMap[proj] = { cost: 0, days: 0, stagesMap: {} };
            globalEngineerCosts[eng].projectsMap[proj].cost += finalCost;
            globalEngineerCosts[eng].projectsMap[proj].days += projData.totalDays;
            globalEngineerCosts[eng].baseDays += projData.totalDays;
            globalEngineerCosts[eng].totalCost += finalCost;

            Object.keys(projData.stages).forEach(stageKey => {
                const { days: stageDays, stageName, subStageName } = projData.stages[stageKey];
                const finalStageCost = (stageDays * costPerDay) + (distributedOtherCostPerProject * (stageDays / projData.totalDays));

                if (!gProj.stagesMap[stageName]) gProj.stagesMap[stageName] = { cost: 0, days: 0, subStages: {} };
                gProj.stagesMap[stageName].cost += finalStageCost;
                gProj.stagesMap[stageName].days += stageDays;

                if (subStageName) {
                    if (!gProj.stagesMap[stageName].subStages[subStageName]) gProj.stagesMap[stageName].subStages[subStageName] = { cost: 0, days: 0 };
                    gProj.stagesMap[stageName].subStages[subStageName].cost += finalStageCost;
                    gProj.stagesMap[stageName].subStages[subStageName].days += stageDays;
                }
            });
         });
      });
    });

    const processedProjectsData = Object.keys(globalProjectCosts).map(p => {
       const pData = globalProjectCosts[p];
       const engineersArray = Object.keys(pData.engineersMap).map(e => ({ name: e, cost: pData.engineersMap[e].cost, directDays: pData.engineersMap[e].directDays })).sort((a,b) => b.cost - a.cost);
       const stagesArray = Object.keys(pData.stagesMap).map(s => {
           const subArray = Object.keys(pData.stagesMap[s].subStages).map(sub => ({ name: sub, cost: pData.stagesMap[s].subStages[sub].cost, days: pData.stagesMap[s].subStages[sub].days })).sort((a,b) => b.days - a.days);
           return { name: s, cost: pData.stagesMap[s].cost, days: pData.stagesMap[s].days, subStages: subArray };
       }).sort((a,b) => b.cost - a.cost);

       return { name: p, totalCost: pData.totalCost, baseDays: pData.baseDays, engineers: engineersArray, stages: stagesArray, stats: pData.projectStats };
    }).sort((a,b) => b.totalCost - a.totalCost);

    const processedEngineersData = Object.keys(globalEngineerCosts).map(eng => {
        const eData = globalEngineerCosts[eng];
        const projectsArray = Object.keys(eData.projectsMap).map(pName => {
            return { name: pName, cost: eData.projectsMap[pName].cost, days: eData.projectsMap[pName].days };
        }).sort((a,b) => b.cost - a.cost);
        return { name: eng, totalCost: eData.totalCost, baseDays: eData.baseDays, otherDays: eData.otherDays, projects: projectsArray };
    }).sort((a,b) => b.totalCost - a.totalCost);

    return { projectsData: processedProjectsData, engineersData: processedEngineersData };
  }, [reports, allProjectsList, assumptions, currentReportingMonth]);

  const isProjectActive = (formattedProjName: string) => { 
    if (formattedProjName === 'אחר (פירוט בהערות)') return false; 
    const p = allProjectsList.find(x => getProjectDisplayName(x, x.project_name, allProjectsList) === formattedProjName); 
    return p ? safeString(p.status) === 'פעיל' : false; 
  };

  let costData = costDataPayload.projectsData.filter(p => p.totalCost > 0 && p.name !== 'אחר (פירוט בהערות)' && !p.name.includes('תקורות חברה'));
  if (costSubTab === 'active') costData = costData.filter(p => isProjectActive(p.name));
  else if (costSubTab === 'inactive') costData = costData.filter(p => !isProjectActive(p.name));
  
  const engineerCostData = costDataPayload.engineersData.filter(e => e.totalCost > 0);
  const displayedCostData = costSelectedProjects.length > 0 ? costData.filter(p => costSelectedProjects.includes(p.name)) : costData;

  const toggleProjectExpand = (projName: string) => { setExpandedProjects(prev => prev.includes(projName) ? prev.filter(p => p !== projName) : [...prev, projName]); };

  if (loading) return <div className="text-center p-12 text-slate-500 font-medium">מחשב עלויות והעמסות...</div>;

  return (
    <div className="space-y-6 text-slate-800 animate-in fade-in duration-300">
      
      {/* אזור הדו"ח להדפסה בלבד עבור פרופיל מהנדסים */}
      <div className="hidden print:block text-black bg-white font-sans w-full" dir="rtl">
        <style>{`
          @media print { 
            @page { size: A4 portrait; margin: 8mm; } 
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 10px !important; } 
            .page-break-after { page-break-after: always; break-after: page; }
          }
        `}</style>
        {costSubTab === 'engineers' && (
           <div className="space-y-6">
              {engineerCostData.map((eng, idx) => (
                 <div key={idx} className={`p-6 bg-white border border-slate-300 rounded-lg ${idx < engineerCostData.length - 1 ? 'page-break-after' : ''}`}>
                    <div className="flex justify-between items-center border-b-2 border-slate-900 pb-3 mb-4">
                       <div>
                          <h1 className="text-xl font-black text-slate-900">פרופיל מהנדס: {eng.name}</h1>
                          <p className="text-xs text-slate-600 mt-1">VDC Control Center • סיכום עלויות והשקעה מקיף</p>
                       </div>
                       <div className="text-left">
                          <span className="block text-lg font-black text-blue-900">₪ {Math.round(eng.totalCost).toLocaleString()}</span>
                          <span className="text-[10px] text-slate-500">סה"כ עלות מועמסת ({eng.baseDays + eng.otherDays} ימ׳)</span>
                       </div>
                    </div>
                    <div className="space-y-4">
                       {eng.projects.map((proj: any, pIdx: number) => (
                          <div key={pIdx} className="border border-slate-200 rounded p-3 bg-slate-50/50 flex justify-between items-center font-bold text-slate-800 text-sm">
                             <span>{proj.name}</span>
                             <span>₪ {Math.round(proj.cost).toLocaleString()} ({proj.days} ימ')</span>
                          </div>
                       ))}
                    </div>
                    <div className="mt-8 text-center text-[9px] text-slate-400 font-mono pt-3 border-t border-slate-200">עמוד {idx + 1} מתוך {engineerCostData.length} • הופק ב- {new Date().toLocaleDateString('he-IL')}</div>
                 </div>
              ))}
           </div>
        )}
      </div>

      <div className="print:hidden">
        {!isCompareMode && (
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="flex bg-slate-200/50 rounded-md p-1 border border-slate-200 overflow-x-auto w-full sm:w-auto">
                <button onClick={() => setCostSubTab('monthly')} className={`px-5 py-2 text-sm font-semibold rounded transition whitespace-nowrap ${costSubTab === 'monthly' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>חתך חודשי</button>
                <button onClick={() => setCostSubTab('active')} className={`px-5 py-2 text-sm font-semibold rounded transition whitespace-nowrap ${costSubTab === 'active' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>פרויקטים פעילים (מצטבר)</button>
                <button onClick={() => setCostSubTab('inactive')} className={`px-5 py-2 text-sm font-semibold rounded transition whitespace-nowrap ${costSubTab === 'inactive' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>ארכיון פרויקטים (מצטבר)</button>
                <button onClick={() => setCostSubTab('engineers')} className={`px-5 py-2 text-sm font-semibold rounded transition whitespace-nowrap ${costSubTab === 'engineers' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>פרופיל מהנדס</button>
              </div>

              {costSubTab !== 'engineers' && (
                <div className="relative w-full sm:w-auto">
                  <button onClick={() => setShowCostProjMenu(!showCostProjMenu)} className="w-full sm:w-auto px-4 py-2 bg-white border border-slate-300 rounded flex items-center justify-center gap-2 text-sm font-bold text-slate-700 hover:bg-slate-50 shadow-sm transition">
                    <Filter className="w-4 h-4 text-slate-400" /> סנן פרויקטים להצגה {costSelectedProjects.length > 0 && <span className="bg-blue-100 text-blue-700 px-1.5 rounded-full text-xs">{costSelectedProjects.length}</span>}
                  </button>
                  {showCostProjMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowCostProjMenu(false)}></div>
                      <div className="absolute top-12 right-0 w-64 bg-white border border-slate-200 shadow-xl rounded-md z-50 p-3 max-h-72 overflow-y-auto text-sm font-normal">
                         <div className="font-bold text-slate-800 mb-2 border-b pb-1">בחר פרויקטים להצגה:</div>
                         {costData.map(p => (
                           <label key={p.name} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 cursor-pointer rounded">
                             <input type="checkbox" checked={costSelectedProjects.includes(p.name)}
                               onChange={() => {
                                 if (costSelectedProjects.includes(p.name)) setCostSelectedProjects(costSelectedProjects.filter(x => x !== p.name));
                                 else setCostSelectedProjects([...costSelectedProjects, p.name]);
                               }} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                             />
                             <span className="text-slate-700 truncate" title={p.name}>{p.name}</span>
                           </label>
                         ))}
                         <div className="pt-2 mt-2 border-t flex justify-end"><button onClick={() => setCostSelectedProjects([])} className="text-xs font-bold text-blue-600 hover:underline">נקה סינון (הצג הכל)</button></div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            {costSubTab === 'engineers' ? (
              <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-5 py-2.5 rounded-md font-bold hover:bg-slate-700 transition shadow-md text-sm"><Printer className="w-4 h-4" /> הפק PDF פרופילי מהנדסים</button>
            ) : costSubTab !== 'monthly' && (
              <button onClick={() => { setIsCompareMode(true); setCompareSelected([]); }} className="flex items-center justify-center w-full md:w-auto gap-2 px-5 py-2 bg-slate-800 text-white rounded-md font-bold hover:bg-slate-700 transition shadow-md text-sm"><BarChart3 className="w-4 h-4"/> השוואת פרויקטים</button>
            )}
          </div>
        )}

        {/* מודול השוואה */}
        {isCompareMode && costSubTab !== 'engineers' ? (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-md shadow-sm border border-slate-200 border-l-4 border-l-blue-600">
               <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-blue-500" /> מודול השוואת פרויקטים</h2>
               <div className="flex items-center gap-3">
                  <button onClick={() => window.print()} disabled={compareSelected.length === 0} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-md text-sm font-bold hover:bg-slate-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                    <Printer className="w-4 h-4" /> ייצוא ל-PDF
                  </button>
                  <button onClick={() => setIsCompareMode(false)} className="text-sm font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition">
                    <X className="w-4 h-4"/> חזור לתצוגה רגילה
                  </button>
               </div>
            </div>
            <div className="bg-slate-800 p-1.5 rounded-lg flex w-fit shadow-sm">
               <button onClick={() => { setCompareGenMode('gen1'); setCompareSelected([]); }} className={`px-5 py-2 text-sm font-bold rounded-md transition-colors ${compareGenMode === 'gen1' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}>דור 1 (תמחור בסיסי)</button>
               <button onClick={() => { setCompareGenMode('gen2'); setCompareSelected([]); }} className={`px-5 py-2 text-sm font-bold rounded-md transition-colors ${compareGenMode === 'gen2' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}>דור 2 (תמחור מתקדם)</button>
            </div>
            <div className="bg-white p-5 rounded-md shadow-sm border border-slate-200">
              <h3 className="font-bold text-sm text-slate-700 mb-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-blue-500"/> בחר פרויקטים להשוואה (לפחות 2):</h3>
              <div className="flex flex-wrap gap-2.5">
                {displayedCostData.filter(p => compareGenMode === 'gen2' ? p.stats?.has_sub_stages : !p.stats?.has_sub_stages).map(p => (
                   <label key={p.name} className={`flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer transition-all ${compareSelected.includes(p.name) ? 'bg-blue-50 border-blue-400 text-blue-800 shadow-inner' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'}`}>
                      <input type="checkbox" className="hidden" checked={compareSelected.includes(p.name)} onChange={() => {
                         if (compareSelected.includes(p.name)) setCompareSelected(compareSelected.filter(x => x !== p.name));
                         else setCompareSelected([...compareSelected, p.name]);
                      }}/>
                      <span className="font-medium text-sm select-none">{p.name}</span>
                   </label>
                ))}
                {displayedCostData.filter(p => compareGenMode === 'gen2' ? p.stats?.has_sub_stages : !p.stats?.has_sub_stages).length === 0 && (
                  <span className="text-sm text-slate-400 italic">אין פרויקטים זמינים להשוואה בדור זה תחת החתך הנבחר.</span>
                )}
              </div>
            </div>

            {compareSelected.length > 0 && (
               <div className="bg-white p-6 rounded-md shadow-sm border border-slate-200 overflow-x-auto">
                  <table className="w-full text-right text-sm border-collapse min-w-[600px]">
                     <thead>
                        <tr className="bg-slate-50 border-b-2 border-slate-300">
                           <th className="p-3 font-bold text-slate-500 w-48 border-l border-slate-200">מדד / שלב ביצוע</th>
                           {compareSelected.map(pName => <th key={pName} className="p-3 font-black text-slate-800 text-base border-r border-slate-200">{pName}</th>)}
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                        <tr>
                           <td className="p-3 font-bold text-slate-700 bg-slate-50/50 border-l border-slate-200">סה"כ עלות מועמסת</td>
                           {compareSelected.map(pName => {
                              const p = displayedCostData.find(x => x.name === pName);
                              return <td key={pName} className="p-3 font-black text-blue-700 text-lg border-r border-slate-100">₪ {Math.round(p?.totalCost || 0).toLocaleString()}</td>
                           })}
                        </tr>
                        <tr>
                           <td className="p-3 font-bold text-slate-700 bg-slate-50/50 border-l border-slate-200">ימי עבודה ישירים</td>
                           {compareSelected.map(pName => {
                              const p = displayedCostData.find(x => x.name === pName);
                              return <td key={pName} className="p-3 font-medium text-slate-700 border-r border-slate-100">{p?.baseDays || 0} ימ'</td>
                           })}
                        </tr>
                        <tr><td colSpan={compareSelected.length + 1} className="h-6 bg-slate-100/50"></td></tr>
                        {Array.from(new Set(compareSelected.flatMap(pName => displayedCostData.find(x => x.name === pName)?.stages?.map((s:any) => s.name) || []))).map(stageName => (
                           <tr key={stageName} className="hover:bg-slate-50 transition-colors">
                              <td className="p-3 font-bold text-slate-600 bg-slate-50/30 border-l border-slate-200"><div className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-slate-400"/> {stageName}</div></td>
                              {compareSelected.map(pName => {
                                 const p = displayedCostData.find(x => x.name === pName);
                                 const s = p?.stages?.find((x:any) => x.name === stageName);
                                 return (
                                    <td key={pName} className="p-3 border-r border-slate-100">
                                       {s ? (
                                          <div className="flex flex-col"><span className="font-bold text-slate-800">₪ {Math.round(s.cost).toLocaleString()}</span><span className="text-[11px] text-slate-400 font-medium">{s.days} ימי עבודה</span></div>
                                       ) : <span className="text-slate-300">-</span>}
                                    </td>
                                 )
                              })}
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            )}
          </div>
        ) : costSubTab === 'engineers' ? (
          // Engineers Profile
          <div className="flex flex-col gap-6 animate-in fade-in duration-300">
             <div className="bg-slate-800 text-slate-300 p-5 rounded-md shadow-sm border border-slate-700 mb-2 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                   <h3 className="font-bold text-white flex items-center gap-2 text-base"><HardHat className="w-4 h-4 text-blue-400" /> פרופיל מהנדס - ניתוח עלויות והשקעה</h3>
                   <p className="text-sm mt-1.5">הנתונים מוצגים באופן מצטבר עבור כל הפעילות שתועדה במערכת (בהתאם לסינון החודשי או הכללי שנבחר).</p>
                </div>
                <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-md text-sm font-bold hover:bg-slate-600 transition shadow-sm shrink-0">
                   <Printer className="w-4 h-4" /> הפק PDF פרופילי מהנדסים
                </button>
             </div>
             {engineerCostData.map((eng, idx) => {
                const isExpanded = expandedProjects.includes(eng.name);
                return (
                   <div key={idx} className="bg-white rounded-md shadow-sm border border-slate-200 overflow-hidden flex flex-col transition-all">
                      <div className="p-5 flex flex-col md:flex-row justify-between items-start md:items-center bg-white border-l-4 border-l-indigo-500 cursor-pointer hover:bg-slate-50 transition" onClick={() => toggleProjectExpand(eng.name)}>
                         <div className="text-right mb-4 md:mb-0 flex items-center gap-4">
                            <div className={`p-1.5 rounded-full bg-slate-100 text-slate-500 transition-transform ${isExpanded ? 'rotate-180 bg-indigo-100 text-indigo-600' : ''}`}><ChevronDown className="w-5 h-5" /></div>
                            <div>
                               <h3 className="font-bold text-slate-900 text-xl tracking-tight flex items-center gap-2"><HardHat className="w-5 h-5 text-slate-400" /> {eng.name}</h3>
                               <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> סה"כ ימי עבודה: <strong>{eng.baseDays + eng.otherDays}</strong> (מתוכם {eng.baseDays} ישירים)</p>
                            </div>
                         </div>
                         <div className="bg-slate-900 text-white px-5 py-2.5 rounded text-lg font-bold shadow-sm tracking-wide">₪ {Math.round(eng.totalCost).toLocaleString()}</div>
                      </div>
                      
                      {isExpanded && (
                         <div className="p-6 bg-slate-50/50 border-t border-slate-100">
                            <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2"><Building2 className="w-4 h-4 text-indigo-500"/> התפלגות השקעה לפי פרויקטים:</h4>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                               {eng.projects.map((proj: any, pIdx: number) => (
                                  <div key={pIdx} className="bg-white border border-slate-200 rounded-md shadow-sm flex justify-between items-center p-4">
                                     <div className="font-bold text-slate-800 text-base">{proj.name}</div>
                                     <div className="flex flex-col items-end">
                                        <span className="font-black text-blue-700 text-sm">₪ {Math.round(proj.cost).toLocaleString()}</span>
                                        <span className="text-[11px] text-slate-500 font-medium">{proj.days} ימ' עבודה</span>
                                     </div>
                                  </div>
                               ))}
                            </div>
                         </div>
                      )}
                   </div>
                );
             })}
          </div>
        ) : (
          // Projects List (Monthly/Active/Inactive)
          <>
            {costSubTab === 'monthly' && (
              <div className="mb-6 p-4 bg-white border border-slate-200 rounded-md shadow-sm flex items-center gap-3">
                 <label className="text-sm font-bold text-slate-600">בחר חודש נתונים:</label>
                 <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="rounded-md border-slate-300 p-2 text-sm border focus:border-blue-500 outline-none transition" />
              </div>
            )}
            
            <div className="bg-slate-800 text-slate-300 p-5 rounded-md shadow-sm border border-slate-700 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="font-bold text-white flex items-center gap-2 text-base"><Info className="w-4 h-4 text-blue-400" /> מודל תמחור היררכי</h3>
                <div className="text-sm mt-1.5 space-y-0.5">
                  <p>• <strong>בסיס עלות:</strong> {assumptions.vdc_engineer_monthly_cost.toLocaleString()} ₪ / משרה מלאה.</p>
                  <p>• <strong>חישוב עלות:</strong> חודשים היסטוריים מחושבים לפי דיווחים בפועל. החודש הנוכחי יחסי ל-{assumptions.standard_working_days} ימים.</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
               {displayedCostData.map((project, idx) => {
                 const isExpanded = costSubTab === 'monthly' || expandedProjects.includes(project.name);
                 return (
                   <div key={idx} className="bg-white rounded-md shadow-sm border border-slate-200 overflow-hidden flex flex-col transition-all">
                     <div className={`p-5 flex flex-col md:flex-row justify-between items-start md:items-center bg-white border-l-4 border-l-blue-500 ${costSubTab !== 'monthly' ? 'cursor-pointer hover:bg-slate-50 transition' : ''}`} onClick={() => costSubTab !== 'monthly' ? toggleProjectExpand(project.name) : undefined}>
                       <div className="text-right mb-4 md:mb-0 flex items-center gap-4">
                         {costSubTab !== 'monthly' && (<div className={`p-1.5 rounded-full bg-slate-100 text-slate-500 transition-transform ${isExpanded ? 'rotate-180 bg-blue-100 text-blue-600' : ''}`}><ChevronDown className="w-5 h-5" /></div>)}
                         <div>
                           <h3 className="font-bold text-slate-900 text-xl tracking-tight flex items-center gap-2"><Building2 className="w-5 h-5 text-slate-400" /> {project.name}</h3>
                           <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> ימי עבודה ישירים: <strong>{project.baseDays}</strong></p>
                         </div>
                       </div>
                       <div className="bg-slate-900 text-white px-5 py-2.5 rounded text-lg font-bold shadow-sm tracking-wide">₪ {Math.round(project.totalCost).toLocaleString()}</div>
                     </div>

                     {isExpanded && (
                       <div className="p-6 bg-slate-50/50 border-t border-slate-100">
                         <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2 flex items-center gap-2"><Wallet className="w-4 h-4" /> ניתוח עלויות - תצוגת שלבים היררכית</h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                           {project.stages.map((stg: any, sIdx: number) => (
                             <div key={sIdx} className="bg-white border border-slate-200 rounded-md shadow-sm flex flex-col overflow-hidden transition-all hover:shadow-md">
                               <div className={`p-4 border-b ${stg.subStages.length > 0 ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-800'}`}>
                                 <div className="font-bold text-base mb-2">{stg.name}</div>
                                 <div className="flex justify-between items-center text-sm"><span className="opacity-80">{stg.days} ימ׳ עבודה</span><span className="font-black text-lg">₪ {Math.round(stg.cost).toLocaleString()}</span></div>
                               </div>
                               {stg.subStages.length > 0 && (
                                 <div className="p-3 flex flex-col gap-2 bg-slate-50 flex-1">
                                   {stg.subStages.map((sub: any, subIdx: number) => (
                                     <div key={`${sIdx}-${subIdx}`} className="flex justify-between items-center p-2.5 bg-white rounded border border-slate-200 shadow-sm text-sm">
                                       <div className="flex items-center gap-2 flex-1 truncate"><span className="text-slate-400 font-bold">↳</span><span className="text-slate-700 font-medium truncate" title={sub.name}>{sub.name}</span></div>
                                       <div className="flex flex-col items-end w-20 flex-shrink-0"><span className="font-black text-blue-700 text-[13px]">₪ {Math.round(sub.cost).toLocaleString()}</span><span className="text-slate-500 text-[11px]">{sub.days} ימ׳</span></div>
                                     </div>
                                   ))}
                                 </div>
                               )}
                             </div>
                           ))}
                         </div>
                       </div>
                     )}
                   </div>
                 );
               })}
               {displayedCostData.length === 0 && (
                  <div className="col-span-full p-12 text-center text-slate-500 bg-white rounded-md border border-slate-200 flex flex-col items-center gap-3"><Info className="w-8 h-8 text-slate-300" /> אין נתונים להצגה התואמים לסינון הנבחר.</div>
               )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}