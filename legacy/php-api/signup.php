<?php
require __DIR__ . '/db.php';
requireMethod('POST');

// Get the raw POST data from your frontend JavaScript
$data = requestData();

$name = trim((string) ($data['name'] ?? ''));
$email = strtolower(trim((string) ($data['email'] ?? '')));
$password = (string) ($data['password'] ?? '');

if (!$name || !$email || !$password) {
    jsonResponse(['message' => 'Please fill in all fields.'], 422);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    jsonResponse(['message' => 'Please enter a valid email address.'], 422);
}

if (strlen($password) < 8) {
    jsonResponse(['message' => 'Password must be at least 8 characters.'], 422);
}

// Check if email already exists
 $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
 $stmt->execute([$email]);

if ($stmt->fetch()) {
    jsonResponse(['message' => 'Email already registered.'], 409);
}

// Hash the password securely
 $hashedPassword = password_hash($password, PASSWORD_BCRYPT);

// Insert into database
$stmt = $pdo->prepare("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'client')");
$stmt->execute([$name, $email, $hashedPassword]);

session_regenerate_id(true);
$_SESSION['user_id'] = (int) $pdo->lastInsertId();
$_SESSION['user_name'] = $name;
$_SESSION['user_email'] = $email;
$_SESSION['user_role'] = 'client';

jsonResponse(['message' => 'Account created successfully.', 'user' => [
    'id' => $_SESSION['user_id'],
    'name' => $name,
    'email' => $email,
    'role' => 'client',
]], 201);
?>