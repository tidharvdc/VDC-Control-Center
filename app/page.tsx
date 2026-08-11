// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../supabase'; 
import { createNewUserByManager } from './actions/adminUsers'; 

import { Heebo } from 'next/font/google';

import { 
  Building2, Users, Plus, LogOut, Calendar, HardHat, 
  Layers, Clock, Edit2, Trash2, Search, X, ChevronDown, 
  Info, BarChart3, Wallet, List, CheckCircle2, Network,
  PenTool, Ruler, Filter, Printer, ArrowRight, FileText, Settings,
  ClipboardList, Target, AlertTriangle
} from 'lucide-react';

const heebo = Heebo({ 
  subsets: ['hebrew', 'latin'],
  weight: ['300', '400', '500', '700', '800', '900'],
  display: 'swap',
});

// --- Interfaces ---
interface WorkReport { id: number; report_date: string; engineer_name: string; project_name: string; stage: string; sub_stage?: string; notes: string; scope: string; }
interface Project { 
  id: number; 
  project_name: string; 
  project_code?: string; 
  code?: string; 
  project_number?: string; 
  status: string; 
  has_sub_stages?: boolean; 
  assigned_engineer?: string;
  buildings_count?: number;
  apartments_count?: number;        
  typologies_count?: number;        
  parent_typologies_count?: number; 
  sub_typologies_count?: number;    
}
interface WorkStage { id: number; stage_name: string; is_gen1: boolean; is_gen2: boolean; overhead_only: boolean; }
interface WorkSubStage { id: number; parent_stage: string; sub_stage_name: string; }
interface AppUser { id: string; full_name: string; role: string; manager_name?: string; }
interface WorkMeeting { id: number; meeting_date: string; manager_name: string; engineer_name: string; project_name: string; progress_status: string; bottlenecks: string; weekly_focus: string; modelers_tracking: string; }

const safeString = (val: any) => ((val !== null && val !== undefined) ? String(val).trim() : '');
const trimStr = (str: string | null | undefined) => (str || '').trim();

// --- Date Engines ---
const getReportMonth = (dateStr: string) => {
  if (!dateStr) return 'Unknown';
  const [yStr, mStr, dStr] = dateStr.split('-');
  const y = parseInt(yStr); const m = parseInt(mStr); const d = parseInt(dStr);

  if (dateStr < "2026-07-01") return `${yStr}-${mStr}`;
  if (dateStr >= "2026-07-01" && dateStr <= "2026-07-23") return "2026-07";

  if (d >= 24) {
    let nextM = m + 1; let nextY = y;
    if (nextM > 12) { nextM = 1; nextY++; }
    const nextMStr = nextM.toString().padStart(2, '0');
    return `${nextY}-${nextMStr}`;
  } else {
    return `${yStr}-${mStr}`;
  }
};

const getMonthDateRange = (monthStr: string) => {
  const [yStr, mStr] = monthStr.split('-');
  const y = parseInt(yStr); const m = parseInt(mStr);

  if (monthStr < "2026-07") {
      const lastDay = new Date(y, m, 0).getDate();
      return { start: `${monthStr}-01`, end: `${monthStr}-${lastDay}` };
  }
  if (monthStr === "2026-07") {
      return { start: "2026-07-01", end: "2026-07-23" };
  }

  let prevM = m - 1; let prevY = y;
  if (prevM === 0) { prevM = 12; prevY--; }
  const prevMStr = prevM.toString().padStart(2, '0');
  return { start: `${prevY}-${prevMStr}-24`, end: `${monthStr}-23` };
};

