<?php
 $host = 'localhost';
 $dbname = 'combomaster_fitness';
 $username = 'root'; // Default XAMPP user
 $password = '';     // Default XAMPP password is empty

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    // Set PDO error mode to exception
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch(PDOException $e) {
    die(json_encode(["message" => "Database connection failed: " . $e->getMessage()]));
}
?>