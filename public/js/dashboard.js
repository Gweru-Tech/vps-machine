// Hosting VPS Dashboard JavaScript
class HostingDashboard {
    constructor() {
        this.token = localStorage.getItem('token');
        this.user = null;
        this.charts = {};
        this.currentSection = 'dashboard';
        
        if (!this.token) {
            this.redirectToLogin();
            return;
        }
        
        this.init();
    }

    async init() {
        try {
            await this.loadUser();
            await this.loadDashboardData();
            this.setupEventListeners();
            this.updateUI();
        } catch (error) {
            console.error('Dashboard initialization error:', error);
            this.showNotification('Failed to initialize dashboard', 'danger');
        }
    }

    async loadUser() {
        try {
            const response = await this.apiCall('/api/auth/me', 'GET');
            if (response.user) {
                this.user = response.user;
                this.updateUserUI();
            }
        } catch (error) {
            console.error('Failed to load user:', error);
            this.redirectToLogin();
        }
    }

    async loadDashboardData() {
        try {
            // Load all dashboard data in parallel
            const [domainsResponse, filesResponse, analyticsResponse] = await Promise.all([
                this.apiCall('/api/domains', 'GET'),
                this.apiCall('/api/files/stats/usage', 'GET'),
                this.apiCall('/api/monitor/analytics?period=7d', 'GET')
            ]);

            // Update stats
            this.updateStats(domainsResponse.domains || [], filesResponse, analyticsResponse);
            
            // Update charts
            this.initCharts(analyticsResponse);
            
            // Load recent activity
            await this.loadRecentActivity();
            
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
        }
    }

    updateStats(domains, files, analytics) {
        // Update domain count
        document.getElementById('activeDomains').textContent = 
            domains.filter(d => d.status === 'active').length;

        // Update websites count (placeholder)
        document.getElementById('totalWebsites').textContent = 
            domains.filter(d => d.status === 'active').length;

        // Update files count
        document.getElementById('totalFiles').textContent = files.totalFiles || 0;

        // Update storage usage
        const storagePercentage = files.usagePercentage || 0;
        document.getElementById('storageUsed').textContent = `${storagePercentage}%`;
        document.getElementById('storageUsedMB').textContent = this.formatBytes(files.storageUsed);
        document.getElementById('storageQuotaMB').textContent = this.formatBytes(files.storageQuota);
        document.getElementById('storageProgressBar').style.width = `${storagePercentage}%`;

        // Update analytics
        if (analytics.summary) {
            document.getElementById('pageViews').textContent = analytics.summary.totalPageViews || 0;
            document.getElementById('fileDownloads').textContent = analytics.summary.totalDownloads || 0;
            document.getElementById('errors').textContent = analytics.summary.totalErrors || 0;
        }
    }

