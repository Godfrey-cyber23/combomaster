<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

require 'db.php';

// Get the raw POST data from your frontend JavaScript
 $data = json_decode(file_get_contents("php://input"), true);

 $name = trim($data['name'] ?? '');
 $email = trim($data['email'] ?? '');
 $password = $data['password'] ?? '';

if (!$name || !$email || !$password) {
    echo json_encode(["message" => "Please fill in all fields."]);
    exit;
}

if (strlen($password) < 8) {
    echo json_encode(["message" => "Password must be at least 8 characters."]);
    exit;
}

// Check if email already exists
 $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
 $stmt->execute([$email]);

if ($stmt->fetch()) {
    echo json_encode(["message" => "Email already registered."]);
    exit;
}

// Hash the password securely
 $hashedPassword = password_hash($password, PASSWORD_BCRYPT);

// Insert into database
 $stmt = $pdo->prepare("INSERT INTO users (name, email, password) VALUES (?, ?, ?)");
if ($stmt->execute([$name, $email, $hashedPassword])) {
    echo json_encode(["message" => "Account created successfully!"]);
} else {
    echo json_encode(["message" => "Signup failed. Please try again."]);
}
?>