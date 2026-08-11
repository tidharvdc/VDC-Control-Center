# Project Memory: VDC Engineer Work Reporting System

## 📌 Overview
מערכת פנימית (VDC Control Center) לדיווח, מעקב, בקרת תקציב וניהול כוח אדם של מהנדסי מחלקת VDC בטידור. המערכת מספקת תמונת מצב מלאה על העמסות, פגישות סטטוס, ניהול פרויקטים היררכי (דור 2) ובקרה ניהולית מלאה למנהלי מחלקות וצוותים.

## 🛠️ Tech Stack
- **Framework:** Next.js 16 (App Router) with Turbopack.
- **Database & Auth:** Supabase (Auth, Database, RLS).
- **Styling:** Tailwind CSS.
- **Language:** TypeScript.
- **Icons & Fonts:** Lucide Icons, Heebo Font.

## 🗄️ Database Architecture & Schemas

### `public.work_reports`
טבלה המרכזת את הדיווחים היומיים של המהנדסים.
- `id` (int8, Primary Key)
- `report_date` (date) - תאריך הדיווח
- `engineer_name` (text) - שם המהנדס המדווח
- `project_name` (text) - שם הפרויקט (מעודכן אוטומטית בעת שינוי שם פרויקט גלובלי)
- `stage` (text) - שלב הנדסי ראשי
- `sub_stage` (text, optional) - תת-שלב מפורט (חובה לפרויקטי דור 2)
- `scope` (text) - היקף המשרה (יום מלא / חצי יום)
- `notes` (text) - פירוט פעילות והערות

### `public.projects`
טבלת ניהול הפרויקטים הארגונית.
- `id` (int8, Primary Key)
- `project_name` (text) - שם הפרויקט
- `project_code` / `code` (text) - קוד מזהה
- `status` (text) - סטטוס פרויקט: 'פעיל' | 'עתידי' (צנרת) | 'ארכיון'
- `has_sub_stages` (boolean) - מזהה פרויקטי דור 2
- `assigned_engineer` (text) - מהנדס VDC אחראי (null בפרויקטי צנרת עתידיים)
- `buildings_count` (int8) - כמות בניינים
- `apartments_count` (int8) - כמות דירות
- `typologies_count` (int8) - כמות טיפוסים (דור 1)
- `parent_typologies_count` (int8) - טיפוסי אב (דור 2)
- `sub_typologies_count` (int8) - תתי-טיפוס (דור 2)

### `public.app_users`
טבלת פרופילי משתמשים מורחבת המסונכרנת מול מערכת ה-Auth.
- `id` (uuid, Primary Key, references auth.users)
- `email` (text, unique)
- `full_name` (text) - שם מלא
- `role` (text: 'basic' | 'manager' | 'department_manager') - דרגת הרשאה
- `manager_name` (text) - שיוך למנהל הישיר (לצורך בניית עץ ארגוני)
- `must_change_password` (boolean) - דגל החלפת סיסמה בכניסה ראשונית
- `created_at` (timestamp)

### `public.work_meetings`
מעקב אחר פגישות סטטוס שבועיות בין מנהלים למהנדסים לפי פרויקט.
- `id` (int8, Primary Key)
- `meeting_date` (date)
- `manager_name` (text)
- `engineer_name` (text)
- `project_name` (text)
- `progress_status` (text) - התקדמות לפי מלאכות
- `bottlenecks` (text) - חסמים מרכזיים
- `weekly_focus` (text) - מיקוד שבועי
- `modelers_tracking` (text) - מעקב ממדלים

### `public.system_assumptions`
פרמטרים גלובליים למודל התמחור (כגון `vdc_engineer_monthly_cost`).

### ⚡ Automation & Triggers
- **`handle_new_user()`**: פונקציית SQL מוגדרת כ-`security definer` המעתיקה אוטומטית כל משתמש חדש מ-`auth.users` לתוך `public.app_users`.
- **`sync_app_user_to_auth()`**: טריגר ופונקציה המעדכנים אוטומטית את ה-`raw_user_meta_data` בטבלת ה-Auth בעת שינוי הרשאות משתמש.

## 🔐 Authentication & Security Flows
1. **Strict Admin-Provisioned Access (מערכת סגורה):** בוטלה לחלוטין האפשרות להרשמה עצמית. הגישה למערכת היא בהזמנה בלבד. משתמשים חדשים מוקמים אך ורק על ידי מנהל המחלקה דרך ממשק הניהול (באמצעות Server Action עם `SUPABASE_SERVICE_ROLE_KEY`).
2. **התחברות וניהול סשנים:** מבוסס Supabase Auth. המסך הראשי מציג טופס התחברות בלבד, עם הודעה המבהירה שהגישה מותרת למורשים בלבד.
3. **החלפת סיסמה כפויה (First-Time Login):** משתמשים שהוקמו על ידי המנהל נכנסים עם סיסמה זמנית, ומנותבים אוטומטית למסך החלפת סיסמה אישית (Forced Password Reset) לפני קבלת גישה לנתוני המערכת. רק לאחר העדכון, הדגל `must_change_password` מתאפס ב-DB.
4. **בקרת הרשאות (RLS):** מדיניות אבטחה המאפשרת למנהלי מחלקה ניהול מלא (CRUD) על טבלאות המשתמשים והפרויקטים, ולמהנדסים שליטה בדיווחים האישיים שלהם בלבד.

## 🚀 Key Modules & Features
- **טבלת דיווחים וסינון חכם:** תצוגה מרוכזת של דיווחי העבודה, כולל סינונים מתקדמים לפי חודש, מהנדס ופרויקט, עם הגבלת דיווח יומית מקסימלית (1.0 משרה).
- **דאשבורד העמסות:** מעקב חודשי אחר התפלגות ימי העבודה של כל מהנדס לפי פרויקטים ושלבים, כולל איתור אוטומטי של דיווחים חסרים (ימים א'-ה') והפקת דו"חות PDF מותאמים להדפסה.
- **מודל תמחור ובקרת תקציב:** חישוב עלויות היררכי לפי עלות חודשית למהנדס, התאמות True-up לחודשים שהסתיימו, וניתוח עלויות מתקדם לדירה/בניין/טיפוס לפרויקטי דור 2, כולל מודול השוואת פרויקטים צד-לצד.
- **מפת כוח אדם (Org Chart):** תצוגה גרפית היררכית של מבנה המחלקה (מנהל מחלקה -> מנהלי צוותים -> מהנדסים) כולל הצגת פרויקטים פעילים בכל עמדה ופרויקטים בצנרת.
- **מסד נתונים וניהול מערכת (Admin Panel):** ממשק מרכזי למנהל המחלקה הכולל:
  - ניהול משתמשים (הוספה, עריכת תפקידים ושיוך מנהל ישיר, מחיקת משתמש תוך שימור היסטוריית דיווחים).
  - ניהול פרויקטים (הקמת פרויקטים חדשים עם כמות בניינים ודירות, סינון לפי פעילים/עתידיים/ארכיון, עריכת פרמטרים ועדכון שמות פרויקטים בצורה גלובלית שמעדכנת אוטומטית את כל ההיסטוריה).
- **תיק מהנדס ופגישות עבודה:** מודל מרכזי לניהול פגישות סטטוס שבועיות, מעקב חסמים, מיקוד והצגת הקשר מהיר של דיווחי השבוע החולף.