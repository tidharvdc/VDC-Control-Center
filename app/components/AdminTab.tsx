'use client';

import React, { useState } from 'react';
import { supabase } from '../../supabase';
import { createNewUserByManager } from '../actions/adminUsers'; 
import { Users, Building2, Edit2, Trash2 } from 'lucide-react';
import { AppUser, Project } from '../../types';

interface AdminTabProps {
  currentUserRole: 'basic' | 'manager' | 'department_manager' | null;
  engineerName: string;
  orgUsers: AppUser[];
  allProjectsList: Project[];
  onDataChanged: (action?: { type: string, payload?: any }) => Promise<void>;
}

export default function AdminTab({ currentUserRole, engineerName, orgUsers, allProjectsList, onDataChanged }: AdminTabProps) {
  const [adminTab, setAdminTab] = useState<'users' | 'projects'>('users');
  const [adminProjectFilter, setAdminProjectFilter] = useState<'all' | 'active_future'>('active_future');
  
  const activeEngineers = orgUsers.map(u => u.full_name);

  // Users Form States
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserRole, setNewUserRole] = useState<'basic' | 'manager'>('basic');
  const [adminFormLoading, setAdminFormLoading] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserRole, setEditUserRole] = useState<'basic' | 'manager' | 'department_manager'>('basic');
  const [editUserManager, setEditUserManager] = useState<string>('');

  // Projects Form States
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectCode, setNewProjectCode] = useState('');
  const [newProjectStatus, setNewProjectStatus] = useState<'פעיל' | 'עתידי'>('פעיל');
  const [newProjectAssignedEngineer, setNewProjectAssignedEngineer] = useState('');
  const [newProjectBuildingsCount, setNewProjectBuildingsCount] = useState<number | ''>('');
  const [newProjectAptCount, setNewProjectAptCount] = useState<number | ''>('');
  const [newProjectParentTypologies, setNewProjectParentTypologies] = useState<number | ''>('');
  const [newProjectSubTypologies, setNewProjectSubTypologies] = useState<number | ''>('');
  const [projectFormLoading, setProjectFormLoading] = useState(false);

  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [editProjName, setEditProjName] = useState<string>('');
  const [editProjStatus, setEditProjStatus] = useState<'פעיל' | 'עתידי' | 'ארכיון'>('פעיל');
  const [editProjEngineer, setEditProjEngineer] = useState<string>('');
  const [editProjBuildings, setEditProjBuildings] = useState<number | ''>('');
  const [editProjApts, setEditProjApts] = useState<number | ''>('');
  const [editProjParentTypes, setEditProjParentTypes] = useState<number | ''>('');
  const [editProjSubTypes, setEditProjSubTypes] = useState<number | ''>('');

  // --- Handlers: Users ---
  const handleAdminUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); 
    if (!newUserEmail || !newUserFullName) return alert('נא למלא את כל השדות');
    setAdminFormLoading(true);
    const result = await createNewUserByManager({ email: newUserEmail, fullName: newUserFullName, role: newUserRole });
    setAdminFormLoading(false);
    if (result.success) { 
      alert(`המשתמש הוקם בהצלחה!`); 
      setNewUserEmail(''); setNewUserFullName(''); 
      await onDataChanged({ type: 'ADD_USER' }); 
    } else {
      alert(`שגיאה: ${result.error}`);
    }
  };

  const startEditUser = (u: AppUser) => {
    setEditingUserId(u.id);
    setEditUserRole(u.role as any);
    setEditUserManager(u.manager_name || '');
  };

  const saveEditUser = async (userId: string) => {
    setAdminFormLoading(true);
    const { data, error } = await supabase.from('app_users').update({
      role: editUserRole, manager_name: editUserManager || null
    }).eq('id', userId).select(); 
    
    setAdminFormLoading(false);
    
    if (error) {
       alert('שגיאה בעדכון משתמש: ' + error.message);
    } else if (!data || data.length === 0) {
       alert('העדכון נחסם! אין לך הרשאת כתיבה (RLS) על הטבלה app_users ב-Supabase.');
    } else {
       alert('משתמש עודכן בהצלחה!');
       setEditingUserId(null);
       await onDataChanged({ type: 'UPDATE_USER', payload: data[0] }); 
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!window.confirm(`האם אתה בטוח שברצונך למחוק את המשתמש "${userName}"?\n(שים לב: המחיקה תסיר אותו מהמערכת, אך היסטוריית הדיווחים שלו תשמר).`)) return;
    setAdminFormLoading(true);
    const { error } = await supabase.from('app_users').delete().eq('id', userId);
    setAdminFormLoading(false);
    if (!error) { 
      alert('משתמש נמחק בהצלחה!'); 
      await onDataChanged({ type: 'DELETE_USER', payload: userId }); 
    } else {
      alert('שגיאה במחיקת משתמש: ' + error.message);
    }
  };

  // --- Handlers: Projects ---
  const handleProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName) return alert('נא להזין שם פרויקט');
    setProjectFormLoading(true);

    const { data, error } = await supabase.from('projects').insert([{
      project_name: newProjectName, project_code: newProjectCode, status: newProjectStatus, has_sub_stages: true,
      assigned_engineer: newProjectStatus === 'פעיל' ? newProjectAssignedEngineer : null,
      buildings_count: newProjectBuildingsCount === '' ? null : newProjectBuildingsCount,
      apartments_count: newProjectAptCount === '' ? null : newProjectAptCount,
      parent_typologies_count: newProjectParentTypologies === '' ? null : newProjectParentTypologies,
      sub_typologies_count: newProjectSubTypologies === '' ? null : newProjectSubTypologies
    }]).select();

    setProjectFormLoading(false);
    if (!error && data && data.length > 0) { 
      alert('הפרויקט הוקם בהצלחה!'); 
      setNewProjectName(''); setNewProjectCode(''); setNewProjectAssignedEngineer('');
      await onDataChanged({ type: 'ADD_PROJECT', payload: data[0] }); 
    } else {
      alert('שגיאה בשמירת הפרויקט: ' + (error ? error.message : 'Unknown error'));
    }
  };

  const startEditProject = (p: Project) => {
    setEditingProjectId(p.id);
    setEditProjName(p.project_name);
    setEditProjStatus(p.status as any);
    setEditProjEngineer(p.assigned_engineer || '');
    setEditProjBuildings(p.buildings_count ?? '');
    setEditProjApts(p.apartments_count ?? '');
    setEditProjParentTypes(p.parent_typologies_count ?? '');
    setEditProjSubTypes(p.sub_typologies_count ?? '');
  };

  const saveEditProject = async (p: Project) => {
    setProjectFormLoading(true);
    
    if (editProjName !== p.project_name && editProjName.trim() !== '') {
       await supabase.from('work_reports').update({ project_name: editProjName }).eq('project_name', p.project_name);
       await supabase.from('work_meetings').update({ project_name: editProjName }).eq('project_name', p.project_name);
    }

    const { data, error } = await supabase.from('projects').update({
      project_name: editProjName, status: editProjStatus,
      assigned_engineer: editProjStatus === 'עתידי' ? null : (editProjEngineer || null),
      buildings_count: editProjBuildings === '' ? null : Number(editProjBuildings),
      apartments_count: editProjApts === '' ? null : Number(editProjApts),
      parent_typologies_count: editProjParentTypes === '' ? null : Number(editProjParentTypes),
      sub_typologies_count: editProjSubTypes === '' ? null : Number(editProjSubTypes),
    }).eq('id', p.id).select(); 
    
    setProjectFormLoading(false);
    if (error) { 
       alert('שגיאה בעדכון פרויקט: ' + error.message);
    } else if (!data || data.length === 0) {
       alert('העדכון נחסם! בדוק את חוקי האבטחה (RLS) על טבלת projects ב-Supabase.');
    } else {
       alert('פרויקט עודכן בהצלחה!'); 
       setEditingProjectId(null); 
       await onDataChanged({ type: 'UPDATE_PROJECT', payload: data[0] }); 
    }
  };

  const handleDeleteProject = async (projectId: number, projName: string) => {
    if (!window.confirm(`האם אתה בטוח שברצונך למחוק את הפרויקט "${projName}"?\n(שים לב: היסטוריית הדיווחים המשויכת לפרויקט תשמר).`)) return;
    setProjectFormLoading(true);
    const { error } = await supabase.from('projects').delete().eq('id', projectId);
    setProjectFormLoading(false);
    if (!error) { 
      alert('פרויקט נמחק בהצלחה!'); 
      await onDataChanged({ type: 'DELETE_PROJECT', payload: projectId }); 
    } else {
      alert('שגיאה במחיקת פרויקט: ' + error.message);
    }
  };

  const displayedAdminProjects = allProjectsList.filter(p => {
    if (adminProjectFilter === 'all') return true;
    return p.status === 'פעיל' || p.status === 'עתידי';
  });

  return (
    <div className="bg-white p-6 rounded-md shadow-sm border border-slate-200 text-slate-800 animate-in fade-in duration-300">
      <div className="flex border-b border-slate-200 mb-5 gap-6">
        <button onClick={() => setAdminTab('users')} className={`pb-2 font-bold text-sm border-b-2 transition-all ${adminTab === 'users' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>ניהול משתמשים</button>
        <button onClick={() => setAdminTab('projects')} className={`pb-2 font-bold text-sm border-b-2 transition-all ${adminTab === 'projects' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>ניהול רשימת פרויקטים</button>
      </div>

      {adminTab === 'users' && (
        <div className="animate-in fade-in duration-300">
          <form onSubmit={handleAdminUserSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-5 bg-slate-50 p-5 rounded-lg border border-slate-100 mb-8">
            <div className="md:col-span-3 pb-1 mb-1"><h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Users className="w-5 h-5 text-blue-600" /> הוספת משתמש למערכת</h2></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">שם מלא</label><input type="text" required value={newUserFullName} onChange={(e) => setNewUserFullName(e.target.value)} className="w-full rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 outline-none transition bg-white" /></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">אימייל ארגוני</label><input type="email" required value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} className="w-full text-left rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 outline-none transition bg-white" dir="ltr" /></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">הרשאת מערכת</label><select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as 'basic' | 'manager')} className="w-full rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 outline-none transition bg-white"><option value="basic">מהנדס (בסיסי)</option><option value="manager">מנהל (Manager)</option></select></div>
            <div className="md:col-span-3 flex justify-end pt-2"><button type="submit" disabled={adminFormLoading} className="px-6 py-2.5 bg-slate-800 text-white rounded-md font-medium hover:bg-slate-700 transition shadow-sm text-sm disabled:bg-slate-300">הקמת משתמש חדש</button></div>
          </form>
          <div>
            <h3 className="text-base font-bold text-slate-700 mb-3 border-b pb-2">משתמשים קיימים במערכת</h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 text-xs font-bold"><th className="p-3">שם מלא</th><th className="p-3">הרשאת מערכת</th><th className="p-3">מנהל ישיר (Manager)</th><th className="p-3 text-center">פעולות עריכה</th></tr>
                </thead>
                <tbody className="text-sm divide-y divide-slate-100">
                  {orgUsers.map(u => (
                     <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                       {editingUserId === u.id ? (
                         <>
                           <td className="p-3 font-bold text-blue-800 bg-blue-50/50">{u.full_name}</td>
                           <td className="p-3 bg-blue-50/50">
                             <select value={editUserRole} onChange={e => setEditUserRole(e.target.value as any)} className="border-slate-300 p-2 rounded text-sm w-full outline-none bg-white border"><option value="basic">מהנדס (בסיסי)</option><option value="manager">מנהל (Manager)</option><option value="department_manager">מנהל מחלקה</option></select>
                           </td>
                           <td className="p-3 bg-blue-50/50">
                             <select value={editUserManager} onChange={e => setEditUserManager(e.target.value)} className="border-slate-300 p-2 rounded text-sm w-full outline-none bg-white border"><option value="">ללא מנהל ישיר (עצמאי)</option>{orgUsers.filter(mu => (mu.role === 'manager' || mu.role === 'department_manager') && mu.id !== u.id).map(mu => (<option key={mu.id} value={mu.full_name}>{mu.full_name}</option>))}</select>
                           </td>
                           <td className="p-3 bg-blue-50/50">
                              <div className="flex justify-center gap-2"><button onClick={() => saveEditUser(u.id)} disabled={adminFormLoading} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-bold">שמור</button><button onClick={() => setEditingUserId(null)} className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded text-xs font-bold">ביטול</button></div>
                           </td>
                         </>
                       ) : (
                         <>
                           <td className="p-3 font-bold text-slate-800">{u.full_name}</td>
                           <td className="p-3"><span className={`px-2 py-0.5 rounded text-[11px] font-bold ${u.role === 'department_manager' ? 'bg-purple-100 text-purple-700' : u.role === 'manager' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{u.role === 'department_manager' ? 'מנהל מחלקה' : u.role === 'manager' ? 'מנהל צוות' : 'מהנדס'}</span></td>
                           <td className="p-3 text-slate-600">{u.manager_name || <span className="text-slate-400 italic">עצמאי</span>}</td>
                           <td className="p-3 text-center">
                              <div className="flex justify-center items-center gap-2">
                                <button onClick={() => startEditUser(u)} className="text-blue-600 hover:text-blue-800 text-xs p-1.5 bg-blue-50 hover:bg-blue-100 rounded" title="עריכת משתמש"><Edit2 className="w-4 h-4"/></button>
                                {u.id !== (currentUserRole === 'department_manager' ? orgUsers.find(x => x.full_name === engineerName)?.id : null) && (<button onClick={() => handleDeleteUser(u.id, u.full_name)} className="text-rose-600 hover:text-rose-800 text-xs p-1.5 bg-rose-50 hover:bg-rose-100 rounded" title="מחיקת משתמש"><Trash2 className="w-4 h-4"/></button>)}
                              </div>
                           </td>
                         </>
                       )}
                     </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {adminTab === 'projects' && (
        <div className="animate-in fade-in duration-300">
          <form onSubmit={handleProjectSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-5 bg-slate-50 p-5 rounded-lg border border-slate-100 mb-8">
            <div className="md:col-span-4 pb-1 mb-1"><h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Building2 className="w-5 h-5 text-blue-600" /> הקמת פרויקט חדש למסד הנתונים</h2></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">שם הפרויקט</label><input type="text" required value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} className="w-full rounded-md border-slate-300 p-2.5 text-sm border bg-white" /></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">קוד / מספר פרויקט (אופציונלי)</label><input type="text" value={newProjectCode} onChange={(e) => setNewProjectCode(e.target.value)} className="w-full rounded-md border-slate-300 p-2.5 text-sm border bg-white" /></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">סטטוס פרויקט</label><select value={newProjectStatus} onChange={(e) => setNewProjectStatus(e.target.value as 'פעיל' | 'עתידי')} className="w-full rounded-md border-slate-300 p-2.5 text-sm border bg-white"><option value="פעיל">פעיל</option><option value="עתידי">עתידי (בצנרת)</option></select></div>
            {newProjectStatus === 'פעיל' ? (
               <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">מהנד אחראי (חובה)</label><input type="text" required list="eng-list-new" value={newProjectAssignedEngineer} onChange={(e) => setNewProjectAssignedEngineer(e.target.value)} className="w-full rounded-md border-slate-300 p-2.5 text-sm border bg-white" placeholder="בחר מהנדס..." /><datalist id="eng-list-new">{activeEngineers.map(eng => <option key={eng} value={eng} />)}</datalist></div>
            ) : (
               <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">מהנדס אחראי</label><input type="text" disabled value="ללא (פרויקט בצנרת)" className="w-full rounded-md border-slate-200 p-2.5 text-sm border bg-slate-100 text-slate-400 cursor-not-allowed" /></div>
            )}
            <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">סה"כ בניינים</label><input type="number" value={newProjectBuildingsCount} onChange={(e) => setNewProjectBuildingsCount(e.target.value === '' ? '' : Number(e.target.value))} className="w-full rounded-md border-slate-300 p-2.5 text-sm border bg-white" min="0" /></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">סה"כ דירות</label><input type="number" value={newProjectAptCount} onChange={(e) => setNewProjectAptCount(e.target.value === '' ? '' : Number(e.target.value))} className="w-full rounded-md border-slate-300 p-2.5 text-sm border bg-white" min="0" /></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">כמות טיפוסי אב</label><input type="number" value={newProjectParentTypologies} onChange={(e) => setNewProjectParentTypologies(e.target.value === '' ? '' : Number(e.target.value))} className="w-full rounded-md border-slate-300 p-2.5 text-sm border bg-white" min="0" /></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">כמות תתי-טיפוס</label><input type="number" value={newProjectSubTypologies} onChange={(e) => setNewProjectSubTypologies(e.target.value === '' ? '' : Number(e.target.value))} className="w-full rounded-md border-slate-300 p-2.5 text-sm border bg-white" min="0" /></div>
            <div className="md:col-span-4 flex justify-end pt-4 border-t border-slate-100 mt-2"><button type="submit" disabled={projectFormLoading} className="px-6 py-2.5 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition">הקמת הפרויקט</button></div>
          </form>

          <div>
            <div className="flex justify-between items-center mb-3 border-b pb-2">
              <h3 className="text-base font-bold text-slate-700">פרויקטים קיימים במערכת</h3>
              <div className="bg-slate-100 p-1 rounded flex border border-slate-200">
                <button type="button" onClick={() => setAdminProjectFilter('active_future')} className={`px-3 py-1.5 text-xs font-bold rounded transition ${adminProjectFilter === 'active_future' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>פעילים ועתידיים</button>
                <button type="button" onClick={() => setAdminProjectFilter('all')} className={`px-3 py-1.5 text-xs font-bold rounded transition ${adminProjectFilter === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>הכל (כולל ארכיון)</button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-right border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 text-[11px] uppercase tracking-wider font-bold whitespace-nowrap">
                    <th className="p-3">שם הפרויקט</th><th className="p-3 w-32">סטטוס</th><th className="p-3 w-40">מהנדס אחראי</th><th className="p-3 text-center w-20">בניינים</th><th className="p-3 text-center w-20">דירות</th><th className="p-3 text-center w-20">ט.אב</th><th className="p-3 text-center w-20">ת.טיפוס</th><th className="p-3 text-center w-28">פעולות עריכה</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-slate-100">
                  {displayedAdminProjects.map(p => (
                     <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                       {editingProjectId === p.id ? (
                         <>
                           <td className="p-2 bg-blue-50/50"><input type="text" required value={editProjName} onChange={e => setEditProjName(e.target.value)} className="border-slate-300 p-2 rounded text-sm w-full outline-none bg-white font-bold" /></td>
                           <td className="p-2 bg-blue-50/50"><select value={editProjStatus} onChange={e => setEditProjStatus(e.target.value as any)} className="border-slate-300 p-2 rounded text-xs w-full bg-white"><option value="פעיל">פעיל</option><option value="עתידי">עתידי (בצנרת)</option><option value="ארכיון">לא פעיל (ארכיון)</option></select></td>
                           <td className="p-2 bg-blue-50/50"><select disabled={editProjStatus !== 'פעיל'} value={editProjEngineer} onChange={e => setEditProjEngineer(e.target.value)} className="border-slate-300 p-2 rounded text-xs w-full bg-white"><option value="">ללא שיוך</option>{activeEngineers.map(eng => (<option key={eng} value={eng}>{eng}</option>))}</select></td>
                           <td className="p-2 bg-blue-50/50"><input type="number" min="0" value={editProjBuildings} onChange={e => setEditProjBuildings(e.target.value === '' ? '' : Number(e.target.value))} className="border-slate-300 p-1.5 rounded text-sm w-full text-center bg-white" /></td>
                           <td className="p-2 bg-blue-50/50"><input type="number" min="0" value={editProjApts} onChange={e => setEditProjApts(e.target.value === '' ? '' : Number(e.target.value))} className="border-slate-300 p-1.5 rounded text-sm w-full text-center bg-white" /></td>
                           <td className="p-2 bg-blue-50/50"><input type="number" min="0" value={editProjParentTypes} onChange={e => setEditProjParentTypes(e.target.value === '' ? '' : Number(e.target.value))} className="border-slate-300 p-1.5 rounded text-sm w-full text-center bg-white" /></td>
                           <td className="p-2 bg-blue-50/50"><input type="number" min="0" value={editProjSubTypes} onChange={e => setEditProjSubTypes(e.target.value === '' ? '' : Number(e.target.value))} className="border-slate-300 p-1.5 rounded text-sm w-full text-center bg-white" /></td>
                           <td className="p-2 bg-blue-50/50">
                              <div className="flex justify-center gap-1.5"><button onClick={() => saveEditProject(p)} disabled={projectFormLoading} className="bg-blue-600 text-white px-2 py-1.5 rounded text-[11px] font-bold">שמור</button><button onClick={() => setEditingProjectId(null)} className="bg-white border px-2 py-1.5 rounded text-[11px] font-bold">ביטול</button></div>
                           </td>
                         </>
                       ) : (
                         <>
                           <td className="p-3 font-bold text-slate-800 truncate max-w-[150px]">{p.project_name}</td>
                           <td className="p-3"><span className={`px-2 py-0.5 rounded text-[11px] font-bold ${p.status === 'פעיל' ? 'bg-emerald-100 text-emerald-700' : p.status === 'עתידי' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>{p.status}</span></td>
                           <td className="p-3 text-slate-600">{p.assigned_engineer || '-'}</td>
                           <td className="p-3 text-center">{p.buildings_count ?? '-'}</td>
                           <td className="p-3 text-center">{p.apartments_count ?? '-'}</td>
                           <td className="p-3 text-center">{p.parent_typologies_count ?? '-'}</td>
                           <td className="p-3 text-center">{p.sub_typologies_count ?? '-'}</td>
                           <td className="p-3 text-center">
                              <div className="flex justify-center items-center gap-2">
                                <button onClick={() => startEditProject(p)} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded"><Edit2 className="w-4 h-4"/></button>
                                <button onClick={() => handleDeleteProject(p.id, p.project_name)} className="text-rose-600 hover:bg-rose-50 p-1.5 rounded"><Trash2 className="w-4 h-4"/></button>
                              </div>
                           </td>
                         </>
                       )}
                     </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}