<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

require 'db.php';

 $data = json_decode(file_get_contents("php://input"), true);

 $email = trim($data['email'] ?? '');
 $currentPassword = $data['currentPassword'] ?? '';
 $newPassword = $data['newPassword'] ?? '';

if (!$email || !$currentPassword || !$newPassword) {
    echo json_encode(["message" => "All fields are required."]);
    exit;
}

if (strlen($newPassword) < 8) {
    echo json_encode(["message" => "New password must be at least 8 characters."]);
    exit;
}

 $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
 $stmt->execute([$email]);
 $user = $stmt->fetch();

if (!$user || !password_verify($currentPassword, $user['password'])) {
    echo json_encode(["message" => "Current password is incorrect."]);
    exit;
}

 $hashedPassword = password_hash($newPassword, PASSWORD_BCRYPT);

 $stmt = $pdo->prepare("UPDATE users SET password = ? WHERE id = ?");
if ($stmt->execute([$hashedPassword, $user['id']])) {
    echo json_encode(["message" => "Password updated successfully!"]);
} else {
    echo json_encode(["message" => "Failed to update password."]);
}
?>