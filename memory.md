# Project Memory: VDC Engineer Work Reporting System

## 📌 Overview
מערכת פנימית לדיווח ומעקב אחר שעות וימי עבודה של מהנדסי מחלקת VDC.
המערכת מאפשרת למהנדסים לדווח על משימותיהם לפי פרויקטים ושלבים, ומאפשרת למנהלים לנהל את הצוות, להנפיק משתמשים ולראות תמונת מצב מלאה.

## 🛠️ Tech Stack
- **Framework:** Next.js 16 (App Router) with Turbopack.
- **Database & Auth:** Supabase.
- **Styling:** Tailwind CSS.
- **Language:** TypeScript.

## 🗄️ Database Architecture & Schemas

### `public.work_reports`
טבלה המרכזת את הדיווחים היומיים של המהנדסים.
- `id` (int8, Primary Key)
- `report_date` (date) - תאריך הדיווח
- `engineer_name` (text) - שם המהנדס המדווח
- `project_name` (text) - שם הפרויקט (לדוגמה: באזל תל אביב 3549)
- `stage` (text) - שלב (סטנדרט, גגות וכו')
- `scope` (text) - היקף המשרה (יום מלא, חצי יום, שעות בודדות)
- `notes` (text) - פירוט המשימות

### `public.app_users`
טבלת פרופילי משתמשים מורחבת המסונכרנת מול מערכת ה-Auth.
- `id` (uuid, Primary Key, references auth.users)
- `email` (text, unique)
- `full_name` (text)
- `role` (text: 'basic' | 'manager') - דרגת הרשאה
- `must_change_password` (boolean) - דגל המאלץ החלפת סיסמה בכניסה ראשונית
- `created_at` (timestamp)

### ⚡ Automation (Triggers & Functions)
- **`handle_new_user()`**: פונקציית SQL מוגדרת כ-`security definer` המעתיקה אוטומטית כל משתמש חדש שנוצר ב-`auth.users` לתוך `public.app_users`, תוך קריאת ה-Metadata (שם מלא, תפקיד ודגל סיסמה זמנית).
- **`on_auth_user_created`**: טריגר הרץ `AFTER INSERT` על טבלת המשתמשים הפנימית של סופבייס.

## 🔐 Authentication Flows & Security
1. **התחברות רגילה (`AuthMode: login`):** בדיקת פרטי משתמש -> משיכת הרשאות מ-`app_users` -> אם `must_change_password` מופעל, העברה למסך שינוי סיסמה.
2. **החלפת סיסמה כפויה (`AuthMode: force_password_change`):** עדכון סיסמה בשרת ובדאטה-בייס, וכיבוי הדגל ל-`false`.
3. **ניהול משתמשים מאובטח (Server Actions):** הקמת משתמשים על ידי מנהל מתבצעת בשרת בלבד (`app/actions/adminUsers.ts`) באמצעות מפתח `SUPABASE_SERVICE_ROLE_KEY` הסודי.
4. **עקיפת חומת אש ארגונית:** לצורך פיתוח מקומי ברשת המשרד, מוגדר `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` בשרת לעקיפת חסימות SSL Inspection.

## 🚀 Current Status
- [v] חיבור בסיסי ל-Supabase.
- [v] טבלת תצוגת דיווחים וטופס הזנת דיווח עבודה בעמוד הבית.
- [v] מסך Login משולב (התחברות / הרשמה עצמית / החלפת סיסמה כפויה).
- [v] מנגנון Server Action להקמת משתמשים על ידי מנהל צוות (Manager) עוקף חסימות רשת.
- [v] מנגנון התנתקות (Logout) מלא עם ניקוי Session והעברה לעמוד הלוגין.
- [v] הגנת נתיבים בסיסית בעמוד הבית (Redirect ל-`/login` אם אין Session).