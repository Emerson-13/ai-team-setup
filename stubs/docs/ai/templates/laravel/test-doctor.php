<?php
/**
 * Preflight for Pest/PHPUnit on MySQL. Run from the project root: php docs/ai/templates/laravel/test-doctor.php
 * (copy it anywhere you like). Finds why tests stall at bootstrap. Every step has a short timeout, so it never hangs.
 */
$fails = 0;
$ok = fn (string $m) => print("  OK    $m\n");
$fail = function (string $m, string $fix) use (&$fails) { $fails++; print("  FAIL  $m\n        fix: $fix\n"); };

echo "Test database preflight\n\n";

// Read .env.testing first, then phpunit.xml <env> values, then .env.
$vals = [];
foreach (['.env', '.env.testing'] as $file) {
    if (is_file($file)) {
        foreach (file($file, FILE_IGNORE_NEW_LINES) as $line) {
            if (preg_match('/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/', $line, $m) && $line[0] !== '#') {
                $vals[$m[1]] = trim(preg_replace('/\s+#.*$/', '', $m[2]), "\"'");
            }
        }
    }
}
foreach (['phpunit.xml', 'phpunit.xml.dist'] as $file) {
    if (is_file($file) && ($xml = @simplexml_load_file($file))) {
        foreach ($xml->xpath('//php/env|//php/server') ?: [] as $node) {
            $vals[(string) $node['name']] = (string) $node['value'];
        }
        break;
    }
}

$conn = $vals['DB_CONNECTION'] ?? '';
$host = $vals['DB_HOST'] ?? '127.0.0.1';
$port = (int) ($vals['DB_PORT'] ?? 3306);
$db = $vals['DB_DATABASE'] ?? '';
$user = $vals['DB_USERNAME'] ?? 'root';
$pass = $vals['DB_PASSWORD'] ?? '';

$conn === 'mysql' ? $ok('DB_CONNECTION=mysql') : $fail("DB_CONNECTION is \"$conn\"", 'set DB_CONNECTION=mysql in phpunit.xml (SQLite is not allowed)');
preg_match('/_testing$/', $db) ? $ok("DB_DATABASE=$db") : $fail("DB_DATABASE \"$db\" does not end with _testing", 'use a database like app_testing in phpunit.xml');
$host === 'localhost' && print("  WARN  DB_HOST=localhost can be slow or hang on Windows. Use 127.0.0.1.\n");
extension_loaded('pdo_mysql') ? $ok('pdo_mysql extension loaded') : $fail('pdo_mysql is not loaded', 'enable extension=pdo_mysql in php.ini');

$errno = 0; $errstr = '';
$sock = @stream_socket_client("tcp://$host:$port", $errno, $errstr, 3);
if (! $sock) {
    $fail("MySQL is not reachable at $host:$port (3 s timeout): $errstr", 'start MySQL (Laragon: Start All) and check DB_HOST / DB_PORT. Pest stalls at bootstrap without this.');
} else {
    fclose($sock);
    $ok("MySQL is reachable at $host:$port");
    try {
        $pdo = new PDO("mysql:host=$host;port=$port", $user, $pass, [PDO::ATTR_TIMEOUT => 3, PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $ok("login works for user \"$user\"");
        $exists = $pdo->query('SHOW DATABASES LIKE '.$pdo->quote($db))->fetchColumn();
        $exists ? $ok("database $db exists") : $fail("database $db does not exist", "create it: CREATE DATABASE `$db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;");
    } catch (Throwable $e) {
        $fail('MySQL login failed: '.$e->getMessage(), 'check DB_USERNAME / DB_PASSWORD in phpunit.xml');
    }
}

echo $fails ? "\n$fails problem(s). Fix them before running Pest. Do not re-run the tests until they pass.\n" : "\nAll checks passed.\n";
exit($fails ? 1 : 0);
