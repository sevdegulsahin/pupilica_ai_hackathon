import os
import json
import requests
import google.generativeai as genai
from datetime import date
from datetime import timedelta
from flask import Flask, render_template, request, jsonify, redirect, url_for, make_response
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# Google Gemini API'sini yapılandır
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

# Flask uygulamasını ve Supabase istemcisini başlat
# YENİ VE GÜVENLİ KOD
app = Flask(__name__, template_folder='templates', static_folder='static')

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")

# EĞER BİLGİLER EKSİKSE, UYGULAMAYI BAŞLATMADAN HATA VER
if not supabase_url or not supabase_key:
    raise ValueError("KRİTİK HATA: SUPABASE_URL ve SUPABASE_KEY bilgileri .env dosyasında bulunamadı veya okunamadı. Lütfen .env dosyasının doğru yerde ve doğru bilgilerle dolu olduğundan emin olun.")

# Supabase istemcisini başlat
supabase: Client = create_client(supabase_url, supabase_key)

print("--- Supabase istemcisi başarıyla başlatıldı. ---")
def get_user_from_cookie(req):
    token = req.cookies.get('authToken')
    if not token: return None
    try:
        return supabase.auth.get_user(token).user
    except Exception:
        return None

# --- SAYFA YÖNLENDİRMELERİ (ROUTES) ---

@app.route('/')
def index_page():
    user = get_user_from_cookie(request)
    if not user:
        return redirect(url_for('login_page'))
    try:
        # Profilin varlığını ve 'targets' JSONB alanı içinde 'goal' olup olmadığını kontrol et
        profile_response = supabase.table('profiles').select('targets').eq('id', user.id).single().execute()
        profile_data = profile_response.data
        if not profile_data or not profile_data.get('targets') or not profile_data['targets'].get('goal'):
            # Eğer hedef belirlenmemişse, profili doldurma/düzenleme sayfasına yönlendir
            return redirect(url_for('edit_profile_page'))
        # Her şey tamamsa gösterge paneline yönlendir
        return redirect(url_for('dashboard_page'))
    except Exception:
        # Yeni kullanıcıların henüz profili olmayacağı için bu hatayı alırlar
        return redirect(url_for('edit_profile_page'))

@app.route('/login')
def login_page():
    if get_user_from_cookie(request):
        return redirect(url_for('dashboard_page'))
    return render_template('login.html')

@app.route('/dashboard')
def dashboard_page():
    if not get_user_from_cookie(request): return redirect(url_for('login_page'))
    return render_template('dashboard.html', user_logged_in=True)

@app.route('/uygulama')
def app_page():
    if not get_user_from_cookie(request): return redirect(url_for('login_page'))
    return render_template('app.html', user_logged_in=True)

@app.route('/profil')
def view_profile_page():
    user = get_user_from_cookie(request)
    if not user: return redirect(url_for('login_page'))
    return render_template('view_profile.html', user_logged_in=True, user_email=user.email)

@app.route('/profil/duzenle')
def edit_profile_page():
    if not get_user_from_cookie(request): return redirect(url_for('login_page'))
    return render_template('profile.html', user_logged_in=True)

# --- API ENDPOINTS ---

@app.route('/api/auth/signup', methods=['POST'])
def signup():
    data = request.get_json()
    try:
        res = supabase.auth.sign_up({"email": data['email'], "password": data['password']})
        if res.user:
            # Yeni kullanıcı için 'profiles' tablosunda bir satır oluştur
            # Bu, daha sonra 'upsert' ile doldurulacak
            supabase.table('profiles').insert({'id': res.user.id}).execute()
        return jsonify({'message': 'Kayıt başarılı!'}), 201
    except Exception as e: return jsonify({'error': str(e)}), 400

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    try:
        res = supabase.auth.sign_in_with_password({"email": data['email'], "password": data['password']})
        response = make_response(jsonify({'message': 'Giriş başarılı'}))
        response.set_cookie('authToken', res.session.access_token, httponly=True, max_age=3600*24*7, samesite='Lax')
        return response
    except Exception: return jsonify({'error': "E-posta veya şifre hatalı."}), 401

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    response = make_response(jsonify({'message': 'Çıkış başarılı'}))
    response.set_cookie('authToken', '', expires=0)
    return response

