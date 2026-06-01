<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

require 'db.php';

 $data = json_decode(file_get_contents("php://input"), true);
 $email = trim($data['email'] ?? '');

if (!$email) {
    echo json_encode(["message" => "Please enter your email."]);
    exit;
}

 $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
 $stmt->execute([$email]);
 $user = $stmt->fetch();

// Always return a success message to prevent people from guessing which emails exist
if (!$user) {
    echo json_encode(["message" => "If an account with that email exists, a reset link has been sent."]);
    exit;
}

// Generate a secure token
 $token = bin2hex(random_bytes(32));
 $expire = date('Y-m-d H:i:s', strtotime('+1 hour'));

// Save token to database
 $stmt = $pdo->prepare("UPDATE users SET reset_token = ?, reset_expire = ? WHERE email = ?");
 $stmt->execute([$token, $expire, $email]);

// Send Email (Note: For local testing, use a service like Mailtrap. On live hosting, use PHPMailer).
 $resetLink = "http://localhost/combomaster/forgotpassword.html?token=" . $token;
 $subject = "ComboMaster Fitness - Password Reset";
 $message = "Click this link to reset your password: " . $resetLink;
 $headers = "From: noreply@combomaster.com";

// mail($email, $subject, $message, $headers); // Uncomment this on a live server!

echo json_encode(["message" => "If an account with that email exists, a reset link has been sent."]);
?>