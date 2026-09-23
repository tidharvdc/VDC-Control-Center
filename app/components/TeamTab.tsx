'use client';

import React, { useState } from 'react';
import { supabase } from '../../supabase';
import { Search, CheckCircle2, PenTool, Ruler, HardHat, Building2, Calendar, FileText, Target, AlertTriangle, ArrowRight, Plus, Edit2, Trash2, X, Clock, Info, ChevronDown } from 'lucide-react';
import { AppUser, Project, WorkMeeting, WorkReport } from '../../types';

const safeString = (val: any) => ((val !== null && val !== undefined) ? String(val).trim() : '');
const trimStr = (str: string | null | undefined) => (str || '').trim();

const formatDate = (dateStr: string) => { 
  if (!dateStr) return ''; 
  const parts = dateStr.split('-'); 
  if (parts.length !== 3) return dateStr; 
  return `${parseInt(parts[2])}.${parseInt(parts[1])}.${parts[0]}`; 
};

// --- OrgCard Component ---
const teamColors = [
    { border: 'border-blue-500/80', title: 'text-blue-400', line: 'bg-blue-500/40', tag: 'bg-blue-900/30 text-blue-400 border-blue-500/50' },
    { border: 'border-amber-500/80', title: 'text-amber-400', line: 'bg-amber-500/40', tag: 'bg-amber-900/30 text-amber-400 border-amber-500/50' },
    { border: 'border-purple-500/80', title: 'text-purple-400', line: 'bg-purple-500/40', tag: 'bg-purple-900/30 text-purple-400 border-purple-500/50' }
];
const defaultDirectColor = { border: 'border-rose-500/80', title: 'text-rose-400', line: 'bg-rose-500/40', tag: 'bg-rose-900/30 text-rose-400 border-rose-500/50' };

const OrgCard = ({ user, projects, colorData, displayRole, onCardClick }: { user: any, projects: string[], colorData: any, displayRole: string, onCardClick: (name: string) => void }) => {
  const borderColor = colorData?.border || defaultDirectColor.border;
  const titleColor = colorData?.title || defaultDirectColor.title;
  return (
    <div 
      onClick={(e) => { e.stopPropagation(); onCardClick(user.full_name); }} 
      className={`relative z-20 pointer-events-auto p-4 rounded-xl border border-slate-700 bg-slate-800/90 shadow-lg flex flex-col items-center text-center w-[230px] transition-all cursor-pointer hover:shadow-2xl hover:border-slate-400 hover:scale-105`}
    >
      <div className={`absolute top-0 left-0 right-0 h-1.5 rounded-t-xl ${borderColor.replace('border-', 'bg-')} opacity-80`}></div>
      <div className="flex items-center gap-2 mt-2 w-full justify-center px-2">
        {displayRole.includes('מנהל') ? <Ruler className={`w-4 h-4 flex-shrink-0 opacity-80 ${titleColor}`} /> : <HardHat className={`w-4 h-4 flex-shrink-0 opacity-80 ${titleColor}`} />}
        <div className={`font-black text-[16px] tracking-tight whitespace-nowrap overflow-hidden text-ellipsis ${titleColor}`}>{user.full_name || 'לא ידוע'}</div>
      </div>
      <div className="text-[11px] font-bold text-slate-300 whitespace-nowrap uppercase tracking-widest mt-1.5 mb-4 bg-slate-900/60 px-3 py-0.5 rounded shadow-inner border border-slate-700/50">{displayRole}</div>
      <div className="flex flex-col gap-2 w-full pointer-events-none">
        {projects.length > 0 ? projects.map((proj, idx) => {
          const match = proj.match(/(.*?)(?:\s*\((.*?)\))?$/);
          const pName = match ? match[1].trim() : proj;
          const pCode = match && match[2] ? `(${match[2]})` : null;
          return (
            <div key={idx} className="bg-slate-900/80 border border-slate-700 text-slate-300 py-2 px-3 rounded shadow-inner w-full flex flex-col items-center justify-center">
              <span className="text-[12px] font-bold text-center leading-snug whitespace-normal break-words w-full">{pName}</span>
              {pCode && <span className="text-[10px] text-slate-500 mt-1 font-mono">{pCode}</span>}
            </div>
          );
        }) : (
          <div className="text-xs text-slate-500 italic py-2">ללא פרויקטים פעילים</div>
        )}
      </div>
    </div>
  );
};

