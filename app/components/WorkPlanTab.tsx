'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { ClipboardList, Building2, Calendar, Info, Target, AlertTriangle } from 'lucide-react';
import { Project, WorkMeeting } from '../../types';

interface WorkPlanTabProps {
  engineerName: string;
  allProjectsList: Project[];
}

const trimStr = (str: string | null | undefined) => (str || '').trim();
const safeString = (val: any) => ((val !== null && val !== undefined) ? String(val).trim() : '');

const formatDate = (dateStr: string) => { 
  if (!dateStr) return ''; 
  const parts = dateStr.split('-'); 
  if (parts.length !== 3) return dateStr; 
  return `${parseInt(parts[2])}.${parseInt(parts[1])}.${parts[0]}`; 
};

export default function WorkPlanTab({ engineerName, allProjectsList }: WorkPlanTabProps) {
  const [workPlanMeetings, setWorkPlanMeetings] = useState<WorkMeeting[]>([]);
  const [loading, setLoading] = useState(true);

  const getProjectDisplayName = (projectObj: any, rawName: string) => {
    const pName = safeString(projectObj ? projectObj.project_name : rawName);
    if (!pName || pName === 'אחר (פירוט בהערות)') return pName;
    let p = projectObj;
    if (!p) { p = allProjectsList.find(x => safeString(x.project_name) === pName); if (!p) p = allProjectsList.find(x => safeString(x.project_name).includes(pName) || pName.includes(safeString(x.project_name))); }
    if (p) {
      const finalName = safeString(p.project_name);
      const pCode = safeString(p.project_code || p.code || p.project_number);
      if (pCode && pCode !== 'null' && pCode !== '') if (!finalName.includes(pCode)) return `${finalName} (${pCode})`;
      return finalName;
    }
    return pName;
  };

  useEffect(() => {
    const fetchWorkPlan = async () => {
      if (!engineerName) return;
      setLoading(true);
      const { data, error } = await supabase
        .from('work_meetings')
        .select('*')
        .eq('engineer_name', engineerName)
        .order('meeting_date', { ascending: false });

      if (data) {
        const latestMeetings: Record<string, WorkMeeting> = {};
        data.forEach(m => {
          if (!latestMeetings[m.project_name]) {
            latestMeetings[m.project_name] = m;
          }
        });
        setWorkPlanMeetings(Object.values(latestMeetings));
      }
      setLoading(false);
    };

    fetchWorkPlan();
  }, [engineerName]);

  const relevantProjects = Array.from(new Set([
    ...allProjectsList.filter(p => p.assigned_engineer && trimStr(p.assigned_engineer).includes(trimStr(engineerName))).map(p => getProjectDisplayName(p, p.project_name)),
    ...workPlanMeetings.map(m => m.project_name)
  ]));

  if (loading) return <div className="text-center p-12 text-slate-500 font-medium">טוען תוכנית עבודה...</div>;

  return (
    <div className="animate-in fade-in duration-300">
       <div className="mb-6 bg-white p-5 rounded-md shadow-sm border border-slate-200">
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-blue-600" /> תוכנית עבודה שבועית אישית
          </h2>
          <p className="text-sm text-slate-500 mt-1">מבוסס על סיכומי פגישות הסטטוס האחרונות מול מנהל הצוות. מציג פרויקטים שבאחריותך.</p>
       </div>
       
       <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {relevantProjects.map(projName => {
             const meeting = workPlanMeetings.find(m => m.project_name === projName);
             return (
                <div key={projName} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col hover:shadow-md transition">
                   <div className="bg-slate-800 p-4 border-b border-slate-700">
                      <h3 className="text-lg font-bold text-white flex items-center gap-2 truncate" title={projName}>
                         <Building2 className="w-5 h-5 text-blue-400 shrink-0" /> <span className="truncate">{projName}</span>
                      </h3>
                      {meeting ? (
                         <div className="text-xs text-slate-400 mt-1.5 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" /> עריכה אחרונה: {formatDate(meeting.meeting_date)} ע"י {meeting.manager_name}
                         </div>
                      ) : (
                         <div className="text-xs text-amber-400/80 mt-1.5 flex items-center gap-1.5">
                            <Info className="w-3.5 h-3.5" /> טרם תועדה פגישת עבודה במערכת
                         </div>
                      )}
                   </div>
                   <div className="p-5 flex-1 flex flex-col gap-5">
                      {meeting ? (
                         <>
                            <div>
                               <h4 className="text-sm font-bold text-emerald-700 mb-2 flex items-center gap-1.5">
                                  <Target className="w-4 h-4" /> מיקוד לשבוע הקרוב
                               </h4>
                               <div className="bg-emerald-50 text-slate-800 p-3.5 rounded-lg border border-emerald-100 text-sm whitespace-pre-wrap leading-relaxed shadow-sm">
                                  {meeting.weekly_focus || <span className="text-emerald-600/50 italic">לא צוין מיקוד מיוחד.</span>}
                               </div>
                            </div>
                            {meeting.bottlenecks && (
                               <div>
                                  <h4 className="text-sm font-bold text-rose-700 mb-2 flex items-center gap-1.5">
                                     <AlertTriangle className="w-4 h-4" /> חסמים מרכזיים
                                  </h4>
                                  <div className="bg-rose-50 text-rose-900 p-3.5 rounded-lg border border-rose-100 text-sm whitespace-pre-wrap leading-relaxed shadow-sm">
                                     {meeting.bottlenecks}
                                  </div>
                               </div>
                            )}
                         </>
                      ) : (
                         <div className="flex flex-col items-center justify-center h-full py-10 text-slate-400 gap-3">
                            <ClipboardList className="w-12 h-12 opacity-20 mb-2" />
                            <p className="text-sm font-medium">אין נתונים להצגה.</p>
                            <p className="text-xs text-slate-400 text-center px-4">לא נמצאו סיכומי פגישות עבר עם מנהל הצוות עבור פרויקט זה.</p>
                         </div>
                      )}
                   </div>
                </div>
             );
          })}
          {relevantProjects.length === 0 && (
             <div className="col-span-full p-16 text-center text-slate-500 bg-white rounded-xl border border-slate-200 border-dashed flex flex-col items-center gap-4">
                <Target className="w-12 h-12 text-slate-300" />
                <div>
                   <div className="text-lg font-bold text-slate-600">אינך משויך כרגע לאף פרויקט</div>
                   <div className="text-sm mt-1">פנה למנהל המחלקה או מנהל הצוות להגדרת שיוכים במסך הניהול.</div>
                </div>
             </div>
          )}
       </div>
    </div>
  );
}