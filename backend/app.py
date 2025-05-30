from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
import mysql.connector
from werkzeug.security import generate_password_hash, check_password_hash
import requests
from datetime import datetime, timedelta
import json
import pandas as pd
import numpy as np
from io import BytesIO
import matplotlib.pyplot as plt
import seaborn as sns
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
import xlsxwriter
from openai import OpenAI
import os

app = Flask(__name__, 
    static_url_path='',
    static_folder='../frontend')
CORS(app)

DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '123456',
    'database': 'health_platform_db',
    'charset': 'utf8mb4'
}

DEEPSEEK_API_KEY = "sk-53f18d0604804b6a88fc43878eec5215"
DEEPSEEK_BASE_URL = "https://api.deepseek.com"

client = OpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url=DEEPSEEK_BASE_URL
)

def get_db_connection():
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        return conn
    except mysql.connector.Error as err:
        print(f"数据库连接错误: {err}")
        return None

@app.route('/')
def home():
    return send_from_directory(app.static_folder, 'login.html')

@app.route('/register')
def register_page():
    return send_from_directory(app.static_folder, 'register.html')

@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return "File not found", 404

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"success": False, "message": "用户名和密码不能为空"}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({"success": False, "message": "数据库连接失败，请稍后重试"}), 500
    
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT username FROM users WHERE username = %s", (username,))
        if cursor.fetchone():
            return jsonify({"success": False, "message": "用户名已存在"}), 409

        password_hash_val = generate_password_hash(password)
        cursor.execute("INSERT INTO users (username, password_hash) VALUES (%s, %s)", (username, password_hash_val))
        conn.commit()
        return jsonify({"success": True, "message": "注册成功！请登录。"}), 201
    except mysql.connector.Error as err:
        conn.rollback()
        print(f"注册时数据库错误: {err}")
        return jsonify({"success": False, "message": f"注册失败，数据库错误: {err}"}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"success": False, "message": "用户名和密码不能为空"}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({"success": False, "message": "数据库连接失败，请稍后重试"}), 500

    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute("SELECT * FROM users WHERE username = %s", (username,))
        user = cursor.fetchone()

        if user and check_password_hash(user['password_hash'], password):
            return jsonify({"success": True, "message": "登录成功！", "user_id": user['id']}), 200
        else:
            return jsonify({"success": False, "message": "用户名或密码错误"}), 401
    except mysql.connector.Error as err:
        print(f"登录时数据库错误: {err}")
        return jsonify({"success": False, "message": f"登录失败，数据库错误: {err}"}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/health-data', methods=['GET'])
def get_health_data():
    conn = None
    cursor = None
    try:
        user_id = request.args.get('user_id')

        if not user_id:
            return jsonify({'success': False, 'message': 'User ID is required'}), 400
        
        try:
            user_id_int = int(user_id)
        except ValueError:
            return jsonify({'success': False, 'message': 'Invalid User ID format'}), 400

        conn = get_db_connection()
        if conn is None:
            return jsonify({'success': False, 'message': 'Database connection failed'}), 500
            
        cursor = conn.cursor(dictionary=True)
        
        sql = f"SELECT id, user_id, name, data_type, data_value, DATE_FORMAT(record_date, '%Y-%m-%d %H:%i:%s') AS record_date, description FROM health_data WHERE user_id = {user_id_int} ORDER BY record_date DESC"
        cursor.execute(sql)
        
        health_data_results = cursor.fetchall()
        return jsonify({'success': True, 'data': health_data_results})

    except mysql.connector.errors.Error as e:
        return jsonify({'success': False, 'message': f'Database error: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'success': False, 'message': f'An unexpected error occurred: {str(e)}'}), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()

@app.route('/api/health-data', methods=['POST'])
def add_health_data():
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "message": "请求体不能为空且必须是JSON格式"}), 400
        
    user_id = data.get('user_id')
    name = data.get('name')
    data_type = data.get('dataType')
    data_value = data.get('dataValue')
    record_date = data.get('record_date')
    description = data.get('description')

    if not all([user_id, name, data_type, data_value, record_date]):
        missing_fields = []
        if not user_id: missing_fields.append('user_id')
        if not name: missing_fields.append('name')
        if not data_type: missing_fields.append('dataType')
        if not data_value: missing_fields.append('dataValue')
        if not record_date: missing_fields.append('record_date')
        return jsonify({"success": False, "message": f"缺少必要的数据字段: {', '.join(missing_fields)}"}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({"success": False, "message": "数据库连接失败"}), 500

    cursor = conn.cursor()
    try:
        sql = "INSERT INTO health_data (user_id, name, data_type, data_value, record_date, description) VALUES (%s, %s, %s, %s, %s, %s)"
        params = (user_id, name, data_type, data_value, record_date, description)
        cursor.execute(sql, params)
        conn.commit()
        return jsonify({"success": True, "message": "数据添加成功", "inserted_id": cursor.lastrowid}), 201
    except mysql.connector.Error as err:
        conn.rollback()
        print(f"添加健康数据时数据库错误: {err}")
        return jsonify({"success": False, "message": f"添加数据失败: {err}"}), 500
    except Exception as e:
        conn.rollback()
        print(f"添加健康数据时发生未知错误: {e}")
        return jsonify({"success": False, "message": f"添加数据时发生未知错误: {str(e)}"}), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()

@app.route('/api/health-data/<int:data_id>', methods=['DELETE'])
def delete_health_data(data_id):
    try:
        user_id = request.args.get('user_id')
        
        if not user_id:
            return jsonify({'success': False, 'message': '缺少用户ID'}), 400
            
        try:
            user_id = int(user_id)
        except ValueError:
            return jsonify({'success': False, 'message': '无效的用户ID格式'}), 400
            
        conn = get_db_connection()
        if not conn:
            return jsonify({'success': False, 'message': '数据库连接失败'}), 500
            
        cursor = conn.cursor()
        
        # 检查数据是否存在且属于该用户
        cursor.execute("SELECT id FROM health_data WHERE id = %s AND user_id = %s", (data_id, user_id))
        result = cursor.fetchone()
        
        if not result:
            return jsonify({'success': False, 'message': '数据不存在或无权限删除'}), 404
            
        cursor.execute("DELETE FROM health_data WHERE id = %s AND user_id = %s", (data_id, user_id))
        conn.commit()
        
        if cursor.rowcount == 0:
            return jsonify({'success': False, 'message': '数据未删除，可能是权限问题'}), 400
        
        return jsonify({'success': True, 'message': '数据删除成功'})
        
    except Exception as e:
        return jsonify({'success': False, 'message': f'删除失败：{str(e)}'}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/health-data/<int:data_id>', methods=['PUT'])
def update_health_data(data_id):
    try:
        data = request.json
        user_id = data.get('user_id')
        
        print(f"[DEBUG] 收到更新请求: data_id={data_id}, user_id={user_id}, data={data}")
        
        if not user_id:
            print("[ERROR] 缺少用户ID")
            return jsonify({'success': False, 'message': '缺少用户ID'}), 400
            
        conn = get_db_connection()
        if not conn:
            print("[ERROR] 数据库连接失败")
            return jsonify({'success': False, 'message': '数据库连接失败'}), 500
            
        cursor = conn.cursor()
        
        # 检查数据是否存在且属于该用户
        cursor.execute("SELECT id FROM health_data WHERE id = %s AND user_id = %s", (data_id, user_id))
        result = cursor.fetchone()
        
        if not result:
            print(f"[ERROR] 数据不存在或无权限修改: data_id={data_id}, user_id={user_id}")
            return jsonify({'success': False, 'message': '数据不存在或无权限修改'}), 404
            
        update_query = """
            UPDATE health_data 
            SET name = %s, data_type = %s, data_value = %s, 
                record_date = %s, description = %s
            WHERE id = %s AND user_id = %s
        """
        
        update_params = (
            data.get('name'),
            data.get('dataType'),
            data.get('dataValue'),
            data.get('record_date'),
            data.get('description'),
            data_id,
            user_id
        )
        
        print(f"[DEBUG] 执行更新查询: {update_query}")
        print(f"[DEBUG] 更新参数: {update_params}")
        
        cursor.execute(update_query, update_params)
        conn.commit()
        
        affected_rows = cursor.rowcount
        print(f"[DEBUG] 更新影响的行数: {affected_rows}")
        
        if affected_rows == 0:
            print("[ERROR] 数据未更新，可能是权限问题")
            return jsonify({'success': False, 'message': '数据未更新，可能是权限问题'}), 400
            
        print("[INFO] 数据更新成功")
        return jsonify({'success': True, 'message': '数据更新成功'})
        
    except Exception as e:
        print(f"[ERROR] 更新失败: {str(e)}")
        return jsonify({'success': False, 'message': f'更新失败：{str(e)}'}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/health-trends', methods=['GET'])
def get_health_trends():
    metric = request.args.get('metric')
    time_range = request.args.get('timeRange')
    user_id = request.args.get('userId')

    if not all([metric, time_range, user_id]):
        missing_params = []
        if not metric: missing_params.append('metric')
        if not time_range: missing_params.append('timeRange')
        if not user_id: missing_params.append('userId')
        return jsonify({"success": False, "message": f"缺少必要参数: {', '.join(missing_params)}"}), 400

    try:
        user_id = int(user_id)
        conn = get_db_connection()
        if not conn:
            return jsonify({"success": False, "message": "数据库连接失败"}), 500

        cursor = conn.cursor(dictionary=True)

        end_date = datetime.now()
        if time_range == 'week':
            start_date = end_date - timedelta(days=7)
        elif time_range == 'month':
            start_date = end_date - timedelta(days=30)
        elif time_range == 'quarter':
            start_date = end_date - timedelta(days=90)
        else:
            start_date = end_date - timedelta(days=365)

        cursor.execute("""
            SELECT data_value, DATE_FORMAT(record_date, '%Y-%m-%d') as record_date
            FROM health_data 
            WHERE user_id = %s 
            AND data_type = %s 
            AND record_date BETWEEN %s AND %s 
            ORDER BY record_date
        """, (user_id, metric, start_date, end_date))
        
        results = cursor.fetchall()
        
        if not results:
            return jsonify({
                "success": True,
                "dates": [],
                "values": [],
                "metricName": get_metric_name(metric),
                "summary": {
                    "overview": "暂无数据",
                    "abnormal": None,
                    "suggestions": "请先添加健康数据"
                }
            })

        dates = [r['record_date'] for r in results]
        try:
            values = [float(r['data_value']) for r in results]
        except ValueError:
            values = [r['data_value'] for r in results]
            return jsonify({
                "success": True,
                "dates": dates,
                "values": values,
                "metricName": get_metric_name(metric),
                "summary": {
                    "overview": "数据格式不正确，无法进行趋势分析",
                    "abnormal": None,
                    "suggestions": "请确保输入的是有效的数值数据"
                }
            })
        
        summary = analyze_trend_data(values, metric)

        return jsonify({
            "success": True,
            "dates": dates,
            "values": values,
            "metricName": get_metric_name(metric),
            "summary": summary
        })

    except ValueError as e:
        print(f"[ERROR] Value error in get_health_trends: {e}")
        return jsonify({"success": False, "message": "参数格式错误"}), 400
    except Exception as e:
        print(f"[ERROR] Error in get_health_trends: {e}")
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@app.route('/api/analyze-health-data', methods=['POST'])
def analyze_health_data():
    data = request.get_json()
    analysis_type = data.get('analysisType')
    prompt = data.get('prompt', '')
    user_id = data.get('user_id')

    if not all([analysis_type, user_id]):
        return jsonify({"success": False, "message": "缺少必要参数"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT * FROM health_data 
            WHERE user_id = %s 
            ORDER BY record_date DESC 
            LIMIT 100
        """, (user_id,))
        
        health_data = cursor.fetchall()
        
        if not health_data:
            return jsonify({
                "success": True,
                "analysis": "暂无健康数据可供分析",
                "recommendations": "请先添加健康数据"
            })

        analysis_result = perform_health_analysis(health_data, analysis_type, prompt)
        
        return jsonify({
            "success": True,
            "analysis": analysis_result['analysis'],
            "recommendations": analysis_result['recommendations']
        })

    except Exception as e:
        print(f"分析健康数据时发生错误: {e}")
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@app.route('/api/generate-report', methods=['POST'])
def generate_report():
    data = request.get_json()
    report_type = data.get('reportType')
    user_id = data.get('userId')

    if not all([report_type, user_id]):
        return jsonify({"success": False, "message": "缺少必要参数"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()

        end_date = datetime.now()
        if report_type == 'monthly':
            start_date = end_date - timedelta(days=30)
            report_title = "月度健康报告"
        elif report_type == 'quarterly':
            start_date = end_date - timedelta(days=90)
            report_title = "季度健康报告"
        else:
            start_date = end_date - timedelta(days=365)
            report_title = "年度健康报告"

        cursor.execute("""
            SELECT * FROM health_data 
            WHERE user_id = %s 
            AND record_date BETWEEN %s AND %s 
            ORDER BY record_date DESC
        """, (user_id, start_date, end_date))
        
        health_data = cursor.fetchall()

        if not health_data:
            return jsonify({
                "success": True,
                "reportHtml": "<p>所选时间范围内暂无健康数据</p>"
            })

        report_html = generate_report_html(user, health_data, report_title, start_date, end_date)

        return jsonify({
            "success": True,
            "reportHtml": report_html
        })

    except Exception as e:
        print(f"生成报告时发生错误: {e}")
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@app.route('/api/download-report', methods=['GET'])
def download_report():
    report_type = request.args.get('type')
    format = request.args.get('format')
    user_id = request.args.get('userId')

    if not all([report_type, format, user_id]):
        return jsonify({"success": False, "message": "缺少必要参数"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()

        end_date = datetime.now()
        if report_type == 'monthly':
            start_date = end_date - timedelta(days=30)
            report_title = "月度健康报告"
        elif report_type == 'quarterly':
            start_date = end_date - timedelta(days=90)
            report_title = "季度健康报告"
        else:
            start_date = end_date - timedelta(days=365)
            report_title = "年度健康报告"

        cursor.execute("""
            SELECT * FROM health_data 
            WHERE user_id = %s 
            AND record_date BETWEEN %s AND %s 
            ORDER BY record_date DESC
        """, (user_id, start_date, end_date))
        
        health_data = cursor.fetchall()

        if format == 'pdf':
            buffer = BytesIO()
            generate_pdf_report(buffer, user, health_data, report_title, start_date, end_date)
            buffer.seek(0)
            return send_file(
                buffer,
                as_attachment=True,
                download_name=f"健康报告_{datetime.now().strftime('%Y%m%d')}.pdf",
                mimetype='application/pdf'
            )
        else:
            buffer = BytesIO()
            generate_excel_report(buffer, user, health_data, report_title, start_date, end_date)
            buffer.seek(0)
            return send_file(
                buffer,
                as_attachment=True,
                download_name=f"健康报告_{datetime.now().strftime('%Y%m%d')}.xlsx",
                mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )

    except Exception as e:
        print(f"下载报告时发生错误: {e}")
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@app.route('/api/get-ai-advice', methods=['POST'])
def get_ai_advice():
    data = request.get_json()
    advice_type = data.get('adviceType')
    user_id = data.get('userId')

    if not all([advice_type, user_id]):
        return jsonify({"success": False, "message": "缺少必要参数"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT * FROM health_data 
            WHERE user_id = %s 
            ORDER BY record_date DESC 
            LIMIT 50
        """, (user_id,))
        
        health_data = cursor.fetchall()

        if not health_data:
            return jsonify({
                "success": True,
                "title": "暂无建议",
                "content": "请先添加健康数据",
                "details": []
            })

        advice = generate_ai_advice(health_data, advice_type)
        
        return jsonify({
            "success": True,
            "title": advice['title'],
            "content": advice['content'],
            "details": advice['details']
        })

    except Exception as e:
        print(f"获取AI建议时发生错误: {e}")
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@app.route('/api/save-settings', methods=['POST'])
def save_settings():
    try:
        data = request.get_json()
        user_id = data.get('userId')
        settings = data.get('settings')

        if not user_id or not settings:
            return jsonify({"success": False, "message": "缺少必要参数"}), 400

        conn = get_db_connection()
        if not conn:
            return jsonify({"success": False, "message": "数据库连接失败"}), 500

        cursor = conn.cursor()
        try:
            cursor.execute("""
                SELECT id FROM user_settings 
                WHERE user_id = %s
            """, (user_id,))
            
            existing_settings = cursor.fetchone()
            settings_json = json.dumps(settings, ensure_ascii=False)
            
            if existing_settings:
                cursor.execute("""
                    UPDATE user_settings 
                    SET settings = %s, 
                        updated_at = CURRENT_TIMESTAMP 
                    WHERE user_id = %s
                """, (settings_json, user_id))
            else:
                cursor.execute("""
                    INSERT INTO user_settings (user_id, settings) 
                    VALUES (%s, %s)
                """, (user_id, settings_json))
            
            conn.commit()
            return jsonify({"success": True, "message": "设置保存成功"})
            
        except mysql.connector.Error as e:
            conn.rollback()
            print(f"[ERROR] Database error in save_settings: {e}")
            return jsonify({"success": False, "message": f"保存设置失败: {str(e)}"}), 500
            
    except Exception as e:
        print(f"[ERROR] Error in save_settings: {e}")
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/get-settings', methods=['GET'])
def get_settings():
    try:
        user_id = request.args.get('userId')
        if not user_id:
            return jsonify({"success": False, "message": "缺少用户ID"}), 400

        conn = get_db_connection()
        if not conn:
            return jsonify({"success": False, "message": "数据库连接失败"}), 500

        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute("""
                SELECT settings FROM user_settings 
                WHERE user_id = %s
            """, (user_id,))
            
            result = cursor.fetchone()
            if result:
                settings = json.loads(result['settings'])
                return jsonify({
                    "success": True,
                    "settings": settings
                })
            else:
                default_settings = {
                    "showTrends": True,
                    "showAIAnalysis": True,
                    "reportFrequency": "monthly"
                }
                return jsonify({
                    "success": True,
                    "settings": default_settings
                })
                
        except mysql.connector.Error as e:
            print(f"[ERROR] Database error in get_settings: {e}")
            return jsonify({"success": False, "message": f"获取设置失败: {str(e)}"}), 500
            
    except Exception as e:
        print(f"[ERROR] Error in get_settings: {e}")
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

def get_metric_name(metric):
    metric_names = {
        'blood-pressure': '血压',
        'blood-sugar': '血糖',
        'heart-rate': '心率',
        'weight': '体重'
    }
    return metric_names.get(metric, metric)

def analyze_trend_data(values, metric):
    try:
        values_array = np.array(values)
        mean_value = np.mean(values_array)
        std_value = np.std(values_array)
        trend = np.polyfit(range(len(values_array)), values_array, 1)[0]
        
        z_scores = np.abs((values_array - mean_value) / std_value)
        abnormal_indices = np.where(z_scores > 2)[0]
        
        trend_direction = "上升" if trend > 0 else "下降" if trend < 0 else "稳定"
        
        overview = f"数据总体呈{trend_direction}趋势。平均值为{mean_value:.2f}，标准差为{std_value:.2f}。"
        
        abnormal = None
        if len(abnormal_indices) > 0:
            abnormal_values = [f"{values[i]:.2f}" for i in abnormal_indices]
            abnormal = f"发现{len(abnormal_indices)}个异常值：{', '.join(abnormal_values)}"
        
        suggestions = generate_trend_suggestions(metric, trend_direction, mean_value, std_value)
        
        return {
            "overview": overview,
            "abnormal": abnormal,
            "suggestions": suggestions
        }
    except Exception as e:
        print(f"分析趋势数据时发生错误: {e}")
        return {
            "overview": "数据分析失败",
            "abnormal": None,
            "suggestions": "请检查数据格式是否正确"
        }

def generate_trend_suggestions(metric, trend, mean, std):
    suggestions = {
        'blood-pressure': {
            '上升': "血压呈上升趋势，建议：\n1. 控制饮食，减少盐分摄入\n2. 保持规律运动\n3. 定期监测血压",
            '下降': "血压呈下降趋势，建议：\n1. 保持良好的作息习惯\n2. 适度补充营养\n3. 继续保持健康的生活方式",
            '稳定': "血压保持稳定，建议：\n1. 维持当前的生活方式\n2. 继续定期监测"
        },
        'blood-sugar': {
            '上升': "血糖呈上升趋势，建议：\n1. 控制碳水化合物摄入\n2. 增加运动量\n3. 定期监测血糖",
            '下降': "血糖呈下降趋势，建议：\n1. 注意饮食规律\n2. 适当补充营养\n3. 保持适度运动",
            '稳定': "血糖保持稳定，建议：\n1. 继续保持当前的饮食习惯\n2. 保持运动习惯"
        },
        'heart-rate': {
            '上升': "心率呈上升趋势，建议：\n1. 注意休息\n2. 避免剧烈运动\n3. 保持心情平和",
            '下降': "心率呈下降趋势，建议：\n1. 适当增加运动量\n2. 保持充足睡眠\n3. 定期检查",
            '稳定': "心率保持稳定，建议：\n1. 继续保持良好的作息习惯\n2. 维持适度运动"
        },
        'weight': {
            '上升': "体重呈上升趋势，建议：\n1. 控制饮食摄入\n2. 增加运动量\n3. 保持规律作息",
            '下降': "体重呈下降趋势，建议：\n1. 注意营养均衡\n2. 适度运动\n3. 保持良好心态",
            '稳定': "体重保持稳定，建议：\n1. 继续保持健康的生活方式\n2. 定期监测体重变化"
        }
    }
    
    return suggestions.get(metric, {}).get(trend, "保持健康的生活方式，定期监测身体状况")

def perform_health_analysis(health_data, analysis_type, prompt):
    try:
        data_summary = []
        for record in health_data:
            data_summary.append(f"- {record['data_type']}: {record['data_value']} (记录时间: {record['record_date']})")
        
        analysis_prompts = {
            'comprehensive': '请对这位老年人的整体健康状况进行全面分析',
            'blood-pressure': '请重点分析这位老年人的血压情况',
            'blood-sugar': '请重点分析这位老年人的血糖情况',
            'heart-rate': '请重点分析这位老年人的心率情况'
        }
        
        base_prompt = f"""作为一个专业的医疗健康顾问，请根据以下健康数据进行分析：

数据记录：
{chr(10).join(data_summary)}

分析要求：{analysis_prompts.get(analysis_type, '进行综合分析')}

用户补充要求：{prompt if prompt else '无'}

请提供：
1. 详细的分析结果
2. 具体的健康建议

请用中文回答，并确保建议适合老年人。回答格式要求：
{{
    "analysis": "分析结果",
    "recommendations": "健康建议"
}}"""

        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "你是一个专业的医疗健康顾问，专注于老年人健康。"},
                {"role": "user", "content": base_prompt}
            ],
            temperature=0.7,
            max_tokens=1000
        )
        
        try:
            result = response.choices[0].message.content
            try:
                result_dict = json.loads(result)
                return result_dict
            except json.JSONDecodeError:
                parts = result.split('\n\n')
                return {
                    "analysis": parts[0] if len(parts) > 0 else "分析结果解析失败",
                    "recommendations": parts[1] if len(parts) > 1 else "建议解析失败"
                }
        except Exception as e:
            print(f"解析 AI 响应时出错: {e}")
            return {
                "analysis": "AI分析结果处理失败",
                "recommendations": "请稍后重试"
            }
            
    except Exception as e:
        print(f"调用 AI 分析时出错: {e}")
        return {
            "analysis": "AI分析服务暂时不可用",
            "recommendations": "请稍后重试"
        }

def generate_report_html(user, health_data, report_title, start_date, end_date):
    html = f"""
    <div class="report">
        <h2>{report_title}</h2>
        <p>报告生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}</p>
        <p>统计时间范围：{start_date.strftime('%Y-%m-%d')} 至 {end_date.strftime('%Y-%m-%d')}</p>
        
        <h3>健康数据统计</h3>
        <div class="data-summary">
            <!-- 添加数据统计内容 -->
        </div>
        
        <h3>异常指标分析</h3>
        <div class="abnormal-analysis">
            <!-- 添加异常分析内容 -->
        </div>
        
        <h3>健康建议</h3>
        <div class="health-suggestions">
            <!-- 添加健康建议内容 -->
        </div>
    </div>
    """
    return html

def generate_pdf_report(buffer, user, health_data, report_title, start_date, end_date):
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    styles = getSampleStyleSheet()
    elements = []
    
    elements.append(Paragraph(report_title, styles['Title']))
    elements.append(Spacer(1, 12))
    
    doc.build(elements)

def generate_excel_report(buffer, user, health_data, report_title, start_date, end_date):
    workbook = xlsxwriter.Workbook(buffer)
    worksheet = workbook.add_worksheet()
    
    workbook.close()

def generate_ai_advice(health_data, advice_type):
    try:
        data_summary = []
        for record in health_data:
            data_summary.append(f"- {record['data_type']}: {record['data_value']} (记录时间: {record['record_date']})")
        
        advice_prompts = {
            'lifestyle': '请针对生活方式提供具体建议',
            'diet': '请提供详细的饮食建议',
            'exercise': '请提供适合老年人的运动建议',
            'medication': '请提供用药安全建议'
        }
        
        base_prompt = f"""作为一个专业的医疗健康顾问，请根据以下健康数据提供建议：

数据记录：
{chr(10).join(data_summary)}

建议类型：{advice_prompts.get(advice_type, '生活方式建议')}

请提供详细的建议，格式要求：
{{
    "title": "建议标题",
    "content": "总体建议内容",
    "details": [
        {{"title": "具体建议1", "content": "详细内容1"}},
        {{"title": "具体建议2", "content": "详细内容2"}},
        {{"title": "具体建议3", "content": "详细内容3"}}
    ]
}}

请确保建议适合老年人，用语要简单易懂。"""

        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "你是一个专业的医疗健康顾问，专注于老年人健康。"},
                {"role": "user", "content": base_prompt}
            ],
            temperature=0.7,
            max_tokens=1000
        )
        
        try:
            result = response.choices[0].message.content
            try:
                return json.loads(result)
            except json.JSONDecodeError:
                return {
                    "title": "健康建议",
                    "content": result.split('\n')[0] if result else "暂无建议",
                    "details": [
                        {"title": "建议", "content": detail.strip()}
                        for detail in result.split('\n')[1:] if detail.strip()
                    ]
                }
        except Exception as e:
            print(f"解析 AI 响应时出错: {e}")
            return {
                "title": "系统提示",
                "content": "AI建议生成失败",
                "details": [
                    {"title": "错误提示", "content": "请稍后重试"}
                ]
            }
            
    except Exception as e:
        print(f"调用 AI 建议时出错: {e}")
        return {
            "title": "系统提示",
            "content": "AI建议服务暂时不可用",
            "details": [
                {"title": "错误提示", "content": "请稍后重试"}
            ]
        }

if __name__ == '__main__':
    app.run(debug=True, port=5000)