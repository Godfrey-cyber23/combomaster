<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
requireMethod('POST');

$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $params['path'], '', $params['secure'], $params['httponly']);
}
session_destroy();
jsonResponse(['message' => 'Logged out successfully.']);
