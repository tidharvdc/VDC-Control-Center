// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../supabase'; 
import { Heebo } from 'next/font/google';

import { Building2, LogOut, Settings, Plus, List, ClipboardList, BarChart3, Wallet, Network, HardHat, X } from 'lucide-react';

import ReportsTab from './components/ReportsTab';
import DashboardTab from './components/DashboardTab';
import TeamTab from './components/TeamTab';
import CostsTab from './components/CostsTab';
import AdminTab from './components/AdminTab';
import WorkPlanTab from './components/WorkPlanTab';

import { AppUser, Project, WorkReport, WorkStage, WorkSubStage } from '../types';

const heebo = Heebo({ 
  subsets: ['hebrew', 'latin'],
  weight: ['300', '400', '500', '700', '800', '900'],
  display: 'swap',
});

export default function Home() {
  const router = useRouter();
  
  // --- Global States ---
  const [loading, setLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<'basic' | 'manager' | 'department_manager' | null>(null);
  const [engineerName, setEngineerName] = useState('');
  const [actualName, setActualName] = useState('');
  
  // --- Global Data ---
  const [orgUsers, setOrgUsers] = useState<AppUser[]>([]);
  const [activeProjectsList, setActiveProjectsList] = useState<Project[]>([]);
  const [allProjectsList, setAllProjectsList] = useState<Project[]>([]);
  const [stagesList, setStagesList] = useState<WorkStage[]>([]);
  const [subStagesList, setSubStagesList] = useState<WorkSubStage[]>([]);
  const [assumptions, setAssumptions] = useState({ vdc_engineer_monthly_cost: 30000, standard_working_days: 22 });
  
  // --- Navigation ---
  const [currentTab, setCurrentTab] = useState<'reports' | 'dashboard' | 'costs' | 'team' | 'admin' | 'work_plan'>('reports');
  const [showReportForm, setShowReportForm] = useState(false);

  const fetchCoreData = async () => {
    const [
      { data: activeProjects },
      { data: allProjects },
      { data: usersData },
      { data: assumData },
      { data: dbStages },
      { data: dbSubStages }
    ] = await Promise.all([
      supabase.from('projects').select('*').eq('status', 'פעיל').order('project_name'),
      supabase.from('projects').select('*').order('project_name'),
      supabase.from('app_users').select('id, full_name, role, manager_name').order('full_name'),
      supabase.from('system_assumptions').select('*').eq('parameter_key', 'vdc_engineer_monthly_cost').single(),
      supabase.from('work_stages').select('*').order('id'),
      supabase.from('work_sub_stages').select('*').order('id')
    ]);

    if (activeProjects) setActiveProjectsList(activeProjects);
    if (allProjects) setAllProjectsList(allProjects);
    if (usersData) setOrgUsers(usersData);
    if (assumData) setAssumptions(prev => ({ ...prev, vdc_engineer_monthly_cost: Number(assumData.parameter_value) }));
    if (dbStages) setStagesList(dbStages);
    if (dbSubStages) setSubStagesList(dbSubStages);
  };

  useEffect(() => {
    let isMounted = true;

    const initializeApp = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      const { data: profile } = await supabase.from('app_users').select('role, full_name, manager_name').eq('id', session.user.id).single();
      if (!isMounted) return;

      if (profile) { 
        setCurrentUserRole(profile.role as any); 
        setActualName(profile.full_name);
        setEngineerName(profile.full_name); 
        if (profile.role === 'manager' || profile.role === 'department_manager') {
          setCurrentTab('team');
        }
      }

      await fetchCoreData();
      if (!isMounted) return;
      setLoading(false);
    };

    initializeApp();
    return () => { isMounted = false; };
  }, [router]);

  // פונקציה חכמה המעדכנת את הזיכרון באופן מקומי ועוקפת את הקאש של הדפדפן
  const refreshGlobalData = async (action?: { type: string, payload?: any }) => {
    if (!action) {
       await fetchCoreData();
       return;
    }
    
    switch (action.type) {
       case 'UPDATE_USER':
          setOrgUsers(prev => prev.map(u => u.id === action.payload.id ? { ...u, ...action.payload } : u));
          break;
       case 'DELETE_USER':
          setOrgUsers(prev => prev.filter(u => u.id !== action.payload));
          break;
       case 'ADD_USER':
          await fetchCoreData();
          router.refresh();
          break;
       case 'ADD_PROJECT':
          setAllProjectsList(prev => [...prev, action.payload].sort((a,b) => a.project_name.localeCompare(b.project_name)));
          if (action.payload.status === 'פעיל') {
             setActiveProjectsList(prev => [...prev, action.payload].sort((a,b) => a.project_name.localeCompare(b.project_name)));
          }
          break;
       case 'UPDATE_PROJECT':
          setAllProjectsList(prev => prev.map(p => p.id === action.payload.id ? { ...p, ...action.payload } : p));
          setActiveProjectsList(prev => {
             const exists = prev.find(p => p.id === action.payload.id);
             if (action.payload.status === 'פעיל') {
                if (exists) return prev.map(p => p.id === action.payload.id ? { ...p, ...action.payload } : p);
                return [...prev, action.payload].sort((a,b) => a.project_name.localeCompare(b.project_name));
             } else {
                return prev.filter(p => p.id !== action.payload.id);
             }
          });
          break;
       case 'DELETE_PROJECT':
          setAllProjectsList(prev => prev.filter(p => p.id !== action.payload));
          setActiveProjectsList(prev => prev.filter(p => p.id !== action.payload));
          break;
       default:
          await fetchCoreData();
    }
  };

  const handleLogout = async () => { 
    const confirmLogout = window.confirm('האם אתה בטוח שברצונך להתנתק?'); 
    if (!confirmLogout) return; 
    await supabase.auth.signOut(); 
    router.push('/login'); 
  };

  if (loading) return <div className={`min-h-screen bg-slate-100 flex items-center justify-center text-slate-500 ${heebo.className}`}>טוען נתוני מערכת...</div>;

  return (
    <div className={`min-h-screen ${currentTab === 'team' ? 'bg-slate-950 text-slate-300' : 'bg-slate-50 text-slate-800'} pb-12 overflow-x-hidden ${heebo.className} transition-colors duration-500`} dir="rtl" style={{ backgroundImage: currentTab === 'team' ? 'none' : 'radial-gradient(#cbd5e1 1px, transparent 0)', backgroundSize: '24px 24px' }}>
      
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
                onClick={() => setCurrentTab(currentTab === 'admin' ? 'team' : 'admin')} 
                className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition border shadow-sm text-sm ${currentTab === 'admin' ? 'bg-slate-200 text-slate-800 border-slate-300 hover:bg-slate-300' : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border-slate-700'}`}
              >
                {currentTab === 'admin' ? <X className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
                {currentTab === 'admin' ? 'סגור מסך ניהול' : 'ניהול נתוני המערכת'}
              </button>
            )}
            <button 
              onClick={() => { 
                if (currentTab !== 'reports') setCurrentTab('reports');
                setShowReportForm(!showReportForm);
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
        
        {/* Navigation Tabs */}
        {currentTab !== 'admin' && (
          <div className={`flex border-b overflow-x-auto gap-8 mb-6 ${currentTab === 'team' ? 'border-slate-800' : 'border-slate-300'}`}>
            <button onClick={() => setCurrentTab('reports')} className={`pb-3 flex items-center gap-2 text-sm font-bold border-b-2 whitespace-nowrap transition ${currentTab === 'reports' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}><List className="w-4 h-4" /> טבלת דיווחים</button>
            <button onClick={() => setCurrentTab('work_plan')} className={`pb-3 flex items-center gap-2 text-sm font-bold border-b-2 whitespace-nowrap transition ${currentTab === 'work_plan' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}><ClipboardList className="w-4 h-4" /> תוכנית עבודה</button>
            {(currentUserRole === 'department_manager' || currentUserRole === 'manager') && (
              <>
                <button onClick={() => setCurrentTab('dashboard')} className={`pb-3 flex items-center gap-2 text-sm font-bold border-b-2 whitespace-nowrap transition ${currentTab === 'dashboard' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}><BarChart3 className="w-4 h-4" /> דאשבורד העמסות</button>
                {currentUserRole === 'department_manager' && (
                  <button onClick={() => setCurrentTab('costs')} className={`pb-3 flex items-center gap-2 text-sm font-bold border-b-2 whitespace-nowrap transition ${currentTab === 'costs' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}><Wallet className="w-4 h-4" /> תמחור ובקרת תקציב</button>
                )}
                <button onClick={() => setCurrentTab('team')} className={`pb-3 flex items-center gap-2 text-sm font-bold border-b-2 whitespace-nowrap transition ${currentTab === 'team' ? 'border-blue-600 text-blue-500' : 'border-transparent text-slate-500'}`}><Network className="w-4 h-4" /> מפת כוח אדם</button>
              </>
            )}
          </div>
        )}

        {/* --- Tab Content Areas --- */}
        
        {currentTab === 'reports' && (
           <ReportsTab 
              currentUserRole={currentUserRole}
              engineerName={engineerName}
              orgUsers={orgUsers}
              activeProjectsList={activeProjectsList}
              allProjectsList={allProjectsList}
              stagesList={stagesList}
              subStagesList={subStagesList}
              showReportForm={showReportForm}
              setShowReportForm={setShowReportForm}
           />
        )}
        {currentTab === 'work_plan' && (
           <WorkPlanTab 
              engineerName={engineerName}
              allProjectsList={allProjectsList}
           />
        )}
        {currentTab === 'dashboard' && (currentUserRole === 'department_manager' || currentUserRole === 'manager') && (
           <DashboardTab 
              currentUserRole={currentUserRole}
              engineerName={engineerName}
              orgUsers={orgUsers}
              allProjectsList={allProjectsList}
           />
        )}
        {currentTab === 'team' && (currentUserRole === 'department_manager' || currentUserRole === 'manager') && (
           <TeamTab 
              currentUserRole={currentUserRole}
              actualName={actualName}
              orgUsers={orgUsers}
              allProjectsList={allProjectsList}
           />
        )}
        {currentTab === 'costs' && currentUserRole === 'department_manager' && (
           <CostsTab 
              allProjectsList={allProjectsList}
              assumptions={assumptions}
           />
        )}
        {currentTab === 'admin' && currentUserRole === 'department_manager' && (
           <AdminTab 
              currentUserRole={currentUserRole}
              engineerName={engineerName}
              orgUsers={orgUsers}
              allProjectsList={allProjectsList}
              onDataChanged={refreshGlobalData}
           />
        )}

      </div>
    </div>
  );
}