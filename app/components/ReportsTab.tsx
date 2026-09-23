'use client';

import React, { useState, useEffect, useRef } from 'react';
// שים לב לשינוי כאן - עלינו שתי רמות למעלה
import { supabase } from '../../supabase'; 
import { AppUser, Project, WorkReport, WorkStage, WorkSubStage } from '../../types';
import { Calendar, HardHat, Building2, Layers, FileText, Clock, Edit2, Trash2, CheckCircle2, Search, Filter, Plus, X } from 'lucide-react';

const safeString = (val: any) => ((val !== null && val !== undefined) ? String(val).trim() : '');

// --- Date Helper Functions ---
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

// --- Props Interface ---
interface ReportsTabProps {
  currentUserRole: 'basic' | 'manager' | 'department_manager' | null;
  engineerName: string;
  orgUsers: AppUser[];
  activeProjectsList: Project[];
  allProjectsList: Project[];
  stagesList: WorkStage[];
  subStagesList: WorkSubStage[];
  showReportForm: boolean;
  setShowReportForm: (val: boolean) => void;
}

export default function ReportsTab({
  currentUserRole, engineerName, orgUsers, activeProjectsList, allProjectsList, stagesList, subStagesList, showReportForm, setShowReportForm
}: ReportsTabProps) {
  
  const today = new Date().toISOString().split('T')[0];
  const currentReportingMonth = getReportMonth(today);
  const fetchRequestId = useRef(0);

  const activeEngineers = orgUsers.map(u => u.full_name);

  // --- States ---
  const [reports, setReports] = useState<WorkReport[]>([]);
  const [filterMonth, setFilterMonth] = useState(currentReportingMonth);
  const [filterEngineer, setFilterEngineer] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [isFiltering, setIsFiltering] = useState(false);
  
  // Table Filters
  const [colFilterEngineers, setColFilterEngineers] = useState<string[] | null>(
    currentUserRole === 'manager' ? orgUsers.filter(u => u.manager_name === engineerName || u.full_name === engineerName).map(u => u.full_name) : null
  );
  const [colFilterProjects, setColFilterProjects] = useState<string[] | null>(null);
  const [showEngMenu, setShowEngMenu] = useState(false);
  const [showProjMenu, setShowProjMenu] = useState(false);

  // Form States
  const [reportDate, setReportDate] = useState(today);
  const [projectName, setProjectName] = useState(''); 
  const [stage, setStage] = useState('');
  const [subStage, setSubStage] = useState('');
  const [notes, setNotes] = useState('');
  const [scope, setScope] = useState('יום מלא');
  const [formLoading, setFormLoading] = useState(false);
  const [formEngineerName, setFormEngineerName] = useState(engineerName);

  // Edit States
  const [editingReport, setEditingReport] = useState<WorkReport | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editEngineerName, setEditEngineerName] = useState('');
  const [editProject, setEditProject] = useState('');
  const [editStage, setEditStage] = useState('');
  const [editSubStage, setEditSubStage] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editScope, setEditScope] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    if (engineerName) setFormEngineerName(engineerName);
  }, [engineerName]);

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

  const fetchReports = async (month: string, eng: string, proj: string) => {
    setIsFiltering(true);
    fetchRequestId.current += 1;
    const currentReqId = fetchRequestId.current;

    let allFetchedReports: WorkReport[] = [];
    let keepFetching = true; let startRow = 0; const step = 1000;

    while (keepFetching) {
      let query = supabase.from('work_reports').select('*');
      if (month) { const { start, end } = getMonthDateRange(month); query = query.gte('report_date', start).lte('report_date', end); }
      if (eng) query = query.ilike('engineer_name', `%${eng}%`);
      if (proj) query = query.ilike('project_name', `%${proj}%`);
      
      query = query.order('report_date', { ascending: false }).order('id', { ascending: false }).range(startRow, startRow + step - 1);
      
      const { data, error } = await query;
      if (error) break;
      if (data && data.length > 0) { 
        allFetchedReports = [...allFetchedReports, ...data]; 
        if (data.length < step) keepFetching = false; else startRow += step; 
      } else { keepFetching = false; }
    }
    
    if (currentReqId === fetchRequestId.current) {
      setReports(allFetchedReports); 
      setIsFiltering(false);
    }
  };

  useEffect(() => {
    fetchReports(currentReportingMonth, currentUserRole === 'basic' ? engineerName : '', '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineerName, currentUserRole, currentReportingMonth]);

  const handleFilterSubmit = (e: React.FormEvent) => { 
    e.preventDefault(); 
    fetchReports(filterMonth, filterEngineer, filterProject); 
  };

  const clearFilters = () => { 
    const defaultEng = currentUserRole === 'basic' ? engineerName : ''; 
    setFilterMonth(currentReportingMonth); 
    setFilterEngineer(defaultEng); 
    setFilterProject(''); 
    fetchReports(currentReportingMonth, defaultEng, ''); 
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); 
    if (!projectName || !stage) return alert('נא למלא פרויקט ושלב הנדסי'); 
    setFormLoading(true); 

    const finalSubStage = subStage || null;
    const { error } = await supabase.from('work_reports').insert([{ 
      report_date: reportDate, engineer_name: formEngineerName, project_name: projectName, stage, sub_stage: finalSubStage, notes, scope 
    }]);
    
    setFormLoading(false);
    if (!error) { 
      setProjectName(''); setStage(''); setSubStage(''); setNotes(''); alert('הדיווח נשמר בהצלחה!'); 
      fetchReports(filterMonth, filterEngineer, filterProject); 
      setShowReportForm(false);
    } else alert('שגיאה בשמירת הדיווח: ' + error.message);
  };

  const openEditModal = (report: WorkReport) => { 
    setEditingReport(report); 
    setEditDate(report.report_date); 
    setEditEngineerName(report.engineer_name); 
    setEditProject(report.project_name); 
    setEditStage(report.stage); 
    setEditSubStage(report.sub_stage || ''); 
    setEditScope(report.scope); 
    setEditNotes(report.notes || ''); 
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); 
    if (!editingReport) return; 
    setEditLoading(true); 
    const { error } = await supabase.from('work_reports').update({ 
      report_date: editDate, engineer_name: editEngineerName, project_name: editProject, stage: editStage, sub_stage: editSubStage || null, scope: editScope, notes: editNotes 
    }).eq('id', editingReport.id);
    setEditLoading(false);
    if (!error) { 
      setEditingReport(null); 
      fetchReports(filterMonth, filterEngineer, filterProject); 
      alert('הדיווח עודכן בהצלחה!'); 
    } else alert('שגיאה בעדכון: ' + error.message);
  };

  const handleDelete = async (id: number) => {
    if(!window.confirm('האם אתה בטוח שברצונך למחוק דיווח זה?')) return;
    const { error } = await supabase.from('work_reports').delete().eq('id', id);
    if (!error) setReports(prev => prev.filter(r => r.id !== id));
    else alert('שגיאה במחיקה: ' + error.message);
  };

  // UI calculations
  const currentSelectedProjectObj = activeProjectsList.find(p => p.project_name === projectName);
  const isGen2Project = currentSelectedProjectObj?.has_sub_stages === true;
  const isOverheadProject = projectName.includes('תקורות חברה');

  let availableStages = stagesList.filter(s => isGen2Project ? s.is_gen2 : s.is_gen1);
  if (isOverheadProject) availableStages = availableStages.filter(s => s.overhead_only); else availableStages = availableStages.filter(s => !s.overhead_only);
  let availableSubStages = isGen2Project ? subStagesList.filter(sub => sub.parent_stage === stage) : [];

  const uniqueEngsInReports = Array.from(new Set(reports.map(r => r.engineer_name))).sort();
  const uniqueProjsInReports = Array.from(new Set(reports.map(r => getProjectDisplayName(null, r.project_name)))).sort();
  
  const displayedReports = [...reports].filter(r => {
    const engPass = colFilterEngineers === null || colFilterEngineers.includes(r.engineer_name);
    const projPass = colFilterProjects === null || colFilterProjects.includes(getProjectDisplayName(null, r.project_name));
    return engPass && projPass;
  });
  
  const totalDaysCurrentView = displayedReports.reduce((sum, r) => sum + (r.scope === 'חצי יום' ? 0.5 : 1), 0);

  return (
    <div className="animate-in fade-in duration-300">
      {/* טופס דיווח */}
      {showReportForm && (
        <form onSubmit={handleReportSubmit} className="bg-white p-6 rounded-md shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-5 transition-all text-slate-800 mb-6">
          <div className="md:col-span-3 border-b border-slate-100 pb-3 mb-1 flex justify-between">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Plus className="w-5 h-5 text-blue-600" /> דיווח שעות עבודה</h2>
            <button type="button" onClick={() => setShowReportForm(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
          </div>
          <div><label className="block text-xs font-bold text-slate-500 mb-1.5">תאריך ביצוע</label><input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="w-full rounded-md border-slate-300 p-2.5 text-sm border" /></div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">מבצע הפעולה</label>
            {(currentUserRole === 'manager' || currentUserRole === 'department_manager') ? (
              <select required value={formEngineerName} onChange={e => setFormEngineerName(e.target.value)} className="w-full rounded-md border-slate-300 p-2.5 text-sm border bg-white">
                {activeEngineers.map((eng) => (<option key={eng} value={eng}>{eng}</option>))}
              </select>
            ) : (<input type="text" disabled value={formEngineerName} className="w-full bg-slate-50 rounded-md border-slate-200 p-2.5 text-sm border text-slate-400 cursor-not-allowed" />)}
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">שיוך פרויקט</label>
            <select required value={projectName} onChange={e => { setProjectName(e.target.value); setStage(''); setSubStage(''); }} className="w-full rounded-md border-slate-300 p-2.5 text-sm border bg-white">
              <option value="" disabled>בחר מפרויקטים פעילים...</option>
              {activeProjectsList.map(p => (<option key={p.id} value={p.project_name}>{getProjectDisplayName(p, p.project_name)}</option>))}
            </select>
          </div>
          <div className={`${!projectName ? 'opacity-50 pointer-events-none' : ''}`}>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">שלב הנדסי</label>
            <select required value={stage} onChange={e => { setStage(e.target.value); setSubStage(''); }} className="w-full rounded-md border-slate-300 p-2.5 text-sm border bg-white">
              <option value="" disabled>בחר שלב...</option>
              {availableStages.map(s => (<option key={s.id} value={s.stage_name}>{s.stage_name}</option>))}
            </select>
          </div>
          {availableSubStages.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-blue-600 mb-1.5">תת-שלב מפורט</label>
              <select required value={subStage} onChange={e => setSubStage(e.target.value)} className="w-full rounded-md border-blue-300 p-2.5 text-sm border bg-blue-50/30 text-blue-900">
                <option value="" disabled>בחר תת-שלב...</option>
                {availableSubStages.map(s => (<option key={s.id} value={s.sub_stage_name}>{s.sub_stage_name}</option>))}
              </select>
            </div>
          )}
          <div className={availableSubStages.length === 0 ? "md:col-span-1" : "md:col-span-3"}><label className="block text-xs font-bold text-slate-500 mb-1.5">היקף מדווח</label><select value={scope} onChange={e => setScope(e.target.value)} className="w-full rounded-md border-slate-300 p-2.5 text-sm border bg-white"><option value="יום מלא">יום מלא</option><option value="חצי יום">חצי יום</option></select></div>
          <div className="md:col-span-3"><label className="block text-xs font-bold text-slate-500 mb-1.5">הערות / פירוט</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full rounded-md border-slate-300 p-2.5 text-sm border" /></div>
          <div className="md:col-span-3 flex justify-end pt-2"><button type="submit" disabled={formLoading} className="px-6 py-2.5 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> שמור</button></div>
        </form>
      )}

      {/* פילטרים */}
      <form onSubmit={handleFilterSubmit} className="bg-white p-4 rounded-md shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-end text-slate-800 mb-6">
        <div className="flex-1 w-full"><label className="block text-xs font-bold text-slate-500 mb-1">חודש חתך</label><input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="w-full rounded-md border-slate-300 p-2 text-sm border" /></div>
        <div className="flex-1 w-full">
          <label className="block text-xs font-bold text-slate-500 mb-1">מהנדס</label>
          <input type="text" list="eng-list" value={filterEngineer} onChange={e => setFilterEngineer(e.target.value)} disabled={currentUserRole === 'basic'} className="w-full rounded-md border-slate-300 p-2 text-sm border" />
          <datalist id="eng-list">{activeEngineers.map(e => <option key={e} value={e} />)}</datalist>
        </div>
        <div className="flex-1 w-full">
          <label className="block text-xs font-bold text-slate-500 mb-1">פרויקט</label>
          <input type="text" list="proj-list" value={filterProject} onChange={e => setFilterProject(e.target.value)} className="w-full rounded-md border-slate-300 p-2 text-sm border bg-white" />
          <datalist id="proj-list">{allProjectsList.map(p => <option key={p.id} value={getProjectDisplayName(p, p.project_name)} />)}</datalist>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button type="submit" disabled={isFiltering} className="flex items-center gap-2 px-5 py-2 bg-slate-800 text-white rounded-md text-sm"><Search className="w-4 h-4" /> סנן</button>
          <button type="button" onClick={clearFilters} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-300 text-slate-600 rounded-md text-sm"><X className="w-4 h-4" /> נקה</button>
        </div>
      </form>

      {/* אזור טבלה */}
      <div className="text-slate-800">
        {displayedReports.length > 0 && (
          <div className="bg-slate-800 border border-slate-700 text-white p-5 rounded-md flex justify-between items-center shadow-md mb-4">
            <div className="flex items-center gap-3">
              <div className="bg-slate-700 p-2 rounded"><CheckCircle2 className="w-6 h-6 text-emerald-400" /></div>
              <div><span className="block font-bold text-lg">סיכום ימים בתצוגה</span></div>
            </div>
            <div className="text-left border-l border-slate-600 pl-5"><span className="block text-3xl font-black">{totalDaysCurrentView}</span></div>
          </div>
        )}
        
        <div className="bg-white rounded-md shadow-sm border border-slate-200 overflow-x-auto min-h-[400px]">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-bold">
                <th className="p-4 flex items-center gap-1.5"><Calendar className="w-4 h-4" /> תאריך</th>
                
                {/* Engineer Filter Column */}
                <th className="p-4 relative">
                  <div className="flex items-center gap-1.5 cursor-pointer hover:text-blue-600" onClick={() => setShowEngMenu(!showEngMenu)}>
                    <HardHat className="w-4 h-4" /> מהנדס <Filter className={`w-3.5 h-3.5 ${colFilterEngineers !== null ? 'text-blue-600' : ''}`} />
                  </div>
                  {showEngMenu && (
                    <div className="absolute top-12 right-4 w-56 bg-white border border-slate-200 shadow-xl rounded-md z-50 p-3 max-h-72 overflow-y-auto">
                      {uniqueEngsInReports.map(eng => (
                        <label key={eng} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 cursor-pointer">
                          <input type="checkbox" checked={colFilterEngineers === null || colFilterEngineers.includes(eng)} onChange={() => {
                            let next = colFilterEngineers ? [...colFilterEngineers] : [...uniqueEngsInReports];
                            if (next.includes(eng)) next = next.filter(x => x !== eng); else next.push(eng);
                            setColFilterEngineers(next.length === uniqueEngsInReports.length ? null : next);
                          }}/>
                          <span className="text-sm">{eng}</span>
                        </label>
                      ))}
                      <button onClick={() => setShowEngMenu(false)} className="mt-2 w-full text-center text-xs font-bold text-blue-600">סגור</button>
                    </div>
                  )}
                </th>
                
                <th className="p-4">פרויקט</th>
                <th className="p-4">שלב פעילות</th>
                <th className="p-4">הערות</th>
                <th className="p-4">משרה</th>
                {(currentUserRole === 'manager' || currentUserRole === 'department_manager') && <th className="p-4 text-center">פעולות</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {displayedReports.map(r => (
                <tr key={r.id} className="hover:bg-blue-50/30">
                  <td className="p-4 text-slate-500">{formatDate(r.report_date)}</td>
                  <td className="p-4 font-bold">{r.engineer_name}</td>
                  <td className="p-4">{getProjectDisplayName(null, r.project_name)}</td>
                  <td className="p-4"><span className="bg-slate-100 px-2.5 py-1 rounded border">{r.stage}</span> {r.sub_stage && <span className="text-slate-500 text-xs mr-2">↳ {r.sub_stage}</span>}</td>
                  <td className="p-4 text-slate-600 max-w-[200px] truncate">{r.notes || '-'}</td>
                  <td className="p-4"><span className="bg-emerald-50 text-emerald-700 text-xs px-2.5 py-1 rounded">{r.scope}</span></td>
                  {(currentUserRole === 'manager' || currentUserRole === 'department_manager') && (
                    <td className="p-4 flex gap-2 justify-center">
                      <button onClick={() => openEditModal(r)} className="px-3 py-1.5 bg-white border rounded hover:text-blue-600"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(r.id)} className="px-3 py-1.5 bg-white border rounded hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* מודל עריכה מרחף */}
      {editingReport && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md shadow-2xl w-full max-w-lg overflow-hidden border">
            <div className="bg-slate-800 p-4 text-white font-bold flex justify-between">עריכת דיווח <button onClick={() => setEditingReport(null)}><X className="w-5 h-5"/></button></div>
            <form onSubmit={handleUpdateSubmit} className="p-6 space-y-4 text-slate-800">
              <div><label className="block text-xs font-bold text-slate-500 mb-1">תאריך</label><input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="w-full rounded border p-2" /></div>
              <div><label className="block text-xs font-bold text-slate-500 mb-1">שלב</label><select value={editStage} onChange={e => setEditStage(e.target.value)} className="w-full rounded border p-2">{stagesList.map(s => <option key={s.id} value={s.stage_name}>{s.stage_name}</option>)}</select></div>
              <div><label className="block text-xs font-bold text-slate-500 mb-1">היקף</label><select value={editScope} onChange={e => setEditScope(e.target.value)} className="w-full rounded border p-2"><option value="יום מלא">יום מלא</option><option value="חצי יום">חצי יום</option></select></div>
              <div><label className="block text-xs font-bold text-slate-500 mb-1">הערות</label><textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} className="w-full rounded border p-2" /></div>
              <div className="flex justify-end gap-3 pt-4"><button type="button" onClick={() => setEditingReport(null)} className="px-4 py-2 border rounded">ביטול</button><button type="submit" disabled={editLoading} className="px-4 py-2 bg-blue-600 text-white rounded">עדכן</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}