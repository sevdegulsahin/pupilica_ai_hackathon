// --- API İSTEK YARDIMCISI ---
async function apiRequest(endpoint, method = 'POST', body = null) {
    const config = {
        method,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    if (body) {
        config.body = JSON.stringify(body);
    }
    try {
        const response = await fetch(`/api${endpoint}`, config);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Bilinmeyen bir sunucu hatası oluştu.');
        }
        return data;
    } catch (error) {
        alert(`Hata: ${error.message}`);
        return null;
    }
}

// --- GİRİŞ SAYFASI (login.html) MANTIĞI ---
const auth = {
    toggleForm() {
        document.getElementById('login-form').style.display = document.getElementById('login-form').style.display === 'none' ? 'block' : 'none';
        document.getElementById('signup-form').style.display = document.getElementById('signup-form').style.display === 'none' ? 'block' : 'none';
    },
    async signup() {
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        if (!email || !password) return alert('Lütfen e-posta ve şifre alanlarını doldurun.');
        const data = await apiRequest('/auth/signup', 'POST', {
            email,
            password
        });
        if (data) {
            alert('Kayıt başarılı! Şimdi giriş yapabilirsiniz.');
            this.toggleForm();
        }
    },
    async login() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        if (!email || !password) return alert('Lütfen e-posta ve şifre alanlarını doldurun.');
        const data = await apiRequest('/auth/login', 'POST', {
            email,
            password
        });
        if (data) {
            window.location.href = '/';
        }
    }
};

// --- PROFİL DÜZENLEME (profile.html) MANTIĞI ---
const profile = {
    currentStep: 1,
    init() {
        this.showStep(this.currentStep);
        this.loadProfileForEditing();
    },
    async loadProfileForEditing() {
        const data = await apiRequest('/user/profile', 'GET');
        if (!data) return;
        document.getElementById('height').value = data.height || '';
        document.getElementById('weight').value = data.weight || '';
        document.getElementById('birth_date').value = data.birth_date || '';
        document.getElementById('gender').value = data.gender || '';
        document.getElementById('activity_level').value = data.activity_level || '';
        document.getElementById('sleep_hours').value = data.sleep_hours || '';
        document.getElementById('target').value = data.targets?.goal || '';
        document.getElementById('disliked_foods').value = data.disliked_foods?.join(', ') || '';
        document.getElementById('diseases_text').value = data.health_conditions?.diseases?.join(', ') || '';
        data.health_conditions?.allergies?.forEach(allergy => {
            const checkbox = document.querySelector(`input[type="checkbox"][value="${allergy}"]`);
            if (checkbox) checkbox.checked = true;
        });
    },
    navigate(n) {
        this.currentStep += n;
        this.showStep(this.currentStep);
    },
    showStep(n) {
        document.querySelectorAll('.wizard-step').forEach(step => step.style.display = 'none');
        document.querySelector(`.wizard-step[data-step="${n}"]`).style.display = 'block';
        document.querySelectorAll('.progress-step').forEach(p => p.classList.remove('active'));
        document.querySelector(`.progress-step[data-step="${n}"]`).classList.add('active');
        document.getElementById('prevBtn').style.display = (n === 1) ? 'none' : 'inline-block';
        document.getElementById('nextBtn').style.display = (n === 4) ? 'none' : 'inline-block';
        document.getElementById('submitBtn').style.display = (n === 4) ? 'inline-block' : 'none';
    },
    async update() {
        try {
            const height = document.getElementById('height').value;
            const weight = document.getElementById('weight').value;
            const birth_date = document.getElementById('birth_date').value;
            const gender = document.getElementById('gender').value;
            const activity_level = document.getElementById('activity_level').value;
            const sleep_hours = document.getElementById('sleep_hours').value;
            const target = document.getElementById('target').value;
            if (!height || !weight || !birth_date || !gender || !activity_level || !sleep_hours || !target) {
                alert('Lütfen tüm zorunlu alanları doldurduğunuzdan emin olun.');
                return;
            }
            const allergies = [];
            document.querySelectorAll('input[id^="allergy_"]:checked').forEach(el => allergies.push(el.value));
            const profileData = {
                height: parseInt(height),
                weight: parseInt(weight),
                birth_date: birth_date,
                gender: gender,
                activity_level: activity_level,
                sleep_hours: parseInt(sleep_hours),
                dietary_preferences: [],
                disliked_foods: document.getElementById('disliked_foods').value.split(',').map(s => s.trim()).filter(Boolean),
                targets: {
                    goal: target
                },
                health_conditions: {
                    diseases: document.getElementById('diseases_text').value.split(',').map(s => s.trim()).filter(Boolean),
                    allergies: allergies
                }
            };
            const data = await apiRequest('/user/profile', 'POST', profileData);
            if (data) {
                window.location.href = '/dashboard';
            }
        } catch (error) {
            alert("Profil güncellenirken bir JavaScript hatası oluştu: " + error.message);
        }
    }
};

