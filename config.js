// ============================================================
// إعدادات منصة "علّمني"
// الباك إند على نفس مشروع Supabase بتاع منصة "الشغل الفوري"
// (مشروع shoghl-fawry — ref: xqtmtbvhtenwlnsipdsq)،
// بس بدالة منفصلة اسمها teaching وجداول منفصلة ببادئة tc_،
// عشان متلمسش أي حاجة من المنصات الحالية.
// ملاحظة أمان: الواجهة بتكلم الـ Edge Function بس، والـ Edge Function
// هي اللي معاها مفتاح service-role (كـ secret على السيرفر).
// مفيش أي مفتاح service-role في المجلد ده إطلاقًا.
// ============================================================
window.TC_CONFIG = {
  API_BASE: "https://xqtmtbvhtenwlnsipdsq.supabase.co/functions/v1/teaching"
};
