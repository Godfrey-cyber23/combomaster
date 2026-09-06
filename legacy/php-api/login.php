<?php
require __DIR__ . '/db.php';
requireMethod('POST');

$data = requestData();

$email = strtolower(trim((string) ($data['email'] ?? '')));
$password = (string) ($data['password'] ?? '');

if (!$email || !$password) {
    jsonResponse(['message' => 'Invalid email or password.'], 422);
}

 $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
 $stmt->execute([$email]);
 $user = $stmt->fetch();

if ($user && password_verify($password, $user['password'])) {
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int) $user['id'];
    $_SESSION['user_name'] = $user['name'];
    $_SESSION['user_email'] = $user['email'];
    $_SESSION['user_role'] = $user['role'] ?? 'client';

    jsonResponse(['message' => 'Login successful.', 'user' => [
        'id' => (int) $user['id'],
        'name' => $user['name'],
        'email' => $user['email'],
        'role' => $_SESSION['user_role'],
    ]]);
}

jsonResponse(['message' => 'Invalid email or password.'], 401);
?>