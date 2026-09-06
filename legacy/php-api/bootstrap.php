<?php
declare(strict_types=1);

const APP_ROOT = __DIR__ . '/..';

function loadEnvironment(): void
{
    $envPath = APP_ROOT . '/.env';
    if (!is_readable($envPath)) {
        return;
    }

    foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }

        [$name, $value] = explode('=', $line, 2);
        $name = trim($name);
        $value = trim($value);
        if ($value !== '' && (($value[0] ?? '') === '"' || ($value[0] ?? '') === "'")) {
            $value = trim($value, "\"'");
        }
        if ($name !== '' && getenv($name) === false) {
            putenv($name . '=' . $value);
        }
    }
}

loadEnvironment();

$appEnv = getenv('APP_ENV') ?: 'production';
ini_set('display_errors', $appEnv === 'local' ? '1' : '0');
ini_set('log_errors', '1');

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');

$allowedOrigin = getenv('APP_URL');
if ($allowedOrigin) {
    header('Access-Control-Allow-Origin: ' . rtrim($allowedOrigin, '/'));
    header('Vary: Origin');
}

session_name(getenv('SESSION_NAME') ?: 'combomaster_session');
session_set_cookie_params([
    'lifetime' => (int) (getenv('SESSION_LIFETIME') ?: 3600),
    'path' => '/',
    'secure' => !in_array($appEnv, ['local', 'development'], true),
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

function jsonResponse(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function requestData(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '{}', true);
    return is_array($data) ? $data : [];
}

function requireMethod(string $method): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) {
        header('Allow: ' . $method);
        jsonResponse(['message' => 'Method not allowed.'], 405);
    }
}
