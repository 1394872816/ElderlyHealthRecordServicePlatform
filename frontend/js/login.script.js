document.addEventListener('DOMContentLoaded', function() {
    const authForm = document.getElementById('authForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const confirmPasswordGroup = document.getElementById('confirmPasswordGroup');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const messageDiv = document.getElementById('message');
    const submitButton = document.getElementById('submitButton');
    const formTitle = document.getElementById('formTitle');
    const formSubtitle = document.getElementById('formSubtitle');
    const toggleToRegisterLink = document.getElementById('toggleToRegister');
    const toggleToLoginLink = document.getElementById('toggleToLogin');

    let isRegisterMode = false;

    function setMode(registerMode) {
        isRegisterMode = registerMode;
        if (isRegisterMode) {
            formSubtitle.textContent = '用户注册';
            submitButton.textContent = '注 册';
            confirmPasswordGroup.style.display = 'block';
            confirmPasswordInput.required = true;
            toggleToRegisterLink.style.display = 'none';
            toggleToLoginLink.style.display = 'inline';
        } else {
            formSubtitle.textContent = '用户登录';
            submitButton.textContent = '登 录';
            confirmPasswordGroup.style.display = 'none';
            confirmPasswordInput.required = false;
            toggleToRegisterLink.style.display = 'inline';
            toggleToLoginLink.style.display = 'none';
        }
        messageDiv.textContent = '';
        messageDiv.className = 'message';
    }

    toggleToRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        setMode(true);
    });

    toggleToLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        setMode(false);
    });

    authForm.addEventListener('submit', async function(event) {
        event.preventDefault();

        const username = usernameInput.value;
        const password = passwordInput.value;
        
        messageDiv.textContent = '';
        messageDiv.className = 'message';

        if (isRegisterMode) {
            const confirmPassword = confirmPasswordInput.value;
            if (password !== confirmPassword) {
                messageDiv.textContent = '两次输入的密码不一致！';
                messageDiv.classList.add('error');
                return;
            }

            try {
                const response = await fetch('http://localhost:5000/api/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password })
                });
                const result = await response.json();
                if (response.ok && result.success) {
                    messageDiv.textContent = result.message + ' 请切换到登录。';
                    messageDiv.classList.add('success');
                    authForm.reset(); 
                    setMode(false);
                } else {
                    messageDiv.textContent = result.message || '注册失败，请重试。';
                    messageDiv.classList.add('error');
                }
            } catch (error) {
                console.error('注册请求失败:', error);
                messageDiv.textContent = '注册请求失败，请检查网络或联系管理员。';
                messageDiv.classList.add('error');
            }

        } else {
            submitButton.textContent = '登录中...';
            submitButton.disabled = true;

            try {
                const response = await fetch('http://127.0.0.1:5000/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (data.success) {
                    alert(data.message);
                    if (data.user_id) {
                        localStorage.setItem('userId', data.user_id);
                    }
                    window.location.href = 'home.html';
                } else {
                    messageDiv.textContent = data.message;
                    messageDiv.classList.add('error');
                }
            } catch (error) {
                console.error('登录请求失败:', error);
                messageDiv.textContent = '登录请求失败，请检查网络或稍后再试。';
                messageDiv.classList.add('error');
            } finally {
                submitButton.textContent = '登 录';
                submitButton.disabled = false;
            }
        }
    });

    setMode(false);
});