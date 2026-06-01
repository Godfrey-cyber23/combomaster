<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

require 'db.php';

 $data = json_decode(file_get_contents("php://input"), true);

 $email = trim($data['email'] ?? '');
 $password = $data['password'] ?? '';

if (!$email || !$password) {
    echo json_encode(["message" => "Please fill in all fields."]);
    exit;
}

 $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
 $stmt->execute([$email]);
 $user = $stmt->fetch();

if ($user && password_verify($password, $user['password'])) {
    echo json_encode([
        "message" => "Login successful!",
        "id" => $user['id'],
        "name" => $user['name'],
        "email" => $user['email']
    ]);
} else {
    echo json_encode(["message" => "Invalid email or password."]);
}
?>