// --- Main Component ---
interface TeamTabProps {
  currentUserRole: 'basic' | 'manager' | 'department_manager' | null;
  actualName: string;
  orgUsers: AppUser[];
  allProjectsList: Project[];
}

export default function TeamTab({ currentUserRole, actualName, orgUsers, allProjectsList }: TeamTabProps) {
  // Drawer States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerEngineer, setDrawerEngineer] = useState<string | null>(null);
  const [drawerProject, setDrawerProject] = useState<string | null>(null);
  const [meetingHistory, setMeetingHistory] = useState<WorkMeeting[]>([]);
  const [expandedMeetings, setExpandedMeetings] = useState<number[]>([]);
  const [recentReportsContext, setRecentReportsContext] = useState<WorkReport[]>([]);
  const [isNewMeetingOpen, setIsNewMeetingOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<WorkMeeting | null>(null);
  
  // Meeting Form States
  const today = new Date().toISOString().split('T')[0];
  const [meetingDate, setMeetingDate] = useState(today);
  const [meetingProgress, setMeetingProgress] = useState('');
  const [meetingBottlenecks, setMeetingBottlenecks] = useState('');
  const [meetingFocus, setMeetingFocus] = useState('');
  const [meetingModelers, setMeetingModelers] = useState('');
  const [meetingLoading, setMeetingLoading] = useState(false);

  // --- Logic ---
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

  const getProjectsForEngineer = (engName: string) => allProjectsList.filter(p => p.assigned_engineer && trimStr(p.assigned_engineer).includes(trimStr(engName))).map(p => getProjectDisplayName(p, p.project_name));
  const pipelineProjects = allProjectsList.filter(p => safeString(p.status) === 'עתידי').map(p => getProjectDisplayName(p, p.project_name));
  
  // מציאת השורש (מנהל המחלקה או מנהל הצוות הנוכחי)
  const rootManager = orgUsers.find(u => trimStr(u.full_name) === trimStr(actualName)) || { full_name: actualName || 'משתמש לא ידוע', role: currentUserRole === 'manager' ? 'מנהל VDC' : 'מנהל מחלקת VDC' };
  const rootManagerName = trimStr(rootManager.full_name);
  const rootProjects = getProjectsForEngineer(rootManagerName);
  
  const reportingToRoot = orgUsers.filter(u => trimStr(u.manager_name) === rootManagerName);
  const teamLeaders = currentUserRole === 'department_manager' ? reportingToRoot.filter(u => orgUsers.some(sub => trimStr(sub.manager_name) === trimStr(u.full_name))) : [];
  const directEngineers = currentUserRole === 'department_manager' ? reportingToRoot.filter(u => !orgUsers.some(sub => trimStr(sub.manager_name) === trimStr(u.full_name))) : reportingToRoot;

  // --- Drawer Actions ---
  const openEngineerDrawer = (engName: string) => {
    setDrawerEngineer(engName); setDrawerProject(null); setMeetingHistory([]); setExpandedMeetings([]); setIsNewMeetingOpen(false); setEditingMeeting(null); setIsDrawerOpen(true);
  };

  const closeEngineerDrawer = () => {
    setIsDrawerOpen(false);
    setTimeout(() => { setDrawerEngineer(null); setDrawerProject(null); setEditingMeeting(null); }, 300);
  };

  const selectProjectForMeeting = async (projName: string) => {
    setDrawerProject(projName); setIsNewMeetingOpen(false); setEditingMeeting(null); setExpandedMeetings([]); 
    const { data: meetings } = await supabase.from('work_meetings').select('*').eq('engineer_name', drawerEngineer).eq('project_name', projName).order('meeting_date', { ascending: false });
    if (meetings) setMeetingHistory(meetings);
    
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateStr = sevenDaysAgo.toISOString().split('T')[0];
    const { data: recentReports } = await supabase.from('work_reports').select('*').eq('engineer_name', drawerEngineer).eq('project_name', projName).gte('report_date', dateStr).order('report_date', { ascending: false });
    if (recentReports) setRecentReportsContext(recentReports);
  };

  const openNewMeetingForm = () => {
    setEditingMeeting(null); setMeetingDate(today);
    if (meetingHistory.length > 0) {
      const lastMeeting = meetingHistory[0];
      setMeetingProgress(lastMeeting.progress_status || ''); setMeetingBottlenecks(lastMeeting.bottlenecks || ''); setMeetingFocus(lastMeeting.weekly_focus || ''); setMeetingModelers(lastMeeting.modelers_tracking || '');
    } else { setMeetingProgress(''); setMeetingBottlenecks(''); setMeetingFocus(''); setMeetingModelers(''); }
    setIsNewMeetingOpen(true);
  };

  const openEditMeetingForm = (meeting: WorkMeeting) => {
    setEditingMeeting(meeting); setMeetingDate(meeting.meeting_date); setMeetingProgress(meeting.progress_status || ''); setMeetingBottlenecks(meeting.bottlenecks || ''); setMeetingFocus(meeting.weekly_focus || ''); setMeetingModelers(meeting.modelers_tracking || ''); setIsNewMeetingOpen(true);
  };

  const handleMeetingSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!drawerEngineer || !drawerProject) return;
    setMeetingLoading(true);

    if (editingMeeting) {
      const { error } = await supabase.from('work_meetings').update({
        meeting_date: meetingDate, progress_status: meetingProgress, bottlenecks: meetingBottlenecks, weekly_focus: meetingFocus, modelers_tracking: meetingModelers
      }).eq('id', editingMeeting.id);
      setMeetingLoading(false);
      if (error) alert('שגיאה בעדכון סיכום הפגישה: ' + error.message);
      else { setIsNewMeetingOpen(false); setEditingMeeting(null); selectProjectForMeeting(drawerProject); }
    } else {
      const { error } = await supabase.from('work_meetings').insert([{
        meeting_date: meetingDate, manager_name: actualName, engineer_name: drawerEngineer, project_name: drawerProject, progress_status: meetingProgress, bottlenecks: meetingBottlenecks, weekly_focus: meetingFocus, modelers_tracking: meetingModelers
      }]);
      setMeetingLoading(false);
      if (error) alert('שגיאה בשמירת סיכום הפגישה: ' + error.message);
      else { setIsNewMeetingOpen(false); selectProjectForMeeting(drawerProject); }
    }
  };

  const handleDeleteMeeting = async (id: number) => {
    if(!window.confirm('האם אתה בטוח שברצונך למחוק סיכום פגישה זה? הפעולה אינה הפיכה.')) return;
    const { error } = await supabase.from('work_meetings').delete().eq('id', id);
    if (!error) setMeetingHistory(prev => prev.filter(m => m.id !== id));
    else alert('שגיאה במחיקת פגישה: ' + error.message);
  };

  const toggleMeetingExpand = (id: number) => {
    setExpandedMeetings(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div className={`flex flex-col xl:flex-row items-start gap-8 mt-2 animate-in fade-in duration-500 w-full ${currentUserRole === 'manager' ? 'justify-center' : ''}`}>
      {/* Pipeline Sidebar */}
      {currentUserRole === 'department_manager' && (
        <div className="w-full xl:w-64 flex-shrink-0 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4 border-b border-slate-700/50 pb-3 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-500" /> פרויקטים בצנרת
          </h3>
          <div className="flex flex-col gap-3">
            {pipelineProjects.length > 0 ? pipelineProjects.map((proj, idx) => (
              <div key={idx} className="bg-slate-800 border border-dashed border-slate-600 text-[11px] font-medium text-slate-400 p-2.5 rounded-lg text-center shadow-sm hover:border-slate-400 transition whitespace-normal break-words leading-snug">
                {proj}
              </div>
            )) : (
              <div className="text-xs font-medium text-slate-600 italic text-center py-4 flex flex-col items-center gap-2">
                <CheckCircle2 className="w-6 h-6 opacity-20" /> אין פרויקטים פנויים
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Org Chart Area */}
      <div 
        className="flex-1 w-full bg-slate-900 p-8 rounded-3xl shadow-2xl border border-slate-800 overflow-x-auto relative scrollbar-thin"
        style={{ backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)`, backgroundSize: '24px 24px' }}
      >
        <div className="min-w-max flex flex-col items-center pb-12">
          
          {/* אזהרה אם המערכת חצי ריקה */}
          {actualName === '' && (
             <div className="mb-8 p-4 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                <span>שם המשתמש טרם נטען מהשרת, אנא המתן או רענן את הדף.</span>
             </div>
          )}

          {/* Root Manager Card */}
          <div 
            onClick={(e) => { e.stopPropagation(); openEngineerDrawer(rootManager.full_name); }}
            className="relative z-20 pointer-events-auto bg-emerald-950/40 border-2 border-emerald-500/50 p-5 rounded-xl shadow-lg flex flex-col items-center justify-center text-center w-[280px] cursor-pointer hover:scale-105 hover:shadow-2xl transition-transform"
          >
            <div className="flex items-center gap-2 mb-1">
              <PenTool className="w-5 h-5 text-emerald-400 opacity-80" />
              <div className="font-black text-xl text-emerald-400 tracking-tight whitespace-nowrap">{rootManager.full_name || 'מנהל ראשי'}</div>
            </div>
            <div className="text-[12px] font-bold text-emerald-300 uppercase tracking-widest mb-4 bg-emerald-900/50 border border-emerald-700/50 px-3 py-1 rounded shadow-inner whitespace-nowrap">
              {rootManager.role || 'מנהל'}
            </div>
            <div className="flex flex-col gap-2 w-full pointer-events-none">
              {rootProjects.length > 0 ? rootProjects.map((proj, idx) => {
                const match = proj.match(/(.*?)(?:\s*\((.*?)\))?$/);
                const pName = match ? match[1].trim() : proj;
                const pCode = match && match[2] ? `(${match[2]})` : null;
                return (
                  <div key={idx} className="bg-emerald-950/80 border border-emerald-800 text-emerald-200 py-2 px-3 rounded shadow-inner w-full flex flex-col items-center">
                    <span className="text-xs font-bold leading-snug whitespace-normal break-words w-full text-center">{pName}</span>
                    {pCode && <span className="text-[10px] text-emerald-500/70 mt-1 font-mono">{pCode}</span>}
                  </div>
                )
              }) : (
                 <div className="text-emerald-500/50 text-xs italic py-2">ללא פרויקטים פעילים משויכים</div>
              )}
            </div>
          </div>
          
          {/* הצגת טקסט מסביר אם למנהל אין צוות */}
          {teamLeaders.length === 0 && directEngineers.length === 0 ? (
             <div className="mt-12 max-w-md mx-auto bg-slate-800/60 border border-slate-700 p-6 rounded-2xl text-center flex flex-col items-center gap-3">
               <Info className="w-10 h-10 text-slate-500 mb-2" />
               <h3 className="text-slate-300 font-bold text-lg">הצוות שלך ריק כרגע</h3>
               <p className="text-slate-400 text-sm leading-relaxed">
                 לא נמצאו מהנדסים במסד הנתונים שמוגדרים תחת ניהולך. <br/> 
                 ניתן לשייך מהנדסים אליך דרך מסך <strong>ניהול נתוני המערכת</strong> (עבור מנהל מחלקה).
               </p>
             </div>
          ) : (
            <>
              <div className="w-1 h-10 bg-slate-700 rounded-none shadow-sm z-0 pointer-events-none"></div>

              <div className="relative w-full mt-0">
                <div className="absolute top-0 left-[15%] right-[15%] h-1 bg-slate-700 rounded-none shadow-sm pointer-events-none"></div>
                
                <div className="flex justify-center items-start pt-8 gap-12 px-8 min-w-max">
                  {teamLeaders.map((leader, tIdx) => {
                    const theme = teamColors[tIdx % teamColors.length];
                    const teamMembers = orgUsers.filter(u => trimStr(u.manager_name) === trimStr(leader.full_name));
                    return (
                      <div key={leader.id} className="flex flex-col items-center relative bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 shadow-md backdrop-blur-sm min-w-max">
                        <div className="absolute -top-10 w-1 h-10 bg-slate-700 rounded-none pointer-events-none"></div>
                        <div className={`absolute -top-4 text-[11px] font-black px-3 py-1 rounded border shadow-sm uppercase tracking-wider whitespace-nowrap ${theme.tag}`}>צוות {leader.full_name.split(' ')[0]}</div>
                        <OrgCard user={leader} projects={getProjectsForEngineer(leader.full_name)} colorData={theme} displayRole="מנהל VDC" onCardClick={openEngineerDrawer} />
                        
                        {teamMembers.length > 0 && (
                          <>
                            <div className={`w-1 h-8 my-3 rounded-none shadow-sm ${theme.line} pointer-events-none`}></div>
                            <div className="relative w-full min-w-max px-4">
                              <div className={`absolute top-0 left-[25%] right-[25%] h-1 rounded-none shadow-sm ${theme.line} pointer-events-none`}></div>
                              <div className="grid grid-cols-2 gap-8 pt-6 w-full">
                                {teamMembers.map(eng => (
                                  <div key={eng.id} className="relative flex flex-col items-center">
                                    <div className={`absolute -top-6 w-1 h-6 rounded-none ${theme.line} pointer-events-none`}></div>
                                    <OrgCard user={eng} projects={getProjectsForEngineer(eng.full_name)} colorData={theme} displayRole="מהנדס/ת VDC" onCardClick={openEngineerDrawer} />
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}

                  {directEngineers.length > 0 && (
                    <div className="flex flex-col items-center relative bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 shadow-md backdrop-blur-sm min-w-max">
                      <div className="absolute -top-10 w-1 h-10 bg-slate-700 rounded-none pointer-events-none"></div>
                      <div className="absolute -top-4 bg-slate-700 text-slate-300 text-[11px] font-black px-3 py-1 rounded border border-slate-600 shadow-sm uppercase tracking-wider whitespace-nowrap">ניהול ישיר</div>
                      <div className="flex flex-col gap-6 mt-2">
                        {directEngineers.map(eng => (
                          <OrgCard key={eng.id} user={eng} projects={getProjectsForEngineer(eng.full_name)} colorData={defaultDirectColor} displayRole="מהנדס/ת VDC" onCardClick={openEngineerDrawer} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* --- Drawer (מגירת המהנדס) --- */}
      {isDrawerOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4 sm:p-6 transition-opacity animate-in fade-in duration-200" onClick={closeEngineerDrawer}>
          <div className="bg-slate-50 w-full max-w-6xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="bg-slate-900 p-5 flex justify-between items-center shadow-md shrink-0">
               <div className="flex items-center gap-3"><div className="bg-blue-500/20 p-2.5 rounded-lg text-blue-400"><HardHat className="w-6 h-6" /></div><div><h2 className="text-white font-black text-xl tracking-tight">תיק מהנדס ופגישות עבודה</h2><div className="text-slate-400 text-sm font-medium mt-0.5">מהנדס: <span className="text-blue-300">{drawerEngineer}</span></div></div></div>
               <button onClick={closeEngineerDrawer} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 p-2.5 rounded-full transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 md:p-8 scrollbar-thin">
              {!drawerProject ? (
                <div className="animate-in fade-in duration-500">
                  <h3 className="font-bold text-slate-700 mb-6 flex items-center gap-2 text-base uppercase tracking-wider"><Building2 className="w-5 h-5 text-blue-500" /> בחר פרויקט לניהול פגישה</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {getProjectsForEngineer(drawerEngineer!).map((proj, idx) => (
                      <button key={idx} onClick={() => selectProjectForMeeting(proj)} className="w-full text-right p-5 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-lg hover:border-blue-400 transition-all flex justify-between items-center group"><span className="font-bold text-slate-800 text-base group-hover:text-blue-700 transition">{proj}</span><ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-transform group-hover:-translate-x-1.5" /></button>
                    ))}
                    {getProjectsForEngineer(drawerEngineer!).length === 0 && (<div className="col-span-full text-slate-400 text-base text-center p-12 bg-white border border-slate-200 rounded-xl border-dashed">לא נמצאו פרויקטים פעילים למשתמש זה.</div>)}
                  </div>
                </div>
              ) : (
                <div className="animate-in fade-in duration-500 h-full flex flex-col">
                  <div className="flex justify-between items-end mb-6 border-b-2 border-slate-200 pb-4">
                    <div><div className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">פרויקט נבחר</div><div className="text-2xl font-black text-slate-800">{drawerProject}</div></div>
                    <button onClick={() => { setDrawerProject(null); setIsNewMeetingOpen(false); setEditingMeeting(null); setExpandedMeetings([]); }} className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-800 transition bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm hover:bg-slate-100"><ArrowRight className="w-4 h-4" /> חזור לפרויקטים</button>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-8 flex flex-col gap-8">
                      {isNewMeetingOpen ? (
                        <div className="bg-white rounded-xl shadow-lg border border-blue-200 overflow-hidden animate-in zoom-in-95 duration-200">
                           <div className="bg-blue-600 text-white p-4 font-bold flex items-center gap-2 text-lg"><PenTool className="w-5 h-5" /> {editingMeeting ? 'עדכון סיכום סטטוס שבועי' : 'עריכת סיכום סטטוס שבועי'}</div>
                           <form onSubmit={handleMeetingSubmit} className="p-6 md:p-8 space-y-6 text-slate-800">
                              <div className="w-1/3"><label className="block text-sm font-bold text-slate-600 mb-1.5">תאריך הפגישה</label><input type="date" required value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-md text-base text-slate-800 font-medium outline-none focus:border-blue-500 bg-white" /></div>
                              <div><label className="block text-sm font-bold text-slate-600 mb-1.5">1. סטטוס התקדמות לפי מלאכות</label><textarea required value={meetingProgress} onChange={(e) => setMeetingProgress(e.target.value)} rows={5} className="w-full p-3 border border-slate-300 rounded-md text-base text-slate-800 font-medium leading-relaxed outline-none focus:border-blue-500 bg-blue-50/30" /></div>
                              <div><label className="block text-sm font-bold text-slate-600 mb-1.5">2. חסמים מרכזיים</label><textarea value={meetingBottlenecks} onChange={(e) => setMeetingBottlenecks(e.target.value)} rows={4} className="w-full p-3 border border-slate-300 rounded-md text-base text-slate-800 font-medium leading-relaxed outline-none focus:border-rose-500 bg-rose-50/30" /></div>
                              <div><label className="block text-sm font-bold text-slate-600 mb-1.5">3. מיקוד לשבוע הקרוב</label><textarea required value={meetingFocus} onChange={(e) => setMeetingFocus(e.target.value)} rows={4} className="w-full p-3 border border-slate-300 rounded-md text-base text-slate-800 font-medium leading-relaxed outline-none focus:border-emerald-500 bg-emerald-50/30" /></div>
                              <div><label className="block text-sm font-bold text-slate-600 mb-1.5">4. מעקב ממדלים (אם יש)</label><textarea value={meetingModelers} onChange={(e) => setMeetingModelers(e.target.value)} rows={3} className="w-full p-3 border border-slate-300 rounded-md text-base text-slate-800 font-medium leading-relaxed outline-none focus:border-indigo-500 bg-white" placeholder="אופציונלי..." /></div>
                              <div className="flex justify-end gap-4 pt-6 border-t border-slate-100"><button type="button" onClick={() => { setIsNewMeetingOpen(false); setEditingMeeting(null); }} className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-md text-sm font-bold hover:bg-slate-200 transition">ביטול</button><button type="submit" disabled={meetingLoading} className="px-8 py-2.5 bg-blue-600 text-white rounded-md text-base font-bold hover:bg-blue-700 transition shadow-md">{editingMeeting ? 'עדכן סיכום פגישה' : 'שמור סיכום פגישה'}</button></div>
                           </form>
                        </div>
                      ) : (
                        <button onClick={openNewMeetingForm} className="w-full py-5 bg-slate-800 text-white rounded-xl font-bold text-lg hover:bg-slate-700 transition shadow-lg flex items-center justify-center gap-3"><Plus className="w-6 h-6" /> התחל פגישת סטטוס חדשה לפרויקט</button>
                      )}

                      <div>
                        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2 text-base uppercase tracking-wider"><FileText className="w-5 h-5 text-amber-500" /> היסטוריית פגישות</h3>
                        {meetingHistory.length > 0 ? (
                          <div className="flex flex-col gap-5">
                             {meetingHistory.map(m => (
                               <div key={m.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                                 <div 
                                   className="bg-slate-100/80 border-b border-slate-200 p-4 flex justify-between items-center cursor-pointer hover:bg-slate-200/60 transition-colors"
                                   onClick={() => toggleMeetingExpand(m.id)}
                                 >
                                   <div className="flex items-center gap-4">
                                      <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${expandedMeetings.includes(m.id) ? 'rotate-180 text-blue-500' : ''}`} />
                                      <div className="font-black text-slate-800 text-lg">{formatDate(m.meeting_date)}</div>
                                      <div className="flex gap-2">
                                        <button onClick={(e) => { e.stopPropagation(); openEditMeetingForm(m); }} className="p-1.5 bg-white border border-slate-200 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition shadow-sm" title="ערוך פגישה"><Edit2 className="w-4 h-4" /></button>
                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteMeeting(m.id); }} className="p-1.5 bg-white border border-slate-200 rounded text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition shadow-sm" title="מחק פגישה"><Trash2 className="w-4 h-4" /></button>
                                      </div>
                                   </div>
                                   <div className="text-sm font-medium text-slate-500 bg-white px-3 py-1 rounded-md border border-slate-200 shadow-sm">מנהל מסכם: {m.manager_name}</div>
                                 </div>
                                 
                                 {expandedMeetings.includes(m.id) && (
                                   <div className="p-6 space-y-5 text-base bg-white animate-in fade-in duration-300">
                                      <div><div className="font-bold text-slate-500 text-sm uppercase tracking-wide mb-1.5">סטטוס התקדמות:</div><div className="text-slate-800 whitespace-pre-wrap leading-relaxed">{m.progress_status}</div></div>
                                      {m.bottlenecks && (<div className="bg-rose-50/70 p-4 rounded-lg border border-rose-100"><div className="font-bold text-rose-700 text-sm uppercase tracking-wide mb-1.5">חסמים מרכזיים:</div><div className="text-rose-900 whitespace-pre-wrap leading-relaxed">{m.bottlenecks}</div></div>)}
                                      <div><div className="font-bold text-slate-500 text-sm uppercase tracking-wide mb-1.5">מיקוד שבועי:</div><div className="text-slate-800 whitespace-pre-wrap font-medium leading-relaxed">{m.weekly_focus}</div></div>
                                      {m.modelers_tracking && (<div className="pt-4 border-t border-slate-100"><div className="font-bold text-indigo-500 text-sm uppercase tracking-wide mb-1.5">מעקב ממדלים:</div><div className="text-slate-700 whitespace-pre-wrap leading-relaxed">{m.modelers_tracking}</div></div>)}
                                   </div>
                                 )}
                               </div>
                             ))}
                          </div>
                        ) : (
                          <div className="text-slate-400 text-base text-center p-10 border-2 border-slate-200 border-dashed rounded-xl bg-white/50">אין היסטוריית פגישות קודמות לפרויקט זה.</div>
                        )}
                      </div>
                    </div>

                    <div className="lg:col-span-4">
                      <div className="bg-slate-100 rounded-xl p-5 border border-slate-200 h-full max-h-[800px] flex flex-col">
                        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2 text-sm uppercase tracking-wider"><Clock className="w-4 h-4 text-emerald-500" /> דו"ח פעילות - 7 ימים אחרונים</h3>
                        <div className="overflow-y-auto pr-2 scrollbar-thin flex-1">
                          {recentReportsContext.length > 0 ? (
                            <div className="flex flex-col gap-3">
                               {recentReportsContext.map(r => (
                                 <div key={r.id} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col gap-2 transition hover:border-emerald-300">
                                   <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                     <span className="font-mono text-slate-500 font-medium text-sm">{formatDate(r.report_date)}</span>
                                     <span className="bg-emerald-50 text-emerald-700 text-xs px-2 py-0.5 rounded font-bold border border-emerald-200/50">{r.scope}</span>
                                   </div>
                                   <div className="font-bold text-slate-800 text-base">{r.stage} {r.sub_stage && <span className="text-slate-400 font-normal">| {r.sub_stage}</span>}</div>
                                   {r.notes && <div className="text-slate-600 text-sm bg-slate-50 p-2.5 rounded mt-1 leading-relaxed border border-slate-100">{r.notes}</div>}
                                 </div>
                               ))}
                            </div>
                          ) : (
                            <div className="text-slate-400 text-sm italic text-center py-10">לא דווחו שעות בפרויקט זה בשבוע האחרון.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}