// --- UYGULAMA, DASHBOARD VE PROFİL GÖRÜNTÜLEME MANTIĞI ---
const app = {
    async sendMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        if (!message) return;
        this.addMessageToChat(message, 'user');
        input.value = '';
        const data = await apiRequest('/chat', 'POST', {
            message
        });
        if (data) {
            this.addMessageToChat(data.reply, 'ai');
        }
    },
    addMessageToChat(content, sender) {
        const container = document.getElementById('chat-messages');
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${sender}-message`;
        msgDiv.textContent = content;
        container.appendChild(msgDiv);
        container.scrollTop = container.scrollHeight;
    },
    async logout() {
        await apiRequest('/auth/logout');
        window.location.href = '/login';
    },
    async loadPageData() {
        const data = await apiRequest('/user/profile', 'GET');
        if (!data) return;
        const bodyId = document.body.id;
        if (bodyId === 'dashboard-page-body') {
            const targetInfo = document.getElementById('target-info');
            if (targetInfo) {
                const target = data.targets?.goal || 'Belirtilmemiş';
                targetInfo.textContent = target.charAt(0).toUpperCase() + target.slice(1);
            }
            const bmiInfo = document.getElementById('bmi-info');
            if (bmiInfo) {
                const height = data.height;
                const weight = data.weight;
                if (height && weight) {
                    const bmi = (weight / ((height / 100) ** 2)).toFixed(1);
                    bmiInfo.textContent = `${bmi} (Normal: 18.5-24.9)`;
                } else {
                    bmiInfo.textContent = 'Hesaplanamadı';
                }
            }
        }
        if (bodyId === 'view-profile-page-body') {
            const display = (id, value) => {
                document.getElementById(id).textContent = value || 'Belirtilmemiş';
            };
            const displayArray = (id, arr) => {
                document.getElementById(id).textContent = arr && arr.length > 0 ? arr.join(', ') : 'Yok';
            };
            display('height-info', data.height);
            display('weight-info', data.weight);
            display('gender-info', data.gender);
            display('activity-info', data.activity_level);
            display('sleep-info', data.sleep_hours);
            display('target-info', data.targets?.goal);
            displayArray('diseases-info', data.health_conditions?.diseases);
            displayArray('allergies-info', data.health_conditions?.allergies);
            displayArray('disliked-info', data.disliked_foods);
        }
    },
    init() {
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
            chatInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') this.sendMessage();
            });
        }
    }
};

// --- SAYFA YÜKLENDİĞİNDE ÇALIŞACAK ANA KOD ---
document.addEventListener('DOMContentLoaded', () => {
    const bodyId = document.body.id;
    if (bodyId === 'app-page-body') {
        app.init();
    } else if (bodyId === 'profile-page-body') {
        profile.init();
    } else if (bodyId === 'dashboard-page-body' || bodyId === 'view-profile-page-body') {
        app.loadPageData();
    }
});