export default function Home() {
  const router = useRouter();
  const fetchRequestId = useRef(0); 
  
  // --- States ---
  const [reports, setReports] = useState<WorkReport[]>([]);
  const [activeProjectsList, setActiveProjectsList] = useState<Project[]>([]);
  const [allProjectsList, setAllProjectsList] = useState<Project[]>([]);
  const [activeEngineers, setActiveEngineers] = useState<string[]>([]);
  const [orgUsers, setOrgUsers] = useState<AppUser[]>([]);
  const [stagesList, setStagesList] = useState<WorkStage[]>([]);
  const [subStagesList, setSubStagesList] = useState<WorkSubStage[]>([]);
  
  const [assumptions, setAssumptions] = useState({ vdc_engineer_monthly_cost: 30000, standard_working_days: 22 });
  const [loading, setLoading] = useState(true);
  
  // Roles & Identity
  const [currentUserRole, setCurrentUserRole] = useState<'basic' | 'manager' | 'department_manager' | null>(null);
  const [engineerName, setEngineerName] = useState('');
  const [actualRole, setActualRole] = useState<'basic' | 'manager' | 'department_manager' | null>(null);
  const [actualName, setActualName] = useState('');
  
  // Navigation & Tabs
  const [currentTab, setCurrentTab] = useState<'reports' | 'dashboard' | 'costs' | 'team' | 'admin' | 'work_plan'>('reports');
  const [costSubTab, setCostSubTab] = useState<'monthly' | 'active' | 'inactive'>('monthly');
  const [expandedProjects, setExpandedProjects] = useState<string[]>([]);
  const [expandedDashProjects, setExpandedDashProjects] = useState<string[]>([]); 
  const [openMissingEng, setOpenMissingEng] = useState<string | null>(null);

  // Work Plan Meetings
  const [workPlanMeetings, setWorkPlanMeetings] = useState<WorkMeeting[]>([]);

  // Cost Filtering
  const [costSelectedProjects, setCostSelectedProjects] = useState<string[]>([]);
  const [showCostProjMenu, setShowCostProjMenu] = useState(false);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareGenMode, setCompareGenMode] = useState<'gen1' | 'gen2'>('gen2');
  const [compareSelected, setCompareSelected] = useState<string[]>([]);

  // Meetings Drawer
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerEngineer, setDrawerEngineer] = useState<string | null>(null);
  const [drawerProject, setDrawerProject] = useState<string | null>(null);
  const [meetingHistory, setMeetingHistory] = useState<WorkMeeting[]>([]);
  const [expandedMeetings, setExpandedMeetings] = useState<number[]>([]);
  const [recentReportsContext, setRecentReportsContext] = useState<WorkReport[]>([]);
  const [isNewMeetingOpen, setIsNewMeetingOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<WorkMeeting | null>(null);
  
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingProgress, setMeetingProgress] = useState('');
  const [meetingBottlenecks, setMeetingBottlenecks] = useState('');
  const [meetingFocus, setMeetingFocus] = useState('');
  const [meetingModelers, setMeetingModelers] = useState('');
  const [meetingLoading, setMeetingLoading] = useState(false);

  // Delete Prompt
  const [deletePrompt, setDeletePrompt] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Admin Forms
  const [showReportForm, setShowReportForm] = useState(false);
  const [adminTab, setAdminTab] = useState<'users' | 'projects'>('users');
  const [adminProjectFilter, setAdminProjectFilter] = useState<'all' | 'active_future'>('active_future');
  
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserRole, setNewUserRole] = useState<'basic' | 'manager'>('basic');
  const [adminFormLoading, setAdminFormLoading] = useState(false);

  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectCode, setNewProjectCode] = useState('');
  const [newProjectStatus, setNewProjectStatus] = useState<'פעיל' | 'עתידי'>('פעיל');
  const [newProjectAssignedEngineer, setNewProjectAssignedEngineer] = useState('');
  const [newProjectBuildingsCount, setNewProjectBuildingsCount] = useState<number | ''>('');
  const [newProjectAptCount, setNewProjectAptCount] = useState<number | ''>('');
  const [newProjectParentTypologies, setNewProjectParentTypologies] = useState<number | ''>('');
  const [newProjectSubTypologies, setNewProjectSubTypologies] = useState<number | ''>('');
  const [projectFormLoading, setProjectFormLoading] = useState(false);

  // Inline Editing
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserRole, setEditUserRole] = useState<'basic' | 'manager' | 'department_manager'>('basic');
  const [editUserManager, setEditUserManager] = useState<string>('');

  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [editProjName, setEditProjName] = useState<string>('');
  const [editProjStatus, setEditProjStatus] = useState<'פעיל' | 'עתידי' | 'ארכיון'>('פעיל');
  const [editProjEngineer, setEditProjEngineer] = useState<string>('');
  const [editProjBuildings, setEditProjBuildings] = useState<number | ''>('');
  const [editProjApts, setEditProjApts] = useState<number | ''>('');
  const [editProjParentTypes, setEditProjParentTypes] = useState<number | ''>('');
  const [editProjSubTypes, setEditProjSubTypes] = useState<number | ''>('');

  const today = new Date().toISOString().split('T')[0];
  const currentReportingMonth = getReportMonth(today); 
  const [defaultActiveMonth, setDefaultActiveMonth] = useState(currentReportingMonth);

  // Reports Base
  const [reportDate, setReportDate] = useState(today);
  const [projectName, setProjectName] = useState(''); 
  const [stage, setStage] = useState('');
  const [subStage, setSubStage] = useState('');
  const [notes, setNotes] = useState('');
  const [scope, setScope] = useState('יום מלא');
  const [formLoading, setFormLoading] = useState(false);

  const [editingReport, setEditingReport] = useState<WorkReport | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editEngineerName, setEditEngineerName] = useState('');
  const [editProject, setEditProject] = useState('');
  const [editStage, setEditStage] = useState('');
  const [editSubStage, setEditSubStage] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editScope, setEditScope] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const [filterMonth, setFilterMonth] = useState(currentReportingMonth);
  const [filterEngineer, setFilterEngineer] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [isFiltering, setIsFiltering] = useState(false);

  const [colFilterEngineers, setColFilterEngineers] = useState<string[] | null>(null);
  const [colFilterProjects, setColFilterProjects] = useState<string[] | null>(null);
  const [showEngMenu, setShowEngMenu] = useState(false);
  const [showProjMenu, setShowProjMenu] = useState(false);

  const getProjectDisplayName = (projectObj: any, rawName: string) => {
    const pName = safeString(projectObj ? projectObj.project_name : rawName);
    if (!pName || pName === 'אחר (פירוט בהערות)') return pName;
    let p = projectObj;
    if (!p) { p = allProjectsList.find(x => safeString(x.project_name) === pName); if (!p) p = allProjectsList.find(x => safeString(x.project_name).includes(pName) || pName.includes(safeString(x.project_name))); }
    if (p) {
      const finalName = safeString(p.project_name);
      const pCode = safeString(p.project_code || p.code || p.project_number);
      if (pCode && pCode !== 'null' && pCode !== 'undefined' && pCode !== '') if (!finalName.includes(pCode)) return `${finalName} (${pCode})`;
      return finalName;
    }
    return pName;
  };

  const fetchWorkPlan = async (engName: string) => {
    if (!engName) return;
    const { data, error } = await supabase
      .from('work_meetings')
      .select('*')
      .eq('engineer_name', engName)
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
  };

  const fetchReports = async (month: string, engineer: string, project: string) => {
    setIsFiltering(true);
    fetchRequestId.current += 1;
    const currentReqId = fetchRequestId.current;

    let allFetchedReports: WorkReport[] = [];
    let keepFetching = true; let startRow = 0; const step = 1000; let safetyCounter = 0;

    while (keepFetching && safetyCounter < 30) {
      safetyCounter++; let query = supabase.from('work_reports').select('*');
      if (month) { const { start, end } = getMonthDateRange(month); query = query.gte('report_date', start).lte('report_date', end); }
      if (engineer) query = query.ilike('engineer_name', `%${engineer}%`);
      if (project) query = query.ilike('project_name', `%${project}%`);
      
      query = query.order('report_date', { ascending: false }).order('id', { ascending: false }).range(startRow, startRow + step - 1);
      
      const { data, error } = await query;
      if (error) { console.error("שגיאה במשיכת נתונים:", error); break; }
      if (data && data.length > 0) { 
        allFetchedReports = [...allFetchedReports, ...data]; 
        if (data.length < step) keepFetching = false; else startRow += step; 
      } else { 
        keepFetching = false; 
      }
    }
    
    if (currentReqId === fetchRequestId.current) {
      setReports(allFetchedReports); 
      setIsFiltering(false);
    }
  };

  useEffect(() => {
    const checkUserAndFetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      const { data: profile } = await supabase.from('app_users').select('role, full_name, manager_name').eq('id', session.user.id).single();
      let role = null; let eName = '';
      if (profile) { 
        role = profile.role; 
        eName = profile.full_name; 
        
        setActualRole(role);
        setActualName(eName);
        setCurrentUserRole(role); 
        setEngineerName(eName); 
        
        if (role === 'manager' || role === 'department_manager') {
          setCurrentTab('team');
        } else {
          setCurrentTab('reports');
        }
      }

      const defaultEngineer = role === 'basic' ? eName : '';
      let initialMonth = currentReportingMonth;
      const { start, end } = getMonthDateRange(currentReportingMonth);
      const { data: currentMonthReports } = await supabase.from('work_reports').select('id').gte('report_date', start).lte('report_date', end).limit(1);

      if (!currentMonthReports || currentMonthReports.length === 0) {
        const { data: latestReport } = await supabase.from('work_reports').select('report_date').order('report_date', { ascending: false }).limit(1);
        if (latestReport && latestReport.length > 0 && latestReport[0].report_date) initialMonth = getReportMonth(latestReport[0].report_date);
      }

      setDefaultActiveMonth(initialMonth); setFilterMonth(initialMonth); setFilterEngineer(defaultEngineer);

      const { data: activeProjects, error: activeErr } = await supabase.from('projects').select('*').eq('status', 'פעיל').order('project_name');
      if (!activeErr && activeProjects) {
        setActiveProjectsList(activeProjects);
      }

      const { data: allProjects } = await supabase.from('projects').select('*').order('project_name');
      if (allProjects) setAllProjectsList(allProjects);

      const { data: usersData } = await supabase.from('app_users').select('id, full_name, role, manager_name').order('full_name');
      if (usersData) {
        setOrgUsers(usersData);
        setActiveEngineers(usersData.map(u => u.full_name));
        
        if (role === 'manager') {
          const team = usersData.filter(u => trimStr(u.manager_name) === trimStr(eName)).map(u => u.full_name);
          team.push(eName); 
          setColFilterEngineers(team);
        } else {
          setColFilterEngineers(null); 
        }
      }

      const { data: assumData } = await supabase.from('system_assumptions').select('*').eq('parameter_key', 'vdc_engineer_monthly_cost').single();
      if (assumData) setAssumptions(prev => ({ ...prev, vdc_engineer_monthly_cost: Number(assumData.parameter_value) }));

      const { data: dbStages } = await supabase.from('work_stages').select('*').order('id');
      if (dbStages) setStagesList(dbStages);

      const { data: dbSubStages } = await supabase.from('work_sub_stages').select('*').order('id');
      if (dbSubStages) setSubStagesList(dbSubStages);

      await fetchReports(initialMonth, defaultEngineer, '');
      await fetchWorkPlan(eName);
      setLoading(false);
    };
    checkUserAndFetchData();
  }, [router]);

  const handleFilterSubmit = (e: React.FormEvent) => { 
    e.preventDefault(); 
    const safeMonth = filterMonth || defaultActiveMonth;
    if (!filterMonth) setFilterMonth(safeMonth);
    fetchReports(safeMonth, filterEngineer, filterProject); 
  };
  
  const clearFilters = () => { 
    const defaultEngineer = currentUserRole === 'basic' ? engineerName : ''; 
    setFilterMonth(defaultActiveMonth); 
    setFilterEngineer(defaultEngineer); 
    setFilterProject(''); 
    fetchReports(defaultActiveMonth, defaultEngineer, ''); 
  };
  
  const handleTabChange = (tab: 'reports' | 'dashboard' | 'costs' | 'team' | 'admin' | 'work_plan') => { 
    const targetMonth = filterMonth || defaultActiveMonth;
    
    setIsCompareMode(false);
    setCostSelectedProjects([]);
    setShowReportForm(false);

    if (tab === 'work_plan') {
       fetchWorkPlan(engineerName);
    }

    if (tab === 'costs' || tab === 'team' || tab === 'admin' || tab === 'work_plan') { 
      setFilterEngineer(''); 
      setFilterProject(''); 
      if (tab === 'costs' && costSubTab !== 'monthly') {
        fetchReports('', '', ''); 
      } else {
        fetchReports(targetMonth, '', ''); 
      }
    } else {
      fetchReports(targetMonth, filterEngineer, filterProject); 
    }
    
    if (!filterMonth && tab !== 'costs') setFilterMonth(targetMonth);
    setCurrentTab(tab); 
  };
  
  const handleCostSubTabChange = (subTab: 'monthly' | 'active' | 'inactive') => { 
    setCostSubTab(subTab); 
    setExpandedProjects([]); 
    setFilterEngineer(''); 
    setFilterProject(''); 
    setCostSelectedProjects([]);
    setIsCompareMode(false);
    
    if (subTab === 'monthly') { 
      const targetMonth = filterMonth || defaultActiveMonth;
      if (!filterMonth) setFilterMonth(targetMonth);
      fetchReports(targetMonth, '', ''); 
    } else { 
      fetchReports('', '', ''); 
    } 
  };
  
  const toggleProjectExpand = (projName: string) => { setExpandedProjects(prev => prev.includes(projName) ? prev.filter(p => p !== projName) : [...prev, projName]); };
  const toggleDashExpand = (id: string) => { setExpandedDashProjects(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); };
  const handleLogout = async () => { const confirmLogout = window.confirm('האם אתה בטוח שברצונך להתנתק?'); if (!confirmLogout) return; await supabase.auth.signOut(); router.push('/login'); };

  const currentSelectedProjectObj = activeProjectsList.find(p => p.project_name === projectName);
  const isGen2Project = currentSelectedProjectObj?.has_sub_stages === true;
  const isOverheadProject = projectName.includes('תקורות חברה');

  let availableStages = stagesList.filter(s => isGen2Project ? s.is_gen2 : s.is_gen1);
  if (isOverheadProject) availableStages = availableStages.filter(s => s.overhead_only); else availableStages = availableStages.filter(s => !s.overhead_only);
  let availableSubStages = isGen2Project ? subStagesList.filter(sub => sub.parent_stage === stage) : [];
  const isSubStageRequired = availableSubStages.length > 0;

  const currentEditSelectedProjectObj = allProjectsList.find(p => p.project_name === editProject);
  const isEditGen2Project = currentEditSelectedProjectObj?.has_sub_stages === true;
  const isEditOverheadProject = editProject.includes('תקורות חברה');

  let availableEditStages = stagesList.filter(s => isEditGen2Project ? s.is_gen2 : s.is_gen1);
  if (isEditOverheadProject) availableEditStages = availableEditStages.filter(s => s.overhead_only); else availableEditStages = availableEditStages.filter(s => !s.overhead_only);
  let availableEditSubStages = isEditGen2Project ? subStagesList.filter(sub => sub.parent_stage === editStage) : [];
  const isEditSubStageRequired = availableEditSubStages.length > 0;

  // --- מנגנון אישור מחיקה חכם (Delete Prompt) ---
  const requestDelete = (title: string, message: string, onConfirm: () => void) => {
    setDeletePrompt({ isOpen: true, title, message, onConfirm });
  };

  const confirmDelete = () => {
    if (deletePrompt.onConfirm) deletePrompt.onConfirm();
    setDeletePrompt({ ...deletePrompt, isOpen: false });
  };

  const handleDeleteUser = (userId: string, userName: string) => {
    requestDelete(
      'מחיקת משתמש',
      `האם אתה בטוח שברצונך למחוק את המשתמש "${userName}"?\n(שים לב: המחיקה תסיר אותו מהמערכת, אך היסטוריית הדיווחים שלו תשמר).`,
      async () => {
        setAdminFormLoading(true);
        const { error } = await supabase.from('app_users').delete().eq('id', userId);
        setAdminFormLoading(false);
        if (!error) { alert('משתמש נמחק בהצלחה!'); window.location.reload(); } else alert('שגיאה במחיקת משתמש: ' + error.message);
      }
    );
  };

  const handleDeleteProject = (projectId: number, projName: string) => {
    requestDelete(
      'מחיקת פרויקט',
      `האם אתה בטוח שברצונך למחוק את הפרויקט "${projName}"?\n(שים לב: היסטוריית הדיווחים המשויכת לפרויקט תשמר).`,
      async () => {
        setProjectFormLoading(true);
        const { error } = await supabase.from('projects').delete().eq('id', projectId);
        setProjectFormLoading(false);
        if (!error) { alert('פרויקט נמחק בהצלחה!'); window.location.reload(); } else alert('שגיאה במחיקת פרויקט: ' + error.message);
      }
    );
  };

  const handleDeleteMeeting = (id: number) => {
    requestDelete(
      'מחיקת סיכום פגישה',
      'האם אתה בטוח שברצונך למחוק סיכום פגישה זה? הפעולה אינה הפיכה.',
      async () => {
        const { error } = await supabase.from('work_meetings').delete().eq('id', id);
        if (!error) setMeetingHistory(prev => prev.filter(m => m.id !== id));
        else alert('שגיאה במחיקת פגישה: ' + error.message);
      }
    );
  };

  const handleDelete = (id: number) => {
    requestDelete(
      'מחיקת דיווח עבודה',
      'האם אתה בטוח שברצונך למחוק דיווח זה? הנתונים ההיסטוריים ישתנו והפעולה אינה הפיכה.',
      async () => {
        const { error } = await supabase.from('work_reports').delete().eq('id', id);
        if (!error) setReports(prev => prev.filter(report => report.id !== id));
        else alert('שגיאה במחיקת הדיווח: ' + error.message);
      }
    );
  };


  // --- Inline Editing: Users ---
  const startEditUser = (u: AppUser) => {
    setEditingUserId(u.id);
    setEditUserRole(u.role as any);
    setEditUserManager(u.manager_name || '');
  };

  const saveEditUser = async (userId: string) => {
    setAdminFormLoading(true);
    const { error } = await supabase.from('app_users').update({
      role: editUserRole,
      manager_name: editUserManager || null
    }).eq('id', userId);
    setAdminFormLoading(false);
    if (!error) {
       alert('משתמש עודכן בהצלחה!');
       setEditingUserId(null);
       window.location.reload(); 
    } else {
       alert('שגיאה בעדכון משתמש: ' + error.message);
    }
  };


  // --- Inline Editing: Projects ---
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

    const { error } = await supabase.from('projects').update({
      project_name: editProjName,
      status: editProjStatus,
      assigned_engineer: editProjStatus === 'עתידי' ? null : (editProjEngineer || null),
      buildings_count: editProjBuildings === '' ? null : Number(editProjBuildings),
      apartments_count: editProjApts === '' ? null : Number(editProjApts),
      parent_typologies_count: editProjParentTypes === '' ? null : Number(editProjParentTypes),
      sub_typologies_count: editProjSubTypes === '' ? null : Number(editProjSubTypes),
    }).eq('id', p.id);
    
    setProjectFormLoading(false);
    if (!error) {
       alert('פרויקט עודכן בהצלחה!');
       setEditingProjectId(null);
       window.location.reload();
    } else {
       alert('שגיאה בעדכון פרויקט: ' + error.message);
    }
  };


  // --- Meeting Actions ---
  const openEngineerDrawer = (engName: string) => {
    setDrawerEngineer(engName);
    setDrawerProject(null);
    setMeetingHistory([]);
    setExpandedMeetings([]);
    setIsNewMeetingOpen(false);
    setEditingMeeting(null);
    setIsDrawerOpen(true);
  };

  const closeEngineerDrawer = () => {
    setIsDrawerOpen(false);
    setTimeout(() => {
       setDrawerEngineer(null);
       setDrawerProject(null);
       setEditingMeeting(null);
    }, 300);
  };

  const selectProjectForMeeting = async (projName: string) => {
    setDrawerProject(projName);
    setIsNewMeetingOpen(false);
    setEditingMeeting(null);
    setExpandedMeetings([]); 
    
    const { data: meetings } = await supabase.from('work_meetings').select('*').eq('engineer_name', drawerEngineer).eq('project_name', projName).order('meeting_date', { ascending: false });
    if (meetings) setMeetingHistory(meetings);
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateStr = sevenDaysAgo.toISOString().split('T')[0];
    
    const { data: recentReports } = await supabase.from('work_reports').select('*').eq('engineer_name', drawerEngineer).eq('project_name', projName).gte('report_date', dateStr).order('report_date', { ascending: false });
    if (recentReports) setRecentReportsContext(recentReports);
  };

  const openNewMeetingForm = () => {
    setEditingMeeting(null);
    setMeetingDate(today);
    if (meetingHistory.length > 0) {
      const lastMeeting = meetingHistory[0];
      setMeetingProgress(lastMeeting.progress_status || '');
      setMeetingBottlenecks(lastMeeting.bottlenecks || '');
      setMeetingFocus(lastMeeting.weekly_focus || '');
      setMeetingModelers(lastMeeting.modelers_tracking || '');
    } else {
      setMeetingProgress(''); setMeetingBottlenecks(''); setMeetingFocus(''); setMeetingModelers('');
    }
    setIsNewMeetingOpen(true);
  };

  const openEditMeetingForm = (meeting: WorkMeeting) => {
    setEditingMeeting(meeting);
    setMeetingDate(meeting.meeting_date);
    setMeetingProgress(meeting.progress_status || '');
    setMeetingBottlenecks(meeting.bottlenecks || '');
    setMeetingFocus(meeting.weekly_focus || '');
    setMeetingModelers(meeting.modelers_tracking || '');
    setIsNewMeetingOpen(true);
  };

  const handleMeetingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drawerEngineer || !drawerProject) return;
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

  // Toggle meeting expand/collapse
  const toggleMeetingExpand = (id: number) => {
    setExpandedMeetings(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); 
    if (!projectName) return alert('נא לבחור פרויקט'); 
    if (!stage) return alert('נא לבחור שלב הנדסי'); 
    if (isSubStageRequired && !subStage) return alert('שלב זה דורש בחירת תת-שלב מפורט');
    setFormLoading(true); 

    const requestedScopeVal = scope === 'חצי יום' ? 0.5 : 1.0;
    const { data: dayReports, error: checkError } = await supabase.from('work_reports').select('scope').eq('report_date', reportDate).eq('engineer_name', engineerName);
    if (checkError) { setFormLoading(false); return alert('שגיאה בבדיקת מגבלת הדיווח היומית.'); }
    
    const currentDayTotal = (dayReports || []).reduce((sum, r) => sum + (r.scope === 'חצי יום' ? 0.5 : 1.0), 0);
    if (currentDayTotal + requestedScopeVal > 1.0) {
      setFormLoading(false);
      const reportedText = currentDayTotal === 0.5 ? 'חצי יום (50%)' : currentDayTotal === 1.0 ? 'יום מלא (100%)' : `${currentDayTotal * 100}%`;
      return alert(`חריגה ממגבלת הדיווח היומית!\nכבר דווח: ${reportedText}.`);
    }

    const finalSubStage = isSubStageRequired ? subStage : null;
    const { error } = await supabase.from('work_reports').insert([{ report_date: reportDate, engineer_name: engineerName, project_name: projectName, stage, sub_stage: finalSubStage, notes, scope }]);
    setFormLoading(false);
    if (!error) { 
      setProjectName(''); setStage(''); setSubStage(''); setNotes(''); alert('הדיווח נשמר בהצלחה!'); 
      fetchReports(filterMonth || defaultActiveMonth, filterEngineer, filterProject); 
    } else alert('שגיאה בשמירת הדיווח: ' + error.message);
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); 
    if (!editingReport) return; 
    setEditLoading(true); 

    const requestedScopeVal = editScope === 'חצי יום' ? 0.5 : 1.0;
    const { data: dayReports, error: checkError } = await supabase.from('work_reports').select('scope, id').eq('report_date', editDate).eq('engineer_name', editEngineerName).neq('id', editingReport.id); 
    if (checkError) { setEditLoading(false); return alert('שגיאה בבדיקת מגבלת הדיווח היומית.'); }
    
    const currentDayTotal = (dayReports || []).reduce((sum, r) => sum + (r.scope === 'חצי יום' ? 0.5 : 1.0), 0);
    if (currentDayTotal + requestedScopeVal > 1.0) {
      setEditLoading(false);
      const reportedText = currentDayTotal === 0.5 ? 'חצי יום (50%)' : currentDayTotal === 1.0 ? 'יום מלא (100%)' : `${currentDayTotal * 100}%`;
      return alert(`חריגה ממגבלת הדיווח היומית!\nכבר דווח: ${reportedText}.`);
    }

    const finalEditSubStage = isEditSubStageRequired ? editSubStage : null;
    const { error } = await supabase.from('work_reports').update({ report_date: editDate, engineer_name: editEngineerName, project_name: editProject, stage: editStage, sub_stage: finalEditSubStage, scope: editScope, notes: editNotes }).eq('id', editingReport.id);
    setEditLoading(false);
    if (!error) { 
      setEditingReport(null); 
      fetchReports(filterMonth || defaultActiveMonth, filterEngineer, filterProject); 
      alert('הדיווח עודכן בהצלחה!'); 
    } else alert('שגיאה בעדכון הדיווח: ' + error.message);
  };

  const handleAdminUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!newUserEmail || !newUserFullName) return alert('נא למלא את כל השדות');
    setAdminFormLoading(true);
    const result = await createNewUserByManager({ email: newUserEmail, fullName: newUserFullName, role: newUserRole });
    setAdminFormLoading(false);
    if (result.success) { alert(`המשתמש הוקם בהצלחה!`); setNewUserEmail(''); setNewUserFullName(''); window.location.reload(); } 
    else alert(`שגיאה: ${result.error}`);
  };

  const handleProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName) return alert('נא להזין שם פרויקט');
    setProjectFormLoading(true);

    const { error } = await supabase.from('projects').insert([{
      project_name: newProjectName,
      project_code: newProjectCode,
      status: newProjectStatus,
      has_sub_stages: true,
      assigned_engineer: newProjectStatus === 'פעיל' ? newProjectAssignedEngineer : null,
      buildings_count: newProjectBuildingsCount === '' ? null : newProjectBuildingsCount,
      apartments_count: newProjectAptCount === '' ? null : newProjectAptCount,
      parent_typologies_count: newProjectParentTypologies === '' ? null : newProjectParentTypologies,
      sub_typologies_count: newProjectSubTypologies === '' ? null : newProjectSubTypologies
    }]);

    setProjectFormLoading(false);
    if (!error) {
      alert('הפרויקט הוקם בהצלחה!');
      window.location.reload();
    } else alert('שגיאה בשמירת הפרויקט: ' + error.message);
  };

  const openEditModal = (report: WorkReport) => { setEditingReport(report); setEditDate(report.report_date); setEditEngineerName(report.engineer_name); setEditProject(report.project_name); setEditStage(report.stage); setEditSubStage(report.sub_stage || ''); setEditScope(report.scope); setEditNotes(report.notes || ''); };
  const formatDate = (dateStr: string) => { if (!dateStr) return ''; const parts = dateStr.split('-'); if (parts.length !== 3) return dateStr; return `${parseInt(parts[2])}.${parseInt(parts[1])}.${parts[0]}`; };
  const isProjectActive = (formattedProjName: string) => { if (formattedProjName === 'אחר (פירוט בהערות)') return false; const p = allProjectsList.find(x => getProjectDisplayName(x, x.project_name) === formattedProjName); return p ? safeString(p.status) === 'פעיל' : false; };

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

  const generateDashboardData = () => {
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
  };

  const generateCostData = () => {
    const globalProjectCosts: Record<string, { totalCost: number, baseDays: number, engineersMap: Record<string, any>, stagesMap: Record<string, any>, projectStats: any }> = {};
    const BASE_COST = assumptions.vdc_engineer_monthly_cost;

    allProjectsList.forEach(p => {
        const displayName = getProjectDisplayName(p, p.project_name);
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
         const cleanProjName = getProjectDisplayName(null, r.project_name);
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

         activeProjects.forEach(proj => {
            if (!globalProjectCosts[proj]) {
              const dbProject = allProjectsList.find(p => getProjectDisplayName(p, p.project_name) === proj);
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

            Object.keys(projData.stages).forEach(stageKey => {
                const { days: stageDays, stageName, subStageName } = projData.stages[stageKey];
                const stageDirectCost = stageDays * costPerDay;
                const stageOverhead = distributedOtherCostPerProject * (stageDays / projData.totalDays);
                const finalStageCost = stageDirectCost + stageOverhead;

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

    const processedData = Object.keys(globalProjectCosts).map(p => {
       const pData = globalProjectCosts[p];
       const engineersArray = Object.keys(pData.engineersMap).map(e => ({ name: e, cost: pData.engineersMap[e].cost, directDays: pData.engineersMap[e].directDays })).sort((a,b) => b.cost - a.cost);
       const stagesArray = Object.keys(pData.stagesMap).map(s => {
           const subArray = Object.keys(pData.stagesMap[s].subStages).map(sub => ({ name: sub, cost: pData.stagesMap[s].subStages[sub].cost, days: pData.stagesMap[s].subStages[sub].days })).sort((a,b) => b.cost - a.cost);
           return { name: s, cost: pData.stagesMap[s].cost, days: pData.stagesMap[s].days, subStages: subArray };
       }).sort((a,b) => b.cost - a.cost);

       return { name: p, totalCost: pData.totalCost, baseDays: pData.baseDays, engineers: engineersArray, stages: stagesArray, stats: pData.projectStats };
    }).sort((a,b) => b.totalCost - a.totalCost);

    const finalCostData = processedData.filter(p => p.totalCost > 0 && p.name !== 'אחר (פירוט בהערות)' && !p.name.includes('תקורות חברה'));
    if (costSubTab === 'active') return finalCostData.filter(p => isProjectActive(p.name));
    if (costSubTab === 'inactive') return finalCostData.filter(p => !isProjectActive(p.name));
    return finalCostData;
  };

  const dashboardData = generateDashboardData();
  const costData = generateCostData();
  let displayDateRange = ""; if (filterMonth) { const r = getMonthDateRange(filterMonth); displayDateRange = `(${formatDate(r.start)} - ${formatDate(r.end)})`; }

  const displayedCostData = costSelectedProjects.length > 0 ? costData.filter(p => costSelectedProjects.includes(p.name)) : costData;
  const sortedReports = [...reports].sort((a, b) => {
    const engCmp = a.engineer_name.localeCompare(b.engineer_name, 'he');
    if (engCmp !== 0) return engCmp;
    return new Date(b.report_date).getTime() - new Date(a.report_date).getTime();
  });
  const uniqueEngsInReports = Array.from(new Set(reports.map(r => r.engineer_name))).sort();
  const uniqueProjsInReports = Array.from(new Set(reports.map(r => getProjectDisplayName(null, r.project_name)))).sort();
  const displayedReports = sortedReports.filter(r => {
    const engPass = colFilterEngineers === null || colFilterEngineers.includes(r.engineer_name);
    const projPass = colFilterProjects === null || colFilterProjects.includes(getProjectDisplayName(null, r.project_name));
    return engPass && projPass;
  });
  const totalDaysCurrentView = displayedReports.reduce((sum, report) => sum + (report.scope === 'חצי יום' ? 0.5 : 1), 0);

  // === מפת כוח אדם ===
  const getProjectsForEngineer = (engName: string) => allProjectsList.filter(p => p.assigned_engineer && trimStr(p.assigned_engineer).includes(trimStr(engName))).map(p => getProjectDisplayName(p, p.project_name));
  const pipelineProjects = allProjectsList.filter(p => safeString(p.status) === 'עתידי').map(p => getProjectDisplayName(p, p.project_name));
  
  const rootManager = orgUsers.find(u => trimStr(u.full_name) === trimStr(actualName)) || { full_name: actualName, role: actualRole === 'manager' ? 'מנהל VDC' : 'מנהל מחלקת VDC' };
  const rootManagerName = trimStr(rootManager.full_name);
  const rootProjects = getProjectsForEngineer(rootManagerName);
  
  const reportingToRoot = orgUsers.filter(u => trimStr(u.manager_name) === rootManagerName);
  const teamLeaders = actualRole === 'department_manager' ? reportingToRoot.filter(u => orgUsers.some(sub => trimStr(sub.manager_name) === trimStr(u.full_name))) : [];
  const directEngineers = actualRole === 'department_manager' ? reportingToRoot.filter(u => !orgUsers.some(sub => trimStr(sub.manager_name) === trimStr(u.full_name))) : reportingToRoot;

  const teamColors = [
     { border: 'border-blue-500/80', title: 'text-blue-400', line: 'bg-blue-500/40', tag: 'bg-blue-900/30 text-blue-400 border-blue-500/50' },
     { border: 'border-amber-500/80', title: 'text-amber-400', line: 'bg-amber-500/40', tag: 'bg-amber-900/30 text-amber-400 border-amber-500/50' },
     { border: 'border-purple-500/80', title: 'text-purple-400', line: 'bg-purple-500/40', tag: 'bg-purple-900/30 text-purple-400 border-purple-500/50' }
  ];
  const defaultDirectColor = { border: 'border-rose-500/80', title: 'text-rose-400', line: 'bg-rose-500/40', tag: 'bg-rose-900/30 text-rose-400 border-rose-500/50' };

  const OrgCard = ({ user, projects, colorData, displayRole }: { user: any, projects: string[], colorData: any, displayRole: string }) => {
    const borderColor = colorData?.border || defaultDirectColor.border;
    const titleColor = colorData?.title || defaultDirectColor.title;
    return (
      <div 
        onClick={(e) => { e.stopPropagation(); openEngineerDrawer(user.full_name); }} 
        className={`relative z-20 pointer-events-auto p-4 rounded-xl border border-slate-700 bg-slate-800/90 shadow-lg flex flex-col items-center text-center w-[230px] transition-all cursor-pointer hover:shadow-2xl hover:border-slate-400 hover:scale-105`}
      >
        <div className={`absolute top-0 left-0 right-0 h-1.5 rounded-t-xl ${borderColor.replace('border-', 'bg-')} opacity-80`}></div>
        <div className="flex items-center gap-2 mt-2 w-full justify-center px-2">
          {displayRole.includes('מנהל') ? <Ruler className={`w-4 h-4 flex-shrink-0 opacity-80 ${titleColor}`} /> : <HardHat className={`w-4 h-4 flex-shrink-0 opacity-80 ${titleColor}`} />}
          <div className={`font-black text-[16px] tracking-tight whitespace-nowrap overflow-hidden text-ellipsis ${titleColor}`}>{user.full_name}</div>
        </div>
        <div className="text-[11px] font-bold text-slate-300 whitespace-nowrap uppercase tracking-widest mt-1.5 mb-4 bg-slate-900/60 px-3 py-0.5 rounded shadow-inner border border-slate-700/50">{displayRole}</div>
        <div className="flex flex-col gap-2 w-full pointer-events-none">
          {projects.map((proj, idx) => {
            const match = proj.match(/(.*?)(?:\s*\((.*?)\))?$/);
            const pName = match ? match[1].trim() : proj;
            const pCode = match && match[2] ? `(${match[2]})` : null;
            return (
              <div key={idx} className="bg-slate-900/80 border border-slate-700 text-slate-300 py-2 px-3 rounded shadow-inner w-full flex flex-col items-center justify-center">
                <span className="text-[12px] font-bold text-center leading-snug whitespace-normal break-words w-full">{pName}</span>
                {pCode && <span className="text-[10px] text-slate-500 mt-1 font-mono">{pCode}</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const displayedAdminProjects = allProjectsList.filter(p => {
    if (adminProjectFilter === 'all') return true;
    return p.status === 'פעיל' || p.status === 'עתידי';
  });

  if (loading) return <div className={`min-h-screen bg-slate-100 flex items-center justify-center text-slate-500 ${heebo.className}`}>טוען נתוני מערכת...</div>;

  return (
    <React.Fragment>
      {/* אזור הדפסה */}
      <div className="hidden print:block text-black bg-white font-sans w-full" dir="rtl">
        <style>{`@media print { @page { size: A4 portrait; margin: 8mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 10px !important; } }`}</style>
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
                              const hasBld = bldVal !== null && bldVal !== undefined && String(bldVal).trim() !== ''; const hasApt = aptVal !== null && aptVal !== undefined && String(aptVal).trim() !== ''; const hasTyp = typVal !== null && typVal !== undefined && String(typVal).trim() !== ''; const hasPTyp = pTypVal !== null && pTypVal !== undefined && String(pTypVal).trim() !== ''; const hasSTyp = sTypVal !== null && sTypVal !== undefined && String(sTypVal).trim() !== '';
                              const hasAny = hasBld || hasApt || hasTyp || hasPTyp || hasSTyp;
                              if (!hasAny) return null;
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

      {/* אזור מסך רגיל */}
      <div className={`print:hidden min-h-screen ${['team'].includes(currentTab) ? 'bg-slate-950 text-slate-300' : 'bg-slate-50 text-slate-800'} pb-12 overflow-x-hidden ${heebo.className} transition-colors duration-500`} dir="rtl" style={{ backgroundImage: ['team'].includes(currentTab) ? 'none' : 'radial-gradient(#cbd5e1 1px, transparent 0)', backgroundSize: '24px 24px' }}>
        
        {/* Header */}
        <div className="bg-slate-900 border-b-4 border-blue-600 shadow-lg mb-8">
          <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="bg-blue-600/20 p-3 rounded-lg"><Building2 className="text-blue-400 w-8 h-8" /></div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">VDC<span className="text-blue-400 font-light"> Control Center</span></h1>
                <p className="text-sm text-slate-400 mt-0.5 flex items-center gap-1.5"><HardHat className="w-4 h-4" /> מחובר: <span className="font-semibold text-slate-200">{engineerName}</span> <span className="opacity-50">|</span> {currentUserRole === 'department_manager' ? 'ניהול מחלקה' : currentUserRole === 'manager' ? 'ניהול צוות' : 'הנדסה'}</p>
              </div>
            </div>
            <div className="flex gap-3 items-center">
              {currentUserRole === 'department_manager' && (
                <button 
                  onClick={() => { 
                    if (currentTab === 'admin') {
                      handleTabChange(currentUserRole === 'department_manager' ? 'team' : 'reports');
                    } else {
                      handleTabChange('admin');
                    }
                  }} 
                  className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition border shadow-sm text-sm ${currentTab === 'admin' ? 'bg-slate-200 text-slate-800 border-slate-300 hover:bg-slate-300' : 'bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white border-slate-700'}`}
                >
                  {currentTab === 'admin' ? <X className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
                  {currentTab === 'admin' ? 'סגור מסך ניהול' : 'ניהול נתוני המערכת'}
                </button>
              )}
              <button 
                onClick={() => { 
                  if (currentTab !== 'reports') {
                    setCurrentTab('reports');
                    setShowReportForm(true);
                  } else {
                    setShowReportForm(!showReportForm);
                  }
                }} 
                className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition shadow-md text-sm ${showReportForm && currentTab === 'reports' ? 'bg-blue-700 text-white shadow-inner' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
              >
                <Plus className="w-4 h-4" /> דיווח עבודה
              </button>
              <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 bg-transparent text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-md font-medium transition text-sm">
                <LogOut className="w-4 h-4" /> התנתק
              </button>
            </div>
          </div>
        </div>

        <div className={`${currentTab === 'team' ? 'max-w-[100%] 2xl:max-w-[95%]' : 'max-w-7xl'} mx-auto space-y-6 px-6 transition-all duration-500`}>
          
          {/* Navigation Tabs - גלויות תמיד */}
          {currentTab !== 'admin' && (
            <div className={`flex border-b overflow-x-auto gap-8 mb-6 ${['team'].includes(currentTab) ? 'border-slate-800' : 'border-slate-300'}`}>
              <button onClick={() => handleTabChange('reports')} className={`pb-3 flex items-center gap-2 text-sm font-bold border-b-2 whitespace-nowrap transition ${currentTab === 'reports' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-400'}`}><List className="w-4 h-4" /> טבלת דיווחים</button>
              
              <button onClick={() => handleTabChange('work_plan')} className={`pb-3 flex items-center gap-2 text-sm font-bold border-b-2 whitespace-nowrap transition ${currentTab === 'work_plan' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-400'}`}><ClipboardList className="w-4 h-4" /> תוכנית עבודה</button>

              {(currentUserRole === 'department_manager' || currentUserRole === 'manager') && (
                <>
                  <button onClick={() => handleTabChange('dashboard')} className={`pb-3 flex items-center gap-2 text-sm font-bold border-b-2 whitespace-nowrap transition ${currentTab === 'dashboard' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-400'}`}><BarChart3 className="w-4 h-4" /> דאשבורד העמסות</button>
                  {currentUserRole === 'department_manager' && (
                    <button onClick={() => handleTabChange('costs')} className={`pb-3 flex items-center gap-2 text-sm font-bold border-b-2 whitespace-nowrap transition ${currentTab === 'costs' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-400'}`}><Wallet className="w-4 h-4" /> תמחור ובקרת תקציב</button>
                  )}
                  <button onClick={() => handleTabChange('team')} className={`pb-3 flex items-center gap-2 text-sm font-bold border-b-2 whitespace-nowrap transition ${currentTab === 'team' ? 'border-blue-600 text-blue-500' : 'border-transparent text-slate-500 hover:text-slate-400'}`}><Network className="w-4 h-4" /> מפת כוח אדם</button>
                </>
              )}
            </div>
          )}

          {/* TAB CONTENT: WORK PLAN (תוכנית עבודה שבועית אישית) */}
          {currentTab === 'work_plan' && !showReportForm && (
            <div className="animate-in fade-in duration-300">
               <div className="mb-6 bg-white p-5 rounded-md shadow-sm border border-slate-200">
                  <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                    <ClipboardList className="w-6 h-6 text-blue-600" /> תוכנית עבודה שבועית אישית
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">מבוסס על סיכומי פגישות הסטטוס האחרונות מול מנהל הצוות. מציג פרויקטים שבאחריותך.</p>
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {Array.from(new Set([
                     ...allProjectsList.filter(p => p.assigned_engineer && trimStr(p.assigned_engineer).includes(trimStr(engineerName))).map(p => getProjectDisplayName(p, p.project_name)),
                     ...workPlanMeetings.map(m => m.project_name)
                  ])).map(projName => {
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
                  {Array.from(new Set([
                     ...allProjectsList.filter(p => p.assigned_engineer && trimStr(p.assigned_engineer).includes(trimStr(engineerName))).map(p => getProjectDisplayName(p, p.project_name)),
                     ...workPlanMeetings.map(m => m.project_name)
                  ])).length === 0 && (
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
          )}

          {/* TAB CONTENT: ADMIN FORMS */}
          {currentTab === 'admin' && currentUserRole === 'department_manager' && (
            <div className="bg-white p-6 rounded-md shadow-sm border border-slate-200 text-slate-800 mb-6 animate-in fade-in duration-300">
              <div className="flex border-b border-slate-200 mb-5 gap-6">
                <button onClick={() => setAdminTab('users')} className={`pb-2 font-bold text-sm border-b-2 transition-all ${adminTab === 'users' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>ניהול משתמשים</button>
                <button onClick={() => setAdminTab('projects')} className={`pb-2 font-bold text-sm border-b-2 transition-all ${adminTab === 'projects' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>ניהול רשימת פרויקטים</button>
              </div>

              {adminTab === 'users' && (
                <div className="animate-in fade-in duration-300">
                  <form onSubmit={handleAdminUserSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-5 bg-slate-50 p-5 rounded-lg border border-slate-100 mb-8">
                    <div className="md:col-span-3 pb-1 mb-1"><h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Users className="w-5 h-5 text-blue-600" /> הוספת משתמש למערכת</h2></div>
                    <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">שם מלא</label><input type="text" required value={newUserFullName} onChange={(e) => setNewUserFullName(e.target.value)} className="w-full rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition bg-white" /></div>
                    <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">אימייל ארגוני</label><input type="email" required value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} className="w-full text-left rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition bg-white" dir="ltr" /></div>
                    <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">הרשאת מערכת</label><select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as 'basic' | 'manager')} className="w-full rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition bg-white"><option value="basic">מהנדס (בסיסי)</option><option value="manager">מנהל (Manager)</option></select></div>
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
                                     <select value={editUserRole} onChange={e => setEditUserRole(e.target.value as any)} className="border-slate-300 p-2 rounded text-sm w-full outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white shadow-sm border"><option value="basic">מהנדס (בסיסי)</option><option value="manager">מנהל (Manager)</option><option value="department_manager">מנהל מחלקה</option></select>
                                   </td>
                                   <td className="p-3 bg-blue-50/50">
                                     <select value={editUserManager} onChange={e => setEditUserManager(e.target.value)} className="border-slate-300 p-2 rounded text-sm w-full outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white shadow-sm border"><option value="">ללא מנהל ישיר (עצמאי)</option>{orgUsers.filter(mu => (mu.role === 'manager' || mu.role === 'department_manager') && mu.id !== u.id).map(mu => (<option key={mu.id} value={mu.full_name}>{mu.full_name}</option>))}</select>
                                   </td>
                                   <td className="p-3 bg-blue-50/50">
                                      <div className="flex justify-center gap-2"><button onClick={() => saveEditUser(u.id)} disabled={adminFormLoading} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-bold transition shadow-sm">שמור</button><button onClick={() => setEditingUserId(null)} className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded text-xs font-bold transition shadow-sm">ביטול</button></div>
                                   </td>
                                 </>
                               ) : (
                                 <>
                                   <td className="p-3 font-bold text-slate-800">{u.full_name}</td>
                                   <td className="p-3"><span className={`px-2 py-0.5 rounded text-[11px] font-bold ${u.role === 'department_manager' ? 'bg-purple-100 text-purple-700' : u.role === 'manager' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{u.role === 'department_manager' ? 'מנהל מחלקה' : u.role === 'manager' ? 'מנהל צוות' : 'מהנדס'}</span></td>
                                   <td className="p-3 text-slate-600">{u.manager_name || <span className="text-slate-400 italic">עצמאי</span>}</td>
                                   <td className="p-3 text-center">
                                      <div className="flex justify-center items-center gap-2">
                                        <button onClick={() => startEditUser(u)} className="text-blue-600 hover:text-blue-800 text-xs font-bold flex items-center justify-center p-1.5 bg-blue-50 hover:bg-blue-100 rounded transition" title="עריכת משתמש"><Edit2 className="w-4 h-4"/></button>
                                        {u.id !== (currentUserRole === 'department_manager' ? orgUsers.find(x => x.full_name === engineerName)?.id : null) && (<button onClick={() => handleDeleteUser(u.id, u.full_name)} className="text-rose-600 hover:text-rose-800 text-xs font-bold flex items-center justify-center p-1.5 bg-rose-50 hover:bg-rose-100 rounded transition" title="מחיקת משתמש"><Trash2 className="w-4 h-4"/></button>)}
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
                    <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">שם הפרויקט</label><input type="text" required value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} className="w-full rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition bg-white" /></div>
                    <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">קוד / מספר פרויקט (אופציונלי)</label><input type="text" value={newProjectCode} onChange={(e) => setNewProjectCode(e.target.value)} className="w-full rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition bg-white" /></div>
                    <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">סטטוס פרויקט</label><select value={newProjectStatus} onChange={(e) => setNewProjectStatus(e.target.value as 'פעיל' | 'עתידי')} className="w-full rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition bg-white"><option value="פעיל">פעיל</option><option value="עתידי">עתידי (בצנרת)</option></select></div>
                    {newProjectStatus === 'פעיל' ? (
                       <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">מהנדס אחראי (חובה)</label><input type="text" required list="eng-list-new" value={newProjectAssignedEngineer} onChange={(e) => setNewProjectAssignedEngineer(e.target.value)} className="w-full rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition bg-white" placeholder="בחר מהנדס..." /><datalist id="eng-list-new">{activeEngineers.map(eng => <option key={eng} value={eng} />)}</datalist></div>
                    ) : (
                       <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">מהנדס אחראי</label><input type="text" disabled value="ללא (פרויקט בצנרת)" className="w-full rounded-md border-slate-200 p-2.5 text-sm border outline-none bg-slate-100 text-slate-400 cursor-not-allowed" /></div>
                    )}
                    <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">סה"כ בניינים</label><input type="number" value={newProjectBuildingsCount} onChange={(e) => setNewProjectBuildingsCount(e.target.value === '' ? '' : Number(e.target.value))} className="w-full rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition bg-white" min="0" /></div>
                    <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">סה"כ דירות</label><input type="number" value={newProjectAptCount} onChange={(e) => setNewProjectAptCount(e.target.value === '' ? '' : Number(e.target.value))} className="w-full rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition bg-white" min="0" /></div>
                    <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">כמות טיפוסי אב</label><input type="number" value={newProjectParentTypologies} onChange={(e) => setNewProjectParentTypologies(e.target.value === '' ? '' : Number(e.target.value))} className="w-full rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition bg-white" min="0" /></div>
                    <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">כמות תתי-טיפוס</label><input type="number" value={newProjectSubTypologies} onChange={(e) => setNewProjectSubTypologies(e.target.value === '' ? '' : Number(e.target.value))} className="w-full rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition bg-white" min="0" /></div>

                    <div className="md:col-span-4 flex justify-end pt-4 border-t border-slate-100 mt-2">
                      <button type="submit" disabled={projectFormLoading} className="px-6 py-2.5 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition shadow-sm text-sm disabled:bg-slate-300">הקמת הפרויקט</button>
                    </div>
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
                            <th className="p-3">שם הפרויקט</th><th className="p-3 w-32">סטטוס</th><th className="p-3 w-40">מהנדס אחראי</th><th className="p-3 text-center w-20" title="בניינים">בניינים</th><th className="p-3 text-center w-20" title="דירות">דירות</th><th className="p-3 text-center w-20" title="טיפוסי אב">ט.אב</th><th className="p-3 text-center w-20" title="תתי טיפוס">ת.טיפוס</th><th className="p-3 text-center w-28">פעולות עריכה</th>
                          </tr>
                        </thead>
                        <tbody className="text-sm divide-y divide-slate-100">
                          {displayedAdminProjects.map(p => (
                             <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                               {editingProjectId === p.id ? (
                                 <>
                                   <td className="p-2 bg-blue-50/50"><input type="text" required value={editProjName} onChange={e => setEditProjName(e.target.value)} className="border-slate-300 p-2 rounded text-sm w-full outline-none focus:border-blue-500 border shadow-sm font-bold text-blue-800" /></td>
                                   <td className="p-2 bg-blue-50/50"><select value={editProjStatus} onChange={e => setEditProjStatus(e.target.value as any)} className="border-slate-300 p-2 rounded text-xs w-full outline-none focus:border-blue-500 bg-white border shadow-sm"><option value="פעיל">פעיל</option><option value="עתידי">עתידי (בצנרת)</option><option value="ארכיון">לא פעיל (ארכיון)</option></select></td>
                                   <td className="p-2 bg-blue-50/50"><select disabled={editProjStatus !== 'פעיל'} value={editProjEngineer} onChange={e => setEditProjEngineer(e.target.value)} className="border-slate-300 p-2 rounded text-xs w-full outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400 bg-white border shadow-sm"><option value="">ללא שיוך</option>{activeEngineers.map(eng => (<option key={eng} value={eng}>{eng}</option>))}</select></td>
                                   <td className="p-2 bg-blue-50/50"><input type="number" min="0" value={editProjBuildings} onChange={e => setEditProjBuildings(e.target.value === '' ? '' : Number(e.target.value))} className="border-slate-300 p-1.5 rounded text-sm w-full text-center outline-none focus:border-blue-500 border shadow-sm" /></td>
                                   <td className="p-2 bg-blue-50/50"><input type="number" min="0" value={editProjApts} onChange={e => setEditProjApts(e.target.value === '' ? '' : Number(e.target.value))} className="border-slate-300 p-1.5 rounded text-sm w-full text-center outline-none focus:border-blue-500 border shadow-sm" /></td>
                                   <td className="p-2 bg-blue-50/50"><input type="number" min="0" value={editProjParentTypes} onChange={e => setEditProjParentTypes(e.target.value === '' ? '' : Number(e.target.value))} className="border-slate-300 p-1.5 rounded text-sm w-full text-center outline-none focus:border-blue-500 border shadow-sm" /></td>
                                   <td className="p-2 bg-blue-50/50"><input type="number" min="0" value={editProjSubTypes} onChange={e => setEditProjSubTypes(e.target.value === '' ? '' : Number(e.target.value))} className="border-slate-300 p-1.5 rounded text-sm w-full text-center outline-none focus:border-blue-500 border shadow-sm" /></td>
                                   <td className="p-2 bg-blue-50/50">
                                      <div className="flex justify-center gap-1.5"><button onClick={() => saveEditProject(p)} disabled={projectFormLoading} className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1.5 rounded text-[11px] font-bold transition shadow-sm">שמור</button><button onClick={() => setEditingProjectId(null)} className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-2 py-1.5 rounded text-[11px] font-bold transition shadow-sm">ביטול</button></div>
                                   </td>
                                 </>
                               ) : (
                                 <>
                                   <td className="p-3 font-bold text-slate-800 truncate max-w-[150px]" title={p.project_name}>{p.project_name}</td>
                                   <td className="p-3"><span className={`px-2 py-0.5 rounded text-[11px] font-bold ${p.status === 'פעיל' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200/50' : p.status === 'עתידי' ? 'bg-amber-100 text-amber-700 border border-amber-200/50' : 'bg-slate-200 text-slate-600 border border-slate-300/50'}`}>{p.status}</span></td>
                                   <td className="p-3 text-slate-600">{p.assigned_engineer || <span className="text-slate-400 italic">-</span>}</td>
                                   <td className="p-3 text-center text-slate-600">{p.buildings_count ?? <span className="text-slate-300">-</span>}</td>
                                   <td className="p-3 text-center text-slate-600">{p.apartments_count ?? <span className="text-slate-300">-</span>}</td>
                                   <td className="p-3 text-center text-slate-600">{p.parent_typologies_count ?? <span className="text-slate-300">-</span>}</td>
                                   <td className="p-3 text-center text-slate-600">{p.sub_typologies_count ?? <span className="text-slate-300">-</span>}</td>
                                   <td className="p-3 text-center">
                                      <div className="flex justify-center items-center gap-2">
                                        <button onClick={() => startEditProject(p)} className="text-blue-600 hover:text-blue-800 text-xs font-bold flex items-center justify-center p-1.5 bg-blue-50 hover:bg-blue-100 rounded transition" title="עריכת פרויקט"><Edit2 className="w-4 h-4"/></button>
                                        <button onClick={() => handleDeleteProject(p.id, p.project_name)} className="text-rose-600 hover:text-rose-800 text-xs font-bold flex items-center justify-center p-1.5 bg-rose-50 hover:bg-rose-100 rounded transition" title="מחיקת פרויקט"><Trash2 className="w-4 h-4"/></button>
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
          )}

          {/* TAB CONTENT: NEW REPORT FORM */}
          {currentTab === 'reports' && showReportForm && (
             <form onSubmit={handleReportSubmit} className="bg-white p-6 rounded-md shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-5 transition-all text-slate-800 mb-6">
              <div className="md:col-span-3 border-b border-slate-100 pb-3 mb-1"><h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Plus className="w-5 h-5 text-blue-600" /> דיווח שעות עבודה</h2></div>
              <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">תאריך ביצוע</label><input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="w-full rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition" /></div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">מבצע הפעולה</label>
                {(currentUserRole === 'manager' || currentUserRole === 'department_manager') ? (
                  <select required value={engineerName} onChange={(e) => setEngineerName(e.target.value)} className="w-full rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition bg-white">
                    {activeEngineers.map((eng) => (<option key={eng} value={eng}>{eng}</option>))}
                  </select>
                ) : (
                  <input type="text" disabled value={engineerName} className="w-full bg-slate-50 rounded-md border-slate-200 p-2.5 text-sm border outline-none text-slate-400 cursor-not-allowed" />
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">שיוך פרויקט</label>
                <select required value={projectName} onChange={(e) => {
                    const newProject = e.target.value; setProjectName(newProject); setStage(''); setSubStage(''); 
                    if (newProject.includes('תקורות חברה')) {
                      const hachsharaExists = stagesList.find(s => s.stage_name === 'הכשרה');
                      if (hachsharaExists) setStage('הכשרה');
                    }
                  }} className="w-full rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition bg-white">
                  <option value="" disabled>בחר מפרויקטים פעילים...</option>
                  {activeProjectsList.map((project) => (<option key={project.id} value={project.project_name}>{getProjectDisplayName(project, project.project_name)}</option>))}
                </select>
              </div>
              <div className={`${!projectName ? 'opacity-50 pointer-events-none' : ''}`}>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">שלב הנדסי (ראשי)</label>
                <select required value={stage} onChange={(e) => { setStage(e.target.value); setSubStage(''); }} className="w-full rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition bg-white">
                  <option value="" disabled>בחר שלב הנדסי...</option>
                  {availableStages.map((s) => (<option key={s.id} value={s.stage_name}>{s.stage_name}</option>))}
                </select>
              </div>
              {isSubStageRequired && (
                 <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                   <label className="block text-xs font-bold text-blue-600 uppercase tracking-wider mb-1.5">תת-שלב מפורט (חובה)</label>
                   <select required value={subStage} onChange={(e) => setSubStage(e.target.value)} className="w-full rounded-md border-blue-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition bg-blue-50/30 text-blue-900">
                     <option value="" disabled>בחר תת-שלב...</option>
                     {availableSubStages.map((s) => (<option key={s.id} value={s.sub_stage_name}>{s.sub_stage_name}</option>))}
                   </select>
                 </div>
              )}
              <div className={!isSubStageRequired ? "md:col-span-1" : "md:col-span-3"}><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">היקף מדווח</label><select value={scope} onChange={(e) => setScope(e.target.value)} className="w-full rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition bg-white"><option value="יום מלא">יום מלא (1.0)</option><option value="חצי יום">חצי יום (0.5)</option></select></div>
              <div className="md:col-span-3"><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">הערות / פירוט פעילות</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition" placeholder="פרט כאן על העבודה שבוצעה..." /></div>
              <div className="md:col-span-3 flex justify-end pt-2"><button type="submit" disabled={formLoading} className="px-6 py-2.5 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition shadow-sm text-sm disabled:bg-slate-300 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> שמירת נתונים</button></div>
            </form>
          )}

          {/* TAB CONTENT: REPORTS FILTER & TABLE */}
          {currentTab === 'reports' && !showReportForm && (
            <form onSubmit={handleFilterSubmit} className="bg-white p-4 rounded-md shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-end text-slate-800 mb-6">
              <div className="flex-1 w-full"><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">חודש חתך</label><input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="w-full rounded-md border-slate-300 p-2 text-sm border focus:border-blue-500 outline-none transition" /></div>
              <div className="flex-1 w-full">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">מהנדס</label>
                <input type="text" list={(currentUserRole === 'manager' || currentUserRole === 'department_manager') ? "engineers-list" : undefined} placeholder={(currentUserRole === 'manager' || currentUserRole === 'department_manager') ? "חיפוש חופשי..." : ""} value={filterEngineer} onChange={(e) => setFilterEngineer(e.target.value)} disabled={currentUserRole === 'basic'} className={`w-full rounded-md p-2 text-sm border focus:border-blue-500 outline-none transition ${currentUserRole === 'basic' ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed' : 'bg-white border-slate-300'}`} />
                {(currentUserRole === 'manager' || currentUserRole === 'department_manager') && (<datalist id="engineers-list">{activeEngineers.map(eng => <option key={eng} value={eng} />)}</datalist>)}
              </div>
              <div className="flex-1 w-full">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">פרויקט</label>
                <input type="text" list="projects-list" placeholder="חיפוש חופשי..." value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="w-full rounded-md border-slate-300 p-2 text-sm border focus:border-blue-500 outline-none transition bg-white" />
                <datalist id="projects-list">{allProjectsList.map(proj => (<option key={proj.id} value={getProjectDisplayName(proj, proj.project_name)} />))}</datalist>
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                <button type="submit" disabled={isFiltering} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2 bg-slate-800 text-white rounded-md font-medium hover:bg-slate-700 transition text-sm disabled:bg-slate-400"><Search className="w-4 h-4" /> סנן</button>
                <button type="button" onClick={clearFilters} className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-white border border-slate-300 text-slate-600 rounded-md font-medium hover:bg-slate-50 transition text-sm"><X className="w-4 h-4" /> נקה</button>
              </div>
            </form>
          )}

          {currentTab === 'reports' && !showReportForm && (
            <div className="text-slate-800">
              {displayedReports.length > 0 && (
                <div className="bg-slate-800 border border-slate-700 text-white p-5 rounded-md flex justify-between items-center shadow-md mb-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-slate-700 p-2 rounded"><CheckCircle2 className="w-6 h-6 text-emerald-400" /></div>
                    <div>
                      <span className="block font-bold text-lg tracking-wide">סיכום ימים בתצוגה</span>
                      <span className="text-sm text-slate-400">{filterMonth ? `חתך זמן: ${filterMonth} ${displayDateRange}` : 'תצוגת נתונים מלאה'}</span>
                    </div>
                  </div>
                  <div className="text-left border-l border-slate-600 pl-5"><span className="block text-3xl font-black text-white leading-none">{totalDaysCurrentView}</span><span className="text-xs font-bold text-emerald-400 uppercase tracking-widest mt-1 block">ימי עבודה סה״כ</span></div>
                </div>
              )}
              <div className="bg-white rounded-md shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
                 <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-bold">
                        <th className="p-4 flex items-center gap-1.5"><Calendar className="w-4 h-4" /> תאריך</th>
                        <th className="p-4 text-slate-700 relative">
                          <div className="flex items-center gap-1.5 cursor-pointer hover:text-blue-600 transition" onClick={() => setShowEngMenu(!showEngMenu)}>
                            <HardHat className="w-4 h-4" /> מהנדס <Filter className={`w-3.5 h-3.5 ${colFilterEngineers !== null ? 'text-blue-600 fill-blue-100' : 'text-slate-400'}`} />
                          </div>
                          {showEngMenu && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setShowEngMenu(false)}></div>
                              <div className="absolute top-12 right-4 w-56 bg-white border border-slate-200 shadow-xl rounded-md z-50 p-3 max-h-72 overflow-y-auto text-sm font-normal">
                                <div className="font-bold text-slate-800 mb-2 border-b pb-1">סינון לפי מהנדס:</div>
                                {uniqueEngsInReports.map(eng => (
                                  <label key={eng} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 cursor-pointer rounded">
                                    <input type="checkbox" checked={colFilterEngineers === null || colFilterEngineers.includes(eng)}
                                      onChange={() => {
                                        if (colFilterEngineers === null) setColFilterEngineers(uniqueEngsInReports.filter(x => x !== eng));
                                        else {
                                          if (colFilterEngineers.includes(eng)) setColFilterEngineers(colFilterEngineers.filter(x => x !== eng));
                                          else {
                                            const newSet = [...colFilterEngineers, eng];
                                            if (newSet.length === uniqueEngsInReports.length) setColFilterEngineers(null);
                                            else setColFilterEngineers(newSet);
                                          }
                                        }
                                      }} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-slate-700">{eng}</span>
                                  </label>
                                ))}
                                <div className="pt-2 mt-2 border-t flex justify-between gap-2"><button onClick={() => setColFilterEngineers(null)} className="text-xs font-bold text-blue-600 hover:underline">בחר הכל</button><button onClick={() => setColFilterEngineers([])} className="text-xs text-slate-500 hover:underline">נקה הכל</button></div>
                              </div>
                            </>
                          )}
                        </th>
                        <th className="p-4 text-slate-700 relative">
                          <div className="flex items-center gap-1.5 cursor-pointer hover:text-blue-600 transition" onClick={() => setShowProjMenu(!showProjMenu)}>
                            <Building2 className="w-4 h-4" /> פרויקט מדווח <Filter className={`w-3.5 h-3.5 ${colFilterProjects !== null ? 'text-blue-600 fill-blue-100' : 'text-slate-400'}`} />
                          </div>
                          {showProjMenu && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setShowProjMenu(false)}></div>
                              <div className="absolute top-12 right-4 w-64 bg-white border border-slate-200 shadow-xl rounded-md z-50 p-3 max-h-72 overflow-y-auto text-sm font-normal">
                                <div className="font-bold text-slate-800 mb-2 border-b pb-1">סינון לפי פרויקט:</div>
                                {uniqueProjsInReports.map(proj => (
                                  <label key={proj} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 cursor-pointer rounded">
                                    <input type="checkbox" checked={colFilterProjects === null || colFilterProjects.includes(proj)}
                                      onChange={() => {
                                        if (colFilterProjects === null) setColFilterProjects(uniqueProjsInReports.filter(x => x !== proj));
                                        else {
                                          if (colFilterProjects.includes(proj)) setColFilterProjects(colFilterProjects.filter(x => x !== proj));
                                          else {
                                            const newSet = [...colFilterProjects, proj];
                                            if (newSet.length === uniqueProjsInReports.length) setColFilterProjects(null);
                                            else setColFilterProjects(newSet);
                                          }
                                        }
                                      }} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-slate-700 truncate" title={proj}>{proj}</span>
                                  </label>
                                ))}
                                <div className="pt-2 mt-2 border-t flex justify-between gap-2"><button onClick={() => setColFilterProjects(null)} className="text-xs font-bold text-blue-600 hover:underline">בחר הכל</button><button onClick={() => setColFilterProjects([])} className="text-xs text-slate-500 hover:underline">נקה הכל</button></div>
                              </div>
                            </>
                          )}
                        </th>
                        <th className="p-4"><div className="flex items-center gap-1.5"><Layers className="w-4 h-4" /> שלב פעילות</div></th>
                        <th className="p-4"><div className="flex items-center gap-1.5"><FileText className="w-4 h-4" /> הערות</div></th>
                        <th className="p-4"><div className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> משרה</div></th>
                        {(currentUserRole === 'manager' || currentUserRole === 'department_manager') && (
                          <th className="p-4 text-center w-48">פעולות מערכת</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {displayedReports.map((report) => (
                        <tr key={report.id} className="hover:bg-blue-50/30 transition">
                          <td className="p-4 text-slate-500 whitespace-nowrap font-mono text-xs">{formatDate(report.report_date)}</td>
                          <td className="p-4 font-bold text-slate-800">{report.engineer_name}</td>
                          <td className="p-4 text-slate-700 font-medium">{getProjectDisplayName(null, report.project_name)}</td>
                          <td className="p-4">
                            <div className="flex flex-col gap-1.5">
                              <span className="inline-block bg-slate-100 text-slate-600 text-xs px-2.5 py-1 rounded border border-slate-200 font-bold w-fit">{report.stage}</span>
                              {report.sub_stage && (<span className="text-[11px] text-slate-500 pr-1 truncate font-medium">↳ {report.sub_stage}</span>)}
                            </div>
                          </td>
                          <td className="p-4 text-slate-600 text-[13px] max-w-[200px] break-words whitespace-normal">{report.notes ? report.notes : <span className="text-slate-300">-</span>}</td>
                          <td className="p-4"><span className="inline-block bg-emerald-50 text-emerald-700 text-xs px-2.5 py-1 rounded font-bold border border-emerald-200/50">{report.scope}</span></td>
                          {(currentUserRole === 'manager' || currentUserRole === 'department_manager') && (
                            <td className="p-4">
                              <div className="flex items-center justify-center gap-2">
                                <button onClick={() => openEditModal(report)} className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white text-slate-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 rounded border border-slate-200 font-medium transition-all shadow-sm text-xs"><Edit2 className="w-3.5 h-3.5" /> עריכה</button>
                                <button onClick={() => handleDelete(report.id)} className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 rounded border border-slate-200 font-medium transition-all shadow-sm text-xs"><Trash2 className="w-3.5 h-3.5" /> מחיקה</button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                      {displayedReports.length === 0 && <tr><td colSpan={currentUserRole === 'manager' || currentUserRole === 'department_manager' ? 7 : 6} className="p-12 text-center text-slate-400 flex flex-col items-center gap-3"><Search className="w-8 h-8 opacity-20" /> לא קיימים דיווחים התואמים לסינון הנוכחי.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB CONTENT: DASHBOARD */}
          {currentTab === 'dashboard' && (currentUserRole === 'department_manager' || currentUserRole === 'manager') && (
            <>
              {currentUserRole === 'department_manager' && (
                <div className="flex justify-end mb-4"><button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-5 py-2.5 rounded-md font-bold hover:bg-slate-700 transition shadow-md"><Printer className="w-5 h-5" /> הפק דו"ח PDF</button></div>
              )}
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
            </>
          )}

          {/* TAB CONTENT: COSTS */}
          {currentTab === 'costs' && currentUserRole === 'department_manager' && (
            <div className="space-y-6 text-slate-800">
              {!isCompareMode && (
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    <div className="flex bg-slate-200/50 rounded-md p-1 border border-slate-200 overflow-x-auto w-full sm:w-auto">
                      <button onClick={() => handleCostSubTabChange('monthly')} className={`px-5 py-2 text-sm font-semibold rounded transition whitespace-nowrap ${costSubTab === 'monthly' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>חתך חודשי</button>
                      <button onClick={() => handleCostSubTabChange('active')} className={`px-5 py-2 text-sm font-semibold rounded transition whitespace-nowrap ${costSubTab === 'active' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>פרויקטים פעילים (מצטבר)</button>
                      <button onClick={() => handleCostSubTabChange('inactive')} className={`px-5 py-2 text-sm font-semibold rounded transition whitespace-nowrap ${costSubTab === 'inactive' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>ארכיון פרויקטים (מצטבר)</button>
                    </div>

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
                  </div>
                  {costSubTab !== 'monthly' && (
                    <button onClick={() => { setIsCompareMode(true); setCompareSelected([]); }} className="flex items-center justify-center w-full md:w-auto gap-2 px-5 py-2 bg-slate-800 text-white rounded-md font-bold hover:bg-slate-700 transition shadow-md text-sm"><BarChart3 className="w-4 h-4"/> השוואת פרויקטים</button>
                  )}
                </div>
              )}

              {isCompareMode ? (
                <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                  <div className="flex justify-between items-center bg-white p-4 rounded-md shadow-sm border border-slate-200 border-l-4 border-l-blue-600">
                     <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-blue-500" /> מודול השוואת פרויקטים</h2>
                     <button onClick={() => setIsCompareMode(false)} className="text-sm font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition"><X className="w-4 h-4"/> חזור לתצוגה רגילה</button>
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
                              {compareGenMode === 'gen1' ? (
                                 <>
                                    <tr>
                                       <td className="p-3 font-bold text-slate-700 bg-slate-50/50 border-l border-slate-200">כמות דירות</td>
                                       {compareSelected.map(pName => {
                                          const p = displayedCostData.find(x => x.name === pName);
                                          return <td key={pName} className="p-3 font-medium text-slate-700 border-r border-slate-100">{p?.stats?.apartments_count || '-'}</td>
                                       })}
                                    </tr>
                                    <tr>
                                       <td className="p-3 font-bold text-slate-700 bg-slate-50/50 border-l border-slate-200">כמות טיפוסים</td>
                                       {compareSelected.map(pName => {
                                          const p = displayedCostData.find(x => x.name === pName);
                                          return <td key={pName} className="p-3 font-medium text-slate-700 border-r border-slate-100">{p?.stats?.typologies_count || '-'}</td>
                                       })}
                                    </tr>
                                    <tr>
                                       <td className="p-3 font-bold text-emerald-800 bg-emerald-100/50 border-l border-slate-200">עלות VDC לטיפוס</td>
                                       {compareSelected.map(pName => {
                                          const p = displayedCostData.find(x => x.name === pName);
                                          let vdcCost = null;
                                          if (p && p.stats && p.stats.typologies_count && p.stats.typologies_count > 0) {
                                             const std = p.stages?.find((s:any) => s.name === 'סטנדרט')?.cost || 0;
                                             const stdFix = p.stages?.find((s:any) => s.name === 'תיקוני סטנדרט')?.cost || 0;
                                             vdcCost = (std + stdFix) / p.stats.typologies_count;
                                          }
                                          return <td key={pName} className="p-3 font-black text-emerald-700 border-r border-slate-100 bg-emerald-50/30">{vdcCost !== null ? `₪ ${Math.round(vdcCost).toLocaleString()}` : '-'}</td>
                                       })}
                                    </tr>
                                    <tr>
                                       <td className="p-3 font-bold text-purple-800 bg-purple-100/50 border-l border-slate-200">עלות VDC לדירה</td>
                                       {compareSelected.map(pName => {
                                          const p = displayedCostData.find(x => x.name === pName);
                                          let aptCost = null;
                                          if (p && p.stats && p.stats.apartments_count && p.stats.apartments_count > 0 && p.totalCost) { 
                                              aptCost = p.totalCost / p.stats.apartments_count; 
                                          }
                                          return <td key={pName} className="p-3 font-black text-purple-700 border-r border-slate-100 bg-purple-50/30">{aptCost !== null ? `₪ ${Math.round(aptCost).toLocaleString()}` : '-'}</td>
                                       })}
                                    </tr>
                                 </>
                              ) : (
                                 <>
                                    <tr>
                                       <td className="p-3 font-bold text-slate-700 bg-slate-50/50 border-l border-slate-200">כמות דירות</td>
                                       {compareSelected.map(pName => {
                                          const p = displayedCostData.find(x => x.name === pName);
                                          return <td key={pName} className="p-3 font-medium text-slate-700 border-r border-slate-100">{p?.stats?.apartments_count || '-'}</td>
                                       })}
                                    </tr>
                                    <tr>
                                       <td className="p-3 font-bold text-slate-700 bg-slate-50/50 border-l border-slate-200">טיפוסי אב</td>
                                       {compareSelected.map(pName => {
                                          const p = displayedCostData.find(x => x.name === pName);
                                          return <td key={pName} className="p-3 font-medium text-slate-700 border-r border-slate-100">{p?.stats?.parent_typologies_count || '-'}</td>
                                       })}
                                    </tr>
                                    <tr>
                                       <td className="p-3 font-bold text-slate-700 bg-slate-50/50 border-l border-slate-200">תתי-טיפוס</td>
                                       {compareSelected.map(pName => {
                                          const p = displayedCostData.find(x => x.name === pName);
                                          return <td key={pName} className="p-3 font-medium text-slate-700 border-r border-slate-100">{p?.stats?.sub_typologies_count || '-'}</td>
                                       })}
                                    </tr>
                                    <tr>
                                       <td className="p-3 font-bold text-emerald-800 bg-emerald-100/50 border-l border-slate-200">עלות VDC לטיפוס אב</td>
                                       {compareSelected.map(pName => {
                                          const p = displayedCostData.find(x => x.name === pName);
                                          let cost = null;
                                          if (p && p.stats && p.stats.parent_typologies_count && p.stats.parent_typologies_count > 0) {
                                             const std = p.stages?.find((s:any) => s.name === 'סטנדרט')?.cost || 0;
                                             cost = std / p.stats.parent_typologies_count;
                                          }
                                          return <td key={pName} className="p-3 font-black text-emerald-700 border-r border-slate-100 bg-emerald-50/30">{cost !== null ? `₪ ${Math.round(cost).toLocaleString()}` : '-'}</td>
                                       })}
                                    </tr>
                                    <tr>
                                       <td className="p-3 font-bold text-emerald-800 bg-emerald-100/50 border-l border-slate-200">עלות VDC לתת-טיפוס</td>
                                       {compareSelected.map(pName => {
                                          const p = displayedCostData.find(x => x.name === pName);
                                          let cost = null;
                                          if (p && p.stats && p.stats.sub_typologies_count && p.stats.sub_typologies_count > 0) {
                                             const stdSubTypes = p.stages?.find((s:any) => s.name === 'סטנדרט - תתי טיפוס')?.cost || 0;
                                             cost = stdSubTypes / p.stats.sub_typologies_count;
                                          }
                                          return <td key={pName} className="p-3 font-black text-emerald-700 border-r border-slate-100 bg-emerald-50/30">{cost !== null ? `₪ ${Math.round(cost).toLocaleString()}` : '-'}</td>
                                       })}
                                    </tr>
                                    <tr>
                                       <td className="p-3 font-bold text-purple-800 bg-purple-100/50 border-l border-slate-200">עלות VDC לדירה</td>
                                       {compareSelected.map(pName => {
                                          const p = displayedCostData.find(x => x.name === pName);
                                          let aptCost = null;
                                          if (p && p.stats && p.stats.apartments_count && p.stats.apartments_count > 0 && p.totalCost) { 
                                              aptCost = p.totalCost / p.stats.apartments_count; 
                                          }
                                          return <td key={pName} className="p-3 font-black text-purple-700 border-r border-slate-100 bg-purple-50/30">{aptCost !== null ? `₪ ${Math.round(aptCost).toLocaleString()}` : '-'}</td>
                                       })}
                                    </tr>
                                 </>
                              )}
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
              ) : (
                <>
                  <div className="bg-slate-800 text-slate-300 p-5 rounded-md shadow-sm border border-slate-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <h3 className="font-bold text-white flex items-center gap-2 text-base"><Info className="w-4 h-4 text-blue-400" /> מודל תמחור היררכי</h3>
                      <div className="text-sm mt-1.5 space-y-0.5">
                        <p>• <strong>בסיס עלות:</strong> {assumptions.vdc_engineer_monthly_cost.toLocaleString()} ₪ / משרה מלאה (חודשי).</p>
                        <p>• <strong>תקופת דיווח נוכחית:</strong> מחזור החיוב נסגר ב-23 לכל חודש (החל מאוגוסט 2026).</p>
                        <p>• <strong>חישוב עלות יומית:</strong> חודשים שהסתיימו מחושבים לפי ימי דיווח בפועל (True-up). החודש הנוכחי מחושב יחסית ל-{assumptions.standard_working_days} ימי עבודה.</p>
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const gen2Projects = displayedCostData.filter(p => p.stats?.has_sub_stages);
                    const gen1Projects = displayedCostData.filter(p => !p.stats?.has_sub_stages);

                    const renderProjectCard = (project: any, idx: number) => {
                      const isExpanded = costSubTab === 'monthly' || expandedProjects.includes(project.name);

                      let vdcCostPerTypology = null; let vdcCostPerParentTypology = null; let vdcCostPerSubTypology = null; let costPerApartment = null;
                      
                      if (costSubTab !== 'monthly') {
                         if (project.stats?.apartments_count > 0) costPerApartment = project.totalCost / project.stats.apartments_count;

                         const standardStage = project.stages.find((s: any) => s.name === 'סטנדרט');
                         const standardFixesStage = project.stages.find((s: any) => s.name === 'תיקוני סטנדרט');
                         const standardSubTypesStage = project.stages.find((s: any) => s.name === 'סטנדרט - תתי טיפוס');
                         
                         if (!project.stats?.has_sub_stages && project.stats?.typologies_count > 0) {
                           const standardCost = standardStage ? standardStage.cost : 0; const standardFixesCost = standardFixesStage ? standardFixesStage.cost : 0;
                           vdcCostPerTypology = (standardCost + standardFixesCost) / project.stats.typologies_count;
                         } else if (project.stats?.has_sub_stages) {
                           if (project.stats?.parent_typologies_count > 0) {
                              const standardCost = standardStage ? standardStage.cost : 0;
                              vdcCostPerParentTypology = standardCost / project.stats.parent_typologies_count;
                           }
                           if (project.stats?.sub_typologies_count > 0) {
                              const standardSubTypesCost = standardSubTypesStage ? standardSubTypesStage.cost : 0;
                              vdcCostPerSubTypology = standardSubTypesCost / project.stats.sub_typologies_count;
                           }
                         }
                      }

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
                              <div className="mb-6 bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-start md:items-center">
                                <span className="text-sm font-bold text-slate-700">נתוני תכנון הפרויקט:</span>
                                <div className="flex flex-wrap gap-3">
                                  {(() => {
                                      const s = project.stats || {};
                                      const bldVal = s.buildings_count; const aptVal = s.apartments_count; const typVal = s.typologies_count; const pTypVal = s.parent_typologies_count; const sTypVal = s.sub_typologies_count;
                                      const hasBld = bldVal !== null && bldVal !== undefined && String(bldVal).trim() !== ''; const hasApt = aptVal !== null && aptVal !== undefined && String(aptVal).trim() !== ''; const hasTyp = typVal !== null && typVal !== undefined && String(typVal).trim() !== ''; const hasPTyp = pTypVal !== null && pTypVal !== undefined && String(pTypVal).trim() !== ''; const hasSTyp = sTypVal !== null && sTypVal !== undefined && String(sTypVal).trim() !== '';
                                      const hasAny = hasBld || hasApt || hasTyp || hasPTyp || hasSTyp;

                                      if (!hasAny) return <span className="text-sm text-slate-400 italic font-medium">לא נמצאו נתוני דירות/טיפוסים בשרת.</span>;

                                      return (
                                        <>
                                          {hasBld && (<span className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded border border-indigo-100 text-sm font-medium shadow-sm"><Building2 className="w-4 h-4" /> כמות בניינים: <strong className="text-indigo-900">{bldVal}</strong></span>)}
                                          {hasApt && (<span className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded border border-indigo-100 text-sm font-medium shadow-sm"><Building2 className="w-4 h-4" /> כמות דירות: <strong className="text-indigo-900">{aptVal}</strong></span>)}
                                          {s.has_sub_stages ? (
                                            <>
                                              {hasPTyp && (<span className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded border border-blue-100 text-sm font-medium shadow-sm"><Layers className="w-4 h-4" /> טיפוסי אב: <strong className="text-blue-900">{pTypVal}</strong></span>)}
                                              {hasSTyp && (<span className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded border border-blue-100 text-sm font-medium shadow-sm"><Layers className="w-4 h-4" /> תתי-טיפוס: <strong className="text-blue-900">{sTypVal}</strong></span>)}
                                              {vdcCostPerParentTypology !== null && costSubTab !== 'monthly' && (<span className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded border border-emerald-100 text-sm font-medium shadow-sm"><Wallet className="w-4 h-4" /> עלות VDC לטיפוס אב: <strong className="text-emerald-900">₪ {Math.round(vdcCostPerParentTypology).toLocaleString()}</strong></span>)}
                                              {vdcCostPerSubTypology !== null && costSubTab !== 'monthly' && (<span className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded border border-emerald-100 text-sm font-medium shadow-sm"><Wallet className="w-4 h-4" /> עלות VDC לתת-טיפוס: <strong className="text-emerald-900">₪ {Math.round(vdcCostPerSubTypology).toLocaleString()}</strong></span>)}
                                            </>
                                          ) : (
                                            <>
                                              {hasTyp && (<span className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded border border-blue-100 text-sm font-medium shadow-sm"><Layers className="w-4 h-4" /> כמות טיפוסים: <strong className="text-blue-900">{typVal}</strong></span>)}
                                              {vdcCostPerTypology !== null && costSubTab !== 'monthly' && (<span className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded border border-emerald-100 text-sm font-medium shadow-sm"><Wallet className="w-4 h-4" /> עלות VDC לטיפוס: <strong className="text-emerald-900">₪ {Math.round(vdcCostPerTypology).toLocaleString()}</strong></span>)}
                                            </>
                                          )}
                                          {costPerApartment !== null && costSubTab !== 'monthly' && (<span className="flex items-center gap-1.5 bg-purple-50 text-purple-700 px-3 py-1.5 rounded border border-purple-100 text-sm font-medium shadow-sm"><Wallet className="w-4 h-4" /> עלות VDC לדירה: <strong className="text-purple-900">₪ {Math.round(costPerApartment).toLocaleString()}</strong></span>)}
                                        </>
                                      );
                                  })()}
                                </div>
                              </div>

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
                    };

                    return (
                      <>
                        {gen2Projects.length > 0 && (
                          <div className="mb-8">
                            <h3 className="text-lg font-bold text-blue-700 mb-4 flex items-center gap-2 border-b-2 border-blue-100 pb-2"><Layers className="w-5 h-5" /> פרויקטים בתמחור מתקדם (דור 2)</h3>
                            <div className="flex flex-col gap-4">{gen2Projects.map((project, idx) => renderProjectCard(project, idx))}</div>
                          </div>
                        )}
                        {gen1Projects.length > 0 && (
                          <div>
                            <h3 className="text-lg font-bold text-slate-600 mb-4 flex items-center gap-2 border-b-2 border-slate-200 pb-2"><Building2 className="w-5 h-5" /> פרויקטים בתמחור בסיסי (דור 1)</h3>
                            <div className="flex flex-col gap-4">{gen1Projects.map((project, idx) => renderProjectCard(project, idx))}</div>
                          </div>
                        )}
                        {displayedCostData.length === 0 && (
                          <div className="col-span-full p-12 text-center text-slate-500 bg-white rounded-md border border-slate-200 flex flex-col items-center gap-3"><Info className="w-8 h-8 text-slate-300" /> אין נתונים להצגה התואמים לסינון הנבחר.</div>
                        )}
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* TAB CONTENT: TEAM ORG CHART (חסין למחיקה לעולמי עולמים) */}
          {currentTab === 'team' && (currentUserRole === 'department_manager' || currentUserRole === 'manager') && (
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
                        <CheckCircle2 className="w-6 h-6 opacity-20" />
                        אין פרויקטים פנויים
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Main Org Chart Area */}
              <div 
                className="flex-1 w-full bg-slate-900 p-8 rounded-3xl shadow-2xl border border-slate-800 overflow-x-auto relative scrollbar-thin"
                style={{
                  backgroundImage: `
                    linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)
                  `,
                  backgroundSize: '24px 24px'
                }}
              >
                
                <div className="min-w-max flex flex-col items-center pb-12">
                  
                  {/* Root Manager Card */}
                  <div 
                    onClick={(e) => { e.stopPropagation(); openEngineerDrawer(rootManager.full_name); }}
                    className="relative z-20 pointer-events-auto bg-emerald-950/40 border-2 border-emerald-500/50 p-5 rounded-xl shadow-lg flex flex-col items-center justify-center text-center w-[280px] cursor-pointer hover:scale-105 hover:shadow-2xl transition-transform"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <PenTool className="w-5 h-5 text-emerald-400 opacity-80" />
                      <div className="font-black text-xl text-emerald-400 tracking-tight whitespace-nowrap">{rootManager.full_name}</div>
                    </div>
                    <div className="text-[12px] font-bold text-emerald-300 uppercase tracking-widest mb-4 bg-emerald-900/50 border border-emerald-700/50 px-3 py-1 rounded shadow-inner whitespace-nowrap">
                      {rootManager.role}
                    </div>
                    <div className="flex flex-col gap-2 w-full pointer-events-none">
                      {rootProjects.map((proj, idx) => {
                        const match = proj.match(/(.*?)(?:\s*\((.*?)\))?$/);
                        const pName = match ? match[1].trim() : proj;
                        const pCode = match && match[2] ? `(${match[2]})` : null;
                        return (
                          <div key={idx} className="bg-emerald-950/80 border border-emerald-800 text-emerald-200 py-2 px-3 rounded shadow-inner w-full flex flex-col items-center">
                            <span className="text-xs font-bold leading-snug whitespace-normal break-words w-full text-center">{pName}</span>
                            {pCode && <span className="text-[10px] text-emerald-500/70 mt-1 font-mono">{pCode}</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  
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
                            <div className={`absolute -top-4 text-[11px] font-black px-3 py-1 rounded border shadow-sm uppercase tracking-wider whitespace-nowrap ${theme.tag}`}>
                              צוות {leader.full_name.split(' ')[0]}
                            </div>
                            
                            <OrgCard user={leader} projects={getProjectsForEngineer(leader.full_name)} colorData={theme} displayRole="מנהל VDC" />
                            
                            {teamMembers.length > 0 && (
                              <>
                                <div className={`w-1 h-8 my-3 rounded-none shadow-sm ${theme.line} pointer-events-none`}></div>
                                <div className="relative w-full min-w-max px-4">
                                  <div className={`absolute top-0 left-[25%] right-[25%] h-1 rounded-none shadow-sm ${theme.line} pointer-events-none`}></div>
                                  <div className="grid grid-cols-2 gap-8 pt-6 w-full">
                                    {teamMembers.map(eng => (
                                      <div key={eng.id} className="relative flex flex-col items-center">
                                        <div className={`absolute -top-6 w-1 h-6 rounded-none ${theme.line} pointer-events-none`}></div>
                                        <OrgCard user={eng} projects={getProjectsForEngineer(eng.full_name)} colorData={theme} displayRole="מהנדס/ת VDC" />
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
                          <div className="absolute -top-4 bg-slate-700 text-slate-300 text-[11px] font-black px-3 py-1 rounded border border-slate-600 shadow-sm uppercase tracking-wider whitespace-nowrap">
                            ניהול ישיר
                          </div>
                          
                          <div className="flex flex-col gap-6 mt-2">
                            {directEngineers.map(eng => (
                              <OrgCard key={eng.id} user={eng} projects={getProjectsForEngineer(eng.full_name)} colorData={defaultDirectColor} displayRole="מהנדס/ת VDC" />
                            ))}
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* GLOBAL MODALS */}
          {openMissingEng && currentTab === 'dashboard' && (
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

          {/* מודל עריכת דיווח צף (Modal) */}
          {editingReport && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-md shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 text-slate-800">
                <div className="bg-slate-800 p-4 border-b border-slate-700 flex justify-between items-center"><h2 className="text-lg font-bold text-white flex items-center gap-2"><Edit2 className="w-4 h-4 text-blue-400" /> עריכת רשומת דיווח</h2><button onClick={() => setEditingReport(null)} className="text-slate-400 hover:text-white transition"><X className="w-5 h-5" /></button></div>
                <form onSubmit={handleUpdateSubmit} className="p-6 space-y-4">
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">תאריך</label><input type="date" required value={editDate} onChange={(e) => setEditDate(e.target.value)} className="w-full rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition" /></div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">מהנדס</label>
                    <select required value={editEngineerName} onChange={(e) => setEditEngineerName(e.target.value)} className="w-full rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition bg-white">{activeEngineers.map((eng) => (<option key={eng} value={eng}>{eng}</option>))}</select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">פרויקט</label>
                    <select required value={editProject} onChange={(e) => { const newProject = e.target.value; setEditProject(newProject); setEditStage(''); setEditSubStage(''); if (newProject.includes('תקורות חברה')) { const hachsharaExists = stagesList.find(s => s.stage_name === 'הכשרה'); if (hachsharaExists) setEditStage('הכשרה'); } }} className="w-full rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition bg-white">
                      <option value="" disabled>בחר פרויקט...</option>
                      {allProjectsList.map((project) => (<option key={project.id} value={project.project_name}>{getProjectDisplayName(project, project.project_name)}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">שלב ביצוע ראשי</label>
                    <select required value={editStage} onChange={(e) => { setEditStage(e.target.value); setEditSubStage(''); }} className="w-full rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition bg-white">
                      <option value="" disabled>בחר שלב הנדסי...</option>
                      {availableEditStages.map((s) => (<option key={s.id} value={s.stage_name}>{s.stage_name}</option>))}
                      {editStage && !availableEditStages.find(s => s.stage_name === editStage) && (<option value={editStage}>{editStage} (היסטורי)</option>)}
                    </select>
                  </div>
                  {isEditSubStageRequired && (
                     <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                       <label className="block text-xs font-bold text-blue-600 uppercase tracking-wider mb-1.5">תת-שלב מפורט (חובה בפרויקט זה)</label>
                       <select required value={editSubStage} onChange={(e) => setSubStage(e.target.value)} className="w-full rounded-md border-blue-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition bg-blue-50/30 text-blue-900">
                         <option value="" disabled>בחר תת-שלב...</option>
                         {availableEditSubStages.map((s) => (<option key={s.id} value={s.sub_stage_name}>{s.sub_stage_name}</option>))}
                         {editSubStage && !availableEditSubStages.find(s => s.sub_stage_name === editSubStage) && (<option value={editSubStage}>{editSubStage} (היסטורי)</option>)}
                       </select>
                     </div>
                  )}
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">היקף משרה</label><select value={editScope} onChange={(e) => setEditScope(e.target.value)} className="w-full rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition bg-white"><option value="יום מלא">יום מלא</option><option value="חצי יום">חצי יום</option></select></div>
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">הערות</label><textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} className="w-full rounded-md border-slate-300 p-2.5 text-sm border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition" /></div>
                  <div className="flex justify-end gap-3 pt-5 border-t border-slate-100 mt-2"><button type="button" onClick={() => setEditingReport(null)} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-md font-medium hover:bg-slate-50 transition text-sm">ביטול</button><button type="submit" disabled={editLoading} className="px-5 py-2.5 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition shadow-sm text-sm">עדכן רשומה</button></div>
                </form>
              </div>
            </div>
          )}

          {/* מודל מרכזי: תיק מהנדס ופגישות סטאטוס */}
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
                               <form onSubmit={handleMeetingSubmit} className="p-6 md:p-8 space-y-6">
                                  <div className="w-1/3"><label className="block text-sm font-bold text-slate-600 mb-1.5">תאריך הפגישה</label><input type="date" required value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-md text-base text-slate-800 font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all bg-white" /></div>
                                  <div><label className="block text-sm font-bold text-slate-600 mb-1.5">1. סטטוס התקדמות לפי מלאכות</label><textarea required value={meetingProgress} onChange={(e) => setMeetingProgress(e.target.value)} rows={5} className="w-full p-3 border border-slate-300 rounded-md text-base text-slate-800 font-medium leading-relaxed outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-blue-50/30 transition-all" /></div>
                                  <div><label className="block text-sm font-bold text-slate-600 mb-1.5">2. חסמים מרכזיים</label><textarea value={meetingBottlenecks} onChange={(e) => setMeetingBottlenecks(e.target.value)} rows={4} className="w-full p-3 border border-slate-300 rounded-md text-base text-slate-800 font-medium leading-relaxed outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 bg-rose-50/30 transition-all" /></div>
                                  <div><label className="block text-sm font-bold text-slate-600 mb-1.5">3. מיקוד לשבוע הקרוב</label><textarea required value={meetingFocus} onChange={(e) => setMeetingFocus(e.target.value)} rows={4} className="w-full p-3 border border-slate-300 rounded-md text-base text-slate-800 font-medium leading-relaxed outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 bg-emerald-50/30 transition-all" /></div>
                                  <div><label className="block text-sm font-bold text-slate-600 mb-1.5">4. מעקב ממדלים (אם יש)</label><textarea value={meetingModelers} onChange={(e) => setMeetingModelers(e.target.value)} rows={3} className="w-full p-3 border border-slate-300 rounded-md text-base text-slate-800 font-medium leading-relaxed outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all bg-white" placeholder="אופציונלי..." /></div>
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

          {/* מודל וידוא מחיקה (Global Delete Confirmation) */}
          {deletePrompt.isOpen && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 text-slate-800 animate-in zoom-in-95 duration-200">
                <div className="bg-rose-600 p-4 flex items-center gap-3">
                  <AlertTriangle className="w-6 h-6 text-white" />
                  <h2 className="text-lg font-bold text-white">{deletePrompt.title}</h2>
                </div>
                <div className="p-6">
                  <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {deletePrompt.message}
                  </p>
                </div>
                <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end gap-3">
                  <button onClick={() => setDeletePrompt({ ...deletePrompt, isOpen: false })} className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-md font-medium hover:bg-slate-50 transition text-sm shadow-sm">
                    ביטול
                  </button>
                  <button onClick={confirmDelete} className="px-4 py-2 bg-rose-600 text-white rounded-md font-medium hover:bg-rose-700 transition text-sm shadow-sm">
                    כן, מחק לצמיתות
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </React.Fragment>
  );
}