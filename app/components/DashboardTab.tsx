'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabase';
import { Printer, HardHat, Search, ChevronDown, Layers, Info, Calendar, X, CheckCircle2 } from 'lucide-react';
import { AppUser, Project, WorkReport } from '../../types';

interface DashboardTabProps {
  currentUserRole: 'basic' | 'manager' | 'department_manager' | null;
  engineerName: string;
  orgUsers: AppUser[];
  allProjectsList: Project[];
}

const safeString = (val: any) => ((val !== null && val !== undefined) ? String(val).trim() : '');
const trimStr = (str: string | null | undefined) => (str || '').trim();

// --- Date Helpers ---
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

const getMonthDateRange = (monthStr: string) => {
  const [yStr, mStr] = monthStr.split('-');
  const y = parseInt(yStr); const m = parseInt(mStr);
  if (monthStr < "2026-07") {
      const lastDay = new Date(y, m, 0).getDate();
      return { start: `${monthStr}-01`, end: `${monthStr}-${lastDay}` };
  }
  if (monthStr === "2026-07") return { start: "2026-07-01", end: "2026-07-23" };
  let prevM = m - 1; let prevY = y;
  if (prevM === 0) { prevM = 12; prevY--; }
  return { start: `${prevY}-${prevM.toString().padStart(2, '0')}-24`, end: `${monthStr}-23` };
};

const formatDate = (dateStr: string) => { 
  if (!dateStr) return ''; 
  const parts = dateStr.split('-'); 
  if (parts.length !== 3) return dateStr; 
  return `${parseInt(parts[2])}.${parseInt(parts[1])}.${parts[0]}`; 
};

