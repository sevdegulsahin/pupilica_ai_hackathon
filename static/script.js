async function apiRequest(endpoint, method = 'POST', body = null) {
    const config = {
        method,
        headers: { 'Content-Type': 'application/json' }
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
        const data = await apiRequest('/auth/signup', 'POST', { email, password });
        if (data) {
            alert('Kayıt başarılı! Şimdi giriş yapabilirsiniz.');
            this.toggleForm();
        }
    },
    async login() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        if (!email || !password) return alert('Lütfen e-posta ve şifre alanlarını doldurun.');
        const data = await apiRequest('/auth/login', 'POST', { email, password });
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
        const profileData = {
            height: parseInt(document.getElementById('height').value),
            weight: parseInt(document.getElementById('weight').value),
            birth_date: document.getElementById('birth_date').value,
            gender: document.getElementById('gender').value,
            activity_level: document.getElementById('activity_level').value,
            sleep_hours: parseInt(document.getElementById('sleep_hours').value),
            dietary_preferences: [],
            disliked_foods: document.getElementById('disliked_foods').value.split(',').map(s => s.trim()).filter(Boolean),
            targets: { goal: document.getElementById('target').value },
            health_conditions: {
                diseases: document.getElementById('diseases_text').value.split(',').map(s => s.trim()).filter(Boolean),
                allergies: Array.from(document.querySelectorAll('input[id^="allergy_"]:checked')).map(el => el.value)
            }
        };
        const data = await apiRequest('/user/profile', 'POST', profileData);
        if (data) {
            window.location.href = '/dashboard';
        }
    }
};


