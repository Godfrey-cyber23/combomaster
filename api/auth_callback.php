<?php
session_start();

 $provider = $_GET['provider'] ?? '';
 $code = $_GET['code'] ?? '';

if (!$code || !$provider) {
    header('Location: /login.html?error=auth_failed');
    exit;
}

// --- 1. Exchange Code for Access Token ---
// (You would use cURL here. Below is the conceptual flow for Google)

if ($provider === 'google') {
    $token_url = "https://oauth2.googleapis.com/token";
    $post_data = [
        'code' => $code,
        'client_id' => 'YOUR_GOOGLE_CLIENT_ID',
        'client_secret' => 'YOUR_GOOGLE_CLIENT_SECRET', // NEVER expose this to frontend JS
        'redirect_uri' => 'https://yourdomain.com/api/auth_callback.php?provider=google',
        'grant_type' => 'authorization_code'
    ];

    $ch = curl_init($token_url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($post_data));
    $response = json_decode(curl_exec($ch), true);
    curl_close($ch);

    $access_token = $response['access_token'];

    // --- 2. Use Access Token to get User Info ---
    $userinfo_url = "https://www.googleapis.com/oauth2/v2/userinfo";
    $ch = curl_init($userinfo_url);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer $access_token"]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $user_info = json_decode(curl_exec($ch), true);
    curl_close($ch);

    $email = $user_info['email'];
    $name = $user_info['name'];
    
    // --- 3. Login or Register User in YOUR Database ---
    loginOrRegisterUser($email, $name, 'google');
}
// Repeat similar cURL logic for Facebook using their Graph API endpoint

function loginOrRegisterUser($email, $name, $provider) {
    // 1. Check if user exists in your database by email
    // $db = new PDO(...);
    // $stmt = $db->prepare("SELECT * FROM users WHERE email = ?");
    // $stmt->execute([$email]);
    // $user = $stmt->fetch();

    // 2. If user doesn't exist, create them
    // (Generate a random password for them since they use social login)
    // INSERT INTO users (name, email, auth_provider) VALUES (...)

    // 3. Set session variables
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['user_name'] = $user['name'];
    $_SESSION['user_email'] = $user['email'];

    // 4. Redirect to frontend dashboard
    header('Location: /admin-dashboard.html');
    exit;
}