    initCharts(analytics) {
        // Traffic Chart
        const trafficCtx = document.getElementById('trafficChart').getContext('2d');
        this.charts.traffic = new Chart(trafficCtx, {
            type: 'line',
            data: {
                labels: analytics.pageViews?.map(p => this.formatDate(p.date)) || [],
                datasets: [{
                    label: 'Page Views',
                    data: analytics.pageViews?.map(p => p.views) || [],
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                }
            }
        });

        // Storage Chart
        const storageCtx = document.getElementById('storageChart').getContext('2d');
        this.charts.storage = new Chart(storageCtx, {
            type: 'doughnut',
            data: {
                labels: ['Used', 'Available'],
                datasets: [{
                    data: [0, 100], // Will be updated with actual data
                    backgroundColor: ['#3b82f6', '#e5e7eb']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });

        // Analytics Chart
        const analyticsCtx = document.getElementById('analyticsChart').getContext('2d');
        this.charts.analytics = new Chart(analyticsCtx, {
            type: 'bar',
            data: {
                labels: analytics.pageViews?.map(p => this.formatDate(p.date)) || [],
                datasets: [
                    {
                        label: 'Page Views',
                        data: analytics.pageViews?.map(p => p.views) || [],
                        backgroundColor: '#3b82f6'
                    },
                    {
                        label: 'Downloads',
                        data: analytics.downloads?.map(d => d.downloads) || [],
                        backgroundColor: '#10b981'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' }
                }
            }
        });
    }

    async loadRecentActivity() {
        try {
            const response = await this.apiCall('/api/users/stats', 'GET');
            if (response.recentActivity && response.recentActivity.length > 0) {
                const activityHtml = response.recentActivity.map(activity => `
                    <div style="padding: 1rem; border-bottom: 1px solid var(--border-color);">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong>${this.formatActivityType(activity.activity_type)}</strong>
                                <div style="color: var(--text-secondary); font-size: 0.875rem;">
                                    ${activity.activity_description}
                                </div>
                            </div>
                            <div style="color: var(--text-secondary); font-size: 0.75rem;">
                                ${this.formatDate(activity.activity_date)}
                            </div>
                        </div>
                    </div>
                `).join('');
                document.getElementById('recentActivity').innerHTML = activityHtml;
            }
        } catch (error) {
            console.error('Failed to load recent activity:', error);
        }
    }

    updateUserUI() {
        if (this.user) {
            document.getElementById('userEmail').textContent = this.user.email;
            document.getElementById('userAvatar').textContent = 
                this.user.firstName?.[0] || this.user.email?.[0]?.toUpperCase() || 'U';
            
            // Update settings form
            document.getElementById('firstName').value = this.user.firstName || '';
            document.getElementById('lastName').value = this.user.lastName || '';
            document.getElementById('email').value = this.user.email || '';
        }
    }

    setupEventListeners() {
        // Setup form submissions
        document.getElementById('settingsForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateSettings();
        });

        document.getElementById('passwordForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.changePassword();
        });
    }

    async loadDomains() {
        try {
            const response = await this.apiCall('/api/domains', 'GET');
            const tbody = document.getElementById('domainsTable');
            
            if (response.domains && response.domains.length > 0) {
                tbody.innerHTML = response.domains.map(domain => `
                    <tr>
                        <td>${domain.domain_name}</td>
                        <td><span class="badge badge-${this.getStatusClass(domain.status)}">${domain.status}</span></td>
                        <td><span class="badge badge-${this.getStatusClass(domain.ssl_status)}">${domain.ssl_status}</span></td>
                        <td>${this.formatDate(domain.created_at)}</td>
                        <td>
                            <button class="btn btn-sm btn-secondary" onclick="dashboard.showDNSConfig('${domain.id}')">DNS</button>
                            <button class="btn btn-sm btn-primary" onclick="dashboard.verifyDomain('${domain.id}')">Verify</button>
                        </td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No domains found</td></tr>';
            }
        } catch (error) {
            console.error('Failed to load domains:', error);
            document.getElementById('domainsTable').innerHTML = 
                '<tr><td colspan="5" style="text-align: center;">Failed to load domains</td></tr>';
        }
    }

    async loadFiles() {
        try {
            const response = await this.apiCall('/api/files', 'GET');
            const tbody = document.getElementById('filesTable');
            
            if (response.files && response.files.length > 0) {
                tbody.innerHTML = response.files.map(file => `
                    <tr>
                        <td>${file.original_name}</td>
                        <td>${this.formatBytes(file.file_size)}</td>
                        <td>${file.mime_type}</td>
                        <td><span class="badge badge-${file.is_public ? 'success' : 'gray'}">${file.is_public ? 'Yes' : 'No'}</span></td>
                        <td>${file.download_count}</td>
                        <td>
                            <button class="btn btn-sm btn-secondary" onclick="dashboard.downloadFile('${file.id}')">Download</button>
                            <button class="btn btn-sm btn-danger" onclick="dashboard.deleteFile('${file.id}')">Delete</button>
                        </td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No files found</td></tr>';
            }
        } catch (error) {
            console.error('Failed to load files:', error);
            document.getElementById('filesTable').innerHTML = 
                '<tr><td colspan="6" style="text-align: center;">Failed to load files</td></tr>';
        }
    }

    async apiCall(endpoint, method = 'GET', data = null) {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`
            }
        };

        if (data && method !== 'GET') {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(endpoint, options);
        
        if (response.status === 401) {
            this.redirectToLogin();
            return;
        }

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'API request failed');
        }

        return result;
    }

    async addDomain(event) {
        event.preventDefault();
        const formData = new FormData(event.target);
        
        try {
            const response = await this.apiCall('/api/domains', 'POST', {
                domainName: formData.get('domainName'),
                autoRenew: formData.get('autoRenew') === 'on'
            });
            
            this.showNotification('Domain added successfully!', 'success');
            this.closeModal('addDomainModal');
            await this.loadDomains();
        } catch (error) {
            this.showNotification(error.message || 'Failed to add domain', 'danger');
        }
    }

    async uploadFile(input) {
        const files = input.files;
        if (!files.length) return;

        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('isPublic', 'false');

            try {
                const response = await fetch('/api/files/upload', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`
                    },
                    body: formData
                });

                const result = await response.json();
                
                if (response.ok) {
                    this.showNotification(`File ${file.name} uploaded successfully!`, 'success');
                } else {
                    this.showNotification(result.error || 'Failed to upload file', 'danger');
                }
            } catch (error) {
                this.showNotification('Failed to upload file', 'danger');
            }
        }