@app.route('/api/user/profile', methods=['GET', 'POST'])
def user_profile_api():
    user = get_user_from_cookie(request)
    if not user: return jsonify({'error': 'Yetkisiz erişim'}), 401

    # app.py -> user_profile_api fonksiyonu -> 'GET' bloğunu bununla değiştirin

    if request.method == 'GET':
        try:
            # Doğrudan tabloyu çağırmak yerine, güvenli RPC fonksiyonunu çağırıyoruz
            profile_res = supabase.rpc('get_my_profile', {}).execute()

            if not profile_res or not profile_res.data:
                return jsonify({'error': 'Profil bulunamadı.'}), 404
            
            # RPC'den dönen veri doğrudan .data içindedir
            return jsonify(profile_res.data)
            
        except Exception as e:
            print(f"Profil getirme hatası (RPC): {e}")
            return jsonify({'error': 'Profil verisi alınamadı.'}), 500

    if request.method == 'POST':
        try:
            profile_data = request.get_json()
            profile_data['id'] = user.id
            # Sizin JavaScript'inizin gönderdiği JSON objesi, Supabase'in jsonb kolonlarıyla tam uyumlu.
            # `upsert` metodu bu veriyi sorunsuz bir şekilde veritabanına işleyecektir.
            response = supabase.table('profiles').upsert(profile_data).execute()
            return jsonify(response.data[0])
        except Exception as e: return jsonify({'error': 'Profil güncellenemedi.'}), 500
# YENİ YARDIMCI FONKSİYON: Pexels'dan resim URL'si almak için
def get_image_url_from_pexels(query):
    api_key = os.getenv("PEXELS_API_KEY")
    if not api_key:
        # Eğer API anahtarı yoksa, varsayılan bir resim döndür
        return "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1"
    
    try:
        headers = {'Authorization': api_key}
        params = {'query': query, 'per_page': 1, 'orientation': 'landscape'}
        url = "https://api.pexels.com/v1/search"
        
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status() # Hatalı isteklerde (4xx veya 5xx) hata fırlatır
        
        data = response.json()
        if data['photos']:
            # 'medium' boyutundaki resmi alıyoruz, bu web için idealdir.
            return data['photos'][0]['src']['medium']
        else:
            # Resim bulunamazsa varsayılan resim
            return "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1"
    except Exception as e:
        print(f"Pexels API hatası: {e}")
        # Hata durumunda varsayılan resim
        return "https://images.pexels.com/photos/376464/pexels-photo-376464.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1"

  
@app.route('/api/chat', methods=['POST'])
def chat_with_ai():
    user = get_user_from_cookie(request)
    if not user: return jsonify({'error': 'Yetkisiz erişim'}), 401
    
    data = request.get_json()
    # Artık tek bir mesaj değil, tüm konuşma geçmişini alıyoruz
    history = data.get('history') 
    if not history: return jsonify({'error': 'Sohbet geçmişi boş olamaz'}), 400

    try:
        profile_res = supabase.table('profiles').select('*').eq('id', user.id).single().execute()
        profile_data = profile_res.data
        
        # Sistem talimatını güncelliyoruz:
        # 1. Daha net ve yapılandırılmış hale getiriyoruz.
        # 2. Cevapların kısa olması için net bir komut ekliyoruz.
        system_instruction = f"""
        Sen, NutriChat AI adında uzman bir diyetisyen ve beslenme asistanısın.
        Görevin, kullanıcının sorularına profesyonel, bilimsel temelli, empatik ve motive edici bir dille cevap vermektir.
        
        KULLANICI PROFİLİ: {profile_data}
        
        KURALLAR:
        1. Cevaplarını her zaman kısa, net ve anlaşılır tut. Birkaç cümleyi geçmemeye çalış.
        2. Kullanıcının profilindeki `targets` (hedefler) ve `health_conditions` (sağlık koşulları) alanlarını mutlaka dikkate al.
        3. Örneğin, kullanıcının 'diyabet' rahatsızlığı varsa şekerli gıdalar önerme. 'gluten' alerjisi varsa glutensiz alternatifler sun.
        4. Kesinlikle tıbbi tavsiye verme, sadece beslenme önerilerinde bulun. Her zaman bir doktora danışmaları gerektiğini hatırlatabilirsin.
        """
        
        # Modeli, sistem talimatı ile başlatmak daha verimlidir.
        model = genai.GenerativeModel(
            'gemini-1.5-flash-latest',
            system_instruction=system_instruction
        )
        
        # Sohbet geçmişini doğrudan modele gönderiyoruz
        chat_session = model.start_chat(history=history[:-1]) # Son mesaj hariç geçmişi yükle
        response = chat_session.send_message(history[-1]['parts']) # Son mesajı gönder
        
        return jsonify({'reply': response.text})
    except Exception as e:
        print(f"Yapay zeka hatası: {e}")
        return jsonify({'error': 'Yapay zeka ile iletişim kurulamadı.'}), 500