export default function DashboardTab({ currentUserRole, engineerName, orgUsers, allProjectsList }: DashboardTabProps) {
  const today = new Date().toISOString().split('T')[0];
  const currentReportingMonth = getReportMonth(today);

  const [filterMonth, setFilterMonth] = useState(currentReportingMonth);
  const [reports, setReports] = useState<WorkReport[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [expandedDashProjects, setExpandedDashProjects] = useState<string[]>([]);
  const [openMissingEng, setOpenMissingEng] = useState<string | null>(null);

  const activeEngineers = orgUsers.map(u => u.full_name);

  const getProjectDisplayName = (projectObj: any, rawName: string) => {
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

  useEffect(() => {
    const fetchDashboardReports = async () => {
      setLoading(true);
      const { start, end } = getMonthDateRange(filterMonth);
      let keepFetching = true; let startRow = 0; const step = 1000;
      let allFetched: WorkReport[] = [];

      while (keepFetching) {
        const { data, error } = await supabase.from('work_reports')
          .select('*')
          .gte('report_date', start)
          .lte('report_date', end)
          .range(startRow, startRow + step - 1);
        
        if (error) break;
        if (data && data.length > 0) {
          allFetched = [...allFetched, ...data];
          if (data.length < step) keepFetching = false; else startRow += step;
        } else { keepFetching = false; }
      }
      setReports(allFetched);
      setLoading(false);
    };
    fetchDashboardReports();
  }, [filterMonth]);

  const getMissingDates = (engReports: WorkReport[], filterMonthStr: string) => {
    if (!filterMonthStr) return []; 
    const range = getMonthDateRange(filterMonthStr);
    const parseLocal = (ds: string) => { const [y, m, d] = ds.split('-'); return new Date(Number(y), Number(m) - 1, Number(d)); };
    const start = parseLocal(range.start);
    const end = parseLocal(range.end);
    const todayDate = parseLocal(today);
    
    let checkEnd = end;
    if (end >= todayDate) {
        const yesterday = new Date(todayDate);
        yesterday.setDate(yesterday.getDate() - 1); 
        checkEnd = yesterday;
    }
    
    if (start > checkEnd) return [];
    
    const scopePerDate: Record<string, number> = {};
    engReports.forEach(r => {
        if (!scopePerDate[r.report_date]) scopePerDate[r.report_date] = 0;
        scopePerDate[r.report_date] += (r.scope === 'חצי יום' ? 0.5 : 1);
    });
    
    const missingDates = [];
    const d = new Date(start);
    while (d <= checkEnd) {
        const dayOfWeek = d.getDay();
        if (dayOfWeek >= 0 && dayOfWeek <= 4) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const dString = `${y}-${m}-${day}`;
            const scope = scopePerDate[dString] || 0;
            if (scope < 1) missingDates.push({ date: dString, missing: 1 - scope });
        }
        d.setDate(d.getDate() + 1);
    }
    return missingDates.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const dashboardData = useMemo(() => {
    const data: Record<string, any> = {};
    const colors = ['bg-sky-600', 'bg-indigo-600', 'bg-slate-700', 'bg-emerald-600', 'bg-amber-500', 'bg-teal-500', 'bg-rose-500'];
    const relevantEngineers = currentUserRole === 'manager' ? [engineerName, ...orgUsers.filter(u => trimStr(u.manager_name) === trimStr(engineerName)).map(u => u.full_name)] : activeEngineers;

    relevantEngineers.forEach(eng => { data[eng] = { total: 0, projects: {}, reports: [] }; });
    
    reports.forEach(report => {
      const engName = safeString(report.engineer_name) || 'לא ידוע';
      if (!relevantEngineers.includes(engName)) return; 
      const projName = getProjectDisplayName(null, report.project_name);
      if (!projName) return; 
      const stageName = safeString(report.stage) || 'כללי';
      const subStageName = safeString(report.sub_stage) || '';
      const days = report.scope === 'חצי יום' ? 0.5 : 1;
      
      data[engName].total += days;
      data[engName].reports.push(report);
      
      if (!data[engName].projects[projName]) data[engName].projects[projName] = { totalDays: 0, stages: {} };
      data[engName].projects[projName].totalDays += days;
      
      if (!data[engName].projects[projName].stages[stageName]) data[engName].projects[projName].stages[stageName] = { days: 0, subStages: {} };
      data[engName].projects[projName].stages[stageName].days += days;

      if (subStageName) {
          if (!data[engName].projects[projName].stages[stageName].subStages[subStageName]) data[engName].projects[projName].stages[stageName].subStages[subStageName] = 0;
          data[engName].projects[projName].stages[stageName].subStages[subStageName] += days;
      }
    });

    return relevantEngineers.map(engName => {
      const engData = data[engName];
      const projKeys = Object.keys(engData.projects);
      
      const projects = projKeys.map((pName, index) => {
        const pData = engData.projects[pName];
        const dbProject = allProjectsList.find(p => getProjectDisplayName(p, p.project_name) === pName);
        const stagesArray = Object.keys(pData.stages).map(sName => {
           const sData = pData.stages[sName];
           const subArray = Object.keys(sData.subStages).map(subName => ({ name: subName, days: sData.subStages[subName] })).sort((a,b) => b.days - a.days);
           return { name: sName, days: sData.days, subStages: subArray };
        }).sort((a,b) => b.days - a.days);

        return { 
          name: pName, days: pData.totalDays, percentage: engData.total > 0 ? Math.round((pData.totalDays / engData.total) * 100) : 0, color: colors[index % colors.length],
          stages: stagesArray, stats: { has_sub_stages: dbProject?.has_sub_stages, buildings_count: dbProject?.buildings_count, apartments_count: dbProject?.apartments_count, typologies_count: dbProject?.typologies_count, parent_typologies_count: dbProject?.parent_typologies_count, sub_typologies_count: dbProject?.sub_typologies_count }
        };
      }).sort((a, b) => b.days - a.days);
      
      const userRecord = orgUsers.find(u => u.full_name === engName);
      const isManagerLevel = userRecord && (userRecord.role === 'manager' || userRecord.role === 'department_manager');
      const missingDates = isManagerLevel ? [] : getMissingDates(engData.reports, filterMonth);

      return { engineer_name: engName, total_days: engData.total, projects, missingDates, isManagerLevel };
    }).filter(eng => !(eng.isManagerLevel && eng.total_days === 0)).sort((a, b) => a.engineer_name.localeCompare(b.engineer_name));
  }, [reports, orgUsers, allProjectsList, filterMonth]);

  const toggleDashExpand = (id: string) => { setExpandedDashProjects(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); };
  
  let displayDateRange = ""; 
  if (filterMonth) { const r = getMonthDateRange(filterMonth); displayDateRange = `(${formatDate(r.start)} - ${formatDate(r.end)})`; }

  if (loading) return <div className="text-center p-12 text-slate-500 font-medium">טוען נתוני דאשבורד...</div>;

  return (
    <div className="animate-in fade-in duration-300">
      
      {/* אזור הדו"ח להדפסה בלבד */}
      <div className="hidden print:block text-black bg-white font-sans w-full" dir="rtl">
        <style>{`
          @media print { 
            @page { size: A4 portrait; margin: 8mm; } 
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 10px !important; } 
            .page-break-after { page-break-after: always; break-after: page; }
          }
        `}</style>
        <div className="text-center mb-6 border-b border-slate-800 pb-3">
          <h1 className="text-2xl font-black mb-1 text-slate-900">סיכום העמסות חודשי</h1>
          <h2 className="text-sm font-medium text-slate-600">תקופת דיווח: {filterMonth} <span> {displayDateRange}</span></h2>
        </div>
        <div className="flex justify-between border-b-2 border-black pb-1 mb-3 text-xs font-bold px-2"><span className="w-16">אחוז משרה</span><span className="flex-1 text-right">פרויקט</span></div>
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 text-right" style={{ columnRule: '1px solid #e2e8f0' }}>
          {dashboardData.map((engineer, idx) => (
             <div key={idx} className="break-inside-avoid mb-6 page-break-inside-avoid shadow-sm border border-slate-200 rounded overflow-hidden">
                <div className="bg-slate-100 font-bold text-[11px] p-2 border-b border-slate-300 text-slate-800 flex justify-between"><span>{engineer.engineer_name}</span><span>סה"כ ימים: {engineer.total_days}</span></div>
                <div className="w-full text-right text-[11px] bg-white">
                   {engineer.projects.map((proj: any, pIdx: number) => (
                     <div key={pIdx} className="flex border-b border-slate-100 last:border-0 p-2">
                        <div className="font-bold w-10 text-slate-700">{proj.percentage}%</div>
                        <div className="flex-1 flex flex-col gap-0.5">
                           <span className="font-bold text-slate-900 leading-tight">{proj.name}</span>
                           {(() => {
                              const s = proj.stats || {};
                              const bldVal = s.buildings_count; const aptVal = s.apartments_count; const typVal = s.typologies_count; const pTypVal = s.parent_typologies_count; const sTypVal = s.sub_typologies_count;
                              const hasBld = bldVal !== null && String(bldVal).trim() !== ''; const hasApt = aptVal !== null && String(aptVal).trim() !== ''; const hasTyp = typVal !== null && String(typVal).trim() !== ''; const hasPTyp = pTypVal !== null && String(pTypVal).trim() !== ''; const hasSTyp = sTypVal !== null && String(sTypVal).trim() !== '';
                              if (!(hasBld || hasApt || hasTyp || hasPTyp || hasSTyp)) return null;
                              return (
                                <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-slate-500 font-medium mt-0.5">
                                    {hasBld && <span>בניינים: {bldVal}</span>}{hasApt && <span>דירות: {aptVal}</span>}
                                    {s.has_sub_stages ? ( <>{hasPTyp && <span>טיפוסי אב: {pTypVal}</span>}{hasSTyp && <span>תתי-טיפוס: {sTypVal}</span>}</> ) : ( hasTyp && <span>טיפוסים: {typVal}</span> )}
                                </div>
                              );
                           })()}
                        </div>
                     </div>
                   ))}
                </div>
             </div>
          ))}
        </div>
        <div className="mt-8 text-center text-[9px] text-slate-400 font-mono pt-4 border-t border-slate-200">הופק באמצעות VDC Control Center • תאריך הפקה: {new Date().toLocaleString('he-IL')}</div>
      </div>

      {/* אזור תצוגת מסך */}
      <div className="print:hidden">
        <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-md shadow-sm border border-slate-200 mb-6">
          <div className="flex items-center gap-3">
            <label className="text-sm font-bold text-slate-600">בחר חודש נתונים:</label>
            <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="rounded-md border-slate-300 p-2 text-sm border focus:border-blue-500 outline-none transition" />
            <span className="text-xs text-slate-400 font-mono">{displayDateRange}</span>
          </div>
          {currentUserRole === 'department_manager' && (
            <button onClick={() => window.print()} className="mt-4 md:mt-0 flex items-center gap-2 bg-slate-800 text-white px-5 py-2 rounded-md font-bold hover:bg-slate-700 transition shadow-md text-sm"><Printer className="w-4 h-4" /> הפק דו"ח PDF</button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 text-slate-800">
          {dashboardData.map((engineer, idx) => (
            <div key={idx} className="bg-white rounded-md shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="p-5 border-b border-slate-100 flex justify-between items-start md:items-center bg-slate-50/50 relative">
                <div className="flex flex-col gap-2">
                   <h3 className="font-bold text-slate-800 flex items-center gap-2"><HardHat className="w-4 h-4 text-slate-400" /> {engineer.engineer_name}</h3>
                   <div className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded text-xs font-bold border border-emerald-200 w-fit">{engineer.total_days} ימי עבודה</div>
                </div>
                {engineer.missingDates && engineer.missingDates.length > 0 && (
                  <div className="mt-1 md:mt-0">
                    <button onClick={() => setOpenMissingEng(engineer.engineer_name)} className="flex items-center gap-1.5 bg-rose-50 text-rose-600 px-3 py-1.5 rounded-md text-xs font-bold border border-rose-200 hover:bg-rose-100 transition shadow-sm"><Search className="w-3.5 h-3.5" /> חסרים {engineer.missingDates.length} דיווחים</button>
                  </div>
                )}
              </div>
              <div className="p-5 pb-2">
                <div className="w-full h-2.5 bg-slate-100 rounded-full flex overflow-hidden">
                  {engineer.projects.map((proj: any, pIdx: number) => (<div key={pIdx} style={{ width: `${proj.percentage}%` }} className={`h-full ${proj.color} transition-all duration-500`} title={`${proj.name}: ${proj.percentage}%`}></div>))}
                </div>
              </div>
              <div className="p-5 pt-3 flex-1">
                <table className="w-full text-right text-sm">
                  <thead><tr className="text-slate-400 font-medium border-b border-slate-100"><th className="pb-2 text-left w-12 text-xs">נתח</th><th className="pb-2 text-center text-xs">ימים</th><th className="pb-2 text-right text-xs">פרויקט (לחץ לפירוט)</th></tr></thead>
                  <tbody className="divide-y divide-slate-50 text-slate-700">
                    {engineer.projects.map((proj: any, pIdx: number) => {
                      const projectKey = `${engineer.engineer_name}-${proj.name}`;
                      const isExpanded = expandedDashProjects.includes(projectKey);
                      return (
                        <React.Fragment key={pIdx}>
                          <tr className="hover:bg-slate-50 transition-colors cursor-pointer group" onClick={() => toggleDashExpand(projectKey)}>
                            <td className="py-3 font-bold text-left text-slate-900">{proj.percentage}%</td>
                            <td className="py-3 text-center text-slate-500 font-medium">{proj.days}</td>
                            <td className="py-3 text-right flex items-center justify-end gap-2 truncate max-w-[160px]" title={proj.name}><span className="truncate group-hover:text-blue-600 transition-colors">{proj.name}</span><span className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${proj.color}`}></span><ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180 text-blue-500' : ''}`} /></td>
                          </tr>
                          {isExpanded && proj.stages.map((stg: any, sIdx: number) => (
                            <React.Fragment key={`stg-${sIdx}`}>
                              <tr className="bg-slate-50/80 border-t border-slate-100"><td className="py-2"></td><td className="py-2 text-center text-slate-500 text-xs font-semibold">{stg.days} ימ׳</td><td className="py-2 text-right pr-4 text-xs text-slate-600 font-semibold flex justify-end gap-1.5 items-center">{stg.name} <Layers className="w-3.5 h-3.5 text-slate-400" /></td></tr>
                              {stg.subStages.map((sub: any, subIdx: number) => (
                                <tr key={`sub-${subIdx}`} className="bg-slate-100/50"><td className="py-1.5"></td><td className="py-1.5 text-center text-slate-400 text-[11px] font-medium">{sub.days} ימ׳</td><td className="py-1.5 text-right pr-8 text-[11px] text-slate-500 font-medium">↳ {sub.name}</td></tr>
                              ))}
                            </React.Fragment>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {dashboardData.length === 0 && <div className="col-span-full p-12 text-center text-slate-500 bg-white rounded-md border border-slate-200 flex flex-col items-center gap-3"><Info className="w-8 h-8 text-slate-300" /> לא נמצאו נתונים להצגה בחודש זה.</div>}
        </div>
      </div>

      {/* Modal - חסרים דיווחים */}
      {openMissingEng && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 text-slate-800 animate-in zoom-in-95 duration-200">
            <div className="bg-slate-800 p-4 border-b border-slate-700 flex justify-between items-center"><h2 className="text-lg font-bold text-white flex items-center gap-2"><Calendar className="w-4 h-4 text-rose-400" /> דיווחים חסרים - {openMissingEng}</h2><button onClick={() => setOpenMissingEng(null)} className="text-slate-400 hover:text-white transition"><X className="w-5 h-5" /></button></div>
            <div className="p-5 max-h-[60vh] overflow-y-auto">
              {(() => {
                const engData = dashboardData.find(e => e.engineer_name === openMissingEng);
                if (!engData || !engData.missingDates || engData.missingDates.length === 0) return <div className="text-center p-4 text-slate-500">לא נמצאו חוסרים.</div>;
                return (
                  <div className="flex flex-col gap-2.5 text-sm text-slate-700">
                    <div className="font-bold text-slate-500 mb-2 border-b border-slate-100 pb-2">פירוט ימי עבודה (א׳-ה׳) ללא דיווח מלא:</div>
                    {engData.missingDates.map((md: any, i: number) => (
                      <div key={i} className="flex justify-between items-center p-3 bg-slate-50 hover:bg-slate-100 rounded-md border border-slate-100 transition-colors">
                         <span className="font-mono font-medium text-slate-600 text-sm">{formatDate(md.date)}</span>
                         <span className={`text-xs px-2.5 py-1 rounded font-bold shadow-sm ${md.missing === 0.5 ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-rose-100 text-rose-700 border border-rose-200'}`}>{md.missing === 0.5 ? 'חסר חצי יום' : 'חסר יום מלא'}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end"><button onClick={() => setOpenMissingEng(null)} className="px-5 py-2.5 bg-slate-200 text-slate-700 rounded-md font-medium hover:bg-slate-300 transition text-sm shadow-sm">סגור חלון</button></div>
          </div>
        </div>
      )}
    </div>
  );
}