        await this.loadFiles();
        input.value = ''; // Clear input
    }

    async downloadFile(fileId) {
        try {
            const response = await fetch(`/api/files/download/${fileId}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = response.headers.get('Content-Disposition')?.split('filename=')[1] || 'file';
                a.click();
                window.URL.revokeObjectURL(url);
            } else {
                const result = await response.json();
                this.showNotification(result.error || 'Failed to download file', 'danger');
            }
        } catch (error) {
            this.showNotification('Failed to download file', 'danger');
        }
    }

    async deleteFile(fileId) {
        if (!confirm('Are you sure you want to delete this file?')) return;

        try {
            await this.apiCall(`/api/files/${fileId}`, 'DELETE');
            this.showNotification('File deleted successfully!', 'success');
            await this.loadFiles();
        } catch (error) {
            this.showNotification(error.message || 'Failed to delete file', 'danger');
        }
    }

    async verifyDomain(domainId) {
        try {
            const response = await this.apiCall(`/api/domains/${domainId}/verify`, 'POST');
            this.showNotification('Domain verification initiated!', 'success');
            await this.loadDomains();
        } catch (error) {
            this.showNotification(error.message || 'Failed to verify domain', 'danger');
        }
    }

    async showDNSConfig(domainId) {
        try {
            const response = await this.apiCall(`/api/domains/${domainId}/dns`, 'GET');
            
            let dnsInfo = `
                <h3>DNS Configuration for ${response.domainName}</h3>
                <div style="background: #f3f4f6; padding: 1rem; border-radius: 0.5rem; margin: 1rem 0;">
                    <h4>Required DNS Records:</h4>
            `;
            
            response.instructions.records.forEach(record => {
                dnsInfo += `
                    <div style="margin: 0.5rem 0;">
                        <strong>Type:</strong> ${record.type}<br>
                        <strong>Name:</strong> ${record.name}<br>
                        <strong>Value:</strong> ${record.value}<br>
                        <strong>TTL:</strong> ${record.ttl}
                    </div>
                    <hr>
                `;
            });
            
            dnsInfo += '</div>';
            
            this.showDNSModal(dnsInfo);
        } catch (error) {
            this.showNotification(error.message || 'Failed to get DNS configuration', 'danger');
        }
    }

    async updateSettings() {
        try {
            const formData = new FormData(document.getElementById('settingsForm'));
            await this.apiCall('/api/users/profile', 'PUT', {
                firstName: formData.get('firstName'),
                lastName: formData.get('lastName'),
                email: formData.get('email')
            });
            
            this.showNotification('Profile updated successfully!', 'success');
            await this.loadUser();
        } catch (error) {
            this.showNotification(error.message || 'Failed to update profile', 'danger');
        }
    }

    async changePassword() {
        try {
            const formData = new FormData(document.getElementById('passwordForm'));
            const newPassword = formData.get('newPassword');
            const confirmPassword = formData.get('confirmPassword');
            
            if (newPassword !== confirmPassword) {
                this.showNotification('Passwords do not match', 'danger');
                return;
            }
            
            await this.apiCall('/api/users/password', 'PUT', {
                currentPassword: formData.get('currentPassword'),
                newPassword: newPassword
            });
            
            this.showNotification('Password changed successfully!', 'success');
            document.getElementById('passwordForm').reset();
        } catch (error) {
            this.showNotification(error.message || 'Failed to change password', 'danger');
        }
    }

    // Utility methods
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }

    formatActivityType(type) {
        const types = {
            'file_upload': '📁 File Upload',
            'domain_added': '🌐 Domain Added',
            'file_download': '⬇️ File Download',
            'page_view': '👁️ Page View'
        };
        return types[type] || type;
    }

    getStatusClass(status) {
        const classes = {
            'active': 'success',
            'pending': 'warning',
            'error': 'danger',
            'expired': 'danger'
        };
        return classes[status] || 'gray';
    }

    showNotification(message, type = 'success') {
        const notification = document.getElementById('notification');
        const messageElement = document.getElementById('notificationMessage');
        
        notification.className = `alert alert-${type}`;
        messageElement.textContent = message;
        notification.style.display = 'block';
        
        setTimeout(() => {
            notification.style.display = 'none';
        }, 5000);
    }

    showDNSModal(content) {
        // Create or update DNS modal
        let dnsModal = document.getElementById('dnsModal');
        if (!dnsModal) {
            dnsModal = document.createElement('div');
            dnsModal.id = 'dnsModal';
            dnsModal.className = 'modal';
            dnsModal.innerHTML = `
                <div class="modal-content" style="max-width: 600px;">
                    <div class="modal-header">
                        <h2 class="modal-title">DNS Configuration</h2>
                        <button class="modal-close" onclick="dashboard.closeModal('dnsModal')">&times;</button>
                    </div>
                    <div id="dnsModalContent"></div>
                </div>
            `;
            document.body.appendChild(dnsModal);
        }
        
        document.getElementById('dnsModalContent').innerHTML = content;
        dnsModal.classList.add('active');
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
        }
    }

    redirectToLogin() {
        localStorage.removeItem('token');
        window.location.href = '/login.html';
    }

    updateUI() {
        // Update any remaining UI elements
        this.updateUserUI();
    }
}

// Global functions for onclick handlers
function showSection(section) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
    
    // Show selected section
    document.getElementById(`${section}-section`).style.display = 'block';
    
    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelector(`[href="#${section}"]`).classList.add('active');
    
    // Load section-specific data
    switch(section) {
        case 'domains':
            dashboard.loadDomains();
            break;
        case 'files':
            dashboard.loadFiles();
            break;
    }
    
    dashboard.currentSection = section;
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('active');
}

function showAddDomainModal() {
    document.getElementById('addDomainModal').classList.add('active');
}

function uploadFile(input) {
    dashboard.uploadFile(input);
}

// Initialize dashboard
let dashboard;
document.addEventListener('DOMContentLoaded', () => {
    dashboard = new HostingDashboard();
});