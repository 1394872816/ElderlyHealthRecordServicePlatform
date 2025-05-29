function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

document.addEventListener('DOMContentLoaded', function() {
    const logoutButtonTop = document.getElementById('logoutButtonTop');
    const sideNavLinks = document.querySelectorAll('.side-navbar nav ul li a');
    const moduleSections = document.querySelectorAll('.module-section');

    if (logoutButtonTop) {
        logoutButtonTop.addEventListener('click', function(event) {
            event.preventDefault();
            localStorage.removeItem('user_id');
            alert('您已退出登录！');
            window.location.href = 'login.html';
        });
    }

    sideNavLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            sideNavLinks.forEach(s_link => s_link.parentElement.classList.remove('active'));
            this.parentElement.classList.add('active');

            const targetModuleId = this.getAttribute('href').substring(1);

            moduleSections.forEach(section => {
                section.classList.remove('active-module');
            });

            const targetModule = document.getElementById(targetModuleId);
            if (targetModule) {
                targetModule.classList.add('active-module');
                
                switch(targetModuleId) {
                    case 'module-data-integration':
                    loadHealthData();
                        break;
                    case 'module-data-analysis':
                        initTrendsChart();
                        updateTrendsChart();
                        break;
                    case 'module-health-advice':
                        getAIAdvice();
                        break;
                }
            }
        });
    });

    if (sideNavLinks.length > 0 && moduleSections.length > 0) {
        const firstNavLink = sideNavLinks[0];
        firstNavLink.parentElement.classList.add('active');
        const firstModuleId = firstNavLink.getAttribute('href').substring(1);
        const firstModule = document.getElementById(firstModuleId);

        if (firstModule) {
            firstModule.classList.add('active-module');
            if (firstModuleId === 'module-data-integration') {
                loadHealthData();
            }
        }
    }

    const uploadModal = document.getElementById('uploadModal');
    const uploadDataButton = document.getElementById('uploadDataButton');
    const closeButton = document.querySelector('#uploadModal .close-button');
    const uploadDataForm = document.getElementById('uploadDataForm');

    if (uploadDataButton) {
        uploadDataButton.addEventListener('click', () => {
            if (uploadModal) uploadModal.style.display = 'block';
        });
    }

    if (closeButton) {
        closeButton.addEventListener('click', () => {
            if (uploadModal) uploadModal.style.display = 'none';
        });
    }

    window.addEventListener('click', (event) => {
        if (event.target == uploadModal) {
            uploadModal.style.display = 'none';
        }
    });

    if (uploadDataForm) {
        uploadDataForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            
            if (!AuthManager.requireAuth()) {
                return;
            }

            const submitButton = this.querySelector('button[type="submit"]');
            submitButton.textContent = '上传中...';
            submitButton.disabled = true;

            const formData = new FormData(this);
            
            const name = formData.get('name');
            if (!name || name.trim() === '') {
                alert('请输入姓名！');
                submitButton.textContent = '上传数据';
                submitButton.disabled = false;
                return;
            }
            
            let dataType = formData.get('dataType');
            const customDataType = formData.get('customDataType');
            
            if (dataType === 'custom' && customDataType) {
                dataType = customDataType.trim();
            } else if (dataType === 'custom' && !customDataType) {
                alert('请填写自定义数据类型！');
                submitButton.textContent = '上传数据';
                submitButton.disabled = false;
                return;
            }

            const recordTime = formData.get('record_time');
            const fileInput = formData.get('file'); 
            const description = formData.get('description');
            let dataValue = formData.get('manualDataValue') || '';

            if (!recordTime) {
                alert('请选择记录时间！');
                submitButton.textContent = '上传数据';
                submitButton.disabled = false;
                return;
            }

            if (fileInput && fileInput.size > 0) {
                if (fileInput.type.startsWith('text/')) {
                    try {
                        dataValue = await fileInput.text();
                    } catch (e) {
                        console.error('读取文件内容失败:', e);
                        alert('读取文件内容失败!');
                        submitButton.textContent = '重新上传';
                        submitButton.disabled = false;
                        return;
                    }
                } else {
                    dataValue = `文件: ${fileInput.name} (类型: ${fileInput.type}, 大小: ${fileInput.size} bytes)`;
                }
            } 
            
            if (!dataValue && (!fileInput || fileInput.size === 0)) {
                 alert('请输入数据内容或选择一个文件。');
                 submitButton.textContent = '上传数据';
                 submitButton.disabled = false;
                 return;
            }

            const payload = {
                user_id: parseInt(AuthManager.getUserId()),
                name: name.trim(),
                dataType: dataType,
                dataValue: dataValue,
                record_time: recordTime,
                description: description
            };

            console.log('Uploading payload:', JSON.stringify(payload, null, 2));

            try {
                const response = await fetch('http://127.0.0.1:5000/api/health-data', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();

                if (result.success) {
                    alert('数据上传成功！');
                    if(uploadModal) uploadModal.style.display = 'none';
                    this.reset(); 
                    const customDataTypeInput = document.getElementById('customDataTypeInput');
                    if (customDataTypeInput) customDataTypeInput.style.display = 'none';
                    const dataTypeSelect = document.getElementById('dataType');
                    if (dataTypeSelect) dataTypeSelect.value = '';
                    const recordTimeInput = document.getElementById('record_time');
                    if (recordTimeInput) {
                        recordTimeInput.value = new Date().toISOString().slice(0, 16);
                    }

                    loadHealthData(); 
                } else {
                    alert(`上传失败: ${result.message}`);
                }
            } catch (error) {
                console.error('Error uploading data:', error);
                alert('上传数据时发生网络错误。');
            } finally {
                submitButton.textContent = '上传数据';
                submitButton.disabled = false;
            }
        });
    }

    const dataTypeSelect = document.getElementById('dataType');
    const customDataTypeInputContainer = document.getElementById('customDataTypeInputContainer');
    const customDataTypeInput = document.getElementById('customDataTypeInput');

    if (dataTypeSelect && customDataTypeInputContainer) {
        dataTypeSelect.addEventListener('change', function() {
            if (this.value === 'custom') {
                customDataTypeInputContainer.style.display = 'block';
                if(customDataTypeInput) customDataTypeInput.required = true;
            } else {
                customDataTypeInputContainer.style.display = 'none';
                if(customDataTypeInput) {
                    customDataTypeInput.value = '';
                    customDataTypeInput.required = false;
                }
            }
        });
        if (dataTypeSelect.value !== 'custom') {
            customDataTypeInputContainer.style.display = 'none';
            if(customDataTypeInput) customDataTypeInput.required = false;
        } else {
             customDataTypeInputContainer.style.display = 'block';
             if(customDataTypeInput) customDataTypeInput.required = true;
        }
    }

    const recordTimeInput = document.getElementById('record_time');
    if (recordTimeInput) {
        recordTimeInput.value = new Date().toISOString().slice(0, 16);
    }

    const cancelButton = document.getElementById('cancelUploadButton');
    const closeButtonModal = document.getElementById('closeUploadModalButton');

    function closeUploadModal() {
        if (uploadModal) {
            uploadModal.style.display = 'none';
            if (uploadDataForm) uploadDataForm.reset();
            if (customDataTypeInputContainer) customDataTypeInputContainer.style.display = 'none';
            if (dataTypeSelect) dataTypeSelect.value = '';
            if (customDataTypeInput) customDataTypeInput.value = '';
            
            if (recordTimeInput) {
                recordTimeInput.value = new Date().toISOString().slice(0, 16);
            }
        }
    }

    if (cancelButton) {
        cancelButton.addEventListener('click', closeUploadModal);
    }
    if (closeButtonModal) {
        closeButtonModal.addEventListener('click', closeUploadModal);
    }
    window.addEventListener('click', (event) => {
        if (event.target == uploadModal) {
            closeUploadModal();
        }
    });

    function addCardActionListeners() {
        const editButtons = document.querySelectorAll('.data-card .edit-btn');
        const deleteButtons = document.querySelectorAll('.data-card .delete-btn');

        editButtons.forEach(button => {
            button.addEventListener('click', function() {
                const itemId = this.dataset.id;
                const itemType = this.dataset.type;
                const itemValue = this.dataset.value;
                const itemDescription = this.dataset.description;
                alert(`编辑功能开发中...\nID: ${itemId}\n类型: ${itemType}\n数据: ${itemValue.substring(0,30)}...\n描述: ${itemDescription}`);
            });
        });

        deleteButtons.forEach(button => {
            button.addEventListener('click', async function() {
                const itemId = this.dataset.id;
                if (confirm('您确定要删除这条健康数据吗？此操作无法撤销。')) {
                    try {
                        const userId = localStorage.getItem('user_id');
                        if (!userId) {
                            alert('用户未登录，无法删除数据。');
                            return;
                        }
                        const response = await fetch(`http://127.0.0.1:5000/api/health-data/${itemId}?user_id=${userId}`, { 
                            method: 'DELETE',
                        });
                        const result = await response.json();
                        if (result.success) {
                            alert('数据删除成功！');
                            loadHealthData(); 
                        } else {
                            alert(`删除失败: ${result.message}`);
                        }
                    } catch (error) {
                        console.error('Error deleting data:', error);
                        alert('删除数据时发生网络错误。');
                    }
                }
            });
        });
    }

    initTrendsChart();
    
    bindEventListeners();
    
    loadHealthData();

    loadUserSettings();
});