# app.py'ye eklenecek yeni route'lar

# Sadece haftalık plan sayfasını render etmek için basit bir route
@app.route('/haftalik-plan')
def weekly_plan_page():
    if not get_user_from_cookie(request): return redirect(url_for('login_page'))
    return render_template('weekly_plan.html', user_logged_in=True)

# app.py'deki /api/recipes/weekly fonksiyonunu bununla değiştirin

# app.py'deki /api/recipes/weekly fonksiyonunun nihai hali

@app.route('/api/recipes/weekly', methods=['GET'])
def get_weekly_recipes():
    user = get_user_from_cookie(request)
    if not user: return jsonify({'error': 'Yetkisiz erişim'}), 401
    
    try:
        # 1. VERİTABANINDAN MEVCUT PLANI ÇEKMEK İÇİN RPC'Yİ ÇAĞIR
        existing_plan_res = supabase.rpc('get_weekly_plan', {}).execute()
        
        if existing_plan_res.data:
            print("Mevcut plan veritabanından RPC ile bulundu.")
            return jsonify(existing_plan_res.data)

        # 2. EĞER PLAN YOKSA, YENİ BİR TANE OLUŞTUR
        print("Mevcut plan bulunamadı, AI ile yeni plan oluşturuluyor...")
        
        profile_res = supabase.rpc('get_user_profile_securely', {}).execute()
        if not profile_res.data:
            raise ValueError("Profil verisi alınamadı.")
        profile_data = profile_res.data
        
        # ... (AI'a gönderilecek weekly_prompt metni aynı kalıyor) ...
        weekly_prompt = f"""Kullanıcı profiline göre 7 günlük (Pazartesi'den Pazar'a), günde 2 ana öğün (Öğle Yemeği ve Akşam Yemeği) içeren, toplam 14 öğünlük bir menü planı oluştur.
        
        KULLANICI PROFİLİ: {profile_data}
        
        KURALLAR:
        1. Plan SADECE Öğle Yemeği (lunch) ve Akşam Yemeği (dinner) içermelidir. Kahvaltı EKLEME.
        2. Çeşitliliğe önem ver, günler arasında bazı öğünler benzer olabilir ama sürekli aynı olmasın.
        3. Kullanıcının sağlık koşullarına, hedeflerine ve sevmediği yiyeceklere KESİNLİKLE uy.
        4. Cevabın SADECE ve SADECE aşağıda belirtilen formatta bir JSON objesi olmalı. Anahtarlar günlerin İngilizce ve küçük harfli isimleri olmalı.
        5. Her tarif; title, description, ingredients, instructions, image_prompt, ve tahmini "calories" (tamsayı olarak) içermelidir.

        JSON FORMATI:
        {{
          "monday": {{
            "lunch": {{ "title": "Izgara Tavuklu Salata", "description": "...", "ingredients": [], "instructions": [], "image_prompt": "...", "calories": 450 }},
            "dinner": {{ "title": "Fırında Somon", "description": "...", "ingredients": [], "instructions": [], "image_prompt": "...", "calories": 600 }}
          }},
          "tuesday": {{
            "lunch": {{ "title": "Mercimek Çorbası", "description": "...", "ingredients": [], "instructions": [], "image_prompt": "...", "calories": 300 }},
            "dinner": {{ "title": "Sebzeli Sote", "description": "...", "ingredients": [], "instructions": [], "image_prompt": "...", "calories": 500 }}
          }},
          "...ve diğer günler"
        }}""" # Sizin 2 öğünlü, kalorili prompt metniniz buraya gelecek
        
        model = genai.GenerativeModel('gemini-1.5-flash-latest')
        response = model.generate_content(weekly_prompt)
        weekly_plan = json.loads(response.text.strip().replace("```json", "").replace("```", "").strip())

        for day in weekly_plan.values():
            for recipe in day.values():
                recipe['image_url'] = get_image_url_from_pexels(recipe.get("image_prompt", "healthy food"))
        
        # 3. YENİ PLANI VERİTABANINA KAYDETMEK İÇİN RPC'Yİ ÇAĞIR
        supabase.rpc('upsert_weekly_plan', {'plan_content': weekly_plan}).execute()
        
        print("Yeni plan oluşturuldu ve RPC ile veritabanına kaydedildi.")
        return jsonify(weekly_plan)
        
    except Exception as e:
        print(f"Haftalık plan RPC hatası: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Haftalık plan oluşturulamadı.'}), 500

@app.route('/api/recipes/weekly/delete', methods=['POST'])
def delete_weekly_plan():
    user = get_user_from_cookie(request)
    if not user: return jsonify({'error': 'Yetkisiz erişim'}), 401
    
    try:
        # PLANI SİLMEK İÇİN RPC'Yİ ÇAĞIR
        supabase.rpc('delete_weekly_plan', {}).execute()
        print("Mevcut haftalık plan RPC ile silindi.")
        return jsonify({'message': 'Plan başarıyla silindi.'})
    except Exception as e:
        print(f"Haftalık plan silme RPC hatası: {e}")
        return jsonify({'error': 'Plan silinemedi.'}), 500
    
@app.route('/api/shopping-list', methods=['POST'])
def create_shopping_list():
    weekly_plan = request.get_json()
    if not weekly_plan:
        return jsonify({'error': 'Haftalık plan verisi gerekli'}), 400
    
    try:
        # 1. Tüm ham malzeme listesini topla
        all_ingredients_raw = []
        for day in weekly_plan.values():
            for recipe in day.values():
                all_ingredients_raw.extend(recipe.get('ingredients', []))

        # --- AŞAMA 1: AI'dan veriyi yapılandırmasını iste ---
        parsing_prompt = f"""
        Aşağıdaki yemek malzemeleri listesini analiz et ve yapılandırılmış bir JSON dizisine dönüştür. 
        Her bir obje "item" (malzeme adı), "quantity" (miktar) ve "unit" (birim) içermelidir.
        Miktarı olmayan ('maydanoz gibi') veya sayısal olmayan ('bir tutam tuz' gibi) ifadeleri mantıklı bir şekilde (örn: 1 adet, 1 tutam) yorumla.
        Malzeme adlarını tekil ve sade halde tut (örn: 'domatesler' -> 'domates').
        
        HAM LİSTE: {all_ingredients_raw}

        ÖRNEK ÇIKTI FORMATI:
        [
          {{"item": "domates", "quantity": 1, "unit": "adet"}},
          {{"item": "kıyma", "quantity": 250, "unit": "gr"}},
          {{"item": "tuz", "quantity": 1, "unit": "tutam"}},
          {{"item": "maydanoz", "quantity": 1, "unit": "demet"}}
        ]
        """
        model = genai.GenerativeModel('gemini-1.5-flash-latest')
        response = model.generate_content(parsing_prompt)
        structured_ingredients = json.loads(response.text.strip().replace("```json", "").replace("```", "").strip())

        # --- AŞAMA 2: Python ile miktarları birleştir ---
        combined_items = {}
        for item_data in structured_ingredients:
            # Hem malzeme adı hem de birimi bir anahtar olarak kullan
            key = (item_data['item'].lower().strip(), item_data['unit'].lower().strip())
            
            if key in combined_items:
                # Eğer bu malzeme-birim ikilisi zaten varsa, miktarını ekle
                combined_items[key]['quantity'] += item_data.get('quantity', 0)
            else:
                # Yoksa, sözlüğe yeni olarak ekle
                combined_items[key] = item_data
        
        # Birleştirilmiş listeyi tekrar okunabilir hale getir
        final_ingredient_list = []
        for value in combined_items.values():
            final_ingredient_list.append(f"{value['quantity']} {value['unit']} {value['item']}")

        # --- AŞAMA 3: AI'dan temizlenmiş listeyi kategorize etmesini iste ---
        categorization_prompt = f"""
        Aşağıdaki birleştirilmiş ve temizlenmiş malzeme listesini "Sebze ve Meyveler", "Et ve Süt Ürünleri", "Kuru Gıdalar", "Baharatlar", "Diğer" gibi mantıklı kategorilere ayır.
        Cevabın SADECE ve SADECE kategorilerin anahtar olduğu bir JSON objesi olsun.
        
        TEMİZLENMİŞ MALZEME LİSTESİ: {final_ingredient_list}

        ÖRNEK JSON ÇIKTISI:
        {{
          "Sebze ve Meyveler": [ "3 adet domates", "1 adet soğan" ],
          "Et ve Süt Ürünleri": [ "500 gr tavuk göğsü", "1 litre süt" ]
        }}
        """
        response = model.generate_content(categorization_prompt)
        shopping_list = json.loads(response.text.strip().replace("```json", "").replace("```", "").strip())

        return jsonify(shopping_list)

    except Exception as e:
        print(f"Alışveriş listesi oluşturma hatası: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Alışveriş listesi oluşturulamadı.'}), 500
@app.route('/api/log/today', methods=['GET'])
def get_today_log():
    user = get_user_from_cookie(request)
    if not user: return jsonify({'error': 'Yetkisiz erişim'}), 401
    
    try:
        # Supabase'de oluşturduğumuz 'get_or_create_daily_log' fonksiyonunu çağırıyoruz.
        # Bu fonksiyon, RLS'den bağımsız olarak, güvenli bir şekilde
        # bugünün log'unu bulur veya oluşturur ve bize döndürür.
        response = supabase.rpc('get_or_create_daily_log', {}).execute()

        if response is None:
            raise ConnectionError("Supabase RPC fonksiyonundan yanıt alınamadı.")

        # RPC'den dönen veri doğrudan response.data'nın içindedir.
        return jsonify(response.data)
        
    except Exception as e:
        print(f"\n!!! /api/log/today RPC ÇAĞRISINDA HATA OLUŞTU !!!")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Günlük veriler alınamadı.'}), 500
    
# Günlük log'u GÜNCELLEMEK için. Bu fonksiyon tüm yazma işlemlerini yapar.
@app.route('/api/log/update', methods=['POST'])
def update_today_log():
    user = get_user_from_cookie(request)
    if not user: return jsonify({'error': 'Yetkisiz erişim'}), 401
    
    data = request.get_json()
    
    try:
        # UPSERT: user_id ve date kolonları eşleşen kaydı bul ve güncelle,
        # yoksa bu verilerle yeni bir kayıt oluştur.
        # on_conflict='user_id,date' -> Eğer bu iki kolon aynı olan bir kayıt zaten varsa çakışma olarak kabul et.
        response = supabase.table('daily_logs').upsert({
            'user_id': user.id,
            'date': date.today().isoformat(),
            'water_intake': data.get('water_intake'),
            'completed_meals': data.get('completed_meals')
        }, on_conflict='user_id,date').execute()

        return jsonify(response.data[0])
    except Exception as e:
        print(f"Log güncelleme hatası: {e}")
        return jsonify({'error': 'Günlük veri güncellenemedi.'}), 500 
if __name__ == '__main__':
    app.run(debug=True, port=5001)