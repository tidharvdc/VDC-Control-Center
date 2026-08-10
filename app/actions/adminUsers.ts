'use server';

// עקיפת חסימת ה-SSL של הרשת הארגונית בצד השרת
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { createClient } from '@supabase/supabase-js';

export async function createNewUserByManager(data: {
  email: string;
  fullName: string;
  role: 'basic' | 'manager';
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // בדיקה שהמפתחות קיימים בשרת
  if (!supabaseUrl || !serviceRoleKey) {
    return { success: false, error: 'מפתחות סופבייס חסרים בקובץ הסביבה בשרת' };
  }

  // יצירת קליינט אדמין מיוחד לעקיפת חסימות קליינט
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: 'TidharVDC2026!', // סיסמה ראשונית קבועה
      email_confirm: true,         // מאשר את המייל באופן מיידי
      user_metadata: {
        full_name: data.fullName,  // תואם ל-SQL
        role: data.role,           // תואם ל-SQL
        created_by_manager: 'true' // תואם ל-SQL
      }
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, user: newUser.user };
  } catch (err: any) {
    return { success: false, error: err.message || 'שגיאת שרת לא צפויה' };
  }
}