const dataTypeMap = {
    'medical_report': '体检报告',
    'medical_history': '病史记录',
    'daily_health': '日常健康',
    'blood_pressure': '血压',
    'blood_sugar': '血糖',
    'heart_rate': '心率',
    'weight': '体重',
    'temperature': '体温',
    'exercise': '运动记录',
    'diet': '饮食记录',
    'sleep': '睡眠记录',
    'medication': '用药记录'
};

function getDataTypeText(type) {
    if (!dataTypeMap[type]) {
        return type;
    }
    return dataTypeMap[type];
}

let trendsChart = null;

document.addEventListener('DOMContentLoaded', function() {
    initTrendsChart();
    
    bindEventListeners();
    
    loadHealthData();
});

function initTrendsChart() {
    const ctx = document.getElementById('trendsChart').getContext('2d');
    
    if (trendsChart) {
        trendsChart.destroy();
    }
    
    trendsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '数据趋势',
                data: [],
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: '健康数据趋势图'
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function getCurrentUserId() {
    const userId = localStorage.getItem('user_id');
    console.log('[DEBUG] getCurrentUserId:', userId);
    if (!userId) {
        console.log('[DEBUG] No user_id found in localStorage');
        window.location.href = 'login.html';
        return null;
    }
    return userId;
}

function checkLoginStatus() {
    const userId = getCurrentUserId();
    if (!userId) {
        console.log('[DEBUG] checkLoginStatus: No user_id found');
        return false;
    }
    console.log('[DEBUG] checkLoginStatus: User is logged in with ID:', userId);
    return true;
}

async function loadHealthData() {
    const userId = getCurrentUserId();
    if (!userId) {
        alert('请先登录后再访问！');
        window.location.href = 'login.html';
        return;
    }

    try {
        const response = await fetch(`http://127.0.0.1:5000/api/health-data?user_id=${userId}`);
        const data = await response.json();
        
        if (data.success) {
            displayHealthData(data.data);
        } else {
            showError('获取健康数据失败：' + data.message);
        }
            } catch (error) {
        showError('加载健康数据时发生错误：' + error.message);
    }
}

function displayHealthData(data) {
    const container = document.getElementById('healthDataList');
    container.innerHTML = '';
    
    if (data.length === 0) {
        document.querySelector('.no-data-message').style.display = 'block';
        return;
    }
    
    document.querySelector('.no-data-message').style.display = 'none';
    
    data.forEach(item => {
        const card = document.createElement('div');
        card.className = 'data-card';
        card.innerHTML = `
            <div class="card-header">
                <h3>${escapeHtml(item.name)}</h3>
                <div class="card-type">${getDataTypeText(item.data_type)}</div>
            </div>
            <div class="card-content">
                <p class="data-value">${escapeHtml(item.data_value)}</p>
                <p class="record-time"><i class="fas fa-calendar"></i> ${new Date(item.record_time).toLocaleString()}</p>
                ${item.description ? `<p class="description"><i class="fas fa-info-circle"></i> ${escapeHtml(item.description)}</p>` : ''}
            </div>
            <div class="card-actions">
                <button class="btn btn-edit" onclick="editHealthData(${JSON.stringify(item).replace(/"/g, '&quot;')})">
                    <i class="fas fa-edit"></i> 编辑
                </button>
                <button class="btn btn-delete" onclick="deleteHealthData(${item.id})">
                    <i class="fas fa-trash"></i> 删除
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

function bindEventListeners() {
    const trendMetric = document.getElementById('trendMetric');
    const timeRange = document.getElementById('timeRange');
    if (trendMetric && timeRange) {
        trendMetric.addEventListener('change', updateTrendsChart);
        timeRange.addEventListener('change', updateTrendsChart);
    }
    
    const analysisType = document.getElementById('analysisType');
    const analysisPrompt = document.getElementById('analysisPrompt');
    if (analysisType && analysisPrompt) {
        analysisType.addEventListener('change', () => {
            analysisPrompt.value = '';
        });
    }
    
    const settingShowTrends = document.getElementById('settingShowTrends');
    const settingShowAIAnalysis = document.getElementById('settingShowAIAnalysis');
    const settingReportFrequency = document.getElementById('settingReportFrequency');
    
    if (settingShowTrends) {
        settingShowTrends.addEventListener('change', updateDisplaySettings);
    }
    if (settingShowAIAnalysis) {
        settingShowAIAnalysis.addEventListener('change', updateDisplaySettings);
    }
    if (settingReportFrequency) {
        settingReportFrequency.addEventListener('change', updateReportSettings);
    }
}

async function updateDisplaySettings() {
    const showTrends = document.getElementById('settingShowTrends').checked;
    const showAIAnalysis = document.getElementById('settingShowAIAnalysis').checked;
    
    const trendsSection = document.querySelector('#module-data-analysis .analysis-section:first-child');
    if (trendsSection) {
        trendsSection.style.display = showTrends ? 'block' : 'none';
    }
    
    const aiAnalysisSection = document.querySelector('#module-data-analysis .analysis-section:last-child');
    if (aiAnalysisSection) {
        aiAnalysisSection.style.display = showAIAnalysis ? 'block' : 'none';
    }

    await saveSettings({
        showTrends,
        showAIAnalysis
    });
}

async function loadUserSettings() {
    try {
        const userId = getCurrentUserId();
        if (!userId) {
            console.error('[ERROR] No user ID found when loading settings');
            return;
        }

        const response = await fetch(`http://127.0.0.1:5000/api/get-settings?userId=${userId}`);
        const data = await response.json();
        
        if (data.success) {
            const settings = data.settings;
            
            if (settings.showTrends !== undefined) {
                const settingShowTrends = document.getElementById('settingShowTrends');
                const trendsSection = document.querySelector('#module-data-analysis .analysis-section:first-child');
                if (settingShowTrends && trendsSection) {
                    settingShowTrends.checked = settings.showTrends;
                    trendsSection.style.display = settings.showTrends ? 'block' : 'none';
                }
            }
            
            if (settings.showAIAnalysis !== undefined) {
                const settingShowAIAnalysis = document.getElementById('settingShowAIAnalysis');
                const aiAnalysisSection = document.querySelector('#module-data-analysis .analysis-section:last-child');
                if (settingShowAIAnalysis && aiAnalysisSection) {
                    settingShowAIAnalysis.checked = settings.showAIAnalysis;
                    aiAnalysisSection.style.display = settings.showAIAnalysis ? 'block' : 'none';
                }
            }
            
            const settingReportFrequency = document.getElementById('settingReportFrequency');
            if (settings.reportFrequency && settingReportFrequency) {
                settingReportFrequency.value = settings.reportFrequency;
            }
        } else {
            console.error('[ERROR] Failed to load settings:', data.message);
        }
    } catch (error) {
        console.error('[ERROR] Error loading settings:', error);
    }
}

async function updateTrendsChart() {
    const metric = document.getElementById('trendMetric').value;
    const timeRange = document.getElementById('timeRange').value;
    const userId = getCurrentUserId();
    
    if (!userId) {
        showError('请先登录');
        return;
    }
    
    try {
        const response = await fetch(`http://127.0.0.1:5000/api/health-trends?metric=${metric}&timeRange=${timeRange}&userId=${userId}`);
        const data = await response.json();
        
        if (data.success) {
            if (trendsChart) {
            trendsChart.data.labels = data.dates;
            trendsChart.data.datasets[0].data = data.values;
            trendsChart.data.datasets[0].label = data.metricName;
            trendsChart.options.plugins.title.text = `${data.metricName}趋势图`;
            trendsChart.update();
            }
            
            updateTrendSummary(data.summary);
        } else {
            showError('获取趋势数据失败：' + data.message);
        }
    } catch (error) {
        showError('获取趋势数据时发生错误：' + error.message);
    }
}

function updateTrendSummary(summary) {
    const summaryContainer = document.getElementById('trendSummaryContent');
    summaryContainer.innerHTML = `
        <div class="trend-summary-item">
            <h4>数据概览</h4>
            <p>${summary.overview}</p>
        </div>
        <div class="trend-summary-item">
            <h4>异常指标</h4>
            <p>${summary.abnormal || '无异常指标'}</p>
        </div>
        <div class="trend-summary-item">
            <h4>建议</h4>
            <p>${summary.suggestions}</p>
        </div>
    `;
}

async function analyzeHealthData() {
    const analysisType = document.getElementById('analysisType').value;
    const prompt = document.getElementById('analysisPrompt').value;
    const aiAnalysisContent = document.getElementById('aiAnalysisContent');
    const loadingSpinner = document.querySelector('.loading-spinner');
    
    try {
        loadingSpinner.style.display = 'block';
        aiAnalysisContent.innerHTML = '';
        
        const response = await fetch('/api/analyze-health-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                analysisType,
                prompt,
                userId: getCurrentUserId()
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            aiAnalysisContent.innerHTML = `
                <div class="analysis-section">
                    <h4>分析结果</h4>
                    <p>${data.analysis}</p>
                </div>
                <div class="analysis-section">
                    <h4>健康建议</h4>
                    <p>${data.recommendations}</p>
                </div>
            `;
        } else {
            showError('分析失败：' + data.message);
        }
    } catch (error) {
        showError('分析过程中发生错误：' + error.message);
    } finally {
        loadingSpinner.style.display = 'none';
    }
}

async function generateReport() {
    const reportType = document.getElementById('reportType').value;
    const reportContent = document.getElementById('reportContent');
    
    try {
        const response = await fetch('/api/generate-report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                reportType,
                userId: getCurrentUserId()
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            reportContent.innerHTML = data.reportHtml;
        } else {
            showError('生成报告失败：' + data.message);
        }
    } catch (error) {
        showError('生成报告时发生错误：' + error.message);
    }
}

async function getAIAdvice() {
    const adviceType = document.getElementById('adviceType').value;
    const aiAdviceContent = document.getElementById('aiAdviceContent');
    
    try {
        const response = await fetch('/api/get-ai-advice', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                adviceType,
                userId: getCurrentUserId()
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            aiAdviceContent.innerHTML = `
                <div class="advice-section">
                    <h4>${data.title}</h4>
                    <p>${data.content}</p>
                    <div class="advice-details">
                        ${data.details.map(detail => `
                            <div class="advice-detail-item">
                                <h5>${detail.title}</h5>
                                <p>${detail.content}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } else {
            showError('获取建议失败：' + data.message);
        }
    } catch (error) {
        showError('获取建议时发生错误：' + error.message);
    }
}

async function downloadReport(format) {
    const reportType = document.getElementById('reportType').value;
    
    try {
        const response = await fetch(`/api/download-report?type=${reportType}&format=${format}`);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `健康报告_${new Date().toISOString().split('T')[0]}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        showError('导出报告时发生错误：' + error.message);
    }
}

function printReport() {
    const reportContent = document.getElementById('reportContent').innerHTML;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>健康报告</title>
                <link rel="stylesheet" href="css/print.css">
            </head>
            <body>
                ${reportContent}
            </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
}

async function updateReportSettings() {
    const frequency = document.getElementById('settingReportFrequency').value;
    await saveSettings({
        reportFrequency: frequency
    });
}

async function saveSettings(settings) {
    try {
        const userId = getCurrentUserId();
        if (!userId) {
            console.error('[ERROR] No user ID found when saving settings');
            return;
        }

        const response = await fetch('http://127.0.0.1:5000/api/save-settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: userId,
                settings: settings
            })
        });
        
        const data = await response.json();
        if (!data.success) {
            console.error('[ERROR] Failed to save settings:', data.message);
        }
    } catch (error) {
        console.error('[ERROR] Error saving settings:', error);
    }
}

function showError(message) {
    alert(message);
}

function displayAnalysisResult(result) {
    const analysisContent = document.getElementById('analysisContent');
    if (analysisContent) {
        analysisContent.innerHTML = `
            <div class="analysis-result">
                <h3>分析结果</h3>
                <div class="analysis-text">${result.analysis.replace(/\n/g, '<br>')}</div>
                <div class="analysis-date">分析时间：${new Date().toLocaleString()}</div>
            </div>
        `;
    }
}

async function analyzeHealthData() {
    const userId = getCurrentUserId();
    if (!userId) return;

    const additionalPrompt = document.getElementById('analysisPrompt').value.trim();

    try {
        const response = await fetch('http://127.0.0.1:5000/api/analyze-health-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user_id: parseInt(userId),
                additional_prompt: additionalPrompt
            })
        });

        const result = await response.json();
        if (result.success) {
            displayAnalysisResult(result);
        } else {
            alert('分析失败：' + result.message);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('分析请求失败，请稍后重试');
    }
}

function formatAnalysisText(text) {
    if (!text) return '';
    return text
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/- (.+)/g, '• $1');
}

async function deleteHealthData(dataId) {
    if (!confirm('确定要删除这条数据吗？此操作不可恢复。')) {
        return;
    }
    
    try {
        const response = await fetch(`http://127.0.0.1:5000/api/health-data/${dataId}`, {
            method: 'DELETE'
        });
        const result = await response.json();

        if (result.success) {
            alert('数据删除成功！');
            loadHealthData();
        } else {
            alert('删除失败：' + result.message);
        }
    } catch (error) {
        alert('删除数据时发生错误：' + error.message);
    }
}

