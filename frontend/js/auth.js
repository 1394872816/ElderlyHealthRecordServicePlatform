// 认证管理模块
const AuthManager = {
    // 获取用户ID
    getUserId() {
        return localStorage.getItem('user_id');
    },
    
    // 检查是否已登录
    isLoggedIn() {
        return !!this.getUserId();
    },
    
    // 设置用户ID
    setUserId(id) {
        localStorage.setItem('user_id', id);
    },
    
    // 清除认证信息
    clearAuth() {
        localStorage.removeItem('user_id');
    },
    
    // 要求登录
    requireAuth() {
        if (!this.isLoggedIn()) {
            console.log('[DEBUG] 未登录，重定向到登录页面');
            window.location.href = '/';
            return false;
        }
        return true;
    },

    // 检查登录状态并重定向
    checkLoginAndRedirect() {
        if (!this.isLoggedIn()) {
            console.log('[DEBUG] 检测到未登录状态，重定向到登录页面');
            window.location.href = '/';
            return false;
        }
        return true;
    }
};

// 在页面加载时检查登录状态
document.addEventListener('DOMContentLoaded', function() {
    // 获取当前路径
    const path = window.location.pathname;
    console.log('[DEBUG] 当前路径:', path);
    
    // 检查是否是登录或注册页面
    const isLoginPage = path === '/' || path.endsWith('login.html');
    const isRegisterPage = path === '/register' || path.endsWith('register.html');
    
    console.log('[DEBUG] 是登录页面:', isLoginPage);
    console.log('[DEBUG] 是注册页面:', isRegisterPage);
    console.log('[DEBUG] 是否已登录:', AuthManager.isLoggedIn());
    
    // 如果是登录页面且已登录，则跳转到首页
    if (isLoginPage && AuthManager.isLoggedIn()) {
        console.log('[DEBUG] 已登录状态访问登录页面，重定向到首页');
        window.location.href = '/home.html';
        return;
    }
    
    // 如果不是登录页面也不是注册页面，且未登录，则跳转到登录页面
    if (!isLoginPage && !isRegisterPage && !AuthManager.isLoggedIn()) {
        console.log('[DEBUG] 未登录状态访问受保护页面，重定向到登录页面');
        window.location.href = '/';
        return;
    }
}); 