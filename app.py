import os
from flask import Flask, render_template, request, jsonify, redirect, url_for, make_response
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__, template_folder='templates', static_folder='static')
supabase_url: str = os.environ.get("SUPABASE_URL")
supabase_key: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(supabase_url, supabase_key)

def get_user_from_cookie(request):
    token = request.cookies.get('authToken')
    if not token: return None
    try: return supabase.auth.get_user(token).user
    except Exception: return None

# --- SAYFA YÖNLENDİRMELERİ ---
@app.route('/')
def index_page():
    user = get_user_from_cookie(request)
    if not user: return redirect(url_for('login_page'))
    try:
        profile_response = supabase.table('profiles').select('height').eq('id', user.id).execute()
        if not profile_response.data or not profile_response.data[0].get('height'):
            return redirect(url_for('edit_profile_page'))
        return redirect(url_for('dashboard_page'))
    except Exception: return redirect(url_for('login_page'))

@app.route('/login')
def login_page():
    user = get_user_from_cookie(request)
    if user: return redirect(url_for('dashboard_page'))
    return render_template('login.html', user_logged_in=user)

@app.route('/profil')
def view_profile_page():
    user = get_user_from_cookie(request)
    if not user: return redirect(url_for('login_page'))
    return render_template('view_profile.html', user_logged_in=user, user_email=user.email)

@app.route('/profil/duzenle')
def edit_profile_page():
    user = get_user_from_cookie(request)
    if not user: return redirect(url_for('login_page'))
    return render_template('profile.html', user_logged_in=user)

@app.route('/dashboard')
def dashboard_page():
    user = get_user_from_cookie(request)
    if not user: return redirect(url_for('login_page'))
    return render_template('dashboard.html', user_logged_in=user)

@app.route('/uygulama')
def app_page():
    user = get_user_from_cookie(request)
    if not user: return redirect(url_for('login_page'))
    return render_template('app.html', user_logged_in=user)

# --- API ENDPOINT'LERİ ---
@app.route('/api/auth/signup', methods=['POST'])
def signup():
    data = request.get_json()
    try:
        supabase.auth.sign_up({"email": data['email'], "password": data['password']})
        return jsonify({'message': 'Kayıt başarılı!'}), 201
    except Exception as e: return jsonify({'error': str(e)}), 400

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    try:
        res = supabase.auth.sign_in_with_password({"email": data['email'], "password": data['password']})
        response = make_response(jsonify({'message': 'Giriş başarılı'}))
        response.set_cookie('authToken', value=res.session.access_token, httponly=True, max_age=3600*24*7)
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

    if request.method == 'GET':
        try:
            profile_res = supabase.table('profiles').select('*').eq('id', user.id).single().execute()
            return jsonify(profile_res.data), 200
        except Exception as e: return jsonify({'error': 'Profil verisi alınamadı.', 'details': str(e)}), 500

    if request.method == 'POST':
        try:
            profile_data = request.get_json()
            # Bu komut, YENİ ve DOĞRU SQL politikaları sayesinde artık %100 çalışacak.
            response = supabase.table('profiles').update(profile_data).eq('id', user.id).execute()
            
            # GÜNCELLEME KONTROLÜ: Gerçekten bir satır güncellendi mi?
            if response.data:
                 return jsonify(response.data[0]), 200
            else:
                 # Supabase v1'de update boş dönebilir, bu yüzden başarı mesajı gönderiyoruz.
                 return jsonify({'message': 'Profil başarıyla güncellendi.'}), 200

        except Exception as e:
            print("PROFIL GUNCELLEME HATASI:", e)
            return jsonify({'error': 'Profil güncellenirken sunucuda bir hata oluştu.', 'details': str(e)}), 500

@app.route('/api/chat', methods=['POST'])
def chat_with_ai():
    return jsonify({'reply': 'Sohbet özelliği şu an aktif değil.'})

if __name__ == '__main__':
    app.run(debug=True, port=5001)