function editHealthData(data) {
    const uploadModal = document.getElementById('uploadModal');
    uploadModal.style.display = 'block';

    document.getElementById('name').value = data.name;
    document.getElementById('dataType').value = data.data_type;
    document.getElementById('record_time').value = data.record_time.slice(0, 16);
    document.getElementById('manualDataValue').value = data.data_value;
    document.getElementById('description').value = data.description || '';

    const uploadDataForm = document.getElementById('uploadDataForm');
    const originalSubmitHandler = uploadDataForm.onsubmit;

    uploadDataForm.onsubmit = async function(event) {
        event.preventDefault();

        const submitButton = this.querySelector('button[type="submit"]');
        submitButton.textContent = '更新中...';
        submitButton.disabled = true;

        try {
            const formData = new FormData(this);
            const payload = {
                name: formData.get('name'),
                dataType: formData.get('dataType'),
                dataValue: formData.get('manualDataValue'),
                record_time: formData.get('record_time'),
                description: formData.get('description')
            };

            const response = await fetch(`http://127.0.0.1:5000/api/health-data/${data.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.success) {
                alert('数据更新成功！');
                uploadModal.style.display = 'none';
                loadHealthData();
            } else {
                alert('更新失败：' + result.message);
            }
        } catch (error) {
            alert('更新数据时发生错误：' + error.message);
        } finally {
            submitButton.textContent = '上传数据';
            submitButton.disabled = false;
            uploadDataForm.onsubmit = originalSubmitHandler;
        }
    };
}