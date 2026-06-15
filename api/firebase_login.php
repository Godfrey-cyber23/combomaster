<?php
session_start();
header('Content-Type: application/json');

// ⚠️ REQUIRED: Load the Firebase PHP SDK via Composer
require __DIR__ . '/vendor/autoload.php';

// Get the JSON POST data
 $data = json_decode(file_get_contents('php://input'), true);
 $idTokenString = $data['token'] ?? '';
 $provider = $data['provider'] ?? '';

if (!$idTokenString) {
    echo json_encode(['success' => false, 'message' => 'No token provided.']);
    exit;
}

try {
    // 1. Initialize Firebase Admin SDK
    // Use __DIR__ to ensure it finds the JSON file in the same directory
    $factory = (new \Kreait\Firebase\Factory())
        ->withServiceAccount(__DIR__ . 'combomaster-fitness-firebase-adminsdk-fbsvc-92738f18a8.json'); 

    $auth = $factory->createAuth();

    // 2. Verify the Firebase Token
    $verifiedIdToken = $auth->verifyIdToken($idTokenString);
    
    // 3. Extract User Info from the Token
    $uid = $verifiedIdToken->claims()->get('sub');
    $email = $verifiedIdToken->claims()->get('email');
    $name = $verifiedIdToken->claims()->get('name') ?? 'Member';

    // 4. DATABASE LOGIC (Using PDO)
    $host = 'localhost';
    $dbname = 'combomaster_fitness'; 
    $db_user = 'root';
    $db_pass = ''; 

    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $db_user, $db_pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Check if user already exists in your database
    $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        // User doesn't exist -> Register them automatically via Social Login
        // We generate a random secure password because your DB likely requires one
        $randomPassword = bin2hex(random_bytes(16));
        $hashedPassword = password_hash($randomPassword, PASSWORD_DEFAULT);

        $stmt = $pdo->prepare("INSERT INTO users (name, email, password, auth_provider, role, created_at) VALUES (?, ?, ?, ?, 'client', NOW())");
        $stmt->execute([$name, $email, $hashedPassword, $provider]);

        $userId = $pdo->lastInsertId();
        $role = 'client'; // New social users are clients by default
    } else {
        // User exists -> Log them in
        $userId = $user['id']; // Assuming your primary key is 'id'
        $role = $user['role'] ?? 'client'; // Fetch their actual role (e.g., 'admin' or 'client')
        
        // Optional: Update their name in the DB in case they changed it on Google/Facebook
        $stmt = $pdo->prepare("UPDATE users SET name = ? WHERE id = ?");
        $stmt->execute([$name, $userId]);
    }

    // 5. Set Session Variables (Crucial for protected PHP pages)
    $_SESSION['user_id'] = $userId;
    $_SESSION['user_name'] = $name;
    $_SESSION['user_email'] = $email;
    $_SESSION['user_role'] = $role;
    $_SESSION['logged_in'] = true;

    // 6. Return Success JSON with the user's ROLE
    echo json_encode([
        'success' => true, 
        'message' => 'Login successful!', 
        'id' => $userId, 
        'name' => $name, 
        'email' => $email,
        'role' => $role // We send this to JS so it knows where to redirect
    ]);

} catch (\Kreait\Firebase\Exception\Auth\FailedToVerifyToken $e) {
    echo json_encode(['success' => false, 'message' => 'Invalid Firebase Token: ' . $e->getMessage()]);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Database error.']);
} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => 'Server Error: ' . $e->getMessage()]);
}