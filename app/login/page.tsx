'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../supabase';

type AuthMode = 'login' | 'force_password_change';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  
  // שדות טופס
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 1. תהליך התחברות
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setErrorMsg('פרטי התחברות שגויים, נא לנסות שוב.');
      setLoading(false);
      return;
    }

    if (data?.user) {
      // בדיקה בטבלת app_users האם המשתמש חייב להחליף סיסמה
      const { data: userProfile, error: profileError } = await supabase
        .from('app_users')
        .select('must_change_password')
        .eq('id', data.user.id)
        .single();

      if (userProfile?.must_change_password) {
        setMode('force_password_change'); // מעביר אותו למסך החלפת סיסמה כפויה
        setLoading(false);
      } else {
        // הכל תקין - הפניה לדף הבית של הדיווחים
        router.push('/');
      }
    }
  };

  // 2. תהליך החלפת סיסמה כפויה (כניסה ראשונית)
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      return setErrorMsg('הסיסמה החדשה חייבת להכיל לפחות 6 תווים');
    }
    setLoading(true);
    setErrorMsg('');

    // עדכון הסיסמה ב-Supabase Auth
    const { error: authError } = await supabase.auth.updateUser({ password: newPassword });

    if (authError) {
      setErrorMsg(authError.message);
      setLoading(false);
      return;
    }

    // עדכון הדגל בדאטה-בייס ל-false כדי שלא יישאל שוב
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      await supabase
        .from('app_users')
        .update({ must_change_password: false })
        .eq('id', userData.user.id);
    }

    alert('הסיסמה עודכנה בהצלחה! ברוך הבא למערכת.');
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 font-sans" dir="rtl">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full space-y-6 border border-gray-100">
        
        {/* לוגו / כותרת */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">VDC Reporting System</h1>
          <p className="text-sm text-gray-500 mt-1">
            {mode === 'login' && 'התחברות למערכת דיווחים'}
            {mode === 'force_password_change' && '🔐 הגדרת סיסמה חדשה (כניסה ראשונה)'}
          </p>
        </div>

        {errorMsg && (
          <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg text-center font-medium border border-red-100">
            {errorMsg}
          </div>
        )}

        {/* ---------------- טופס התחברות ---------------- */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">כתובת אימייל</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@tidhar.co.il"
                className="w-full rounded-xl border-gray-200 p-3 text-sm border focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">סיסמה</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border-gray-200 p-3 text-sm border focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition shadow-md disabled:bg-gray-300"
            >
              {loading ? 'מתחבר...' : 'כניסה למערכת'}
            </button>
            <p className="text-xs text-center text-gray-400 pt-2">
              הגישה למערכת מותרת למשתמשים מאושרים בלבד על ידי מנהל המחלקה.
            </p>
          </form>
        )}

        {/* ---------------- טופס החלפת סיסמה כפויה ---------------- */}
        {mode === 'force_password_change' && (
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-xs text-yellow-800 leading-relaxed">
              זוהי כניסתך הראשונה למערכת עם סיסמה זמנית. מטעמי אבטחה, עליך לקבוע סיסמה אישית וחדשה כעת כדי להמשיך.
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">סיסמה אישית חדשה</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="לפחות 6 תווים"
                className="w-full rounded-xl border-gray-200 p-3 text-sm border focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-amber-600 text-white rounded-xl font-medium hover:bg-amber-700 transition shadow-md disabled:bg-gray-300"
            >
              {loading ? 'מעדכן סיסמה...' : 'עדכן סיסמה וכנס למערכת'}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}