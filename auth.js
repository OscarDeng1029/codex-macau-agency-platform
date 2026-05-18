// auth.js
const supabaseUrl = 'https://dvhwdirwpraorehlzdar.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2aHdkaXJ3cHJhb3JlaGx6ZGFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMDcxMjIsImV4cCI6MjA5MjU4MzEyMn0.qJayIOG-eGrPUfOztLa5Kx6E-zS6Ukm23hUor495kjE';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// 1. 處理 Google 登入
async function handleGoogleLogin() {
    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            // 動態獲取當前網址，這樣本地測試和正式上線都能自動適配
            redirectTo: window.location.origin + window.location.pathname
        }
    });
    if (error) {
        alert("登入失敗: " + error.message);
        console.error("登入錯誤:", error);
    }
}

// 2. 處理登出
async function handleLogout() {
    await supabaseClient.auth.signOut();
    // 登出後刷新當前頁面
    window.location.reload(); 
}

// 3. 全局狀態檢查與靜默數據遷移
async function checkAuthAndMigrate() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    // 獲取導航欄上的 UI 元素 (我們稍後會在 HTML 中加入這些 ID)
    const navLoginBtn = document.getElementById('nav-login-btn');
    const navUserProfile = document.getElementById('nav-user-profile');
    const navUserAvatar = document.getElementById('nav-user-avatar');

    if (session) {
        const user = session.user;
        
        // --- UI 更新邏輯 ---
        if (navLoginBtn) navLoginBtn.style.display = 'none';
        if (navUserProfile) {
            navUserProfile.style.display = 'flex';
            if (navUserAvatar && user.user_metadata.avatar_url) {
                navUserAvatar.src = user.user_metadata.avatar_url;
            }
        }

        // --- 靜默數據遷移邏輯 ---
        // 用戶在背景中完全感覺不到這個過程
        const storageKey = 'macau_housekeeping_my_review_ids';
        const localIds = JSON.parse(localStorage.getItem(storageKey) || '[]');

        if (localIds.length > 0) {
            const { error } = await supabaseClient
                .from('reviews')
                .update({ user_id: user.id })
                .in('id', localIds);

            if (!error) {
                localStorage.removeItem(storageKey);
                console.log(`已成功在背景綁定 ${localIds.length} 條評價至帳號`);
            }
        }
    } else {
        // 未登入狀態
        if (navLoginBtn) navLoginBtn.style.display = 'block';
        if (navUserProfile) navUserProfile.style.display = 'none';
    }
}

// 確保網頁 DOM 加載完成後，執行狀態檢查
document.addEventListener('DOMContentLoaded', checkAuthAndMigrate);