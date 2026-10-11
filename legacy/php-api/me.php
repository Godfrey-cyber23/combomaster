<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
requireMethod('GET');

if (empty($_SESSION['user_id'])) {
    jsonResponse(['authenticated' => false], 401);
}

jsonResponse([
    'authenticated' => true,
    'user' => [
        'id' => (int) $_SESSION['user_id'],
        'name' => $_SESSION['user_name'] ?? '',
        'email' => $_SESSION['user_email'] ?? '',
        'role' => $_SESSION['user_role'] ?? 'client',
    ],
]);
