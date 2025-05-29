const AuthManager = {
    getUserId() {
        return localStorage.getItem('user_id');
    },
    
    isLoggedIn() {
        return !!this.getUserId();
    },
    
    setUserId(id) {
        localStorage.setItem('user_id', id);
    },
    
    clearAuth() {
        localStorage.removeItem('user_id');
    },
    
    requireAuth() {
        if (!this.isLoggedIn()) {
            console.log('[DEBUG] 未登录，重定向到登录页面');
            window.location.href = 'login.html';
            return false;
        }
        return true;
    },

    checkLoginAndRedirect() {
        if (!this.isLoggedIn()) {
            console.log('[DEBUG] 检测到未登录状态，重定向到登录页面');
            window.location.href = 'login.html';
            return false;
        }
        return true;
    }
};

document.addEventListener('DOMContentLoaded', function() {
    if (window.location.pathname.endsWith('login.html') && AuthManager.isLoggedIn()) {
        window.location.href = 'home.html';
        return;
    }
    
    // 如果在其他页面且未登录，则跳转到登录页面
    if (!window.location.pathname.endsWith('login.html') && !AuthManager.isLoggedIn()) {
        window.location.href = 'login.html';
        return;
    }
}); 