<?php
header("Content-Type: application/json");

 $host = 'localhost';
 $dbname = 'combomaster_fitness';
 $username = 'root';
 $password = '';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Test 1: Connection successful
    $result = [
        "status" => "success",
        "message" => "Connected to database '$dbname' successfully!",
        "host" => $host,
        "database" => $dbname
    ];

    // Test 2: Check if users table exists
    $stmt = $pdo->query("SHOW TABLES LIKE 'users'");
    $tableExists = $stmt->fetch();

    if ($tableExists) {
        $result["users_table"] = "exists";

        // Test 3: Count rows in users table
        $stmt = $pdo->query("SELECT COUNT(*) as count FROM users");
        $count = $stmt->fetch();
        $result["user_count"] = (int) $count['count'];

        // Test 4: Show column structure
        $stmt = $pdo->query("DESCRIBE users");
        $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $result["columns"] = array_map(function($col) {
            return $col['Field'] . ' (' . $col['Type'] . ')';
        }, $columns);

    } else {
        $result["users_table"] = "MISSING — run the CREATE TABLE SQL";
        $result["sql_to_run"] = "CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    reset_token VARCHAR(255) NULL,
    reset_expire DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);";
    }

    echo json_encode($result, JSON_PRETTY_PRINT);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        "status" => "error",
        "message" => $e->getMessage(),
        "hint" => strpos($e->getMessage(), 'Unknown database') !== false
            ? "Create the database first: CREATE DATABASE combomaster_fitness;"
            : (strpos($e->getMessage(), 'Access denied') !== false
                ? "Check your MySQL username/password in the file."
                : "Make sure MySQL is running in XAMPP.")
    ], JSON_PRETTY_PRINT);
}
?>