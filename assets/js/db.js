// db.js - Supabase 雲端連接器

const SUPABASE_URL = 'https://dvhwdirwpraorehlzdar.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2aHdkaXJ3cHJhb3JlaGx6ZGFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMDcxMjIsImV4cCI6MjA5MjU4MzEyMn0.qJayIOG-eGrPUfOztLa5Kx6E-zS6Ukm23hUor495kjE';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 1. 獲取所有中介 
async function fetchAllAgencies() {
    const { data, error } = await supabaseClient
        .from('agencies')
        .select('*')
        .order('rating', { ascending: false });
    
    if (error) {
        console.error('讀取失敗:', error.message);
        return [];
    }
    return data;
}

// 2. 獲取單個中介
async function fetchAgencyById(id) {
    const { data, error } = await supabaseClient
        .from('agencies')
        .select('*')
        .eq('uuid', id) // 🌟 核心修改：使用 uuid 作為唯一識別查詢
        .single();
    
    if (error) {
        console.error('查詢詳情失敗:', error.message);
        return null;
    }
    return data;
}

// 3. 獲取特定中介的「已審核」評價
async function fetchReviewsByAgencyId(agencyId) {
    const { data, error } = await supabaseClient
        .from('reviews')
        .select('*')
        .eq('agency_id', agencyId)
        .eq('status', 'approved'); 
    
    if (error) {
        console.error('獲取評價失敗:', error.message);
        return [];
    }
    return data;
}