// --- UYGULAMA, DASHBOARD VE PROFİL GÖRÜNTÜLEME MANTIĞI ---
const app = {
    chatHistory: [],
    dailyLogData: null,
    dailyRecipesData: [],

    async sendMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        if (!message) return;

        // 1. Kullanıcı mesajını arayüze ve geçmişe ekle
        this.addMessageToChat(message, 'user');
        this.chatHistory.push({ role: 'user', parts: [{ text: message }] });
        input.value = '';
        input.focus();

        // 2. Güncellenmiş sohbet geçmişini API'ye gönder
        const data = await apiRequest('/chat', 'POST', {
            history: this.chatHistory
        });

        if (data) {
            // 3. AI cevabını arayüze ve geçmişe ekle
            this.addMessageToChat(data.reply, 'ai');
            this.chatHistory.push({ role: 'model', parts: [{ text: data.reply }] });
        }
    },

    addMessageToChat(content, sender) {
        const container = document.getElementById('chat-messages');
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${sender}-message`;
        // Not: AI'dan gelen markdown'ı (örn: **, *) işlemek için innerHTML kullanabiliriz.
        // Şimdilik textContent daha güvenli.
        msgDiv.textContent = content;
        container.appendChild(msgDiv);
        container.scrollTop = container.scrollHeight;
    },

    async logout() {
        await apiRequest('/auth/logout');
        window.location.href = '/login';
    },

    // app objesinin içindeki loadPageData fonksiyonunu güncelliyoruz
    // app objesi içindeki loadPageData fonksiyonunun olması gereken son hali

    async loadPageData() {
        const bodyId = document.body.id;

        // --- DASHBOARD SAYFASI İÇİN VERİ YÜKLEME ---
        if (bodyId === 'dashboard-page-body') {
            // Profil verisini çek ve hedefi güncelle
            const profileData = await apiRequest('/user/profile', 'GET');
            if (profileData && profileData.targets) {
                const targetInfo = document.getElementById('target-info');
                if (targetInfo) {
                    targetInfo.textContent = (profileData.targets.goal || 'Belirtilmemiş').replace(/^\w/, c => c.toUpperCase());
                }
            }

            // Günlük log verisini çek ve arayüzü güncelle
            this.dailyLogData = await apiRequest('/log/today', 'GET');
            if (this.dailyLogData) {
                this.renderDailyLog();
            }

            // Günlük tarifleri yükle
            this.loadDailyRecipes();
        }

        // --- PROFİL GÖRÜNTÜLEME SAYFASI İÇİN VERİ YÜKLEME ---
        if (bodyId === 'view-profile-page-body') {
            // 1. ÖNCE API'DAN VERİYİ ÇEK VE 'profileData' DEĞİŞKENİNE ATA
            const profileData = await apiRequest('/user/profile', 'GET');

            // 2. VERİ GELMEDİYSE, FONKSİYONDAN ÇIK
            if (!profileData) {
                console.error("Profil sayfasında veri yüklenemedi.");
                // İsteğe bağlı olarak kullanıcıya bir hata mesajı gösterebilirsiniz.
                // Örneğin: document.body.innerHTML = "<h1>Profil verileri yüklenemedi.</h1>";
                return;
            }

            // 3. Veriyi HTML elementlerine yazan yardımcı fonksiyonlar
            const display = (id, value) => {
                const element = document.getElementById(id);
                if (element) element.textContent = value || 'Belirtilmemiş';
            };
            const displayArray = (id, arr) => {
                const element = document.getElementById(id);
                if (element) element.textContent = arr && arr.length > 0 ? arr.join(', ') : 'Yok';
            };

            // 4. ARTIK TANIMLI OLAN 'profileData' DEĞİŞKENİNİ KULLANARAK BİLGİLERİ DOLDUR
            display('height-info', profileData.height);
            display('weight-info', profileData.weight);
            display('gender-info', profileData.gender);
            display('activity-info', profileData.activity_level);
            display('sleep-info', profileData.sleep_hours);
            // `targets` ve `health_conditions` objelerinin varlığını kontrol etmek daha güvenlidir
            display('target-info', profileData.targets ? profileData.targets.goal : 'Belirtilmemiş');
            displayArray('diseases-info', profileData.health_conditions ? profileData.health_conditions.diseases : []);
            displayArray('allergies-info', profileData.health_conditions ? profileData.health_conditions.allergies : []);
            displayArray('disliked-info', profileData.disliked_foods);
        }
    },
    renderDailyLog() {
        if (!this.dailyLogData) return;
        document.getElementById('water-count').textContent = this.dailyLogData.water_intake;
        const completedMeals = this.dailyLogData.completed_meals || {};
        let consumedCalories = 0;
        for (const meal in completedMeals) {
            consumedCalories += completedMeals[meal].calories || 0;
        }
        document.getElementById('calories-consumed').textContent = consumedCalories;
        const targetCalories = 2000;
        document.getElementById('calories-target').textContent = targetCalories;
        const progressPercent = Math.min(100, (consumedCalories / targetCalories) * 100);
        document.getElementById('calories-progress').style.width = `${progressPercent}%`;
        document.querySelectorAll('.recipe-card[data-meal-type]').forEach(card => {
            const mealType = card.dataset.mealType;
            const button = card.querySelector('.complete-meal-btn');
            if (completedMeals[mealType]?.completed) {
                card.classList.add('completed');
                button.textContent = 'Afiyet Olsun!';
                button.disabled = true;
            } else {
                card.classList.remove('completed');
                button.textContent = 'Bu Öğünü Yedim';
                button.disabled = false;
            }
        });
    },
    // script.js'deki app.loadDailyRecipes fonksiyonunu bununla değiştirin

    async loadDailyRecipes() {
        const container = document.getElementById('daily-recipes-container');
        const loadingMessage = document.getElementById('recipes-loading');

        try {
            // 1. Ayrı bir API çağırmak yerine, tüm haftalık planı çekiyoruz.
            const weeklyPlan = await apiRequest('/recipes/weekly', 'GET');
            if (!weeklyPlan) {
                throw new Error('Haftalık plan verisi alınamadı.');
            }

            // 2. JavaScript ile bugünün gününü tespit et.
            // Not: getDay() Pazar=0, Pzt=1... şeklinde döner.
            const dayIndex = new Date().getDay();
            const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const todayKey = dayMap[dayIndex];

            // 3. Haftalık plandan bugünün öğünlerini al.
            const todaysRecipes = weeklyPlan[todayKey];
            if (!todaysRecipes) {
                throw new Error('Bugün için haftalık planda tarif bulunamadı.');
            }

            // 4. Aldığımız tarifleri `dailyRecipesData`'ya aktar ve render et.
            // DİKKAT: `todaysRecipes` bir obje olduğu için (`{lunch: ..., dinner: ...}`),
            // bunu bir diziye çevirmemiz gerekiyor.
            this.dailyRecipesData = Object.entries(todaysRecipes).map(([mealType, recipeData]) => {
                return {
                    ...recipeData,
                    meal_type: mealType.charAt(0).toUpperCase() + mealType.slice(1) // 'lunch' -> 'Lunch'
                };
            });

            loadingMessage.style.display = 'none';
            container.innerHTML = '';

            // 5. Arayüzü oluştur (bu kısım neredeyse aynı).
            this.dailyRecipesData.forEach((recipe, index) => {
                const recipeCard = document.createElement('div');
                recipeCard.className = 'recipe-card';
                recipeCard.dataset.index = index;
                recipeCard.dataset.mealType = recipe.meal_type.toLowerCase();

                recipeCard.innerHTML = `
                <img src="${recipe.image_url}" alt="${recipe.title}" loading="lazy">
                <div class="recipe-card-content">
                    <span class="meal-type-badge">${recipe.meal_type}</span>
                    <h4>${recipe.title}</h4>
                    <p>${recipe.description}</p>
                    <p><strong>Tahmini Kalori:</strong> ${recipe.calories || 'N/A'} kcal</p>
                    <button class="complete-meal-btn" data-meal-type="${recipe.meal_type.toLowerCase()}" data-calories="${recipe.calories || 0}">Bu Öğünü Yedim</button>
                </div>
            `;
                container.appendChild(recipeCard);
            });

            // Arayüzü, veritabanından gelen en son log verisine göre güncelle.
            this.renderDailyLog();

        } catch (error) {
            console.error("Günlük tarifleri yüklerken hata:", error);
            loadingMessage.textContent = 'Bugünün menüsü yüklenirken bir hata oluştu.';
        }
    },
    async updateLog() {
        if (!this.dailyLogData) return; // Veri henüz yüklenmediyse bir şey yapma

        // Sadece güncellenecek veriyi gönderiyoruz
        const updatedData = {
            water_intake: this.dailyLogData.water_intake,
            completed_meals: this.dailyLogData.completed_meals
        };

        const response = await apiRequest('/log/update', 'POST', updatedData);
        if (response) {
            // Sunucudan gelen en son haliyle lokal veriyi tekrar güncelle
            this.dailyLogData = response;
            this.renderDailyLog(); // Arayüzü en son veriye göre yeniden çiz
        }
    },
    handleWaterClick(action) {
        if (!this.dailyLogData) return;
        const currentIntake = this.dailyLogData.water_intake || 0;
        this.dailyLogData.water_intake = action === 'add' ? currentIntake + 1 : Math.max(0, currentIntake - 1);
        this.updateLog(); // Değişikliği sunucuya gönder
    },

    handleMealComplete(mealType, calories) {
        if (!this.dailyLogData) return;
        // completed_meals objesinin var olduğundan emin ol
        if (!this.dailyLogData.completed_meals) {
            this.dailyLogData.completed_meals = {};
        }
        this.dailyLogData.completed_meals[mealType] = { completed: true, calories: calories };
        this.updateLog(); // Değişikliği sunucuya gönder
    },
    // YENİ: Modalı dolduran ve gösteren fonksiyon
    showRecipeModal(recipe) {
        document.getElementById('modal-recipe-image').src = recipe.image_url;
        document.getElementById('modal-recipe-title').textContent = recipe.title;

        const ingredientsList = document.getElementById('modal-recipe-ingredients');
        ingredientsList.innerHTML = recipe.ingredients.map(ing => `<li>${ing}</li>`).join('');

        const instructionsList = document.getElementById('modal-recipe-instructions');
        instructionsList.innerHTML = recipe.instructions.map(step => `<li>${step}</li>`).join('');

        document.getElementById('recipe-modal').style.display = 'flex';
    },

    // YENİ: Modalı gizleyen fonksiyon
    hideRecipeModal() {
        document.getElementById('recipe-modal').style.display = 'none';
    },

    // --- BU OLMASI GEREKEN YENİ KOD ---
    init() {
        const bodyId = document.body.id;
        if (bodyId === 'app-page-body') {
            const chatInput = document.getElementById('chat-input');
            if (chatInput) {
                chatInput.addEventListener('keyup', (e) => {
                    if (e.key === 'Enter') this.sendMessage();
                });
            }
            const initialMessage = document.querySelector('.message.ai-message');
            if (initialMessage && this.chatHistory.length === 0) {
                this.chatHistory.push({ role: 'model', parts: [{ text: initialMessage.textContent.trim() }] });
            }
        }
        if (bodyId === 'dashboard-page-body') {
            // GÜNCELLEME: Artık yeni 'handle' fonksiyonlarını çağırıyoruz
            document.getElementById('add-water-btn').addEventListener('click', () => this.handleWaterClick('add'));
            document.getElementById('remove-water-btn').addEventListener('click', () => this.handleWaterClick('remove'));

            const dailyRecipesContainer = document.getElementById('daily-recipes-container');
            if (dailyRecipesContainer) {
                dailyRecipesContainer.addEventListener('click', (e) => {
                    // Öğün tamamlama butonu
                    if (e.target.classList.contains('complete-meal-btn')) {
                        const button = e.target;
                        if (!button.disabled) {
                            const mealType = button.dataset.mealType;
                            const calories = parseInt(button.dataset.calories, 10);
                            // GÜNCELLEME: Artık yeni 'handle' fonksiyonunu çağırıyoruz
                            this.handleMealComplete(mealType, calories);
                        }
                        return; // Diğer tıklama olayını engelle
                    }

                    // Tarif detay modalını açma
                    const card = e.target.closest('.recipe-card');
                    if (card && this.dailyRecipesData && this.dailyRecipesData[card.dataset.index]) {
                        this.showRecipeModal(this.dailyRecipesData[card.dataset.index]);
                    }
                });
            }

            // Modal kapatma olayları (bu kısım aynı kalıyor)
            const recipeModal = document.getElementById('recipe-modal');
            if (recipeModal) {
                recipeModal.querySelector('.close-button').addEventListener('click', () => this.hideRecipeModal());
                recipeModal.addEventListener('click', (e) => {
                    if (e.target === recipeModal) this.hideRecipeModal();
                });
            }
        }
    }
};


const weeklyPlan = {
    planData: null, // Haftalık plan verisini saklamak için
    dayTranslations: { // API'den gelen İngilizce günleri Türkçeye çevirmek için
        monday: 'Pazartesi', tuesday: 'Salı', wednesday: 'Çarşamba',
        thursday: 'Perşembe', friday: 'Cuma', saturday: 'Cumartesi', sunday: 'Pazar'
    },
    mealTranslations: {
        breakfast: 'Kahvaltı', lunch: 'Öğle Yemeği', dinner: 'Akşam Yemeği'
    },


    init() {
        // Butonlara olay dinleyicileri ekle
        document.getElementById('new-plan-btn').addEventListener('click', () => this.loadWeeklyPlan(true));
        document.getElementById('shopping-list-btn').addEventListener('click', () => this.showShoppingList());

        // Modal kapatma olayları
        const modal = document.getElementById('shopping-list-modal');
        modal.querySelector('.close-button').addEventListener('click', () => this.hideShoppingList());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.hideShoppingList();
        });

        // Sayfa ilk yüklendiğinde planı otomatik olarak çek
        this.loadWeeklyPlan(false);
    },

    async loadWeeklyPlan(forceNew) {
        const container = document.getElementById('weekly-grid-container');
        const loadingIndicator = document.getElementById('plan-loading');

        // Eğer "Yeni Plan Oluştur" butonuna basıldıysa...
        if (forceNew) {
            // Önce mevcut planı veritabanından silmek için API'yi çağır.
            await apiRequest('/recipes/weekly/delete', 'POST');
        }

        container.innerHTML = '';
        loadingIndicator.style.display = 'block';

        try {
            // Şimdi haftalık planı iste. Backend, veritabanında plan yoksa
            // otomatik olarak yeni bir tane oluşturacak.
            const data = await apiRequest('/recipes/weekly', 'GET');
            if (data) {
                this.planData = data;
                this.renderPlan();
            } else {
                container.innerHTML = '<p>Haftalık plan yüklenirken bir hata oluştu.</p>';
            }
        } finally {
            loadingIndicator.style.display = 'none';
        }
    },


    renderPlan() {
        const container = document.getElementById('weekly-grid-container');
        container.innerHTML = ''; // Konteyneri temizle

        // Günleri doğru sırada render etmek için
        const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

        for (const day of dayOrder) {
            const meals = this.planData[day];
            if (!meals) continue;

            const dayCard = document.createElement('div');
            dayCard.className = 'day-card';

            let mealHTML = '';
            for (const mealType in meals) {
                const recipe = meals[mealType];
                mealHTML += `
                    <div class="meal-item">
                        <img src="${recipe.image_url}" alt="${recipe.title}" loading="lazy">
                        <div class="meal-info">
                            <strong>${this.mealTranslations[mealType] || mealType}</strong>
                            <p>${recipe.title}</p>
                        </div>
                    </div>
                `;
            }

            dayCard.innerHTML = `
                <h3>${this.dayTranslations[day] || day}</h3>
                <div class="meals-container">
                    ${mealHTML}
                </div>
            `;
            container.appendChild(dayCard);
        }
    },

    async showShoppingList() {
        if (!this.planData) {
            alert('Lütfen önce bir haftalık plan oluşturun.');
            return;
        }

        const modal = document.getElementById('shopping-list-modal');
        const contentContainer = document.getElementById('shopping-list-content');
        contentContainer.innerHTML = '<p>Alışveriş listeniz hazırlanıyor...</p>';
        modal.style.display = 'flex';

        const shoppingList = await apiRequest('/shopping-list', 'POST', this.planData);

        if (shoppingList) {
            contentContainer.innerHTML = ''; // Temizle
            for (const category in shoppingList) {
                const categoryDiv = document.createElement('div');
                categoryDiv.className = 'shopping-list-category';

                const itemsHTML = shoppingList[category].map(item => `<li>${item}</li>`).join('');

                categoryDiv.innerHTML = `
                    <h4>${category}</h4>
                    <ul>${itemsHTML}</ul>
                `;
                contentContainer.appendChild(categoryDiv);
            }
        } else {
            contentContainer.innerHTML = '<p>Liste oluşturulurken bir hata oluştu.</p>';
        }
    },

    hideShoppingList() {
        document.getElementById('shopping-list-modal').style.display = 'none';
    }
};
document.addEventListener('DOMContentLoaded', () => {
    const bodyId = document.body.id;

    // Her sayfa için kendi init fonksiyonunu çağır
    if (bodyId === 'profile-page-body') {
        profile.init();
    }
    if (bodyId === 'app-page-body' || bodyId === 'dashboard-page-body' || bodyId === 'view-profile-page-body') {
        app.init();
    }
    if (bodyId === 'weekly-plan-page-body') {
        weeklyPlan.init();
    }

    // Veri yüklemesi gerektiren sayfalar için loadPageData'yı çağır
    if (bodyId === 'dashboard-page-body' || bodyId === 'view-profile-page-body') {
        app.loadPageData();
    }
});